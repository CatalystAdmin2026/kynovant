// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Service Layer
//
// SERVER-ONLY — never import from a Client Component.
// All helpers bypass RLS (Drizzle uses the direct Postgres connection).
// All helpers return null / empty arrays on error.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, eq, exists, ilike, inArray, asc, desc, sql, max } from "drizzle-orm";
import { getDb } from "./client";
import {
  exercises,
  exerciseMuscles,
  exerciseEquipment,
  exerciseRelations,
  exerciseCues,
  exerciseContraindications,
  equipmentCatalog,
  exerciseFavorites,
  exerciseCoachOverrides,
  workoutTemplateExercises,
  workoutTemplateSections,
  type Exercise,
  type ExerciseMuscle,
  type ExerciseRelation,
  type ExerciseCue,
  type ExerciseContraindication,
  type ExerciseFavorite,
  type ExerciseCoachOverride,
  type MuscleGroup,
  type MovementPattern,
  type ExerciseClassification,
  type ExerciseDifficulty,
  type ExerciseScope,
} from "./schema-exercise";
import { workoutTemplates } from "./schema";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ExerciseFilters {
  name?: string;
  muscleGroups?: MuscleGroup[];
  primaryMuscleGroup?: MuscleGroup;
  movementPattern?: MovementPattern;
  classification?: ExerciseClassification;
  difficulty?: ExerciseDifficulty;
  equipmentCatalogIds?: string[];
  unilateral?: boolean;
  isCardio?: boolean;
  isMobility?: boolean;
  maxJointStressKnee?: number;
  maxJointStressShoulder?: number;
  maxJointStressSpine?: number;
  scope?: ExerciseScope;
  favoritesOf?: string; // coachId — filter to coach's starred exercises
  statuses?: string[]; // e.g. ["active"] | ["draft"] | ["active","draft"]
  limit?: number;
}

export interface ExerciseWithMuscles extends Exercise {
  muscles: ExerciseMuscle[];
}

export interface ExerciseWithRelations extends ExerciseWithMuscles {
  relations: ExerciseRelation[];
  cues: ExerciseCue[];
  contraindications: ExerciseContraindication[];
}

export interface ExerciseListRow extends Exercise {
  isFavorited: boolean;
  // Coach override prescription takes precedence over the canonical default.
  // Null when neither the coach nor the exercise has a prescription set.
  effectivePrescription: Exercise["defaultPrescription"];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function safeQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// SEARCH
//
// Muscle group filter uses a SQL EXISTS subquery so it's handled
// in a single database round-trip. Text search uses the tsvector
// generated column when a name query is present.
// ─────────────────────────────────────────────────────────────

export async function searchExercises(
  filters: ExerciseFilters = {},
  coachId?: string,
): Promise<ExerciseListRow[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const {
      name,
      muscleGroups,
      primaryMuscleGroup,
      movementPattern,
      classification,
      difficulty,
      unilateral,
      isCardio,
      isMobility,
      maxJointStressKnee,
      maxJointStressShoulder,
      maxJointStressSpine,
      scope,
      favoritesOf,
      statuses = ["active"],
      limit = 50,
    } = filters;

    const conditions = [];

    type ExerciseStatus = "draft" | "active" | "archived";
    if (statuses.length === 1) {
      conditions.push(eq(exercises.status, statuses[0] as ExerciseStatus));
    } else if (statuses.length > 1) {
      conditions.push(inArray(exercises.status, statuses as ExerciseStatus[]));
    }
    if (scope) conditions.push(eq(exercises.scope, scope));
    if (movementPattern) conditions.push(eq(exercises.movementPattern, movementPattern));
    if (classification) conditions.push(eq(exercises.classification, classification));
    if (difficulty) conditions.push(eq(exercises.difficulty, difficulty));
    if (unilateral !== undefined) conditions.push(eq(exercises.unilateral, unilateral));
    if (isCardio !== undefined) conditions.push(eq(exercises.isCardio, isCardio));
    if (isMobility !== undefined) conditions.push(eq(exercises.isMobility, isMobility));
    if (primaryMuscleGroup) conditions.push(eq(exercises.primaryMuscleGroup, primaryMuscleGroup));

    // Full-text search via tsvector generated column
    if (name && name.trim()) {
      // websearch_to_tsquery is safe against malformed input
      conditions.push(sql`${exercises.searchVector} @@ websearch_to_tsquery('english', ${name})`);
    }

    // Muscle group filter — EXISTS subquery covering all roles (primary,
    // secondary, and stabilizer). Built with Drizzle's query builder
    // (exists() + inArray()) rather than a raw `sql` template: Drizzle's
    // `sql` tag does not serialize an interpolated JS array as a Postgres
    // array literal the way postgres.js's own tag does, so
    // `= ANY(${muscleGroups}::muscle_group[])` binds a malformed array
    // parameter and throws "malformed array literal" on every call. That
    // error was silently swallowed by safeQuery() below, which is why the
    // filter appeared to just return zero results instead of erroring.
    if (muscleGroups && muscleGroups.length > 0) {
      conditions.push(
        exists(
          db
            .select({ one: exerciseMuscles.id })
            .from(exerciseMuscles)
            .where(
              and(
                eq(exerciseMuscles.exerciseId, exercises.id),
                inArray(exerciseMuscles.muscleGroup, muscleGroups),
              ),
            ),
        ),
      );
    }

    // Favorites filter — EXISTS subquery
    if (favoritesOf) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM exercise_favorites ef
          WHERE ef.exercise_id = ${exercises.id}
            AND ef.coach_id = ${favoritesOf}
        )`,
      );
    }

    let rows = await db
      .select()
      .from(exercises)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(exercises.name))
      .limit(limit);

    // Post-filter joint stress (nullable integer comparisons)
    if (maxJointStressKnee !== undefined) {
      rows = rows.filter((r) => r.jointStressKnee === null || r.jointStressKnee <= maxJointStressKnee);
    }
    if (maxJointStressShoulder !== undefined) {
      rows = rows.filter((r) => r.jointStressShoulder === null || r.jointStressShoulder <= maxJointStressShoulder);
    }
    if (maxJointStressSpine !== undefined) {
      rows = rows.filter((r) => r.jointStressSpine === null || r.jointStressSpine <= maxJointStressSpine);
    }

    // Batch-fetch favorites and coach override prescriptions in parallel
    let favoritedIds = new Set<string>();
    const overrideMap = new Map<string, unknown>(); // exerciseId → override defaultPrescription

    if (coachId && rows.length > 0) {
      const exerciseIds = rows.map((r) => r.id);
      const [favs, overrides] = await Promise.all([
        db
          .select({ exerciseId: exerciseFavorites.exerciseId })
          .from(exerciseFavorites)
          .where(
            and(
              inArray(exerciseFavorites.exerciseId, exerciseIds),
              eq(exerciseFavorites.coachId, coachId),
            ),
          ),
        db
          .select({
            exerciseId: exerciseCoachOverrides.exerciseId,
            defaultPrescription: exerciseCoachOverrides.defaultPrescription,
          })
          .from(exerciseCoachOverrides)
          .where(
            and(
              inArray(exerciseCoachOverrides.exerciseId, exerciseIds),
              eq(exerciseCoachOverrides.coachId, coachId),
            ),
          ),
      ]);
      favoritedIds = new Set(favs.map((f) => f.exerciseId));
      for (const o of overrides) overrideMap.set(o.exerciseId, o.defaultPrescription);
    }

    return rows.map((r) => ({
      ...r,
      isFavorited: favoritedIds.has(r.id),
      effectivePrescription: overrideMap.has(r.id) ? overrideMap.get(r.id) : r.defaultPrescription,
    }));
  });

  return result ?? [];
}

// ─────────────────────────────────────────────────────────────
// RETRIEVAL
// ─────────────────────────────────────────────────────────────

export async function getExerciseBySlug(slug: string): Promise<Exercise | null> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const rows = await db.select().from(exercises).where(eq(exercises.slug, slug)).limit(1);
    return rows[0] ?? null;
  });
  return result ?? null;
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
    return rows[0] ?? null;
  });
  return result ?? null;
}

export async function getExerciseMuscles(exerciseId: string): Promise<ExerciseMuscle[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    return db
      .select()
      .from(exerciseMuscles)
      .where(eq(exerciseMuscles.exerciseId, exerciseId))
      .orderBy(asc(exerciseMuscles.role));
  });
  return result ?? [];
}

export async function getExerciseCues(
  exerciseId: string,
  publicOnly = true,
): Promise<ExerciseCue[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const conditions = [eq(exerciseCues.exerciseId, exerciseId)];
    if (publicOnly) conditions.push(eq(exerciseCues.isPublic, true));
    return db
      .select()
      .from(exerciseCues)
      .where(and(...conditions))
      .orderBy(asc(exerciseCues.orderIndex));
  });
  return result ?? [];
}

export async function getExerciseRelations(exerciseId: string): Promise<ExerciseRelation[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    return db
      .select()
      .from(exerciseRelations)
      .where(eq(exerciseRelations.sourceExerciseId, exerciseId));
  });
  return result ?? [];
}

export async function getExerciseContraindications(exerciseId: string): Promise<ExerciseContraindication[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    return db
      .select()
      .from(exerciseContraindications)
      .where(eq(exerciseContraindications.exerciseId, exerciseId))
      .orderBy(asc(exerciseContraindications.severity));
  });
  return result ?? [];
}

export async function getExerciseWithDetails(
  exerciseId: string,
  coachId?: string,
): Promise<(ExerciseWithRelations & { isFavorited: boolean; coachOverride: ExerciseCoachOverride | null }) | null> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const exerciseRows = await db
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .limit(1);

    const exercise = exerciseRows[0];
    if (!exercise) return null;

    const [muscles, relations, cues, contraindications] = await Promise.all([
      db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, exerciseId)).orderBy(asc(exerciseMuscles.role)),
      db.select().from(exerciseRelations).where(eq(exerciseRelations.sourceExerciseId, exerciseId)),
      db.select().from(exerciseCues).where(eq(exerciseCues.exerciseId, exerciseId)).orderBy(asc(exerciseCues.orderIndex)),
      db.select().from(exerciseContraindications).where(eq(exerciseContraindications.exerciseId, exerciseId)).orderBy(asc(exerciseContraindications.severity)),
    ]);

    let isFavorited = false;
    let coachOverride: ExerciseCoachOverride | null = null;

    if (coachId) {
      const [favRows, overrideRows] = await Promise.all([
        db.select().from(exerciseFavorites).where(and(eq(exerciseFavorites.exerciseId, exerciseId), eq(exerciseFavorites.coachId, coachId))).limit(1),
        db.select().from(exerciseCoachOverrides).where(and(eq(exerciseCoachOverrides.exerciseId, exerciseId), eq(exerciseCoachOverrides.coachId, coachId))).limit(1),
      ]);
      isFavorited = favRows.length > 0;
      coachOverride = overrideRows[0] ?? null;
    }

    return { ...exercise, muscles, relations, cues, contraindications, isFavorited, coachOverride };
  });

  return result ?? null;
}

// ─────────────────────────────────────────────────────────────
// EQUIPMENT
// ─────────────────────────────────────────────────────────────

export async function findExercisesByMuscleGroup(
  muscleGroup: MuscleGroup,
  activeOnly = true,
): Promise<Exercise[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    const muscleRows = await db
      .select({ exerciseId: exerciseMuscles.exerciseId })
      .from(exerciseMuscles)
      .where(eq(exerciseMuscles.muscleGroup, muscleGroup));

    const exerciseIds = muscleRows.map((r) => r.exerciseId);
    if (exerciseIds.length === 0) return [];

    const conditions = [inArray(exercises.id, exerciseIds)];
    if (activeOnly) conditions.push(eq(exercises.status, "active"));
    return db.select().from(exercises).where(and(...conditions)).orderBy(asc(exercises.name));
  });
  return result ?? [];
}

export async function findExercisesByEquipmentSet(
  equipmentCatalogIds: string[],
  activeOnly = true,
): Promise<Exercise[]> {
  if (equipmentCatalogIds.length === 0) return [];

  const result = await safeQuery(async () => {
    const db = getDb();
    const requiredLinks = await db
      .select({ exerciseId: exerciseEquipment.exerciseId, equipmentCatalogId: exerciseEquipment.equipmentCatalogId })
      .from(exerciseEquipment)
      .where(eq(exerciseEquipment.requirementType, "required"));

    const reqByExercise = new Map<string, string[]>();
    for (const link of requiredLinks) {
      const existing = reqByExercise.get(link.exerciseId) ?? [];
      existing.push(link.equipmentCatalogId);
      reqByExercise.set(link.exerciseId, existing);
    }

    const availableSet = new Set(equipmentCatalogIds);
    const eligibleIds: string[] = [];
    for (const [exerciseId, requiredIds] of reqByExercise) {
      if (requiredIds.every((id) => availableSet.has(id))) eligibleIds.push(exerciseId);
    }

    const allExerciseIds = (await db.select({ id: exercises.id }).from(exercises)).map((r) => r.id);
    const exercisesWithRequired = new Set(reqByExercise.keys());
    for (const id of allExerciseIds) {
      if (!exercisesWithRequired.has(id)) eligibleIds.push(id);
    }

    if (eligibleIds.length === 0) return [];
    const conditions = [inArray(exercises.id, eligibleIds)];
    if (activeOnly) conditions.push(eq(exercises.status, "active"));
    return db.select().from(exercises).where(and(...conditions)).orderBy(asc(exercises.name));
  });
  return result ?? [];
}

export async function getAllEquipment() {
  const result = await safeQuery(async () => {
    const db = getDb();
    return db.select().from(equipmentCatalog).orderBy(asc(equipmentCatalog.name));
  });
  return result ?? [];
}

// ─────────────────────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────────────────────

export async function toggleExerciseFavorite(
  exerciseId: string,
  coachId: string,
): Promise<{ isFavorited: boolean }> {
  const db = getDb();
  const existing = await db
    .select()
    .from(exerciseFavorites)
    .where(and(eq(exerciseFavorites.exerciseId, exerciseId), eq(exerciseFavorites.coachId, coachId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(exerciseFavorites)
      .where(and(eq(exerciseFavorites.exerciseId, exerciseId), eq(exerciseFavorites.coachId, coachId)));
    return { isFavorited: false };
  } else {
    await db.insert(exerciseFavorites).values({ exerciseId, coachId });
    return { isFavorited: true };
  }
}

// ─────────────────────────────────────────────────────────────
// COACH OVERRIDES
// ─────────────────────────────────────────────────────────────

export async function upsertCoachOverride(
  exerciseId: string,
  coachId: string,
  patch: { defaultPrescription?: unknown; privateNotes?: string | null },
): Promise<ExerciseCoachOverride> {
  const db = getDb();
  const existing = await db
    .select()
    .from(exerciseCoachOverrides)
    .where(and(eq(exerciseCoachOverrides.exerciseId, exerciseId), eq(exerciseCoachOverrides.coachId, coachId)))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(exerciseCoachOverrides)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(exerciseCoachOverrides.exerciseId, exerciseId), eq(exerciseCoachOverrides.coachId, coachId)))
      .returning();
    return updated[0];
  } else {
    const inserted = await db
      .insert(exerciseCoachOverrides)
      .values({ exerciseId, coachId, ...patch })
      .returning();
    return inserted[0];
  }
}

// ─────────────────────────────────────────────────────────────
// RECENTLY USED (Blueprint Picker)
//
// Returns the last N distinct exercises added to any blueprint by
// this coach, ordered by most recently added.
// ─────────────────────────────────────────────────────────────

export interface RecentlyUsedExercise {
  id: string;
  name: string;
  slug: string;
  primaryMuscleGroup: MuscleGroup | null;
  classification: string;
  movementPattern: string;
  difficulty: string;
  fatigueCost: number | null;
  lastUsedAt: Date;
}

export async function getRecentlyUsedExercises(
  limit = 12,
): Promise<RecentlyUsedExercise[]> {
  const result = await safeQuery(async () => {
    const db = getDb();
    // Aggregate: for each distinct exercise, find the most recent blueprint use
    const rows = await db
      .select({
        id: exercises.id,
        name: exercises.name,
        slug: exercises.slug,
        primaryMuscleGroup: exercises.primaryMuscleGroup,
        classification: exercises.classification,
        movementPattern: exercises.movementPattern,
        difficulty: exercises.difficulty,
        fatigueCost: exercises.fatigueCost,
        lastUsedAt: max(workoutTemplateExercises.createdAt),
      })
      .from(workoutTemplateExercises)
      .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
      .where(eq(exercises.status, "active"))
      .groupBy(
        exercises.id,
        exercises.name,
        exercises.slug,
        exercises.primaryMuscleGroup,
        exercises.classification,
        exercises.movementPattern,
        exercises.difficulty,
        exercises.fatigueCost,
      )
      .orderBy(desc(max(workoutTemplateExercises.createdAt)))
      .limit(limit);

    return rows
      .filter((r) => r.lastUsedAt !== null)
      .map((r) => ({ ...r, lastUsedAt: r.lastUsedAt as Date }));
  });
  return result ?? [];
}
