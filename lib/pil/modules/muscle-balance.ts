// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Muscle Balance Analysis (M09)
//
// Pure function — no database calls.
// Answers: "Beyond push/pull mechanics, are opposing muscle
// groups proportionally trained within this session?"
//
// Extends M05 (movement-pattern push/pull) to agonist/antagonist
// muscle pairs. Consumes M03's VolumeAnalysis — no re-derivation
// of direct-set counts.
//
// Finding codes:
//   BALANCE_AGONIST_DOMINANT  agonist:antagonist direct-set ratio > 3:1 (caution, heuristic)
//   BALANCE_ANTAGONIST_ZERO   antagonist has 0 direct sets while agonist has ≥4 (info, certain)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  MuscleBalanceAnalysis,
  MuscleBalancePair,
  MuscleGroup,
  PilFinding,
  VolumeAnalysis,
} from "../types";

const AGONIST_ANTAGONIST_PAIRS: Array<[MuscleGroup, MuscleGroup]> = [
  ["quadriceps", "hamstrings"],
  ["chest", "rear_deltoid"],
  ["biceps", "triceps"],
  ["hip_flexors", "glutes"],
  ["spinal_erectors", "rectus_abdominis"],
  ["front_deltoid", "rear_deltoid"],
];

const DOMINANCE_RATIO_THRESHOLD = 3;
const ANTAGONIST_ZERO_MIN_AGONIST_SETS = 4;

function formatMuscle(muscle: MuscleGroup): string {
  return muscle.replace(/_/g, " ");
}

export function analyzeMuscleBalance(volumeAnalysis: VolumeAnalysis): MuscleBalanceAnalysis {
  const directSetsByMuscle = new Map<MuscleGroup, number>();
  for (const entry of volumeAnalysis.byMuscle) {
    directSetsByMuscle.set(entry.muscleGroup, entry.directSets);
  }

  const pairs: MuscleBalancePair[] = [];
  const findings: PilFinding[] = [];

  for (const [agonist, antagonist] of AGONIST_ANTAGONIST_PAIRS) {
    const agonistDirectSets = directSetsByMuscle.get(agonist) ?? 0;
    const antagonistDirectSets = directSetsByMuscle.get(antagonist) ?? 0;

    if (agonistDirectSets === 0 && antagonistDirectSets === 0) {
      pairs.push({
        agonist,
        antagonist,
        agonistDirectSets,
        antagonistDirectSets,
        ratio: null,
        status: "unknown",
      });
      continue;
    }

    if (antagonistDirectSets === 0) {
      pairs.push({
        agonist,
        antagonist,
        agonistDirectSets,
        antagonistDirectSets,
        ratio: null,
        status: "imbalanced",
      });

      if (agonistDirectSets >= ANTAGONIST_ZERO_MIN_AGONIST_SETS) {
        findings.push({
          id: randomUUID(),
          code: "BALANCE_ANTAGONIST_ZERO",
          category: "muscle_balance",
          severity: "info",
          confidence: "certain",
          title: `No direct ${formatMuscle(antagonist)} work opposite ${formatMuscle(agonist)}`,
          explanation: `${formatMuscle(agonist)} receives ${agonistDirectSets} direct sets in this session while ${formatMuscle(antagonist)} receives none. This may be intentional for a split program, but the pairing is worth a deliberate check.`,
          evidence: [
            { label: `${formatMuscle(agonist)} direct sets`, value: agonistDirectSets },
            { label: `${formatMuscle(antagonist)} direct sets`, value: 0 },
          ],
          affectedEntities: [
            { type: "muscle", id: agonist, name: formatMuscle(agonist) },
            { type: "muscle", id: antagonist, name: formatMuscle(antagonist) },
          ],
        });
      }
      continue;
    }

    const ratio = agonistDirectSets / antagonistDirectSets;
    const status: MuscleBalancePair["status"] =
      ratio > DOMINANCE_RATIO_THRESHOLD ? "imbalanced" : "balanced";
    pairs.push({ agonist, antagonist, agonistDirectSets, antagonistDirectSets, ratio, status });

    if (status === "imbalanced") {
      findings.push({
        id: randomUUID(),
        code: "BALANCE_AGONIST_DOMINANT",
        category: "muscle_balance",
        severity: "caution",
        confidence: "heuristic",
        title: `${formatMuscle(agonist)}:${formatMuscle(antagonist)} ratio is ${ratio.toFixed(1)}:1`,
        explanation: `${formatMuscle(agonist)} receives ${agonistDirectSets} direct sets versus ${antagonistDirectSets} for ${formatMuscle(antagonist)} — a ratio above ${DOMINANCE_RATIO_THRESHOLD}:1. Sustained imbalance between opposing muscle groups is a common contributor to postural and joint-stress issues over time.`,
        evidence: [
          { label: `${formatMuscle(agonist)} direct sets`, value: agonistDirectSets },
          { label: `${formatMuscle(antagonist)} direct sets`, value: antagonistDirectSets },
          { label: "Ratio", value: `${ratio.toFixed(1)}:1` },
          { label: "Threshold", value: `${DOMINANCE_RATIO_THRESHOLD}:1` },
        ],
        affectedEntities: [
          { type: "muscle", id: agonist, name: formatMuscle(agonist) },
          { type: "muscle", id: antagonist, name: formatMuscle(antagonist) },
        ],
      });
    }
  }

  return { pairs, findings };
}
