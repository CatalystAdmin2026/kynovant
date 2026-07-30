"use server";

import { revalidatePath } from "next/cache";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  createDraft,
  updateDraft,
  publishTarget,
  archiveTarget,
} from "@/lib/db/nutrition-target-service";
import type { NutritionDraftInput, NutritionDraftUpdate } from "@/lib/db/nutrition-target-service";
import type { ActivityLevel } from "@/lib/db/schema-nutrition";

// ─────────────────────────────────────────────────────────────
// CREATE DRAFT
//
// Called when the coach submits the calculator form.
// Runs the Mifflin-St Jeor calculator, stores both the system
// recommendation and the coach's initial target values.
// Never auto-publishes. The coach must call publishTargetAction.
// ─────────────────────────────────────────────────────────────

export async function createDraftAction(
  clientId: string,
  data: {
    effectiveDate: string;
    heightInches: number;
    weightLbs: number;
    ageYears: number;
    biologicalSex: "male" | "female" | "unspecified";
    activityLevel: ActivityLevel;
    goalType: string;
    calorieTarget: number;
    proteinGrams: number;
    fatGrams?: number;
    carbGrams?: number;
    adjustmentReason?: string;
    coachNotes?: string;
    internalNotes?: string;
  },
): Promise<{ ok: boolean; targetId?: string; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Forbidden" };

  const input: NutritionDraftInput = {
    clientId,
    coachId: guard.dbUser.id,
    effectiveDate: data.effectiveDate,
    heightInches: data.heightInches,
    weightLbs: data.weightLbs,
    ageYears: data.ageYears,
    biologicalSex: data.biologicalSex,
    activityLevel: data.activityLevel,
    goalType: data.goalType,
    calorieTarget: data.calorieTarget,
    proteinGrams: data.proteinGrams,
    fatGrams: data.fatGrams,
    carbGrams: data.carbGrams,
    adjustmentReason: data.adjustmentReason,
    coachNotes: data.coachNotes,
    internalNotes: data.internalNotes,
  };

  const result = await createDraft(input);
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}/nutrition`);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// UPDATE DRAFT
//
// Updates an existing draft target. Only drafts are mutable.
// ─────────────────────────────────────────────────────────────

export async function updateDraftAction(
  targetId: string,
  clientId: string,
  updates: NutritionDraftUpdate,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Forbidden" };

  const result = await updateDraft(targetId, clientId, guard.dbUser.id, updates);
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}/nutrition`);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// PUBLISH TARGET
//
// Explicit coach approval step. Archives current published target,
// promotes draft to published, creates nutrition_updated notification.
// ─────────────────────────────────────────────────────────────

export async function publishTargetAction(
  targetId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Forbidden" };

  const result = await publishTarget(targetId, guard.dbUser.id, clientId);
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}/nutrition`);
    revalidatePath(`/portal/nutrition`);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// ARCHIVE TARGET
//
// Archives a draft or published target without replacing it.
// ─────────────────────────────────────────────────────────────

export async function archiveTargetAction(
  targetId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Forbidden" };

  const result = await archiveTarget(targetId, clientId, guard.dbUser.id);
  if (result.ok) {
    revalidatePath(`/hq/clients/${clientId}/nutrition`);
    revalidatePath(`/portal/nutrition`);
  }
  return result;
}
