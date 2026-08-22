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
  claimGenerationQuota,
  releaseGenerationQuotaClaim,
  GENERATION_QUOTA_LIMIT,
} from "@/lib/db/program-generation-service";
import { generateProgramShell, generateProgramWeek, resolveTimeoutMs, WEEK_DEFAULT_TIMEOUT_MS } from "./provider";
import { summarizeWeekForPrompt } from "./prompt";
import { resolveProgramDraftExercises } from "./exercise-resolution";
import { validateGeneratedDraft, catalogGapFindings, type ValidationFinding } from "./validation";
import { buildExerciseCandidateSet, verifyWeekAgainstCandidates } from "./exercise-candidates";
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
// extraWarnings is how catalog coverage gaps (computed once per
// generation attempt, before any shell/week call) ride along into the
// same findings the coach already sees and acknowledges — see
// runStagedGeneration()'s finalization step.
export async function runAndSaveValidation(
  draftId: string,
  draft: GeneratedProgramDraft,
  brief: ProgramGenerationBrief,
  coachId: string,
  extraWarnings: ValidationFinding[] = [],
): Promise<void> {
  try {
    const result = await validateGeneratedDraft(draft, brief, coachId);
    const merged =
      extraWarnings.length > 0
        ? {
            ...result,
            warnings: [...result.warnings, ...extraWarnings],
            status: result.status === "blocked" ? ("blocked" as const) : ("warnings" as const),
          }
        : result;
    await saveValidationResult(draftId, merged);
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

// P0 incident (production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a,
// "Maddie"): fixing the PER-CALL timeout (see provider.ts's
// WEEK_DEFAULT_TIMEOUT_MS) is necessary but not sufficient on its own.
// This function makes ONE generateProgramShell()/generateProgramWeek()
// call per remaining week, sequentially, inside a SINGLE Server Action
// invocation (generateProgramDraftAction / resumeGenerationAction) —
// i.e. a single Vercel Function invocation. Vercel Hobby's function
// duration is a HARD 300s ceiling: default and maximum are the same
// number on this plan (verified against Vercel's own docs, not
// assumed) — there is no code-level maxDuration change that raises it.
// An 8-week program (the GenerateBriefForm.tsx default) is 1 shell +
// 8 week calls = 9 sequential provider calls; even at realistic
// (non-worst-case) per-call latency, that cumulative total can
// approach or exceed 300s regardless of how generously any single
// call is timed. Left unbounded, the platform would eventually just
// kill the function mid-week with NO chance for this code's own
// failRun()/setDraftStatus() cleanup to run — a silently stuck
// "running" draft and a claimed quota unit for zero progress, a worse
// failure mode than today's explicit, catchable timeout error.
//
// Fix: budget the whole invocation's wall-clock time and stop
// BEFORE starting a week call that risks blowing the ceiling, leaving
// a clean, resumable "failed" state (identical shape to a genuine
// failure — resumeGenerationAction's existing atomic-claim, skip-
// completed-weeks resume logic handles this for free, no new state
// machine). 240s leaves ~60s margin under Hobby's 300s ceiling for
// the quota claim, exercise-candidate-set build, per-week DB writes,
// and finalization (assembly + exercise resolution + validation)
// that all still need to run after the last week call returns.
//
// PROGRAM_GENERATOR_TIME_BUDGET_MS overrides this default — same
// ops-escape-hatch pattern as PROGRAM_GENERATOR_TIMEOUT_MS (provider.ts),
// and what lets a test deterministically force the pause branch
// without mocking Date.now() or waiting on a real clock.
const DEFAULT_GENERATION_TIME_BUDGET_MS = 240_000;

export function resolveGenerationTimeBudgetMs(): number {
  const raw = process.env.PROGRAM_GENERATOR_TIME_BUDGET_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GENERATION_TIME_BUDGET_MS;
}

export async function runStagedGeneration(params: StagedGenerationParams): Promise<StagedGenerationResult> {
  const runStartedAt = Date.now();
  const weekTimeoutMs = resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS);
  const timeBudgetMs = resolveGenerationTimeBudgetMs();

  const run = await startRun({
    draftId: params.draftId,
    scope: "full_draft",
    requestedByUserId: params.coachId,
    totalWeeks: params.existingShell?.totalWeeks ?? params.brief.weeks,
    completedWeeks: params.existingCompletedWeeks.size,
  });

  // Computed once per attempt (fresh or resume — deterministic given
  // the same brief/coach/library state, so recomputing it on a resume
  // is safe and never itself a reason to regenerate an already-
  // completed week) and reused across shell planning, every week call,
  // and — separately, in actions.ts — regenerate-day. See
  // exercise-candidates.ts for the selection algorithm and its bounds.
  const candidateSet = await buildExerciseCandidateSet(params.brief, params.coachId);

  // Fail fast on total candidate exhaustion — an empty candidate set
  // means the model has literally nothing valid to select from for
  // every muscle group and warmup/cardio category (this brief's
  // equipment/experience-level combination excludes the entire visible
  // library). Continuing would still spend a shell call plus one call
  // per week only to produce a draft where every single prescription is
  // an unresolved/rejected blocker — wasted latency and provider cost
  // for a result that was never going to be usable. The per-category
  // gaps (candidateSet.gaps) already handle the common "some categories
  // are thin" case as a warning; this is the total-exhaustion case,
  // which gets a clear, actionable failure instead.
  if (candidateSet.candidates.length === 0) {
    const failureReason =
      "No exercises in the Exercise Library are compatible with this brief's equipment and experience-level combination. Adjust the brief (equipment access, experience level, or muscle priorities) or add matching exercises to the library before generating.";
    await failRun(run.id, failureReason);
    await setDraftStatus(params.draftId, "failed", { failureReason });
    return { ok: false, error: failureReason };
  }

  // ── Rate-limit gate — only consulted when this attempt will actually
  // reach the model. A fresh generation always will (no existingShell).
  // A resume only will if there's still a shell to generate, or at least
  // one week from startFromWeek through totalWeeks left uncompleted —
  // a resume whose shell and every week already completed (only
  // finalization failed last time) makes zero provider calls below and
  // must not consume the coach's quota for retrying it. See
  // claimGenerationQuota's own doc comment in program-generation-
  // service.ts for the full reasoning and chosen limit.
  const totalWeeksForRun = params.existingShell?.totalWeeks ?? params.brief.weeks;
  const willInvokeModel = !params.existingShell || params.startFromWeek <= totalWeeksForRun;

  // claimId is undefined when this attempt makes zero model calls
  // (the "resume whose shell + every week already completed" case) —
  // there is nothing to release in that case, by construction.
  let claimId: string | undefined;
  if (willInvokeModel) {
    const claim = await claimGenerationQuota(params.coachId, params.draftId, "full_draft");
    if (!claim.ok) {
      const minutes = Math.max(1, Math.ceil(claim.retryAfterMs / 60_000));
      const failureReason = `You've reached the AI generation limit (${GENERATION_QUOTA_LIMIT} per hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
      await failRun(run.id, "Coach AI generation quota exceeded.");
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    claimId = claim.claimId;
  }

  let lastProvider = "vercel-ai-gateway";
  let lastModel = "unknown";

  // ── Step 1: shell (skipped on a resume that already has one) ──
  let shell = params.existingShell;
  if (!shell) {
    await updateRunProgress(run.id, { currentWeek: 0 });
    const shellOutcome = await generateProgramShell(params.brief, params.clientContext, candidateSet);
    if (!shellOutcome.ok) {
      // See ClaimQuotaResult's comment in program-generation-service.ts:
      // a definitive timeout produced zero usable output — the coach's
      // quota shouldn't be charged for infrastructure aborting its own
      // call. Every other errorCode still counts.
      if (shellOutcome.errorCode === "timeout" && claimId) await releaseGenerationQuotaClaim(claimId);
      await failRun(run.id, shellOutcome.errorMessage, { provider: shellOutcome.provider, model: shellOutcome.model });
      const failureReason = "Generation failed while designing the program structure. You can retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    if (shellOutcome.shell.totalWeeks !== params.brief.weeks) {
      await failRun(
        run.id,
        `Shell totalWeeks (${shellOutcome.shell.totalWeeks}) did not match the brief's requested weeks (${params.brief.weeks}).`,
        { provider: shellOutcome.provider, model: shellOutcome.model },
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
    // Time-budget guard (see GENERATION_TIME_BUDGET_MS's comment above):
    // stop BEFORE starting a week call that risks running past Vercel
    // Hobby's hard 300s function-duration ceiling, rather than letting
    // the platform kill this invocation mid-call with no chance to
    // persist a clean, resumable state. Completed weeks so far are
    // already saved; this is a deliberate, safe pause, not an error —
    // it reuses the exact same failed+resumable shape a real failure
    // would, so resumeGenerationAction's existing skip-completed-weeks
    // logic picks up exactly here with zero new state machinery.
    if (Date.now() - runStartedAt + weekTimeoutMs > timeBudgetMs) {
      const failureReason =
        weekNumber === params.startFromWeek
          ? "Generation paused to stay within safe processing limits before starting. Click Retry to continue."
          : `Generation paused after completing Week ${weekNumber - 1} of ${shell.totalWeeks} to stay within safe processing limits. Completed weeks were saved — click Retry to continue.`;
      await failRun(run.id, "Time budget reached before starting the next week — safe to resume.");
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }

    await updateRunProgress(run.id, { currentWeek: weekNumber });

    const priorWeek = allWeeks.get(weekNumber - 1);
    const priorWeekSummary = priorWeek ? summarizeWeekForPrompt(priorWeek) : null;

    const weekOutcome = await generateProgramWeek({
      brief: params.brief,
      clientContext: params.clientContext,
      shell,
      weekNumber,
      priorWeekSummary,
      candidates: candidateSet.candidates,
    });

    if (!weekOutcome.ok) {
      if (weekOutcome.errorCode === "timeout" && claimId) await releaseGenerationQuotaClaim(claimId);
      await saveGenerationWeek(params.draftId, weekNumber, { status: "failed", errorMessage: weekOutcome.errorMessage });
      await failRun(run.id, weekOutcome.errorMessage, { provider: weekOutcome.provider, model: weekOutcome.model });
      const failureReason = `Generation failed while creating Week ${weekNumber} of ${shell.totalWeeks}. Completed weeks were saved — you can retry to continue from here.`;
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }

    // Never trust a returned exerciseId merely because the model
    // supplied one — verify every prescription's id against the exact
    // candidate set offered for this call before persisting. Anything
    // that doesn't verify has its id stripped back to name-only, which
    // exercise-resolution.ts's fallback resolver covers at assembly time.
    const { result: verifiedWeek } = verifyWeekAgainstCandidates(weekOutcome.week, candidateSet.candidates);

    await saveGenerationWeek(params.draftId, weekNumber, { status: "completed", weekJson: verifiedWeek });
    allWeeks.set(weekNumber, verifiedWeek);
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
  const resolvedDraft = await resolveProgramDraftExercises(assembledModelDraft, params.coachId);
  const reparsed = parseGeneratedProgramDraft(resolvedDraft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error, { provider: lastProvider, model: lastModel });
    const failureReason = "Generation completed but the assembled draft failed validation. Please retry.";
    await setDraftStatus(params.draftId, "failed", { failureReason });
    return { ok: false, error: failureReason };
  }

  await completeRun(run.id, { provider: lastProvider, model: lastModel });
  await saveDraftContent(params.draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(
    params.draftId,
    reparsed.data,
    params.brief,
    params.coachId,
    catalogGapFindings(candidateSet.gaps),
  );

  return { ok: true };
}
