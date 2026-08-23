// ─────────────────────────────────────────────────────────────
// Kynovant — Programming Intelligence: Deterministic Strategy Layer
//
// PURE LOGIC ONLY. No AI provider, no DB, no network, no side effects.
// Every export here is a plain function of its arguments — same input,
// same output, forever. This is deliberate and load-bearing: this
// module is Phase A of the Programming Intelligence Framework's
// approved incremental rollout (see the framework design report) —
// the "smallest, safest, most testable" slice, built and reviewed
// BEFORE any blueprint/canonical-week/provider-orchestration code
// touches it. Nothing in lib/program-generator/staged-generation.ts,
// provider.ts, or actions.ts imports this file yet; wiring it in is a
// later, separately-reviewed phase.
//
// TemplateCategory/ExperienceLevel are deliberately NOT imported from
// contracts.ts (which would transitively reference lib/db/schema.ts).
// The two unions below are hand-mirrored from templateCategoryEnum/
// experienceLevelEnum (lib/db/schema.ts) — duplicated on purpose, not
// because the values differ, so this module's "zero imports outside
// itself" property is trivially, statically provable rather than
// resting on import-type-erasure semantics. If those enums ever change,
// TypeScript's exhaustiveness checks below (the `never` defaults in
// each switch) will fail to compile until this file is updated too —
// drift is caught at build time, not silently ignored.
//
// PRODUCT-SEMANTIC CONTRACT (verified against the real UI/schema/
// nutrition code before this file was written, not assumed):
//   competition_prep      = PHYSIQUE / BODYBUILDING competition prep.
//   athletic_performance  = SPORTS / PERFORMANCE-EVENT prep.
// athletic_performance is DELIBERATELY EXCLUDED from this Phase/Block
// architecture for now — it stays on the currently-shipped generator.
// Every phase-sequence function below fails closed (a typed error
// result, never a silent fallback) if called for it.
// ─────────────────────────────────────────────────────────────

// Mirrors lib/db/schema.ts's templateCategoryEnum exactly.
export type TemplateCategory =
  | "fat_loss"
  | "muscle_growth"
  | "body_recomposition"
  | "athletic_performance"
  | "lifestyle"
  | "competition_prep"
  | "executive_performance";

// Mirrors lib/db/schema.ts's experienceLevelEnum exactly.
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "competitive" | "mixed";

// ─────────────────────────────────────────────────────────────
// TAXONOMY — deliberately this small. Nothing here exists unless the
// framework design report showed a concrete decision that needs it.
// ─────────────────────────────────────────────────────────────

export const PHASE_TYPES = [
  "foundation",
  "accumulation",
  "intensification",
  "realization",
  "deload",
  "taper",
  "resensitization",
] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

export const EXERCISE_ROLES = [
  "staple",
  "secondary_compound",
  "accessory",
  "isolation",
  "corrective",
  "conditioning",
] as const;
export type ExerciseRole = (typeof EXERCISE_ROLES)[number];

export const PROGRESSION_STRATEGIES = ["rep", "double", "rir", "volume_density", "taper"] as const;
export type ProgressionStrategy = (typeof PROGRESSION_STRATEGIES)[number];

// The six goals this architecture supports in v1. athletic_performance
// is the one TemplateCategory value intentionally absent — see the
// header comment and derivePhaseSequence's own guard below.
const PHASE_BLOCK_SUPPORTED_GOALS: ReadonlySet<TemplateCategory> = new Set([
  "fat_loss",
  "muscle_growth",
  "body_recomposition",
  "lifestyle",
  "competition_prep",
  "executive_performance",
]);

export function isPhaseBlockSupportedGoal(goal: TemplateCategory): boolean {
  return PHASE_BLOCK_SUPPORTED_GOALS.has(goal);
}

// ─────────────────────────────────────────────────────────────
// derivePhaseSequence — deterministic goal x experience x length lookup.
//
// Same discriminated-result convention used throughout this codebase
// (ParseResult, EditOpResult, RegenerateDayResult, ...) rather than a
// throw — athletic_performance is an expected, typed non-support case,
// not an exceptional one.
//
// Short/simple programs collapse to a single phase rather than
// manufacturing meaningless boundaries (framework report, Section 2)
// — EXCEPT competition_prep, where a peak/taper phase is the entire
// point of the goal and is never collapsed away, even for a short
// program (see the competition_prep branch below).
// ─────────────────────────────────────────────────────────────

export type PhaseSequenceResult = { ok: true; phases: PhaseType[] } | { ok: false; error: string };

export function derivePhaseSequence(
  goal: TemplateCategory,
  experienceLevel: ExperienceLevel,
  weeks: number,
): PhaseSequenceResult {
  if (goal === "athletic_performance") {
    return {
      ok: false,
      error:
        "athletic_performance is not supported by the Phase/Block Programming Intelligence architecture yet — " +
        "it remains on the current staged (week/day) generator. See the framework design report's Section 7.",
    };
  }

  const isBeginner = experienceLevel === "beginner";

  switch (goal) {
    case "muscle_growth":
    case "body_recomposition": {
      // Same phase shape — body_recomposition is muscle_growth with a
      // density-flavored lens applied at the block/progression level,
      // not a different phase graph (framework report, Section 4).
      if (weeks <= 6) return { ok: true, phases: [isBeginner ? "foundation" : "accumulation"] };
      if (weeks <= 11) {
        return { ok: true, phases: isBeginner ? ["foundation", "accumulation"] : ["accumulation", "intensification"] };
      }
      return {
        ok: true,
        phases: isBeginner
          ? ["foundation", "accumulation", "intensification"]
          : ["accumulation", "intensification", "realization"],
      };
    }

    case "fat_loss": {
      // Deliberately flatter than muscle_growth — adherence/density
      // matter more than phase-count sophistication for this goal
      // (framework report, Sections 2 and 4). Exercise ROTATION cadence
      // is unaffected by this goal at all (see the exercise-role
      // functions below) — only phase/progression logic differs here.
      if (weeks <= 8) return { ok: true, phases: [isBeginner ? "foundation" : "accumulation"] };
      return { ok: true, phases: isBeginner ? ["foundation", "accumulation", "intensification"] : ["accumulation", "intensification"] };
    }

    case "lifestyle": {
      // Nearly flat regardless of length — low novelty pressure, high
      // consistency value (framework report, Section 4).
      if (!isBeginner) return { ok: true, phases: ["accumulation"] };
      return { ok: true, phases: weeks <= 8 ? ["foundation"] : ["foundation", "accumulation"] };
    }

    case "executive_performance": {
      // Flatter than muscle_growth, capped at 2 phases regardless of
      // length — time-efficiency and consistency over aggressive
      // periodization (framework report, Section 4).
      if (weeks <= 8) return { ok: true, phases: [isBeginner ? "foundation" : "accumulation"] };
      return { ok: true, phases: isBeginner ? ["foundation", "accumulation"] : ["accumulation", "intensification"] };
    }

    case "competition_prep": {
      // PHYSIQUE/BODYBUILDING prep (product-semantic contract, see this
      // file's header) — training programming only. A peak/taper is
      // this goal's entire point and is NEVER collapsed away, even for
      // a short program; no nutrition/water/sodium/carb manipulation of
      // any kind belongs in this module or this goal's training logic.
      if (weeks <= 8) return { ok: true, phases: ["accumulation", "taper"] };
      return {
        ok: true,
        phases: isBeginner
          ? ["foundation", "accumulation", "intensification", "taper"]
          : ["accumulation", "intensification", "taper"],
      };
    }

    default: {
      const exhaustive: never = goal;
      return { ok: false, error: `Unhandled goal: ${String(exhaustive)}` };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// deriveBlockLength — phase objective is the PRIMARY driver; experience
// is a small, phase-specific modifier, never the primary one.
//
// Explicitly does NOT restore: "advanced = automatically shorter
// blocks" or "fat_loss = automatically 2-week blocks" (both were real
// defects in an earlier draft of this framework — see the adversarial
// refinement report's Sections 1, 2, and 9). Block length here is a
// function of what a PHASE is trying to accomplish; fat_loss's own
// goal-specific behavior lives entirely in derivePhaseSequence and
// selectProgressionStrategy, never in this function.
// ─────────────────────────────────────────────────────────────

const PHASE_BASE_BLOCK_LENGTH: Record<PhaseType, number> = {
  foundation: 4,
  accumulation: 3,
  intensification: 2,
  realization: 2,
  deload: 1,
  taper: 1,
  resensitization: 3,
};

// [min, max] weeks a block of this phase type may ever be, regardless
// of any modifier — a hard bound, not a suggestion.
const PHASE_BLOCK_BOUNDS: Record<PhaseType, readonly [number, number]> = {
  foundation: [3, 5],
  accumulation: [2, 5],
  intensification: [2, 4],
  realization: [2, 3],
  deload: [1, 1],
  taper: [1, 2],
  resensitization: [2, 4],
};

// Experience modifies block length only at the margins, and only for
// specific phases — not a blanket "advanced = shorter" rule anywhere.
// Beginners get MORE time per block everywhere (motor learning takes
// longer); competitive trainees get slightly LESS time, but only in
// the phases where that's actually justified (intensification/
// realization — closer to a specific readiness target, where holding
// a stable structure for as long as a beginner-length block would
// blunt precision), never in foundation/accumulation/deload/taper.
function experienceBlockModifier(phaseType: PhaseType, experienceLevel: ExperienceLevel): number {
  if (experienceLevel === "beginner") return 1;
  if (experienceLevel === "competitive" && (phaseType === "intensification" || phaseType === "realization")) return -1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveBlockLength(phaseType: PhaseType, experienceLevel: ExperienceLevel, weeksRemainingInPhase: number): number {
  if (weeksRemainingInPhase <= 0) return 0;

  const base = PHASE_BASE_BLOCK_LENGTH[phaseType];
  const modifier = experienceBlockModifier(phaseType, experienceLevel);
  const [min, max] = PHASE_BLOCK_BOUNDS[phaseType];

  let length = clamp(base + modifier, min, max);
  // A block can never be longer than what's actually left in the phase.
  length = Math.min(length, weeksRemainingInPhase);

  // Orphan-week guard: never leave exactly 1 week stranded after this
  // block for a future call to be stuck turning into its own "normal"
  // 1-week block — absorb it into THIS block instead. Only applies
  // when this isn't already consuming the whole remaining phase.
  const remainderAfter = weeksRemainingInPhase - length;
  if (remainderAfter === 1 && length < weeksRemainingInPhase) {
    length += 1;
  }

  return Math.max(1, length);
}

// ─────────────────────────────────────────────────────────────
// selectProgressionStrategy — experience sets the baseline; phase
// objective and goal can legitimately override it. Never fabricates a
// load number — this only names HOW progression happens, not a
// specific weight (see EffortBand below for the same discipline
// applied to effort/RIR).
// ─────────────────────────────────────────────────────────────

// Goals whose density/adherence emphasis (framework report, Sections
// 2, 4, 11) makes Volume/Density progression the legitimate choice —
// but only in the phase(s) where that emphasis actually applies, never
// a blanket override of every phase for these goals.
function goalCallsForVolumeDensity(goal: TemplateCategory, phaseType: PhaseType): boolean {
  if (goal === "fat_loss") return true; // flat emphasis across this goal's whole phase graph
  if ((goal === "body_recomposition" || goal === "executive_performance") && phaseType === "accumulation") {
    return true; // density matters most in the base-building phase for these two; intensification reverts to the experience-driven default
  }
  return false;
}

export function selectProgressionStrategy(
  goal: TemplateCategory,
  experienceLevel: ExperienceLevel,
  phaseType: PhaseType,
): ProgressionStrategy {
  // Phase objective overrides everything — a taper phase always uses
  // the Taper strategy, non-negotiably, regardless of goal/experience.
  if (phaseType === "taper") return "taper";
  // A deload IS a volume/intensity reduction by definition — the
  // deterministic engine expresses it as a Volume/Density change, not
  // an RIR/rep-range change.
  if (phaseType === "deload") return "volume_density";

  if (goalCallsForVolumeDensity(goal, phaseType)) return "volume_density";

  if (experienceLevel === "beginner") return "rep";
  if (experienceLevel === "intermediate" || experienceLevel === "mixed") return "double";
  return "rir"; // advanced, competitive
}

// ─────────────────────────────────────────────────────────────
// Exercise-role retention — CRITICAL INVARIANT: a block transition is
// NOT an exercise-rotation event. These two functions describe a
// role's default behavior; nothing about them fires "because a new
// block started" on its own (see the framework design report's
// Section 10 for the full block-transition-vs-rotation-event
// distinction — that trigger logic lives in a later phase, not here).
// ─────────────────────────────────────────────────────────────

// Minimum number of blocks a role should be retained for before ANY
// rotation is even considered, absent an independent trigger (pain,
// equipment loss, genuine multi-block stagnation). corrective/mobility
// work isn't governed by block-count retention at all — its rotation
// trigger is "the underlying issue changed," not elapsed time —
// represented as Infinity rather than an arbitrary large number, since
// that's what it actually means, not a magic constant.
const MIN_RETENTION_BLOCKS: Record<ExerciseRole, number> = {
  staple: 2,
  secondary_compound: 1,
  accessory: 1,
  isolation: 0,
  corrective: Number.POSITIVE_INFINITY,
  conditioning: 0,
};

export function minimumRetentionBlocks(role: ExerciseRole): number {
  return MIN_RETENTION_BLOCKS[role];
}

// Whether a block transition is, by itself and with no other trigger,
// a legitimate default point to rotate this role. false for
// staple/secondary_compound/corrective — those require an independent
// trigger regardless of how many blocks have elapsed.
const ROTATES_AT_BLOCK_TRANSITION_BY_DEFAULT: Record<ExerciseRole, boolean> = {
  staple: false,
  secondary_compound: false,
  accessory: true,
  isolation: true,
  corrective: false,
  conditioning: true,
};

export function rotatesAtBlockTransitionByDefault(role: ExerciseRole): boolean {
  return ROTATES_AT_BLOCK_TRANSITION_BY_DEFAULT[role];
}

// ─────────────────────────────────────────────────────────────
// Phase display names — internal phaseType vocabulary vs. coach-facing
// language, kept strictly separate (framework report, Section 8).
// displayName is a DEFAULT only: it is always coach-editable, and
// editing it must never be able to change the underlying phaseType a
// phase's deterministic behavior is keyed on. No persistence/UI wiring
// in this pass — this is the pure domain contract future work builds
// the editable-name UI/storage on top of.
// ─────────────────────────────────────────────────────────────

const DEFAULT_PHASE_DISPLAY_NAMES: Record<PhaseType, string> = {
  foundation: "Foundation",
  accumulation: "Build Phase",
  intensification: "Intensity Phase",
  realization: "Peak Phase",
  deload: "Recovery Week",
  taper: "Taper",
  resensitization: "Reset Phase",
};

// Goal-specific overrides only where the generic default would read
// oddly for that goal — not a full re-derivation per goal.
const GOAL_PHASE_DISPLAY_OVERRIDES: Partial<Record<TemplateCategory, Partial<Record<PhaseType, string>>>> = {
  muscle_growth: { accumulation: "Hypertrophy Block", intensification: "Intensity Block" },
  body_recomposition: { accumulation: "Hypertrophy Block" },
  fat_loss: { accumulation: "Fat Loss Block", intensification: "Fat Loss Block" },
  lifestyle: { accumulation: "Training Block", foundation: "Getting Started" },
  competition_prep: { intensification: "Contest Prep Block", taper: "Peak Week" },
};

export function defaultPhaseDisplayName(phaseType: PhaseType, goal: TemplateCategory): string {
  return GOAL_PHASE_DISPLAY_OVERRIDES[goal]?.[phaseType] ?? DEFAULT_PHASE_DISPLAY_NAMES[phaseType];
}

// ─────────────────────────────────────────────────────────────
// Beginner effort — internal signal only. This is the pure/domain half
// of the beginner-effort contract (framework report, Section 3/9): a
// deterministic, non-numeric internal band the engine can reason about
// for volume/fatigue modeling. The actual CLIENT-FACING plain-language
// cue strings ("leave several clean reps in the tank...") belong in
// prompt.ts — this codebase's existing home for every model/user-facing
// text template (see OUTPUT_CONTRACT_NOTES) — once this strategy layer
// is wired into day-generation prompts in a later, separately-reviewed
// phase. Not implemented here: wiring prompt text is provider-
// orchestration territory, explicitly out of scope for this pass.
//
// No numeric RIR is exposed anywhere in this file's public surface —
// EffortBand is the only effort-related type this module exports.
// ─────────────────────────────────────────────────────────────

export const EFFORT_BANDS = ["conservative", "moderate", "aggressive"] as const;
export type EffortBand = (typeof EFFORT_BANDS)[number];

export function effortBandFor(experienceLevel: ExperienceLevel): EffortBand {
  if (experienceLevel === "beginner") return "conservative";
  if (experienceLevel === "intermediate" || experienceLevel === "mixed") return "moderate";
  return "aggressive"; // advanced, competitive
}
