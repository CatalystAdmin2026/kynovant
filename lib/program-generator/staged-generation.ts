// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Staged Generation Orchestration
//
// SERVER-ONLY, plain module (no "use server") — unlike
// app/hq/programs/generate/actions.ts, this file is never a Server
// Action surface. It has no auth/ownership checks of its own; every
// caller (generateProgramDraftAction, resumeGenerationAction) is
// responsible for calling requireCoachOrAdmin()/getOwnedDraft() BEFORE
// reaching runStagedGeneration() — the same "auth in actions.ts,
// transaction/business logic in a plain module" split already used by
// approval.ts. Kept separate from actions.ts specifically so this
// orchestration logic is directly callable (and testable) without
// Next.js's request-scoped cookies()/headers(), which "use server"
// Server Actions require and a plain vitest process cannot provide.
//
// Drives: one generateProgramShell() call, then one generateProgramWeek()
// call per week (persisting each as it completes), then assembly +
// exercise resolution + validation — see runStagedGeneration()'s own
// comments for the per-step detail. Never asks the model for an entire
// multi-week Program in a single generateObject() call.
// ─────────────────────────────────────────────────────────────

import "server-only";
import {
  saveProgramShell,
  saveGenerationWeek,
  saveDraftContent,
  saveValidationResult,
  saveValidationFailure,
  setDraftStatus,
  startRun,
  updateRunProgress,
  completeRun,
  failRun,
} from "@/lib/db/program-generation-service";
import { generateProgramShell, generateProgramWeek } from "./provider";
import { summarizeWeekForPrompt } from "./prompt";
import { resolveProgramDraftExercises } from "./exercise-resolution";
import { validateGeneratedDraft } from "./validation";
import {
  parseGeneratedProgramDraft,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
  type ProgramShell,
  type ModelWeekDraft,
  type ModelProgramDraft,
} from "./contracts";
import type { ClientContextSummary } from "./client-context";

// Shared by every code path that needs "validate the current draft
// content and persist the result, without letting an unexpected
// validation-layer exception surface as an unhandled action failure."
export async function runAndSaveValidation(
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

export interface StagedGenerationParams {
  draftId: string;
  coachId: string;
  brief: ProgramGenerationBrief;
  clientContext: ClientContextSummary | null;
  // Non-null on a resume that already has a shell; null for a fresh
  // generation (or a resume whose shell call never completed).
  existingShell: ProgramShell | null;
  // 1 for fresh generation; the first weekNumber without a 'completed'
  // row for a resume.
  startFromWeek: number;
  // Already-'completed' weeks, keyed by weekNumber — never regenerated.
  existingCompletedWeeks: Map<number, ModelWeekDraft>;
}

export type StagedGenerationResult = { ok: true } | { ok: false; error: string };

export async function runStagedGeneration(params: StagedGenerationParams): Promise<StagedGenerationResult> {
  const run = await startRun({
    draftId: params.draftId,
    scope: "full_draft",
    requestedByUserId: params.coachId,
    totalWeeks: params.existingShell?.totalWeeks ?? params.brief.weeks,
    completedWeeks: params.existingCompletedWeeks.size,
  });

  let lastProvider = "vercel-ai-gateway";
  let lastModel = "unknown";

  // ── Step 1: shell (skipped on a resume that already has one) ──
  let shell = params.existingShell;
  if (!shell) {
    await updateRunProgress(run.id, { currentWeek: 0 });
    const shellOutcome = await generateProgramShell(params.brief, params.clientContext);
    if (!shellOutcome.ok) {
      await failRun(run.id, shellOutcome.errorMessage);
      const failureReason = "Generation failed while designing the program structure. You can retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    if (shellOutcome.shell.totalWeeks !== params.brief.weeks) {
      await failRun(
        run.id,
        `Shell totalWeeks (${shellOutcome.shell.totalWeeks}) did not match the brief's requested weeks (${params.brief.weeks}).`,
      );
      const failureReason = "Generation failed while designing the program structure. You can retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    shell = shellOutcome.shell;
    lastProvider = shellOutcome.provider;
    lastModel = shellOutcome.model;
    await saveProgramShell(params.draftId, shell);
  }

  // ── Step 2: one generateProgramWeek() call per remaining week ──
  const allWeeks = new Map(params.existingCompletedWeeks);

  for (let weekNumber = params.startFromWeek; weekNumber <= shell.totalWeeks; weekNumber++) {
    await updateRunProgress(run.id, { currentWeek: weekNumber });

    const priorWeek = allWeeks.get(weekNumber - 1);
    const priorWeekSummary = priorWeek ? summarizeWeekForPrompt(priorWeek) : null;

    const weekOutcome = await generateProgramWeek({
      brief: params.brief,
      clientContext: params.clientContext,
      shell,
      weekNumber,
      priorWeekSummary,
    });

    if (!weekOutcome.ok) {
      await saveGenerationWeek(params.draftId, weekNumber, { status: "failed", errorMessage: weekOutcome.errorMessage });
      await failRun(run.id, weekOutcome.errorMessage);
      const failureReason = `Generation failed while creating Week ${weekNumber} of ${shell.totalWeeks}. Completed weeks were saved — you can retry to continue from here.`;
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }

    await saveGenerationWeek(params.draftId, weekNumber, { status: "completed", weekJson: weekOutcome.week });
    allWeeks.set(weekNumber, weekOutcome.week);
    lastProvider = weekOutcome.provider;
    lastModel = weekOutcome.model;

    await updateRunProgress(run.id, { completedWeeks: allWeeks.size });
  }

  // ── Step 3: finalization — assemble, resolve, validate, then (only
  // now) transition to ready_for_review. ──
  const weeksInOrder: ModelWeekDraft[] = [];
  for (let weekNumber = 1; weekNumber <= shell.totalWeeks; weekNumber++) {
    const week = allWeeks.get(weekNumber);
    if (!week) {
      // Unreachable given the loop above always persists every week from
      // startFromWeek through shell.totalWeeks, and existingCompletedWeeks
      // covers 1..startFromWeek-1 by construction (callers only set
      // startFromWeek past a contiguous completed prefix) — kept as an
      // explicit, named failure rather than a silent gap if that
      // invariant is ever violated.
      await failRun(run.id, `Missing content for week ${weekNumber} during assembly.`);
      const failureReason = "Generation could not be assembled. Please retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    weeksInOrder.push(week);
  }

  const assembledModelDraft: ModelProgramDraft = {
    name: shell.title,
    description: shell.description,
    category: params.brief.goal,
    experienceLevel: params.brief.experienceLevel,
    defaultDurationWeeks: shell.totalWeeks,
    recommendedDaysPerWeek: params.brief.daysPerWeek,
    weeks: weeksInOrder,
  };

  // Provider returns unresolved model output (exerciseName only, no
  // exerciseId — see contracts.ts's Model*Schema tree). Resolution
  // against the real Exercise Library happens exactly once, here.
  const resolvedDraft = await resolveProgramDraftExercises(assembledModelDraft);
  const reparsed = parseGeneratedProgramDraft(resolvedDraft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error);
    const failureReason = "Generation completed but the assembled draft failed validation. Please retry.";
    await setDraftStatus(params.draftId, "failed", { failureReason });
    return { ok: false, error: failureReason };
  }

  await completeRun(run.id, { provider: lastProvider, model: lastModel });
  await saveDraftContent(params.draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(params.draftId, reparsed.data, params.brief, params.coachId);

  return { ok: true };
}
