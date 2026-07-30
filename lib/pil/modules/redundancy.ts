// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Exercise Redundancy Analysis (M07)
//
// Pure function — no database calls.
// Answers: "Are any exercises in this Blueprint mechanically
// duplicating each other — same movement pattern AND same
// primary muscle group?"
//
// Finding codes:
//   REDUNDANCY_PATTERN_MUSCLE  2+ exercises share movementPattern
//                              + primaryMuscleGroup (caution, heuristic)
//
// Exercises with null primaryMuscleGroup are excluded from
// detection but counted in unknownCount.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  MuscleGroup,
  MovementPattern,
  PilFinding,
  RedundancyAnalysis,
  WorkoutSectionType,
} from "../types";

export function analyzeRedundancy(blueprint: EnrichedBlueprint): RedundancyAnalysis {
  const { prescriptions } = blueprint;

  // Group by movementPattern + primaryMuscleGroup key
  const groupMap = new Map<
    string,
    {
      movementPattern: MovementPattern;
      primaryMuscleGroup: MuscleGroup;
      exercises: Array<{
        id: string;
        name: string;
        sets: number | null;
        sectionType: WorkoutSectionType | null;
      }>;
    }
  >();

  let unknownCount = 0;

  for (const p of prescriptions) {
    if (!p.exercise) continue;
    if (!p.exercise.primaryMuscleGroup) {
      unknownCount++;
      continue;
    }

    const key = `${p.exercise.movementPattern}::${p.exercise.primaryMuscleGroup}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        movementPattern: p.exercise.movementPattern,
        primaryMuscleGroup: p.exercise.primaryMuscleGroup,
        exercises: [],
      });
    }
    groupMap.get(key)!.exercises.push({
      id: p.exerciseId,
      name: p.exercise.name,
      sets: p.sets,
      sectionType: p.sectionType,
    });
  }

  // Only groups with 2+ exercises are redundant
  const redundantGroups: RedundancyAnalysis["redundantGroups"] = [];
  const findings: PilFinding[] = [];

  for (const group of groupMap.values()) {
    if (group.exercises.length < 2) continue;

    const totalSets = group.exercises.reduce((sum, e) => sum + (e.sets ?? 0), 0);
    redundantGroups.push({ ...group, totalSets });

    const exerciseList = group.exercises
      .map((e) => `${e.name}${e.sets !== null ? ` (${e.sets} sets)` : ""}`)
      .join(", ");

    findings.push({
      id: randomUUID(),
      code: "REDUNDANCY_PATTERN_MUSCLE",
      category: "redundancy",
      severity: "caution",
      confidence: "heuristic",
      title: `Possible redundancy — ${group.movementPattern.replace(/_/g, " ")} / ${group.primaryMuscleGroup.replace(/_/g, " ")}`,
      explanation: `${group.exercises.length} exercises share the ${group.movementPattern.replace(/_/g, " ")} pattern with ${group.primaryMuscleGroup.replace(/_/g, " ")} as primary muscle: ${exerciseList}. This may be intentional — confirm each serves a distinct purpose.`,
      evidence: [
        { label: "Movement pattern", value: group.movementPattern },
        { label: "Primary muscle", value: group.primaryMuscleGroup },
        { label: "Exercises", value: group.exercises.length },
        { label: "Total sets", value: totalSets },
      ],
      affectedEntities: group.exercises.map((e) => ({
        type: "exercise" as const,
        id: e.id,
        name: e.name,
      })),
    });
  }

  return { redundantGroups, unknownCount, findings };
}
