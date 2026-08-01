import { describe, it, expect } from "vitest";
import { analyzeVolumeProgression } from "../modules/volume-progression";
import type { FrequencyAnalysis, MuscleGroup } from "../types";

function makeWeek(
  weekNumber: number,
  entries: Array<{ muscleGroup: MuscleGroup; directSetsPerWeek: number }>,
): FrequencyAnalysis {
  return {
    weekNumber,
    totalTrainingDays: entries.length > 0 ? 1 : 0,
    byMuscle: entries.map((e) => ({
      muscleGroup: e.muscleGroup,
      sessionsPerWeek: 1,
      trainingDays: [1],
      directSetsPerWeek: e.directSetsPerWeek,
      indirectSetsPerWeek: 0,
    })),
    byPattern: [],
    findings: [],
  };
}

describe("analyzeVolumeProgression", () => {
  describe("trend classification", () => {
    it("classifies a strictly increasing series", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 4 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 6 }]),
        makeWeek(3, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
      ]);
      expect(result.byMuscle.find((m) => m.muscleGroup === "chest")?.trend).toBe("increasing");
    });

    it("classifies a strictly decreasing series", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 12 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
        makeWeek(3, [{ muscleGroup: "chest", directSetsPerWeek: 4 }]),
      ]);
      expect(result.byMuscle.find((m) => m.muscleGroup === "chest")?.trend).toBe("decreasing");
    });

    it("classifies a flat series", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
        makeWeek(3, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
      ]);
      expect(result.byMuscle.find((m) => m.muscleGroup === "chest")?.trend).toBe("flat");
    });

    it("classifies a mixed-direction series as variable", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 4 }]),
        makeWeek(3, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
      ]);
      expect(result.byMuscle.find((m) => m.muscleGroup === "chest")?.trend).toBe("variable");
    });

    it("returns insufficient_data with fewer than 3 weeks", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 8 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
      ]);
      expect(result.byMuscle.find((m) => m.muscleGroup === "chest")?.trend).toBe(
        "insufficient_data",
      );
    });
  });

  describe("PROGRESSION_SPIKE", () => {
    it("fires for a major muscle group with >20% single-week increase", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 13 }]), // +30%
      ]);
      const finding = result.findings.find((f) => f.code === "PROGRESSION_SPIKE");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("warning");
      expect(finding?.category).toBe("progression");
    });

    it("does not fire for a non-major muscle group even with a large jump", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "biceps", directSetsPerWeek: 10 }]),
        makeWeek(2, [{ muscleGroup: "biceps", directSetsPerWeek: 16 }]), // +60%
      ]);
      expect(result.findings.some((f) => f.code === "PROGRESSION_SPIKE")).toBe(false);
    });

    it("does not fire at or below the 20% threshold", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 12 }]), // +20%
      ]);
      expect(result.findings.some((f) => f.code === "PROGRESSION_SPIKE")).toBe(false);
    });
  });

  describe("PROGRESSION_NO_INCREASE", () => {
    it("fires for a major muscle flat across 4+ weeks", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
        makeWeek(2, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
        makeWeek(3, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
        makeWeek(4, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
      ]);
      expect(result.findings.some((f) => f.code === "PROGRESSION_NO_INCREASE")).toBe(true);
    });

    it("does not fire with fewer than 4 weeks of data", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
        makeWeek(2, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
        makeWeek(3, [{ muscleGroup: "lats", directSetsPerWeek: 6 }]),
      ]);
      expect(result.findings.some((f) => f.code === "PROGRESSION_NO_INCREASE")).toBe(false);
    });
  });

  describe("weekly training-status classification", () => {
    it("classifies a major muscle averaging below 4 sets/week as undertrained", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "hamstrings", directSetsPerWeek: 2 }]),
        makeWeek(2, [{ muscleGroup: "hamstrings", directSetsPerWeek: 2 }]),
      ]);
      const muscle = result.byMuscle.find((m) => m.muscleGroup === "hamstrings")!;
      expect(muscle.status).toBe("undertrained");
      expect(result.findings.some((f) => f.code === "VOLUME_MUSCLE_UNDERTRAINED_WEEKLY")).toBe(
        true,
      );
    });

    it("does not classify a non-major muscle as undertrained even at low volume", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "biceps", directSetsPerWeek: 1 }]),
        makeWeek(2, [{ muscleGroup: "biceps", directSetsPerWeek: 1 }]),
      ]);
      const muscle = result.byMuscle.find((m) => m.muscleGroup === "biceps")!;
      expect(muscle.status).toBe("adequate");
      expect(result.findings.some((f) => f.code === "VOLUME_MUSCLE_UNDERTRAINED_WEEKLY")).toBe(
        false,
      );
    });

    it("classifies any muscle averaging ≥22 sets/week as overreached", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "biceps", directSetsPerWeek: 24 }]),
        makeWeek(2, [{ muscleGroup: "biceps", directSetsPerWeek: 22 }]),
      ]);
      const muscle = result.byMuscle.find((m) => m.muscleGroup === "biceps")!;
      expect(muscle.status).toBe("overreached");
      const finding = result.findings.find((f) => f.code === "VOLUME_MUSCLE_OVERREACHED_WEEKLY");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("caution");
    });

    it("classifies moderate volume as adequate with no findings", () => {
      const result = analyzeVolumeProgression([
        makeWeek(1, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
        makeWeek(2, [{ muscleGroup: "chest", directSetsPerWeek: 10 }]),
      ]);
      const muscle = result.byMuscle.find((m) => m.muscleGroup === "chest")!;
      expect(muscle.status).toBe("adequate");
      expect(result.findings).toHaveLength(0);
    });
  });
});
