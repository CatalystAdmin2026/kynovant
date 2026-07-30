// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Session Duration Estimation (M08)
//
// Pure function — no database calls.
// Answers: "How long will this session take to complete?"
//
// Estimation order (per catalog):
//   1. All sections have estimatedMinutes → sum them (certain)
//   2. Heuristic: per prescription, (sets × setDuration) + (sets-1) × rest
//
// Heuristic set durations by classification:
//   cardio / isTimeBased: durationSeconds / 60 if set, else 5 min
//   compound, power:      0.75 min (45 s)
//   isolation:            0.5 min  (30 s)
//   mobility:             1.0 min  (60 s)
//   default:              0.75 min
//
// Finding codes:
//   DURATION_LONG       Estimated > 90 min (caution, heuristic or certain)
//   DURATION_VERY_LONG  Estimated > 120 min (warning, heuristic or certain)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { DurationEstimate, EnrichedBlueprint, PilFinding } from "../types";

const FALLBACK_REST_SECONDS = 90;
const LONG_THRESHOLD = 90;
const VERY_LONG_THRESHOLD = 120;

const SET_DURATION_MINUTES: Record<string, number> = {
  compound: 0.75,
  power: 0.75,
  isolation: 0.5,
  mobility: 1.0,
  cardio: 5.0,
  skill: 0.75,
};

export function estimateDuration(blueprint: EnrichedBlueprint): DurationEstimate {
  const { sections, prescriptions } = blueprint;

  const prescriptionsWithMissingRest: string[] = [];

  // ── Path 1: section-based (certain) ──────────────────────────────────────

  const allSectionsHaveEstimate =
    sections.length > 0 &&
    sections.every((s) => s.estimatedMinutes !== null);

  if (allSectionsHaveEstimate) {
    const total = sections.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
    const findings = buildFindings(total, "certain");
    return {
      estimatedMinutes: Math.round(total),
      confidence: "certain",
      basisNote: `Sum of coach-defined section durations (${sections.length} sections).`,
      prescriptionsWithMissingRest: [],
      findings,
    };
  }

  // ── Path 2: heuristic per prescription ───────────────────────────────────

  let totalMinutes = 0;

  for (const p of prescriptions) {
    const sets = p.sets ?? 1;
    const exercise = p.exercise;

    let setDurationMin: number;
    if (exercise?.isTimeBased || exercise?.isCardio) {
      setDurationMin =
        p.durationSeconds !== null
          ? p.durationSeconds / 60
          : (exercise?.isCardio ? 5.0 : SET_DURATION_MINUTES.compound);
    } else {
      setDurationMin = SET_DURATION_MINUTES[exercise?.classification ?? "compound"] ?? 0.75;
    }

    let restMin: number;
    if (p.restSeconds !== null) {
      restMin = p.restSeconds / 60;
    } else {
      prescriptionsWithMissingRest.push(p.exerciseId);
      restMin = FALLBACK_REST_SECONDS / 60;
    }

    // (sets × setDuration) + (sets - 1) × rest
    totalMinutes += sets * setDurationMin + Math.max(0, sets - 1) * restMin;
  }

  const estimated = Math.round(totalMinutes);
  const findings = buildFindings(estimated, "heuristic");

  const basisNote =
    prescriptionsWithMissingRest.length > 0
      ? `Heuristic estimate based on set counts and typical rest periods. ${prescriptionsWithMissingRest.length} exercise${prescriptionsWithMissingRest.length !== 1 ? "s" : ""} used a default rest of ${FALLBACK_REST_SECONDS}s.`
      : "Heuristic estimate based on set counts and prescribed rest periods.";

  return {
    estimatedMinutes: estimated,
    confidence: "heuristic",
    basisNote,
    prescriptionsWithMissingRest,
    findings,
  };
}

function buildFindings(
  estimatedMinutes: number,
  confidence: "certain" | "heuristic",
): PilFinding[] {
  const findings: PilFinding[] = [];
  const pilConfidence = confidence === "certain" ? "certain" : "heuristic";

  if (estimatedMinutes > VERY_LONG_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "DURATION_VERY_LONG",
      category: "duration",
      severity: "warning",
      confidence: pilConfidence,
      title: `Session estimated at ${estimatedMinutes} minutes`,
      explanation: `This session is estimated to take over ${VERY_LONG_THRESHOLD} minutes. Very long sessions are associated with fatigue-driven technique breakdown and reduced training quality in later exercises.`,
      evidence: [
        { label: "Estimated duration", value: `${estimatedMinutes} min` },
        { label: "Threshold", value: `${VERY_LONG_THRESHOLD} min` },
        { label: "Confidence", value: confidence },
      ],
      affectedEntities: [],
    });
  } else if (estimatedMinutes > LONG_THRESHOLD) {
    findings.push({
      id: randomUUID(),
      code: "DURATION_LONG",
      category: "duration",
      severity: "caution",
      confidence: pilConfidence,
      title: `Session estimated at ${estimatedMinutes} minutes`,
      explanation: `This session is estimated to take over ${LONG_THRESHOLD} minutes. Consider whether all exercises are necessary or whether some can be moved to a separate session.`,
      evidence: [
        { label: "Estimated duration", value: `${estimatedMinutes} min` },
        { label: "Threshold", value: `${LONG_THRESHOLD} min` },
        { label: "Confidence", value: confidence },
      ],
      affectedEntities: [],
    });
  }

  return findings;
}
