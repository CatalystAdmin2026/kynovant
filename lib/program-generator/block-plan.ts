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
// Deliberately conservative: ANY existing progress on a draft — a
// persisted shell, or any completed week — routes to legacy_day
// unconditionally, regardless of goal. This is what keeps every
// currently-in-flight or already-completed production draft (including
// production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a, "Maddie":
// shell exists, weeks 1-2 completed) on the legacy path with ZERO
// goal-based branching and ZERO new persisted "architecture" flag — the
// check is purely a function of the draft's OWN already-persisted
// state, never a clock, a migration, or a special-cased draft id. Only
// a draft with NO existing shell and ZERO completed weeks at all (a
// genuinely fresh, first-ever generation attempt) is even eligible for
// block routing, and then only if its goal is one of the six Phase A/B
// support (see strategy.ts's isPhaseBlockSupportedGoal —
// athletic_performance is never eligible, at any point).
// ─────────────────────────────────────────────────────────────

export const GENERATION_ARCHITECTURES = ["block", "legacy_day"] as const;
export type GenerationArchitecture = (typeof GENERATION_ARCHITECTURES)[number];

export interface GenerationArchitectureContext {
  goal: TemplateCategory;
  // True if this draft already has a persisted shell OR at least one
  // completed week, from ANY prior attempt — never inferred from
  // isResume alone, since a resume whose every prior attempt failed
  // during the shell call itself would still have zero real progress
  // and should still be treated as fresh.
  hasAnyExistingProgress: boolean;
}

export function resolveGenerationArchitecture(context: GenerationArchitectureContext): GenerationArchitecture {
  if (context.hasAnyExistingProgress) return "legacy_day";
  return isPhaseBlockSupportedGoal(context.goal) ? "block" : "legacy_day";
}
