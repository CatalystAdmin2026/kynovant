// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Blueprint Completeness Assessment (M02)
//
// Pure function — no database calls. No PilFinding output.
// Produces a CompletenessReport surfaced separately in the audit
// UI as a data quality panel — never mixed with real findings.
// ─────────────────────────────────────────────────────────────

import type { CompletenessReport, EnrichedBlueprint } from "../types";

export function assessCompleteness(blueprint: EnrichedBlueprint): CompletenessReport {
  const { prescriptions } = blueprint;
  const total = prescriptions.length;

  // ── Prescription-level completeness ──────────────────────────────────────

  let prescriptionsWithNoSets = 0;
  let prescriptionsWithNoRest = 0;
  let prescriptionsWithNoRpe = 0;
  let prescriptionsWithNoRepRange = 0;

  for (const p of prescriptions) {
    if (p.sets === null) prescriptionsWithNoSets++;
    if (p.restSeconds === null) prescriptionsWithNoRest++;
    if (p.targetRpe === null && p.targetRir === null) prescriptionsWithNoRpe++;
    if (p.repsMin === null && p.repsMax === null && p.durationSeconds === null) prescriptionsWithNoRepRange++;
  }

  // ── Exercise library completeness (unique exercises only) ─────────────────

  const seenExerciseIds = new Set<string>();
  let exercisesWithNoFatigueCost = 0;
  let exercisesWithNoMuscleData = 0;
  let exercisesWithNoJointScores = 0;
  let exercisesWithNoBiomechanicalScoring = 0;

  for (const p of prescriptions) {
    if (!p.exercise || seenExerciseIds.has(p.exerciseId)) continue;
    seenExerciseIds.add(p.exerciseId);

    const e = p.exercise;
    if (e.fatigueCost === null) exercisesWithNoFatigueCost++;
    if (e.muscles.length === 0) exercisesWithNoMuscleData++;

    const hasJointScore =
      e.jointStressShoulder !== null ||
      e.jointStressElbow !== null ||
      e.jointStressWrist !== null ||
      e.jointStressSpine !== null ||
      e.jointStressHip !== null ||
      e.jointStressKnee !== null ||
      e.jointStressAnkle !== null;
    if (!hasJointScore) exercisesWithNoJointScores++;

    const hasBiomechanical =
      e.lengthenedBias !== null ||
      e.shortenedBias !== null ||
      e.stretchMediatedPotential !== null;
    if (!hasBiomechanical) exercisesWithNoBiomechanicalScoring++;
  }

  const uniqueExerciseCount = seenExerciseIds.size;

  // ── Coverage percentages ──────────────────────────────────────────────────

  const fatigueCoverage =
    total === 0
      ? 100
      : Math.round(
          ((total - prescriptions.filter((p) => p.exercise === null || p.exercise.fatigueCost === null).length) /
            total) *
            100,
        );

  const volumeCoverage =
    total === 0
      ? 100
      : Math.round(
          ((total -
            prescriptions.filter((p) => p.exercise === null || p.exercise.muscles.length === 0)
              .length) /
            total) *
            100,
        );

  const jointStressCoverage =
    total === 0
      ? 100
      : Math.round(
          ((total -
            prescriptions.filter((p) => {
              const e = p.exercise;
              if (!e) return true;
              return (
                e.jointStressShoulder === null &&
                e.jointStressElbow === null &&
                e.jointStressWrist === null &&
                e.jointStressSpine === null &&
                e.jointStressHip === null &&
                e.jointStressKnee === null &&
                e.jointStressAnkle === null
              );
            }).length) /
            total) *
            100,
        );

  // ── Recommendation ────────────────────────────────────────────────────────

  type Coverage = { label: string; value: number };
  const coverages: Coverage[] = [
    { label: "fatigue cost scores", value: fatigueCoverage },
    { label: "muscle group data", value: volumeCoverage },
    { label: "joint stress scores", value: jointStressCoverage },
  ];
  const lowest = coverages.reduce((min, c) => (c.value < min.value ? c : min));

  let recommendation: string;
  if (lowest.value === 100) {
    recommendation = "Exercise library scoring is complete for all prescriptions in this Blueprint.";
  } else {
    recommendation = `Adding ${lowest.label} (currently at ${lowest.value}% coverage) would most improve analysis quality for this Blueprint.`;
    if (uniqueExerciseCount > 0 && exercisesWithNoMuscleData === uniqueExerciseCount) {
      recommendation = "No exercises in this Blueprint have muscle group data. Add exercise_muscles rows to unlock Volume analysis.";
    }
  }

  return {
    prescriptionCompleteness: {
      prescriptionsWithNoSets,
      prescriptionsWithNoRest,
      prescriptionsWithNoRpe,
      prescriptionsWithNoRepRange,
    },
    exerciseLibraryCompleteness: {
      exercisesWithNoFatigueCost,
      exercisesWithNoMuscleData,
      exercisesWithNoJointScores,
      exercisesWithNoBiomechanicalScoring,
    },
    coveragePct: {
      fatigue: fatigueCoverage,
      volume: volumeCoverage,
      jointStress: jointStressCoverage,
    },
    recommendation,
  };
}
