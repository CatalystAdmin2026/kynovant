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
// P0 architecture change (production draft
// 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a, "Maddie"): a single
// generateObject() call asking for an entire multi-day week — up to 7
// days, up to 12 sections/day, up to 30 prescriptions/section, cross-
// referencing a ~150-item exercise catalog — proved too large and too
// slow for reliable serverless execution. Confirmed in production:
// doubling the per-call timeout from 45s to 90s did NOT fix it (the
// call still ran the full 90,007ms without completing) — proof the
// problem was call size/complexity, not the timeout number.
//
// Drives: one generateProgramShell() call, then — per week — one
// generateProgramDay() call per shell day (persisting each as it
// completes, resumable at the exact unfinished day), then once every
// day in a week is complete, a deterministic in-process assembly into
// the SAME ModelWeekDraft shape (and the SAME program_generation_weeks
// table) generateProgramWeek() used to write directly — every
// downstream consumer of that table (final assembly, exercise
// resolution, validation, approval) is unaffected by this change; only
// how a week's content gets produced changed, not how it's stored once
// complete. See runStagedGeneration()'s own comments for the per-step
// detail.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import {
  saveProgramShell,
  saveGenerationDay,
  listGenerationDaysForWeek,
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
import { generateProgramShell, generateProgramDay, resolveTimeoutMs, DAY_DEFAULT_TIMEOUT_MS } from "./provider";
import { logGenerationFailure, logProviderSuccess, logQuotaRelease } from "./observability";
import { summarizeDayForPrompt, summarizeWeekSoFarForPrompt } from "./prompt";
import { resolveProgramDraftExercises } from "./exercise-resolution";
import { validateGeneratedDraft, catalogGapFindings, type ValidationFinding } from "./validation";
import { validateWeekCrossDay } from "./week-cross-day-validation";
import {
  buildExerciseCandidateSet,
  narrowCandidatesForDay,
  verifyDayAgainstCandidates,
  type ExerciseCandidate,
} from "./exercise-candidates";
import {
  parseGeneratedProgramDraft,
  ModelWeekDraftSchema,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
  type ProgramShell,
  type ProgramShellDay,
  type ModelDayDraft,
  type ModelWeekDraft,
  type ModelProgramDraft,
} from "./contracts";
import type { ClientContextSummary } from "./client-context";

// P1 review finding on the day-level architecture: a single
// generateObject() call per WEEK let the model implicitly coordinate an
// entire week; day-level calls can each look individually reasonable
// and still combine into a bad week. Runs once per week, right after
// its days are assembled — see week-cross-day-validation.ts for the
// full design (deterministic, context-aware, always warnings, never a
// blocker, never an auto-regeneration).
export function assembleWeekFromDays(
  weekNumber: number,
  shellDays: ProgramShellDay[],
  completedDays: Map<number, ModelDayDraft>,
): { ok: true; week: ModelWeekDraft } | { ok: false; error: string } {
  const days: ModelDayDraft[] = [];
  for (let idx = 0; idx < shellDays.length; idx++) {
    const day = completedDays.get(idx + 1);
    if (!day) {
      // Was previously an uncached throw here, escaping BEFORE the
      // caller's own try/catch could ever run — a review finding on
      // the first version of this file: an unreachable-in-practice but
      // real escape hatch that, if ever hit, would crash the whole
      // Server Action invocation with no chance for failRun()/
      // setDraftStatus() to run, leaving the draft stuck "running"
      // forever. Returning a discriminated result instead means every
      // caller MUST handle this through the exact same normal failure
      // path as any other generation failure — there is no way to
      // reach this function's result without deciding what to do with
      // both branches.
      return { ok: false, error: `Missing content for week ${weekNumber} day ${idx + 1} during week assembly.` };
    }
    days.push(day);
  }

  const candidate: ModelWeekDraft = { id: randomUUID(), weekNumber, label: `Week ${weekNumber}`, days };
  // Deterministic week-level validation — the day-level schema already
  // validated each day individually (generateObject()'s own schema
  // enforcement); this re-checks the cross-day refinements (e.g. unique
  // dayOfWeek per week) that only exist once days are assembled
  // together. Should always pass given each day's dayOfWeek comes from
  // the shell's own already-unique days array, but verified rather than
  // assumed.
  const parsed = ModelWeekDraftSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: `Assembled week ${weekNumber} failed schema validation: ${parsed.error.message}` };
  }
  return { ok: true, week: parsed.data };
}

// Shared by every code path that needs "validate the current draft
// content and persist the result, without letting an unexpected
// validation-layer exception surface as an unhandled action failure."
// extraWarnings is how catalog coverage gaps (computed once per
// generation attempt, before any shell/day call) ride along into the
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
  // 1 for fresh generation, or for any week strictly after startFromWeek
  // (a week is only ever partially attempted if a prior invocation
  // stopped mid-week — that can only be true of the FIRST week this
  // invocation touches). The first 1-based day index, into
  // existingShell.days, without a 'completed' row for startFromWeek.
  startFromDay: number;
  // Already-'completed' weeks, keyed by weekNumber — never regenerated.
  // Pre-day-level drafts (any week finished before this architecture
  // change) still satisfy resume purely from this map, exactly as
  // before — day-level resume only matters for a week that was
  // started, but not finished, under the day-level path.
  existingCompletedWeeks: Map<number, ModelWeekDraft>;
  // Explicit, not inferred from existingShell/existingCompletedWeeks
  // being empty — a resume whose very first attempt failed during the
  // shell call itself would have BOTH empty too, which is
  // indistinguishable from a fresh generation by those fields alone.
  // Observability-only (isRetryOrResume on the structured failure log)
  // — never affects generation behavior itself.
  isResume: boolean;
}

export type StagedGenerationResult = { ok: true } | { ok: false; error: string };

// P0 incident (production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a,
// "Maddie"): even after the day-level architecture change above, this
// function still makes ONE generateProgramShell()/generateProgramDay()
// call per remaining unit of work, sequentially, inside a SINGLE Server
// Action invocation (generateProgramDraftAction / resumeGenerationAction)
// — i.e. a single Vercel Function invocation. Vercel Hobby's function
// duration is a HARD 300s ceiling: default and maximum are the same
// number on this plan (verified against Vercel's own docs, not
// assumed) — there is no code-level maxDuration change that raises it.
// A day-sized call is much smaller than a week-sized one, but an 8-week
// x 5-day program is still 1 shell + 40 day calls; left unbounded, a
// long enough program could still approach the ceiling. The platform
// killing the function mid-call would leave NO chance for this code's
// own failRun()/setDraftStatus() cleanup to run — a silently stuck
// "running" draft and a claimed quota unit for zero progress, a worse
// failure mode than an explicit, catchable timeout error.
//
// Fix: budget the whole invocation's wall-clock time and stop BEFORE
// starting a day call that risks blowing the ceiling, leaving a clean,
// resumable "failed" state (identical shape to a genuine failure —
// resumeGenerationAction's existing atomic-claim, skip-completed-work
// resume logic handles this for free, no new state machine, now
// resuming at the exact unfinished day rather than the whole week).
// 240s leaves ~60s margin under Hobby's 300s ceiling for the quota
// claim, exercise-candidate-set build, per-day DB writes, and
// finalization (assembly + exercise resolution + validation) that all
// still need to run after the last day call returns.
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

// Shared by the shell- and day-failure branches below. Never lets a
// release-path DB error crash the actual failure-handling flow it's
// called from — logs its own outcome and returns whether release
// actually fired, for the failure log's quotaReleased field.
async function releaseQuotaOnTimeout(
  errorCode: string,
  claimId: string | undefined,
  draftId: string,
  runId: string,
): Promise<boolean> {
  if (errorCode !== "timeout" || !claimId) return false;
  try {
    await releaseGenerationQuotaClaim(claimId);
    logQuotaRelease({ draftId, runId, reason: "provider_timeout", success: true });
    return true;
  } catch {
    logQuotaRelease({ draftId, runId, reason: "provider_timeout", success: false });
    return false;
  }
}

export async function runStagedGeneration(params: StagedGenerationParams): Promise<StagedGenerationResult> {
  const runStartedAt = Date.now();
  const dayTimeoutMs = resolveTimeoutMs(DAY_DEFAULT_TIMEOUT_MS);
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
  // completed day/week) and reused across shell planning, every day
  // call (narrowed further per day — see narrowCandidatesForDay below),
  // and — separately, in actions.ts — regenerate-day. See
  // exercise-candidates.ts for the selection algorithm and its bounds.
  const candidateSet = await buildExerciseCandidateSet(params.brief, params.coachId);
  // Lookup for week-cross-day-validation.ts — the SAME candidate rows
  // every day call was narrowed from, so muscle/pattern/equipment
  // metadata is exact, never re-queried or guessed from a name.
  const candidatesById = new Map<string, ExerciseCandidate>(candidateSet.candidates.map((c) => [c.id, c]));

  // Fail fast on total candidate exhaustion — an empty candidate set
  // means the model has literally nothing valid to select from for
  // every muscle group and warmup/cardio category (this brief's
  // equipment/experience-level combination excludes the entire visible
  // library). Continuing would still spend a shell call plus one call
  // per day only to produce a draft where every single prescription is
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
  // A resume only will if there's still a shell to generate, or at
  // least one (week, day) pair from (startFromWeek, startFromDay)
  // through the end of the program left uncompleted — a resume whose
  // shell and every day already completed (only finalization failed
  // last time) makes zero provider calls below and must not consume
  // the coach's quota for retrying it. One claim per top-level action
  // regardless of how many internal day calls it makes — see
  // claimGenerationQuota's own doc comment in program-generation-
  // service.ts for the full reasoning and chosen limit. Internal day
  // calls are an implementation detail; the commercial unit is "one
  // program-generation action."
  const totalWeeksForRun = params.existingShell?.totalWeeks ?? params.brief.weeks;
  const willInvokeModel =
    !params.existingShell ||
    params.startFromWeek < totalWeeksForRun ||
    (params.startFromWeek === totalWeeksForRun && params.startFromDay <= params.existingShell.days.length);

  // claimId is undefined when this attempt makes zero model calls
  // (the "resume whose shell + every day already completed" case) —
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
      const quotaReleased = await releaseQuotaOnTimeout(shellOutcome.errorCode, claimId, params.draftId, run.id);
      logGenerationFailure({
        draftId: params.draftId,
        runId: run.id,
        stage: "shell",
        errorCode: shellOutcome.errorCode,
        errorMessage: shellOutcome.errorMessage,
        provider: shellOutcome.provider,
        model: shellOutcome.model,
        elapsedMs: shellOutcome.elapsedMs,
        timeoutMs: shellOutcome.timeoutMs,
        isRetryOrResume: params.isResume,
        completedWeeks: params.existingCompletedWeeks.size,
        quotaClaimed: !!claimId,
        quotaReleased,
      });
      await failRun(run.id, shellOutcome.errorMessage, { provider: shellOutcome.provider, model: shellOutcome.model });
      const failureReason = "Generation failed while designing the program structure. You can retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }
    logProviderSuccess({
      draftId: params.draftId,
      stage: "shell",
      provider: shellOutcome.provider,
      model: shellOutcome.model,
      elapsedMs: shellOutcome.elapsedMs,
    });
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

  // ── Step 2: per week, one generateProgramDay() call per remaining
  // shell day, then a deterministic assembly of that week from its
  // now-complete day rows. ──
  const allWeeks = new Map(params.existingCompletedWeeks);
  // Previous week's day rows, keyed by dayNumber — recomputed once per
  // week (not once per day) purely as a latency/query-count
  // optimization; semantically this is "read fresh every time," same
  // as candidateSet and every other resume-safety-relevant read here.
  let priorWeekDaysByIndex = new Map<number, ModelDayDraft>();
  // Accumulated across every week this invocation assembles — folded
  // into runAndSaveValidation's extraWarnings at finalization below,
  // alongside catalogGapFindings(candidateSet.gaps).
  const crossDayFindings: ValidationFinding[] = [];

  for (let weekNumber = params.startFromWeek; weekNumber <= shell.totalWeeks; weekNumber++) {
    // Only the FIRST week this invocation touches can have partial
    // day progress from an earlier attempt — every week after that
    // always starts at day 1, by construction (a week is only ever
    // left partially done if a prior invocation stopped mid-week, and
    // only one week can be "in progress" at any stopping point).
    const dayStartIndex = weekNumber === params.startFromWeek ? params.startFromDay : 1;

    const completedDaysThisWeek = new Map<number, ModelDayDraft>();
    if (dayStartIndex > 1) {
      const existingDayRows = await listGenerationDaysForWeek(params.draftId, weekNumber);
      for (const row of existingDayRows) {
        if (row.status === "completed" && row.dayJson) {
          completedDaysThisWeek.set(row.dayNumber, row.dayJson as ModelDayDraft);
        }
      }
    }

    // Continuity source for every day in THIS week: the same day-slot
    // in the immediately preceding week (shell.days is a fixed weekly
    // split reused every week — see contracts.ts's ProgramShellSchema —
    // so day index N always means the same training emphasis across
    // weeks). Read once per week, not once per day.
    if (weekNumber > 1) {
      const priorWeekRows = await listGenerationDaysForWeek(params.draftId, weekNumber - 1);
      priorWeekDaysByIndex = new Map(
        priorWeekRows
          .filter((row) => row.status === "completed" && row.dayJson)
          .map((row) => [row.dayNumber, row.dayJson as ModelDayDraft]),
      );
    }

    for (let dayIndex = dayStartIndex; dayIndex <= shell.days.length; dayIndex++) {
      const shellDay = shell.days[dayIndex - 1];

      // Time-budget guard (see GENERATION_TIME_BUDGET_MS's comment
      // above): stop BEFORE starting a day call that risks running
      // past Vercel Hobby's hard 300s function-duration ceiling,
      // rather than letting the platform kill this invocation mid-call
      // with no chance to persist a clean, resumable state. Completed
      // days so far are already saved; this is a deliberate, safe
      // pause, not an error — it reuses the exact same failed+
      // resumable shape a real failure would, so resumeGenerationAction's
      // existing skip-completed-work resume logic picks up exactly
      // here with zero new state machinery. Phase 13's UI framing
      // ("Progress saved. Continue generation to resume from...") is
      // deliberately reflected in this wording, not "Generation Failed."
      if (Date.now() - runStartedAt + dayTimeoutMs > timeBudgetMs) {
        const failureReason = `Progress saved. Continue generation to resume from Week ${weekNumber}, Day ${dayIndex} ("${shellDay.label}").`;
        await failRun(run.id, "Time budget reached before starting the next day — safe to resume.");
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      await updateRunProgress(run.id, { currentWeek: weekNumber, currentDay: dayIndex });

      const priorSameDay = priorWeekDaysByIndex.get(dayIndex);
      const priorSameDaySummary = priorSameDay ? summarizeDayForPrompt(priorSameDay) : null;
      // P1 review finding: give this day visibility into what OTHER
      // days already generated earlier in the SAME week — without it,
      // five individually-reasonable days can combine into an
      // uncoordinated week (week-cross-day-validation.ts catches what
      // still gets through after this).
      const weekSoFarSummary = summarizeWeekSoFarForPrompt(completedDaysThisWeek, candidatesById);

      // Never let the model choose which muscles matter for a day —
      // see exercise-candidates.ts's narrowCandidatesForDay() header
      // comment. Computed fresh per day (pure, in-memory, no DB call).
      const dayCandidates = narrowCandidatesForDay(candidateSet, shellDay, params.brief.musclePriorities);

      const dayOutcome = await generateProgramDay({
        brief: params.brief,
        clientContext: params.clientContext,
        shell,
        weekNumber,
        dayIndex,
        shellDay,
        priorSameDaySummary,
        weekSoFarSummary,
        candidates: dayCandidates,
      });

      if (!dayOutcome.ok) {
        const quotaReleased = await releaseQuotaOnTimeout(dayOutcome.errorCode, claimId, params.draftId, run.id);
        logGenerationFailure({
          draftId: params.draftId,
          runId: run.id,
          stage: "day",
          weekNumber,
          dayNumber: dayIndex,
          errorCode: dayOutcome.errorCode,
          errorMessage: dayOutcome.errorMessage,
          provider: dayOutcome.provider,
          model: dayOutcome.model,
          elapsedMs: dayOutcome.elapsedMs,
          timeoutMs: dayOutcome.timeoutMs,
          isRetryOrResume: params.isResume,
          completedDays: completedDaysThisWeek.size,
          completedWeeks: allWeeks.size,
          candidateCount: dayCandidates.length,
          quotaClaimed: !!claimId,
          quotaReleased,
        });
        await saveGenerationDay(params.draftId, weekNumber, dayIndex, {
          status: "failed",
          errorCode: dayOutcome.errorCode,
          errorMessage: dayOutcome.errorMessage,
          provider: dayOutcome.provider,
          model: dayOutcome.model,
        });
        await failRun(run.id, dayOutcome.errorMessage, { provider: dayOutcome.provider, model: dayOutcome.model });
        const failureReason = `Generation failed while creating Week ${weekNumber}, Day ${dayIndex} ("${shellDay.label}"). Completed days were saved — you can retry to continue from here.`;
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }
      logProviderSuccess({
        draftId: params.draftId,
        stage: "day",
        weekNumber,
        dayNumber: dayIndex,
        provider: dayOutcome.provider,
        model: dayOutcome.model,
        elapsedMs: dayOutcome.elapsedMs,
        candidateCount: dayCandidates.length,
      });

      // Never trust a returned exerciseId merely because the model
      // supplied one — verify every prescription's id against the
      // EXACT (narrowed) candidate set offered for this call before
      // persisting. Anything that doesn't verify has its id stripped
      // back to name-only, which exercise-resolution.ts's fallback
      // resolver covers at final assembly time.
      const { result: verifiedDay } = verifyDayAgainstCandidates(dayOutcome.day, dayCandidates);

      await saveGenerationDay(params.draftId, weekNumber, dayIndex, {
        status: "completed",
        dayJson: verifiedDay,
        provider: dayOutcome.provider,
        model: dayOutcome.model,
      });
      completedDaysThisWeek.set(dayIndex, verifiedDay);
      lastProvider = dayOutcome.provider;
      lastModel = dayOutcome.model;

      await updateRunProgress(run.id, { completedDays: completedDaysThisWeek.size });
    }

    // ── Week assembly — deterministic, no model call. Every downstream
    // consumer (final assembly below, exercise resolution, validation,
    // approval) reads program_generation_weeks exactly as it always
    // has; only how this row gets produced changed. Review finding
    // (day-level architecture v1): a missing-day invariant violation
    // used to throw here, BEFORE any surrounding try/catch could run —
    // an escape hatch that would leave the draft stuck "running"
    // forever with no failRun()/setDraftStatus() cleanup. Fixed by
    // routing this through the same discriminated-result shape every
    // other failure in this function already uses — there is no way to
    // call assembleWeekFromDays() and forget to handle its failure
    // branch through the normal path. ──
    const assembly = assembleWeekFromDays(weekNumber, shell.days, completedDaysThisWeek);
    if (!assembly.ok) {
      logGenerationFailure({
        draftId: params.draftId,
        runId: run.id,
        stage: "week_assembly",
        weekNumber,
        errorCode: "invalid_output",
        errorMessage: assembly.error,
        provider: lastProvider,
        model: lastModel,
        isRetryOrResume: params.isResume,
        completedWeeks: allWeeks.size,
      });
      await failRun(run.id, assembly.error, { provider: lastProvider, model: lastModel });
      const failureReason = "Generation could not be assembled. Please retry.";
      await setDraftStatus(params.draftId, "failed", { failureReason });
      return { ok: false, error: failureReason };
    }

    // P1 review finding: whole-week generation let the model implicitly
    // coordinate an entire week; day-level calls can each look
    // individually reasonable and still combine into a bad week.
    // Deterministic, context-aware, always warnings (never a blocker,
    // never an auto-regeneration) — see week-cross-day-validation.ts's
    // own header comment for the full design and what's deliberately
    // NOT checked here. Accumulated across every week and folded into
    // the same extraWarnings mechanism catalogGapFindings() already
    // uses at finalization — the SAME coach review/acknowledgement UI,
    // no new findings pipeline.
    crossDayFindings.push(...validateWeekCrossDay(assembly.week, params.brief, candidatesById));

    await saveGenerationWeek(params.draftId, weekNumber, { status: "completed", weekJson: assembly.week });
    allWeeks.set(weekNumber, assembly.week);
    await updateRunProgress(run.id, { completedWeeks: allWeeks.size });
  }

  // ── Step 3: finalization — assemble, resolve, validate, then (only
  // now) transition to ready_for_review. Unchanged by the day-level
  // architecture change: allWeeks is fully populated (either from a
  // prior attempt's already-completed weeks, or freshly assembled
  // above) exactly as it always was. ──
  const weeksInOrder: ModelWeekDraft[] = [];
  for (let weekNumber = 1; weekNumber <= shell.totalWeeks; weekNumber++) {
    const week = allWeeks.get(weekNumber);
    if (!week) {
      // Unreachable given the loop above always persists every week
      // from startFromWeek through shell.totalWeeks, and
      // existingCompletedWeeks covers 1..startFromWeek-1 by
      // construction (callers only set startFromWeek past a
      // contiguous completed prefix) — kept as an explicit, named
      // failure rather than a silent gap if that invariant is ever
      // violated.
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
    [...catalogGapFindings(candidateSet.gaps), ...crossDayFindings],
  );

  return { ok: true };
}
