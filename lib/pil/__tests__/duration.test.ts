import { describe, it, expect } from "vitest";
import { estimateDuration } from "../modules/duration";
import { makeBlueprint, makeExercise, makePrescription, makeSection } from "./helpers";

// Helpers for readable test blueprints
function cardioExercise() {
  return makeExercise({ classification: "cardio", isCardio: true, isTimeBased: false });
}

function compoundExercise() {
  return makeExercise({ classification: "compound", isTimeBased: false, isCardio: false });
}

function isolationExercise() {
  return makeExercise({ classification: "isolation", isTimeBased: false, isCardio: false });
}

describe("estimateDuration — section-based path (certain)", () => {
  it("sums section estimatedMinutes and returns certain confidence", () => {
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 40, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: 50, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.estimatedMinutes).toBe(90);
    expect(result.confidence).toBe("certain");
  });

  it("fires DURATION_LONG when section sum exceeds 90 minutes", () => {
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 45, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: 50, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.estimatedMinutes).toBe(95);
    expect(result.findings.some((f) => f.code === "DURATION_LONG")).toBe(true);
    expect(result.confidence).toBe("certain");
  });

  it("does not fire DURATION_LONG at exactly 90 minutes (threshold is > 90)", () => {
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 45, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: 45, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.estimatedMinutes).toBe(90);
    expect(result.findings).toHaveLength(0);
  });

  it("fires DURATION_VERY_LONG when section sum exceeds 120 minutes", () => {
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 65, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: 60, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.estimatedMinutes).toBe(125);
    expect(result.findings.some((f) => f.code === "DURATION_VERY_LONG")).toBe(true);
    // DURATION_LONG must NOT also fire (the two findings are mutually exclusive)
    expect(result.findings.some((f) => f.code === "DURATION_LONG")).toBe(false);
  });

  it("falls through to heuristic when any section has null estimatedMinutes", () => {
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 45, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: null, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.confidence).toBe("heuristic");
  });

  it("falls through to heuristic when sections array is empty", () => {
    const blueprint = makeBlueprint({ sections: [] });
    const result = estimateDuration(blueprint);
    expect(result.confidence).toBe("heuristic");
  });
});

describe("estimateDuration — heuristic set durations per classification", () => {
  it("uses 0.75 min per set for compound exercises", () => {
    // 4 sets × 0.75 + 3 × 2 min rest = 3 + 6 = 9 min
    const p = makePrescription({
      sets: 4,
      restSeconds: 120,
      exercise: compoundExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(9);
    expect(result.confidence).toBe("heuristic");
  });

  it("uses 0.5 min per set for isolation exercises", () => {
    // 4 sets × 0.5 + 3 × 2 min rest = 2 + 6 = 8 min
    const p = makePrescription({
      sets: 4,
      restSeconds: 120,
      exercise: isolationExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(8);
  });

  it("uses 5.0 min per set for cardio exercises", () => {
    // 3 sets × 5.0 + 2 × 1 min rest = 15 + 2 = 17 min
    const p = makePrescription({
      sets: 3,
      restSeconds: 60,
      exercise: cardioExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(17);
  });

  it("applies no rest after last set (sets - 1 rest intervals)", () => {
    // 1 set × 0.75 + 0 rest = 0.75 → 1 min
    const p = makePrescription({
      sets: 1,
      restSeconds: 180,
      exercise: compoundExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(1); // Math.round(0.75)
  });

  it("treats null sets as 1 (single set fallback)", () => {
    // sets=null → 1; 1 × 0.75 + 0 rest = 0.75 → 1 min
    const p = makePrescription({
      sets: null,
      restSeconds: 120,
      exercise: compoundExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(1);
  });
});

describe("estimateDuration — heuristic fallback rest", () => {
  it("uses 90s fallback when restSeconds is null", () => {
    // compound, 3 sets, null rest → 3×0.75 + 2×1.5 = 2.25 + 3.0 = 5.25 → 5 min
    const p = makePrescription({
      id: "pte-1",
      exerciseId: "ex-1",
      sets: 3,
      restSeconds: null,
      exercise: compoundExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(5);
    expect(result.prescriptionsWithMissingRest).toContain("ex-1");
  });

  it("does not add to prescriptionsWithMissingRest when restSeconds is set", () => {
    const p = makePrescription({
      sets: 3,
      restSeconds: 180,
      exercise: compoundExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.prescriptionsWithMissingRest).toHaveLength(0);
  });
});

describe("estimateDuration — DURATION_LONG (heuristic)", () => {
  it("fires above 90 minutes with heuristic confidence", () => {
    // cardio, 20 sets, 60s rest → 20×5.0 + 19×1.0 = 119 min → DURATION_LONG
    const p = makePrescription({
      sets: 20,
      restSeconds: 60,
      exercise: cardioExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(119);
    expect(result.findings.some((f) => f.code === "DURATION_LONG")).toBe(true);
    expect(result.confidence).toBe("heuristic");
  });
});

describe("estimateDuration — DURATION_VERY_LONG (heuristic)", () => {
  it("fires above 120 minutes and DURATION_LONG does not co-fire", () => {
    // cardio, 25 sets, 60s rest → 25×5.0 + 24×1.0 = 149 min → DURATION_VERY_LONG
    const p = makePrescription({
      sets: 25,
      restSeconds: 60,
      exercise: cardioExercise(),
    });
    const result = estimateDuration(makeBlueprint({ sections: [makeSection()], prescriptions: [p] }));
    expect(result.estimatedMinutes).toBe(149);
    expect(result.findings.some((f) => f.code === "DURATION_VERY_LONG")).toBe(true);
    expect(result.findings.some((f) => f.code === "DURATION_LONG")).toBe(false);
  });

  it("does not fire at exactly 120 minutes (threshold is > 120)", () => {
    // sections: [65, 55] = 120 — no finding
    const blueprint = makeBlueprint({
      sections: [
        makeSection({ id: "s-1", estimatedMinutes: 65, orderIndex: 0 }),
        makeSection({ id: "s-2", estimatedMinutes: 55, orderIndex: 1 }),
      ],
    });
    const result = estimateDuration(blueprint);
    expect(result.estimatedMinutes).toBe(120);
    expect(result.findings.some((f) => f.code === "DURATION_VERY_LONG")).toBe(false);
  });
});
