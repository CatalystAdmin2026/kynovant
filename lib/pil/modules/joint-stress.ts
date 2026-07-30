// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Joint Stress Analysis (M06)
//
// Pure function — no database calls.
// Answers: "Does this session accumulate high load on specific
// joints, and are multiple high-stress exercises targeting the
// same joint?"
//
// Finding codes:
//   JOINT_STRESS_EXTREME_EXERCISE  Single exercise ≥ 9 on any joint (caution, certain)
//   JOINT_STRESS_MULTIPLE_HIGH     3+ exercises ≥ 6 on same joint (caution, heuristic)
//   JOINT_STRESS_HIGH_CUMULATIVE   Cumulative joint score > 40 (warning, heuristic)
//
// No finding fires for a joint where all prescriptions have
// null scores — the joint simply has no entry in byJoint.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  EnrichedExercise,
  JointName,
  JointStressAnalysis,
  PilFinding,
} from "../types";

const EXTREME_THRESHOLD = 9;
const MULTIPLE_HIGH_SCORE = 6;
const MULTIPLE_HIGH_COUNT = 3;
const CUMULATIVE_HIGH_THRESHOLD = 40;

type JointField = `jointStress${Capitalize<string>}`;

const JOINTS: Array<{ name: JointName; field: keyof EnrichedExercise }> = [
  { name: "shoulder", field: "jointStressShoulder" },
  { name: "elbow",    field: "jointStressElbow" },
  { name: "wrist",    field: "jointStressWrist" },
  { name: "spine",    field: "jointStressSpine" },
  { name: "hip",      field: "jointStressHip" },
  { name: "knee",     field: "jointStressKnee" },
  { name: "ankle",    field: "jointStressAnkle" },
];

export function analyzeJointStress(blueprint: EnrichedBlueprint): JointStressAnalysis {
  const { prescriptions } = blueprint;
  const total = prescriptions.length;

  const findings: PilFinding[] = [];
  const byJoint: JointStressAnalysis["byJoint"] = [];

  for (const { name: joint, field } of JOINTS) {
    let cumulativeScore = 0;
    let peakScore = 0;
    let scoredCount = 0;
    const highContributors: JointStressAnalysis["byJoint"][number]["highContributors"] = [];

    for (const p of prescriptions) {
      if (!p.exercise) continue;
      const score = p.exercise[field] as number | null;
      if (score === null) continue;

      scoredCount++;
      const sets = p.sets ?? 1;
      cumulativeScore += sets * score;
      if (score > peakScore) peakScore = score;

      if (score >= MULTIPLE_HIGH_SCORE) {
        highContributors.push({
          exerciseId: p.exerciseId,
          exerciseName: p.exercise.name,
          score,
          sets,
        });
      }
    }

    // Skip joints with zero coverage — no entry, no finding
    if (scoredCount === 0) continue;

    const coveragePct = Math.round((scoredCount / total) * 100);

    byJoint.push({ joint, cumulativeScore, peakScore, highContributors, coveragePct });

    // JOINT_STRESS_EXTREME_EXERCISE
    for (const p of prescriptions) {
      if (!p.exercise) continue;
      const score = p.exercise[field] as number | null;
      if (score !== null && score >= EXTREME_THRESHOLD) {
        findings.push({
          id: randomUUID(),
          code: "JOINT_STRESS_EXTREME_EXERCISE",
          category: "joint_stress",
          severity: "caution",
          confidence: "certain",
          title: `Extreme ${joint} stress — ${p.exercise.name}`,
          explanation: `"${p.exercise.name}" scores ${score}/10 on ${joint} stress. Exercises scoring ≥${EXTREME_THRESHOLD} carry elevated injury risk with high volume or frequency.`,
          evidence: [
            { label: "Joint", value: joint },
            { label: "Score", value: score },
            { label: "Threshold", value: EXTREME_THRESHOLD },
            { label: "Sets", value: p.sets ?? 1 },
          ],
          affectedEntities: [
            { type: "exercise", id: p.exerciseId, name: p.exercise.name },
            { type: "joint", id: joint, name: joint },
          ],
        });
      }
    }

    // JOINT_STRESS_MULTIPLE_HIGH
    if (highContributors.length >= MULTIPLE_HIGH_COUNT) {
      findings.push({
        id: randomUUID(),
        code: "JOINT_STRESS_MULTIPLE_HIGH",
        category: "joint_stress",
        severity: "caution",
        confidence: "heuristic",
        title: `Multiple high-stress exercises — ${joint}`,
        explanation: `${highContributors.length} exercises score ≥${MULTIPLE_HIGH_SCORE} on ${joint} stress in this session. Clustering multiple high-stress exercises on the same joint increases cumulative load.`,
        evidence: [
          { label: "High-stress exercises", value: highContributors.length },
          { label: "Score threshold", value: MULTIPLE_HIGH_SCORE },
          { label: "Joint", value: joint },
          {
            label: "Exercises",
            value: highContributors.map((c) => `${c.exerciseName} (${c.score})`).join(", "),
          },
        ],
        affectedEntities: [
          { type: "joint", id: joint, name: joint },
          ...highContributors.map((c) => ({ type: "exercise" as const, id: c.exerciseId, name: c.exerciseName })),
        ],
      });
    }

    // JOINT_STRESS_HIGH_CUMULATIVE
    if (cumulativeScore > CUMULATIVE_HIGH_THRESHOLD) {
      findings.push({
        id: randomUUID(),
        code: "JOINT_STRESS_HIGH_CUMULATIVE",
        category: "joint_stress",
        severity: "warning",
        confidence: "heuristic",
        title: `High cumulative ${joint} load`,
        explanation: `Cumulative ${joint} stress score is ${cumulativeScore} (sum of sets × individual scores). Sessions above ${CUMULATIVE_HIGH_THRESHOLD} may require longer inter-session recovery for that joint.`,
        evidence: [
          { label: "Cumulative score", value: cumulativeScore },
          { label: "Threshold", value: CUMULATIVE_HIGH_THRESHOLD },
          { label: "Peak exercise score", value: peakScore },
        ],
        affectedEntities: [{ type: "joint", id: joint, name: joint }],
      });
    }
  }

  return { byJoint, findings };
}
