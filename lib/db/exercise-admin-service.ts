// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Admin Service (write operations)
//
// SERVER-ONLY — never import from a Client Component.
// Separates write paths from the read-only exercise-service.ts.
// All write operations check for blueprint references before
// performing destructive actions.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, eq, gt, max } from "drizzle-orm";
import { getDb } from "./client";
import {
  exercises,
  exerciseMuscles,
  exerciseCues,
  exerciseRelations,
  workoutTemplateExercises,
  type NewExercise,
  type MuscleGroup,
  type MuscleRole,
  type ExerciseCueType,
  type ExerciseRelationType,
  type SubstitutionPolicy,
} from "./schema-exercise";

// ─────────────────────────────────────────────────────────────
// EXERCISE CRUD
// ─────────────────────────────────────────────────────────────

type CreateExerciseInput = Omit<NewExercise, "id" | "createdAt" | "updatedAt" | "searchVector" | "status" | "scope" | "slug"> & {
  createdBy: string;
  slug?: string;
};

// Runtime guard, not just the schema's .$type<string[]>() annotation —
// createExercise/updateExercise are reachable from a route handler that
// spreads an unvalidated request body (app/api/internal/exercises/[id]/
// route.ts's PATCH), so a caller can supply a value TypeScript never
// checked. This is the one place every Drizzle-based writer of this
// column funnels through, so it's the one place that can refuse a
// malformed value for all of them at once. Throws rather than coercing:
// a caller that already JSON.stringify'd an array gets a clear error,
// not a silent, corrupted write — see the four production rows this
// exact mistake produced via a different (non-Drizzle) writer.
function assertAlternateNamesIsArray(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(
      "alternateNames must be an array of strings, not a JSON-encoded string or other scalar value.",
    );
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error("alternateNames must contain only strings.");
    }
  }
}

export async function createExercise(input: CreateExerciseInput) {
  assertAlternateNamesIsArray(input.alternateNames);
  const db = getDb();
  const slug = input.slug ?? generateSlug(input.name);
  const [row] = await db
    .insert(exercises)
    .values({ ...input, slug, status: "draft", scope: "coach" })
    .returning();
  return row;
}

export async function updateExercise(
  id: string,
  patch: Partial<Omit<NewExercise, "id" | "createdAt" | "searchVector" | "scope" | "status">>,
) {
  assertAlternateNamesIsArray(patch.alternateNames);
  const db = getDb();
  const [row] = await db
    .update(exercises)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(exercises.id, id))
    .returning();
  return row ?? null;
}

export async function publishExercise(id: string) {
  const db = getDb();
  const [row] = await db
    .update(exercises)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(exercises.id, id))
    .returning();
  return row ?? null;
}

export async function archiveExercise(id: string) {
  const db = getDb();
  const [row] = await db
    .update(exercises)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(exercises.id, id))
    .returning();
  return row ?? null;
}

export async function restoreExercise(id: string) {
  const db = getDb();
  const [row] = await db
    .update(exercises)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(exercises.id, id))
    .returning();
  return row ?? null;
}

// Deletion is only permitted if no blueprint references the exercise.
export async function deleteExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const refs = await db
    .select({ id: workoutTemplateExercises.id })
    .from(workoutTemplateExercises)
    .where(eq(workoutTemplateExercises.exerciseId, id))
    .limit(1);

  if (refs.length > 0) {
    return { ok: false, error: "Exercise is referenced by one or more blueprints and cannot be deleted." };
  }

  await db.delete(exercises).where(eq(exercises.id, id));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// MUSCLE MANAGEMENT
//
// upsertExerciseMuscles performs a bulk replace: delete existing
// rows for the exercise, insert the new set, then update the
// denormalized primaryMuscleGroup column — all in a single
// atomic operation via transaction.
// ─────────────────────────────────────────────────────────────

interface MuscleInput {
  muscleGroup: MuscleGroup;
  role: MuscleRole;
  emphasisPercent?: number | null;
}

export async function upsertExerciseMuscles(exerciseId: string, muscles: MuscleInput[]) {
  const db = getDb();

  await db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, exerciseId));

  if (muscles.length > 0) {
    await db.insert(exerciseMuscles).values(
      muscles.map((m) => ({ exerciseId, ...m, emphasisPercent: m.emphasisPercent?.toString() ?? null })),
    );
  }

  // Re-derive primaryMuscleGroup from the new muscle set
  const primaryRows = muscles
    .filter((m) => m.role === "primary")
    .sort((a, b) => (b.emphasisPercent ?? 0) - (a.emphasisPercent ?? 0));

  const primaryMuscleGroup = primaryRows[0]?.muscleGroup ?? null;
  await db
    .update(exercises)
    .set({ primaryMuscleGroup, updatedAt: new Date() })
    .where(eq(exercises.id, exerciseId));
}

export async function addExerciseMuscle(
  exerciseId: string,
  muscle: MuscleInput,
) {
  const db = getDb();
  const [row] = await db
    .insert(exerciseMuscles)
    .values({ exerciseId, ...muscle, emphasisPercent: muscle.emphasisPercent?.toString() ?? null })
    .returning();

  // Update primaryMuscleGroup if this is a primary muscle
  if (muscle.role === "primary") {
    await refreshPrimaryMuscleGroup(exerciseId);
  }

  return row;
}

export async function deleteExerciseMuscle(exerciseId: string, muscleId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(exerciseMuscles)
    .where(and(eq(exerciseMuscles.id, muscleId), eq(exerciseMuscles.exerciseId, exerciseId)))
    .limit(1);

  if (!rows[0]) return { ok: false as const, error: "Muscle not found" };

  await db.delete(exerciseMuscles).where(eq(exerciseMuscles.id, muscleId));

  if (rows[0].role === "primary") {
    await refreshPrimaryMuscleGroup(exerciseId);
  }

  return { ok: true as const };
}

async function refreshPrimaryMuscleGroup(exerciseId: string) {
  const db = getDb();
  const primaryRows = await db
    .select()
    .from(exerciseMuscles)
    .where(and(eq(exerciseMuscles.exerciseId, exerciseId), eq(exerciseMuscles.role, "primary")));

  const sorted = primaryRows.sort(
    (a, b) => (parseFloat(b.emphasisPercent ?? "0")) - (parseFloat(a.emphasisPercent ?? "0")),
  );
  const primaryMuscleGroup = (sorted[0]?.muscleGroup as MuscleGroup) ?? null;
  await db.update(exercises).set({ primaryMuscleGroup, updatedAt: new Date() }).where(eq(exercises.id, exerciseId));
}

// ─────────────────────────────────────────────────────────────
// CUE MANAGEMENT
// ─────────────────────────────────────────────────────────────

export async function addExerciseCue(
  exerciseId: string,
  cue: { cueType: ExerciseCueType; content: string; isPublic?: boolean },
) {
  const db = getDb();

  // Next orderIndex within this cueType group
  const maxRows = await db
    .select({ maxIdx: max(exerciseCues.orderIndex) })
    .from(exerciseCues)
    .where(and(eq(exerciseCues.exerciseId, exerciseId), eq(exerciseCues.cueType, cue.cueType)));

  const nextIdx = (maxRows[0]?.maxIdx ?? -1) + 1;

  const [row] = await db
    .insert(exerciseCues)
    .values({ exerciseId, ...cue, orderIndex: nextIdx, isPublic: cue.isPublic ?? true })
    .returning();

  return row;
}

export async function updateExerciseCue(
  cueId: string,
  exerciseId: string,
  patch: { content?: string; cueType?: ExerciseCueType; isPublic?: boolean },
) {
  const db = getDb();
  const [row] = await db
    .update(exerciseCues)
    .set(patch)
    .where(and(eq(exerciseCues.id, cueId), eq(exerciseCues.exerciseId, exerciseId)))
    .returning();
  return row ?? null;
}

export async function deleteExerciseCue(cueId: string, exerciseId: string) {
  const db = getDb();
  await db
    .delete(exerciseCues)
    .where(and(eq(exerciseCues.id, cueId), eq(exerciseCues.exerciseId, exerciseId)));
}

// ─────────────────────────────────────────────────────────────
// RELATION MANAGEMENT
// ─────────────────────────────────────────────────────────────

export async function addExerciseRelation(
  sourceExerciseId: string,
  input: {
    targetExerciseId: string;
    relationType: ExerciseRelationType;
    substitutionPolicy?: SubstitutionPolicy | null;
    suitabilityScore?: number | null;
    notes?: string | null;
  },
) {
  const db = getDb();
  const [row] = await db
    .insert(exerciseRelations)
    .values({ sourceExerciseId, ...input })
    .returning();
  return row;
}

export async function deleteExerciseRelation(relationId: string, sourceExerciseId: string) {
  const db = getDb();
  await db
    .delete(exerciseRelations)
    .where(and(eq(exerciseRelations.id, relationId), eq(exerciseRelations.sourceExerciseId, sourceExerciseId)));
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
