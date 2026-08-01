// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Multi-Week Fatigue Accumulation (M19)
//
// Pure function — no database calls.
// Answers: "Is systemic fatigue accumulating across the program
// without a deload, suggesting a coach should schedule one?"
//
// Input: per-week fatigue totals — the sum of each training day's
// M04 FatigueAnalysis.totalScore for that week — plus the week's
// label, used only to detect a coach-intended deload via a
// case-insensitive "deload" substring match. The program schema
// has no dedicated deload flag, so this is a simple, deterministic,
// and honestly-labeled heuristic rather than a structured signal.
//
// Finding codes:
//   FATIGUE_ACCUMULATION_RISING  3+ consecutive weeks of strictly
//     increasing weekly fatigue score with no deload-labeled week
//     in the span (warning, heuristic)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  FatigueAccumulationAnalysis,
  FatigueAnalysis,
  PilFinding,
  WeeklyFatiguePoint,
} from "../types";

const RISING_STREAK_THRESHOLD = 3;

export interface FatigueWeekInput {
  weekNumber: number;
  weekLabel: string | null;
  days: Array<{ fatigueAnalysis: FatigueAnalysis | null }>;
}

function isDeloadLabel(label: string | null): boolean {
  return label !== null && label.toLowerCase().includes("deload");
}

export function analyzeFatigueAccumulation(
  weeks: FatigueWeekInput[],
): FatigueAccumulationAnalysis {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  const weeklyFatigue: WeeklyFatiguePoint[] = sorted.map((week) => ({
    weekNumber: week.weekNumber,
    totalScore: week.days.reduce(
      (sum, day) => sum + (day.fatigueAnalysis?.totalScore ?? 0),
      0,
    ),
    isLabeledDeload: isDeloadLabel(week.weekLabel),
  }));

  const findings: PilFinding[] = [];

  // Track the current strictly-increasing, deload-free streak. Fire at most
  // once per streak — the moment it first reaches the threshold length —
  // rather than re-firing on every subsequent week of the same run.
  let streak: WeeklyFatiguePoint[] = [];
  let firedForStreak = false;

  for (const point of weeklyFatigue) {
    if (point.isLabeledDeload) {
      streak = [];
      firedForStreak = false;
      continue;
    }

    const prev = streak[streak.length - 1];
    if (!prev || point.totalScore > prev.totalScore) {
      streak.push(point);
    } else {
      streak = [point];
      firedForStreak = false;
    }

    if (!firedForStreak && streak.length >= RISING_STREAK_THRESHOLD) {
      firedForStreak = true;
      const start = streak[0];
      const end = streak[streak.length - 1];
      findings.push({
        id: randomUUID(),
        code: "FATIGUE_ACCUMULATION_RISING",
        category: "fatigue",
        severity: "warning",
        confidence: "heuristic",
        title: `Fatigue has risen for ${streak.length} consecutive weeks (weeks ${start.weekNumber}–${end.weekNumber})`,
        explanation: `Estimated weekly fatigue score increased every week from week ${start.weekNumber} (${start.totalScore}) to week ${end.weekNumber} (${end.totalScore}) with no deload-labeled week in between. Sustained week-over-week fatigue increases without a planned deload raise the risk of accumulated systemic fatigue.`,
        evidence: [
          { label: "Weeks", value: `${start.weekNumber}–${end.weekNumber}` },
          { label: "Starting fatigue score", value: start.totalScore },
          { label: "Ending fatigue score", value: end.totalScore },
        ],
        affectedEntities: streak.map((p) => ({
          type: "week" as const,
          id: String(p.weekNumber),
          name: `Week ${p.weekNumber}`,
        })),
      });
    }
  }

  return { weeklyFatigue, findings };
}
