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
//
// Phase C (Programming Intelligence block-based generation): for the
// six Phase A/B-supported goals (see strategy.ts's
// isPhaseBlockSupportedGoal — athletic_performance stays on this file's
// original day-by-day path unconditionally, no partial application),
// a genuinely FRESH draft (no persisted shell, no completed weeks yet
// — see resolveGenerationArchitecture in block-plan.ts) derives a
// BlockPlan[] once from the brief alone and generates ONLY each
// block's CANONICAL (first) week via the exact same AI day-by-day
// mechanism above; every other week in that block is produced by a
// single, synchronous, zero-provider-call expandCanonicalWeek() call
// (lib/program-generator/progression.ts, Phase B) instead of a day
// loop. No new persistence exists for any of this: a BlockPlan[] is
// 100% deterministically re-derivable from the brief on every resume,
// and which weeks are already complete is read from the SAME
// program_generation_weeks rows this file has always used — resume
// naturally never re-expands an already-persisted deterministic week
// for exactly the same reason it's never re-generated an already-
// persisted AI week: both are gated by the same existingCompletedWeeks
// map. A draft with ANY existing progress (a persisted shell, or any
// completed week, from before this integration existed or from any
// earlier attempt) unconditionally stays on the original day-by-day
// path forever, regardless of goal — see resolveGenerationArchitecture's
// own header for why this is what protects a draft like production
// draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a ("Maddie": shell exists,
// weeks 1-2 completed) with zero goal-based branching and zero new
// persisted "architecture" flag.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import {
  saveProgramShell,
  saveGenerationArchitecture,
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
import { generateProgramShell, generateProgramDay, resolveTimeoutMs, DAY_DEFAULT_TIMEOUT_MS, type GenerationFailure } from "./provider";
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
  type ExerciseCandidateSet,
} from "./exercise-candidates";
import { findDayUnique, replaceDayContent } from "./edit-ops";
import {
  deriveBlockPlans,
  findBlockForWeek,
  resolveGenerationArchitecture,
  resolveEffectiveBlockGenerationVersion,
  type BlockPlan,
  type GenerationArchitecture,
} from "./block-plan";
import { expandCanonicalWeek } from "./progression";
import { deriveCanonicalWeekBlueprint, validateCanonicalWeekBlueprint, summarizeSiblingAllocationsForPrompt } from "./blueprint";
import {
  parseGeneratedProgramDraft,
  ModelWeekDraftSchema,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
  type GeneratedDayDraft,
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
    days.push(alignDayToShellDay(day, shellDays[idx]));
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

// The persisted slot (week_number, day_number) and shell day are the
// structural source of truth. The model can still drift on dayOfWeek or
// label despite the prompt; never let that metadata make an otherwise
// usable day unassemblable or poison future resumes.
export function alignDayToShellDay(day: ModelDayDraft, shellDay: ProgramShellDay): ModelDayDraft {
  return {
    ...day,
    dayOfWeek: shellDay.dayOfWeek,
    label: shellDay.label,
  };
}

// day.id review finding: each day is generated by its own independent
// provider call (one per week per day-slot), with zero visibility into
// ids used by any OTHER call — the model can echo the same id for two
// unrelated days (different weeks, or even the same week), and
// edit-ops.ts's day/section lookups match by id across the whole
// program, so a collision could silently misdirect a coach's edit to
// the wrong day. Call this EXACTLY ONCE per day slot, at the moment it
// is first persisted as status:"completed" (see runStagedGeneration) —
// never at assembly/resume/read time, where the value already
// persisted must be treated as final. A day slot, once completed, is
// never regenerated by the staged path (resume always skips forward
// past already-completed days), so "assign once" and "the only time
// this is ever called for that slot" are the same guarantee — no
// separate check-for-an-existing-id step is needed here.
export function assignCanonicalDayId(day: ModelDayDraft): ModelDayDraft {
  return { ...day, id: randomUUID() };
}

export type RegenerateDaySuccess = { ok: true; draft: GeneratedProgramDraft; provider: string; model: string; elapsedMs: number };
export type RegenerateDayResult = RegenerateDaySuccess | GenerationFailure | { ok: false; error: string };

// P0 review finding, fixed here: app/hq/programs/generate/actions.ts's
// regenerateDayAction used to ask the model to echo the ENTIRE program
// back (schema: ModelProgramDraftSchema, "leave every other day
// unchanged") while never actually giving it the existing draft's
// content to echo — the model had no way to honor "unchanged" for
// content it never saw, so every single-day regeneration risked
// silently fabricating new content for the rest of the whole program.
//
// Surgical instead: locate the target day (failing closed on any
// ambiguity BEFORE any provider call), generate ONLY that one day via
// generateProgramDay() — the exact same call staged generation makes
// for every day, never asking the model to touch anything else — then
// splice just that one day back into the draft. Every other week/day
// is passed through by reference via edit-ops.ts's replaceDayContent,
// never re-serialized through the model at all.
//
// Kept separate from the Server Action (same "auth/quota/run-tracking
// in actions.ts, domain logic here" split as runStagedGeneration) so
// this is directly testable without Next.js's request-scoped
// cookies()/headers() — see this file's own header comment.
export async function regenerateDaySurgically(params: {
  draft: GeneratedProgramDraft;
  shell: ProgramShell;
  brief: ProgramGenerationBrief;
  clientContext: ClientContextSummary | null;
  dayId: string;
  coachId: string;
  candidateSet: ExerciseCandidateSet;
}): Promise<RegenerateDayResult> {
  // Fail closed FIRST — before any provider call — exactly the "do not
  // regenerate, do not persist anything" requirement for a target that
  // can't be uniquely resolved.
  const located = findDayUnique(params.draft, params.dayId);
  if (!located.ok) {
    return {
      ok: false,
      error: located.reason === "ambiguous"
        ? "This draft has more than one day sharing the same identifier — refusing to guess which one to regenerate. Regenerate this draft or contact support."
        : "Day not found in draft.",
    };
  }
  const targetWeek = located.week;
  const targetDay = located.day;

  // dayOfWeek is application-owned (alignDayToShellDay/
  // assignCanonicalDayId above) — reliable as the join key back to the
  // immutable shell's own day-slot definition, unlike array position
  // (moveWorkoutDay swaps dayOfWeek between two days without reordering
  // the days array itself).
  const shellDayIndex = params.shell.days.findIndex((d) => d.dayOfWeek === targetDay.dayOfWeek);
  if (shellDayIndex === -1) {
    return { ok: false, error: "This day's structural slot no longer matches the Program Shell — cannot safely regenerate." };
  }
  const shellDay = params.shell.days[shellDayIndex];
  const dayIndex = shellDayIndex + 1;

  const candidatesById = new Map(params.candidateSet.candidates.map((c) => [c.id, c]));
  const dayCandidates = narrowCandidatesForDay(params.candidateSet, shellDay, params.brief.musclePriorities);

  // Same two continuity sources every staged-generation day call gets
  // (point I — quality context, not just correctness), rebuilt from the
  // CURRENT draft — this draft's own content is the authoritative
  // record of what's already there, never re-derived from provider
  // output. Neither is required for correctness; both meaningfully
  // improve output quality relative to the old regeneration prompt,
  // which had zero cross-day continuity at all.
  const priorWeek = params.draft.weeks.find((w) => w.weekNumber === targetWeek.weekNumber - 1);
  const priorSameDay = priorWeek?.days.find((d) => d.dayOfWeek === shellDay.dayOfWeek);
  const priorSameDaySummary = priorSameDay ? summarizeDayForPrompt(toDaySummaryShape(priorSameDay)) : null;

  const otherDaysThisWeek = new Map<number, ModelDayDraft>();
  for (const otherDay of targetWeek.days) {
    if (otherDay.id === targetDay.id) continue;
    const otherSlotIndex = params.shell.days.findIndex((d) => d.dayOfWeek === otherDay.dayOfWeek);
    if (otherSlotIndex === -1) continue;
    otherDaysThisWeek.set(otherSlotIndex + 1, toDaySummaryShape(otherDay));
  }
  const weekSoFarSummary = summarizeWeekSoFarForPrompt(otherDaysThisWeek, candidatesById);

  const outcome = await generateProgramDay({
    brief: params.brief,
    clientContext: params.clientContext,
    shell: params.shell,
    weekNumber: targetWeek.weekNumber,
    dayIndex,
    shellDay,
    priorSameDaySummary,
    weekSoFarSummary,
    candidates: dayCandidates,
  });
  if (!outcome.ok) return outcome;

  // Never trust a returned exerciseId merely because the model supplied
  // one — verify against the exact (narrowed) candidate set offered for
  // this call before it's persisted.
  const { result: verifiedDay } = verifyDayAgainstCandidates(outcome.day, dayCandidates);
  // Structural identity is application-owned, never the model's echo.
  // id is PRESERVED from the existing day (this is a regeneration of an
  // already-canonical slot, not a first-time completion) rather than
  // minted fresh — "content changes, structural identity remains
  // stable," per this fix's own requirement.
  const alignedDay = alignDayToShellDay(verifiedDay, shellDay);
  const canonicalDay: ModelDayDraft = { ...alignedDay, id: targetDay.id };

  // Resolve exercise names/ids for JUST this one day — a throwaway
  // single-day "program" wrapper reuses resolveProgramDraftExercises's
  // existing, already-tested resolution logic without re-touching (or
  // even reading) any other day/week's content.
  const resolvedWrapper = await resolveProgramDraftExercises(
    {
      name: "regeneration-wrapper",
      category: params.brief.goal,
      experienceLevel: params.brief.experienceLevel,
      defaultDurationWeeks: params.brief.weeks,
      recommendedDaysPerWeek: params.brief.daysPerWeek,
      weeks: [{ id: "wrapper-week", weekNumber: 1, days: [canonicalDay] }],
    },
    params.coachId,
  );
  const resolvedDay = resolvedWrapper.weeks[0].days[0];

  // Splice ONLY this day into the draft — every other week/day is
  // passed through by reference, completely untouched by this call.
  const spliced = replaceDayContent(params.draft, targetDay.id, resolvedDay);
  if (!spliced.ok) {
    // findDayUnique already succeeded above with the SAME draft/dayId,
    // so this is unreachable in practice — kept as a real discriminated
    // check rather than a non-null assertion.
    return { ok: false, error: spliced.error };
  }

  return { ok: true, draft: spliced.draft, provider: outcome.provider, model: outcome.model, elapsedMs: outcome.elapsedMs };
}

// summarizeDayForPrompt/summarizeWeekSoFarForPrompt read only
// id/dayOfWeek/label/notes/workout.name/workout.primaryFocus/
// workout.sections[].prescriptions[].{exerciseId,exerciseName,sets} —
// every one of those fields exists on GeneratedDayDraft with the same
// name and meaning. The one real difference (exerciseId: string|null
// here vs. string|undefined on ModelDayDraft) is irrelevant to what
// these summary functions actually do with it (a truthy check), so
// this is a safe, narrow shape adapter for display/summary purposes
// only — never used to persist or re-validate anything.
function toDaySummaryShape(day: GeneratedDayDraft): ModelDayDraft {
  return {
    id: day.id,
    dayOfWeek: day.dayOfWeek,
    label: day.label,
    notes: day.notes,
    workout: day.workout
      ? {
          ...day.workout,
          sections: day.workout.sections.map((section) => ({
            ...section,
            prescriptions: section.prescriptions.map((p) => ({ ...p, exerciseId: p.exerciseId ?? undefined })),
          })),
        }
      : null,
  };
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
  // Phase C: the draft's OWN persisted generationArchitecture column
  // (drizzle/0036), read by the caller from the draft row exactly like
  // existingShell/existingCompletedWeeks — null for a genuinely fresh
  // draft that has never made this decision yet. Once non-null, this
  // function ALWAYS honors it rather than re-deriving from existing
  // progress — see resolveGenerationArchitecture's own header for why a
  // re-derivation can't reliably tell a block-architecture canonical
  // week from an ordinary legacy week once either is persisted.
  existingGenerationArchitecture: GenerationArchitecture | null;
  // Phase D: the draft's OWN persisted generation_architecture_version
  // column (drizzle/0038), read by the caller exactly like
  // existingGenerationArchitecture — null for a draft that hasn't made
  // this decision yet (including every "block" draft that predates
  // this column — see the column's own comment for why that MUST be
  // treated as version 1, never re-derived as version 2) or for any
  // legacy_day draft (a version is only ever meaningful for "block").
  existingGenerationArchitectureVersion: 1 | 2 | null;
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

// Phase C continuity fallback (review finding on candidate 5bfc4bc):
// pure — given the prior week's own persisted ModelWeekDraft (from
// `allWeeks`, regardless of whether it was produced by AI day-by-day
// generation or Phase B's deterministic expansion — both are the same
// shape) and the shell's fixed day list, locates each day-slot's
// content by structural dayOfWeek (never array position) and returns
// it keyed by dayIndex (1-based position in shellDays), the SAME key
// space listGenerationDaysForWeek's real rows already use. Returns an
// EMPTY map — never fabricated content — when priorWeekContent is
// undefined (should be structurally unreachable in production; only
// reachable here defensively) or when a given slot genuinely has no
// matching day. Exported specifically so this lookup is unit-testable
// without a database: see __tests__/week-assembly.test.ts.
export function resolvePriorWeekContinuityFallback(
  priorWeekContent: ModelWeekDraft | undefined,
  shellDays: ProgramShellDay[],
): Map<number, ModelDayDraft> {
  const result = new Map<number, ModelDayDraft>();
  if (!priorWeekContent) return result;
  for (let priorDayIndex = 1; priorDayIndex <= shellDays.length; priorDayIndex++) {
    const priorShellDay = shellDays[priorDayIndex - 1];
    const matchingDay = priorWeekContent.days.find((d) => d.dayOfWeek === priorShellDay.dayOfWeek);
    if (matchingDay) result.set(priorDayIndex, matchingDay);
  }
  return result;
}

// Phase C quota-gate helper: true if ANY week in [startFromWeek,
// totalWeeks] is a block's canonical week — the only kind of week that
// ever invokes the model under block architecture. Pure, no DB/network.
function hasRemainingCanonicalWeek(blocks: BlockPlan[], startFromWeek: number, totalWeeks: number): boolean {
  for (let weekNumber = startFromWeek; weekNumber <= totalWeeks; weekNumber++) {
    const lookup = findBlockForWeek(blocks, weekNumber);
    if (lookup?.isCanonicalWeek) return true;
  }
  return false;
}

// Phase D: what a genuinely NEW block draft gets today. A resumed
// draft with an already-persisted version always uses THAT value
// instead — see runStagedGeneration's own version-resolution comment.
const CURRENT_BLOCK_GENERATION_VERSION = 2 as const;

// Phase D bounded day-concurrency primitive — adapted from the
// intra-week concurrency prototype (commit 0e1936f). Reused nearly
// verbatim: the primitive itself was sound (order-preserving, strictly
// bounded, empty/limit-exceeds-count/limit=1 edge cases all correct —
// see its own unit tests) and was never the source of that prototype's
// quality regression (duplicate-main-lift warnings 6->24). That
// regression came from applying concurrency with NO shared sibling
// intent at all (each day saw only "whatever completed in an EARLIER
// batch," nothing about days running in the SAME batch) — Phase D's
// actual fix is blueprint.ts providing that intent before any day
// call starts, not a different concurrency mechanism. `fn` is expected
// to internally catch/represent failure as data (every provider call
// in this codebase already returns a discriminated result, never
// throws) — a real thrown exception still propagates, by design (see
// the prototype's own test: "callers are expected to catch inside fn,
// not rely on this").
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// Default kept identical to the prototype's own already-staging-
// validated default (5) — see this function's own header for why: a
// <=5-day/week program (the common case) dispatches its whole
// canonical week in ONE batch. PROGRAM_GENERATOR_DAY_CONCURRENCY
// overrides it — same ops-escape-hatch pattern as PROGRAM_GENERATOR_
// TIMEOUT_MS/PROGRAM_GENERATOR_TIME_BUDGET_MS; set to 1 to force fully
// serial canonical-day generation without a code change.
const DEFAULT_DAY_CONCURRENCY = 5;

export function resolveDayConcurrency(): number {
  const raw = process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_DAY_CONCURRENCY;
}

// Shared by the shell- and day-failure branches below. Never lets a
// release-path DB error crash the actual failure-handling flow it's
// called from — logs its own outcome and returns whether release
// actually fired, for the failure log's quotaReleased field.
// Phase D economic-semantics review finding: with concurrent day
// batches, a single timing-out call no longer means "this invocation
// produced zero usable output" — four siblings in the same batch may
// have succeeded and already been persisted. Refunding unconditionally
// on any timeout (the original rule) would give the coach the quota
// unit back for free after the invocation did real, kept work.
// hasMadeProgressThisInvocation (true the moment ANY day, in either
// the legacy serial loop or the Phase D concurrent batch loop,
// succeeds THIS invocation) makes the refund rule "zero net progress,"
// not "this one call happened to time out" — the same underlying
// principle the original rule already used (only refund when the
// invocation produced truly nothing), now scoped correctly for a batch
// that can partially succeed. Applied uniformly to both the day loops
// AND the shell-failure branch (shell failing is always the very first
// thing an invocation attempts, so hasMadeProgressThisInvocation is
// always false there regardless — this doesn't change shell-failure
// refund behavior at all, only day-failure behavior).
export async function releaseQuotaOnTimeout(
  errorCode: string,
  claimId: string | undefined,
  draftId: string,
  runId: string,
  hasMadeProgressThisInvocation: boolean,
): Promise<boolean> {
  if (errorCode !== "timeout" || !claimId || hasMadeProgressThisInvocation) return false;
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

  // ── Phase C: legacy-vs-block architecture routing — a three-way
  // decision keyed on LIFECYCLE (isResume + persisted architecture),
  // never on content state (shell/week progress).
  //
  //   1. A persisted decision already exists (drizzle/0036's
  //      generationArchitecture column, read by the caller and passed
  //      in) — ALWAYS honored as-is, never re-derived. A block-
  //      architecture canonical week and an ordinary legacy week are
  //      produced by the identical AI day-by-day mechanism and are
  //      byte-for-byte indistinguishable once persisted, so re-deriving
  //      from "does this draft have any existing progress" would
  //      incorrectly kick an in-progress BLOCK draft back to
  //      legacy_day the moment it completes even one week.
  //
  //   2. This is a RESUME (isResume === true) with no persisted
  //      decision yet — this can ONLY be a historical draft that
  //      predates drizzle/0036 (or a resume of a draft whose very
  //      first attempt never got far enough to make this decision at
  //      all). Review finding on Phase C candidate 5bfc4bc: forcing
  //      legacy_day here is the entire fix — see
  //      resolveGenerationArchitecture's own header (block-plan.ts) for
  //      why inferring "new" from shell/week state was the bug (a
  //      historical draft that failed before its first shell call has
  //      the exact same "zero progress" shape as a genuinely new one).
  //      This holds regardless of shell state, day-row state, or
  //      completed-week state — the ONLY signal that matters here is
  //      "was this call told it's a resume."
  //
  //   3. Neither of the above — a genuinely NEW draft
  //      (isResume === false, which every fresh-generation caller sets
  //      unconditionally) — makes the real decision now, via
  //      resolveGenerationArchitecture's goal-based rule.
  //
  // Case 3's result (and case 2's forced legacy_day) is persisted
  // immediately below so every later call for this SAME draft reads it
  // back via case 1 instead of re-deriving anything.
  let architecture: GenerationArchitecture;
  let blocks: BlockPlan[] = [];
  if (params.existingGenerationArchitecture) {
    architecture = params.existingGenerationArchitecture;
  } else if (params.isResume) {
    architecture = "legacy_day";
  } else {
    architecture = resolveGenerationArchitecture({ goal: params.brief.goal });
  }

  if (architecture === "block") {
    const blockPlanResult = deriveBlockPlans(params.brief.goal, params.brief.experienceLevel, params.brief.weeks);
    if (blockPlanResult.ok) {
      blocks = blockPlanResult.blocks;
    } else {
      // Never let an internal block-plan derivation error break
      // generation for a goal that would otherwise work fine on the
      // original path — fall back rather than fail the whole attempt.
      // Not expected to ever actually trigger (see deriveBlockPlans's
      // own closing invariant check), but this keeps a defensive bug
      // there from becoming a customer-facing generation failure here.
      architecture = "legacy_day";
    }
  }

  // Phase D: version only ever matters for "block". Review finding on
  // Phase D candidate 6734599: the original inline
  // `existingGenerationArchitectureVersion ?? CURRENT_BLOCK_GENERATION_VERSION`
  // silently upgraded a RESUME of an EXISTING "block" draft (isResume
  // true, existingGenerationArchitecture already "block") with a null
  // persisted version — a real pre-Phase-D block draft — to the
  // CURRENT default at runtime, even though drizzle/0038's own
  // contract says null on an existing block draft means version 1
  // forever. See resolveEffectiveBlockGenerationVersion's own header
  // (block-plan.ts) for the full precedence this now enforces in one
  // place instead of a scattered `??`.
  const blockGenerationVersion = resolveEffectiveBlockGenerationVersion(
    { architecture, persistedVersion: params.existingGenerationArchitectureVersion, isResume: params.isResume },
    CURRENT_BLOCK_GENERATION_VERSION,
  );

  if (!params.existingGenerationArchitecture) {
    // First time this draft has ever made this decision — persist the
    // FINAL value (post block-plan-derivation-failure fallback, if any)
    // so it is honored, not re-derived, on every later call.
    await saveGenerationArchitecture(params.draftId, architecture, blockGenerationVersion ?? undefined);
  }

  // ── Rate-limit gate — only consulted when this attempt will actually
  // reach the model. A fresh generation always will (no existingShell).
  // A resume only will if there's still a shell to generate, or —
  // legacy_day: at least one (week, day) pair from (startFromWeek,
  // startFromDay) through the end of the program left uncompleted;
  // block: at least one remaining week in that same range is a block's
  // CANONICAL week (an expanded week never itself invokes the model,
  // so a resume with only expanded weeks left must not claim quota) —
  // a resume whose shell and every AI-authored week already completed
  // (only finalization, or only deterministic expansion, failed last
  // time) makes zero provider calls below and must not consume the
  // coach's quota for retrying it. One claim per top-level action
  // regardless of how many internal day calls it makes — see
  // claimGenerationQuota's own doc comment in program-generation-
  // service.ts for the full reasoning and chosen limit. Internal day
  // calls are an implementation detail; the commercial unit is "one
  // program-generation action."
  const totalWeeksForRun = params.existingShell?.totalWeeks ?? params.brief.weeks;
  const willInvokeModel =
    !params.existingShell ||
    (architecture === "legacy_day"
      ? params.startFromWeek < totalWeeksForRun ||
        (params.startFromWeek === totalWeeksForRun && params.startFromDay <= params.existingShell.days.length)
      : hasRemainingCanonicalWeek(blocks, params.startFromWeek, totalWeeksForRun));

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
  // Phase D quota-refund rule — see releaseQuotaOnTimeout's own
  // comment. Incremented on every day that succeeds THIS invocation,
  // in either the legacy serial loop or the Phase D concurrent batch
  // loop — never reset mid-invocation, never counts a day that was
  // already completed by an EARLIER invocation (those are read from
  // completedDaysThisWeek/existingCompletedWeeks, not this counter).
  let daysCompletedThisInvocation = 0;

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
      const quotaReleased = await releaseQuotaOnTimeout(shellOutcome.errorCode, claimId, params.draftId, run.id, daysCompletedThisInvocation > 0);
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
    // ── Phase C: deterministic block expansion — no provider call, no
    // day loop. Only reachable under block architecture, and only for
    // a week that is NOT its block's canonical (first) week. A block's
    // canonical week always falls through to the exact same AI
    // day-by-day path every legacy_day week uses (see the `if` below
    // simply not matching for it) — this branch exists purely to skip
    // that path for the weeks Phase B is responsible for instead. ──
    const blockLookup = architecture === "block" ? findBlockForWeek(blocks, weekNumber) : null;
    if (architecture === "block" && blockLookup && !blockLookup.isCanonicalWeek) {
      // Lightweight time-budget guard: expansion is CPU-only (no
      // network I/O), but this still bounds unbounded DB-write latency
      // accumulating across many expanded weeks in one invocation,
      // leaving a clean, resumable state rather than risking Vercel's
      // hard function-duration ceiling (see DEFAULT_GENERATION_TIME_BUDGET_MS's
      // own comment above for the ceiling this budgets against).
      if (Date.now() - runStartedAt > timeBudgetMs) {
        const failureReason = `Progress saved. Continue generation to resume from Week ${weekNumber}.`;
        await failRun(run.id, "Time budget reached before starting the next deterministic week expansion — safe to resume.");
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      await updateRunProgress(run.id, { currentWeek: weekNumber });

      // Guaranteed present by construction: a block's canonical week
      // (the smallest weekNumber in the block) is always processed —
      // fresh this run, or already persisted from an earlier attempt
      // and supplied via params.existingCompletedWeeks — before any of
      // that SAME block's later weeks are ever reached, since this
      // loop only ever moves forward in weekNumber order. Kept as an
      // explicit, named failure rather than a non-null assertion in
      // case that invariant is ever violated by a future change.
      const canonicalWeekContent = allWeeks.get(blockLookup.block.canonicalWeekNumber);
      if (!canonicalWeekContent) {
        const errorMessage =
          `Missing canonical week ${blockLookup.block.canonicalWeekNumber} content for block ` +
          `${blockLookup.block.blockNumber} — cannot deterministically expand week ${weekNumber}.`;
        logGenerationFailure({
          draftId: params.draftId,
          runId: run.id,
          stage: "week_assembly",
          weekNumber,
          errorCode: "invalid_output",
          errorMessage,
          provider: lastProvider,
          model: lastModel,
          isRetryOrResume: params.isResume,
          completedWeeks: allWeeks.size,
        });
        await failRun(run.id, errorMessage, { provider: lastProvider, model: lastModel });
        const failureReason = "Generation could not be assembled. Please retry.";
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      // Technique eligibility only exists as a concept under Phase D
      // (version 2) — a version-1 (Phase C) block draft's canonical
      // week was never prompted with any eligibility awareness at all,
      // so introducing an eligibility map into ITS expansion would be
      // new behavior for an old draft, not a bug fix. Re-derived here
      // (never persisted — see blueprint.ts's own header for why a
      // fully deterministic blueprint needs no persistence at all) from
      // the SAME block/shell/experienceLevel a version-2 draft's
      // canonical-week generation already used, so it is byte-for-byte
      // identical every time this recomputes it, on any resume.
      const techniqueEligibilityByDayOfWeek =
        blockGenerationVersion === 2
          ? Object.fromEntries(
              deriveCanonicalWeekBlueprint(blockLookup.block, shell.days, params.brief.experienceLevel)
                .days.filter((d) => d.techniqueEligibility !== null)
                .map((d) => [d.dayOfWeek, d.techniqueEligibility as string]),
            )
          : undefined;

      const expansion = expandCanonicalWeek({
        canonicalWeek: canonicalWeekContent,
        progressionStrategy: blockLookup.block.progressionStrategy,
        phaseType: blockLookup.block.phaseType,
        experienceLevel: params.brief.experienceLevel,
        blockWeekIndex: weekNumber - blockLookup.block.weekStart + 1,
        blockLength: blockLookup.block.blockLength,
        techniqueEligibilityByDayOfWeek,
      });
      if (!expansion.ok) {
        logGenerationFailure({
          draftId: params.draftId,
          runId: run.id,
          stage: "week_assembly",
          weekNumber,
          errorCode: "invalid_output",
          errorMessage: expansion.error,
          provider: lastProvider,
          model: lastModel,
          isRetryOrResume: params.isResume,
          completedWeeks: allWeeks.size,
        });
        await failRun(run.id, expansion.error, { provider: lastProvider, model: lastModel });
        const failureReason = "Generation could not be assembled. Please retry.";
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      // Never trust Phase B's output shape merely because it compiled —
      // validate through the SAME real ModelWeekDraftSchema every
      // AI-authored week is already checked against before persistence.
      const parsedExpandedWeek = ModelWeekDraftSchema.safeParse(expansion.week);
      if (!parsedExpandedWeek.success) {
        const errorMessage = `Deterministically expanded week ${weekNumber} failed schema validation: ${parsedExpandedWeek.error.message}`;
        logGenerationFailure({
          draftId: params.draftId,
          runId: run.id,
          stage: "week_assembly",
          weekNumber,
          errorCode: "invalid_output",
          errorMessage,
          provider: lastProvider,
          model: lastModel,
          isRetryOrResume: params.isResume,
          completedWeeks: allWeeks.size,
        });
        await failRun(run.id, errorMessage, { provider: lastProvider, model: lastModel });
        const failureReason = "Generation could not be assembled. Please retry.";
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      await saveGenerationWeek(params.draftId, weekNumber, { status: "completed", weekJson: parsedExpandedWeek.data });
      allWeeks.set(weekNumber, parsedExpandedWeek.data);
      await updateRunProgress(run.id, { completedWeeks: allWeeks.size });
      continue;
    }

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

      // Review finding on Phase C candidate 5bfc4bc: the lookup above
      // finds NOTHING for a prior week that was deterministically
      // expanded (Phase B) rather than AI-generated day-by-day — an
      // expanded week persists a single program_generation_weeks row
      // and ZERO program_generation_days rows (see the expansion
      // branch above), by design. Without this fallback, the first
      // canonical week of every block after the first silently lost
      // all prior-day continuity the moment its own preceding week was
      // an expanded one. Only engages when the real lookup found
      // nothing at all: a canonical week is never left partially
      // day-rowed by the time a LATER week starts generating (resume
      // always completes a week fully, or the whole invocation stops,
      // before ever moving to the next one), so "empty" here can only
      // mean "this prior week was expanded," not "this prior week was
      // a partially-completed canonical week." See
      // resolvePriorWeekContinuityFallback's own comment for the
      // lookup itself.
      if (priorWeekDaysByIndex.size === 0) {
        priorWeekDaysByIndex = resolvePriorWeekContinuityFallback(allWeeks.get(weekNumber - 1), shell.days);
      }
    }

    if (architecture === "block" && blockGenerationVersion === 2) {
      // ── Phase D: blueprint-guided, bounded-concurrency canonical
      // week. blockLookup is guaranteed non-null here: architecture
      // === "block" and this week is NOT the expansion branch above
      // (that always `continue`s), so this is necessarily a canonical
      // week within a real block. ──
      const blueprint = deriveCanonicalWeekBlueprint(blockLookup!.block, shell.days, params.brief.experienceLevel);
      const blueprintValidation = validateCanonicalWeekBlueprint(blueprint, shell.days, params.brief.experienceLevel);
      if (!blueprintValidation.ok) {
        logGenerationFailure({
          draftId: params.draftId,
          runId: run.id,
          stage: "week_assembly",
          weekNumber,
          errorCode: "invalid_output",
          errorMessage: blueprintValidation.error,
          provider: lastProvider,
          model: lastModel,
          isRetryOrResume: params.isResume,
          completedWeeks: allWeeks.size,
        });
        await failRun(run.id, blueprintValidation.error, { provider: lastProvider, model: lastModel });
        const failureReason = "Generation could not be assembled. Please retry.";
        await setDraftStatus(params.draftId, "failed", { failureReason });
        return { ok: false, error: failureReason };
      }

      const dayConcurrency = resolveDayConcurrency();
      // Review finding (caught by real staging testing, not by unit
      // tests): under CONCURRENT batching, a batch's outcomes can be
      // non-contiguous — e.g. days 3/4/5 dispatched together, day 3
      // times out, days 4/5 succeed — unlike the legacy serial loop,
      // where a failure always stops at a contiguous prefix by
      // construction (nothing after a failure is ever attempted in the
      // same invocation). A resume's dayStartIndex is only the FIRST
      // missing day, never a guarantee that every later index is ALSO
      // missing — completedDaysThisWeek (already populated above from
      // real persisted rows) is the source of truth for "is this day
      // actually done," and every index already in it must be excluded
      // here or it gets sent to the provider again, silently repeating
      // already-successful expensive work.
      const remainingDayIndexes: number[] = [];
      for (let d = dayStartIndex; d <= shell.days.length; d++) {
        if (!completedDaysThisWeek.has(d)) remainingDayIndexes.push(d);
      }

      for (let batchStart = 0; batchStart < remainingDayIndexes.length; batchStart += dayConcurrency) {
        const batchIndexes = remainingDayIndexes.slice(batchStart, batchStart + dayConcurrency);

        // Time-budget guard, batch-scoped: every call in a batch runs
        // CONCURRENTLY, so the batch's worst-case wall-clock is still
        // just one day's timeout, never the sum — same principle as
        // the legacy per-day guard below, applied once per batch
        // instead of once per call. See DEFAULT_GENERATION_TIME_BUDGET_MS's
        // own comment for the ceiling this budgets against.
        //
        // [Independent review remediation, Finding #14] Reviewed
        // whether the 60s margin already baked into that 240s budget
        // still holds now that a single guard crossing can be followed
        // by up to dayConcurrency (default 5) SEQUENTIAL saveGenerationDay
        // calls, not just one — worst case, the guard permits starting
        // a batch with as little as dayTimeoutMs (45s) of budget left,
        // so a batch that runs the full timeout lands right at the
        // 240s line before persistence even begins. Concluded no
        // change is needed: each saveGenerationDay call here is a
        // single-row upsert of already-generated JSON (no exercise
        // resolution/validation — that only runs once, at whole-draft
        // finalization, outside this per-day loop), so 5 of them in a
        // row cost low single-digit seconds in practice, comfortably
        // inside the existing 60s margin alongside updateRunProgress
        // and the failure-path writes below. Kept the fixed 240s/60s
        // split as-is rather than adding a separate concurrency-aware
        // margin constant — not worth the complexity for a difference
        // this small.
        if (Date.now() - runStartedAt + dayTimeoutMs > timeBudgetMs) {
          const firstDay = batchIndexes[0];
          const firstShellDay = shell.days[firstDay - 1];
          const failureReason = `Progress saved. Continue generation to resume from Week ${weekNumber}, Day ${firstDay} ("${firstShellDay.label}").`;
          await failRun(run.id, "Time budget reached before starting the next canonical-day batch — safe to resume.");
          await setDraftStatus(params.draftId, "failed", { failureReason });
          return { ok: false, error: failureReason };
        }

        await updateRunProgress(run.id, { currentWeek: weekNumber, currentDay: batchIndexes[0] });

        // Computed once per batch — days within the SAME batch run
        // concurrently and cannot see each other's in-flight output
        // (there is nothing sound to give them here; that's exactly
        // why blueprint.ts's pre-computed sibling-allocation intent
        // exists — see generateProgramDay's blueprintIntent argument
        // below). This still reflects everything completed in EARLIER
        // batches/invocations this week, unaffected.
        const weekSoFarSummary = summarizeWeekSoFarForPrompt(completedDaysThisWeek, candidatesById);

        const batchResults = await mapWithConcurrency(batchIndexes, dayConcurrency, async (dayIndex) => {
          const shellDay = shell.days[dayIndex - 1];
          const daySlot = blueprint.days.find((d) => d.dayOfWeek === shellDay.dayOfWeek) ?? null;
          const priorSameDay = priorWeekDaysByIndex.get(dayIndex);
          const priorSameDaySummary = priorSameDay ? summarizeDayForPrompt(priorSameDay) : null;
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
            blueprintIntent: daySlot
              ? {
                  primaryPatternEmphasis: daySlot.primaryPatternEmphasis,
                  // Review finding on Phase D candidate 6734599 (canonical
                  // prompt contract): the canonical week IS the block's
                  // week 1 — for intermediate/mixed, Phase B's own
                  // activation rule only turns an eligible technique on
                  // at the block's FINAL week, so telling canonical
                  // generation "eligible, use it now if appropriate"
                  // would let the AI activate it prematurely, right back
                  // into the "week 1 active -> middle straight -> final
                  // active again" pattern this was meant to fix.
                  // Structurally enforced, not left to natural-language
                  // hope: only advanced/competitive (who are trusted to
                  // activate immediately, and whose canonical choice
                  // Phase B's existing "maintain as assigned" rule then
                  // carries through the whole block unchanged) ever see
                  // a non-null value here — everyone else gets the exact
                  // same "not eligible this week" prompt text the
                  // genuinely-ineligible case already uses, correctly
                  // reflecting "not eligible in week 1" without touching
                  // prompt.ts at all. Activation for intermediate/mixed
                  // happens later, entirely inside Phase B (see this
                  // file's own techniqueEligibilityByDayOfWeek — passed
                  // into expandCanonicalWeek in the deterministic-
                  // expansion branch, independent of what this canonical
                  // prompt said).
                  techniqueEligibility:
                    daySlot.techniqueEligibility && (params.brief.experienceLevel === "advanced" || params.brief.experienceLevel === "competitive")
                      ? daySlot.techniqueEligibility
                      : null,
                  siblingAllocationSummary: summarizeSiblingAllocationsForPrompt(blueprint, shellDay.dayOfWeek),
                }
              : null,
          });
          return { dayIndex, shellDay, dayCandidates, dayOutcome };
        });

        // Persist EVERY result in the batch — success or failure —
        // before deciding whether to stop. A sibling call failing must
        // never cost the coach a provider call that already succeeded:
        // every completed day in this batch is saved exactly like a
        // serial success would be, regardless of what else in the same
        // batch failed (see mapWithConcurrency's own header for why
        // this is safe: generateProgramDay never throws for an
        // ordinary provider failure, it returns one).
        let batchFailure: { dayIndex: number; shellDay: ProgramShellDay; errorMessage: string } | null = null;
        for (const { dayIndex, shellDay, dayCandidates, dayOutcome } of batchResults) {
          if (!dayOutcome.ok) {
            const quotaReleased = await releaseQuotaOnTimeout(
              dayOutcome.errorCode,
              claimId,
              params.draftId,
              run.id,
              daysCompletedThisInvocation > 0,
            );
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
            // First failure encountered wins (deterministic — batchResults
            // preserves batchIndexes' order, not completion order); every
            // OTHER result in the batch still gets persisted by this
            // same loop before the function returns below.
            if (!batchFailure) batchFailure = { dayIndex, shellDay, errorMessage: dayOutcome.errorMessage };
            continue;
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

          const { result: verifiedDay } = verifyDayAgainstCandidates(dayOutcome.day, dayCandidates);
          const alignedDay = alignDayToShellDay(verifiedDay, shellDay);
          const canonicalDay = assignCanonicalDayId(alignedDay);

          await saveGenerationDay(params.draftId, weekNumber, dayIndex, {
            status: "completed",
            dayJson: canonicalDay,
            provider: dayOutcome.provider,
            model: dayOutcome.model,
          });
          completedDaysThisWeek.set(dayIndex, canonicalDay);
          lastProvider = dayOutcome.provider;
          lastModel = dayOutcome.model;
          daysCompletedThisInvocation++;
        }

        await updateRunProgress(run.id, { completedDays: completedDaysThisWeek.size });

        if (batchFailure) {
          await failRun(run.id, batchFailure.errorMessage, { provider: lastProvider, model: lastModel });
          const failureReason = `Generation failed while creating Week ${weekNumber}, Day ${batchFailure.dayIndex} ("${batchFailure.shellDay.label}"). Completed days were saved — you can retry to continue from here.`;
          await setDraftStatus(params.draftId, "failed", { failureReason });
          return { ok: false, error: failureReason };
        }
      }
    } else {
      // ── legacy_day architecture, AND a Phase C (version 1) block
      // draft's canonical week — fully serial, byte-for-byte the
      // original day-by-day mechanism. Never touched by Phase D. ──
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
          const quotaReleased = await releaseQuotaOnTimeout(dayOutcome.errorCode, claimId, params.draftId, run.id, daysCompletedThisInvocation > 0);
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
        const alignedDay = alignDayToShellDay(verifiedDay, shellDay);
        // See assignCanonicalDayId's own comment — this is the one call
        // site, the one moment a day is first persisted as "completed".
        const canonicalDay = assignCanonicalDayId(alignedDay);

        await saveGenerationDay(params.draftId, weekNumber, dayIndex, {
          status: "completed",
          dayJson: canonicalDay,
          provider: dayOutcome.provider,
          model: dayOutcome.model,
        });
        completedDaysThisWeek.set(dayIndex, canonicalDay);
        lastProvider = dayOutcome.provider;
        lastModel = dayOutcome.model;
        daysCompletedThisInvocation++;

        await updateRunProgress(run.id, { completedDays: completedDaysThisWeek.size });
      }
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
