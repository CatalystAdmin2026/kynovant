// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed: Shared Types & Helpers
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
  type MovementPattern,
  type ExerciseClassification,
  type ResistanceType,
  type ExerciseDifficulty,
  type BodyPosition,
  type MuscleGroup,
  type MuscleRole,
  type EquipmentRequirement,
  type ExerciseRelationType,
  type ExerciseCueType,
} from "../../lib/db/schema-exercise";

export {
  type MovementPattern,
  type ExerciseClassification,
  type ResistanceType,
  type ExerciseDifficulty,
  type BodyPosition,
  type MuscleGroup,
  type MuscleRole,
  type EquipmentRequirement,
  type ExerciseRelationType,
  type ExerciseCueType,
};

const rawUrl = process.env.DATABASE_URL_DIRECT;
if (!rawUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

export const sql = postgres(rawUrl, { prepare: false });
export const db = drizzle(sql);

// ─── Exercise definition type ─────────────────────────────────
// Uses the exact Drizzle enum union types so the insert will
// typecheck correctly.

export type ExerciseDef = {
  slug: string;
  name: string;
  movementPattern: MovementPattern;
  classification: ExerciseClassification;
  resistanceType?: ResistanceType;
  difficulty: ExerciseDifficulty;
  unilateral?: boolean;
  alternating?: boolean;
  isTimeBased?: boolean;
  isDistanceBased?: boolean;
  isCardio?: boolean;
  isMobility?: boolean;
  defaultBodyPosition?: BodyPosition;
  fatigueCost: number;
  technicalComplexity: number;
  stabilityDemand: number;
  jointStressShoulder?: number;
  jointStressElbow?: number;
  jointStressWrist?: number;
  jointStressSpine?: number;
  jointStressHip?: number;
  jointStressKnee?: number;
  jointStressAnkle?: number;
  lengthenedBias?: number;
  shortenedBias?: number;
  stretchMediatedPotential?: number;
};

// ─── Shared equipment catalog ────────────────────────────────
// All seed files re-use this list. Each file adds its own
// entries via the local EQUIPMENT constant if needed.

export const SHARED_EQUIPMENT = [
  { slug: "barbell",               name: "Barbell",                          category: "free_weights" },
  { slug: "ez-curl-bar",           name: "EZ-Curl Bar",                      category: "free_weights" },
  { slug: "trap-bar",              name: "Trap Bar / Hex Bar",               category: "free_weights" },
  { slug: "safety-squat-bar",      name: "Safety Squat Bar",                 category: "free_weights" },
  { slug: "power-rack",            name: "Power Rack",                       category: "free_weights" },
  { slug: "dumbbells",             name: "Dumbbells",                        category: "free_weights" },
  { slug: "kettlebells",           name: "Kettlebells",                      category: "free_weights" },
  { slug: "adjustable-bench",      name: "Adjustable Bench",                 category: "accessories" },
  { slug: "flat-bench",            name: "Flat Bench",                       category: "accessories" },
  { slug: "preacher-curl-bench",   name: "Preacher Curl Bench",              category: "accessories" },
  { slug: "cable-station",         name: "Cable Station",                    category: "cables" },
  { slug: "lat-pulldown-machine",  name: "Lat Pulldown Machine",             category: "machines" },
  { slug: "leg-press-machine",     name: "Leg Press Machine",                category: "machines" },
  { slug: "hack-squat-machine",    name: "Hack Squat Machine",               category: "machines" },
  { slug: "seated-leg-curl-machine",name: "Seated Leg Curl Machine",         category: "machines" },
  { slug: "lying-leg-curl-machine",name: "Lying Leg Curl Machine",           category: "machines" },
  { slug: "leg-extension-machine", name: "Leg Extension Machine",            category: "machines" },
  { slug: "hip-thrust-machine",    name: "Hip Thrust Machine",               category: "machines" },
  { slug: "reverse-hyper-machine", name: "Reverse Hyperextension Machine",   category: "machines" },
  { slug: "glute-ham-developer",   name: "Glute-Ham Developer (GHD)",        category: "machines" },
  { slug: "smith-machine",         name: "Smith Machine",                    category: "machines" },
  { slug: "machine-chest-press",   name: "Machine Chest Press",              category: "machines" },
  { slug: "pec-deck-machine",      name: "Pec Deck / Chest Fly Machine",     category: "machines" },
  { slug: "machine-shoulder-press",name: "Machine Shoulder Press",           category: "machines" },
  { slug: "machine-row",           name: "Machine Row (Chest-Supported)",    category: "machines" },
  { slug: "machine-pullover",      name: "Machine Pullover",                 category: "machines" },
  { slug: "machine-lateral-raise", name: "Machine Lateral Raise",            category: "machines" },
  { slug: "machine-rear-delt-fly", name: "Machine Rear Delt Fly",            category: "machines" },
  { slug: "machine-curl",          name: "Machine Bicep Curl",               category: "machines" },
  { slug: "machine-triceps-ext",   name: "Machine Triceps Extension",        category: "machines" },
  { slug: "machine-hip-abduction", name: "Hip Abduction Machine",            category: "machines" },
  { slug: "machine-hip-adduction", name: "Hip Adduction Machine",            category: "machines" },
  { slug: "machine-back-extension",name: "Back Extension Machine",           category: "machines" },
  { slug: "machine-calf-raise",    name: "Standing Calf Raise Machine",      category: "machines" },
  { slug: "seated-calf-raise-machine", name: "Seated Calf Raise Machine",   category: "machines" },
  { slug: "dip-station",           name: "Dip Station / Parallel Bars",      category: "accessories" },
  { slug: "pull-up-bar",           name: "Pull-Up Bar",                      category: "accessories" },
  { slug: "rings",                 name: "Gymnastics Rings",                 category: "accessories" },
  { slug: "suspension-trainer",    name: "Suspension Trainer (TRX)",         category: "accessories" },
  { slug: "resistance-band",       name: "Resistance Band",                  category: "accessories" },
  { slug: "ab-wheel",              name: "Ab Wheel / Rollout Wheel",         category: "accessories" },
  { slug: "landmine-attachment",   name: "Landmine Attachment",              category: "accessories" },
  { slug: "belt-squat-machine",    name: "Belt Squat Machine",               category: "machines" },
  { slug: "stair-climber",         name: "Stair Climber / StepMill",         category: "cardio_equipment" },
  { slug: "rowing-machine",        name: "Rowing Machine / Ergometer",       category: "cardio_equipment" },
  { slug: "assault-bike",          name: "Assault Bike / Air Bike",          category: "cardio_equipment" },
  { slug: "ski-erg",               name: "Ski Erg",                          category: "cardio_equipment" },
  { slug: "stationary-bike",       name: "Stationary Bike",                  category: "cardio_equipment" },
  { slug: "treadmill",             name: "Treadmill",                        category: "cardio_equipment" },
  { slug: "sled",                  name: "Prowler Sled",                     category: "cardio_equipment" },
  { slug: "jump-rope",             name: "Jump Rope",                        category: "accessories" },
  { slug: "medicine-ball",         name: "Medicine Ball",                    category: "free_weights" },
  { slug: "battle-rope",           name: "Battle Rope",                      category: "accessories" },
] as const;

// ─── Seed helpers ─────────────────────────────────────────────

export async function seedEquipment(
  equipment: readonly { slug: string; name: string; category: string }[],
) {
  await db
    .insert(equipmentCatalog)
    .values(equipment.map((e) => ({ ...e })))
    .onConflictDoNothing();
  const rows = await db.select().from(equipmentCatalog);
  return new Map(rows.map((e) => [e.slug, e.id]));
}

export async function seedExercises(
  exerciseDefs: readonly ExerciseDef[],
  equipmentMap: Map<string, string>,
  muscles: Array<[string, MuscleGroup, MuscleRole]>,
  equipmentLinks: Array<[string, string, EquipmentRequirement]>,
  cues: Array<[string, ExerciseCueType, string, number]>,
  relations: Array<[string, string, ExerciseRelationType, string]>,
  label: string,
) {
  console.log(`\n  Inserting ${exerciseDefs.length} exercises…`);
  await db
    .insert(exercises)
    .values(exerciseDefs.map((e) => ({ ...e, status: "active" as const, coachCreated: true })))
    .onConflictDoNothing();

  const allEx = await db
    .select()
    .from(exercises)
    .where(inArray(exercises.slug, exerciseDefs.map((e) => e.slug)));
  const exMap = new Map(allEx.map((e) => [e.slug, e.id]));
  console.log(`  ✓ Exercises: ${allEx.length}`);

  const muscleRows = muscles.flatMap(([slug, muscleGroup, role]) => {
    const exerciseId = exMap.get(slug);
    if (!exerciseId) { console.warn(`  ⚠ Unknown slug for muscle: ${slug}`); return []; }
    return [{ exerciseId, muscleGroup, role }];
  });
  if (muscleRows.length) {
    await db.insert(exerciseMuscles).values(muscleRows).onConflictDoNothing();
    console.log(`  ✓ Muscles: ${muscleRows.length}`);
  }

  const eqRows = equipmentLinks.flatMap(([exSlug, eqSlug, requirementType]) => {
    const exerciseId = exMap.get(exSlug);
    const equipmentCatalogId = equipmentMap.get(eqSlug);
    if (!exerciseId || !equipmentCatalogId) {
      console.warn(`  ⚠ Unknown slug in equipment link: ${exSlug} / ${eqSlug}`);
      return [];
    }
    return [{ exerciseId, equipmentCatalogId, requirementType }];
  });
  if (eqRows.length) {
    await db.insert(exerciseEquipment).values(eqRows).onConflictDoNothing();
    console.log(`  ✓ Equipment links: ${eqRows.length}`);
  }

  const cueRows = cues.flatMap(([slug, cueType, content, orderIndex]) => {
    const exerciseId = exMap.get(slug);
    if (!exerciseId) { console.warn(`  ⚠ Unknown slug for cue: ${slug}`); return []; }
    return [{ exerciseId, cueType, content, orderIndex, isPublic: true }];
  });
  if (cueRows.length) {
    await db.insert(exerciseCues).values(cueRows).onConflictDoNothing();
    console.log(`  ✓ Cues: ${cueRows.length}`);
  }

  const relRows = relations.flatMap(([sourceSlug, targetSlug, relationType, notes]) => {
    const sourceExerciseId = exMap.get(sourceSlug);
    const targetExerciseId = exMap.get(targetSlug);
    if (!sourceExerciseId || !targetExerciseId) return [];
    return [{ sourceExerciseId, targetExerciseId, relationType, notes }];
  });
  if (relRows.length) {
    await db.insert(exerciseRelations).values(relRows).onConflictDoNothing();
    console.log(`  ✓ Relations (intra-file): ${relRows.length}`);
  }

  console.log(`  ✓ ${label} seeded.\n`);
  return exMap;
}
