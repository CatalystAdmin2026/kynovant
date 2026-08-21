"use server";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Client Workspace Server Actions (Sprint 6.3A)
//
// Server actions run on the server and can be called from Client
// Components. Each action re-validates auth independently because
// Server Actions bypass middleware.
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireCoachOrAdmin, assertCoachOwnsClient } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { clientGoals, type GoalType } from "@/lib/db/schema-profile";
import { archiveAndAssignProgram } from "@/lib/db/coach-program-assignment-service";
import { setClientSchedule, setPhotoPolicy } from "@/lib/db/check-in-schedule-service";
import { validateScheduleWeekdays } from "@/lib/checkin/schedule";
import type { CheckInPhotoRequirement } from "@/lib/db/schema-check-in";

// ─────────────────────────────────────────────────────────────
// AUTH HELPER
//
// Replaces a hand-copied, role-only auth check with the single
// canonical ownership-aware guard from lib/auth/guards.ts. Validates
// role, suspended/archived status (via requireCoachOrAdmin), AND that
// the acting coach is actually enrolled with clientId (admin bypasses).
// ─────────────────────────────────────────────────────────────

async function assertCoachOwnsClientAction(
  clientId: string,
): Promise<{ ok: true; coachId: string | null } | { ok: false; error: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };
  const ownership = await assertCoachOwnsClient(guard.dbUser, clientId);
  if (!ownership.ok) return { ok: false, error: ownership.error };
  return { ok: true, coachId: ownership.scope.coachId };
}

// ─────────────────────────────────────────────────────────────
// ASSIGN PROGRAM ACTION
//
// Archives the client's current active program (if any) and
// creates a new active assignment. Revalidates all HQ pages
// that display program state so the coach sees fresh data.
// ─────────────────────────────────────────────────────────────

export async function assignProgramAction(data: {
  clientId: string;
  programTemplateId: string;
  startDate: string;
  coachNotes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  // Validate required fields before using clientId in an ownership check
  if (!data.clientId || !data.programTemplateId || !data.startDate) {
    return { ok: false, error: "Missing required fields." };
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
    return { ok: false, error: "Invalid date format." };
  }

  const auth = await assertCoachOwnsClientAction(data.clientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await archiveAndAssignProgram({
    clientId: data.clientId,
    programTemplateId: data.programTemplateId,
    startDate: data.startDate,
    coachNotes: data.coachNotes ?? null,
    coachId: auth.coachId,
  });

  if (result.ok) {
    // Revalidate all HQ views that show program state
    revalidatePath(`/hq/clients/${data.clientId}`);
    revalidatePath("/hq/clients");
    revalidatePath("/hq");
  }

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ─────────────────────────────────────────────────────────────
// GOAL ACTIONS
//
// Create a new active goal for the client (coach-created).
// Archive (supersede) an existing goal.
// Goals are never deleted — status changes only.
// ─────────────────────────────────────────────────────────────

export async function saveGoalAction(data: {
  clientId: string;
  goalType: GoalType;
  description: string;
  targetDate?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!data.clientId || !data.description.trim()) {
    return { ok: false, error: "Missing required fields." };
  }

  const auth = await assertCoachOwnsClientAction(data.clientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  await db.insert(clientGoals).values({
    clientId: data.clientId,
    goalType: data.goalType,
    description: data.description.trim(),
    targetDate: data.targetDate ?? null,
    status: "active",
    startedAt: today,
  });

  revalidatePath(`/hq/clients/${data.clientId}`);
  return { ok: true };
}

export async function archiveGoalAction(
  goalId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!goalId || !clientId) {
    return { ok: false, error: "Missing required fields." };
  }

  const auth = await assertCoachOwnsClientAction(clientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  await db
    .update(clientGoals)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(and(eq(clientGoals.id, goalId), eq(clientGoals.clientId, clientId)));

  revalidatePath(`/hq/clients/${clientId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// CHECK-IN SCHEDULE ACTION
//
// The canonical (only) write path to client_check_in_schedule from
// an authenticated request. Coach identity is derived entirely from
// the session via assertCoachOwnsClientAction — the client never
// supplies a coachId, and a coach who isn't enrolled with this
// client (or a client-role caller entirely) is rejected before
// setClientSchedule is ever reached.
//
// Validation happens here, at the action boundary, rather than
// relying solely on setClientSchedule's own normalizeWeekdays — that
// normalization is a defensive second layer for direct service
// callers (seed scripts, tests), not a substitute for a clear,
// client-facing error when a coach's request is malformed. [] is a
// valid, intentional payload — "no required schedule" is a real,
// explicitly-settable state, not an error.
// ─────────────────────────────────────────────────────────────

export async function setCheckInScheduleAction(
  clientId: string,
  weekdays: number[],
): Promise<{ ok: boolean; error?: string }> {
  if (!clientId) {
    return { ok: false, error: "Missing client id." };
  }

  const validated = validateScheduleWeekdays(weekdays);
  if (!validated.ok) return { ok: false, error: validated.error };

  const auth = await assertCoachOwnsClientAction(clientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await setClientSchedule(clientId, validated.weekdays);
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}`);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// PHOTO POLICY ACTION (Check-In Progress Photos pass)
//
// Deliberately separate from setCheckInScheduleAction above — it only
// rotates the photo policy on a weekday already part of the schedule,
// never adds/removes a day, so setCheckInScheduleAction's own
// contract and every existing caller of it are unaffected by this
// pass. Same auth derivation: coach identity comes from the session
// via assertCoachOwnsClientAction, never a client-supplied coachId.
// ─────────────────────────────────────────────────────────────

const VALID_PHOTO_REQUIREMENTS: CheckInPhotoRequirement[] = ["required", "optional", "off"];

export async function setPhotoPolicyAction(
  clientId: string,
  weekday: number,
  policy: { requirement: string; requireFront: boolean; requireSide: boolean; requireBack: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!clientId) {
    return { ok: false, error: "Missing client id." };
  }
  if (!VALID_PHOTO_REQUIREMENTS.includes(policy.requirement as CheckInPhotoRequirement)) {
    return { ok: false, error: "Invalid photo requirement." };
  }

  const auth = await assertCoachOwnsClientAction(clientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await setPhotoPolicy(clientId, weekday, {
    requirement: policy.requirement as CheckInPhotoRequirement,
    requireFront: policy.requireFront,
    requireSide: policy.requireSide,
    requireBack: policy.requireBack,
  });
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}`);
  }
  return result;
}
