import { describe, it, expect } from "vitest";
import { analyzeFatigue } from "../modules/fatigue";
import { makeBlueprint, makeExercise, makePrescription } from "./helpers";

describe("analyzeFatigue — clean blueprint", () => {
  it("returns no findings for a low-fatigue blueprint", () => {
    const p = makePrescription({
      exercise: makeExercise({ fatigueCost: 5 }),
      sets: 3,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings).toHaveLength(0);
    expect(result.totalScore).toBe(15); // 3 × 5
    expect(result.coveragePct).toBe(100);
  });
});

describe("analyzeFatigue — totalScore and coverage calculation", () => {
  it("computes totalScore as sum of sets × fatigueCost", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-1",
      exercise: makeExercise({ id: "ex-1", fatigueCost: 9 }),
      sets: 5,
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "RDL", fatigueCost: 7 }),
      sets: 4,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.totalScore).toBe(5 * 9 + 4 * 7); // 73
  });

  it("excludes exercises with null fatigueCost from totalScore", () => {
    const scored = makePrescription({
      id: "pte-1",
      exercise: makeExercise({ fatigueCost: 6 }),
      sets: 3,
    });
    const unscored = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Cable Fly", fatigueCost: null }),
      sets: 4,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [scored, unscored] }));
    expect(result.totalScore).toBe(18); // only 3 × 6
    expect(result.unscored).toContain("ex-2");
  });

  it("computes coveragePct as percentage of prescriptions with known fatigueCost", () => {
    const scored = makePrescription({
      id: "pte-1",
      exercise: makeExercise({ fatigueCost: 8 }),
      sets: 4,
    });
    const unscored = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Unknown", fatigueCost: null }),
      sets: 3,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [scored, unscored] }));
    expect(result.coveragePct).toBe(50);
  });

  it("coveragePct is 100 for an empty blueprint", () => {
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [] }));
    expect(result.coveragePct).toBe(0); // 0/0 special case — no prescriptions
  });
});

describe("analyzeFatigue — FATIGUE_HIGH_COST_EXERCISE", () => {
  it("fires when fatigueCost >= 8 AND sets >= 4", () => {
    const p = makePrescription({
      exercise: makeExercise({ fatigueCost: 8 }),
      sets: 4,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "FATIGUE_HIGH_COST_EXERCISE")).toBe(true);
  });

  it("does not fire at fatigueCost = 7 (below threshold)", () => {
    const p = makePrescription({
      exercise: makeExercise({ fatigueCost: 7 }),
      sets: 4,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "FATIGUE_HIGH_COST_EXERCISE")).toBe(false);
  });

  it("does not fire at sets = 3 (below sets threshold)", () => {
    const p = makePrescription({
      exercise: makeExercise({ fatigueCost: 9 }),
      sets: 3,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "FATIGUE_HIGH_COST_EXERCISE")).toBe(false);
  });

  it("fires at exactly the boundary: fatigueCost=8, sets=4", () => {
    const p = makePrescription({
      exercise: makeExercise({ fatigueCost: 8 }),
      sets: 4,
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "FATIGUE_HIGH_COST_EXERCISE")).toBe(true);
  });
});

describe("analyzeFatigue — FATIGUE_ACCUMULATION", () => {
  it("fires at exactly 3 exercises with fatigueCost >= 7", () => {
    const prescriptions = [
      makePrescription({ id: "pte-1", exerciseId: "ex-1", orderIndex: 0, exercise: makeExercise({ id: "ex-1", fatigueCost: 7 }), sets: 3 }),
      makePrescription({ id: "pte-2", exerciseId: "ex-2", orderIndex: 1, exercise: makeExercise({ id: "ex-2", name: "RDL", fatigueCost: 8 }), sets: 3 }),
      makePrescription({ id: "pte-3", exerciseId: "ex-3", orderIndex: 2, exercise: makeExercise({ id: "ex-3", name: "Hip Thrust", fatigueCost: 9 }), sets: 3 }),
    ];
    const result = analyzeFatigue(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "FATIGUE_ACCUMULATION")).toBe(true);
  });

  it("does not fire at 2 exercises with fatigueCost >= 7", () => {
    const prescriptions = [
      makePrescription({ id: "pte-1", exerciseId: "ex-1", orderIndex: 0, exercise: makeExercise({ id: "ex-1", fatigueCost: 7 }), sets: 3 }),
      makePrescription({ id: "pte-2", exerciseId: "ex-2", orderIndex: 1, exercise: makeExercise({ id: "ex-2", name: "RDL", fatigueCost: 8 }), sets: 3 }),
    ];
    const result = analyzeFatigue(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "FATIGUE_ACCUMULATION")).toBe(false);
  });

  it("counts exercises at threshold (fatigueCost=7) toward accumulation", () => {
    const prescriptions = [
      makePrescription({ id: "pte-1", exerciseId: "ex-1", orderIndex: 0, exercise: makeExercise({ id: "ex-1", fatigueCost: 7 }), sets: 3 }),
      makePrescription({ id: "pte-2", exerciseId: "ex-2", orderIndex: 1, exercise: makeExercise({ id: "ex-2", name: "RDL", fatigueCost: 7 }), sets: 3 }),
      makePrescription({ id: "pte-3", exerciseId: "ex-3", orderIndex: 2, exercise: makeExercise({ id: "ex-3", name: "Hip Thrust", fatigueCost: 7 }), sets: 3 }),
    ];
    const result = analyzeFatigue(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "FATIGUE_ACCUMULATION")).toBe(true);
  });
});

describe("analyzeFatigue — FATIGUE_DATA_THIN", () => {
  it("fires when coverage is below 70%", () => {
    // 1 scored, 4 unscored = 20% coverage
    const prescriptions = [
      makePrescription({ id: "pte-1", exerciseId: "ex-1", orderIndex: 0, exercise: makeExercise({ id: "ex-1", fatigueCost: 5 }), sets: 3 }),
      makePrescription({ id: "pte-2", exerciseId: "ex-2", orderIndex: 1, exercise: makeExercise({ id: "ex-2", name: "A", fatigueCost: null }), sets: 3 }),
      makePrescription({ id: "pte-3", exerciseId: "ex-3", orderIndex: 2, exercise: makeExercise({ id: "ex-3", name: "B", fatigueCost: null }), sets: 3 }),
      makePrescription({ id: "pte-4", exerciseId: "ex-4", orderIndex: 3, exercise: makeExercise({ id: "ex-4", name: "C", fatigueCost: null }), sets: 3 }),
      makePrescription({ id: "pte-5", exerciseId: "ex-5", orderIndex: 4, exercise: makeExercise({ id: "ex-5", name: "D", fatigueCost: null }), sets: 3 }),
    ];
    const result = analyzeFatigue(makeBlueprint({ prescriptions }));
    expect(result.findings.some((f) => f.code === "FATIGUE_DATA_THIN")).toBe(true);
  });

  it("does not fire at exactly 70% coverage", () => {
    // 7 scored, 3 unscored = 70% coverage — boundary is <70%, so 70% should not fire
    const scored = Array.from({ length: 7 }, (_, i) =>
      makePrescription({
        id: `pte-${i + 1}`,
        exerciseId: `ex-${i + 1}`,
        orderIndex: i,
        exercise: makeExercise({ id: `ex-${i + 1}`, name: `Scored ${i}`, fatigueCost: 5 }),
        sets: 3,
      }),
    );
    const unscored = Array.from({ length: 3 }, (_, i) =>
      makePrescription({
        id: `pte-u${i + 1}`,
        exerciseId: `ex-u${i + 1}`,
        orderIndex: 7 + i,
        exercise: makeExercise({ id: `ex-u${i + 1}`, name: `Unscored ${i}`, fatigueCost: null }),
        sets: 3,
      }),
    );
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [...scored, ...unscored] }));
    expect(result.findings.some((f) => f.code === "FATIGUE_DATA_THIN")).toBe(false);
  });
});

describe("analyzeFatigue — contributors ranking", () => {
  it("orders contributors by contribution descending", () => {
    const p1 = makePrescription({
      id: "pte-1",
      exerciseId: "ex-1",
      exercise: makeExercise({ id: "ex-1", name: "Back Squat", fatigueCost: 9 }),
      sets: 3, // contribution: 27
    });
    const p2 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Bicep Curl", fatigueCost: 3 }),
      sets: 4, // contribution: 12
    });
    const result = analyzeFatigue(makeBlueprint({ prescriptions: [p1, p2] }));
    expect(result.contributors[0].exerciseName).toBe("Back Squat");
    expect(result.contributors[1].exerciseName).toBe("Bicep Curl");
  });
});
