// ─────────────────────────────────────────────────────────────
// Kynovant — Programming Intelligence Phase C: Block Plan Derivation
//
// PURE. Zero AI, zero DB, zero network, zero env access, imports only
// from ./strategy (itself zero-import beyond ./domain-enums) — same
// purity guarantee as strategy.ts and progression.ts. This module
// bridges Phase A's phase SEQUENCE (derivePhaseSequence returns WHICH
// phase types occur, e.g. ["accumulation","intensification"], but not
// how many of the program's total weeks each one gets) into a concrete,
// week-numbered BlockPlan[] — the smallest runtime representation
// Phase C's orchestration needs to decide, for any given week number,
// whether it is a block's CANONICAL week (needs an AI day-generation
// pass) or one of that block's EXPANDED weeks (needs a deterministic
// Phase B call instead).
//
// No new DB persistence backs this module at all — see
// staged-generation.ts's own integration comment for why: a BlockPlan[]
// is 100% deterministically re-derivable from the brief alone (goal +
// experienceLevel + weeks), which is already persisted on every draft
// today. Resume simply recomputes the same BlockPlan[] fresh every
// time, exactly like this codebase's existing candidateSet
// recomputation — never a reason to regenerate already-completed work,
// since which WEEKS are already complete is read from the existing
// program_generation_weeks table, completely independent of this
// module.
// ─────────────────────────────────────────────────────────────

import {
  deriveBlockLength,
  derivePhaseSequence,
  isPhaseBlockSupportedGoal,
  selectProgressionStrategy,
  type ExperienceLevel,
  type PhaseType,
  type ProgressionStrategy,
  type TemplateCategory,
} from "./strategy";
import { MAX_PROGRAM_WEEKS } from "./domain-enums";

export interface BlockPlan {
  // 1-based, sequential across the whole program (block 1 is always
  // weekStart=1; the last block's weekEnd always equals the program's
  // total weeks — see deriveBlockPlans's own closing invariant check).
  blockNumber: number;
  phaseType: PhaseType;
  weekStart: number;
  weekEnd: number;
  blockLength: number;
  progressionStrategy: ProgressionStrategy;
  // Always equal to weekStart — kept as its own named field because
  // "which week is canonical" is the fact staged-generation.ts's week
  // loop actually branches on, and a reader of that call site shouldn't
  // have to know canonical-week-equals-weekStart is the rule.
  canonicalWeekNumber: number;
}

export type DeriveBlockPlansResult = { ok: true; blocks: BlockPlan[] } | { ok: false; error: string };

// Largest-remainder method: integer allocation proportional to
// `weights`, summing to EXACTLY `total`, every entry >= 1 (a phase can
// never be starved to 0 weeks — deriveBlockLength(phaseType, exp, 0)
// returns 0, which would silently vanish that phase from the program
// entirely if it were ever allocated no weeks at all).
function allocateProportionally(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / weightSum) * total);
  const allocation = raw.map((r) => Math.max(1, Math.floor(r)));
  let allocated = allocation.reduce((a, b) => a + b, 0);

  if (allocated < total) {
    // Give the remainder to whichever phases lost the most to flooring,
    // largest fractional part first — a stable, deterministic tie-break
    // (earlier phase in the sequence wins ties) rather than an
    // arbitrary one.
    const remainders = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    let idx = 0;
    while (allocated < total) {
      allocation[remainders[idx % remainders.length].i] += 1;
      allocated++;
      idx++;
    }
  } else if (allocated > total) {
    // Only reachable when there are more phases than weeks to floor at
    // >=1 each — not reachable via any real derivePhaseSequence
    // output today (it never returns more phases than MIN_PROGRAM_WEEKS
    // could support), but handled correctly regardless: take weeks back
    // from the largest allocations first, never below 1.
    const order = allocation.map((_, i) => i).sort((a, b) => allocation[b] - allocation[a]);
    let idx = 0;
    let safety = 0;
    while (allocated > total && safety++ < order.length * total + 10) {
      const i = order[idx % order.length];
      if (allocation[i] > 1) {
        allocation[i] -= 1;
        allocated--;
      }
      idx++;
    }
  }
  return allocation;
}

// Bridges derivePhaseSequence's phase-type sequence into concrete,
// week-numbered blocks. Each phase's own share of the program's total
// weeks is proportional to that phase's NATURAL (unconstrained)
// single-block length — queried through deriveBlockLength itself
// (passing MAX_PROGRAM_WEEKS as the pool, larger than any phase's own
// PHASE_BLOCK_BOUNDS max, so the result is exactly that phase's own
// preferred length with no new knowledge of strategy.ts's private
// constants required) — never a new hardcoded per-phase weight, which
// would reintroduce the exact "a value can drift because it's mirrored
// instead of derived" class of problem Phase A's own review already
// fixed once. A phase's allotted pool is then carved into one or more
// same-phase-type blocks via repeated deriveBlockLength calls — the
// same "carve weeksRemainingInPhase into blocks" loop strategy.test.ts's
// own "[J]" test already exercises as a general property of
// deriveBlockLength, now applied to a real per-program allocation.
export function deriveBlockPlans(goal: TemplateCategory, experienceLevel: ExperienceLevel, weeks: number): DeriveBlockPlansResult {
  const phaseResult = derivePhaseSequence(goal, experienceLevel, weeks);
  if (!phaseResult.ok) return phaseResult;

  // Pathological-but-valid edge case: derivePhaseSequence deliberately
  // NEVER collapses away a goal-defining trailing phase (competition_prep's
  // taper is the clearest example — see strategy.ts's own "ALWAYS ends
  // in taper, even for a pathologically short program" invariant), so it
  // can return MORE phases than there are actual weeks to allocate
  // (e.g. ["accumulation","taper"] for a 1-week competition_prep
  // program). Every materialized block needs at least 1 week, so when
  // weeks < phases.length it is structurally impossible to materialize
  // every listed phase as its own block. Trim from the FRONT (drop the
  // earliest phases first), keeping the LAST `weeks` phases — this
  // generalizes derivePhaseSequence's own priority (the culminating,
  // goal-defining phase — taper for competition_prep, realization for
  // muscle_growth's longest programs — is the one that must survive)
  // rather than dropping arbitrarily or from the tail.
  const phases = weeks < phaseResult.phases.length ? phaseResult.phases.slice(phaseResult.phases.length - weeks) : phaseResult.phases;

  const naturalWeights = phases.map((phaseType) => deriveBlockLength(phaseType, experienceLevel, MAX_PROGRAM_WEEKS));
  const perPhaseWeeks = allocateProportionally(weeks, naturalWeights);

  const blocks: BlockPlan[] = [];
  let weekCursor = 1;
  let blockNumber = 1;
  for (let i = 0; i < phases.length; i++) {
    const phaseType = phases[i];
    let remainingInPhase = perPhaseWeeks[i];
    let guard = 0;
    while (remainingInPhase > 0 && guard++ < MAX_PROGRAM_WEEKS) {
      const blockLength = deriveBlockLength(phaseType, experienceLevel, remainingInPhase);
      if (blockLength <= 0) break; // defensive; remainingInPhase > 0 already guarantees a positive length
      const weekStart = weekCursor;
      const weekEnd = weekCursor + blockLength - 1;
      blocks.push({
        blockNumber: blockNumber++,
        phaseType,
        weekStart,
        weekEnd,
        blockLength,
        progressionStrategy: selectProgressionStrategy(goal, experienceLevel, phaseType),
        canonicalWeekNumber: weekStart,
      });
      weekCursor += blockLength;
      remainingInPhase -= blockLength;
    }
  }

  if (weekCursor - 1 !== weeks) {
    // Structurally unreachable given allocateProportionally's own
    // sum-to-`weeks` guarantee and deriveBlockLength's own
    // weeksRemainingInPhase clamp — kept as an explicit, named failure
    // (never a silently-short BlockPlan[]) since staged-generation.ts's
    // resume logic downstream relies on this covering the whole
    // program exactly.
    return {
      ok: false,
      error: `Internal block-plan derivation error: blocks covered ${weekCursor - 1} of ${weeks} weeks — this should never happen.`,
    };
  }

  return { ok: true, blocks };
}

export interface BlockWeekLookup {
  block: BlockPlan;
  isCanonicalWeek: boolean;
}

// Given an already-derived BlockPlan[] (call deriveBlockPlans once per
// generation attempt and reuse the result — this function itself does
// no derivation), finds which block a given absolute week number
// belongs to and whether it is that block's canonical (first) week.
export function findBlockForWeek(blocks: BlockPlan[], weekNumber: number): BlockWeekLookup | null {
  const block = blocks.find((b) => weekNumber >= b.weekStart && weekNumber <= b.weekEnd);
  if (!block) return null;
  return { block, isCanonicalWeek: weekNumber === block.canonicalWeekNumber };
}

// ─────────────────────────────────────────────────────────────
// LEGACY vs BLOCK ARCHITECTURE ROUTING
//
// A typed decision point instead of a fragile string check scattered
// through orchestration (Phase C task's own explicit instruction).
//
// Review finding on Phase C candidate 5bfc4bc: an earlier version of
// this decision inferred "is this draft new" from whether it had any
// PERSISTED PROGRESS (a shell, or a completed week) — but that is a
// content-state heuristic, not a lifecycle signal, and a historical
// draft that failed before ever producing a shell or a completed week
// (e.g. the very first provider call itself failed) has EXACTLY the
// same "zero progress" shape as a genuinely brand-new draft. Under the
// old rule, resuming that historical draft for a now-Phase-C-supported
// goal would silently route it into block architecture — a real
// backward-compatibility violation: a draft's generation philosophy
// must never change based on accidental content state.
//
// Fixed by using this repository's own EXISTING explicit lifecycle
// signal — StagedGenerationParams.isResume, which every caller already
// sets correctly (generateProgramDraftAction: false; resumeGenerationAction:
// true) — instead of guessing from shell/week state. This function
// itself now only ever answers "what would a genuinely NEW draft get,"
// and is called from exactly one place (runStagedGeneration) in
// exactly one case: isResume === false AND no persisted
// generationArchitecture exists yet. Every resume with a still-null
// persisted architecture (migration 0036) — regardless of how much or
// how little progress happens to exist — is forced to legacy_day
// directly in runStagedGeneration, never routed through this function
// at all. See runStagedGeneration's own routing comment for the full
// three-way decision.
//
// This is what keeps a historical draft (including production draft
// 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a, "Maddie": shell exists, weeks
// 1-2 completed, generationArchitecture null) on the legacy path
// unconditionally, AND now also covers the historical-draft shapes
// Maddie's own specific state doesn't happen to exercise (no shell at
// all, a failed Week 1, partial day rows) — every one of them shares
// the same defining trait: isResume is true and generationArchitecture
// is still null, which is a lifecycle fact, not a content-state guess.
// ─────────────────────────────────────────────────────────────

export const GENERATION_ARCHITECTURES = ["block", "legacy_day"] as const;
export type GenerationArchitecture = (typeof GENERATION_ARCHITECTURES)[number];

export interface GenerationArchitectureContext {
  goal: TemplateCategory;
}

// Only ever answers "what would a genuinely NEW draft get" — see this
// section's own header for why resume-with-null-architecture is
// handled entirely by the caller instead, never by inferring anything
// here from progress state.
export function resolveGenerationArchitecture(context: GenerationArchitectureContext): GenerationArchitecture {
  return isPhaseBlockSupportedGoal(context.goal) ? "block" : "legacy_day";
}

// ─────────────────────────────────────────────────────────────
// BLOCK GENERATION VERSION (Phase D)
//
// Review finding on Phase D candidate 6734599: the original inline
// resolution (`existingGenerationArchitectureVersion ?? CURRENT_
// BLOCK_GENERATION_VERSION`) silently upgraded a RESUME of an
// existing "block" draft with a null persisted version — a real
// pre-Phase-D (Phase C) block draft — to the CURRENT default (2,
// blueprint+concurrent) at RUNTIME, even though migration 0038's own
// documented contract says a null version on an existing block draft
// means version 1 (Phase C serial), never re-interpreted. The
// persisted DB value itself was never corrupted by this bug (nothing
// wrote 2 to a null-version row), but the ACTUAL GENERATION BEHAVIOR
// for that resume was wrong — exactly the same class of bug Phase C's
// own "any existing progress -> legacy_day" fix addressed for
// architecture itself, now recurring one layer down for version.
//
// This function is the ONE place that decision is made — never
// scattered `?? CURRENT_BLOCK_GENERATION_VERSION` at a call site.
// Mirrors resolveGenerationArchitecture's own isResume-based
// precedence exactly, one layer down:
//   1. architecture !== "block" -> version is always null (a version
//      is only ever meaningful for "block" — see migration 0038's own
//      pairing CHECK constraint).
//   2. A persisted version already exists (1 or 2) -> ALWAYS honored,
//      never re-derived.
//   3. isResume === true with persistedVersion still null -> this can
//      ONLY be a historical block draft that predates migration 0038 (or
//      a resume of a draft whose very first attempt never got far
//      enough to decide a version at all) — interpret as version 1
//      (Phase C serial), never as "whatever the current code defaults
//      to." A malformed persisted value is expected to already have
//      been sanitized to null by the caller (see actions.ts's
//      parseGenerationArchitectureVersion) before it ever reaches
//      here — this function treats null and "malformed-then-sanitized"
//      identically, both failing closed to the same safe value.
//   4. Neither of the above — a genuinely NEW block draft
//      (isResume === false) — gets the CURRENT default.
//
// On "prove runtime behavior, not just the stored value" (the
// remediation task's own explicit demand, since the original bug left
// the STORED version untouched and only corrupted in-memory behavior):
// staged-generation.ts calls this function once and uses its return
// value, unmodified, as the SOLE branch condition for every
// version-dependent decision that follows (blueprint computation, the
// concurrent-batch loop vs. the legacy serial loop, whether
// techniqueEligibilityByDayOfWeek is ever computed at all). There is
// no second, parallel place that independently re-derives "which
// version to run" the way the original `?? CURRENT_VERSION` bug did —
// that duality (one expression implicitly describing what to persist,
// a different one deciding what to run) was the actual defect. An
// integration-level test proving the persisted column AND confirming,
// by direct code inspection, that the branch condition reads the same
// resolved value is therefore sufficient here; it was not sufficient
// against the original code, which is exactly what made the original
// bug possible. (A content-based end-to-end proof — e.g. asserting a
// technique never activates for a v1-resumed draft — was attempted and
// discarded: the shared dev-fixture's buildBlueprint() only ever emits
// a single "main_lift" section, so findTechniqueActivationTarget()
// legitimately returns null regardless of version, making that
// particular signal version-blind rather than version-proving with
// this fixture. See progression.test.ts's "technique ACTIVATION from
// eligibility" suite for the real positive/negative proof of the
// eligibility mechanism itself, using a fixture built specifically to
// have an eligible activation target.)
// ─────────────────────────────────────────────────────────────

export interface BlockGenerationVersionContext {
  architecture: GenerationArchitecture;
  persistedVersion: 1 | 2 | null;
  isResume: boolean;
}

export function resolveEffectiveBlockGenerationVersion(
  context: BlockGenerationVersionContext,
  currentDefaultVersion: 1 | 2,
): 1 | 2 | null {
  if (context.architecture !== "block") return null;
  if (context.persistedVersion === 1 || context.persistedVersion === 2) return context.persistedVersion;
  return context.isResume ? 1 : currentDefaultVersion;
}
