// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Blueprint Audit Orchestrator
//
// SERVER-ONLY. getBlueprintAudit() is the single entry point for
// full Blueprint analysis. It calls getBlueprintEnriched() once —
// all analysis modules receive the same EnrichedBlueprint.
//
// Orchestration: M00 → M01 → M02 → M03 → M04 → M05 → M31
// ─────────────────────────────────────────────────────────────

import "server-only";
import { getBlueprintEnriched } from "./enrichment";
import { validatePrescriptions } from "./modules/validity";
import { assessCompleteness } from "./modules/completeness";
import { analyzeVolume } from "./modules/volume";
import { analyzeFatigue } from "./modules/fatigue";
import { analyzeMovement } from "./modules/movement";
import { analyzeJointStress } from "./modules/joint-stress";
import { analyzeRedundancy } from "./modules/redundancy";
import { estimateDuration } from "./modules/duration";
import { generateRecommendations } from "./recommendations";
import type {
  BlueprintAuditResult,
  BlueprintDimensionStatus,
  BlueprintQualitySummary,
  EnrichedBlueprint,
  PilFinding,
  PilSeverity,
} from "./types";

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<PilSeverity, number> = {
  error: 0,
  warning: 1,
  caution: 2,
  info: 3,
};

function bySeverity(a: PilFinding, b: PilFinding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

// ─── Quality Summary derivation ───────────────────────────────────────────────

function deriveDimensionStatus(
  allFindings: PilFinding[],
  validityHasErrors: boolean,
  hasJointCoverage: boolean,
): BlueprintDimensionStatus {
  const codes = new Set(allFindings.map((f) => f.code));

  const validity: BlueprintDimensionStatus["validity"] = validityHasErrors ? "has_errors" : "ok";

  let volume: BlueprintDimensionStatus["volume"] = "ok";
  if (codes.has("VOLUME_DATA_INCOMPLETE")) volume = "incomplete";
  if (codes.has("VOLUME_HIGH_DIRECT")) volume = "elevated";

  let fatigue: BlueprintDimensionStatus["fatigue"] = "moderate";
  if (codes.has("FATIGUE_DATA_THIN")) fatigue = "incomplete";
  if (codes.has("FATIGUE_ACCUMULATION") || codes.has("FATIGUE_HIGH_COST_EXERCISE")) fatigue = "high";

  let movement: BlueprintDimensionStatus["movement"] = "balanced";
  if (codes.has("MOVEMENT_PUSH_PULL_H") || codes.has("MOVEMENT_PUSH_PULL_V")) movement = "imbalanced";

  let jointStress: BlueprintDimensionStatus["jointStress"] = hasJointCoverage ? "ok" : "unknown";
  if (codes.has("JOINT_STRESS_MULTIPLE_HIGH") || codes.has("JOINT_STRESS_HIGH_CUMULATIVE")) jointStress = "elevated";
  if (codes.has("JOINT_STRESS_EXTREME_EXERCISE")) jointStress = "extreme";

  const redundancy: BlueprintDimensionStatus["redundancy"] = codes.has("REDUNDANCY_PATTERN_MUSCLE")
    ? "detected"
    : "ok";

  let duration: BlueprintDimensionStatus["duration"] = "ok";
  if (codes.has("DURATION_LONG")) duration = "long";
  if (codes.has("DURATION_VERY_LONG")) duration = "very_long";

  return { validity, volume, fatigue, movement, jointStress, redundancy, duration };
}

// ─── Pure orchestration function (exported for testing) ──────────────────────

export function orchestrateBlueprint(
  blueprint: EnrichedBlueprint,
): BlueprintAuditResult {
  const validationResult = validatePrescriptions(blueprint);
  const completenessReport = assessCompleteness(blueprint);
  const volumeAnalysis = analyzeVolume(blueprint);
  const fatigueAnalysis = analyzeFatigue(blueprint);
  const movementAnalysis = analyzeMovement(blueprint);
  const jointStressAnalysis = analyzeJointStress(blueprint);
  const redundancyAnalysis = analyzeRedundancy(blueprint);
  const durationEstimate = estimateDuration(blueprint);

  const allFindings: PilFinding[] = [
    ...validationResult.errors,
    ...validationResult.warnings,
    ...volumeAnalysis.findings,
    ...fatigueAnalysis.findings,
    ...movementAnalysis.findings,
    ...jointStressAnalysis.findings,
    ...redundancyAnalysis.findings,
    ...durationEstimate.findings,
  ].sort(bySeverity);

  const hasJointCoverage = jointStressAnalysis.byJoint.length > 0;
  const dimensionStatus = deriveDimensionStatus(allFindings, !validationResult.valid, hasJointCoverage);

  const qualitySummary: BlueprintQualitySummary = {
    templateId: blueprint.templateId,
    dimensionStatus,
    topFindings: allFindings.slice(0, 2),
  };

  return {
    templateId: blueprint.templateId,
    qualitySummary,
    validationResult,
    volumeAnalysis,
    fatigueAnalysis,
    movementAnalysis,
    jointStressAnalysis,
    redundancyAnalysis,
    durationEstimate,
    completenessReport,
    allFindings,
    recommendations: generateRecommendations(allFindings),
    analyzedAt: new Date().toISOString(),
  };
}

// ─── Database entry point ─────────────────────────────────────────────────────

export async function getBlueprintAudit(
  templateId: string,
  coachId?: string,
): Promise<BlueprintAuditResult> {
  const blueprint = await getBlueprintEnriched(templateId, coachId);
  return orchestrateBlueprint(blueprint);
}
