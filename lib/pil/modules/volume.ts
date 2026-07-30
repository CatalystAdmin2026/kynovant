// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Volume Analysis (M03)
//
// Pure function — no database calls.
// Answers: "How many sets does each muscle group receive,
// directly and indirectly, in this session?"
//
// Finding codes:
//   VOLUME_HIGH_DIRECT     ≥10 direct sets for any muscle (caution, heuristic)
//   VOLUME_ZERO_DIRECT_MAJOR  A major muscle group has 0 direct sets (info, certain)
//   VOLUME_DATA_INCOMPLETE >30% of prescriptions have no muscle data (info, incomplete_data)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  EnrichedPrescription,
  MuscleGroup,
  PilFinding,
  VolumeAnalysis,
} from "../types";

const MAJOR_MUSCLE_GROUPS = new Set<MuscleGroup>([
  "chest",
  "quadriceps",
  "hamstrings",
  "glutes",
  "lats",
  "upper_back",
]);

const VOLUME_HIGH_THRESHOLD = 10;
const VOLUME_INCOMPLETE_DATA_THRESHOLD = 0.3; // >30% missing

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasMuscleData(p: EnrichedPrescription): boolean {
  return p.exercise !== null && p.exercise.muscles.length > 0;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function analyzeVolume(blueprint: EnrichedBlueprint): VolumeAnalysis {
  const { prescriptions } = blueprint;

  const unknownVolume = {
    prescriptionsWithNullSets: [] as string[],
    prescriptionsWithNoMuscleData: [] as string[],
  };

  // muscleGroup → { directSets, indirectSets, exerciseIds }
  const muscleMap = new Map<
    MuscleGroup,
    { directSets: number; indirectSets: number; exerciseIds: Set<string> }
  >();

  let totalPrescribedSets = 0;

  for (const p of prescriptions) {
    const sets = p.sets;

    if (sets === null) {
      unknownVolume.prescriptionsWithNullSets.push(p.exerciseId);
      continue;
    }

    if (!hasMuscleData(p)) {
      unknownVolume.prescriptionsWithNoMuscleData.push(p.exerciseId);
      continue;
    }

    totalPrescribedSets += sets;

    for (const muscle of p.exercise!.muscles) {
      if (!muscleMap.has(muscle.muscleGroup)) {
        muscleMap.set(muscle.muscleGroup, {
          directSets: 0,
          indirectSets: 0,
          exerciseIds: new Set(),
        });
      }
      const entry = muscleMap.get(muscle.muscleGroup)!;
      entry.exerciseIds.add(p.exerciseId);

      if (muscle.role === "primary") {
        entry.directSets += sets;
      } else {
        // secondary + stabilizer
        entry.indirectSets += sets;
      }
    }
  }

  const byMuscle = [...muscleMap.entries()].map(([muscleGroup, data]) => ({
    muscleGroup,
    directSets: data.directSets,
    indirectSets: data.indirectSets,
    totalSets: data.directSets + data.indirectSets,
    contributingExerciseIds: [...data.exerciseIds],
  }));

  // ── Findings ─────────────────────────────────────────────────────────────

  const findings: PilFinding[] = [];

  // VOLUME_HIGH_DIRECT
  for (const entry of byMuscle) {
    if (entry.directSets >= VOLUME_HIGH_THRESHOLD) {
      findings.push({
        id: randomUUID(),
        code: "VOLUME_HIGH_DIRECT",
        category: "volume",
        severity: "caution",
        confidence: "heuristic",
        title: `High direct volume — ${entry.muscleGroup.replace(/_/g, " ")}`,
        explanation: `${entry.directSets} direct sets for ${entry.muscleGroup.replace(/_/g, " ")} in a single session exceeds the general guideline of ${VOLUME_HIGH_THRESHOLD} sets. Coaches with intentional volume blocks may disagree.`,
        evidence: [
          { label: "Direct sets", value: entry.directSets },
          { label: "Threshold", value: VOLUME_HIGH_THRESHOLD },
        ],
        affectedEntities: [{ type: "muscle", id: entry.muscleGroup, name: entry.muscleGroup.replace(/_/g, " ") }],
      });
    }
  }

  // VOLUME_ZERO_DIRECT_MAJOR
  const musclesWithDirectSets = new Set(
    byMuscle.filter((e) => e.directSets > 0).map((e) => e.muscleGroup),
  );
  for (const major of MAJOR_MUSCLE_GROUPS) {
    if (!musclesWithDirectSets.has(major)) {
      findings.push({
        id: randomUUID(),
        code: "VOLUME_ZERO_DIRECT_MAJOR",
        category: "volume",
        severity: "info",
        confidence: "certain",
        title: `No direct sets — ${major.replace(/_/g, " ")}`,
        explanation: `This session contains no direct sets for ${major.replace(/_/g, " ")}. This may be intentional for a split program.`,
        evidence: [{ label: "Direct sets", value: 0 }],
        affectedEntities: [{ type: "muscle", id: major, name: major.replace(/_/g, " ") }],
      });
    }
  }

  // VOLUME_DATA_INCOMPLETE
  const totalPrescriptions = prescriptions.length;
  const missingMuscleData = unknownVolume.prescriptionsWithNoMuscleData.length;
  if (
    totalPrescriptions > 0 &&
    missingMuscleData / totalPrescriptions > VOLUME_INCOMPLETE_DATA_THRESHOLD
  ) {
    const pct = Math.round((missingMuscleData / totalPrescriptions) * 100);
    findings.push({
      id: randomUUID(),
      code: "VOLUME_DATA_INCOMPLETE",
      category: "volume",
      severity: "info",
      confidence: "incomplete_data",
      title: "Volume analysis partially incomplete",
      explanation: `${missingMuscleData} of ${totalPrescriptions} exercises (${pct}%) lack muscle group data. Volume totals are approximate.`,
      evidence: [
        { label: "Exercises without muscle data", value: missingMuscleData },
        { label: "Total exercises", value: totalPrescriptions },
        { label: "Coverage", value: `${100 - pct}%` },
      ],
      affectedEntities: [],
    });
  }

  return { byMuscle, totalPrescribedSets, unknownVolume, findings };
}
