// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Movement Pattern Analysis (M05)
//
// Pure function — no database calls.
// Answers: "Is this session mechanically balanced across movement
// patterns, and are push/pull mechanics in proportion?"
//
// Finding codes:
//   MOVEMENT_PUSH_PULL_H     Horizontal push:pull ratio > 2:1 (warning, heuristic)
//   MOVEMENT_PUSH_PULL_V     Vertical push:pull ratio > 2:1 (caution, heuristic)
//   MOVEMENT_PATTERN_DOMINANT  Any single pattern > 40% of sets (info, certain)
//
// Push/pull findings only fire when both sides have at least one
// prescription. A lower-body session with zero horizontal push/pull
// produces no push:pull finding.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  EnrichedBlueprint,
  MovementAnalysis,
  MovementPattern,
  PilFinding,
} from "../types";

const PUSH_PULL_RATIO_THRESHOLD = 2;
const DOMINANT_PATTERN_THRESHOLD = 0.4; // >40%

export function analyzeMovement(blueprint: EnrichedBlueprint): MovementAnalysis {
  const { prescriptions } = blueprint;

  // pattern → { sets, exerciseIds }
  const patternMap = new Map<MovementPattern, { sets: number; exerciseIds: Set<string> }>();

  for (const p of prescriptions) {
    if (!p.exercise) continue;
    const sets = p.sets ?? 0;
    if (sets === 0) continue;

    const pattern = p.exercise.movementPattern;
    if (!patternMap.has(pattern)) {
      patternMap.set(pattern, { sets: 0, exerciseIds: new Set() });
    }
    const entry = patternMap.get(pattern)!;
    entry.sets += sets;
    entry.exerciseIds.add(p.exerciseId);
  }

  const byPattern = [...patternMap.entries()].map(([pattern, data]) => ({
    pattern,
    sets: data.sets,
    exerciseIds: [...data.exerciseIds],
  }));

  const totalSets = byPattern.reduce((sum, e) => sum + e.sets, 0);

  // Push/pull breakdown
  const hPushSets = patternMap.get("push_horizontal")?.sets ?? 0;
  const hPullSets = patternMap.get("pull_horizontal")?.sets ?? 0;
  const vPushSets = patternMap.get("push_vertical")?.sets ?? 0;
  const vPullSets = patternMap.get("pull_vertical")?.sets ?? 0;

  function ratio(push: number, pull: number): number | null {
    if (push === 0 || pull === 0) return null;
    return push / pull;
  }

  const pushPullBalance: MovementAnalysis["pushPullBalance"] = {
    horizontal: {
      pushSets: hPushSets,
      pullSets: hPullSets,
      ratio: ratio(hPushSets, hPullSets),
    },
    vertical: {
      pushSets: vPushSets,
      pullSets: vPullSets,
      ratio: ratio(vPushSets, vPullSets),
    },
  };

  // Dominant pattern
  let dominantPattern: MovementPattern | null = null;
  if (totalSets > 0) {
    for (const { pattern, sets } of byPattern) {
      if (sets / totalSets > DOMINANT_PATTERN_THRESHOLD) {
        dominantPattern = pattern;
        break;
      }
    }
  }

  // ── Findings ─────────────────────────────────────────────────────────────

  const findings: PilFinding[] = [];

  // MOVEMENT_PUSH_PULL_H
  const hRatio = pushPullBalance.horizontal.ratio;
  if (hRatio !== null && hRatio > PUSH_PULL_RATIO_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "MOVEMENT_PUSH_PULL_H",
      category: "movement",
      severity: "warning",
      confidence: "heuristic",
      title: `Horizontal push:pull ratio is ${hRatio.toFixed(1)}:1`,
      explanation: `Horizontal pushing volume (${hPushSets} sets) is ${hRatio.toFixed(1)}× horizontal pulling volume (${hPullSets} sets). Ratios above ${PUSH_PULL_RATIO_THRESHOLD}:1 are commonly associated with cumulative shoulder joint stress over training blocks.`,
      evidence: [
        { label: "Horizontal push sets", value: hPushSets },
        { label: "Horizontal pull sets", value: hPullSets },
        { label: "Ratio", value: `${hRatio.toFixed(1)}:1` },
        { label: "Threshold", value: `${PUSH_PULL_RATIO_THRESHOLD}:1` },
      ],
      affectedEntities: [],
    });
  }

  // MOVEMENT_PUSH_PULL_V
  const vRatio = pushPullBalance.vertical.ratio;
  if (vRatio !== null && vRatio > PUSH_PULL_RATIO_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "MOVEMENT_PUSH_PULL_V",
      category: "movement",
      severity: "caution",
      confidence: "heuristic",
      title: `Vertical push:pull ratio is ${vRatio.toFixed(1)}:1`,
      explanation: `Vertical pushing volume (${vPushSets} sets) is ${vRatio.toFixed(1)}× vertical pulling volume (${vPullSets} sets). Ratios above ${PUSH_PULL_RATIO_THRESHOLD}:1 may indicate shoulder imbalance over time.`,
      evidence: [
        { label: "Vertical push sets", value: vPushSets },
        { label: "Vertical pull sets", value: vPullSets },
        { label: "Ratio", value: `${vRatio.toFixed(1)}:1` },
      ],
      affectedEntities: [],
    });
  }

  // MOVEMENT_PATTERN_DOMINANT
  if (dominantPattern !== null && totalSets > 0) {
    const dominantEntry = byPattern.find((e) => e.pattern === dominantPattern)!;
    const pct = Math.round((dominantEntry.sets / totalSets) * 100);
    findings.push({
      id: randomUUID(),
      code: "MOVEMENT_PATTERN_DOMINANT",
      category: "movement",
      severity: "info",
      confidence: "certain",
      title: `${dominantPattern.replace(/_/g, " ")} dominates session`,
      explanation: `${dominantPattern.replace(/_/g, " ")} accounts for ${pct}% of session sets (${dominantEntry.sets} of ${totalSets}). This may be intentional for a specialized training block.`,
      evidence: [
        { label: "Pattern", value: dominantPattern },
        { label: "Sets", value: dominantEntry.sets },
        { label: "Session total", value: totalSets },
        { label: "Share", value: `${pct}%` },
      ],
      affectedEntities: [],
    });
  }

  return { byPattern, pushPullBalance, dominantPattern, findings };
}
