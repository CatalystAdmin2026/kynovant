import { describe, it, expect } from "vitest";
import { analyzeFrequency } from "../modules/frequency";
import type { VolumeAnalysis } from "../types";

// Minimal VolumeAnalysis factory — only byMuscle is consumed by frequency
function makeVolume(
  entries: Array<{
    muscleGroup: string;
    directSets: number;
    indirectSets?: number;
  }>,
): VolumeAnalysis {
  return {
    byMuscle: entries.map((e) => ({
      muscleGroup: e.muscleGroup as any,
      directSets: e.directSets,
      indirectSets: e.indirectSets ?? 0,
      directSetsPerExercise: [],
    })),
    byPattern: [],
    totalSets: entries.reduce((s, e) => s + e.directSets + (e.indirectSets ?? 0), 0),
    findings: [],
    prescriptionsWithUnknownMuscle: [],
  } as unknown as VolumeAnalysis;
}

const chestVolume = makeVolume([{ muscleGroup: "chest", directSets: 3 }]);
const quadsVolume = makeVolume([{ muscleGroup: "quadriceps", directSets: 4 }]);

describe("analyzeFrequency", () => {
  describe("basic session counting", () => {
    it("counts a day with directSets>0 as one session", () => {
      const result = analyzeFrequency([
        {
          weekNumber: 1,
          days: [
            { dayOfWeek: 1, volumeAnalysis: chestVolume },
            { dayOfWeek: 3, volumeAnalysis: chestVolume },
          ],
        },
      ]);
      const chestEntry = result[0].byMuscle.find((m) => m.muscleGroup === "chest");
      expect(chestEntry?.sessionsPerWeek).toBe(2);
    });

    it("counts the same blueprint on multiple days as multiple sessions", () => {
      // Same blueprint object referenced on 3 different days
      const result = analyzeFrequency([
        {
          weekNumber: 1,
          days: [
            { dayOfWeek: 1, volumeAnalysis: chestVolume },
            { dayOfWeek: 3, volumeAnalysis: chestVolume },
            { dayOfWeek: 5, volumeAnalysis: chestVolume },
          ],
        },
      ]);
      const chestEntry = result[0].byMuscle.find((m) => m.muscleGroup === "chest");
      expect(chestEntry?.sessionsPerWeek).toBe(3);
      expect(chestEntry?.trainingDays).toEqual([1, 3, 5]);
    });

    it("rest days (null volumeAnalysis) are excluded from counts", () => {
      const result = analyzeFrequency([
        {
          weekNumber: 1,
          days: [
            { dayOfWeek: 0, volumeAnalysis: null }, // rest
            { dayOfWeek: 1, volumeAnalysis: chestVolume },
            { dayOfWeek: 2, volumeAnalysis: null }, // rest
          ],
        },
      ]);
      expect(result[0].totalTrainingDays).toBe(1);
      const chestEntry = result[0].byMuscle.find((m) => m.muscleGroup === "chest");
      expect(chestEntry?.sessionsPerWeek).toBe(1);
    });

    it("returns one FrequencyAnalysis per week", () => {
      const result = analyzeFrequency([
        { weekNumber: 1, days: [{ dayOfWeek: 1, volumeAnalysis: chestVolume }] },
        { weekNumber: 2, days: [{ dayOfWeek: 1, volumeAnalysis: chestVolume }] },
        { weekNumber: 3, days: [{ dayOfWeek: 1, volumeAnalysis: chestVolume }] },
      ]);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.weekNumber)).toEqual([1, 2, 3]);
    });

    it("accumulates direct sets from multiple days per week", () => {
      const result = analyzeFrequency([
        {
          weekNumber: 1,
          days: [
            { dayOfWeek: 1, volumeAnalysis: chestVolume }, // 3 direct sets
            { dayOfWeek: 3, volumeAnalysis: chestVolume }, // 3 direct sets
          ],
        },
      ]);
      const chestEntry = result[0].byMuscle.find((m) => m.muscleGroup === "chest");
      expect(chestEntry?.directSetsPerWeek).toBe(6);
    });

    it("all-rest week has totalTrainingDays=0 and empty byMuscle", () => {
      const result = analyzeFrequency([
        {
          weekNumber: 1,
          days: [
            { dayOfWeek: 0, volumeAnalysis: null },
            { dayOfWeek: 6, volumeAnalysis: null },
          ],
        },
      ]);
      expect(result[0].totalTrainingDays).toBe(0);
      expect(result[0].byMuscle).toHaveLength(0);
    });
  });

  describe("FREQUENCY_HIGH", () => {
    it("fires when a muscle has ≥5 sessions per week", () => {
      const days = Array.from({ length: 5 }, (_, i) => ({
        dayOfWeek: i + 1,
        volumeAnalysis: chestVolume,
      }));
      const result = analyzeFrequency([{ weekNumber: 1, days }]);
      const finding = result[0].findings.find((f) => f.code === "FREQUENCY_HIGH");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("caution");
      expect(finding?.confidence).toBe("heuristic");
    });

    it("does not fire at 4 sessions per week", () => {
      const days = Array.from({ length: 4 }, (_, i) => ({
        dayOfWeek: i + 1,
        volumeAnalysis: chestVolume,
      }));
      const result = analyzeFrequency([{ weekNumber: 1, days }]);
      expect(result[0].findings.some((f) => f.code === "FREQUENCY_HIGH")).toBe(false);
    });
  });

  describe("FREQUENCY_ZERO_MAJOR", () => {
    it("fires for major muscle groups with 0 sessions when training days exist", () => {
      // Only quadriceps trained — chest, hamstrings, glutes, lats, upper_back are zero
      const result = analyzeFrequency([
        { weekNumber: 1, days: [{ dayOfWeek: 1, volumeAnalysis: quadsVolume }] },
      ]);
      const zeroCodes = result[0].findings
        .filter((f) => f.code === "FREQUENCY_ZERO_MAJOR")
        .map((f) => f.affectedEntities[0]?.id);
      expect(zeroCodes).toContain("chest");
      expect(zeroCodes).toContain("hamstrings");
      expect(zeroCodes).not.toContain("quadriceps");
    });

    it("does not fire when all training days are rest", () => {
      const result = analyzeFrequency([
        { weekNumber: 1, days: [{ dayOfWeek: 1, volumeAnalysis: null }] },
      ]);
      expect(result[0].findings.some((f) => f.code === "FREQUENCY_ZERO_MAJOR")).toBe(false);
    });

    it("severity is info", () => {
      const result = analyzeFrequency([
        { weekNumber: 1, days: [{ dayOfWeek: 1, volumeAnalysis: quadsVolume }] },
      ]);
      const zeroFindings = result[0].findings.filter((f) => f.code === "FREQUENCY_ZERO_MAJOR");
      for (const f of zeroFindings) {
        expect(f.severity).toBe("info");
        expect(f.confidence).toBe("certain");
      }
    });
  });

  describe("multi-muscle blueprint", () => {
    it("tracks each muscle independently from a single blueprint", () => {
      const multiVolume = makeVolume([
        { muscleGroup: "chest", directSets: 3 },
        { muscleGroup: "triceps", directSets: 2, indirectSets: 1 },
      ]);
      const result = analyzeFrequency([
        { weekNumber: 1, days: [{ dayOfWeek: 1, volumeAnalysis: multiVolume }] },
      ]);
      const chestEntry = result[0].byMuscle.find((m) => m.muscleGroup === "chest");
      const tricepsEntry = result[0].byMuscle.find((m) => m.muscleGroup === "triceps");
      expect(chestEntry?.directSetsPerWeek).toBe(3);
      expect(tricepsEntry?.directSetsPerWeek).toBe(2);
      expect(tricepsEntry?.indirectSetsPerWeek).toBe(1);
    });
  });
});
