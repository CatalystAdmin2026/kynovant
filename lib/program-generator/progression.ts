// ─────────────────────────────────────────────────────────────
// Kynovant — Programming Intelligence Phase B: Deterministic
// Progression Engine
//
// PURE. Zero AI, zero DB, zero network, zero env access. Takes ONE
// canonical, AI-authored week (already generated + resolved — Week 1
// of a block) and deterministically expands it into the remaining
// weeks of the SAME block, without another provider call. Not wired
// into staged-generation.ts/provider.ts/actions.ts yet — that's Phase
// C, a later, separately-reviewed step.
//
// ─────────────────────────────────────────────────────────────
// SECTION 1 — REAL CONTRACT TRACE (done first, per instructions,
// before writing any transform logic)
// ─────────────────────────────────────────────────────────────
//
// Inspected lib/program-generator/contracts.ts directly. Relevant
// findings:
//
// - GeneratedWeekDraft / ModelWeekDraft share one shape: week -> days
//   -> workout (blueprint, nullable) -> sections -> prescriptions.
//   Every week/day/section/prescription carries a generator-assigned
//   `id: string` (contracts.ts's own comment: "a stable, generator-
//   assigned id... so edit operations can address a specific node
//   inside draftJson"). weekNumber is a plain integer, no gaps
//   required, uniqueness enforced only WITHIN one program (schema
//   refine on GeneratedProgramDraftSchema).
//
// - Prescription fields available to transform, all OPTIONAL except
//   id/exerciseName/orderIndex/isRequired: sets (1-20), repsMin/repsMax
//   (1-100, repsMin<=repsMax enforced by a schema refine),
//   durationSeconds (1-3600), restSeconds (0-1800), tempo (string,
//   max 20), targetRpe (0-10), targetRir (0-20), setTechnique (enum),
//   groupId/groupPosition (superset/circuit grouping), coachNotes
//   (string, max 1000), substitutionPolicy. exerciseId is REQUIRED but
//   NULLABLE on GeneratedPrescriptionDraftObjectSchema (non-null only
//   once exercise-resolution.ts has matched it) vs OPTIONAL, non-
//   nullable on ModelPrescriptionObjectSchema (the model simply may
//   omit it). This module's CanonicalPrescription type below accepts
//   either shape (see its own comment) since nothing here needs to
//   know which schema tree it came from.
//
// - Rep representation: a single pair of fields (repsMin/repsMax) —
//   NOT a separate "fixed reps" vs "rep range" field. A fixed-rep
//   prescription is simply one where repsMin === repsMax (or only one
//   of the two is set). Rep-based progression below treats "repsMin
//   already equals repsMax" as "no range to progress" and leaves the
//   numbers untouched rather than fabricating a range that was never
//   authored.
//
// - workoutSectionTypeEnum (lib/db/schema-exercise.ts): warmup,
//   activation, potentiation, main_lift, accessory, conditioning,
//   finisher, cooldown, rest_period. There is NO schema field mapping
//   a prescription to a Phase A ExerciseRole (staple/secondary_
//   compound/accessory/isolation/corrective/conditioning) — that
//   taxonomy exists in strategy.ts as a forward-looking concept, not
//   as persisted per-exercise data yet. This module therefore uses
//   sectionType (the real, schema-backed signal) as its proxy for
//   "is this working-set content that progression should touch" —
//   documented explicitly wherever it matters, not silently assumed.
//
// - setTechniqueEnum: straight_set, superset, triset, giant_set,
//   drop_set, mechanical_drop_set, tension_drop_set, rest_pause,
//   cluster_set, myo_reps, lengthened_partials, stretch_mediated_
//   finisher, tempo_set, isometric, circuit. This module never invents
//   a technique the canonical week didn't already assign — it only
//   times whether an EXISTING assigned technique is withheld/
//   maintained/removed in an expanded week (see applyTechniqueTiming).
//
// - lib/program-generator/edit-ops.ts's findSection()/findDayUnique()
//   both search GLOBALLY across draft.weeks matching purely on day.id
//   (+ section.id) — NOT scoped by weekId — and explicitly treat more
//   than one match as an unrecoverable "ambiguous" error rather than
//   guessing (see edit-ops.ts's own AMBIGUOUS_MATCH_ERROR comment,
//   itself written after a prior real bug of exactly this shape).
//   moveWorkoutDay() similarly resolves week.id via a bare .find().
//   CONCLUSION (drives Section 4 below): every week/day/section/
//   prescription id this module produces for an EXPANDED week MUST be
//   freshly generated and globally unique — reusing the canonical
//   week's ids on any expanded week would make every coach edit on
//   that week ambiguous or silently target the wrong week.
// ─────────────────────────────────────────────────────────────

import type { EffortBand, ExperienceLevel, PhaseType, ProgressionStrategy } from "./strategy";
import { effortBandFor } from "./strategy";

// ─────────────────────────────────────────────────────────────
// SECTION 2 — PHASE B INPUT/OUTPUT CONTRACT
//
// Deliberately SMALLER than the shape sketched in the task prompt:
//   - `effortBand` is NOT a separate input. It is fully determined by
//     `experienceLevel` via strategy.ts's own effortBandFor() — passing
//     both would let a caller supply an inconsistent pair for no
//     benefit, so this module derives it internally instead.
//   - `goal` is NOT part of the input. Nothing in this module's logic
//     branches on TemplateCategory: `phaseType` + `progressionStrategy`
//     together already fully determine behavior (in particular, they
//     disambiguate deload from a density-accumulation goal's
//     accumulation phase, both of which select the SAME
//     ProgressionStrategy — "volume_density" — from strategy.ts's
//     selectProgressionStrategy). If a future goal ever needs taper
//     wording to vary by goal specifically, `goal` can be added then;
//     today only competition_prep ever reaches taper, so there is
//     nothing to differentiate.
// ─────────────────────────────────────────────────────────────

// CanonicalPrescription mirrors GeneratedPrescriptionDraft /
// ModelPrescription's shape closely enough that either real type is
// structurally assignable to it — proven at compile time (not just
// asserted) by __tests__/progression.test.ts, which imports the real
// contracts.ts types and does a compile-time-only assignability check.
// This file itself imports neither contracts.ts nor lib/db/schema —
// zero imports beyond ./strategy (itself zero-import beyond ./domain-
// enums), preserving the same "no AI/DB/network" purity guarantee
// strategy.ts already has.
export interface CanonicalPrescription {
  id: string;
  // string|null|undefined covers both real schemas: Generated*'s
  // required-but-nullable `string | null`, and Model*'s optional
  // `string | undefined`.
  exerciseId?: string | null;
  exerciseName: string;
  orderIndex: number;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  durationSeconds?: number;
  restSeconds?: number;
  tempo?: string;
  targetRpe?: number;
  targetRir?: number;
  // Loosely typed (not the full setTechniqueEnum union) — this module
  // only ever READS a small, explicitly named subset of technique
  // values (see INTENSITY_SET_TECHNIQUES below) and WRITES the literal
  // "straight_set"; it never needs to exhaustively type the rest of
  // the enum, and a plain string keeps it decoupled from a DB enum it
  // must never import.
  setTechnique?: string;
  groupId?: string;
  groupPosition?: number;
  coachNotes?: string;
  isRequired: boolean;
  substitutionPolicy?: string;
}

export interface CanonicalSection {
  id: string;
  name: string;
  // Same "loosely typed, small named subset read" rationale as
  // setTechnique above — see PROGRESSION_ELIGIBLE_SECTION_TYPES.
  sectionType: string;
  orderIndex: number;
  estimatedMinutes?: number;
  notes?: string;
  prescriptions: CanonicalPrescription[];
}

export interface CanonicalBlueprint {
  id: string;
  name: string;
  description?: string;
  primaryFocus?: string;
  estimatedDurationMinutes?: number;
  sections: CanonicalSection[];
}

export interface CanonicalDay {
  id: string;
  dayOfWeek: number;
  label?: string;
  notes?: string;
  workout: CanonicalBlueprint | null;
}

export interface CanonicalWeek {
  id: string;
  weekNumber: number;
  label?: string;
  notes?: string;
  days: CanonicalDay[];
}

export interface ExpandCanonicalWeekInput {
  canonicalWeek: CanonicalWeek;
  progressionStrategy: ProgressionStrategy;
  phaseType: PhaseType;
  experienceLevel: ExperienceLevel;
  // 1-based position of the week being PRODUCED within its block.
  // Must be >= 2 (index 1 is the canonical week itself — there is
  // nothing to expand for it; see expandBlockFromCanonicalWeek).
  blockWeekIndex: number;
  // Total weeks in this block. Must be >= 2 for expansion to mean
  // anything (a 1-week block has no "remaining" weeks).
  blockLength: number;
  // Injectable so tests can assert exact, deterministic output ids
  // instead of asserting against crypto.randomUUID()'s randomness.
  // Defaults to the real global crypto.randomUUID — referencing the
  // Web Crypto global requires no import statement, so the default
  // does not compromise this file's zero-import purity.
  idFactory?: () => string;
}

export type ExpandCanonicalWeekResult = { ok: true; week: CanonicalWeek } | { ok: false; error: string };

export interface ExpandBlockInput {
  // Week 1 of the block, already generated (and, in the real
  // pipeline, already resolved) — never mutated by this module.
  canonicalWeek: CanonicalWeek;
  progressionStrategy: ProgressionStrategy;
  phaseType: PhaseType;
  experienceLevel: ExperienceLevel;
  blockLength: number;
  idFactory?: () => string;
}

export type ExpandBlockResult = { ok: true; weeks: CanonicalWeek[] } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// PHASE/STRATEGY COHERENCE GUARD
//
// Review finding on Phase B candidate 643af6c: the original API
// accepted semantically incoherent inputs — e.g. phaseType="taper"
// paired with progressionStrategy="volume_density" — and would
// execute density progression (a rest-reduction/set-increment lever)
// INSIDE what was supposed to be a fatigue-dissipating taper week.
// This is a small, deliberately narrow guard against TRULY IMPOSSIBLE
// pairings only — strategy.ts's own selectProgressionStrategy is
// still the normal selector; this guard exists purely as a defensive
// backstop against a caller bypassing it (directly, or via a future
// bug), not as a broad compatibility matrix. A combination Phase A
// simply wouldn't currently choose (e.g. phaseType="foundation" with
// progressionStrategy="volume_density") is NOT rejected here — nothing
// about that pairing is incoherent, it's just unused today.
//
// Hard contradictions enforced (and only these):
//   1. phaseType="taper" requires progressionStrategy="taper" — a
//      taper phase run through any other strategy would apply the
//      wrong lever (e.g. volume_density's rest reduction / set
//      increment) during a week whose entire purpose is dissipating
//      fatigue.
//   2. progressionStrategy="taper" requires phaseType="taper" — the
//      inverse: taper's own transform (flat volume cut, technique
//      strip, rest increase) has no defined meaning outside a taper
//      phase.
//   3. phaseType="deload" is never expanded, full stop — see
//      PHASE_BLOCK_BOUNDS in strategy.ts (deload is pinned to exactly
//      1 week); there is no progressionStrategy for which expanding a
//      deload phase is coherent.
//   4. progressionStrategy="rir" is never valid for experienceLevel=
//      "beginner" — carried over unchanged from the original
//      implementation, now expressed through this single guard instead
//      of a separate inline check.
// ─────────────────────────────────────────────────────────────

export interface ProgressionContext {
  phaseType: PhaseType;
  progressionStrategy: ProgressionStrategy;
  experienceLevel: ExperienceLevel;
}

export type ProgressionContextValidationResult = { ok: true } | { ok: false; error: string };

export function validateProgressionContext(context: ProgressionContext): ProgressionContextValidationResult {
  const { phaseType, progressionStrategy, experienceLevel } = context;

  if (phaseType === "deload") {
    return {
      ok: false,
      error:
        "deload phases are always exactly one week (see PHASE_BLOCK_BOUNDS in strategy.ts) and are never expanded — " +
        "the canonical week generated for a deload block IS the deload week.",
    };
  }
  if (phaseType === "taper" && progressionStrategy !== "taper") {
    return {
      ok: false,
      error: `phaseType="taper" requires progressionStrategy="taper" — got progressionStrategy="${progressionStrategy}".`,
    };
  }
  if (progressionStrategy === "taper" && phaseType !== "taper") {
    return {
      ok: false,
      error: `progressionStrategy="taper" is only valid for phaseType="taper" — got phaseType="${phaseType}".`,
    };
  }
  if (progressionStrategy === "rir" && experienceLevel === "beginner") {
    return {
      ok: false,
      error: "RIR progression is not valid for beginner experienceLevel — this combination should never occur.",
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Small, named classifications this module owns. Neither array claims
// to mirror a full DB enum (that would belong in domain-enums.ts, next
// to TEMPLATE_CATEGORY_VALUES) — these are Phase-B-specific judgments
// about a curated SUBSET of an enum's values, the same kind of
// judgment strategy.ts's own ROTATION_POLICY record makes over
// EXERCISE_ROLES.
// ─────────────────────────────────────────────────────────────

// Section types where prescriptions are genuinely "working sets" that
// a progression strategy should touch. warmup/activation/potentiation
// (prep work) and cooldown/rest_period (recovery work) are treated as
// PROGRESSION-NEUTRAL instead — copied into every expanded week
// unchanged (bar a fresh id) regardless of strategy. This is the
// documented stand-in for a not-yet-persisted per-exercise
// ExerciseRole: the real schema has no field distinguishing "corrective/
// mobility content" from "working sets" at the prescription level, so
// sectionType is the closest real, schema-backed signal available.
export const PROGRESSION_ELIGIBLE_SECTION_TYPES = ["main_lift", "accessory", "conditioning", "finisher"] as const;

function isProgressionEligibleSection(sectionType: string): boolean {
  return (PROGRESSION_ELIGIBLE_SECTION_TYPES as readonly string[]).includes(sectionType);
}

// High-fatigue set techniques subject to technique-TIMING (Section 11)
// and to unconditional removal during taper (Section 9). Deliberately
// excludes grouping techniques (superset/triset/giant_set/circuit) —
// removing those would restructure which exercises are paired
// together, a bigger structural change than "time an intensity
// technique" — and excludes tempo_set/isometric, which are tempo/hold
// characteristics of the movement itself, not a fatigue-accumulation
// technique layered on top of it.
const INTENSITY_SET_TECHNIQUES = [
  "drop_set",
  "mechanical_drop_set",
  "tension_drop_set",
  "rest_pause",
  "cluster_set",
  "myo_reps",
  "lengthened_partials",
  "stretch_mediated_finisher",
] as const;

function isIntensitySetTechnique(setTechnique: string | undefined): boolean {
  return setTechnique !== undefined && (INTENSITY_SET_TECHNIQUES as readonly string[]).includes(setTechnique);
}

const STRAIGHT_SET = "straight_set";

// ─────────────────────────────────────────────────────────────
// Numeric clamps — mirror the real schema's own bounds
// (GeneratedPrescriptionDraftObjectSchema) so this module can never
// produce a value the downstream contract would reject. Kept local
// (not imported from contracts.ts) for the same purity reason as
// everything else in this file — these five numbers ARE duplicated
// from contracts.ts, but unlike TemplateCategory/ExperienceLevel
// (Phase A's Finding #3), a schema BOUND drifting silently just makes
// this module's OWN clamp slightly conservative or slightly permissive
// relative to the schema, never silently wrong in a way that produces
// invalid output — the schema itself is still the final authority and
// would reject anything Phase B got wrong. __tests__/progression.test.ts
// still cross-checks all five against contracts.ts to catch drift
// immediately regardless.
const BOUNDS = {
  sets: [1, 20],
  repsMinMax: [1, 100],
  durationSeconds: [1, 3600],
  restSeconds: [0, 1800],
  targetRpe: [0, 10],
  targetRir: [0, 20],
  coachNotesLength: 1000,
} as const;

function clampInt(value: number, [min, max]: readonly [number, number]): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Review finding on Phase B candidate 643af6c (P2): repeated
// deterministic note appending could duplicate the same template text
// if a week were, for any reason, run back through expansion again.
// Exact-template detection is enough — no fuzzy/NLP matching. A
// coach-written note is never touched or removed; only an EXACT repeat
// of one of this module's own deterministic templates is suppressed.
function clampCoachNotes(value: string): string {
  return value.length > BOUNDS.coachNotesLength ? value.slice(0, BOUNDS.coachNotesLength) : value;
}

function appendCoachNote(existing: string | undefined, note: string): string {
  const trimmed = existing?.trim();
  // Exact template already present — do not duplicate, but still run
  // the length clamp so this path can never bypass the schema's own
  // coachNotes bound (defensive: a real canonical week's coachNotes
  // could never actually exceed 1000 chars in the first place, since
  // GeneratedPrescriptionDraftObjectSchema enforces that bound upstream
  // — this just ensures the invariant holds unconditionally regardless).
  if (trimmed && trimmed.includes(note)) return clampCoachNotes(trimmed);
  const combined = trimmed ? `${trimmed} ${note}` : note;
  return clampCoachNotes(combined);
}

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

// RE-EXPANSION / IDENTITY CONTRACT (review finding on Phase B
// candidate 643af6c, P2 — documented, not a pure-layer defect):
// this module's CONTENT is deterministic — the same canonicalWeek plus
// the same progressionStrategy/phaseType/experienceLevel/blockWeekIndex/
// blockLength always produces the same prescriptions, notes, and
// numbers (see progression.test.ts's own determinism-adjacent
// invariant tests). Structural IDs are NOT deterministic by default —
// crypto.randomUUID() intentionally mints a fresh, real, application-
// owned identity every call, exactly as contracts.ts's own comment on
// generator-assigned ids describes for the rest of this codebase.
//
// This means calling expandBlockFromCanonicalWeek() twice for the same
// canonical week produces two DIFFERENT sets of week/day/section/
// prescription ids for otherwise-identical content. That is correct
// behavior for a pure function whose caller is expected to persist
// exactly ONE successful result — it is NOT something to "fix" by
// making ids deterministic by default, since two truly separate blocks
// legitimately need distinct ids from each other regardless of content
// equality.
//
// The contract Phase C (persistence/wiring) MUST honor as a result:
//   - persist the first successful expansion and treat it as final —
//     never call expandBlockFromCanonicalWeek() again for a block that
//     already has a persisted result, "just to check."
//   - if a caller genuinely needs exact-replay semantics (e.g. a retry
//     path that must reproduce the exact same ids on a second attempt),
//     supply a deterministic `idFactory` explicitly — the parameter
//     exists specifically for this, and progression.test.ts's injected-
//     idFactory test proves the override path is honored exactly.
// No code change was needed here — the injectable idFactory this
// module already had is precisely the right pure-layer answer; the
// only defect potential lived entirely on the not-yet-built Phase C
// persistence side, which this comment exists to steer correctly.

// ─────────────────────────────────────────────────────────────
// SECTION 11 — TECHNIQUE TIMING
//
// Only ever TIMES an existing, already-assigned intensity technique —
// never invents one on an exercise the canonical week didn't already
// mark that way. Beginner: none by default (always withheld in
// expanded weeks). Intermediate/mixed: late-block only (withheld until
// the block's final expanded week). Advanced/competitive: maintained
// as assigned — the AI's placement is trusted, not second-guessed.
// This runs BEFORE the per-strategy transform; taper's own
// unconditional removal (Section 9) still applies afterward regardless
// of experience level or block position.
//
// OWNERSHIP CONTRACT (review finding on Phase B candidate 643af6c, P2
// — documented here, deliberately NOT solved in this pass): this
// function infers "was this technique deliberately placed, or should
// it just ride along" purely from the technique's mere PRESENCE on the
// canonical week's prescription plus the current block position. That
// produces a structurally odd case for intermediate/mixed: a canonical
// Week 1 already carrying, say, rest_pause gets it withheld in Week 2
// and reintroduced only in the block's final week — as if canonical
// Week 1 and the final week share a technique that the middle weeks
// don't, even though nothing about Week 1's own authored content
// changed.
//
// The correct long-term contract is that intermediate/mixed timing is
// really about ELIGIBILITY, not presence: the canonical-week/blueprint
// generator (a Phase C concern) should be able to mark a technique as
// "eligible for late-block activation" as a concept distinct from "is
// active on this exact prescription right now." Phase B would then
// only ever OWN THE TIMING of an eligibility flag the upstream
// generator set, instead of inferring intent from where the technique
// happens to already sit. That requires a new field somewhere in the
// canonical-week authoring path — out of scope here: this pass does
// not invent a DB/schema field or broaden the architecture to add one.
//
// A tiny, PURE, non-schema representation that could carry this
// without touching any persisted schema (proposed for Phase C's
// consideration, not built here): an optional
// `techniqueEligibility?: "assigned" | "eligible_late_block"` on a
// Phase-C-only enriched prescription type that wraps CanonicalPrescription
// before calling into this module — read by applyTechniqueTiming when
// present, falling back to today's presence-based inference when
// absent, so this stays backward compatible with every canonical week
// that doesn't have the concept yet. This is a proposal only.
//
// Until Phase C addresses this, current Phase B behavior is correct
// within its stated limits and is preserved as an explicit P2
// deferred integration contract, not a silent gap: it never invents a
// technique the canonical week didn't already carry, and taper always
// strips high-fatigue techniques regardless of this timing logic.
// ─────────────────────────────────────────────────────────────
function applyTechniqueTiming(
  setTechnique: string | undefined,
  experienceLevel: ExperienceLevel,
  blockWeekIndex: number,
  blockLength: number,
): string | undefined {
  if (!isIntensitySetTechnique(setTechnique)) return setTechnique;
  if (experienceLevel === "beginner") return STRAIGHT_SET;
  if (experienceLevel === "advanced" || experienceLevel === "competitive") return setTechnique;
  // intermediate / mixed — late-block only.
  const isFinalWeekOfBlock = blockWeekIndex === blockLength;
  return isFinalWeekOfBlock ? setTechnique : STRAIGHT_SET;
}

// ─────────────────────────────────────────────────────────────
// Per-strategy prescription transforms. Each takes the ALREADY
// technique-timed setTechnique and returns a brand-new prescription
// object — never mutates its input, satisfying Section 15's
// immutability invariant by construction (every field is copied via
// object spread into a NEW object, and callers never write back into
// the source).
// ─────────────────────────────────────────────────────────────

interface StrategyContext {
  phaseType: PhaseType;
  experienceLevel: ExperienceLevel;
  effortBand: EffortBand;
  // (blockWeekIndex - 1) / (blockLength - 1) — in (0, 1] for any valid
  // expansion call (blockWeekIndex ranges 2..blockLength).
  progress: number;
  blockWeekIndex: number;
  blockLength: number;
  sectionType: string;
}

// SECTION 5 — REP PROGRESSION. Keeps the authored rep-range CEILING
// fixed and raises the FLOOR toward it as the block progresses — "same
// broad rep range" (the ceiling never moves) with a visible,
// deterministic, monotonic climb toward the top of it. A fixed-rep
// prescription (repsMin === repsMax, or only one of the two set) has
// no range to climb — left numerically untouched, matching "do not
// fabricate a range that was never authored."
function applyRepProgression(p: CanonicalPrescription, ctx: StrategyContext): CanonicalPrescription {
  const hasRange = p.repsMin != null && p.repsMax != null && p.repsMin < p.repsMax;
  if (!hasRange) return { ...p };
  const repsMin = p.repsMin as number;
  const repsMax = p.repsMax as number;
  const newRepsMin = clampInt(repsMin + ctx.progress * (repsMax - repsMin), [repsMin, repsMax]);
  const isFinalWeek = ctx.blockWeekIndex === ctx.blockLength;
  const note = isFinalWeek
    ? "You should be at or near the top of your prescribed rep range this week. Once every set reaches the top of the range with clean form, increase the load next session and return to the lower end of the range."
    : "Aim for the higher end of your prescribed rep range this week while keeping every set clean.";
  return { ...p, repsMin: newRepsMin, coachNotes: appendCoachNote(p.coachNotes, note) };
}

// SECTION 6 — DOUBLE PROGRESSION. Deliberately does NOT narrow the rep
// range week over week (that would fabricate knowledge of whether the
// client actually hit the top of the range in an unlogged initial
// program). Instead the full authored range is preserved every week,
// and every expanded week carries the SAME standing conditional
// instruction — the real double-progression rule is a per-session
// decision the coach/client makes from real performance, not something
// this deterministic, log-free expansion can predict.
function applyDoubleProgression(p: CanonicalPrescription): CanonicalPrescription {
  const hasRange = p.repsMin != null && p.repsMax != null && p.repsMin < p.repsMax;
  if (!hasRange) return { ...p };
  const note =
    "Double progression: once every set reaches the top of your prescribed rep range at your target effort, " +
    "increase the load next session and return to the bottom of the range. If you're not there yet, keep " +
    "building reps within the range at the same load.";
  return { ...p, coachNotes: appendCoachNote(p.coachNotes, note) };
}

// SECTION 7 — RIR PROGRESSION. Directional: proximity to failure
// increases monotonically toward a floor that depends on effort band,
// never on a fixed "must reach RIR 0" assumption, and never below 0.
// If the canonical prescription's own targetRir is already at or below
// the floor, it is left unchanged rather than being pushed artificially
// lower. Falls back to an analogous targetRpe ramp (toward a ceiling)
// when targetRir is absent but targetRpe is present. If neither field
// is present, the prescription is progression-neutral for this
// strategy (nothing numeric to progress) but still receives the
// directional coachNote.
const RIR_FLOOR_BY_EFFORT_BAND: Record<EffortBand, number> = { conservative: 2, moderate: 1, aggressive: 0 };
const RPE_CEILING_BY_EFFORT_BAND: Record<EffortBand, number> = { conservative: 8, moderate: 9, aggressive: 10 };

function applyRirProgression(p: CanonicalPrescription, ctx: StrategyContext): CanonicalPrescription {
  const isFinalWeek = ctx.blockWeekIndex === ctx.blockLength;
  const note = isFinalWeek
    ? "This is the most challenging week of the block — train at the prescribed effort level with strict form."
    : "Push slightly closer to your prescribed effort level this week than last, while keeping technique sharp.";
  const next: CanonicalPrescription = { ...p, coachNotes: appendCoachNote(p.coachNotes, note) };

  if (p.targetRir != null) {
    const floor = RIR_FLOOR_BY_EFFORT_BAND[ctx.effortBand];
    if (p.targetRir > floor) {
      const targetRir = clampInt(p.targetRir - ctx.progress * (p.targetRir - floor), BOUNDS.targetRir);
      next.targetRir = Math.max(floor, targetRir);
    }
    return next;
  }
  if (p.targetRpe != null) {
    const ceiling = RPE_CEILING_BY_EFFORT_BAND[ctx.effortBand];
    if (p.targetRpe < ceiling) {
      const targetRpe = clampInt(p.targetRpe + ctx.progress * (ceiling - p.targetRpe), BOUNDS.targetRpe);
      next.targetRpe = Math.min(ceiling, targetRpe);
    }
    return next;
  }
  return next;
}

// SECTION 8 — VOLUME/DENSITY PROGRESSION. NEVER "add sets every week."
// Conservative, bounded levers only: modest rest reduction (the
// primary lever, applies to any section with restSeconds), a single
// +1 set increment applied ONLY at the block's final week and ONLY
// when the existing set count is still low (<=4) — never a
// compounding weekly increase — and, for conditioning specifically, a
// modest duration increase as an additional work:rest lever. Because
// Phase B has no blueprint-level volume-allocation logic yet (that's a
// later phase), every lever here is deliberately small.
const REST_REDUCTION_MAX_FRACTION = 0.3;
const REST_REDUCTION_FLOOR_SECONDS = 30;
const CONDITIONING_DURATION_INCREASE_MAX_FRACTION = 0.1;
const DENSITY_SET_INCREMENT_CAP = 4;

function applyVolumeDensityProgression(p: CanonicalPrescription, ctx: StrategyContext): CanonicalPrescription {
  const next: CanonicalPrescription = { ...p };
  let changedRest = false;
  let changedSets = false;

  if (p.restSeconds != null) {
    const reduction = Math.round(ctx.progress * REST_REDUCTION_MAX_FRACTION * p.restSeconds);
    const candidate = p.restSeconds - reduction;
    const floored = Math.max(REST_REDUCTION_FLOOR_SECONDS, candidate);
    if (floored < p.restSeconds) {
      next.restSeconds = clampInt(floored, BOUNDS.restSeconds);
      changedRest = true;
    }
  }

  const isFinalWeek = ctx.blockWeekIndex === ctx.blockLength;
  if (isFinalWeek && ctx.sectionType !== "conditioning" && p.sets != null && p.sets <= DENSITY_SET_INCREMENT_CAP) {
    next.sets = clampInt(p.sets + 1, BOUNDS.sets);
    changedSets = true;
  }

  if (ctx.sectionType === "conditioning" && p.durationSeconds != null) {
    const increase = Math.round(ctx.progress * CONDITIONING_DURATION_INCREASE_MAX_FRACTION * p.durationSeconds);
    if (increase > 0) {
      next.durationSeconds = clampInt(p.durationSeconds + increase, BOUNDS.durationSeconds);
    }
  }

  if (changedSets) {
    next.coachNotes = appendCoachNote(p.coachNotes, "Hold the same weight and effort — this week adds one working set to build volume.");
  } else if (changedRest) {
    next.coachNotes = appendCoachNote(p.coachNotes, "Keep the same weight and rep target — the challenge this week comes from tighter rest between sets.");
  }
  return next;
}

// SECTION 9 — TAPER. Training taper only — no nutrition/water/sodium
// logic of any kind. Unconditionally (regardless of experience level)
// reduces sets by exactly 1, strips any high-fatigue intensity
// technique back to a straight set, increases rest slightly to
// dissipate fatigue, and additionally trims conditioning duration.
// Never removes an exercise, never changes exerciseId/exerciseName —
// "preserve familiar movement exposure" is automatic here since this
// function only ever edits the numeric/technique fields of an existing
// prescription.
const TAPER_REST_INCREASE_FRACTION = 0.15;
const TAPER_CONDITIONING_DURATION_REDUCTION_FRACTION = 0.2;

// Review finding on Phase B candidate 643af6c: a flat "-1 set" taper
// cut is material at low set counts (2->1, 3->2) but essentially
// meaningless at high ones (10->9, 20->19 barely register as a taper
// at all). Replaced with a tiered, BOUNDED RELATIVE reduction — not a
// claim to one universal, precisely-validated sports-science
// percentage, but a directionally-justified rule keyed to the
// schema's own set-count bound (1-20) and the taper contract itself
// ("dissipate fatigue while preserving familiar movement exposure"):
//   1-2 sets  -> keep ~50%. A prescription already this low has little
//                room to cut without eliminating the movement's
//                exposure entirely — floored at 1 regardless.
//   3-5 sets  -> keep ~2/3 (cut about a third) — the most common
//                working-set range, and roughly the taper-volume-cut
//                heuristic used broadly in strength/physique coaching
//                (a directional guideline, not a fabricated exact
//                figure).
//   6+ sets   -> keep ~60% (cut ~40%) — higher-volume prescriptions
//                have materially more volume that can be shed while
//                still preserving exposure to the movement.
// Never below 1 (the schema's own floor). Always a real reduction
// whenever sets > 1 (see progression.test.ts's full 1/2/3/4/5/6/8/10/
// 15/20 table).
function taperSetsRetentionFraction(sets: number): number {
  if (sets <= 2) return 0.5;
  if (sets <= 5) return 2 / 3;
  return 0.6;
}

function applyTaperSetReduction(sets: number): number {
  return Math.max(1, Math.round(sets * taperSetsRetentionFraction(sets)));
}

function applyTaperProgression(p: CanonicalPrescription, ctx: StrategyContext): CanonicalPrescription {
  const next: CanonicalPrescription = { ...p };

  if (p.sets != null) {
    next.sets = clampInt(applyTaperSetReduction(p.sets), BOUNDS.sets);
  }
  if (isIntensitySetTechnique(p.setTechnique)) {
    next.setTechnique = STRAIGHT_SET;
  }
  if (p.restSeconds != null) {
    next.restSeconds = clampInt(p.restSeconds + p.restSeconds * TAPER_REST_INCREASE_FRACTION, BOUNDS.restSeconds);
  }
  if (ctx.sectionType === "conditioning" && p.durationSeconds != null) {
    next.durationSeconds = clampInt(
      p.durationSeconds * (1 - TAPER_CONDITIONING_DURATION_REDUCTION_FRACTION),
      BOUNDS.durationSeconds,
    );
  }
  next.coachNotes = appendCoachNote(
    p.coachNotes,
    "Taper week: reduced volume and easier techniques to arrive fresh. Keep familiar movements and stop shy of grinding, technically-hard reps.",
  );
  return next;
}

function transformEligiblePrescription(p: CanonicalPrescription, ctx: StrategyContext, strategy: ProgressionStrategy): CanonicalPrescription {
  const timedTechnique = applyTechniqueTiming(p.setTechnique, ctx.experienceLevel, ctx.blockWeekIndex, ctx.blockLength);
  const timed: CanonicalPrescription = { ...p, setTechnique: timedTechnique };

  switch (strategy) {
    case "rep":
      return applyRepProgression(timed, ctx);
    case "double":
      return applyDoubleProgression(timed);
    case "rir":
      return applyRirProgression(timed, ctx);
    case "volume_density":
      // phaseType === "taper" never reaches here — validateProgressionContext
      // rejects a volume_density+taper pairing before any prescription
      // is touched (see its own header for why that pairing is a hard
      // contradiction, not just an unused combination). phaseType ===
      // "deload" is likewise always rejected before this point. Neither
      // case is silently mishandled by this branch — both fail closed
      // upstream.
      return applyVolumeDensityProgression(timed, ctx);
    case "taper":
      return applyTaperProgression(timed, ctx);
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

function expandPrescription(
  p: CanonicalPrescription,
  ctx: StrategyContext,
  strategy: ProgressionStrategy,
  idFactory: () => string,
): CanonicalPrescription {
  const base = isProgressionEligibleSection(ctx.sectionType) ? transformEligiblePrescription(p, ctx, strategy) : { ...p };
  return { ...base, id: idFactory() };
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — IDENTITY. New, globally-unique ids for every week/day/
// section/prescription this module PRODUCES (never the canonical week
// itself, which is returned/consumed exactly as given). See the
// edit-ops.ts trace at the top of this file for why reusing the
// canonical week's ids on an expanded week would be a real editing-
// correctness bug, not just a style concern. Structural identity
// fields — dayOfWeek, exerciseId, exerciseName, orderIndex, groupId,
// groupPosition, isRequired, substitutionPolicy — are always copied
// through unchanged (Section 3).
// ─────────────────────────────────────────────────────────────

function expandWeek(
  canonicalWeek: CanonicalWeek,
  strategy: ProgressionStrategy,
  phaseType: PhaseType,
  experienceLevel: ExperienceLevel,
  blockWeekIndex: number,
  blockLength: number,
  idFactory: () => string,
): CanonicalWeek {
  const effortBand = effortBandFor(experienceLevel);
  const progress = (blockWeekIndex - 1) / (blockLength - 1);
  // Assigned before any nested id below, so idFactory is called in a
  // top-down order (week, then its days, then each day's sections and
  // prescriptions) — the order a caller injecting a deterministic
  // idFactory for tests would naturally expect.
  const weekId = idFactory();

  const days = canonicalWeek.days.map((day) => ({
    ...day,
    id: idFactory(),
    workout:
      day.workout === null
        ? null
        : {
            ...day.workout,
            id: idFactory(),
            sections: day.workout.sections.map((section) => {
              const ctx: StrategyContext = {
                phaseType,
                experienceLevel,
                effortBand,
                progress,
                blockWeekIndex,
                blockLength,
                sectionType: section.sectionType,
              };
              return {
                ...section,
                id: idFactory(),
                prescriptions: section.prescriptions.map((p) => expandPrescription(p, ctx, strategy, idFactory)),
              };
            }),
          },
  }));

  return {
    ...canonicalWeek,
    id: weekId,
    weekNumber: canonicalWeek.weekNumber + (blockWeekIndex - 1),
    days,
  };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export function expandCanonicalWeek(input: ExpandCanonicalWeekInput): ExpandCanonicalWeekResult {
  const { canonicalWeek, progressionStrategy, phaseType, experienceLevel, blockWeekIndex, blockLength } = input;
  const idFactory = input.idFactory ?? defaultIdFactory;

  // Coherence first — fail closed before any bounds/id work if the
  // phase/strategy/experience triple is semantically impossible. See
  // validateProgressionContext's own header for exactly which
  // combinations this rejects and why the list is deliberately short.
  const coherence = validateProgressionContext({ phaseType, progressionStrategy, experienceLevel });
  if (!coherence.ok) return coherence;

  if (!Number.isInteger(blockLength) || blockLength < 2) {
    return { ok: false, error: `blockLength must be an integer >= 2 to expand a canonical week — got ${blockLength}.` };
  }
  if (!Number.isInteger(blockWeekIndex) || blockWeekIndex < 2 || blockWeekIndex > blockLength) {
    return {
      ok: false,
      error: `blockWeekIndex must be an integer between 2 and blockLength (${blockLength}) — got ${blockWeekIndex}.`,
    };
  }

  const week = expandWeek(canonicalWeek, progressionStrategy, phaseType, experienceLevel, blockWeekIndex, blockLength, idFactory);
  return { ok: true, week };
}

export function expandBlockFromCanonicalWeek(input: ExpandBlockInput): ExpandBlockResult {
  const { canonicalWeek, progressionStrategy, phaseType, experienceLevel, blockLength } = input;
  const idFactory = input.idFactory ?? defaultIdFactory;

  if (!Number.isInteger(blockLength) || blockLength < 1) {
    return { ok: false, error: `blockLength must be a positive integer — got ${blockLength}.` };
  }

  if (blockLength === 1) {
    // Nothing to expand — the canonical week IS the whole block. Its
    // own id/weekNumber are returned exactly as given (see Section 4:
    // only NEWLY produced weeks get fresh ids). Deliberately BEFORE the
    // coherence guard below: a deload block is REQUIRED to have
    // blockLength=1, so this is the one legitimate case where
    // phaseType="deload" reaches this function at all, and it must
    // succeed, not be rejected.
    return { ok: true, weeks: [canonicalWeek] };
  }

  // Coherence check up front — fail closed before touching the loop
  // below (and before expandCanonicalWeek would otherwise discover the
  // same problem only on its first inner call).
  const coherence = validateProgressionContext({ phaseType, progressionStrategy, experienceLevel });
  if (!coherence.ok) return coherence;

  const weeks: CanonicalWeek[] = [canonicalWeek];
  for (let blockWeekIndex = 2; blockWeekIndex <= blockLength; blockWeekIndex++) {
    const result = expandCanonicalWeek({
      canonicalWeek,
      progressionStrategy,
      phaseType,
      experienceLevel,
      blockWeekIndex,
      blockLength,
      idFactory,
    });
    if (!result.ok) return result;
    weeks.push(result.week);
  }
  return { ok: true, weeks };
}
