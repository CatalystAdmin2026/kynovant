// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Program Frequency Analysis (M16)
//
// Pure function — no database calls.
// Answers: "For each muscle group, how many training sessions
// and sets per week does this program prescribe?"
//
// Input:  weeks with per-day VolumeAnalysis outputs from M03
// Output: FrequencyAnalysis[] (one entry per week)
//
// Finding codes:
//   FREQUENCY_HIGH         ≥5 sessions per week for any muscle (caution)
//   FREQUENCY_ZERO_MAJOR   Major muscle has 0 sessions in a week (info)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  FrequencyAnalysis,
  MuscleGroup,
  MovementPattern,
  PilFinding,
  VolumeAnalysis,
} from "../types";

const FREQUENCY_HIGH_THRESHOLD = 5;
const MAJOR_MUSCLE_GROUPS = new Set<MuscleGroup>([
  "chest",
  "quadriceps",
  "hamstrings",
  "glutes",
  "lats",
  "upper_back",
]);

export interface WeekInput {
  weekNumber: number;
  days: Array<{
    dayOfWeek: number;
    /** null for rest days or blueprints where M03 could not be run. */
    volumeAnalysis: VolumeAnalysis | null;
    movementPatterns?: Array<{ pattern: MovementPattern; sets: number }>;
  }>;
}

export function analyzeFrequency(weeks: WeekInput[]): FrequencyAnalysis[] {
  return weeks.map((week) => analyzeWeek(week));
}

function analyzeWeek(week: WeekInput): FrequencyAnalysis {
  const findings: PilFinding[] = [];
  const trainingDays = week.days.filter((d) => d.volumeAnalysis !== null);

  // Per-muscle aggregation
  const muscleMap = new Map<
    MuscleGroup,
    {
      sessionsPerWeek: number;
      trainingDays: number[];
      directSets: number;
      indirectSets: number;
    }
  >();

  for (const day of trainingDays) {
    if (!day.volumeAnalysis) continue;
    for (const muscle of day.volumeAnalysis.byMuscle) {
      if (!muscleMap.has(muscle.muscleGroup)) {
        muscleMap.set(muscle.muscleGroup, {
          sessionsPerWeek: 0,
          trainingDays: [],
          directSets: 0,
          indirectSets: 0,
        });
      }
      const entry = muscleMap.get(muscle.muscleGroup)!;
      if (muscle.directSets > 0) {
        entry.sessionsPerWeek++;
        entry.trainingDays.push(day.dayOfWeek);
      }
      entry.directSets += muscle.directSets;
      entry.indirectSets += muscle.indirectSets;
    }
  }

  // Per-pattern aggregation
  const patternMap = new Map<MovementPattern, number>();
  for (const day of trainingDays) {
    if (!day.movementPatterns) continue;
    for (const { pattern, sets } of day.movementPatterns) {
      if (sets > 0) {
        patternMap.set(pattern, (patternMap.get(pattern) ?? 0) + 1);
      }
    }
  }

  const byMuscle = Array.from(muscleMap.entries()).map(([muscleGroup, data]) => ({
    muscleGroup,
    sessionsPerWeek: data.sessionsPerWeek,
    trainingDays: data.trainingDays,
    directSetsPerWeek: data.directSets,
    indirectSetsPerWeek: data.indirectSets,
  }));

  const byPattern = Array.from(patternMap.entries()).map(([pattern, sessionsPerWeek]) => ({
    pattern,
    sessionsPerWeek,
  }));

  // FREQUENCY_HIGH
  for (const { muscleGroup, sessionsPerWeek } of byMuscle) {
    if (sessionsPerWeek >= FREQUENCY_HIGH_THRESHOLD) {
      findings.push({
        id: randomUUID(),
        code: "FREQUENCY_HIGH",
        category: "frequency",
        severity: "caution",
        confidence: "heuristic",
        title: `${formatMuscle(muscleGroup)} trained ${sessionsPerWeek}× this week`,
        explanation: `Training the same muscle group 5 or more times per week leaves insufficient time for adaptation and recovery between sessions.`,
        evidence: [
          { label: "Muscle", value: muscleGroup },
          { label: "Sessions per week", value: sessionsPerWeek },
          { label: "Threshold", value: FREQUENCY_HIGH_THRESHOLD },
        ],
        affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
      });
    }
  }

  // FREQUENCY_ZERO_MAJOR — only applies when the program has training days at all
  if (trainingDays.length > 0) {
    for (const major of MAJOR_MUSCLE_GROUPS) {
      const entry = muscleMap.get(major);
      if (!entry || entry.sessionsPerWeek === 0) {
        findings.push({
          id: randomUUID(),
          code: "FREQUENCY_ZERO_MAJOR",
          category: "frequency",
          severity: "info",
          confidence: "certain",
          title: `${formatMuscle(major)} not trained in week ${week.weekNumber}`,
          explanation: `A major muscle group has no direct training sessions this week. This may be intentional (e.g., a specialization block) or an oversight.`,
          evidence: [
            { label: "Muscle group", value: major },
            { label: "Week", value: week.weekNumber },
          ],
          affectedEntities: [{ type: "muscle", id: major, name: formatMuscle(major) }],
        });
      }
    }
  }

  return {
    weekNumber: week.weekNumber,
    totalTrainingDays: trainingDays.length,
    byMuscle,
    byPattern,
    findings,
  };
}

function formatMuscle(muscle: MuscleGroup): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
