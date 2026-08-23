// ─────────────────────────────────────────────────────────────
// Kynovant — Programming Intelligence Phase D: Canonical Week Blueprint
//
// PURE. Zero AI, zero DB, zero network, zero env access. Imports only
// from ./strategy and ./block-plan (both already zero-import beyond
// ./domain-enums) — same purity guarantee as every other Phase A/B/C
// pure module.
//
// SECTION 4 DECISION (AI vs deterministic), made BEFORE writing this
// file, not assumed: evaluated (A) fully deterministic from shell +
// strategy, (B) one small AI call, (C) hybrid. Chose (A).
//
// Evidence: ProgramShellDaySchema (contracts.ts) already carries
// per-day `targetMuscleGroups` and `focus`, assigned ONCE by the
// existing shell-generation call and held fixed for the whole program
// — the exact "which muscle groups belong on which day" structure a
// blueprint would otherwise have to re-derive. The one thing genuinely
// MISSING for safe day concurrency is finer-grained SIBLING
// COORDINATION within a day-cluster that already shares a muscle group
// (two "lower body" days can each legally draw from the same squat/
// hinge/lunge candidate pool and — exactly the failure mode measured
// in the blind-concurrency prototype, commit 0e1936f: duplicate-main-
// lift warnings 6->24 — independently converge on the IDENTICAL
// exercise with no visibility into each other's in-flight pick).
// Diversifying which MovementPattern (lib/db/schema-exercise.ts's real
// movementPatternEnum — already on every ExerciseCandidate, already
// consumed by week-cross-day-validation.ts's own redundancy checks) a
// day should emphasize is a PURE SET-ASSIGNMENT problem given the
// shell's already-known muscle-group overlap — it needs no model
// judgment, and paying for an extra AI call here would add pure serial
// latency (a blueprint call must complete before any day in its week
// can start) directly working against Phase D's whole performance
// goal. See PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT (week-cross-day-
// validation.ts) — this module exists specifically to reduce how often
// that exact finding fires, using the SAME enum that check already
// reads.
// ─────────────────────────────────────────────────────────────

import { effortBandFor, type ExperienceLevel, type PhaseType, type ProgressionStrategy } from "./strategy";
import type { BlockPlan } from "./block-plan";

// Loosely typed (not the real DB enums) for the same reason
// progression.ts's CanonicalPrescription.setTechnique is loosely typed
// — this module reads/writes a small, explicitly named subset of
// values and must never import lib/db/schema-exercise.ts (a real
// dependency, not a dependency-free domain module).
export interface BlueprintShellDay {
  dayOfWeek: number;
  label: string;
  targetMuscleGroups?: string[];
}

export interface DaySlotBlueprint {
  dayOfWeek: number;
  label: string;
  targetMuscleGroups: string[];
  // A soft EMPHASIS hint for this day's primary compound/main-lift
  // slot — never a hard mandate, and never a claim that this pattern
  // is the only correct choice for these muscle groups. Only assigned
  // when this day's targetMuscleGroups genuinely overlap another day's
  // in the SAME week (see deriveCanonicalWeekBlueprint's own comment);
  // null means "no sibling-overlap risk detected — no constraint
  // needed." The AI retains full judgment over the SPECIFIC exercise;
  // this only nudges which movement PATTERN family it should look to
  // first when it does have a choice.
  primaryPatternEmphasis: string | null;
  // TECHNIQUE ELIGIBILITY (Section 7) — resolves the Phase B/C P2:
  // ownership of "is a high-fatigue intensity technique appropriate
  // for this slot AT ALL" now belongs here, upstream of both canonical
  // generation and Phase B's own activation-TIMING logic (unchanged —
  // still beginner: never / intermediate: late-block only / advanced:
  // maintained). null means NOT eligible; canonical-day generation
  // must not introduce an intensity technique on this day at all. A
  // non-null value names the ONE technique this slot may use, on ONE
  // exercise, if the day's own content makes it appropriate — still
  // never a mandate.
  techniqueEligibility: string | null;
}

export interface CanonicalWeekBlueprint {
  blockNumber: number;
  canonicalWeekNumber: number;
  phaseType: PhaseType;
  progressionStrategy: ProgressionStrategy;
  days: DaySlotBlueprint[];
}

// Fixed, deterministic cycling order — not a claim that this is the
// One True Sequence for every muscle group, only a stable, repeatable
// way to guarantee two sibling days sharing a muscle group don't land
// on the same pattern. Order deliberately starts with the two most
// common "big compound" patterns (bilateral squat, hip hinge) since
// those are what the duplicate-main-lift finding almost always
// actually names.
const PATTERN_CYCLE = [
  "squat_bilateral",
  "hip_hinge",
  "push_horizontal",
  "pull_horizontal",
  "squat_unilateral",
  "push_vertical",
  "pull_vertical",
  "lunge",
] as const;

// Technique eligibility pool — the same small, named subset of
// setTechniqueEnum's high-fatigue intensity techniques progression.ts's
// own INTENSITY_SET_TECHNIQUES already classifies (kept as an
// independent local list rather than importing progression.ts's
// private constant, to keep this module's own import surface at
// exactly ./strategy and ./block-plan).
const TECHNIQUE_ELIGIBILITY_POOL = ["rest_pause", "drop_set", "myo_reps"] as const;

function groupOverlappingDays(days: BlueprintShellDay[]): BlueprintShellDay[][] {
  // Union-find over "shares at least one targetMuscleGroup" — days
  // with no targetMuscleGroups at all never overlap anything (no
  // constraint is the permissive, correct default — mirrors
  // narrowCandidatesForDay's own fallback philosophy for a shell that
  // predates this field).
  const groups: BlueprintShellDay[][] = [];
  for (const day of days) {
    if (!day.targetMuscleGroups || day.targetMuscleGroups.length === 0) {
      groups.push([day]);
      continue;
    }
    const overlapping = groups.find((g) =>
      g.some((d) => d.targetMuscleGroups?.some((mg) => day.targetMuscleGroups!.includes(mg))),
    );
    if (overlapping) overlapping.push(day);
    else groups.push([day]);
  }
  return groups;
}

function deriveTechniqueEligibility(
  experienceLevel: ExperienceLevel,
  blockNumber: number,
  dayIndex: number,
  totalDays: number,
): string | null {
  // Beginner: never eligible — mirrors strategy.ts's own effortBandFor
  // "conservative" band and progression.ts's own "none by default"
  // technique-timing rule for this experience level. Restated here,
  // not imported, because this is a distinct decision (ELIGIBILITY,
  // not activation timing) that happens to reach the same beginner
  // answer for the same underlying reason.
  const effortBand = effortBandFor(experienceLevel);
  if (effortBand === "conservative") return null;

  // Exactly one eligible slot for a moderate effort band (intermediate/
  // mixed); two for aggressive (advanced/competitive) — deterministic,
  // not "the AI's free choice," which is the whole point. Slot(s)
  // chosen by rotating through days based on blockNumber so different
  // blocks don't always land on the same physical day-of-week.
  const eligibleSlotCount = effortBand === "aggressive" ? 2 : 1;
  const eligibleDayIndexes = new Set<number>();
  for (let i = 0; i < eligibleSlotCount; i++) {
    eligibleDayIndexes.add((blockNumber - 1 + i) % totalDays);
  }
  if (!eligibleDayIndexes.has(dayIndex)) return null;

  return TECHNIQUE_ELIGIBILITY_POOL[(blockNumber - 1 + dayIndex) % TECHNIQUE_ELIGIBILITY_POOL.length];
}

export function deriveCanonicalWeekBlueprint(
  block: BlockPlan,
  shellDays: BlueprintShellDay[],
  experienceLevel: ExperienceLevel,
): CanonicalWeekBlueprint {
  const groups = groupOverlappingDays(shellDays);

  const patternByDayOfWeek = new Map<number, string | null>();
  for (const group of groups) {
    if (group.length < 2) {
      // No sibling-overlap risk — no constraint needed (the permissive
      // default; see groupOverlappingDays's own comment).
      for (const day of group) patternByDayOfWeek.set(day.dayOfWeek, null);
      continue;
    }
    group.forEach((day, i) => {
      patternByDayOfWeek.set(day.dayOfWeek, PATTERN_CYCLE[i % PATTERN_CYCLE.length]);
    });
  }

  const days: DaySlotBlueprint[] = shellDays.map((shellDay, dayIndex) => ({
    dayOfWeek: shellDay.dayOfWeek,
    label: shellDay.label,
    targetMuscleGroups: shellDay.targetMuscleGroups ?? [],
    primaryPatternEmphasis: patternByDayOfWeek.get(shellDay.dayOfWeek) ?? null,
    techniqueEligibility: deriveTechniqueEligibility(experienceLevel, block.blockNumber, dayIndex, shellDays.length),
  }));

  return {
    blockNumber: block.blockNumber,
    canonicalWeekNumber: block.canonicalWeekNumber,
    phaseType: block.phaseType,
    progressionStrategy: block.progressionStrategy,
    days,
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 16 — deterministic blueprint validation, run BEFORE any day
// call so a real defect never wastes a single provider call. Same
// discriminated-result convention as the rest of this codebase.
// Deliberately NOT dogmatic (per explicit instruction): only checks
// structural invariants this module itself is responsible for getting
// right, never re-litigates the shell's own content (that's
// ProgramShellSchema's job, already enforced at generation time).
// ─────────────────────────────────────────────────────────────

export type BlueprintValidationResult = { ok: true } | { ok: false; error: string };

export function validateCanonicalWeekBlueprint(
  blueprint: CanonicalWeekBlueprint,
  shellDays: BlueprintShellDay[],
  experienceLevel: ExperienceLevel,
): BlueprintValidationResult {
  if (blueprint.days.length !== shellDays.length) {
    return {
      ok: false,
      error: `Blueprint has ${blueprint.days.length} day slots but the shell defines ${shellDays.length} — every shell day must be represented exactly once.`,
    };
  }

  const shellDaysOfWeek = new Set(shellDays.map((d) => d.dayOfWeek));
  const blueprintDaysOfWeek = blueprint.days.map((d) => d.dayOfWeek);
  if (new Set(blueprintDaysOfWeek).size !== blueprintDaysOfWeek.length) {
    return { ok: false, error: "Blueprint contains a duplicate dayOfWeek slot." };
  }
  for (const dow of blueprintDaysOfWeek) {
    if (!shellDaysOfWeek.has(dow)) {
      return { ok: false, error: `Blueprint slot dayOfWeek=${dow} does not match any shell day.` };
    }
  }

  // Technique eligibility must respect the same experience-based
  // ceiling deriveTechniqueEligibility itself enforces — checked again
  // here in case a blueprint ever reaches this validator from anywhere
  // other than deriveCanonicalWeekBlueprint (defensive, not redundant:
  // this is the one gate that runs before any provider spend).
  const eligibleCount = blueprint.days.filter((d) => d.techniqueEligibility !== null).length;
  if (effortBandFor(experienceLevel) === "conservative" && eligibleCount > 0) {
    return { ok: false, error: "A beginner-experience blueprint must never mark any day technique-eligible." };
  }
  const maxEligible = effortBandFor(experienceLevel) === "aggressive" ? 2 : 1;
  if (eligibleCount > maxEligible) {
    return {
      ok: false,
      error: `Blueprint marks ${eligibleCount} days technique-eligible — at most ${maxEligible} is allowed for this experience level.`,
    };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// SECTION 18 — compact sibling-allocation summary for the day prompt.
// One short line per OTHER day in the week — never this day's own
// slot, never another day's generated content (there isn't any yet;
// that's the whole point of concurrency-safety here). Kept to plain
// text, reusing the exact wording style summarizeDayForPrompt/
// summarizeWeekSoFarForPrompt (prompt.ts) already use, so day prompts
// gain one more compact section, not a second incompatible format.
// ─────────────────────────────────────────────────────────────

export function summarizeSiblingAllocationsForPrompt(blueprint: CanonicalWeekBlueprint, forDayOfWeek: number): string | null {
  const others = blueprint.days.filter((d) => d.dayOfWeek !== forDayOfWeek);
  if (others.length === 0) return null;
  return others
    .map((d) => {
      const muscles = d.targetMuscleGroups.length > 0 ? d.targetMuscleGroups.join("/") : "unspecified focus";
      const pattern = d.primaryPatternEmphasis ? `, emphasizing ${d.primaryPatternEmphasis.replace(/_/g, " ")}` : "";
      return `- ${d.label} (${muscles}${pattern})`;
    })
    .join("\n");
}
