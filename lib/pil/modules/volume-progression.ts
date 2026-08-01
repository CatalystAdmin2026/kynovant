// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Weekly Volume Progression & Training Status (M18)
//
// Pure function — no database calls.
// Answers two questions per muscle group, across a program:
//   1. Is weekly direct-set volume trending up, down, flat, or
//      variable week over week?
//   2. Is the average weekly volume undertrained, adequate, or
//      overreached relative to general set-volume landmark
//      guidance?
//
// Input: FrequencyAnalysis[] (M16 output — one entry per program
// week, already computed by getProgramAudit). Each week's
// byMuscle[].directSetsPerWeek is that week's OWN direct-set
// total for the muscle (despite the field name, not an average
// across weeks) — exactly the series this module needs.
//
// Finding codes:
//   PROGRESSION_SPIKE                  single-week increase >20% for a major muscle (warning, heuristic)
//   PROGRESSION_NO_INCREASE            4+ flat weeks for a major muscle (info, heuristic)
//   VOLUME_MUSCLE_UNDERTRAINED_WEEKLY  major muscle averages <4 direct sets/week while trained at all (info, heuristic)
//   VOLUME_MUSCLE_OVERREACHED_WEEKLY   any muscle averages ≥22 direct sets/week (caution, heuristic)
//
// Volume-landmark thresholds are general heuristics drawn from
// commonly cited minimum/maximum effective set-volume ranges.
// They are not calibrated per coach or per client — a starting
// reference point, not a prescription.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  FrequencyAnalysis,
  MuscleGroup,
  MuscleVolumeProgression,
  MuscleWeeklyVolumePoint,
  PilFinding,
  VolumeProgressionAnalysis,
  VolumeTrend,
} from "../types";

const MAJOR_MUSCLE_GROUPS = new Set<MuscleGroup>([
  "chest",
  "quadriceps",
  "hamstrings",
  "glutes",
  "lats",
  "upper_back",
]);

const SPIKE_INCREASE_PCT_THRESHOLD = 20;
const NO_INCREASE_MIN_WEEKS = 4;
const UNDERTRAINED_WEEKLY_SETS_THRESHOLD = 4;
const OVERREACHED_WEEKLY_SETS_THRESHOLD = 22;

function formatMuscle(muscle: MuscleGroup): string {
  return muscle.replace(/_/g, " ");
}

function classifyTrend(points: MuscleWeeklyVolumePoint[]): VolumeTrend {
  if (points.length < 3) return "insufficient_data";
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push(points[i].directSets - points[i - 1].directSets);
  }
  if (deltas.every((d) => d === 0)) return "flat";
  if (deltas.every((d) => d >= 0)) return "increasing";
  if (deltas.every((d) => d <= 0)) return "decreasing";
  return "variable";
}

interface Spike {
  pct: number;
  fromWeek: number;
  toWeek: number;
}

function findMaxIncrease(points: MuscleWeeklyVolumePoint[]): Spike | null {
  let best: Spike | null = null;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.directSets <= 0) continue; // avoid divide-by-zero / infinite "from zero" jumps
    const pct = ((curr.directSets - prev.directSets) / prev.directSets) * 100;
    if (best === null || pct > best.pct) {
      best = { pct, fromWeek: prev.weekNumber, toWeek: curr.weekNumber };
    }
  }
  return best;
}

export function analyzeVolumeProgression(
  frequencyByWeek: FrequencyAnalysis[],
): VolumeProgressionAnalysis {
  const weeks = [...frequencyByWeek].sort((a, b) => a.weekNumber - b.weekNumber);

  // muscleGroup → weekly points
  const muscleWeeks = new Map<MuscleGroup, MuscleWeeklyVolumePoint[]>();
  for (const week of weeks) {
    for (const m of week.byMuscle) {
      const list = muscleWeeks.get(m.muscleGroup) ?? [];
      list.push({ weekNumber: week.weekNumber, directSets: m.directSetsPerWeek });
      muscleWeeks.set(m.muscleGroup, list);
    }
  }

  const byMuscle: MuscleVolumeProgression[] = [];
  const findings: PilFinding[] = [];

  for (const [muscleGroup, points] of muscleWeeks.entries()) {
    const weeklyVolume = [...points].sort((a, b) => a.weekNumber - b.weekNumber);
    const trend = classifyTrend(weeklyVolume);
    const spike = findMaxIncrease(weeklyVolume);
    const averageWeeklySets =
      Math.round(
        (weeklyVolume.reduce((sum, p) => sum + p.directSets, 0) / weeklyVolume.length) * 10,
      ) / 10;

    let status: MuscleVolumeProgression["status"] = "adequate";
    if (averageWeeklySets >= OVERREACHED_WEEKLY_SETS_THRESHOLD) {
      status = "overreached";
    } else if (
      MAJOR_MUSCLE_GROUPS.has(muscleGroup) &&
      averageWeeklySets > 0 &&
      averageWeeklySets < UNDERTRAINED_WEEKLY_SETS_THRESHOLD
    ) {
      status = "undertrained";
    }

    byMuscle.push({
      muscleGroup,
      weeklyVolume,
      trend,
      maxWeeklyIncreasePct: spike ? Math.round(spike.pct) : null,
      averageWeeklySets,
      status,
    });

    const isMajor = MAJOR_MUSCLE_GROUPS.has(muscleGroup);

    // PROGRESSION_SPIKE
    if (isMajor && spike && spike.pct > SPIKE_INCREASE_PCT_THRESHOLD) {
      findings.push({
        id: randomUUID(),
        code: "PROGRESSION_SPIKE",
        category: "progression",
        severity: "warning",
        confidence: "heuristic",
        title: `${formatMuscle(muscleGroup)} volume jumped ${Math.round(spike.pct)}% in one week`,
        explanation: `Direct ${formatMuscle(muscleGroup)} volume increased ${Math.round(spike.pct)}% from week ${spike.fromWeek} to week ${spike.toWeek}. Single-week increases above ${SPIKE_INCREASE_PCT_THRESHOLD}% raise injury risk relative to a gradual ramp.`,
        evidence: [
          { label: "From week", value: spike.fromWeek },
          { label: "To week", value: spike.toWeek },
          { label: "Increase", value: `${Math.round(spike.pct)}%` },
          { label: "Threshold", value: `${SPIKE_INCREASE_PCT_THRESHOLD}%` },
        ],
        affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
      });
    }

    // PROGRESSION_NO_INCREASE
    if (
      isMajor &&
      weeklyVolume.length >= NO_INCREASE_MIN_WEEKS &&
      trend === "flat" &&
      averageWeeklySets > 0
    ) {
      findings.push({
        id: randomUUID(),
        code: "PROGRESSION_NO_INCREASE",
        category: "progression",
        severity: "info",
        confidence: "heuristic",
        title: `${formatMuscle(muscleGroup)} volume has not increased in ${weeklyVolume.length} weeks`,
        explanation: `Direct ${formatMuscle(muscleGroup)} volume has held flat at ${weeklyVolume[0].directSets} sets/week across ${weeklyVolume.length} weeks. Progressive overload typically requires periodic volume or intensity increases — this may be an intentional maintenance block or an opportunity to progress.`,
        evidence: [
          { label: "Weeks analyzed", value: weeklyVolume.length },
          { label: "Weekly sets", value: weeklyVolume[0].directSets },
        ],
        affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
      });
    }

    // VOLUME_MUSCLE_UNDERTRAINED_WEEKLY
    if (status === "undertrained") {
      findings.push({
        id: randomUUID(),
        code: "VOLUME_MUSCLE_UNDERTRAINED_WEEKLY",
        category: "volume",
        severity: "info",
        confidence: "heuristic",
        title: `${formatMuscle(muscleGroup)} averages ${averageWeeklySets} direct sets/week`,
        explanation: `${formatMuscle(muscleGroup)} receives an average of ${averageWeeklySets} direct sets per week across this program — below the roughly ${UNDERTRAINED_WEEKLY_SETS_THRESHOLD}-set general minimum commonly cited for maintaining or building this muscle group.`,
        evidence: [
          { label: "Average weekly direct sets", value: averageWeeklySets },
          { label: "General minimum", value: UNDERTRAINED_WEEKLY_SETS_THRESHOLD },
        ],
        affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
      });
    }

    // VOLUME_MUSCLE_OVERREACHED_WEEKLY
    if (status === "overreached") {
      findings.push({
        id: randomUUID(),
        code: "VOLUME_MUSCLE_OVERREACHED_WEEKLY",
        category: "volume",
        severity: "caution",
        confidence: "heuristic",
        title: `${formatMuscle(muscleGroup)} averages ${averageWeeklySets} direct sets/week`,
        explanation: `${formatMuscle(muscleGroup)} receives an average of ${averageWeeklySets} direct sets per week across this program — at or above the roughly ${OVERREACHED_WEEKLY_SETS_THRESHOLD}-set range where most lifters see diminishing returns and higher recovery cost.`,
        evidence: [
          { label: "Average weekly direct sets", value: averageWeeklySets },
          { label: "General ceiling", value: OVERREACHED_WEEKLY_SETS_THRESHOLD },
        ],
        affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
      });
    }
  }

  byMuscle.sort((a, b) => b.averageWeeklySets - a.averageWeeklySets);

  return { byMuscle, findings };
}
