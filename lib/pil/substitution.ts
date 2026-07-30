// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Substitution Service (M30)
//
// SERVER-ONLY. Answers: "For this exercise, what are the most
// suitable alternatives based on exercise relations?"
//
// Queries exercise_relations bidirectionally — both outbound
// (source = exerciseId) and inbound (target = exerciseId).
// Deduplication: if the same exercise appears in both directions,
// outbound wins (the coach explicitly authored that direction).
//
// Ranking: suitabilityScore DESC (nulls last), then similarityScore DESC.
//
// similarityScore (0–100):
//   +50 if primaryMuscleGroup matches the source exercise
//   +50 if movementPattern matches the source exercise
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { exerciseRelations, exercises } from "@/lib/db/schema-exercise";
import type {
  ExerciseRelationType,
  MuscleGroup,
  MovementPattern,
  SubstitutionCandidate,
  SubstitutionResult,
  SubstitutionPolicy,
} from "./types";

export async function getSubstitutes(
  exerciseId: string,
  policy?: ExerciseRelationType[],
): Promise<SubstitutionResult> {
  const db = await getDb();

  // Fetch source exercise for similarity scoring
  const [sourceExercise] = await db
    .select({
      primaryMuscleGroup: exercises.primaryMuscleGroup,
      movementPattern: exercises.movementPattern,
    })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);

  if (!sourceExercise) {
    return { sourceExerciseId: exerciseId, candidates: [] };
  }

  // Fetch outbound relations (this exercise is the source)
  const outboundBase = db
    .select({
      candidateId: exerciseRelations.targetExerciseId,
      relationType: exerciseRelations.relationType,
      substitutionPolicy: exerciseRelations.substitutionPolicy,
      suitabilityScore: exerciseRelations.suitabilityScore,
    })
    .from(exerciseRelations)
    .where(eq(exerciseRelations.sourceExerciseId, exerciseId));

  // Fetch inbound relations (this exercise is the target)
  const inboundBase = db
    .select({
      candidateId: exerciseRelations.sourceExerciseId,
      relationType: exerciseRelations.relationType,
      substitutionPolicy: exerciseRelations.substitutionPolicy,
      suitabilityScore: exerciseRelations.suitabilityScore,
    })
    .from(exerciseRelations)
    .where(eq(exerciseRelations.targetExerciseId, exerciseId));

  let [outboundRows, inboundRows] = await Promise.all([outboundBase, inboundBase]);

  // Apply optional type filter in JS (simpler than conditional Drizzle where)
  if (policy && policy.length > 0) {
    const typeSet = new Set<string>(policy);
    outboundRows = outboundRows.filter((r) => typeSet.has(r.relationType));
    inboundRows = inboundRows.filter((r) => typeSet.has(r.relationType));
  }

  // Merge: outbound overwrites inbound when same candidate appears in both
  const candidateMap = new Map<
    string,
    {
      relationType: ExerciseRelationType;
      substitutionPolicy: SubstitutionPolicy | null;
      suitabilityScore: number | null;
      direction: "outbound" | "inbound";
    }
  >();

  for (const row of inboundRows) {
    if (row.candidateId === exerciseId) continue;
    candidateMap.set(row.candidateId, {
      relationType: row.relationType as ExerciseRelationType,
      substitutionPolicy: (row.substitutionPolicy as SubstitutionPolicy) ?? null,
      suitabilityScore: row.suitabilityScore,
      direction: "inbound",
    });
  }
  for (const row of outboundRows) {
    if (row.candidateId === exerciseId) continue;
    candidateMap.set(row.candidateId, {
      relationType: row.relationType as ExerciseRelationType,
      substitutionPolicy: (row.substitutionPolicy as SubstitutionPolicy) ?? null,
      suitabilityScore: row.suitabilityScore,
      direction: "outbound",
    });
  }

  if (candidateMap.size === 0) {
    return { sourceExerciseId: exerciseId, candidates: [] };
  }

  // Fetch candidate exercise details — filter to active only
  const candidateIds = Array.from(candidateMap.keys());
  const candidateExercises = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
      movementPattern: exercises.movementPattern,
    })
    .from(exercises)
    .where(and(inArray(exercises.id, candidateIds), eq(exercises.status, "active")));

  // Build result with similarity scoring
  const candidates: SubstitutionCandidate[] = [];
  for (const ex of candidateExercises) {
    const rel = candidateMap.get(ex.id)!;
    const similarityScore =
      (ex.primaryMuscleGroup === sourceExercise.primaryMuscleGroup ? 50 : 0) +
      (ex.movementPattern === sourceExercise.movementPattern ? 50 : 0);

    candidates.push({
      exerciseId: ex.id,
      exerciseName: ex.name,
      relationType: rel.relationType,
      relationDirection: rel.direction,
      suitabilityScore: rel.suitabilityScore,
      substitutionPolicy: rel.substitutionPolicy,
      primaryMuscleGroup: ex.primaryMuscleGroup as MuscleGroup | null,
      movementPattern: ex.movementPattern as MovementPattern,
      similarityScore,
    });
  }

  // Sort: suitabilityScore DESC (nulls last), then similarityScore DESC
  candidates.sort((a, b) => {
    const aScore = a.suitabilityScore ?? -1;
    const bScore = b.suitabilityScore ?? -1;
    if (bScore !== aScore) return bScore - aScore;
    return b.similarityScore - a.similarityScore;
  });

  return { sourceExerciseId: exerciseId, candidates };
}
