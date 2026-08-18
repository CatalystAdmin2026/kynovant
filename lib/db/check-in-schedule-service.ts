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
import { eq, and, isNull, lte, or, gt } from "drizzle-orm";
import { getDb } from "./client";
import { clientCheckInSchedule } from "./schema-check-in";
import { normalizeWeekdays } from "@/lib/checkin/schedule";
import type { Weekday } from "@/lib/checkin/schedule";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// Returns the CURRENTLY required weekdays — [] means "no required
// schedule," a real, distinct, intentional state.
export async function getClientSchedule(clientId: string): Promise<Weekday[]> {
  const db = getDb();
  const rows = await db
    .select({ weekday: clientCheckInSchedule.weekday })
    .from(clientCheckInSchedule)
    .where(
      and(
        eq(clientCheckInSchedule.clientId, clientId),
        isNull(clientCheckInSchedule.effectiveTo),
      ),
    );
  return normalizeWeekdays(rows.map((r) => r.weekday));
}

// Returns the weekdays that were required ON a specific past (or
// present) calendar date — the historically-truthful query.
// Compliance calculations for a given week MUST use this, not
// getClientSchedule, so a later schedule change never silently
// rewrites what was actually required at the time.
export async function getClientScheduleAtDate(clientId: string, date: string): Promise<Weekday[]> {
  const db = getDb();
  const rows = await db
    .select({ weekday: clientCheckInSchedule.weekday })
    .from(clientCheckInSchedule)
    .where(
      and(
        eq(clientCheckInSchedule.clientId, clientId),
        lte(clientCheckInSchedule.effectiveFrom, date),
        or(isNull(clientCheckInSchedule.effectiveTo), gt(clientCheckInSchedule.effectiveTo, date)),
      ),
    );
  return normalizeWeekdays(rows.map((r) => r.weekday));
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
  const now = today();

  try {
    const db = getDb();
    const activeRows = await db
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
      // chk_check_in_schedule_effective_order requires effectiveTo
      // STRICTLY > effectiveFrom. A row opened earlier and removed
      // today soft-closes normally (today > effectiveFrom). But a row
      // opened TODAY (e.g. added in an earlier call this same day,
      // then removed in a later, separate call — same-day add-then-
      // undo) can never satisfy that with effectiveTo = today, since
      // today == effectiveFrom. That row never became historically
      // true for any past date, so it's deleted outright instead of
      // soft-closed — there is no history to preserve for a row whose
      // entire lifetime was today.
      if (row.effectiveFrom === now) {
        await db
          .delete(clientCheckInSchedule)
          .where(and(eq(clientCheckInSchedule.id, row.id), eq(clientCheckInSchedule.clientId, clientId)));
      } else {
        await db
          .update(clientCheckInSchedule)
          .set({ effectiveTo: now })
          .where(and(eq(clientCheckInSchedule.id, row.id), eq(clientCheckInSchedule.clientId, clientId)));
      }
    }

    if (toAdd.length > 0) {
      await db.insert(clientCheckInSchedule).values(
        toAdd.map((weekday) => ({ clientId, weekday, effectiveFrom: now })),
      );
    }

    return { ok: true };
  } catch (err) {
    console.error("[check-in-schedule-service] setClientSchedule error:", err);
    return { ok: false, error: "Failed to save check-in schedule. Please try again." };
  }
}
