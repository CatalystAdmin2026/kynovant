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
import type {
  ProgramGenerationBrief,
  ModelWeekDraft,
  ModelDayDraft,
  ModelProgramDraft,
  ModelPrescription,
  ProgramShellDay,
} from "./contracts";

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
// Exported for week-cross-day-validation.ts's coverage check — same
// "every split still needs a program-wide muscle profile" set, reused
// rather than redefined so the two never drift apart.
export const CORE_MUSCLE_GROUPS: MuscleGroup[] = [
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

export function sortCandidates(a: ExerciseCandidate, b: ExerciseCandidate): number {
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
// DAY-LEVEL CANDIDATE NARROWING
//
// P0 architecture change (see staged-generation.ts's header comment):
// whole-week generation sent this module's full ~150-candidate program-
// wide pool to every call, regardless of which muscle groups that
// specific day actually trains — wasteful (every call re-pays the same
// ~5-8k input tokens re-describing candidates the day will never use)
// and hands the model more to search than it needs. This narrows the
// ALREADY-computed candidate set (buildExerciseCandidateSet above is
// unchanged — tenant visibility, equipment compatibility, difficulty
// ceiling, and exclusions are still applied exactly once, upstream of
// this) down to what one day actually needs, deterministically, before
// the model ever sees it. The model never decides which muscles matter
// for a day — that's either the shell's own structured
// targetMuscleGroups (contracts.ts's ProgramShellDaySchema) or, for a
// shell generated before that field existed, a keyword fallback over
// the shell day's freeform label/focus text.
//
// Movement-pattern/unilateral-bilateral/substitution-aware narrowing
// WITHIN a matched muscle group is a reasonable follow-up refinement,
// not implemented in this pass — nothing here excludes an exercise for
// being unilateral/bilateral, a specific pattern, or a substitution
// variant; muscle-group narrowing alone already reduces the pool by the
// target order of magnitude (see this file's test suite for actual
// before/after counts on realistic fixtures) without needing to
// additionally discriminate on pattern.
//
// Review findings addressed here (day-level architecture v1):
//   - primary-muscle-only filtering  -> now also includes SECONDARY-
//     muscle matches (a smaller cap) — an exercise whose secondary
//     target is the day's focus (e.g. Romanian Deadlift: primary
//     hamstrings, secondary glutes) used to be invisible to a "Glutes"
//     day even though it's a legitimate, common choice for one.
//   - poor mobility/conditioning fallback -> DAY_TYPE_KEYWORDS below
//     recognizes a day whose own label/focus IS "Mobility"/"Recovery"/
//     "Conditioning"/"Cardio" and gives it a much larger allowance of
//     exactly that category instead of the same flat baseline every
//     other day gets.
//   - global musclePriorities leaking into every day -> a priority
//     muscle now only gets the WIDER cap when it's already one of this
//     day's own target groups; a day the shell never associated with
//     that muscle no longer has it silently injected. Ensuring every
//     priority muscle gets ENOUGH dedicated days at all is the shell's
//     job (targetMuscleGroups at shell-generation time), not narrowing's.
//   - the floor masking weak filtering -> the floor still exists (never
//     narrow below MIN_DAY_CANDIDATES), but top-up now prefers
//     candidates already excluded only by a CAP (secondary-muscle
//     overflow, mobility/cardio overflow) before falling back to the
//     fully generic full-pool order, so hitting the floor reflects
//     genuine scarcity in the library, not just a low per-bucket cap.
// ─────────────────────────────────────────────────────────────

const DAY_FOCUS_MUSCLE_KEYWORDS: { pattern: RegExp; groups: MuscleGroup[] }[] = [
  { pattern: /\bpush\b/i, groups: ["chest", "front_deltoid", "lateral_deltoid", "triceps"] },
  { pattern: /\bpull\b/i, groups: ["lats", "upper_back", "rear_deltoid", "biceps"] },
  {
    pattern: /\bupper\b/i,
    groups: ["chest", "lats", "upper_back", "front_deltoid", "lateral_deltoid", "rear_deltoid", "biceps", "triceps"],
  },
  { pattern: /\b(lower|leg)s?\b/i, groups: ["quadriceps", "hamstrings", "glutes", "calves"] },
  { pattern: /\bchest\b/i, groups: ["chest", "triceps", "front_deltoid"] },
  { pattern: /\bback\b/i, groups: ["lats", "upper_back", "rear_deltoid", "biceps"] },
  { pattern: /\bshoulders?\b/i, groups: ["front_deltoid", "lateral_deltoid", "rear_deltoid"] },
  { pattern: /\barms?\b/i, groups: ["biceps", "triceps"] },
  { pattern: /\bglutes?\b/i, groups: ["glutes", "hamstrings"] },
  { pattern: /\bquads?\b/i, groups: ["quadriceps"] },
  { pattern: /\bhamstrings?\b/i, groups: ["hamstrings"] },
  { pattern: /\bcalves?\b/i, groups: ["calves"] },
  { pattern: /\bcore\b|\babs?\b/i, groups: ["rectus_abdominis", "obliques"] },
  { pattern: /\bfull.?body\b/i, groups: CORE_MUSCLE_GROUPS },
];

// Day TYPES, as opposed to muscle groups — a "Mobility" or "Conditioning"
// day isn't under-served by muscle-group narrowing, it's a different
// AXIS entirely (isMobility/isCardio flags, not primaryMuscleGroup).
// Detected the same way (structured field first, keyword fallback) so
// a day like this gets a deliberately mobility/cardio-heavy pool
// instead of either the generic baseline allowance or (if it happened
// to match zero muscle keywords) the full unnarrowed pool.
type DayType = "mobility" | "cardio";
const DAY_TYPE_KEYWORDS: { pattern: RegExp; type: DayType }[] = [
  { pattern: /\bmobility\b|\brecovery\b|\bstretch(ing)?\b|\byoga\b/i, type: "mobility" },
  { pattern: /\bcardio\b|\bconditioning\b|\bmetcon\b|\bhiit\b/i, type: "cardio" },
];

function inferDayType(label: string, focus: string | undefined): DayType | null {
  const text = [label, focus].filter(Boolean).join(" ");
  for (const { pattern, type } of DAY_TYPE_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

// Exported for direct unit testing without needing a full ProgramShellDay.
export function inferMuscleGroupsFromDayText(label: string, focus: string | undefined): MuscleGroup[] {
  const text = [label, focus].filter(Boolean).join(" ");
  const matched = new Set<MuscleGroup>();
  for (const { pattern, groups } of DAY_FOCUS_MUSCLE_KEYWORDS) {
    if (pattern.test(text)) for (const g of groups) matched.add(g);
  }
  return Array.from(matched);
}

// Never narrow below this many candidates — the floor that keeps
// narrowing from ever making "legitimate programming impossible."
// Chosen well above what any single day realistically needs (a 5-
// section day rarely selects more than ~15-20 distinct exercises even
// with substitution headroom) while still being a large, clear cut
// from the ~150 program-wide pool.
const MIN_DAY_CANDIDATES = 30;
const MAX_PER_MUSCLE_GROUP_DAY = 10;
// Priority muscles that ARE also one of this day's own targets get this
// wider cap instead — an intentional emphasis day, not a leak.
const MAX_PER_MUSCLE_GROUP_DAY_PRIORITY = 14;
// Secondary-muscle matches get a smaller cap than primary — relevant,
// but not the day's main event.
const MAX_PER_MUSCLE_GROUP_DAY_SECONDARY = 4;
const MAX_MOBILITY_CANDIDATES_DAY = 10;
const MAX_CARDIO_CANDIDATES_DAY = 6;
// A day whose own TYPE is mobility/cardio (not muscle-group-based) gets
// a much larger allowance of exactly that category.
const MAX_CANDIDATES_FOR_OWN_DAY_TYPE = 60;

export function narrowCandidatesForDay(
  candidateSet: ExerciseCandidateSet,
  shellDay: ProgramShellDay,
  musclePriorities: readonly MuscleGroup[],
): ExerciseCandidate[] {
  const dayType = inferDayType(shellDay.label, shellDay.focus);
  if (dayType) {
    const primary = candidateSet.candidates
      .filter((c) => (dayType === "mobility" ? c.isMobility : c.isCardio))
      .slice(0, MAX_CANDIDATES_FOR_OWN_DAY_TYPE);
    // Still needs a small general allowance (a mobility day still
    // includes core/activation work drawn from ordinary muscle groups,
    // not exclusively isMobility rows) — floor logic below handles it.
    const targeted = new Map(primary.map((c) => [c.id, c]));
    topUpToFloor(targeted, candidateSet.candidates);
    return Array.from(targeted.values()).sort(sortCandidates);
  }

  const targetGroups = shellDay.targetMuscleGroups?.length
    ? shellDay.targetMuscleGroups
    : inferMuscleGroupsFromDayText(shellDay.label, shellDay.focus);

  // Unclassifiable day (no structured field on the shell, no keyword
  // match on its label/focus) — never guess narrower; hand back the
  // full program-wide pool exactly as whole-week generation always did.
  if (targetGroups.length === 0) return candidateSet.candidates;

  const targetGroupSet = new Set(targetGroups);
  // A priority muscle only earns the WIDER cap when it's also one of
  // THIS day's own targets — no longer unconditionally unioned into
  // every day regardless of relevance (the "leak" the review flagged).
  const priorityGroupsForThisDay = musclePriorities.filter((mg) => targetGroupSet.has(mg));

  const targeted = new Map<string, ExerciseCandidate>();
  const overflow: ExerciseCandidate[] = [];
  for (const group of targetGroupSet) {
    const cap = priorityGroupsForThisDay.includes(group) ? MAX_PER_MUSCLE_GROUP_DAY_PRIORITY : MAX_PER_MUSCLE_GROUP_DAY;
    const matches = candidateSet.candidates.filter((c) => c.primaryMuscleGroup === group);
    for (const c of matches.slice(0, cap)) targeted.set(c.id, c);
    overflow.push(...matches.slice(cap)); // capped-out primary matches — preferred top-up material
  }

  // Secondary-muscle relevance: an exercise whose SECONDARY target
  // overlaps this day's focus is a legitimate, common choice (e.g. an
  // RDL — primary hamstrings — on a Glutes day) that primary-only
  // filtering used to make invisible entirely.
  for (const c of candidateSet.candidates) {
    if (targeted.has(c.id)) continue;
    if (!c.secondaryMuscleGroups.some((mg) => targetGroupSet.has(mg))) continue;
    overflow.push(c); // added to overflow first; capped below
  }
  let secondaryAdded = 0;
  for (const c of overflow) {
    if (secondaryAdded >= MAX_PER_MUSCLE_GROUP_DAY_SECONDARY * targetGroupSet.size) break;
    if (targeted.has(c.id)) continue;
    if (!c.secondaryMuscleGroups.some((mg) => targetGroupSet.has(mg))) continue;
    targeted.set(c.id, c);
    secondaryAdded++;
  }

  // Every day still needs a warmup section (see prompt.ts's shared
  // output-contract notes) and cardio/conditioning is cross-cutting,
  // not tied to a target muscle group — always include a baseline
  // allowance of both regardless of what this day trains.
  for (const c of candidateSet.candidates.filter((c) => c.isMobility).slice(0, MAX_MOBILITY_CANDIDATES_DAY)) {
    targeted.set(c.id, c);
  }
  for (const c of candidateSet.candidates.filter((c) => c.isCardio).slice(0, MAX_CARDIO_CANDIDATES_DAY)) {
    targeted.set(c.id, c);
  }

  topUpToFloor(targeted, candidateSet.candidates, overflow);
  return Array.from(targeted.values()).sort(sortCandidates);
}

// Floor top-up, shared by both the day-type and muscle-group paths
// above. Prefers candidates already identified as relevant-but-capped
// (`preferred` — primary matches an earlier per-group cap excluded, or
// secondary-muscle matches that lost the cap race) before falling back
// to the fully generic full-pool order, so reaching the floor reflects
// genuine scarcity in the library for this day, not merely a low
// per-bucket cap masking otherwise-available relevant candidates.
function topUpToFloor(
  targeted: Map<string, ExerciseCandidate>,
  fullPool: ExerciseCandidate[],
  preferred: ExerciseCandidate[] = [],
): void {
  if (targeted.size >= MIN_DAY_CANDIDATES) return;
  for (const c of preferred) {
    if (targeted.size >= MIN_DAY_CANDIDATES) break;
    targeted.set(c.id, c);
  }
  if (targeted.size >= MIN_DAY_CANDIDATES) return;
  for (const c of fullPool) {
    if (targeted.size >= MIN_DAY_CANDIDATES) break;
    targeted.set(c.id, c);
  }
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

// Same rule as verifyWeekAgainstCandidates/verifyProgramDraftAgainstCandidates
// below, scoped to a single day — day-level generation's verification
// step. candidates here is the NARROWED per-day set (narrowCandidatesForDay
// above), not the full program-wide pool — a day is only ever allowed
// to claim an id from the exact set it was offered for that call.
export function verifyDayAgainstCandidates(
  day: ModelDayDraft,
  candidates: ExerciseCandidate[],
): VerificationResult<ModelDayDraft> {
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  let rejectedCount = 0;

  const verifiedDay: ModelDayDraft = {
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
  };

  return { result: verifiedDay, rejectedCount };
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
