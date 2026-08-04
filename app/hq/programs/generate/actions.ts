"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Server Actions
//
// This is the entry point for the entire feature's mutating surface —
// generate, view is a plain page-level read (see page.tsx), every edit
// operation, discard, rerun validation, acknowledge warnings, approve.
//
// Every action here follows the same shape already established by
// app/hq/check-ins/[checkInId]/actions.ts: requireCoachOrAdmin() guard,
// then an object-level ownership check, then delegate to the service/
// domain layer, then revalidatePath. Nothing here talks to the database
// directly — that's lib/db/program-generation-service.ts's job — and
// nothing here calls a model provider directly — that's
// lib/program-generator/provider.ts's job, reached only through
// generateProgramDraft()/regenerateDayDraft().
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireCoachOrAdmin, assertCoachOwnsClient, resolveTenantScope } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import { getDb } from "@/lib/db/client";
import { clientProfiles } from "@/lib/db/schema";
import { getExerciseById } from "@/lib/db/exercise-service";
import {
  createDraft,
  getOwnedDraft,
  saveDraftContent,
  saveValidationResult,
  saveValidationFailure,
  acknowledgeWarnings,
  discardDraft as discardDraftRow,
  setDraftStatus,
  startRun,
  completeRun,
  failRun,
  recordEditEvent,
} from "@/lib/db/program-generation-service";
import {
  parseProgramGenerationBrief,
  parseGeneratedProgramDraft,
  PrescriptionEditPatchSchema,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
} from "@/lib/program-generator/contracts";
import { generateProgramDraft, regenerateDayDraft } from "@/lib/program-generator/provider";
import { resolveProgramDraftExercises } from "@/lib/program-generator/exercise-resolution";
import { buildClientContextSummary } from "@/lib/program-generator/client-context";
import { validateGeneratedDraft } from "@/lib/program-generator/validation";
import { updatePrescription, replaceExercise, reorderExercises, moveWorkoutDay } from "@/lib/program-generator/edit-ops";
import { approveDraft } from "@/lib/program-generator/approval";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ─────────────────────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────────────────────

async function requireActor(): Promise<
  { ok: true; coachId: string; scope: { coachId: string | null }; dbUser: PublicUser } | { ok: false; error: string }
> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };
  return { ok: true, coachId: guard.dbUser.id, scope: resolveTenantScope(guard.dbUser), dbUser: guard.dbUser };
}

async function requireOwnedDraft(draftId: string) {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false as const, error: actor.error };
  const access = await getOwnedDraft(draftId, actor.scope);
  if (!access.ok) return { ok: false as const, error: access.error === "not_found" ? "Draft not found." : "You do not have access to this draft." };
  return { ok: true as const, coachId: actor.coachId, scope: actor.scope, draft: access.draft };
}

function revalidateDraft(draftId: string) {
  revalidatePath(`/hq/programs/generate/${draftId}`);
  revalidatePath("/hq/programs/generate");
  revalidatePath("/hq/programs");
}

// ─────────────────────────────────────────────────────────────
// VALIDATION HELPER — shared by generation and "rerun validation"
// ─────────────────────────────────────────────────────────────

async function runAndSaveValidation(
  draftId: string,
  draft: GeneratedProgramDraft,
  brief: ProgramGenerationBrief,
  coachId: string,
): Promise<void> {
  try {
    const result = await validateGeneratedDraft(draft, brief, coachId);
    await saveValidationResult(draftId, result);
  } catch (err) {
    await saveValidationFailure(draftId, err instanceof Error ? err.message : "Validation failed unexpectedly.");
  }
}

// ─────────────────────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────────────────────

export async function generateProgramDraftAction(input: {
  clientId: string | null;
  brief: unknown;
}): Promise<ActionResult<{ draftId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  if (input.clientId) {
    const ownership = await assertCoachOwnsClient(actor.dbUser, input.clientId);
    if (!ownership.ok) return { ok: false, error: ownership.error };
  }

  const parsedBrief = parseProgramGenerationBrief(input.brief);
  if (!parsedBrief.ok) return { ok: false, error: parsedBrief.error };

  const draftRow = await createDraft({
    coachId: actor.coachId,
    clientId: input.clientId,
    brief: parsedBrief.data,
  });

  await setDraftStatus(draftRow.id, "running");
  const run = await startRun({ draftId: draftRow.id, scope: "full_draft", requestedByUserId: actor.coachId });

  let clientDisplayName: string | null = null;
  if (input.clientId) {
    const db = getDb();
    const rows = await db
      .select({ fullName: clientProfiles.fullName })
      .from(clientProfiles)
      .where(eq(clientProfiles.userId, input.clientId))
      .limit(1);
    clientDisplayName = rows[0]?.fullName ?? null;
  }

  const clientContext = input.clientId
    ? await buildClientContextSummary(input.clientId, clientDisplayName)
    : null;

  const outcome = await generateProgramDraft(parsedBrief.data, clientContext);

  if (!outcome.ok) {
    await failRun(run.id, outcome.errorMessage);
    await setDraftStatus(draftRow.id, "failed", { failureReason: outcome.errorMessage });
    revalidateDraft(draftRow.id);
    return { ok: false, error: outcome.errorMessage, data: { draftId: draftRow.id } };
  }

  // Provider returns unresolved model output (exerciseName only, no
  // exerciseId — see contracts.ts's Model*Schema tree). Resolution
  // against the real Exercise Library happens exactly once, here, in
  // the orchestration layer — never inside provider.ts.
  const resolvedDraft = await resolveProgramDraftExercises(outcome.draft);
  const reparsed = parseGeneratedProgramDraft(resolvedDraft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error);
    await setDraftStatus(draftRow.id, "failed", { failureReason: reparsed.error });
    revalidateDraft(draftRow.id);
    return { ok: false, error: reparsed.error, data: { draftId: draftRow.id } };
  }

  await completeRun(run.id, { provider: outcome.provider, model: outcome.model });
  await saveDraftContent(draftRow.id, reparsed.data, "ready_for_review");
  await runAndSaveValidation(draftRow.id, reparsed.data, parsedBrief.data, actor.coachId);

  revalidateDraft(draftRow.id);
  return { ok: true, data: { draftId: draftRow.id } };
}

// ─────────────────────────────────────────────────────────────
// EDIT OPERATIONS
// ─────────────────────────────────────────────────────────────

async function loadEditableDraft(draftId: string) {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsedDraft = parseGeneratedProgramDraft(auth.draft.draftJson);
  if (!parsedDraft.ok) return { ok: false as const, error: "Draft content is not currently valid." };
  const parsedBrief = parseProgramGenerationBrief(auth.draft.briefJson);
  if (!parsedBrief.ok) return { ok: false as const, error: "Draft brief is not currently valid." };

  return { ok: true as const, coachId: auth.coachId, draftRow: auth.draft, draft: parsedDraft.data, brief: parsedBrief.data };
}

async function applyEditAndSave(
  draftId: string,
  coachId: string,
  brief: ProgramGenerationBrief,
  editResult: { ok: true; draft: GeneratedProgramDraft; before: unknown; after: unknown } | { ok: false; error: string },
  eventMeta: { action: Parameters<typeof recordEditEvent>[0]["action"]; entityType: string; entityId: string | null; summary: string },
): Promise<ActionResult> {
  if (!editResult.ok) return { ok: false, error: editResult.error };

  const reparsed = parseGeneratedProgramDraft(editResult.draft);
  if (!reparsed.ok) return { ok: false, error: `Edit produced an invalid draft: ${reparsed.error}` };

  await saveDraftContent(draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(draftId, reparsed.data, brief, coachId);
  await recordEditEvent({
    draftId,
    actorUserId: coachId,
    action: eventMeta.action,
    entityType: eventMeta.entityType,
    entityId: eventMeta.entityId,
    summary: eventMeta.summary,
    beforeJson: editResult.before,
    afterJson: editResult.after,
  });

  revalidateDraft(draftId);
  return { ok: true };
}

export async function updatePrescriptionAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  prescriptionId: string;
  patch: unknown;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const parsedPatch = PrescriptionEditPatchSchema.safeParse(params.patch);
  if (!parsedPatch.success) return { ok: false, error: "Invalid prescription edit." };

  const result = updatePrescription(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    prescriptionId: params.prescriptionId,
    patch: parsedPatch.data,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "prescription_updated",
    entityType: "prescription",
    entityId: params.prescriptionId,
    summary: "Coach edited a prescription.",
  });
}

export async function replaceExerciseAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  prescriptionId: string;
  exerciseId: string;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // Never trust a client-supplied exercise name — always re-derive it
  // from the real library. If the id doesn't resolve, reject here
  // rather than letting an invented id slip into the draft (locked
  // rule #4/#5); full validation would also catch it, but this gives
  // an immediate, specific error instead of a generic blocker later.
  const exercise = await getExerciseById(params.exerciseId);
  if (!exercise) return { ok: false, error: "That exercise does not exist in the library." };

  const result = replaceExercise(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    prescriptionId: params.prescriptionId,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_replaced",
    entityType: "prescription",
    entityId: params.prescriptionId,
    summary: `Coach replaced an exercise with "${exercise.name}".`,
  });
}

export async function reorderExercisesAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  orderedPrescriptionIds: string[];
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = reorderExercises(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    orderedPrescriptionIds: params.orderedPrescriptionIds,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_reordered",
    entityType: "section",
    entityId: params.sectionId,
    summary: "Coach reordered exercises within a section.",
  });
}

export async function moveWorkoutDayAction(params: {
  draftId: string;
  weekId: string;
  dayId: string;
  newDayOfWeek: number;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = moveWorkoutDay(loaded.draft, {
    weekId: params.weekId,
    dayId: params.dayId,
    newDayOfWeek: params.newDayOfWeek,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "day_moved",
    entityType: "day",
    entityId: params.dayId,
    summary: `Coach moved a training day to day-of-week ${params.newDayOfWeek}.`,
  });
}

export async function regenerateDayAction(params: {
  draftId: string;
  dayId: string;
  instruction?: string;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  let clientDisplayName: string | null = null;
  if (loaded.draftRow.clientId) {
    const db = getDb();
    const rows = await db
      .select({ fullName: clientProfiles.fullName })
      .from(clientProfiles)
      .where(eq(clientProfiles.userId, loaded.draftRow.clientId))
      .limit(1);
    clientDisplayName = rows[0]?.fullName ?? null;
  }
  const clientContext = loaded.draftRow.clientId
    ? await buildClientContextSummary(loaded.draftRow.clientId, clientDisplayName)
    : null;

  const run = await startRun({
    draftId: params.draftId,
    scope: "single_day",
    dayRef: params.dayId,
    requestedByUserId: loaded.coachId,
  });

  const outcome = await regenerateDayDraft(loaded.brief, clientContext, loaded.draft, params.dayId, params.instruction);

  if (!outcome.ok) {
    await failRun(run.id, outcome.errorMessage);
    return { ok: false, error: outcome.errorMessage };
  }

  // Same resolution path as full generation (requirement: regenerate-day
  // must use the same resolver) — the provider's model-output draft
  // still has no exerciseId anywhere, even for days it echoed back
  // unchanged, so every prescription is resolved again here. Exact-name
  // matches are deterministic, so unchanged exercises reliably resolve
  // to the same real id they already had.
  const resolvedDraft = await resolveProgramDraftExercises(outcome.draft);
  const reparsed = parseGeneratedProgramDraft(resolvedDraft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error);
    return { ok: false, error: `Regeneration produced an invalid draft: ${reparsed.error}` };
  }

  await completeRun(run.id, { provider: outcome.provider, model: outcome.model });
  await saveDraftContent(params.draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(params.draftId, reparsed.data, loaded.brief, loaded.coachId);
  await recordEditEvent({
    draftId: params.draftId,
    actorUserId: loaded.coachId,
    action: "day_regenerated",
    entityType: "day",
    entityId: params.dayId,
    summary: params.instruction ? `Coach regenerated a day: "${params.instruction}"` : "Coach regenerated a day.",
  });

  revalidateDraft(params.draftId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────

export async function rerunValidationAction(draftId: string): Promise<ActionResult> {
  const loaded = await loadEditableDraft(draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  await runAndSaveValidation(draftId, loaded.draft, loaded.brief, loaded.coachId);
  revalidateDraft(draftId);
  return { ok: true };
}

export async function acknowledgeWarningsAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await acknowledgeWarnings(draftId);
  revalidateDraft(draftId);
  return { ok: true };
}

export async function discardDraftAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await discardDraftRow(draftId);
  revalidateDraft(draftId);
  return { ok: true };
}

export async function approveDraftAction(draftId: string): Promise<ActionResult<{ programTemplateId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const outcome = await approveDraft(draftId, actor.scope, actor.coachId);
  if (!outcome.ok) return { ok: false, error: outcome.errorMessage };

  revalidateDraft(draftId);
  revalidatePath(`/hq/programs/${outcome.programTemplateId}`);
  return { ok: true, data: { programTemplateId: outcome.programTemplateId } };
}
