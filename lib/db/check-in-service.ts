// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Check-In Service (Sprint 6.3B; rewritten for
// the multi-occurrence model in the Client Biometrics + Flexible
// Check-In Schedule pass)
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles client-perspective operations:
//   - computing this week's required occurrences
//   - creating / updating drafts (per occurrence)
//   - submitting a check-in
//   - listing and fetching check-ins
//
// All status transitions are validated here; coach-side
// transitions live in coach-check-in-service.ts.
//
// OCCURRENCE MODEL (see schema-check-in.ts's table comment for the
// full architecture decision): weekly_check_ins is now keyed by
// scheduled_date (the exact calendar date an occurrence is required
// for), not week_start_date alone — a client can have more than one
// occurrence in the same week (e.g. Wednesday + Sunday), each its own
// row, each independently draftable/submittable. week_start_date is
// retained on every row, always derived consistently from
// scheduled_date, for grouping/display/backward compatibility.
//
// TIMEZONE: "what day is it" / "which calendar date is this
// occurrence" is computed in the CLIENT's own timezone
// (clientProfiles.timezone) via lib/checkin/schedule.ts's
// getDateInTimezone/getWeekdayInTimezone — the same convention chosen
// in the prior pass, now applied consistently to occurrence matching
// too, not just the schedule-awareness Portal line. getWeekStartDate/
// getWeekEndDate below remain pure-UTC and unchanged — legacy callers
// (getPreviousCheckIn's own week ordering, etc.) keep behaving exactly
// as before; only the NEW occurrence-window computation
// (getCurrentCheckInWindows) uses the client's timezone.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { users, coachingEnrollments, timelineEvents } from "./schema";
import { weeklyCheckIns, type WeeklyCheckInStatus } from "./schema-check-in";
import {
  validateCheckInDraft,
  hasFieldErrors,
  type CheckInFieldErrors,
} from "./check-in-validation";
import { notifyCheckInSubmitted } from "./coach-notification-service";
import { getClientSchedule } from "./check-in-schedule-service";
import { getDateInTimezone } from "@/lib/checkin/schedule";
import type { Weekday } from "@/lib/checkin/schedule";

// ─────────────────────────────────────────────────────────────
// WEEK / OCCURRENCE DATE HELPERS
// ─────────────────────────────────────────────────────────────

// Returns the ISO date string (YYYY-MM-DD) of the Sunday that
// starts the calendar week containing `date`. Pure UTC — unchanged
// from before this pass; still used by getWeekEndDate,
// getPreviousCheckIn's ordering, and as the fallback when no
// timezone-aware calendar date is available.
export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().split("T")[0];
}

// Returns the Saturday that ends the week containing `date`.
export function getWeekEndDate(date: Date = new Date()): string {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (6 - dayOfWeek));
  return d.toISOString().split("T")[0];
}

// Same Sunday-anchor arithmetic as getWeekStartDate, but starting
// from an already-resolved calendar-date STRING (e.g. the client's
// local "today" from getDateInTimezone) instead of a Date instant —
// so the anchor is computed in whatever calendar the caller already
// resolved, not re-derived from a raw UTC instant that could land on
// the wrong local day for a non-UTC client.
export function getWeekStartDateForCalendarDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().split("T")[0];
}

// Returns the calendar date for a given weekday within the week that
// starts on weekStartDate — i.e. the exact scheduled_date for that
// occurrence. Also doubles as the legacy "check-in due date" formula
// (weekStartDate + checkInDayOfWeek, defaulting to Sunday) — the
// SAME arithmetic this codebase already used for single-day due
// dates before this pass, now reused as the occurrence-date formula
// so a single-day client's dates are byte-identical to before.
export function getCheckInDueDate(
  weekStartDate: string,
  weekday: number | null | undefined,
): string {
  const day = weekday ?? 0; // default Sunday
  const d = new Date(weekStartDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

// One required occurrence within the current week — the
// multi-occurrence replacement for the old single CheckInWindow.
export interface CheckInOccurrenceWindow {
  scheduledDate: string;
  weekday: Weekday;
  weekStartDate: string;
  weekEndDate: string;
  isToday: boolean;
  isOverdue: boolean;
  existingCheckIn: CheckInListItem | null;
}

export interface CheckInDraftData {
  bodyWeightLbs?: string | null;
  waistInches?: string | null;
  averageSleepHours?: string | null;
  averageStress?: number | null;
  averageEnergy?: number | null;
  averageHunger?: number | null;
  digestionRating?: number | null;
  averageWaterOunces?: number | null;
  averageSteps?: number | null;
  workoutCompliancePct?: number | null;
  nutritionCompliancePct?: number | null;
  wins?: string | null;
  challenges?: string | null;
  questions?: string | null;
  clientNotes?: string | null;
}

export interface CheckInListItem {
  id: string;
  scheduledDate: string;
  weekStartDate: string;
  status: WeeklyCheckInStatus;
  submittedAt: Date | null;
  coachReviewedAt: Date | null;
  hasCoachResponse: boolean;
}

export interface CheckInDetail {
  id: string;
  clientId: string;
  scheduledDate: string;
  weekStartDate: string;
  status: WeeklyCheckInStatus;
  submittedAt: Date | null;
  coachReviewedAt: Date | null;
  // Body
  bodyWeightLbs: string | null;
  waistInches: string | null;
  // Recovery
  averageSleepHours: string | null;
  averageStress: number | null;
  averageEnergy: number | null;
  averageHunger: number | null;
  digestionRating: number | null;
  // Habits
  averageWaterOunces: number | null;
  averageSteps: number | null;
  workoutCompliancePct: number | null;
  nutritionCompliancePct: number | null;
  // Reflection
  wins: string | null;
  challenges: string | null;
  questions: string | null;
  clientNotes: string | null;
  // Coach response — only visible if status is 'reviewed'
  coachResponse: string | null;
  // Set when client edits the record after it was submitted.
  // Null means no post-submission edit has occurred.
  lastEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// CURRENT WINDOWS (plural — one per required occurrence this week)
//
// Replaces the old single-window getCurrentCheckInWindow. Returns one
// entry per weekday currently required by the client's schedule
// (client_check_in_schedule) for the CURRENT week, evaluated in the
// client's own timezone. A client with Wednesday + Sunday required
// gets two entries; a client with only Sunday (or no schedule rows at
// all — legacy/never-configured) gets exactly one, with the same date
// arithmetic as before this pass, so a single-day client's behavior
// is unchanged. A client with an explicit empty schedule ([]) gets
// zero entries — no artificial due-state.
// ─────────────────────────────────────────────────────────────

export async function getCurrentCheckInWindows(
  clientId: string,
  timezone: string,
): Promise<CheckInOccurrenceWindow[]> {
  const db = getDb();

  const todayStr = getDateInTimezone(new Date(), timezone);
  const weekStartDate = getWeekStartDateForCalendarDate(todayStr);
  const weekEndDate = getWeekEndDate(new Date(weekStartDate + "T00:00:00Z"));

  let requiredWeekdays: Weekday[] = await getClientSchedule(clientId);

  if (requiredWeekdays.length === 0) {
    // Legacy fallback: this client has no client_check_in_schedule
    // rows at all (not "explicitly configured to zero days" — that
    // case is indistinguishable at this layer, which is exactly why
    // the migration backfills every existing active-enrollment client
    // with a real row; a client reaching this branch has literally
    // never been configured). Preserve prior single-day behavior via
    // the enrollment's checkInDayOfWeek, defaulting to Sunday.
    const [enrollment] = await db
      .select({ checkInDayOfWeek: coachingEnrollments.checkInDayOfWeek })
      .from(coachingEnrollments)
      .where(
        and(
          eq(coachingEnrollments.clientId, clientId),
          eq(coachingEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (enrollment) {
      requiredWeekdays = [(enrollment.checkInDayOfWeek ?? 0) as Weekday];
    }
  }

  if (requiredWeekdays.length === 0) return [];

  const scheduledDates = requiredWeekdays.map((wd) => getCheckInDueDate(weekStartDate, wd));

  const existingRows = await db
    .select({
      id: weeklyCheckIns.id,
      scheduledDate: weeklyCheckIns.scheduledDate,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
      coachResponse: weeklyCheckIns.coachResponse,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        inArray(weeklyCheckIns.scheduledDate, scheduledDates),
      ),
    );
  const byScheduledDate = new Map(existingRows.map((r) => [r.scheduledDate, r]));

  return requiredWeekdays.map((weekday, i) => {
    const scheduledDate = scheduledDates[i];
    const existing = byScheduledDate.get(scheduledDate) ?? null;
    return {
      scheduledDate,
      weekday,
      weekStartDate,
      weekEndDate,
      isToday: scheduledDate === todayStr,
      isOverdue: !existing && scheduledDate < todayStr,
      existingCheckIn: existing
        ? {
            id: existing.id,
            scheduledDate: existing.scheduledDate,
            weekStartDate: existing.weekStartDate,
            status: existing.status,
            submittedAt: existing.submittedAt,
            coachReviewedAt: existing.coachReviewedAt,
            hasCoachResponse: !!existing.coachResponse,
          }
        : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// CREATE OR UPDATE DRAFT
//
// Upserts a draft check-in for a SPECIFIC occurrence (scheduledDate)
// — the caller (a Portal action) determines which required occurrence
// the client is starting/continuing, so a Wednesday draft can never
// collide with or overwrite a Sunday draft/submission even in the
// same week.
//
// Atomic upsert keyed on the (clientId, scheduledDate) unique index —
// a concurrent double-click / two-tab "Start Check-In" on the SAME
// occurrence races safely at the DB level (ON CONFLICT), not via a
// select-then-insert TOCTOU window. The WHERE guard on the conflict
// clause means a row that's already submitted/reviewed is never
// silently resurrected to draft by this call, even under a race.
// ─────────────────────────────────────────────────────────────

export async function createOrUpdateDraftCheckIn(
  clientId: string,
  scheduledDate: string,
  data: CheckInDraftData,
): Promise<{ ok: true; checkInId: string } | { ok: false; error: string }> {
  const db = getDb();

  // Verify client exists
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, clientId), eq(users.role, "client")))
    .limit(1);

  if (!client) return { ok: false, error: "Client not found." };

  // Fast-path check — the common case where no race is happening.
  // The ON CONFLICT WHERE guard below is the actual authoritative
  // protection; this just gives non-racing callers a precise message
  // without an extra round-trip in the common path.
  const [existing] = await db
    .select({ id: weeklyCheckIns.id, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.scheduledDate, scheduledDate),
      ),
    )
    .limit(1);

  if (existing && existing.status !== "draft") {
    return {
      ok: false,
      error: `This check-in has already been ${existing.status === "submitted" ? "submitted" : "reviewed"}. It cannot be edited.`,
    };
  }

  // Look up active enrollment for enrollmentId
  const [enrollment] = await db
    .select({ id: coachingEnrollments.id })
    .from(coachingEnrollments)
    .where(
      and(
        eq(coachingEnrollments.clientId, clientId),
        eq(coachingEnrollments.status, "active"),
      ),
    )
    .limit(1);

  const weekStartDate = getWeekStartDateForCalendarDate(scheduledDate);

  const fields = {
    bodyWeightLbs: data.bodyWeightLbs ?? null,
    waistInches: data.waistInches ?? null,
    averageSleepHours: data.averageSleepHours ?? null,
    averageStress: data.averageStress ?? null,
    averageEnergy: data.averageEnergy ?? null,
    averageHunger: data.averageHunger ?? null,
    digestionRating: data.digestionRating ?? null,
    averageWaterOunces: data.averageWaterOunces ?? null,
    averageSteps: data.averageSteps ?? null,
    workoutCompliancePct: data.workoutCompliancePct ?? null,
    nutritionCompliancePct: data.nutritionCompliancePct ?? null,
    wins: data.wins ?? null,
    challenges: data.challenges ?? null,
    questions: data.questions ?? null,
    clientNotes: data.clientNotes ?? null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(weeklyCheckIns)
    .values({
      clientId,
      enrollmentId: enrollment?.id ?? null,
      scheduledDate,
      weekStartDate,
      status: "draft",
      ...fields,
    })
    .onConflictDoUpdate({
      target: [weeklyCheckIns.clientId, weeklyCheckIns.scheduledDate],
      set: fields,
      // Postgres ON CONFLICT ... WHERE: the UPDATE only fires when the
      // existing row's status is still 'draft'. Otherwise this
      // effectively no-ops for that row and RETURNING yields nothing.
      setWhere: eq(weeklyCheckIns.status, "draft"),
    })
    .returning({ id: weeklyCheckIns.id });

  if (row) return { ok: true, checkInId: row.id };

  // The fast-path check above passed, but a concurrent request
  // changed the row's status before this upsert committed. Re-check
  // to report the accurate current state rather than a generic error.
  const [current] = await db
    .select({ id: weeklyCheckIns.id, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.scheduledDate, scheduledDate),
      ),
    )
    .limit(1);
  return {
    ok: false,
    error: current
      ? `This check-in has already been ${current.status === "submitted" ? "submitted" : "reviewed"}. It cannot be edited.`
      : "Failed to save check-in. Please try again.",
  };
}

// ─────────────────────────────────────────────────────────────
// SUBMIT CHECK-IN
//
// Transitions: draft → submitted
// Emits a timeline event for the submission.
// ─────────────────────────────────────────────────────────────

export async function submitCheckIn(
  clientId: string,
  checkInId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [checkIn] = await db
    .select({
      id: weeklyCheckIns.id,
      status: weeklyCheckIns.status,
      scheduledDate: weeklyCheckIns.scheduledDate,
      weekStartDate: weeklyCheckIns.weekStartDate,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.id, checkInId),
        eq(weeklyCheckIns.clientId, clientId),
      ),
    )
    .limit(1);

  if (!checkIn) return { ok: false, error: "Check-in not found." };
  if (checkIn.status !== "draft") {
    return {
      ok: false,
      error:
        checkIn.status === "submitted"
          ? "This check-in has already been submitted."
          : "This check-in is no longer editable.",
    };
  }

  const now = new Date();

  // Optimistic WHERE guard: UPDATE only succeeds if status is still 'draft'.
  // If a concurrent submit already flipped the status, RETURNING yields
  // zero rows and we skip the timeline event (idempotent — submit succeeded).
  const updated = await db
    .update(weeklyCheckIns)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(
      and(
        eq(weeklyCheckIns.id, checkInId),
        eq(weeklyCheckIns.status, "draft"),
      ),
    )
    .returning({ id: weeklyCheckIns.id });

  if (!updated[0]) {
    // Concurrent request already submitted — idempotent success, no duplicate event.
    return { ok: true };
  }

  // Timeline event — no draft content is included. Uses the specific
  // scheduledDate, not just the week, so two occurrences submitted in
  // the same week (e.g. Wednesday + Sunday) produce distinguishable
  // events rather than two identical "Week of X" entries.
  await db.insert(timelineEvents).values({
    clientId,
    eventType: "check_in_submitted",
    actorRole: "client",
    title: "Weekly check-in submitted",
    description: `${checkIn.scheduledDate} (week of ${checkIn.weekStartDate})`,
    occurredAt: now,
  });

  // Non-fatal — see notifyCheckInSubmitted's own comment. Guarded by
  // the same "status actually just transitioned" branch as the
  // timeline event above, so a concurrent double-submit can't reach
  // this twice. Every occurrence submission fires its own notification
  // independently — a Wed+Sun client's coach is notified twice, once
  // per occurrence, never collapsed into one.
  await notifyCheckInSubmitted({
    clientId,
    checkInId,
    scheduledDate: checkIn.scheduledDate,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// LIST CLIENT CHECK-INS
//
// Returns all check-ins for the client, newest week first.
// coach_response is NOT exposed here — use getClientCheckInDetail.
// ─────────────────────────────────────────────────────────────

export async function listClientCheckIns(
  clientId: string,
): Promise<CheckInListItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: weeklyCheckIns.id,
      scheduledDate: weeklyCheckIns.scheduledDate,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
      coachResponse: weeklyCheckIns.coachResponse,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.clientId, clientId))
    .orderBy(desc(weeklyCheckIns.scheduledDate));

  return rows.map((r) => ({
    id: r.id,
    scheduledDate: r.scheduledDate,
    weekStartDate: r.weekStartDate,
    status: r.status,
    submittedAt: r.submittedAt,
    coachReviewedAt: r.coachReviewedAt,
    hasCoachResponse: !!r.coachResponse,
  }));
}

// ─────────────────────────────────────────────────────────────
// GET CLIENT CHECK-IN DETAIL
//
// Returns full check-in data for the client.
// coach_response is returned only if status === 'reviewed'.
// Returns null on ownership mismatch (caller → 404).
// ─────────────────────────────────────────────────────────────

export async function getClientCheckInDetail(
  clientId: string,
  checkInId: string,
): Promise<CheckInDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: weeklyCheckIns.id,
      clientId: weeklyCheckIns.clientId,
      scheduledDate: weeklyCheckIns.scheduledDate,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
      bodyWeightLbs: weeklyCheckIns.bodyWeightLbs,
      waistInches: weeklyCheckIns.waistInches,
      averageSleepHours: weeklyCheckIns.averageSleepHours,
      averageStress: weeklyCheckIns.averageStress,
      averageEnergy: weeklyCheckIns.averageEnergy,
      averageHunger: weeklyCheckIns.averageHunger,
      digestionRating: weeklyCheckIns.digestionRating,
      averageWaterOunces: weeklyCheckIns.averageWaterOunces,
      averageSteps: weeklyCheckIns.averageSteps,
      workoutCompliancePct: weeklyCheckIns.workoutCompliancePct,
      nutritionCompliancePct: weeklyCheckIns.nutritionCompliancePct,
      wins: weeklyCheckIns.wins,
      challenges: weeklyCheckIns.challenges,
      questions: weeklyCheckIns.questions,
      clientNotes: weeklyCheckIns.clientNotes,
      coachResponse: weeklyCheckIns.coachResponse,
      lastEditedAt: weeklyCheckIns.lastEditedAt,
      createdAt: weeklyCheckIns.createdAt,
      updatedAt: weeklyCheckIns.updatedAt,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.id, checkInId),
        eq(weeklyCheckIns.clientId, clientId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    clientId: row.clientId,
    scheduledDate: row.scheduledDate,
    weekStartDate: row.weekStartDate,
    status: row.status,
    submittedAt: row.submittedAt,
    coachReviewedAt: row.coachReviewedAt,
    bodyWeightLbs: row.bodyWeightLbs,
    waistInches: row.waistInches,
    averageSleepHours: row.averageSleepHours,
    averageStress: row.averageStress,
    averageEnergy: row.averageEnergy,
    averageHunger: row.averageHunger,
    digestionRating: row.digestionRating,
    averageWaterOunces: row.averageWaterOunces,
    averageSteps: row.averageSteps,
    workoutCompliancePct: row.workoutCompliancePct,
    nutritionCompliancePct: row.nutritionCompliancePct,
    wins: row.wins,
    challenges: row.challenges,
    questions: row.questions,
    clientNotes: row.clientNotes,
    // Only expose coach response after review is complete
    coachResponse: row.status === "reviewed" ? row.coachResponse : null,
    lastEditedAt: row.lastEditedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// GET PREVIOUS CHECK-IN
//
// Returns the most recent reviewed check-in before a given week,
// used for comparison display on the coach review page.
// ─────────────────────────────────────────────────────────────

export async function getPreviousCheckIn(
  clientId: string,
  beforeWeekStartDate: string,
): Promise<CheckInDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: weeklyCheckIns.id,
      clientId: weeklyCheckIns.clientId,
      scheduledDate: weeklyCheckIns.scheduledDate,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
      bodyWeightLbs: weeklyCheckIns.bodyWeightLbs,
      waistInches: weeklyCheckIns.waistInches,
      averageSleepHours: weeklyCheckIns.averageSleepHours,
      averageStress: weeklyCheckIns.averageStress,
      averageEnergy: weeklyCheckIns.averageEnergy,
      averageHunger: weeklyCheckIns.averageHunger,
      digestionRating: weeklyCheckIns.digestionRating,
      averageWaterOunces: weeklyCheckIns.averageWaterOunces,
      averageSteps: weeklyCheckIns.averageSteps,
      workoutCompliancePct: weeklyCheckIns.workoutCompliancePct,
      nutritionCompliancePct: weeklyCheckIns.nutritionCompliancePct,
      wins: weeklyCheckIns.wins,
      challenges: weeklyCheckIns.challenges,
      questions: weeklyCheckIns.questions,
      clientNotes: weeklyCheckIns.clientNotes,
      coachResponse: weeklyCheckIns.coachResponse,
      lastEditedAt: weeklyCheckIns.lastEditedAt,
      createdAt: weeklyCheckIns.createdAt,
      updatedAt: weeklyCheckIns.updatedAt,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.status, "reviewed"),
      ),
    )
    .orderBy(desc(weeklyCheckIns.scheduledDate))
    .limit(1);

  // Manual filter for "before" since we need to avoid complex sql<>
  if (!row || row.weekStartDate >= beforeWeekStartDate) return null;

  return {
    id: row.id,
    clientId: row.clientId,
    scheduledDate: row.scheduledDate,
    weekStartDate: row.weekStartDate,
    status: row.status,
    submittedAt: row.submittedAt,
    coachReviewedAt: row.coachReviewedAt,
    bodyWeightLbs: row.bodyWeightLbs,
    waistInches: row.waistInches,
    averageSleepHours: row.averageSleepHours,
    averageStress: row.averageStress,
    averageEnergy: row.averageEnergy,
    averageHunger: row.averageHunger,
    digestionRating: row.digestionRating,
    averageWaterOunces: row.averageWaterOunces,
    averageSteps: row.averageSteps,
    workoutCompliancePct: row.workoutCompliancePct,
    nutritionCompliancePct: row.nutritionCompliancePct,
    wins: row.wins,
    challenges: row.challenges,
    questions: row.questions,
    clientNotes: row.clientNotes,
    coachResponse: row.coachResponse,
    lastEditedAt: row.lastEditedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// EDIT SUBMITTED CHECK-IN
//
// Allows a client to correct a submitted check-in while status
// is still 'submitted'. Uses an atomic conditional UPDATE to
// detect coach race conditions at the database level.
//
// Returns:
//   { ok: true } — saved successfully
//   { ok: false, fieldErrors } — validation failed
//   { ok: false, error: "race" message } — coach started reviewing
//   { ok: false, error: "not found" } — ownership mismatch or not found
// ─────────────────────────────────────────────────────────────

export async function editSubmittedCheckIn(
  clientId: string,
  checkInId: string,
  data: CheckInDraftData,
): Promise<{
  ok: boolean;
  error?: string;
  fieldErrors?: CheckInFieldErrors;
}> {
  // Validate first — no DB round-trip needed if data is malformed.
  const fieldErrors = validateCheckInDraft(data);
  if (hasFieldErrors(fieldErrors)) {
    return { ok: false, fieldErrors };
  }

  const db = getDb();
  const now = new Date();

  // Atomic conditional update: only succeeds if the row still belongs
  // to this client AND status is still 'submitted'. If the coach has
  // already transitioned to in_review, the WHERE predicate matches zero
  // rows and .returning() yields an empty array.
  const updated = await db
    .update(weeklyCheckIns)
    .set({
      bodyWeightLbs: data.bodyWeightLbs ?? null,
      waistInches: data.waistInches ?? null,
      averageSleepHours: data.averageSleepHours ?? null,
      averageStress: data.averageStress ?? null,
      averageEnergy: data.averageEnergy ?? null,
      averageHunger: data.averageHunger ?? null,
      digestionRating: data.digestionRating ?? null,
      averageWaterOunces: data.averageWaterOunces ?? null,
      averageSteps: data.averageSteps ?? null,
      workoutCompliancePct: data.workoutCompliancePct ?? null,
      nutritionCompliancePct: data.nutritionCompliancePct ?? null,
      wins: data.wins ?? null,
      challenges: data.challenges ?? null,
      questions: data.questions ?? null,
      clientNotes: data.clientNotes ?? null,
      lastEditedAt: now,
      updatedAt: now,
      // submittedAt is intentionally NOT touched — original timestamp preserved.
    })
    .where(
      and(
        eq(weeklyCheckIns.id, checkInId),
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.status, "submitted"),
      ),
    )
    .returning({ id: weeklyCheckIns.id });

  if (updated[0]) return { ok: true };

  // No row matched — distinguish ownership failure from race condition.
  const [existing] = await db
    .select({ id: weeklyCheckIns.id, clientId: weeklyCheckIns.clientId, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!existing || existing.clientId !== clientId) {
    return { ok: false, error: "Check-in not found." };
  }

  // The record exists and belongs to this client but status has changed.
  return {
    ok: false,
    error:
      "Your coach has already started reviewing this check-in, so it can no longer be edited.",
  };
}
