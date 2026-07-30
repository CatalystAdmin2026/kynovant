// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Fatigue Analysis (M04)
//
// Pure function — no database calls.
// Answers: "What is the systemic fatigue demand of this session,
// and which exercises contribute most?"
//
// Finding codes:
//   FATIGUE_HIGH_COST_EXERCISE  fatigueCost ≥ 8 AND sets ≥ 4 (caution, heuristic)
//   FATIGUE_ACCUMULATION        3+ exercises with fatigueCost ≥ 7 (caution, heuristic)
//   FATIGUE_DATA_THIN           Coverage < 70% (info, incomplete_data)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  FatigueAnalysis,
  PilFinding,
} from "../types";

const HIGH_COST_THRESHOLD = 8;
const HIGH_COST_SETS_THRESHOLD = 4;
const ACCUMULATION_COST_THRESHOLD = 7;
const ACCUMULATION_COUNT_THRESHOLD = 3;
const DATA_THIN_THRESHOLD = 70;

export function analyzeFatigue(blueprint: EnrichedBlueprint): FatigueAnalysis {
  const { prescriptions } = blueprint;

  let totalScore = 0;
  let scoredCount = 0;
  const contributors: FatigueAnalysis["contributors"] = [];
  const unscored: string[] = [];

  for (const p of prescriptions) {
    const exercise = p.exercise;
    if (exercise === null || exercise.fatigueCost === null) {
      unscored.push(p.exerciseId);
      continue;
    }

    scoredCount++;
    const sets = p.sets ?? 1; // treat null sets as 1 for fatigue estimation
    const contribution = sets * exercise.fatigueCost;
    totalScore += contribution;
    contributors.push({
      exerciseId: p.exerciseId,
      exerciseName: exercise.name,
      fatigueCost: exercise.fatigueCost,
      sets,
      contribution,
    });
  }

  contributors.sort((a, b) => b.contribution - a.contribution);

  const totalPrescriptions = prescriptions.length;
  const coveragePct =
    totalPrescriptions > 0
      ? Math.round((scoredCount / totalPrescriptions) * 100)
      : 0;

  // ── Findings ─────────────────────────────────────────────────────────────

  const findings: PilFinding[] = [];

  // FATIGUE_HIGH_COST_EXERCISE
  for (const p of prescriptions) {
    if (
      p.exercise?.fatigueCost !== undefined &&
      p.exercise.fatigueCost !== null &&
      p.exercise.fatigueCost >= HIGH_COST_THRESHOLD &&
      (p.sets ?? 0) >= HIGH_COST_SETS_THRESHOLD
    ) {
      findings.push({
        id: randomUUID(),
        code: "FATIGUE_HIGH_COST_EXERCISE",
        category: "fatigue",
        severity: "caution",
        confidence: "heuristic",
        title: `High fatigue — ${p.exercise.name}`,
        explanation: `"${p.exercise.name}" has a fatigue cost of ${p.exercise.fatigueCost}/10 prescribed for ${p.sets} sets. High fatigue exercises at this volume accumulate quickly.`,
        evidence: [
          { label: "Fatigue cost", value: p.exercise.fatigueCost },
          { label: "Sets", value: p.sets ?? 1 },
          { label: "Contribution", value: (p.sets ?? 1) * p.exercise.fatigueCost },
        ],
        affectedEntities: [{ type: "exercise", id: p.exerciseId, name: p.exercise.name }],
      });
    }
  }

  // FATIGUE_ACCUMULATION
  const highCostExercises = contributors.filter(
    (c) => c.fatigueCost >= ACCUMULATION_COST_THRESHOLD,
  );
  if (highCostExercises.length >= ACCUMULATION_COUNT_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "FATIGUE_ACCUMULATION",
      category: "fatigue",
      severity: "caution",
      confidence: "heuristic",
      title: "High cumulative fatigue",
      explanation: `${highCostExercises.length} exercises have a fatigue cost ≥ ${ACCUMULATION_COST_THRESHOLD}. Clustering multiple high-demand exercises in one session increases total recovery demand.`,
      evidence: [
        { label: "High-cost exercises", value: highCostExercises.length },
        { label: "Threshold", value: ACCUMULATION_COST_THRESHOLD },
        {
          label: "Exercises",
          value: highCostExercises.map((c) => c.exerciseName).join(", "),
        },
      ],
      affectedEntities: highCostExercises.map((c) => ({
        type: "exercise" as const,
        id: c.exerciseId,
        name: c.exerciseName,
      })),
    });
  }

  // FATIGUE_DATA_THIN
  if (coveragePct < DATA_THIN_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "FATIGUE_DATA_THIN",
      category: "fatigue",
      severity: "info",
      confidence: "incomplete_data",
      title: "Fatigue analysis partially incomplete",
      explanation: `Fatigue coverage is ${coveragePct}% (${unscored.length} of ${totalPrescriptions} exercises lack a fatigue cost score). Add fatigue cost data to your exercise library to improve this analysis.`,
      evidence: [
        { label: "Coverage", value: `${coveragePct}%` },
        { label: "Unscored exercises", value: unscored.length },
      ],
      affectedEntities: [],
    });
  }

  return { totalScore, coveragePct, contributors, unscored, findings };
}
