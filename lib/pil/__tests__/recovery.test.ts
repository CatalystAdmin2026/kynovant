import { describe, it, expect } from "vitest";
import { analyzeRecovery } from "../modules/recovery";
import type { FrequencyAnalysis, MuscleGroup } from "../types";

// Build a minimal FrequencyAnalysis entry for a single week / muscle
function makeWeekFreq(
  weekNumber: number,
  entries: Array<{
    muscleGroup: MuscleGroup;
    trainingDays: number[];
    directSetsPerDay?: number;
  }>,
): FrequencyAnalysis {
  return {
    weekNumber,
    totalTrainingDays: entries.flatMap((e) => e.trainingDays).length,
    byMuscle: entries.map((e) => ({
      muscleGroup: e.muscleGroup,
      sessionsPerWeek: e.trainingDays.length,
      trainingDays: e.trainingDays,
      directSetsPerWeek: (e.directSetsPerDay ?? 3) * e.trainingDays.length,
      indirectSetsPerWeek: 0,
    })),
    byPattern: [],
    findings: [],
  };
}

describe("analyzeRecovery", () => {
  describe("RECOVERY_SAME_DAY (gap = 0)", () => {
    it("fires when the same muscle appears twice on the same day in the same week", () => {
      // weekNumber=1, dayOfWeek=1 appears twice → absoluteDay = 8 both times
      const freq = [
        makeWeekFreq(1, [
          { muscleGroup: "chest", trainingDays: [1, 1] },
        ]),
      ];
      const result = analyzeRecovery(freq);
      const finding = result.findings.find((f) => f.code === "RECOVERY_SAME_DAY");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("error");
      expect(finding?.confidence).toBe("certain");
    });

    it("includes the affected muscle in affectedEntities", () => {
      const freq = [
        makeWeekFreq(1, [
          { muscleGroup: "hamstrings", trainingDays: [3, 3] },
        ]),
      ];
      const result = analyzeRecovery(freq);
      const finding = result.findings.find((f) => f.code === "RECOVERY_SAME_DAY");
      expect(finding?.affectedEntities[0]?.id).toBe("hamstrings");
    });
  });

  describe("RECOVERY_CONSECUTIVE (gap = 1)", () => {
    it("fires when muscle is trained on back-to-back calendar days within a week", () => {
      // Monday (1) and Tuesday (2) → gap = 1
      const freq = [
        makeWeekFreq(1, [
          { muscleGroup: "chest", trainingDays: [1, 2] },
        ]),
      ];
      const result = analyzeRecovery(freq);
      const finding = result.findings.find((f) => f.code === "RECOVERY_CONSECUTIVE");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("warning");
      expect(finding?.confidence).toBe("heuristic");
    });

    it("does not fire when gap is exactly 2 days", () => {
      // Monday (1) and Wednesday (3) → gap = 2
      const freq = [
        makeWeekFreq(1, [
          { muscleGroup: "chest", trainingDays: [1, 3] },
        ]),
      ];
      const result = analyzeRecovery(freq);
      expect(result.findings.some((f) => f.code === "RECOVERY_CONSECUTIVE")).toBe(false);
      expect(result.findings.some((f) => f.code === "RECOVERY_SAME_DAY")).toBe(false);
    });
  });

  describe("cross-week recovery", () => {
    it("detects consecutive sessions across a week boundary", () => {
      // Week 1, Saturday (6): absoluteDay = 1*7+6 = 13
      // Week 2, Sunday (0):   absoluteDay = 2*7+0 = 14
      // gap = 14 - 13 = 1 → consecutive
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "lats", trainingDays: [6] }]),
        makeWeekFreq(2, [{ muscleGroup: "lats", trainingDays: [0] }]),
      ];
      const result = analyzeRecovery(freq);
      const finding = result.findings.find((f) => f.code === "RECOVERY_CONSECUTIVE");
      expect(finding).toBeDefined();
      expect(finding?.affectedEntities[0]?.id).toBe("lats");
    });

    it("does not fire when there is adequate gap across weeks", () => {
      // Week 1, Monday (1): absoluteDay = 1*7+1 = 8
      // Week 2, Thursday (4): absoluteDay = 2*7+4 = 18
      // gap = 10 → fine
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "chest", trainingDays: [1] }]),
        makeWeekFreq(2, [{ muscleGroup: "chest", trainingDays: [4] }]),
      ];
      const result = analyzeRecovery(freq);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("byMuscle output", () => {
    it("records trainingPairs with correct absoluteDays and gapDays", () => {
      // Week 1, Mon (1) and Wed (3): abs = 8 and 10 → gap = 2
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "quadriceps", trainingDays: [1, 3] }]),
      ];
      const result = analyzeRecovery(freq);
      const muscleEntry = result.byMuscle.find((m) => m.muscleGroup === "quadriceps");
      expect(muscleEntry?.trainingPairs).toHaveLength(1);
      expect(muscleEntry?.trainingPairs[0].gapDays).toBe(2);
      expect(muscleEntry?.minRecoveryDays).toBe(2);
    });

    it("minRecoveryDays reflects the worst (shortest) gap when multiple pairs exist", () => {
      // Mon (1), Wed (3), Thu (4): pairs are (Mon,Wed)=2 and (Wed,Thu)=1
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "glutes", trainingDays: [1, 3, 4] }]),
      ];
      const result = analyzeRecovery(freq);
      const muscleEntry = result.byMuscle.find((m) => m.muscleGroup === "glutes");
      expect(muscleEntry?.minRecoveryDays).toBe(1);
    });

    it("muscles trained only once have no byMuscle entry", () => {
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "chest", trainingDays: [1] }]),
      ];
      const result = analyzeRecovery(freq);
      expect(result.byMuscle.some((m) => m.muscleGroup === "chest")).toBe(false);
    });

    it("does not emit findings for muscles that only appear once", () => {
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "chest", trainingDays: [1] }]),
      ];
      const result = analyzeRecovery(freq);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("deduplication", () => {
    it("emits at most one finding per muscle group", () => {
      // Two same-day pairs for chest in different weeks
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "chest", trainingDays: [1, 1] }]),
        makeWeekFreq(2, [{ muscleGroup: "chest", trainingDays: [2, 2] }]),
      ];
      const result = analyzeRecovery(freq);
      const chestFindings = result.findings.filter((f) =>
        f.affectedEntities.some((e) => e.id === "chest"),
      );
      expect(chestFindings).toHaveLength(1);
    });
  });

  describe("clean program", () => {
    it("returns empty findings for well-spaced training (3 days on/1 off pattern)", () => {
      // Mon(1), Wed(3), Fri(5) → gaps = 2, 2
      const freq = [
        makeWeekFreq(1, [{ muscleGroup: "chest", trainingDays: [1, 3, 5] }]),
      ];
      const result = analyzeRecovery(freq);
      expect(result.findings).toHaveLength(0);
    });
  });
});
