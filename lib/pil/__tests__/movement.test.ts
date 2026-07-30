import { describe, it, expect } from "vitest";
import { analyzeMovement } from "../modules/movement";
import { makeBlueprint, makeExercise, makePrescription } from "./helpers";
import type { MovementPattern } from "../types";

function pWithPattern(
  id: string,
  exerciseId: string,
  pattern: MovementPattern,
  sets: number,
  orderIndex: number = 0,
) {
  return makePrescription({
    id,
    exerciseId,
    orderIndex,
    sets,
    exercise: makeExercise({ id: exerciseId, name: exerciseId, movementPattern: pattern }),
  });
}

describe("analyzeMovement — clean blueprint", () => {
  it("returns no findings for a balanced, diverse blueprint", () => {
    // Four patterns, equal sets — no single pattern > 40%, push:pull = 1:1
    const p1 = pWithPattern("pte-1", "ex-ph", "push_horizontal", 3, 0);
    const p2 = pWithPattern("pte-2", "ex-pu", "pull_horizontal", 3, 1);
    const p3 = pWithPattern("pte-3", "ex-sq", "squat_bilateral", 3, 2);
    const p4 = pWithPattern("pte-4", "ex-hi", "hip_hinge", 3, 3);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [p1, p2, p3, p4] }));
    expect(result.findings).toHaveLength(0);
  });
});

describe("analyzeMovement — byPattern calculation", () => {
  it("aggregates sets by movement pattern", () => {
    const p1 = pWithPattern("pte-1", "ex-1", "push_horizontal", 4, 0);
    const p2 = pWithPattern("pte-2", "ex-2", "push_horizontal", 3, 1);
    const p3 = pWithPattern("pte-3", "ex-3", "pull_horizontal", 3, 2);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [p1, p2, p3] }));
    const push = result.byPattern.find((p) => p.pattern === "push_horizontal");
    expect(push?.sets).toBe(7); // 4 + 3
  });

  it("excludes prescriptions with null sets from pattern count", () => {
    const p = pWithPattern("pte-1", "ex-1", "squat_bilateral", 0, 0);
    const pNull = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      sets: null,
      exercise: makeExercise({ id: "ex-2", name: "Goblet Squat", movementPattern: "squat_bilateral" }),
    });
    const result = analyzeMovement(makeBlueprint({ prescriptions: [p, pNull] }));
    // sets=0 prescription also excluded (0 is falsy-but-valid; check our filter)
    // The module filters sets === 0, so only null check matters here
    const squat = result.byPattern.find((p) => p.pattern === "squat_bilateral");
    expect(squat).toBeUndefined(); // both excluded (null → skip, 0 → skip)
  });
});

describe("analyzeMovement — push/pull ratio calculation", () => {
  it("computes horizontal push:pull ratio correctly", () => {
    const push = pWithPattern("pte-1", "ex-push", "push_horizontal", 6, 0);
    const pull = pWithPattern("pte-2", "ex-pull", "pull_horizontal", 2, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [push, pull] }));
    expect(result.pushPullBalance.horizontal.pushSets).toBe(6);
    expect(result.pushPullBalance.horizontal.pullSets).toBe(2);
    expect(result.pushPullBalance.horizontal.ratio).toBeCloseTo(3);
  });

  it("computes vertical push:pull ratio independently", () => {
    const vPush = pWithPattern("pte-1", "ex-vp", "push_vertical", 4, 0);
    const vPull = pWithPattern("pte-2", "ex-vpu", "pull_vertical", 2, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [vPush, vPull] }));
    expect(result.pushPullBalance.vertical.ratio).toBeCloseTo(2);
  });

  it("sets ratio to null when one side has zero sets", () => {
    const push = pWithPattern("pte-1", "ex-push", "push_horizontal", 6, 0);
    // No horizontal pull
    const result = analyzeMovement(makeBlueprint({ prescriptions: [push] }));
    expect(result.pushPullBalance.horizontal.ratio).toBeNull();
  });

  it("sets ratio to null when both sides have zero sets", () => {
    const squat = pWithPattern("pte-1", "ex-sq", "squat_bilateral", 4, 0);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [squat] }));
    expect(result.pushPullBalance.horizontal.ratio).toBeNull();
    expect(result.pushPullBalance.vertical.ratio).toBeNull();
  });
});

describe("analyzeMovement — MOVEMENT_PUSH_PULL_H", () => {
  it("fires when horizontal push:pull ratio > 2:1", () => {
    const push = pWithPattern("pte-1", "ex-push", "push_horizontal", 7, 0);
    const pull = pWithPattern("pte-2", "ex-pull", "pull_horizontal", 3, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [push, pull] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_H")).toBe(true);
  });

  it("does not fire at exactly 2:1", () => {
    const push = pWithPattern("pte-1", "ex-push", "push_horizontal", 6, 0);
    const pull = pWithPattern("pte-2", "ex-pull", "pull_horizontal", 3, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [push, pull] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_H")).toBe(false);
  });

  it("does not fire when one side is zero (incomplete session)", () => {
    const push = pWithPattern("pte-1", "ex-push", "push_horizontal", 6, 0);
    // No horizontal pull
    const result = analyzeMovement(makeBlueprint({ prescriptions: [push] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_H")).toBe(false);
  });
});

describe("analyzeMovement — MOVEMENT_PUSH_PULL_V", () => {
  it("fires when vertical push:pull ratio > 2:1", () => {
    const vPush = pWithPattern("pte-1", "ex-vp", "push_vertical", 7, 0);
    const vPull = pWithPattern("pte-2", "ex-vpu", "pull_vertical", 3, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [vPush, vPull] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_V")).toBe(true);
  });

  it("does not fire when vertical pull side is zero", () => {
    const vPush = pWithPattern("pte-1", "ex-vp", "push_vertical", 6, 0);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [vPush] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PUSH_PULL_V")).toBe(false);
  });

  it("has severity=caution (lower than horizontal warning)", () => {
    const vPush = pWithPattern("pte-1", "ex-vp", "push_vertical", 7, 0);
    const vPull = pWithPattern("pte-2", "ex-vpu", "pull_vertical", 3, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [vPush, vPull] }));
    const finding = result.findings.find((f) => f.code === "MOVEMENT_PUSH_PULL_V");
    expect(finding?.severity).toBe("caution");
  });
});

describe("analyzeMovement — MOVEMENT_PATTERN_DOMINANT", () => {
  it("fires when one pattern exceeds 40% of session sets", () => {
    // 5 squat sets out of 7 total = 71%
    const squats = pWithPattern("pte-1", "ex-sq", "squat_bilateral", 5, 0);
    const other = pWithPattern("pte-2", "ex-ot", "hip_hinge", 2, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [squats, other] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PATTERN_DOMINANT")).toBe(true);
    expect(result.dominantPattern).toBe("squat_bilateral");
  });

  it("does not fire at exactly 40% (threshold is >40%)", () => {
    // 2 squat sets out of 5 total = 40%
    const squats = pWithPattern("pte-1", "ex-sq", "squat_bilateral", 2, 0);
    const p2 = pWithPattern("pte-2", "ex-h", "hip_hinge", 1, 1);
    const p3 = pWithPattern("pte-3", "ex-p", "push_horizontal", 1, 2);
    const p4 = pWithPattern("pte-4", "ex-pu", "pull_horizontal", 1, 3);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [squats, p2, p3, p4] }));
    expect(result.findings.some((f) => f.code === "MOVEMENT_PATTERN_DOMINANT")).toBe(false);
  });

  it("has confidence=certain", () => {
    const squats = pWithPattern("pte-1", "ex-sq", "squat_bilateral", 5, 0);
    const other = pWithPattern("pte-2", "ex-ot", "hip_hinge", 2, 1);
    const result = analyzeMovement(makeBlueprint({ prescriptions: [squats, other] }));
    const finding = result.findings.find((f) => f.code === "MOVEMENT_PATTERN_DOMINANT");
    expect(finding?.confidence).toBe("certain");
  });
});
