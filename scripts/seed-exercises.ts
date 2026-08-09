#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Dev Seed (Sprint 5C.1)
//
// Usage (run AFTER applying the Sprint 5C.1 migration):
//   set -a && source .env.local && set +a && npx tsx scripts/seed-exercises.ts
//
// Requires DATABASE_URL_DIRECT in the environment.
// Idempotent — safe to run multiple times. Uses ON CONFLICT DO NOTHING
// on all inserts, so existing rows are never modified.
//
// Creates:
//   10 equipment catalog items
//   15 representative exercises with muscles, equipment, and cues
//    3 exercise relations (lower_joint_stress, same_pattern, progression)
// ─────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import {
  exercises,
  exerciseMuscles,
  equipmentCatalog,
  exerciseEquipment,
  exerciseRelations,
  exerciseCues,
  type MuscleGroup,
  type MuscleRole,
  type EquipmentRequirement,
  type ExerciseCueType,
  type ExerciseRelationType,
} from "../lib/db/schema-exercise";

const rawUrl = process.env.DATABASE_URL_DIRECT;
if (!rawUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

const sql = postgres(rawUrl, { prepare: false });
const db = drizzle(sql);

// ─────────────────────────────────────────────────────────────
// EQUIPMENT CATALOG
// ─────────────────────────────────────────────────────────────

const EQUIPMENT = [
  { slug: "barbell", name: "Barbell", category: "free_weights" },
  { slug: "power-rack", name: "Power Rack", category: "free_weights" },
  { slug: "dumbbells", name: "Dumbbells", category: "free_weights" },
  { slug: "adjustable-bench", name: "Adjustable Bench", category: "accessories" },
  { slug: "cable-station", name: "Cable Station", category: "cables" },
  { slug: "lat-pulldown-machine", name: "Lat Pulldown Machine", category: "machines" },
  { slug: "leg-press-machine", name: "Leg Press Machine", category: "machines" },
  { slug: "seated-leg-curl-machine", name: "Seated Leg Curl Machine", category: "machines" },
  { slug: "resistance-band", name: "Resistance Band", category: "accessories" },
  { slug: "stair-climber", name: "Stair Climber / StepMill", category: "cardio_equipment" },
] as const;

// ─────────────────────────────────────────────────────────────
// EXERCISES
// ─────────────────────────────────────────────────────────────

const EXERCISES = [
  {
    slug: "back-squat",
    name: "Back Squat",
    movementPattern: "squat_bilateral" as const,
    classification: "compound" as const,
    resistanceType: "barbell" as const,
    difficulty: "intermediate" as const,
    fatigueCost: 9,
    technicalComplexity: 7,
    stabilityDemand: 7,
    jointStressShoulder: 3,
    jointStressSpine: 7,
    jointStressHip: 6,
    jointStressKnee: 8,
    lengthenedBias: 8,
    stretchMediatedPotential: 9,
  },
  {
    slug: "romanian-deadlift",
    name: "Romanian Deadlift",
    movementPattern: "hip_hinge" as const,
    classification: "compound" as const,
    resistanceType: "barbell" as const,
    difficulty: "intermediate" as const,
    fatigueCost: 8,
    technicalComplexity: 6,
    stabilityDemand: 6,
    jointStressSpine: 6,
    jointStressHip: 7,
    jointStressKnee: 3,
    lengthenedBias: 10,
    stretchMediatedPotential: 10,
  },
  {
    slug: "hip-thrust",
    name: "Hip Thrust",
    movementPattern: "hip_extension" as const,
    classification: "compound" as const,
    resistanceType: "barbell" as const,
    difficulty: "beginner" as const,
    fatigueCost: 6,
    technicalComplexity: 4,
    stabilityDemand: 4,
    jointStressSpine: 3,
    jointStressHip: 6,
    jointStressKnee: 4,
    shortenedBias: 8,
    stretchMediatedPotential: 2,
  },
  {
    slug: "leg-press",
    name: "Leg Press",
    movementPattern: "squat_bilateral" as const,
    classification: "compound" as const,
    resistanceType: "plate_loaded" as const,
    difficulty: "beginner" as const,
    fatigueCost: 6,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressSpine: 2,
    jointStressHip: 5,
    jointStressKnee: 6,
    lengthenedBias: 7,
    stretchMediatedPotential: 6,
  },
  {
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    movementPattern: "squat_unilateral" as const,
    classification: "compound" as const,
    resistanceType: "dumbbell" as const,
    difficulty: "intermediate" as const,
    unilateral: true,
    fatigueCost: 8,
    technicalComplexity: 6,
    stabilityDemand: 8,
    jointStressHip: 7,
    jointStressKnee: 7,
    lengthenedBias: 9,
    stretchMediatedPotential: 9,
  },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    movementPattern: "pull_vertical" as const,
    classification: "compound" as const,
    resistanceType: "machine" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 5,
    technicalComplexity: 3,
    stabilityDemand: 3,
    jointStressShoulder: 4,
    jointStressElbow: 3,
    lengthenedBias: 7,
    stretchMediatedPotential: 6,
  },
  {
    slug: "chest-supported-dumbbell-row",
    name: "Chest-Supported Dumbbell Row",
    movementPattern: "pull_horizontal" as const,
    classification: "compound" as const,
    resistanceType: "dumbbell" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    fatigueCost: 5,
    technicalComplexity: 3,
    stabilityDemand: 2,
    jointStressShoulder: 3,
    jointStressSpine: 1,
    lengthenedBias: 8,
    stretchMediatedPotential: 6,
  },
  {
    slug: "dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    movementPattern: "push_horizontal" as const,
    classification: "compound" as const,
    resistanceType: "dumbbell" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "lying_supine" as const,
    fatigueCost: 6,
    technicalComplexity: 4,
    stabilityDemand: 5,
    jointStressShoulder: 5,
    jointStressElbow: 4,
    lengthenedBias: 7,
    stretchMediatedPotential: 7,
  },
  {
    slug: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    movementPattern: "shoulder_abduction" as const,
    classification: "isolation" as const,
    resistanceType: "cable" as const,
    difficulty: "beginner" as const,
    unilateral: true,
    alternating: true,
    fatigueCost: 3,
    technicalComplexity: 3,
    stabilityDemand: 3,
    jointStressShoulder: 4,
    lengthenedBias: 8,
    stretchMediatedPotential: 7,
  },
  {
    slug: "seated-leg-curl",
    name: "Seated Leg Curl",
    movementPattern: "knee_flexion" as const,
    classification: "isolation" as const,
    resistanceType: "machine" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "seated" as const,
    fatigueCost: 4,
    technicalComplexity: 2,
    stabilityDemand: 1,
    jointStressKnee: 4,
    lengthenedBias: 7,
    stretchMediatedPotential: 7,
  },
  {
    slug: "cable-triceps-pressdown",
    name: "Cable Triceps Pressdown",
    movementPattern: "elbow_extension" as const,
    classification: "isolation" as const,
    resistanceType: "cable" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressElbow: 3,
    shortenedBias: 6,
    stretchMediatedPotential: 2,
  },
  {
    slug: "dumbbell-curl",
    name: "Dumbbell Curl",
    movementPattern: "elbow_flexion" as const,
    classification: "isolation" as const,
    resistanceType: "dumbbell" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    fatigueCost: 3,
    technicalComplexity: 2,
    stabilityDemand: 2,
    jointStressElbow: 3,
    lengthenedBias: 6,
    stretchMediatedPotential: 4,
  },
  {
    slug: "plank",
    name: "Plank",
    movementPattern: "iso_hold" as const,
    classification: "compound" as const,
    resistanceType: "bodyweight" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "lying_prone" as const,
    isTimeBased: true,
    fatigueCost: 3,
    technicalComplexity: 2,
    stabilityDemand: 5,
    jointStressSpine: 3,
    jointStressShoulder: 3,
    stretchMediatedPotential: 0,
  },
  {
    slug: "stair-climber",
    name: "Stair Climber",
    movementPattern: "gait" as const,
    classification: "cardio" as const,
    resistanceType: "machine" as const,
    difficulty: "beginner" as const,
    isTimeBased: true,
    isCardio: true,
    isDistanceBased: true,
    fatigueCost: 5,
    technicalComplexity: 1,
    stabilityDemand: 3,
    jointStressKnee: 4,
    jointStressHip: 3,
    stretchMediatedPotential: 2,
  },
  {
    slug: "banded-glute-walk",
    name: "Banded Glute Walk",
    movementPattern: "gait" as const,
    classification: "isolation" as const,
    resistanceType: "band" as const,
    difficulty: "beginner" as const,
    defaultBodyPosition: "standing" as const,
    isTimeBased: false,
    fatigueCost: 2,
    technicalComplexity: 2,
    stabilityDemand: 3,
    jointStressKnee: 2,
    stretchMediatedPotential: 1,
  },
] as const;

// ─────────────────────────────────────────────────────────────
// MUSCLES
// [slug, muscle_group, role]
// ─────────────────────────────────────────────────────────────

const MUSCLES: Array<[string, MuscleGroup, MuscleRole]> = [
  ["back-squat", "quadriceps", "primary"],
  ["back-squat", "glutes", "primary"],
  ["back-squat", "hamstrings", "secondary"],
  ["back-squat", "adductors", "secondary"],
  ["back-squat", "spinal_erectors", "stabilizer"],

  ["romanian-deadlift", "hamstrings", "primary"],
  ["romanian-deadlift", "glutes", "primary"],
  ["romanian-deadlift", "spinal_erectors", "secondary"],
  ["romanian-deadlift", "adductors", "secondary"],

  ["hip-thrust", "glutes", "primary"],
  ["hip-thrust", "hamstrings", "secondary"],
  ["hip-thrust", "quadriceps", "stabilizer"],

  ["leg-press", "quadriceps", "primary"],
  ["leg-press", "glutes", "secondary"],
  ["leg-press", "hamstrings", "secondary"],

  ["bulgarian-split-squat", "quadriceps", "primary"],
  ["bulgarian-split-squat", "glutes", "primary"],
  ["bulgarian-split-squat", "hamstrings", "secondary"],
  ["bulgarian-split-squat", "adductors", "stabilizer"],
  ["bulgarian-split-squat", "hip_flexors", "stabilizer"],

  ["lat-pulldown", "lats", "primary"],
  ["lat-pulldown", "rear_deltoid", "secondary"],
  ["lat-pulldown", "upper_back", "secondary"],
  ["lat-pulldown", "biceps", "secondary"],

  ["chest-supported-dumbbell-row", "upper_back", "primary"],
  ["chest-supported-dumbbell-row", "rhomboids", "primary"],
  ["chest-supported-dumbbell-row", "rear_deltoid", "primary"],
  ["chest-supported-dumbbell-row", "lats", "secondary"],
  ["chest-supported-dumbbell-row", "biceps", "secondary"],

  ["dumbbell-bench-press", "chest", "primary"],
  ["dumbbell-bench-press", "front_deltoid", "secondary"],
  ["dumbbell-bench-press", "triceps", "secondary"],

  ["cable-lateral-raise", "lateral_deltoid", "primary"],
  ["cable-lateral-raise", "front_deltoid", "stabilizer"],
  ["cable-lateral-raise", "trapezius", "stabilizer"],

  ["seated-leg-curl", "hamstrings", "primary"],
  ["seated-leg-curl", "calves", "stabilizer"],

  ["cable-triceps-pressdown", "triceps", "primary"],
  ["cable-triceps-pressdown", "forearms", "stabilizer"],

  ["dumbbell-curl", "biceps", "primary"],
  ["dumbbell-curl", "brachialis", "secondary"],
  ["dumbbell-curl", "brachioradialis", "secondary"],
  ["dumbbell-curl", "forearms", "stabilizer"],

  ["plank", "rectus_abdominis", "primary"],
  ["plank", "transverse_abdominis", "primary"],
  ["plank", "obliques", "secondary"],
  ["plank", "spinal_erectors", "stabilizer"],

  ["stair-climber", "cardiovascular", "primary"],
  ["stair-climber", "glutes", "secondary"],
  ["stair-climber", "quadriceps", "secondary"],
  ["stair-climber", "calves", "secondary"],

  ["banded-glute-walk", "abductors", "primary"],
  ["banded-glute-walk", "glutes", "secondary"],
];

// ─────────────────────────────────────────────────────────────
// EQUIPMENT LINKS
// [exercise_slug, equipment_slug, requirement_type]
// ─────────────────────────────────────────────────────────────

const EXERCISE_EQUIPMENT: Array<[string, string, EquipmentRequirement]> = [
  ["back-squat", "barbell", "required"],
  ["back-squat", "power-rack", "required"],

  ["romanian-deadlift", "barbell", "required"],

  ["hip-thrust", "barbell", "required"],
  ["hip-thrust", "adjustable-bench", "optional"],

  ["leg-press", "leg-press-machine", "required"],

  ["bulgarian-split-squat", "dumbbells", "required"],
  ["bulgarian-split-squat", "adjustable-bench", "required"],

  ["lat-pulldown", "lat-pulldown-machine", "required"],

  ["chest-supported-dumbbell-row", "dumbbells", "required"],
  ["chest-supported-dumbbell-row", "adjustable-bench", "required"],

  ["dumbbell-bench-press", "dumbbells", "required"],
  ["dumbbell-bench-press", "adjustable-bench", "required"],

  ["cable-lateral-raise", "cable-station", "required"],

  ["seated-leg-curl", "seated-leg-curl-machine", "required"],

  ["cable-triceps-pressdown", "cable-station", "required"],

  ["dumbbell-curl", "dumbbells", "required"],

  ["stair-climber", "stair-climber", "required"],

  ["banded-glute-walk", "resistance-band", "required"],
];

// ─────────────────────────────────────────────────────────────
// CUES
// [exercise_slug, cue_type, content, order_index]
// ─────────────────────────────────────────────────────────────

const CUES: Array<[string, ExerciseCueType, string, number]> = [
  ["back-squat", "setup", "Position the bar on your upper traps, not your neck. Hands slightly wider than shoulder-width.", 1],
  ["back-squat", "execution", "Brace your core hard as if taking a punch. Drive your knees out over your toes throughout the descent.", 2],
  ["back-squat", "breathing", "Take a deep breath into your belly before you unrack. Hold the brace through the entire rep, exhale at the top.", 3],
  ["back-squat", "common_error", "Morning-star collapse — the bar tips forward and your chest drops as you rise from the bottom. Drive your traps into the bar and keep your chest up through the entire ascent.", 4],

  ["romanian-deadlift", "setup", "Hinge at the hips with a soft knee bend. Keep the bar close to your legs — it should drag up your shins on the way back.", 1],
  ["romanian-deadlift", "execution", "Drive your hips back, not down. Feel the stretch deep in your hamstrings. Stop before your lower back loses its neutral arch.", 2],
  ["romanian-deadlift", "mental_cue", "Think 'chest to the wall in front of you' to keep your torso from dropping too fast.", 3],
  ["romanian-deadlift", "breathing", "Brace hard and take a full breath into your belly before the descent. Maintain the brace through the entire rep. Exhale only at the top once your hips are locked out.", 4],

  ["hip-thrust", "setup", "Upper back rests against the bench pad at your shoulder blades. Feet flat, hip-width apart, toes slightly out.", 1],
  ["hip-thrust", "execution", "Drive through your whole foot, especially your heels. Squeeze your glutes hard at the top — posterior tilt the pelvis.", 2],

  ["bulgarian-split-squat", "setup", "Elevate your rear foot at lace height on the bench. Step your front foot far enough forward that your shin stays nearly vertical when your rear knee reaches the floor.", 1],
  ["bulgarian-split-squat", "execution", "Lower your rear knee straight down toward the floor — not forward. Drive through your entire front foot and keep your torso upright or with a controlled forward lean initiated at the hip, not the spine.", 2],
  ["bulgarian-split-squat", "breathing", "Inhale on the descent. Exhale forcefully as you drive through your front foot back to the start position.", 3],
  ["bulgarian-split-squat", "common_error", "Front knee caving inward on the drive phase. Track your knee over your second toe throughout. If collapse occurs, reduce load and reinforce hip abductor engagement before adding weight.", 4],

  ["lat-pulldown", "setup", "Grip slightly wider than shoulder-width. Pull your shoulder blades down and back before you pull the bar.", 1],
  ["lat-pulldown", "execution", "Drive your elbows toward your hips — imagine bending the bar in half. Resist the return slowly on the way up.", 2],

  ["dumbbell-bench-press", "setup", "Lower the dumbbells to chest level with elbows at roughly 75°. Don't let them flare out to 90°.", 1],
  ["dumbbell-bench-press", "execution", "Press up and slightly in — dumbbells should converge toward each other at the top.", 2],

  ["cable-lateral-raise", "setup", "Stand with the cable at hip height on your non-working side. Slight lean away from the cable.", 1],
  ["cable-lateral-raise", "execution", "Lead with your elbow, not your hand. Raise to parallel — no higher or your traps take over.", 2],

  ["plank", "setup", "Forearms on the floor, elbows under shoulders. Squeeze your glutes and quads, tuck your pelvis slightly.", 1],
  ["plank", "common_error", "Avoid letting your hips pike up or sink. Your body should form a straight line from head to heels.", 2],
];

// ─────────────────────────────────────────────────────────────
// RELATIONS
// [source_slug, target_slug, relation_type, notes]
// ─────────────────────────────────────────────────────────────

const RELATIONS: Array<[string, string, ExerciseRelationType, string]> = [
  // Leg Press is a lower-joint-stress alternative to Back Squat
  ["leg-press", "back-squat", "lower_joint_stress", "Leg press removes the axial spine load and reduces hip/knee stress while maintaining quad emphasis."],
  // Bulgarian Split Squat and Back Squat share the same movement pattern
  ["bulgarian-split-squat", "back-squat", "same_pattern", "Both are squat-pattern movements. Bulgarian split squat adds unilateral demand and lengthened-position hip stretch."],
  // Romanian Deadlift → Seated Leg Curl: progression (source = the harder exercise)
  ["romanian-deadlift", "seated-leg-curl", "progression", "RDL is the more advanced variation — it requires active hip stability, a controlled eccentric under load, and significantly greater technical demand than the machine-guided seated curl."],
];

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed");
  console.log("─────────────────────────────────────\n");

  // 1. Equipment catalog
  console.log(`Seeding ${EQUIPMENT.length} equipment catalog items…`);
  await db
    .insert(equipmentCatalog)
    .values(EQUIPMENT.map((e) => ({ ...e })))
    .onConflictDoNothing();

  const allEquipment = await db.select().from(equipmentCatalog);
  const equipmentMap = new Map(allEquipment.map((e) => [e.slug, e.id]));
  console.log(`  ✓ Equipment catalog: ${allEquipment.length} total items`);

  // 2. Exercises
  console.log(`\nSeeding ${EXERCISES.length} exercises…`);
  await db
    .insert(exercises)
    .values(
      EXERCISES.map((e) => ({
        ...e,
        status: "active" as const,
        // Canonical Kynovant library content, same as scripts/seeds/
        // _shared.ts's seedExercises() — see that function's header
        // comment for why scope/coachCreated must be set explicitly
        // rather than left at their "coach"/true column defaults.
        scope: "system" as const,
        coachCreated: false,
      })),
    )
    .onConflictDoNothing();

  const allExercises = await db
    .select()
    .from(exercises)
    .where(
      inArray(
        exercises.slug,
        EXERCISES.map((e) => e.slug),
      ),
    );
  const exerciseMap = new Map(allExercises.map((e) => [e.slug, e.id]));
  console.log(`  ✓ Exercises: ${allExercises.length} seeded`);

  // 3. Exercise muscles
  console.log(`\nSeeding muscle associations…`);
  const muscleRows = MUSCLES.flatMap(([slug, muscleGroup, role]) => {
    const exerciseId = exerciseMap.get(slug);
    if (!exerciseId) {
      console.warn(`  ⚠ Unknown exercise slug for muscle: ${slug}`);
      return [];
    }
    return [{ exerciseId, muscleGroup, role }];
  });
  await db.insert(exerciseMuscles).values(muscleRows).onConflictDoNothing();
  console.log(`  ✓ Muscle links: ${muscleRows.length} rows`);

  // 4. Exercise equipment links
  console.log(`\nSeeding equipment links…`);
  const equipmentRows = EXERCISE_EQUIPMENT.flatMap(
    ([exSlug, eqSlug, requirementType]) => {
      const exerciseId = exerciseMap.get(exSlug);
      const equipmentCatalogId = equipmentMap.get(eqSlug);
      if (!exerciseId || !equipmentCatalogId) {
        console.warn(`  ⚠ Unknown slug in equipment link: ${exSlug} / ${eqSlug}`);
        return [];
      }
      return [{ exerciseId, equipmentCatalogId, requirementType }];
    },
  );
  await db.insert(exerciseEquipment).values(equipmentRows).onConflictDoNothing();
  console.log(`  ✓ Equipment links: ${equipmentRows.length} rows`);

  // 5. Exercise cues
  console.log(`\nSeeding coaching cues…`);
  const cueRows = CUES.flatMap(([slug, cueType, content, orderIndex]) => {
    const exerciseId = exerciseMap.get(slug);
    if (!exerciseId) {
      console.warn(`  ⚠ Unknown exercise slug for cue: ${slug}`);
      return [];
    }
    return [{ exerciseId, cueType, content, orderIndex, isPublic: true }];
  });
  await db.insert(exerciseCues).values(cueRows).onConflictDoNothing();
  console.log(`  ✓ Cues: ${cueRows.length} rows`);

  // 6. Exercise relations
  console.log(`\nSeeding exercise relations…`);
  const relationRows = RELATIONS.flatMap(
    ([sourceSlug, targetSlug, relationType, notes]) => {
      const sourceExerciseId = exerciseMap.get(sourceSlug);
      const targetExerciseId = exerciseMap.get(targetSlug);
      if (!sourceExerciseId || !targetExerciseId) {
        console.warn(`  ⚠ Unknown slug in relation: ${sourceSlug} → ${targetSlug}`);
        return [];
      }
      return [{ sourceExerciseId, targetExerciseId, relationType, notes }];
    },
  );
  await db.insert(exerciseRelations).values(relationRows).onConflictDoNothing();
  console.log(`  ✓ Relations: ${relationRows.length} rows`);

  console.log("\n✓ Exercise library seed complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
