// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Recovery Spacing Analysis (M17)
//
// Pure function — no database calls.
// Answers: "For muscles trained multiple times per week (or
// across consecutive weeks), is there sufficient recovery time
// between sessions?"
//
// Gap is computed in calendar days:
//   absoluteDay = weekNumber × 7 + dayOfWeek
//   gap = day2.absoluteDay - day1.absoluteDay
//
// Finding codes:
//   RECOVERY_SAME_DAY      gap = 0  (error, certain)
//   RECOVERY_CONSECUTIVE   gap = 1  (warning, heuristic)
//   RECOVERY_SHORT         gap < 2 for high-volume muscle (caution)
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type {
  FrequencyAnalysis,
  MuscleGroup,
  PilFinding,
  RecoverySpacingAnalysis,
} from "../types";

const HIGH_VOLUME_DIRECT_SETS_THRESHOLD = 6;

function absoluteDay(weekNumber: number, dayOfWeek: number): number {
  return weekNumber * 7 + dayOfWeek;
}

function formatMuscle(muscle: MuscleGroup): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function analyzeRecovery(
  frequencyByWeek: FrequencyAnalysis[],
): RecoverySpacingAnalysis {
  const findings: PilFinding[] = [];

  // Build per-muscle training session list across all weeks
  const muscleSessionsMap = new Map<
    MuscleGroup,
    Array<{ weekNumber: number; dayOfWeek: number; directSets: number }>
  >();

  for (const weekFreq of frequencyByWeek) {
    for (const muscleData of weekFreq.byMuscle) {
      if (muscleData.sessionsPerWeek === 0) continue;
      if (!muscleSessionsMap.has(muscleData.muscleGroup)) {
        muscleSessionsMap.set(muscleData.muscleGroup, []);
      }
      for (const day of muscleData.trainingDays) {
        muscleSessionsMap.get(muscleData.muscleGroup)!.push({
          weekNumber: weekFreq.weekNumber,
          dayOfWeek: day,
          directSets: muscleData.directSetsPerWeek / muscleData.sessionsPerWeek,
        });
      }
    }
  }

  const byMuscle: RecoverySpacingAnalysis["byMuscle"] = [];
  const alreadyFlagged = new Set<string>(); // deduplicate findings

  for (const [muscleGroup, sessions] of muscleSessionsMap.entries()) {
    if (sessions.length < 2) continue;

    // Sort by absolute day
    const sorted = sessions
      .slice()
      .sort(
        (a, b) =>
          absoluteDay(a.weekNumber, a.dayOfWeek) -
          absoluteDay(b.weekNumber, b.dayOfWeek),
      );

    const trainingPairs: RecoverySpacingAnalysis["byMuscle"][number]["trainingPairs"] = [];
    let minGap = Infinity;

    for (let i = 0; i < sorted.length - 1; i++) {
      const s1 = sorted[i];
      const s2 = sorted[i + 1];
      const abs1 = absoluteDay(s1.weekNumber, s1.dayOfWeek);
      const abs2 = absoluteDay(s2.weekNumber, s2.dayOfWeek);
      const gap = abs2 - abs1;

      trainingPairs.push({
        day1AbsoluteDay: abs1,
        day2AbsoluteDay: abs2,
        gapDays: gap,
        week1: s1.weekNumber,
        week2: s2.weekNumber,
        dayOfWeek1: s1.dayOfWeek,
        dayOfWeek2: s2.dayOfWeek,
      });

      if (gap < minGap) minGap = gap;
    }

    byMuscle.push({
      muscleGroup,
      trainingPairs,
      minRecoveryDays: minGap === Infinity ? 0 : minGap,
    });

    // Determine worst gap across all pairs for this muscle
    const weeklyAvgDirect =
      sessions.reduce((sum, s) => sum + s.directSets, 0) / sessions.length;
    const isHighVolume = weeklyAvgDirect >= HIGH_VOLUME_DIRECT_SETS_THRESHOLD;

    const findingKey = muscleGroup;
    if (!alreadyFlagged.has(findingKey)) {
      // Check worst gap across all pairs
      let worstGap = Infinity;
      for (const pair of trainingPairs) {
        if (pair.gapDays < worstGap) worstGap = pair.gapDays;
      }

      if (worstGap === 0) {
        findings.push({
          id: randomUUID(),
          code: "RECOVERY_SAME_DAY",
          category: "recovery",
          severity: "error",
          confidence: "certain",
          title: `${formatMuscle(muscleGroup)} trained twice on the same day`,
          explanation: `Two training sessions target ${formatMuscle(muscleGroup)} on the same calendar day. This is a structural error in the program.`,
          evidence: [{ label: "Muscle", value: muscleGroup }],
          affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
        });
        alreadyFlagged.add(findingKey);
      } else if (worstGap === 1) {
        findings.push({
          id: randomUUID(),
          code: "RECOVERY_CONSECUTIVE",
          category: "recovery",
          severity: "warning",
          confidence: "heuristic",
          title: `${formatMuscle(muscleGroup)} trained on consecutive days`,
          explanation: `${formatMuscle(muscleGroup)} is trained on back-to-back days within the program. General guidelines suggest at least 48 hours between sessions targeting the same primary muscle group.`,
          evidence: [
            { label: "Muscle", value: muscleGroup },
            { label: "Shortest gap", value: `${worstGap} day` },
          ],
          affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
        });
        alreadyFlagged.add(findingKey);
      } else if (worstGap < 2 && isHighVolume) {
        findings.push({
          id: randomUUID(),
          code: "RECOVERY_SHORT",
          category: "recovery",
          severity: "caution",
          confidence: "heuristic",
          title: `Short ${formatMuscle(muscleGroup)} recovery (${worstGap} day)`,
          explanation: `${formatMuscle(muscleGroup)} receives high direct volume and is retrained with less than 2 days of recovery. Consider spacing these sessions further apart.`,
          evidence: [
            { label: "Muscle", value: muscleGroup },
            { label: "Shortest gap", value: `${worstGap} day` },
            { label: "Direct sets threshold", value: HIGH_VOLUME_DIRECT_SETS_THRESHOLD },
          ],
          affectedEntities: [{ type: "muscle", id: muscleGroup, name: formatMuscle(muscleGroup) }],
        });
        alreadyFlagged.add(findingKey);
      }
    }
  }

  return { byMuscle, findings };
}
