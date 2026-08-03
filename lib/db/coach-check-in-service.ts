// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Coach Check-In Service (Sprint 6.3B)
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles coach-perspective operations:
//   - listing check-ins across all clients
//   - fetching full review detail with comparison data
//   - status transitions: submitted→in_review, in_review→reviewed, reviewed→in_review
//   - saving draft coach responses
//   - workspace summary for the client command center
//
// Status lifecycle (coach side):
//   submitted  → in_review  (startCheckInReview)
//   in_review  → reviewed   (markCheckInReviewed)
//   reviewed   → in_review  (reopenCheckIn)
//
// All writes use getDb() (service-role, bypasses RLS).
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, desc, or, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import { createNotification } from "./notification-service";
import { users, clientProfiles, coachingEnrollments, timelineEvents } from "./schema";
import { clientGoals } from "./schema-profile";
import { weeklyCheckIns } from "./schema-check-in";
import type { WeeklyCheckInStatus } from "./schema-check-in";
import type { CheckInDetail } from "./check-in-service";
import { getPreviousCheckIn } from "./check-in-service";

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export interface CoachCheckInQueueItem {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  weekStartDate: string;
  status: string;
  submittedAt: Date | null;
  waitingDays: number | null;
}

export interface CoachCheckInDetail extends CheckInDetail {
  clientName: string;
  clientEmail: string;
  enrollmentId: string | null;
  checkInDayOfWeek: number | null;
  previousCheckIn: CheckInDetail | null;
}

export interface ClientCheckInSummary {
  totalCheckIns: number;
  pendingCount: number;
  lastCheckIn: {
    id: string;
    weekStartDate: string;
    status: string;
    submittedAt: Date | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────
// LIST COACH CHECK-INS (QUEUE)
//
// Returns check-ins sorted for the review queue:
//   1. in_review first (coach is actively working on them)
//   2. submitted (waiting, oldest first)
//   3. reviewed (newest first)
//
// Pass status filter to narrow results.
// ─────────────────────────────────────────────────────────────

export async function listCoachCheckIns(opts?: {
  status?: WeeklyCheckInStatus[];
  clientId?: string;
  limit?: number;
  /** null (default) = admin, unscoped. A coach's userId scopes to their own clients. */
  coachId?: string | null;
}): Promise<CoachCheckInQueueItem[]> {
  const db = getDb();
  const coachId = opts?.coachId ?? null;

  const rows = await db
    .select({
      id: weeklyCheckIns.id,
      clientId: weeklyCheckIns.clientId,
      clientName: clientProfiles.fullName,
      clientEmail: users.email,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
    })
    .from(weeklyCheckIns)
    .innerJoin(users, eq(weeklyCheckIns.clientId, users.id))
    .leftJoin(clientProfiles, eq(weeklyCheckIns.clientId, clientProfiles.userId))
    .where(
      and(
        opts?.status
          ? inArray(weeklyCheckIns.status, opts.status)
          : undefined,
        opts?.clientId
          ? eq(weeklyCheckIns.clientId, opts.clientId)
          : undefined,
        coachId === null
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM ${coachingEnrollments}
              WHERE ${coachingEnrollments.clientId} = ${weeklyCheckIns.clientId}
                AND ${coachingEnrollments.coachId} = ${coachId}
            )`,
      ),
    )
    .orderBy(
      // Priority sort: in_review > submitted > reviewed
      sql`CASE ${weeklyCheckIns.status}
        WHEN 'in_review' THEN 0
        WHEN 'submitted' THEN 1
        WHEN 'reviewed' THEN 2
        ELSE 3
      END`,
      asc(weeklyCheckIns.submittedAt),
    )
    .limit(opts?.limit ?? 200);

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName ?? r.clientEmail,
    clientEmail: r.clientEmail,
    weekStartDate: r.weekStartDate,
    status: r.status,
    submittedAt: r.submittedAt,
    waitingDays:
      r.submittedAt
        ? Math.floor((now - new Date(r.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
  }));
}

// ─────────────────────────────────────────────────────────────
// GET COACH CHECK-IN DETAIL
//
// Returns full check-in data plus comparison context.
// Does NOT hide coach_response (coach sees everything).
// Returns null if check-in does not exist.
// ─────────────────────────────────────────────────────────────

export async function getCoachCheckInDetail(
  checkInId: string,
): Promise<CoachCheckInDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: weeklyCheckIns.id,
      clientId: weeklyCheckIns.clientId,
      enrollmentId: weeklyCheckIns.enrollmentId,
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
      reviewedBy: weeklyCheckIns.reviewedBy,
      lastEditedAt: weeklyCheckIns.lastEditedAt,
      createdAt: weeklyCheckIns.createdAt,
      updatedAt: weeklyCheckIns.updatedAt,
      clientName: clientProfiles.fullName,
      clientEmail: users.email,
      checkInDayOfWeek: coachingEnrollments.checkInDayOfWeek,
    })
    .from(weeklyCheckIns)
    .innerJoin(users, eq(weeklyCheckIns.clientId, users.id))
    .leftJoin(clientProfiles, eq(weeklyCheckIns.clientId, clientProfiles.userId))
    .leftJoin(
      coachingEnrollments,
      and(
        eq(coachingEnrollments.clientId, weeklyCheckIns.clientId),
        eq(coachingEnrollments.status, "active"),
      ),
    )
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!row) return null;

  // Load previous (reviewed) check-in for comparison
  const previousCheckIn = await getPreviousCheckIn(
    row.clientId,
    row.weekStartDate,
  );

  return {
    id: row.id,
    clientId: row.clientId,
    enrollmentId: row.enrollmentId,
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
    clientName: row.clientName ?? row.clientEmail,
    clientEmail: row.clientEmail,
    checkInDayOfWeek: row.checkInDayOfWeek,
    previousCheckIn,
  };
}

// ─────────────────────────────────────────────────────────────
// START REVIEW
//
// submitted → in_review
// Emits a timeline event (no check-in content included).
// ─────────────────────────────────────────────────────────────

export async function startCheckInReview(
  checkInId: string,
  coachId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [checkIn] = await db
    .select({
      id: weeklyCheckIns.id,
      status: weeklyCheckIns.status,
      clientId: weeklyCheckIns.clientId,
      weekStartDate: weeklyCheckIns.weekStartDate,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!checkIn) return { ok: false, error: "Check-in not found." };

  if (checkIn.status === "in_review") return { ok: true }; // idempotent
  if (checkIn.status !== "submitted") {
    return {
      ok: false,
      error: `Check-in status is '${checkIn.status}'. Only submitted check-ins can be started.`,
    };
  }

  const now = new Date();

  // Optimistic WHERE guard: only succeeds if status is still 'submitted'.
  // If a concurrent startReview already moved it to in_review, RETURNING
  // yields zero rows and we skip the timeline event (idempotent).
  const updated = await db
    .update(weeklyCheckIns)
    .set({ status: "in_review", updatedAt: now })
    .where(
      and(
        eq(weeklyCheckIns.id, checkInId),
        eq(weeklyCheckIns.status, "submitted"),
      ),
    )
    .returning({ id: weeklyCheckIns.id });

  if (!updated[0]) {
    // Concurrent request already moved to in_review — idempotent success.
    return { ok: true };
  }

  await db.insert(timelineEvents).values({
    clientId: checkIn.clientId,
    eventType: "check_in_review_started",
    actorId: coachId,
    actorRole: "coach",
    title: "Check-in review started",
    description: `Week of ${checkIn.weekStartDate}`,
    occurredAt: now,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// SAVE COACH RESPONSE DRAFT
//
// Updates coach_response without changing status.
// Allowed in both in_review and reviewed states.
// ─────────────────────────────────────────────────────────────

export async function saveCoachResponseDraft(
  checkInId: string,
  coachId: string,
  response: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [checkIn] = await db
    .select({ id: weeklyCheckIns.id, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!checkIn) return { ok: false, error: "Check-in not found." };
  if (checkIn.status !== "in_review" && checkIn.status !== "reviewed") {
    return {
      ok: false,
      error: "Check-in must be in review or reviewed status to save a response.",
    };
  }

  await db
    .update(weeklyCheckIns)
    .set({
      coachResponse: response,
      reviewedBy: coachId,
      updatedAt: new Date(),
    })
    .where(eq(weeklyCheckIns.id, checkInId));

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// MARK REVIEWED
//
// in_review → reviewed
// Saves final coach response and emits timeline event.
// ─────────────────────────────────────────────────────────────

export async function markCheckInReviewed(
  checkInId: string,
  coachId: string,
  response: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [checkIn] = await db
    .select({
      id: weeklyCheckIns.id,
      status: weeklyCheckIns.status,
      clientId: weeklyCheckIns.clientId,
      weekStartDate: weeklyCheckIns.weekStartDate,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!checkIn) return { ok: false, error: "Check-in not found." };
  if (checkIn.status !== "in_review") {
    return {
      ok: false,
      error:
        checkIn.status === "reviewed"
          ? "This check-in has already been reviewed."
          : `Check-in must be in 'in_review' status. Current: '${checkIn.status}'.`,
    };
  }

  const now = new Date();

  // Transaction: the UPDATE WHERE includes status='in_review' as an optimistic
  // guard so only one concurrent markReviewed request can commit.
  // If two coaches race, the second UPDATE returns 0 rows and the transaction
  // is rolled back, preventing duplicate events and indeterminate reviewedBy.
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(weeklyCheckIns)
        .set({
          status: "reviewed",
          coachResponse: response,
          coachReviewedAt: now,
          reviewedBy: coachId,
          updatedAt: now,
        })
        .where(
          and(
            eq(weeklyCheckIns.id, checkInId),
            eq(weeklyCheckIns.status, "in_review"),
          ),
        )
        .returning({ id: weeklyCheckIns.id });

      if (!updated[0]) {
        throw new Error("concurrent_review");
      }

      await tx.insert(timelineEvents).values({
        clientId: checkIn.clientId,
        eventType: "check_in_reviewed",
        actorId: coachId,
        actorRole: "coach",
        title: "Weekly check-in reviewed",
        description: `Week of ${checkIn.weekStartDate} — coach response recorded`,
        occurredAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "concurrent_review") {
      return {
        ok: false,
        error: "Check-in status was changed concurrently. Refresh and try again.",
      };
    }
    throw err;
  }

  // Notify the client that their check-in was reviewed.
  // Runs outside the transaction — notification failure must not
  // roll back the review itself.
  await createNotification({
    clientId: checkIn.clientId,
    actorId: coachId,
    eventType: "check_in_reviewed",
    resourceType: "check_in",
    resourceId: checkInId,
    title: "Your coach reviewed your check-in",
    body: response.trim() ? "Your coach left a response." : null,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// REOPEN CHECK-IN
//
// reviewed → in_review (explicit coach action only)
//
// Emits a timeline event recording which coach reopened the
// check-in and when the previous review occurred, so the full
// review history is preserved in the audit trail.
// ─────────────────────────────────────────────────────────────

export async function reopenCheckIn(
  checkInId: string,
  coachId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();

  const [checkIn] = await db
    .select({
      id: weeklyCheckIns.id,
      status: weeklyCheckIns.status,
      clientId: weeklyCheckIns.clientId,
      weekStartDate: weeklyCheckIns.weekStartDate,
      coachReviewedAt: weeklyCheckIns.coachReviewedAt,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);

  if (!checkIn) return { ok: false, error: "Check-in not found." };
  if (checkIn.status !== "reviewed") {
    return {
      ok: false,
      error: `Only reviewed check-ins can be reopened. Current: '${checkIn.status}'.`,
    };
  }

  const now = new Date();

  // Clear coachReviewedAt — the check-in is back in in_review and no
  // longer in a terminal reviewed state. The previous review timestamp
  // is preserved in the timeline event below.
  await db
    .update(weeklyCheckIns)
    .set({
      status: "in_review",
      coachReviewedAt: null,
      updatedAt: now,
    })
    .where(eq(weeklyCheckIns.id, checkInId));

  const prevReviewLabel = checkIn.coachReviewedAt
    ? new Date(checkIn.coachReviewedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  await db.insert(timelineEvents).values({
    clientId: checkIn.clientId,
    eventType: "check_in_reopened",
    actorId: coachId,
    actorRole: "coach",
    title: "Check-in reopened for revision",
    description: prevReviewLabel
      ? `Week of ${checkIn.weekStartDate} — previously reviewed ${prevReviewLabel}`
      : `Week of ${checkIn.weekStartDate}`,
    occurredAt: now,
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// CLIENT CHECK-IN SUMMARY (for workspace panel)
//
// Returns aggregate data for a single client's check-ins,
// used to populate the check-in panel in the client workspace.
// ─────────────────────────────────────────────────────────────

export async function getClientCheckInSummary(
  clientId: string,
): Promise<ClientCheckInSummary> {
  const db = getDb();

  const rows = await db
    .select({
      id: weeklyCheckIns.id,
      weekStartDate: weeklyCheckIns.weekStartDate,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
    })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.clientId, clientId))
    .orderBy(desc(weeklyCheckIns.weekStartDate))
    .limit(50);

  const pendingCount = rows.filter((r) => r.status === "submitted").length;
  const lastCheckIn = rows[0]
    ? {
        id: rows[0].id,
        weekStartDate: rows[0].weekStartDate,
        status: rows[0].status,
        submittedAt: rows[0].submittedAt,
      }
    : null;

  return {
    totalCheckIns: rows.length,
    pendingCount,
    lastCheckIn,
  };
}

// ─────────────────────────────────────────────────────────────
// GET CLIENT GOAL CONTEXT (for coach review panel)
//
// Returns the client's active goal for display alongside the
// check-in review. Gives the coach immediate context on what
// the client is working toward without leaving the review page.
// ─────────────────────────────────────────────────────────────

export interface ClientGoalContext {
  id: string;
  goalType: string;
  description: string;
  targetValue: string | null;
  targetUnit: string | null;
  targetDate: string | null;
}

export async function getClientGoalContext(
  clientId: string,
): Promise<ClientGoalContext | null> {
  const db = getDb();

  const [goal] = await db
    .select({
      id: clientGoals.id,
      goalType: clientGoals.goalType,
      description: clientGoals.description,
      targetValue: clientGoals.targetValue,
      targetUnit: clientGoals.targetUnit,
      targetDate: clientGoals.targetDate,
    })
    .from(clientGoals)
    .where(
      and(
        eq(clientGoals.clientId, clientId),
        eq(clientGoals.status, "active"),
      ),
    )
    .orderBy(asc(clientGoals.priority), desc(clientGoals.createdAt))
    .limit(1);

  if (!goal) return null;

  return {
    id: goal.id,
    goalType: goal.goalType,
    description: goal.description,
    targetValue: goal.targetValue ?? null,
    targetUnit: goal.targetUnit ?? null,
    targetDate: goal.targetDate ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// MISSION CONTROL AGGREGATE
//
// Returns counts for the Mission Control dashboard card.
// ─────────────────────────────────────────────────────────────

export interface CheckInMissionStats {
  waitingCount: number;
  inReviewCount: number;
  oldestWaitingAt: Date | null;
}

export async function getCheckInMissionStats(
  coachId: string | null = null,
): Promise<CheckInMissionStats> {
  const db = getDb();

  const rows = await db
    .select({
      id: weeklyCheckIns.id,
      status: weeklyCheckIns.status,
      submittedAt: weeklyCheckIns.submittedAt,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        or(
          eq(weeklyCheckIns.status, "submitted"),
          eq(weeklyCheckIns.status, "in_review"),
        ),
        coachId === null
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM ${coachingEnrollments}
              WHERE ${coachingEnrollments.clientId} = ${weeklyCheckIns.clientId}
                AND ${coachingEnrollments.coachId} = ${coachId}
            )`,
      ),
    );

  const waitingRows = rows.filter((r) => r.status === "submitted");
  const inReviewRows = rows.filter((r) => r.status === "in_review");

  const oldestWaiting = waitingRows
    .map((r) => r.submittedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

  return {
    waitingCount: waitingRows.length,
    inReviewCount: inReviewRows.length,
    oldestWaitingAt: oldestWaiting,
  };
}
