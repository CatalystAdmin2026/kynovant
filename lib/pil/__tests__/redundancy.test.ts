import { describe, it, expect } from "vitest";
import { analyzeRedundancy } from "../modules/redundancy";
import { makeBlueprint, makeExercise, makePrescription } from "./helpers";

describe("analyzeRedundancy — clean blueprint", () => {
  it("returns no findings for a blueprint with distinct exercises", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-1",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-1", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Barbell Row", movementPattern: "pull_horizontal", primaryMuscleGroup: "lats" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.findings).toHaveLength(0);
    expect(result.redundantGroups).toHaveLength(0);
  });
});

describe("analyzeRedundancy — REDUNDANCY_PATTERN_MUSCLE", () => {
  it("fires when 2 exercises share movementPattern AND primaryMuscleGroup", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-curl",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-curl", name: "Leg Curl", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.findings.some((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE")).toBe(true);
  });

  it("does not fire when movementPattern matches but primaryMuscleGroup differs", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-gm",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-gm", name: "Good Morning", movementPattern: "hip_hinge", primaryMuscleGroup: "spinal_erectors" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.findings.some((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE")).toBe(false);
  });

  it("does not fire when primaryMuscleGroup matches but movementPattern differs", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-press",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-press", name: "Hamstring Press", movementPattern: "squat_bilateral", primaryMuscleGroup: "hamstrings" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.findings.some((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE")).toBe(false);
  });

  it("has confidence=heuristic (intentional pairing is valid)", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-curl",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-curl", name: "Leg Curl", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    const f = result.findings.find((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE");
    expect(f?.confidence).toBe("heuristic");
  });
});

describe("analyzeRedundancy — null primaryMuscleGroup handling", () => {
  it("excludes exercises with null primaryMuscleGroup from detection", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-1",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-1", movementPattern: "hip_hinge", primaryMuscleGroup: null }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Unknown B", movementPattern: "hip_hinge", primaryMuscleGroup: null }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    // Both have null primaryMuscleGroup — excluded from detection, no finding
    expect(result.findings).toHaveLength(0);
    expect(result.unknownCount).toBe(2);
  });

  it("fires correctly when enough non-null exercises are redundant, despite some null", () => {
    const pNull = makePrescription({
      id: "pte-0",
      exerciseId: "ex-0",
      orderIndex: 0,
      exercise: makeExercise({ id: "ex-0", name: "Unknown", movementPattern: "hip_hinge", primaryMuscleGroup: null }),
    });
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-curl",
      orderIndex: 2,
      exercise: makeExercise({ id: "ex-curl", name: "Leg Curl", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [pNull, p1, p2] }));
    expect(result.findings.some((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE")).toBe(true);
    expect(result.unknownCount).toBe(1);
  });
});

describe("analyzeRedundancy — redundantGroups output", () => {
  it("populates redundantGroups with the correct exercises and totalSets", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-rdl",
      orderIndex: 0,
      sets: 3,
      exercise: makeExercise({ id: "ex-rdl", name: "RDL", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-curl",
      orderIndex: 1,
      sets: 4,
      exercise: makeExercise({ id: "ex-curl", name: "Leg Curl", movementPattern: "hip_hinge", primaryMuscleGroup: "hamstrings" }),
    });
    const result = analyzeRedundancy(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.redundantGroups).toHaveLength(1);
    expect(result.redundantGroups[0].totalSets).toBe(7);
    expect(result.redundantGroups[0].exercises).toHaveLength(2);
  });
});
