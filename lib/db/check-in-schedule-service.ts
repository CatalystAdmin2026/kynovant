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
import { clientCheckInSchedule } from "./schema-check-in";
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
  Array<{ weekday: number; effectiveFrom: string; effectiveTo: string | null }>
> {
  const db = getDb();
  return db
    .select({
      weekday: clientCheckInSchedule.weekday,
      effectiveFrom: clientCheckInSchedule.effectiveFrom,
      effectiveTo: clientCheckInSchedule.effectiveTo,
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
