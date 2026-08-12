// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Check-In Service (Sprint 6.3B)
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles client-perspective operations:
//   - computing the current week window
//   - creating / updating drafts
//   - submitting a check-in
//   - listing and fetching check-ins
//
// All status transitions are validated here; coach-side
// transitions live in coach-check-in-service.ts.
//
// Week convention:
//   week_start_date is always the Sunday (UTC) of the calendar
//   week being reported. If a client has a configured check-in
//   day, that determines when the check-in is *due*, not the
//   week_start_date value.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./client";
import { users, coachingEnrollments, timelineEvents } from "./schema";
import { weeklyCheckIns, type WeeklyCheckInStatus } from "./schema-check-in";
import {
  validateCheckInDraft,
  hasFieldErrors,
  type CheckInFieldErrors,
} from "./check-in-validation";
import { notifyCheckInSubmitted } from "./coach-notification-service";

// ─────────────────────────────────────────────────────────────
// WEEK DATE HELPERS
// ─────────────────────────────────────────────────────────────

// Returns the ISO date string (YYYY-MM-DD) of the Sunday that
// starts the calendar week containing `date`.
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

// Returns the check-in due date for a given week start date.
// Uses the enrollment's checkInDayOfWeek if available; defaults to Sunday (0).
// The due date is always within the same calendar week as weekStartDate.
export function getCheckInDueDate(
  weekStartDate: string,
  checkInDayOfWeek: number | null | undefined,
): string {
  const day = checkInDayOfWeek ?? 0; // default Sunday
  const sunday = new Date(weekStartDate + "T00:00:00Z");
  sunday.setUTCDate(sunday.getUTCDate() + day);
  return sunday.toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export interface CheckInWindow {
  weekStartDate: string;
  weekEndDate: string;
  dueDate: string;
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
  weekStartDate: string;
  status: WeeklyCheckInStatus;
  submittedAt: Date | null;
  coachReviewedAt: Date | null;
  hasCoachResponse: boolean;
}

export interface CheckInDetail {
  id: string;
  clientId: string;
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
// CURRENT WINDOW
//
// Returns the current week's check-in window, including whether
// a check-in already exists (in any status) for this week.
// ─────────────────────────────────────────────────────────────

export async function getCurrentCheckInWindow(
  clientId: string,
): Promise<CheckInWindow> {
  const db = getDb();

  const weekStartDate = getWeekStartDate();
  const weekEndDate = getWeekEndDate();

  // Look up the enrollment to get checkInDayOfWeek
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

  const dueDate = getCheckInDueDate(
    weekStartDate,
    enrollment?.checkInDayOfWeek,
  );

  const today = new Date().toISOString().split("T")[0];
  const isOverdue = today > dueDate;

  // Check if a check-in already exists for this week
  const [existing] = await db
    .select({
      id: weeklyCheckIns.id,
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
        eq(weeklyCheckIns.weekStartDate, weekStartDate),
      ),
    )
    .limit(1);

  return {
    weekStartDate,
    weekEndDate,
    dueDate,
    isOverdue,
    existingCheckIn: existing
      ? {
          id: existing.id,
          weekStartDate: existing.weekStartDate,
          status: existing.status,
          submittedAt: existing.submittedAt,
          coachReviewedAt: existing.coachReviewedAt,
          hasCoachResponse: !!existing.coachResponse,
        }
      : null,
  };
}

// ─────────────────────────────────────────────────────────────
// CREATE OR UPDATE DRAFT
//
// Upserts a draft check-in for the current week.
// If a check-in already exists in 'submitted', 'in_review', or
// 'reviewed' status, returns an error — cannot re-open via this path.
// ─────────────────────────────────────────────────────────────

export async function createOrUpdateDraftCheckIn(
  clientId: string,
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

  const weekStartDate = getWeekStartDate();

  // Check for existing check-in
  const [existing] = await db
    .select({ id: weeklyCheckIns.id, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.weekStartDate, weekStartDate),
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

  const updateData = {
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

  if (existing) {
    await db
      .update(weeklyCheckIns)
      .set(updateData)
      .where(eq(weeklyCheckIns.id, existing.id));
    return { ok: true, checkInId: existing.id };
  }

  const [newCheckIn] = await db
    .insert(weeklyCheckIns)
    .values({
      clientId,
      enrollmentId: enrollment?.id ?? null,
      weekStartDate,
      status: "draft",
      ...updateData,
    })
    .returning({ id: weeklyCheckIns.id });

  return { ok: true, checkInId: newCheckIn.id };
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
    .select({ id: weeklyCheckIns.id, status: weeklyCheckIns.status, weekStartDate: weeklyCheckIns.weekStartDate })
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

  // Timeline event — no draft content is included.
  await db.insert(timelineEvents).values({
    clientId,
    eventType: "check_in_submitted",
    actorRole: "client",
    title: "Weekly check-in submitted",
    description: `Week of ${checkIn.weekStartDate}`,
    occurredAt: now,
  });

  // Non-fatal — see notifyCheckInSubmitted's own comment. Guarded by
  // the same "status actually just transitioned" branch as the
  // timeline event above, so a concurrent double-submit can't reach
  // this twice.
  await notifyCheckInSubmitted({
    clientId,
    checkInId,
    weekStartDate: checkIn.weekStartDate,
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
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
      coachResponse: weeklyCheckIns.coachResponse,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.clientId, clientId))
    .orderBy(desc(weeklyCheckIns.weekStartDate));

  return rows.map((r) => ({
    id: r.id,
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
    .orderBy(desc(weeklyCheckIns.weekStartDate))
    .limit(1);

  // Manual filter for "before" since we need to avoid complex sql<>
  if (!row || row.weekStartDate >= beforeWeekStartDate) return null;

  return {
    id: row.id,
    clientId: row.clientId,
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
