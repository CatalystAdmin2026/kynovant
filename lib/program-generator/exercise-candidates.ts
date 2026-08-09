// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Exercise Candidate Selection
//
// SERVER-ONLY. Derives a bounded, curated set of real, currently
// selectable Exercise Library rows BEFORE any shell/week generation
// call — the model is given this list and instructed to select only
// from it, rather than being asked to name exercises from memory (the
// prior architecture, which produced large numbers of unresolved/
// ambiguous findings for ordinary exercise names the coach would
// recognize instantly).
//
// This module never sends the whole Exercise Library to the model —
// see buildExerciseCandidateSet()'s own comments for the selection
// algorithm and its deterministic bounds (target ~60-150 candidates).
//
// This is a curation layer, not a trust boundary: nothing here, and
// nothing in the prompt text built from its output, makes a model-
// returned exerciseId trustworthy on its own. verifyWeekAgainstCandidates()/
// verifyProgramDraftAgainstCandidates() (below) are what actually check
// a returned id against the exact candidate set supplied for that call —
// see exercise-resolution.ts for what happens to anything that fails
// that check (falls back to the existing name-based resolver, never
// silently accepted, never fabricated).
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { exercises, exerciseMuscles } from "@/lib/db/schema-exercise";
import type {
  MuscleGroup,
  MovementPattern,
  ExerciseClassification,
  ExerciseDifficulty,
  ResistanceType,
} from "@/lib/db/schema-exercise";
import type { PilDefaultPrescription } from "@/lib/pil/types";
import { normalizeExerciseName } from "./exercise-resolution";
import type { ProgramGenerationBrief, ModelWeekDraft, ModelProgramDraft, ModelPrescription } from "./contracts";

// ─────────────────────────────────────────────────────────────
// EQUIPMENT — single source of truth. validation.ts's equipment-
// compatibility warning heuristic imports this too, so the hard filter
// applied here and the defense-in-depth warning check there can never
// drift apart.
// ─────────────────────────────────────────────────────────────

export const EQUIPMENT_ACCESS_ALLOWED_RESISTANCE: Partial<Record<ProgramGenerationBrief["equipmentAccess"], Set<string>>> = {
  bodyweight: new Set(["bodyweight"]),
  bands_only: new Set(["bodyweight", "band"]),
  dumbbells_only: new Set(["bodyweight", "dumbbell"]),
  home_gym: new Set([
    "bodyweight",
    "dumbbell",
    "kettlebell",
    "band",
    "barbell",
    "suspension",
    "medicine_ball",
    "sandbag",
  ]),
  // commercial_gym and custom are intentionally absent — treated as
  // "cannot deterministically restrict," so every resistance type stays
  // eligible.
};

// A comprehensive default muscle-group coverage target, independent of
// brief.preferredSplit — every split (full_body, upper_lower, push_pull_
// legs, body_part, hybrid) still needs a program-wide candidate pool
// covering all major muscle groups; which groups land on which day is a
// week-generation-time scheduling decision, not a candidate-availability
// one. brief.musclePriorities are unioned in and given a larger per-
// group cap, not treated as the only groups that matter.
const CORE_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "lats",
  "upper_back",
  "front_deltoid",
  "lateral_deltoid",
  "rear_deltoid",
  "biceps",
  "triceps",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "rectus_abdominis",
  "obliques",
];

const MAX_PER_MUSCLE_GROUP = 12;
const MAX_PER_MUSCLE_GROUP_PRIORITY = 16;
const MAX_MOBILITY_CANDIDATES = 15;
const MAX_CARDIO_CANDIDATES = 8;
const TARGET_MAX_CANDIDATES = 150;

// 0-10 scale (see exercises.joint_stress_* check constraints) — a joint
// is called out on a candidate's payload only once it's notably loaded,
// not for every nonzero value, to keep each candidate line compact.
const NOTABLE_JOINT_STRESS_THRESHOLD = 7;

function difficultyCeiling(level: ProgramGenerationBrief["experienceLevel"]): ExerciseDifficulty[] {
  if (level === "beginner") return ["beginner"];
  if (level === "intermediate") return ["beginner", "intermediate"];
  if (level === "advanced") return ["beginner", "intermediate", "advanced"];
  // competitive, mixed — no ceiling.
  return ["beginner", "intermediate", "advanced", "specialist"];
}

export interface ExerciseCandidate {
  id: string;
  name: string;
  alternateNames: string[];
  primaryMuscleGroup: MuscleGroup | null;
  secondaryMuscleGroups: MuscleGroup[];
  movementPattern: MovementPattern;
  classification: ExerciseClassification;
  resistanceType: ResistanceType | null;
  difficulty: ExerciseDifficulty;
  isCardio: boolean;
  isMobility: boolean;
  /** e.g. ["shoulder", "knee"] — joints with jointStress >= 7. */
  highJointStress: string[];
  defaultPrescription: PilDefaultPrescription | null;
}

export interface CandidateCoverageGap {
  /** e.g. "chest", "warmup/mobility", "cardio/conditioning" */
  category: string;
  reason: string;
}

export interface ExerciseCandidateSet {
  candidates: ExerciseCandidate[];
  gaps: CandidateCoverageGap[];
}

function sortCandidates(a: ExerciseCandidate, b: ExerciseCandidate): number {
  const rank = (c: ExerciseClassification) => (c === "compound" ? 0 : c === "power" ? 1 : c === "skill" ? 2 : 3);
  const r = rank(a.classification) - rank(b.classification);
  if (r !== 0) return r;
  return a.name.localeCompare(b.name);
}

const JOINTS = [
  { key: "jointStressShoulder", label: "shoulder" },
  { key: "jointStressElbow", label: "elbow" },
  { key: "jointStressWrist", label: "wrist" },
  { key: "jointStressSpine", label: "spine" },
  { key: "jointStressHip", label: "hip" },
  { key: "jointStressKnee", label: "knee" },
  { key: "jointStressAnkle", label: "ankle" },
] as const satisfies { key: keyof typeof exercises.$inferSelect; label: string }[];

// Derives a bounded, curated candidate catalog for one generation
// attempt (shared across shell planning, every week call, and
// regenerate-day — see staged-generation.ts). Deterministic: the same
// brief + coach + library state always produces the same candidate set,
// which is what makes recomputing it on a resume safe (requirement:
// "completed weeks must not be regenerated merely because the candidate
// set is reloaded" — nothing about resuming touches already-completed
// weeks regardless of what this function returns).
export async function buildExerciseCandidateSet(
  brief: ProgramGenerationBrief,
  coachId: string,
): Promise<ExerciseCandidateSet> {
  const db = getDb();

  const conditions = [
    eq(exercises.status, "active"),
    // Tenant visibility: system/organization-scope exercises are the
    // shared library, visible to every coach; coach-scope exercises are
    // visible only to the coach who created them. No exercise-library
    // equivalent of "published" gates a coach-scoped row open to others
    // — unlike Program/Blueprint templates, an exercise's scope IS its
    // visibility rule (see schema-exercise.ts's exerciseScopeEnum).
    or(
      eq(exercises.scope, "system"),
      eq(exercises.scope, "organization"),
      and(eq(exercises.scope, "coach"), eq(exercises.createdBy, coachId)),
    )!,
    inArray(exercises.difficulty, difficultyCeiling(brief.experienceLevel)),
  ];
  if (brief.excludedExerciseIds.length > 0) {
    conditions.push(notInArray(exercises.id, brief.excludedExerciseIds));
  }

  const pool = await db
    .select()
    .from(exercises)
    .where(and(...conditions));

  const allowedResistance = EQUIPMENT_ACCESS_ALLOWED_RESISTANCE[brief.equipmentAccess];
  const equipmentFiltered = allowedResistance
    ? pool.filter((r) => r.resistanceType === null || allowedResistance.has(r.resistanceType))
    : pool;

  const poolIds = equipmentFiltered.map((r) => r.id);
  const muscleRows =
    poolIds.length > 0
      ? await db.select().from(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, poolIds))
      : [];
  const secondaryByExercise = new Map<string, MuscleGroup[]>();
  for (const m of muscleRows) {
    if (m.role !== "secondary") continue;
    const list = secondaryByExercise.get(m.exerciseId) ?? [];
    list.push(m.muscleGroup);
    secondaryByExercise.set(m.exerciseId, list);
  }

  const allCandidates: ExerciseCandidate[] = equipmentFiltered.map((row) => {
    const highJointStress = JOINTS.filter((j) => {
      const value = row[j.key];
      return value !== null && value >= NOTABLE_JOINT_STRESS_THRESHOLD;
    }).map((j) => j.label);

    return {
      id: row.id,
      name: row.name,
      alternateNames: Array.isArray(row.alternateNames) ? (row.alternateNames as string[]) : [],
      primaryMuscleGroup: row.primaryMuscleGroup,
      secondaryMuscleGroups: secondaryByExercise.get(row.id) ?? [],
      movementPattern: row.movementPattern,
      classification: row.classification,
      resistanceType: row.resistanceType,
      difficulty: row.difficulty,
      isCardio: row.isCardio,
      isMobility: row.isMobility,
      highJointStress,
      defaultPrescription: (row.defaultPrescription as PilDefaultPrescription | null) ?? null,
    };
  });

  return selectCandidatesFromPool(allCandidates, brief.musclePriorities);
}

// Pure selection/capping logic, split out from buildExerciseCandidateSet
// so it can be exercised directly with a synthetic in-memory pool —
// including one large enough to trigger the global cap — without a
// live database. buildExerciseCandidateSet's own DB query, tenant
// filter, equipment filter, and exclusions all run before this; nothing
// about tenant visibility, equipment compatibility, or exclusions lives
// here or is affected by it.
export function selectCandidatesFromPool(
  allCandidates: ExerciseCandidate[],
  musclePriorities: readonly MuscleGroup[],
): ExerciseCandidateSet {
  const targetMuscleGroups = Array.from(new Set([...CORE_MUSCLE_GROUPS, ...musclePriorities]));
  const gaps: CandidateCoverageGap[] = [];

  // Each bucket below is independently capped (12/16 per muscle group,
  // 15 mobility, 8 cardio) and deterministically ordered — unchanged
  // from before. Gap detection also stays exactly as before: it reads
  // each bucket's own pre-global-cap match count, so whether a category
  // has ANY real, eligible matches is untouched by anything past this
  // point.
  interface CategoryBucket {
    candidates: ExerciseCandidate[];
  }
  const buckets: CategoryBucket[] = [];

  for (const mg of targetMuscleGroups) {
    const cap = musclePriorities.includes(mg) ? MAX_PER_MUSCLE_GROUP_PRIORITY : MAX_PER_MUSCLE_GROUP;
    const matches = allCandidates
      .filter((c) => c.primaryMuscleGroup === mg)
      .sort(sortCandidates)
      .slice(0, cap);
    if (matches.length === 0) {
      gaps.push({
        category: mg,
        reason: `No active, equipment-and-level-compatible exercises are available for ${mg.replace(/_/g, " ")} under the current brief.`,
      });
    }
    buckets.push({ candidates: matches });
  }

  const mobilityMatches = allCandidates
    .filter((c) => c.isMobility)
    .sort(sortCandidates)
    .slice(0, MAX_MOBILITY_CANDIDATES);
  if (mobilityMatches.length === 0) {
    gaps.push({
      category: "warmup/mobility",
      reason: "No active mobility/warmup exercises are available in the library under the current brief. Warmup sections may need to be built manually.",
    });
  }
  buckets.push({ candidates: mobilityMatches });

  const cardioMatches = allCandidates
    .filter((c) => c.isCardio)
    .sort(sortCandidates)
    .slice(0, MAX_CARDIO_CANDIDATES);
  if (cardioMatches.length === 0) {
    gaps.push({
      category: "cardio/conditioning",
      reason: "No active cardio/conditioning exercises are available in the library under the current brief.",
    });
  }
  buckets.push({ candidates: cardioMatches });

  // ─────────────────────────────────────────────────────────────
  // GLOBAL CAP — round-robin across category buckets, not a flat
  // sort-and-slice.
  //
  // Every bucket above is already independently capped and
  // deterministically ordered. When the union of all buckets fits
  // within TARGET_MAX_CANDIDATES, every candidate below survives and
  // this produces exactly the same final set as before (the common
  // case — most briefs, and every previously-passing test, never
  // approach 150 total candidates).
  //
  // When the union EXCEEDS the cap, the previous implementation sorted
  // the entire merged set by classification-then-name and sliced the
  // first TARGET_MAX_CANDIDATES — a global truncation blind to category
  // boundaries. That could silently drop an ENTIRE category to zero
  // survivors merely because its candidates happened to sort after
  // enough candidates from OTHER categories filled every slot (e.g. a
  // category whose matches are all "isolation"-classified sorts after
  // every "compound" candidate from every other category) — with no
  // gap recorded, since gaps above are computed from each bucket's
  // pre-global-cap match count, not its post-truncation survivor count.
  // That is exactly the "silently drop a required category because
  // earlier categories consumed the cap" failure this round-robin
  // exists to make structurally impossible: it takes at most one
  // candidate from each not-yet-exhausted bucket per pass, so every
  // bucket that has at least one match is guaranteed at least one
  // surviving candidate before any bucket receives a second — as long
  // as the number of non-empty buckets doesn't itself exceed
  // TARGET_MAX_CANDIDATES (at most ~16 buckets today: up to 14 core
  // muscle groups plus any priority additions, mobility, and cardio —
  // an order of magnitude under the 150 cap).
  //
  // The final list is re-sorted by sortCandidates exactly as before, so
  // round-robin changes only WHICH candidates survive when supply
  // exceeds the cap, never the returned list's presentation order.
  // ─────────────────────────────────────────────────────────────
  const selected = new Map<string, ExerciseCandidate>();
  const bucketIndex = buckets.map(() => 0);
  for (;;) {
    if (selected.size >= TARGET_MAX_CANDIDATES) break;
    let madeProgress = false;
    for (let i = 0; i < buckets.length; i++) {
      if (selected.size >= TARGET_MAX_CANDIDATES) break;
      const bucket = buckets[i];
      // Skip candidates this bucket shares with an already-claimed
      // bucket (an exercise can be, e.g., both isMobility and have a
      // primaryMuscleGroup) so one turn never wastes a bucket's slot on
      // a candidate that cost it nothing new.
      while (bucketIndex[i] < bucket.candidates.length && selected.has(bucket.candidates[bucketIndex[i]].id)) {
        bucketIndex[i]++;
      }
      if (bucketIndex[i] < bucket.candidates.length) {
        selected.set(bucket.candidates[bucketIndex[i]].id, bucket.candidates[bucketIndex[i]]);
        bucketIndex[i]++;
        madeProgress = true;
      }
    }
    if (!madeProgress) break; // every bucket exhausted — nothing left to round-robin
  }

  const finalCandidates = Array.from(selected.values()).sort(sortCandidates);

  return { candidates: finalCandidates, gaps };
}

// ─────────────────────────────────────────────────────────────
// PROMPT FORMATTING — compact, bounded. One line per candidate; fields
// omitted when empty/uninformative rather than padded, to keep the
// per-candidate token cost down across up to 150 rows.
// ─────────────────────────────────────────────────────────────

export function formatCandidatesForPrompt(candidates: ExerciseCandidate[]): string {
  const lines = candidates.map((c) => {
    const parts = [
      c.id,
      c.name,
      c.alternateNames.length > 0 ? `alt: ${c.alternateNames.join("/")}` : null,
      c.primaryMuscleGroup
        ? `muscle: ${c.primaryMuscleGroup}${c.secondaryMuscleGroups.length > 0 ? ` (+${c.secondaryMuscleGroups.join(",")})` : ""}`
        : null,
      `pattern: ${c.movementPattern}`,
      `class: ${c.classification}`,
      c.resistanceType ? `equip: ${c.resistanceType}` : "equip: bodyweight",
      `level: ${c.difficulty}`,
      c.isMobility ? "MOBILITY" : null,
      c.isCardio ? "CARDIO" : null,
      c.highJointStress.length > 0 ? `high-stress: ${c.highJointStress.join(",")}` : null,
    ].filter((p): p is string => p !== null);
    return parts.join(" | ");
  });
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// VERIFICATION — never trust a model-returned exerciseId merely because
// it's present and UUID-shaped. A selection is accepted only when the
// id is IN the exact candidate set supplied for this call AND the
// returned name matches that candidate's canonical or alternate name.
// Anything that fails either check has its exerciseId stripped back to
// undefined — exerciseName is left untouched, so exercise-resolution.ts's
// existing name-based resolver picks it up as a normal fallback
// (defense in depth, not the primary path — see that module).
// ─────────────────────────────────────────────────────────────

function candidateNameMatches(candidate: ExerciseCandidate, claimedName: string): boolean {
  const normalizedClaim = normalizeExerciseName(claimedName);
  if (normalizeExerciseName(candidate.name) === normalizedClaim) return true;
  return candidate.alternateNames.some((alt) => normalizeExerciseName(alt) === normalizedClaim);
}

function verifyPrescription(
  prescription: ModelPrescription,
  candidateById: Map<string, ExerciseCandidate>,
): { prescription: ModelPrescription; rejected: boolean } {
  if (!prescription.exerciseId) return { prescription, rejected: false };

  const candidate = candidateById.get(prescription.exerciseId);
  if (candidate && candidateNameMatches(candidate, prescription.exerciseName)) {
    // Verified — canonicalize the name to the real library value so the
    // review UI never shows a slightly-off echo of it.
    return {
      prescription: { ...prescription, exerciseId: candidate.id, exerciseName: candidate.name },
      rejected: false,
    };
  }

  // Off-catalog id, or an id that IS a real candidate but paired with a
  // mismatched name (the model reused an id it recognized for the wrong
  // exercise, or vice versa) — reject the id, keep the name for fallback
  // resolution.
  const { exerciseId: _drop, ...rest } = prescription;
  void _drop;
  return { prescription: rest as ModelPrescription, rejected: true };
}

export interface VerificationResult<T> {
  result: T;
  rejectedCount: number;
}

export function verifyWeekAgainstCandidates(
  week: ModelWeekDraft,
  candidates: ExerciseCandidate[],
): VerificationResult<ModelWeekDraft> {
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  let rejectedCount = 0;

  const verifiedWeek: ModelWeekDraft = {
    ...week,
    days: week.days.map((day) => ({
      ...day,
      workout: day.workout
        ? {
            ...day.workout,
            sections: day.workout.sections.map((section) => ({
              ...section,
              prescriptions: section.prescriptions.map((p) => {
                const { prescription, rejected } = verifyPrescription(p, candidateById);
                if (rejected) rejectedCount++;
                return prescription;
              }),
            })),
          }
        : null,
    })),
  };

  return { result: verifiedWeek, rejectedCount };
}

export function verifyProgramDraftAgainstCandidates(
  draft: ModelProgramDraft,
  candidates: ExerciseCandidate[],
): VerificationResult<ModelProgramDraft> {
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  let rejectedCount = 0;

  const verifiedDraft: ModelProgramDraft = {
    ...draft,
    weeks: draft.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        workout: day.workout
          ? {
              ...day.workout,
              sections: day.workout.sections.map((section) => ({
                ...section,
                prescriptions: section.prescriptions.map((p) => {
                  const { prescription, rejected } = verifyPrescription(p, candidateById);
                  if (rejected) rejectedCount++;
                  return prescription;
                }),
              })),
            }
          : null,
      })),
    })),
  };

  return { result: verifiedDraft, rejectedCount };
}
