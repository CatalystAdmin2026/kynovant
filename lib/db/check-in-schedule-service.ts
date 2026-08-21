// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Check-In Schedule Service
//
// SERVER-ONLY — never import from a Client Component.
//
// CRUD for client_check_in_schedule (schema-check-in.ts) — the
// normalized, effective-dated, one-row-per-required-weekday-era
// table that is now the source of truth for "which days does this
// client need to check in."
//
// EFFECTIVE-DATING (see schema-check-in.ts's table comment for the
// full reasoning): a schedule change never deletes a row — removing
// a day soft-closes it (effectiveTo = today); adding a day opens a
// new row (effectiveFrom = today). This means "what was required on
// a past date" (getClientScheduleAtDate) and "what's required now"
// (getClientSchedule) are two different, both-correct queries — a
// coach changing next week's schedule never rewrites last week's
// compliance truth.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { clientProfiles } from "./schema";
import {
  clientCheckInSchedule,
  type CheckInPhotoRequirement,
  type CheckInPhotoPolicy,
  type PhotoViewName,
} from "./schema-check-in";
import { normalizeWeekdays } from "@/lib/checkin/schedule";
import { getDateInTimezone } from "@/lib/checkin/schedule";
import type { Weekday } from "@/lib/checkin/schedule";

async function clientToday(clientId: string): Promise<string> {
  const db = getDb();
  const [profile] = await db
    .select({ timezone: clientProfiles.timezone })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, clientId))
    .limit(1);
  return getDateInTimezone(new Date(), profile?.timezone ?? "America/Chicago");
}

function addCalendarDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().split("T")[0];
}

export interface ClientScheduleState {
  configured: boolean;
  weekdays: ReturnType<typeof normalizeWeekdays>;
}

export async function getClientScheduleHistory(clientId: string): Promise<
  Array<{
    id: string;
    weekday: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    photoRequirement: CheckInPhotoRequirement;
    photoRequireFront: boolean;
    photoRequireSide: boolean;
    photoRequireBack: boolean;
  }>
> {
  const db = getDb();
  return db
    .select({
      id: clientCheckInSchedule.id,
      weekday: clientCheckInSchedule.weekday,
      effectiveFrom: clientCheckInSchedule.effectiveFrom,
      effectiveTo: clientCheckInSchedule.effectiveTo,
      photoRequirement: clientCheckInSchedule.photoRequirement,
      photoRequireFront: clientCheckInSchedule.photoRequireFront,
      photoRequireSide: clientCheckInSchedule.photoRequireSide,
      photoRequireBack: clientCheckInSchedule.photoRequireBack,
    })
    .from(clientCheckInSchedule)
    .where(eq(clientCheckInSchedule.clientId, clientId));
}

// `[]` is a valid configured state. Callers that need legacy fallback must
// distinguish it from a client with no schedule rows at all.
export async function getClientScheduleState(clientId: string): Promise<ClientScheduleState> {
  const rows = await getClientScheduleHistory(clientId);
  return {
    configured: rows.length > 0,
    weekdays: normalizeWeekdays(rows.filter((row) => row.effectiveTo === null).map((row) => row.weekday)),
  };
}

// Returns the CURRENTLY required weekdays — [] means "no required
// schedule," a real, distinct, intentional state.
export async function getClientSchedule(clientId: string): Promise<Weekday[]> {
  return (await getClientScheduleState(clientId)).weekdays;
}

// Returns the weekdays that were required ON a specific past (or
// present) calendar date — the historically-truthful query.
// Compliance calculations for a given week MUST use this, not
// getClientSchedule, so a later schedule change never silently
// rewrites what was actually required at the time.
export async function getClientScheduleAtDate(clientId: string, date: string): Promise<Weekday[]> {
  const rows = await getClientScheduleHistory(clientId);
  return normalizeWeekdays(
    rows
      .filter((row) => row.effectiveFrom <= date && (row.effectiveTo === null || row.effectiveTo > date))
      .map((row) => row.weekday),
  );
}

// Replaces the client's CURRENTLY required weekday set with
// `weekdays` (deduped/validated via normalizeWeekdays), effective
// today. Idempotent — calling with the same currently-active set
// twice is a no-op after the first call. Calling with [] closes every
// currently-active row (soft-close, not delete) — "no required
// schedule" is a first-class, explicitly-settable state.
//
// Days being removed are soft-closed (effectiveTo = today), never
// deleted — their history remains queryable via
// getClientScheduleAtDate for every date up to (not including) today.
// Days being added open a NEW row (effectiveFrom = today) — even if
// that exact weekday was required at some point in the past and later
// removed, re-adding it is a fresh era, not a resurrection of the old
// row, so the old row's effectiveTo continues to truthfully mark when
// the PRIOR era ended.
export async function setClientSchedule(
  clientId: string,
  weekdays: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = normalizeWeekdays(weekdays);

  try {
    const db = getDb();
    const now = await clientToday(clientId);
    await db.transaction(async (tx) => {
      const activeRows = await tx
        .select({
          id: clientCheckInSchedule.id,
          weekday: clientCheckInSchedule.weekday,
          effectiveFrom: clientCheckInSchedule.effectiveFrom,
        })
        .from(clientCheckInSchedule)
        .where(
          and(
            eq(clientCheckInSchedule.clientId, clientId),
            isNull(clientCheckInSchedule.effectiveTo),
          ),
        );
      const activeWeekdays = new Set(activeRows.map((r) => r.weekday));

      const toAdd = target.filter((d) => !activeWeekdays.has(d));
      const toRemove = activeRows.filter((r) => !target.includes(r.weekday as Weekday));

      for (const row of toRemove) {
        // A same-day row may already have represented a real obligation
        // (and may already have a submitted occurrence). Close it after
        // today rather than deleting it, so today's historical lookup
        // remains truthful while the row is absent from the active set.
        if (row.effectiveFrom === now) {
          await tx
            .update(clientCheckInSchedule)
            .set({ effectiveTo: addCalendarDay(now) })
            .where(and(eq(clientCheckInSchedule.id, row.id), eq(clientCheckInSchedule.clientId, clientId)));
        } else {
          await tx
            .update(clientCheckInSchedule)
            .set({ effectiveTo: now })
            .where(and(eq(clientCheckInSchedule.id, row.id), eq(clientCheckInSchedule.clientId, clientId)));
        }
      }

      if (toAdd.length > 0) {
        await tx.insert(clientCheckInSchedule).values(
          toAdd.map((weekday) => ({ clientId, weekday, effectiveFrom: now })),
        );
      }
    });

    return { ok: true };
  } catch (err) {
    console.error("[check-in-schedule-service] setClientSchedule error:", err);
    return { ok: false, error: "Failed to save check-in schedule. Please try again." };
  }
}

// ─────────────────────────────────────────────────────────────
// PHOTO POLICY (Check-In Progress Photos pass)
//
// Resolves the Required/Optional/Off photo policy — and, when
// Required, exactly which of front/side/back the coach configured as
// required — that was in force for a specific client on a specific
// calendar date. Same historically-truthful shape as
// getClientScheduleAtDate above, and for the same reason: a coach
// changing today's policy (including narrowing "Required" from
// front+side+back down to just front) must never silently rewrite
// what an old occurrence actually required. Always call this with the
// occurrence's OWN scheduledDate, never "today."
//
// No weekday is special-cased — the weekday is derived from the date
// itself (same UTC-noon-anchored derivation validateOccurrenceDate in
// check-in-service.ts already uses) and looked up generically against
// whichever row was active for THAT weekday on THAT date.
//
// Fallback (legacy/no-schedule client): a client with zero
// clientCheckInSchedule rows has no row to carry a policy at all —
// there is no ad-hoc check-in path in this architecture
// (validateOccurrenceDate proves every occurrence's date is validated
// against either this table or the legacy single-day enrollment
// fallback), so this can only happen for that legacy fallback client.
// Defaults to "optional" with no required views: never invent a hard
// requirement a coach never configured, but still surface the upload
// option since photos are broadly useful. A configured client whose
// date somehow matches no row (should not happen — occurrence
// creation already required a matching weekday) fails closed to
// "off".
function toRequiredViews(row: {
  photoRequireFront: boolean;
  photoRequireSide: boolean;
  photoRequireBack: boolean;
}): PhotoViewName[] {
  const views: PhotoViewName[] = [];
  if (row.photoRequireFront) views.push("front");
  if (row.photoRequireSide) views.push("side");
  if (row.photoRequireBack) views.push("back");
  return views;
}

export async function getPhotoPolicyAtDate(clientId: string, date: string): Promise<CheckInPhotoPolicy> {
  const rows = await getClientScheduleHistory(clientId);
  if (rows.length === 0) return { requirement: "optional", requiredViews: [] };

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const active = rows.find(
    (row) =>
      row.weekday === weekday &&
      row.effectiveFrom <= date &&
      (row.effectiveTo === null || row.effectiveTo > date),
  );
  if (!active) return { requirement: "off", requiredViews: [] };

  return {
    requirement: active.photoRequirement,
    requiredViews: active.photoRequirement === "required" ? toRequiredViews(active) : [],
  };
}

// Returns each currently-active weekday's photo policy, keyed for the
// Coach HQ schedule editor. A weekday absent from the returned map is
// not currently required at all (setClientSchedule's job, unrelated
// to this).
export async function getActivePhotoPolicies(
  clientId: string,
): Promise<Partial<Record<Weekday, CheckInPhotoPolicy>>> {
  const rows = await getClientScheduleHistory(clientId);
  const result: Partial<Record<Weekday, CheckInPhotoPolicy>> = {};
  for (const row of rows) {
    if (row.effectiveTo === null) {
      result[row.weekday as Weekday] = {
        requirement: row.photoRequirement,
        requiredViews: row.photoRequirement === "required" ? toRequiredViews(row) : [],
      };
    }
  }
  return result;
}

const PHOTO_REQUIREMENT_VALUES: CheckInPhotoRequirement[] = ["required", "optional", "off"];

// Changes the photo policy for a weekday that is CURRENTLY part of the
// client's required schedule. Deliberately separate from
// setClientSchedule — it never adds or removes a weekday, only
// rotates the policy on an already-active row — so setClientSchedule
// itself (and every existing caller/test of it) is completely
// unmodified by this pass.
//
// `policy.requiredViews` is only meaningful (and only persisted as
// meaningful) when `policy.requirement === "required"`; for
// "optional"/"off" the boolean columns are still written (using the
// caller's supplied values, or the existing row's current values if
// the caller passes an empty array — see below) since they're inert
// there, but never silently reset to a value the coach didn't choose.
//
// Participates in the SAME effective-dating semantics as the weekday
// itself, for the same reason (a policy change must not retroactively
// rewrite past occurrences):
//   - If the active row was opened on a PRIOR day, it is soft-closed
//     as of today (effectiveTo = today) and a new row is opened
//     (effectiveFrom = today) with the new policy — the exact same
//     close-then-open boundary setClientSchedule uses when a weekday
//     is removed and re-added. getPhotoPolicyAtDate for any date
//     before today still returns the OLD policy (including the old
//     required-views set) from the closed row.
//   - If the active row was ALSO opened today (added and immediately
//     re-configured in the same session, before any occurrence could
//     exist under it), it is updated in place instead of being
//     closed-and-reopened. Rotating same-day would create two rows
//     both satisfying "active as of today" (effectiveFrom = today on
//     both), which is not a state getClientScheduleAtDate/
//     getPhotoPolicyAtDate is written to disambiguate — no history
//     exists yet to protect for a row that didn't exist before today,
//     so an in-place update is exactly as truthful.
export async function setPhotoPolicy(
  clientId: string,
  weekday: number,
  policy: {
    requirement: CheckInPhotoRequirement;
    requireFront: boolean;
    requireSide: boolean;
    requireBack: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: "Invalid weekday." };
  }
  if (!PHOTO_REQUIREMENT_VALUES.includes(policy.requirement)) {
    return { ok: false, error: "Invalid photo requirement." };
  }
  if (policy.requirement === "required" && !policy.requireFront && !policy.requireSide && !policy.requireBack) {
    return { ok: false, error: "Select at least one required photo view." };
  }

  try {
    const db = getDb();
    const now = await clientToday(clientId);
    let notActive = false;

    await db.transaction(async (tx) => {
      const [active] = await tx
        .select({
          id: clientCheckInSchedule.id,
          effectiveFrom: clientCheckInSchedule.effectiveFrom,
          photoRequirement: clientCheckInSchedule.photoRequirement,
          photoRequireFront: clientCheckInSchedule.photoRequireFront,
          photoRequireSide: clientCheckInSchedule.photoRequireSide,
          photoRequireBack: clientCheckInSchedule.photoRequireBack,
        })
        .from(clientCheckInSchedule)
        .where(
          and(
            eq(clientCheckInSchedule.clientId, clientId),
            eq(clientCheckInSchedule.weekday, weekday),
            isNull(clientCheckInSchedule.effectiveTo),
          ),
        )
        .limit(1);

      if (!active) {
        notActive = true;
        return;
      }
      const unchanged =
        active.photoRequirement === policy.requirement &&
        active.photoRequireFront === policy.requireFront &&
        active.photoRequireSide === policy.requireSide &&
        active.photoRequireBack === policy.requireBack;
      if (unchanged) {
        return; // Idempotent no-op.
      }

      const nextValues = {
        photoRequirement: policy.requirement,
        photoRequireFront: policy.requireFront,
        photoRequireSide: policy.requireSide,
        photoRequireBack: policy.requireBack,
      };

      if (active.effectiveFrom === now) {
        await tx
          .update(clientCheckInSchedule)
          .set(nextValues)
          .where(and(eq(clientCheckInSchedule.id, active.id), eq(clientCheckInSchedule.clientId, clientId)));
      } else {
        await tx
          .update(clientCheckInSchedule)
          .set({ effectiveTo: now })
          .where(and(eq(clientCheckInSchedule.id, active.id), eq(clientCheckInSchedule.clientId, clientId)));
        await tx.insert(clientCheckInSchedule).values({ clientId, weekday, effectiveFrom: now, ...nextValues });
      }
    });

    if (notActive) {
      return { ok: false, error: "That day is not currently part of the required check-in schedule." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[check-in-schedule-service] setPhotoPolicy error:", err);
    return { ok: false, error: "Failed to save photo requirement. Please try again." };
  }
}
