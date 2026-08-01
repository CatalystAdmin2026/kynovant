import { describe, it, expect } from "vitest";
import { analyzeMuscleBalance } from "../modules/muscle-balance";
import type { MuscleGroup, VolumeAnalysis } from "../types";

function makeVolume(
  entries: Array<{ muscleGroup: MuscleGroup; directSets: number }>,
): VolumeAnalysis {
  return {
    byMuscle: entries.map((e) => ({
      muscleGroup: e.muscleGroup,
      directSets: e.directSets,
      indirectSets: 0,
      totalSets: e.directSets,
      contributingExerciseIds: [],
    })),
    totalPrescribedSets: entries.reduce((s, e) => s + e.directSets, 0),
    unknownVolume: { prescriptionsWithNullSets: [], prescriptionsWithNoMuscleData: [] },
    findings: [],
  };
}

describe("analyzeMuscleBalance", () => {
  it("evaluates all six antagonist pairs", () => {
    const result = analyzeMuscleBalance(makeVolume([]));
    expect(result.pairs).toHaveLength(6);
  });

  it("marks a pair 'unknown' when neither muscle has direct sets", () => {
    const result = analyzeMuscleBalance(makeVolume([]));
    const pair = result.pairs.find((p) => p.agonist === "quadriceps")!;
    expect(pair.status).toBe("unknown");
    expect(pair.ratio).toBeNull();
    expect(result.findings).toHaveLength(0);
  });

  it("marks a pair 'balanced' at a 2:1 ratio (below the 3:1 threshold)", () => {
    const result = analyzeMuscleBalance(
      makeVolume([
        { muscleGroup: "quadriceps", directSets: 6 },
        { muscleGroup: "hamstrings", directSets: 3 },
      ]),
    );
    const pair = result.pairs.find((p) => p.agonist === "quadriceps")!;
    expect(pair.ratio).toBe(2);
    expect(pair.status).toBe("balanced");
    expect(result.findings.some((f) => f.code === "BALANCE_AGONIST_DOMINANT")).toBe(false);
  });

  it("does not fire at exactly a 3:1 ratio (threshold is exclusive)", () => {
    const result = analyzeMuscleBalance(
      makeVolume([
        { muscleGroup: "quadriceps", directSets: 9 },
        { muscleGroup: "hamstrings", directSets: 3 },
      ]),
    );
    expect(result.findings.some((f) => f.code === "BALANCE_AGONIST_DOMINANT")).toBe(false);
  });

  it("fires BALANCE_AGONIST_DOMINANT above a 3:1 ratio", () => {
    const result = analyzeMuscleBalance(
      makeVolume([
        { muscleGroup: "quadriceps", directSets: 12 },
        { muscleGroup: "hamstrings", directSets: 3 },
      ]),
    );
    const finding = result.findings.find((f) => f.code === "BALANCE_AGONIST_DOMINANT");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("caution");
    expect(finding?.confidence).toBe("heuristic");
    expect(finding?.category).toBe("muscle_balance");
    const pair = result.pairs.find((p) => p.agonist === "quadriceps")!;
    expect(pair.status).toBe("imbalanced");
    expect(pair.ratio).toBe(4);
  });

  it("fires BALANCE_ANTAGONIST_ZERO when agonist has ≥4 direct sets and antagonist has 0", () => {
    const result = analyzeMuscleBalance(makeVolume([{ muscleGroup: "chest", directSets: 8 }]));
    const finding = result.findings.find((f) => f.code === "BALANCE_ANTAGONIST_ZERO");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("info");
    expect(finding?.confidence).toBe("certain");
    const pair = result.pairs.find((p) => p.agonist === "chest")!;
    expect(pair.status).toBe("imbalanced");
    expect(pair.ratio).toBeNull();
  });

  it("does not fire BALANCE_ANTAGONIST_ZERO below the 4-set agonist minimum", () => {
    const result = analyzeMuscleBalance(makeVolume([{ muscleGroup: "chest", directSets: 3 }]));
    expect(result.findings.some((f) => f.code === "BALANCE_ANTAGONIST_ZERO")).toBe(false);
  });

  it("evaluates the front_deltoid/rear_deltoid and chest/rear_deltoid pairs independently", () => {
    const result = analyzeMuscleBalance(
      makeVolume([
        { muscleGroup: "front_deltoid", directSets: 10 },
        { muscleGroup: "rear_deltoid", directSets: 2 },
        { muscleGroup: "chest", directSets: 10 },
      ]),
    );
    const frontRear = result.pairs.find((p) => p.agonist === "front_deltoid")!;
    const chestRear = result.pairs.find((p) => p.agonist === "chest")!;
    expect(frontRear.status).toBe("imbalanced");
    expect(chestRear.antagonistDirectSets).toBe(2);
  });
});
