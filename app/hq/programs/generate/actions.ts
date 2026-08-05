"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Server Actions
//
// This is the entry point for the entire feature's mutating surface —
// generate, resume/retry, view is a plain page-level read (see
// page.tsx), every edit operation, discard, rerun validation,
// acknowledge warnings, approve.
//
// Every action here follows the same shape already established by
// app/hq/check-ins/[checkInId]/actions.ts: requireCoachOrAdmin() guard,
// then an object-level ownership check, then delegate to the service/
// domain layer, then revalidatePath. Nothing here talks to the database
// directly — that's lib/db/program-generation-service.ts's job — and
// nothing here calls a model provider directly — that's
// lib/program-generator/provider.ts's job, reached only through its
// exported generate*()/regenerateDayDraft() functions.
//
// Staged generation orchestration (runStagedGeneration, below) is the
// composition point the diagnosed 180s-timeout fix required: it drives
// one generateProgramShell() call followed by one generateProgramWeek()
// call per week, persisting each week as it completes, and only calls
// resolveProgramDraftExercises()/validateGeneratedDraft() once, after
// every week has succeeded. Both generateProgramDraftAction() (fresh)
// and resumeGenerationAction() (retry after a failed week) call the
// same function — a resume just supplies the weeks already completed
// and the first weekNumber still missing, so completed weeks are never
// regenerated.
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
  acknowledgeWarnings,
  acknowledgeFindingKeys,
  discardDraft as discardDraftRow,
  setDraftStatus,
  listGenerationWeeks,
  startRun,
  completeRun,
  failRun,
  recordEditEvent,
} from "@/lib/db/program-generation-service";
import {
  parseProgramGenerationBrief,
  parseGeneratedProgramDraft,
  parseProgramShell,
  ModelWeekDraftSchema,
  PrescriptionEditPatchSchema,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
  type ProgramShell,
  type ModelWeekDraft,
} from "@/lib/program-generator/contracts";
import { regenerateDayDraft } from "@/lib/program-generator/provider";
import { resolveProgramDraftExercises, normalizeExerciseName } from "@/lib/program-generator/exercise-resolution";
import { buildExerciseCandidateSet, verifyProgramDraftAgainstCandidates } from "@/lib/program-generator/exercise-candidates";
import { catalogGapFindings } from "@/lib/program-generator/validation";
import { buildClientContextSummary, type ClientContextSummary } from "@/lib/program-generator/client-context";
import {
  updatePrescription,
  replaceExercise,
  replaceExerciseByName,
  reorderExercises,
  moveWorkoutDay,
} from "@/lib/program-generator/edit-ops";
import { approveDraft } from "@/lib/program-generator/approval";
import { runStagedGeneration, runAndSaveValidation } from "@/lib/program-generator/staged-generation";
import type { DraftValidationResult } from "@/lib/program-generator/validation";

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

async function resolveClientContext(clientId: string | null): Promise<ClientContextSummary | null> {
  if (!clientId) return null;
  const db = getDb();
  const rows = await db
    .select({ fullName: clientProfiles.fullName })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, clientId))
    .limit(1);
  return buildClientContextSummary(clientId, rows[0]?.fullName ?? null);
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

  const clientContext = await resolveClientContext(input.clientId);

  const result = await runStagedGeneration({
    draftId: draftRow.id,
    coachId: actor.coachId,
    brief: parsedBrief.data,
    clientContext,
    existingShell: null,
    startFromWeek: 1,
    existingCompletedWeeks: new Map(),
  });

  revalidateDraft(draftRow.id);
  return result.ok
    ? { ok: true, data: { draftId: draftRow.id } }
    : { ok: false, error: result.error, data: { draftId: draftRow.id } };
}

// Resumes a failed staged generation: never regenerates a week already
// persisted as 'completed', including the shell if it already
// completed. Only reachable on a draft currently in status='failed'.
export async function resumeGenerationAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (auth.draft.status !== "failed") {
    return { ok: false, error: "Only a failed draft can be retried." };
  }

  const parsedBrief = parseProgramGenerationBrief(auth.draft.briefJson);
  if (!parsedBrief.ok) return { ok: false, error: "Draft brief is not currently valid." };

  let existingShell: ProgramShell | null = null;
  if (auth.draft.shellJson) {
    const parsedShell = parseProgramShell(auth.draft.shellJson);
    if (parsedShell.ok) existingShell = parsedShell.data;
  }

  const existingWeekRows = await listGenerationWeeks(draftId);
  const existingCompletedWeeks = new Map<number, ModelWeekDraft>();
  for (const row of existingWeekRows) {
    if (row.status !== "completed" || !row.weekJson) continue;
    const parsedWeek = ModelWeekDraftSchema.safeParse(row.weekJson);
    if (parsedWeek.success) existingCompletedWeeks.set(row.weekNumber, parsedWeek.data);
  }

  const totalWeeks = existingShell?.totalWeeks ?? parsedBrief.data.weeks;
  let startFromWeek = 1;
  while (startFromWeek <= totalWeeks && existingCompletedWeeks.has(startFromWeek)) {
    startFromWeek++;
  }

  await setDraftStatus(draftId, "running");
  const clientContext = await resolveClientContext(auth.draft.clientId);

  const result = await runStagedGeneration({
    draftId,
    coachId: auth.coachId,
    brief: parsedBrief.data,
    clientContext,
    existingShell,
    startFromWeek,
    existingCompletedWeeks,
  });

  revalidateDraft(draftId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ─────────────────────────────────────────────────────────────
// EDIT OPERATIONS
// ─────────────────────────────────────────────────────────────

async function loadEditableDraft(draftId: string) {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  // Locked rule (review triage requirement #2): an approved draft has
  // already become a real Program/Blueprint — editing draftJson after
  // that point would silently diverge from what was actually created. A
  // discarded draft is deliberately dead. Neither should accept edits,
  // including the bulk replace-all path below, which is exactly the
  // scenario that surfaced this gap wasn't previously enforced anywhere.
  if (auth.draft.status === "approved" || auth.draft.status === "discarded") {
    return { ok: false as const, error: `This draft is ${auth.draft.status} and can no longer be edited.` };
  }

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
  if (exercise.status !== "active") {
    return { ok: false, error: "That exercise is not currently active and cannot be used." };
  }

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

// Server-authoritative "Replace All Occurrences" — review triage
// requirement #2. Reuses the exact same loadEditableDraft (ownership +
// approved/discarded status gate) and applyEditAndSave (save + rerun
// validation + one audit event) pipeline every other edit action goes
// through; the only new piece is the pure edit-op below, which walks
// every week/day/section instead of a single addressed prescription.
//
// normalizedName must be exercise-resolution.ts's own
// normalizeExerciseName() output — the caller (the review triage UI)
// gets this directly from the grouped finding it's acting on, never
// free text, so there's no risk of it drifting from how prescriptions
// were actually grouped.
export async function replaceAllOccurrencesAction(params: {
  draftId: string;
  normalizedName: string;
  exerciseId: string;
}): Promise<ActionResult<{ replacedCount: number }>> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const exercise = await getExerciseById(params.exerciseId);
  if (!exercise) return { ok: false, error: "That exercise does not exist in the library." };
  if (exercise.status !== "active") {
    return { ok: false, error: "That exercise is not currently active and cannot be used." };
  }

  // Re-normalize server-side rather than trusting the client's string
  // verbatim — cheap, and keeps this action's own authority over what
  // "the same name" means independent of whatever the caller sent.
  const normalizedName = normalizeExerciseName(params.normalizedName);

  const result = replaceExerciseByName(loaded.draft, {
    normalizedName,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const replacedCount = (result.after as { replacedCount: number }).replacedCount;

  const saveResult = await applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_replaced",
    entityType: "bulk_exercise_replace",
    entityId: normalizedName,
    summary: `Coach replaced all ${replacedCount} occurrence(s) of an unresolved exercise with "${exercise.name}".`,
  });

  if (!saveResult.ok) return { ok: false, error: saveResult.error };
  return { ok: true, data: { replacedCount } };
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

  const clientContext = await resolveClientContext(loaded.draftRow.clientId);

  const run = await startRun({
    draftId: params.draftId,
    scope: "single_day",
    dayRef: params.dayId,
    requestedByUserId: loaded.coachId,
  });

  // Same curated-catalog rules as staged generation (requirement:
  // regenerate-day must use the same catalog constraints) — recomputed
  // here since regenerate-day is a standalone action, not part of a
  // runStagedGeneration() call.
  const candidateSet = await buildExerciseCandidateSet(loaded.brief, loaded.coachId);

  const outcome = await regenerateDayDraft(
    loaded.brief,
    clientContext,
    loaded.draft,
    params.dayId,
    params.instruction,
    candidateSet.candidates,
  );

  if (!outcome.ok) {
    await failRun(run.id, outcome.errorMessage);
    return { ok: false, error: "Regeneration failed. Please try again." };
  }

  // Never trust a returned exerciseId merely because the model supplied
  // one — verify against the exact candidate set offered for this call
  // before it's persisted (same rule as every week in staged generation).
  const { result: verifiedDraft } = verifyProgramDraftAgainstCandidates(outcome.draft, candidateSet.candidates);

  // Same resolution path as full generation — anything that didn't
  // verify above (including days echoed back unchanged, which may not
  // have carried a verifiable id at all) falls back to name-based
  // resolution here, exactly as staged generation's assembly step does.
  const resolvedDraft = await resolveProgramDraftExercises(verifiedDraft);
  const reparsed = parseGeneratedProgramDraft(resolvedDraft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error);
    return { ok: false, error: `Regeneration produced an invalid draft: ${reparsed.error}` };
  }

  await completeRun(run.id, { provider: outcome.provider, model: outcome.model });
  await saveDraftContent(params.draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(
    params.draftId,
    reparsed.data,
    loaded.brief,
    loaded.coachId,
    catalogGapFindings(candidateSet.gaps),
  );
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

// Review triage requirement #6 — one action, three granularities, all
// driven by which keys the caller passes:
//   - one occurrence:      [occurrenceAckKey(findingId)]
//   - one grouped issue:   [groupAckKey(groupKey)]
//   - all visible warnings: groupAckKey(...) for every current warning group
// The UI always derives these keys from the SAME grouped structure it
// rendered (lib/program-generator/findings-grouping.ts), never free
// text — but this action still re-derives "is this actually a blocker"
// server-side from the draft's own current insightsJson rather than
// trusting the caller's classification of what it's acknowledging.
export async function acknowledgeFindingsAction(
  draftId: string,
  keys: string[],
): Promise<ActionResult<{ fullyAcknowledged: boolean }>> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (auth.draft.status === "approved" || auth.draft.status === "discarded") {
    return { ok: false, error: `This draft is ${auth.draft.status} and can no longer be edited.` };
  }
  if (keys.length === 0) return { ok: false, error: "No findings selected to acknowledge." };

  const insights = auth.draft.insightsJson as DraftValidationResult | null;
  if (!insights) return { ok: false, error: "This draft has not been validated yet." };

  const result = await acknowledgeFindingKeys(draftId, keys, insights);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateDraft(draftId);
  return { ok: true, data: { fullyAcknowledged: result.fullyAcknowledged } };
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
