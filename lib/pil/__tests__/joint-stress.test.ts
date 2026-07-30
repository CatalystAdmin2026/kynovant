import { describe, it, expect } from "vitest";
import { analyzeJointStress } from "../modules/joint-stress";
import { makeBlueprint, makeExercise, makePrescription } from "./helpers";

function pWithSpine(id: string, exerciseId: string, spineScore: number | null, sets: number, orderIndex: number = 0) {
  return makePrescription({
    id,
    exerciseId,
    orderIndex,
    sets,
    exercise: makeExercise({
      id: exerciseId,
      name: exerciseId,
      jointStressSpine: spineScore,
      // Null all other joints so they don't bleed into spine-only assertions
      jointStressShoulder: null,
      jointStressElbow: null,
      jointStressWrist: null,
      jointStressHip: null,
      jointStressKnee: null,
      jointStressAnkle: null,
    }),
  });
}

describe("analyzeJointStress — clean blueprint", () => {
  it("returns no findings for a low-stress blueprint", () => {
    const p = makePrescription({
      sets: 3,
      exercise: makeExercise({ jointStressSpine: 4, jointStressKnee: 3 }),
    });
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings).toHaveLength(0);
  });
});

describe("analyzeJointStress — per-joint score aggregation", () => {
  it("computes cumulative score as sum(sets × score) per joint", () => {
    const p1 = pWithSpine("pte-1", "ex-1", 6, 3, 0);
    const p2 = pWithSpine("pte-2", "ex-2", 4, 4, 1);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p1, p2] }));
    const spine = result.byJoint.find((j) => j.joint === "spine");
    expect(spine?.cumulativeScore).toBe(3 * 6 + 4 * 4); // 18 + 16 = 34
  });

  it("computes peakScore as the highest individual exercise score", () => {
    const p1 = pWithSpine("pte-1", "ex-1", 6, 3, 0);
    const p2 = pWithSpine("pte-2", "ex-2", 9, 2, 1);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p1, p2] }));
    const spine = result.byJoint.find((j) => j.joint === "spine");
    expect(spine?.peakScore).toBe(9);
  });

  it("computes coveragePct as share of prescriptions with a non-null score", () => {
    const p1 = pWithSpine("pte-1", "ex-1", 7, 3, 0);
    const p2 = pWithSpine("pte-2", "ex-2", null, 3, 1);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p1, p2] }));
    const spine = result.byJoint.find((j) => j.joint === "spine");
    expect(spine?.coveragePct).toBe(50);
  });
});

describe("analyzeJointStress — JOINT_STRESS_EXTREME_EXERCISE", () => {
  it("fires at score ≥ 9", () => {
    const p = pWithSpine("pte-1", "ex-1", 9, 3, 0);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_EXTREME_EXERCISE")).toBe(true);
  });

  it("does not fire at score = 8 (below threshold)", () => {
    const p = pWithSpine("pte-1", "ex-1", 8, 3, 0);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_EXTREME_EXERCISE")).toBe(false);
  });

  it("has confidence=certain", () => {
    const p = pWithSpine("pte-1", "ex-1", 9, 3, 0);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    const f = result.findings.find((f) => f.code === "JOINT_STRESS_EXTREME_EXERCISE");
    expect(f?.confidence).toBe("certain");
  });
});

describe("analyzeJointStress — JOINT_STRESS_MULTIPLE_HIGH", () => {
  it("fires at exactly 3 exercises with score ≥ 6 on the same joint", () => {
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 6, 3, 0),
      pWithSpine("pte-2", "ex-2", 7, 3, 1),
      pWithSpine("pte-3", "ex-3", 8, 3, 2),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_MULTIPLE_HIGH")).toBe(true);
  });

  it("does not fire at 2 exercises with score ≥ 6", () => {
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 6, 3, 0),
      pWithSpine("pte-2", "ex-2", 7, 3, 1),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_MULTIPLE_HIGH")).toBe(false);
  });

  it("does not fire for exercises with score = 5 (below high threshold)", () => {
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 5, 3, 0),
      pWithSpine("pte-2", "ex-2", 5, 3, 1),
      pWithSpine("pte-3", "ex-3", 5, 3, 2),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_MULTIPLE_HIGH")).toBe(false);
  });

  it("has confidence=heuristic", () => {
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 6, 3, 0),
      pWithSpine("pte-2", "ex-2", 7, 3, 1),
      pWithSpine("pte-3", "ex-3", 8, 3, 2),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    const f = result.findings.find((f) => f.code === "JOINT_STRESS_MULTIPLE_HIGH");
    expect(f?.confidence).toBe("heuristic");
  });
});

describe("analyzeJointStress — JOINT_STRESS_HIGH_CUMULATIVE", () => {
  it("fires when cumulative score exceeds 40", () => {
    // 3 sets × 7 + 3 sets × 7 = 42 > 40
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 7, 3, 0),
      pWithSpine("pte-2", "ex-2", 7, 3, 1),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_HIGH_CUMULATIVE")).toBe(true);
  });

  it("does not fire at exactly 40 (threshold is > 40)", () => {
    // 4 sets × 5 + 4 sets × 5 = 40
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 5, 4, 0),
      pWithSpine("pte-2", "ex-2", 5, 4, 1),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "JOINT_STRESS_HIGH_CUMULATIVE")).toBe(false);
  });

  it("has severity=warning (higher than extreme exercise caution)", () => {
    const prescriptions = [
      pWithSpine("pte-1", "ex-1", 7, 3, 0),
      pWithSpine("pte-2", "ex-2", 7, 3, 1),
    ];
    const result = analyzeJointStress(makeBlueprint({ prescriptions }));
    const f = result.findings.find((f) => f.code === "JOINT_STRESS_HIGH_CUMULATIVE");
    expect(f?.severity).toBe("warning");
  });
});

describe("analyzeJointStress — null score handling", () => {
  it("does not add a joint entry when all exercises have null scores for that joint", () => {
    const p = makePrescription({
      sets: 3,
      exercise: makeExercise({
        jointStressSpine: null,
        jointStressKnee: null,
        jointStressShoulder: null,
        jointStressElbow: null,
        jointStressWrist: null,
        jointStressHip: null,
        jointStressAnkle: null,
      }),
    });
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    expect(result.byJoint).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
  });

  it("includes joints that have partial coverage", () => {
    const p1 = pWithSpine("pte-1", "ex-1", 5, 3, 0);
    const p2 = pWithSpine("pte-2", "ex-2", null, 3, 1);
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.byJoint.some((j) => j.joint === "spine")).toBe(true);
  });

  it("handles a joint independently from other joints", () => {
    const p = makePrescription({
      sets: 3,
      exercise: makeExercise({
        jointStressSpine: 9,
        jointStressKnee: null,
        jointStressShoulder: null,
      }),
    });
    const result = analyzeJointStress(makeBlueprint({ prescriptions: [p] }));
    const joints = result.byJoint.map((j) => j.joint);
    expect(joints).toContain("spine");
    expect(joints).not.toContain("knee");
    expect(joints).not.toContain("shoulder");
  });
});
