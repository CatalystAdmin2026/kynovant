import { describe, it, expect } from "vitest";
import { orchestrateBlueprint } from "../blueprint-audit";
import { makeBlueprint, makeExercise, makePrescription } from "./helpers";
import type { EnrichedMuscle } from "../types";

function muscle(role: "primary" | "secondary", group: string): EnrichedMuscle {
  return { muscleGroup: group as EnrichedMuscle["muscleGroup"], role, emphasisPercent: null };
}

describe("orchestrateBlueprint — full round trip", () => {
  it("returns a non-empty result for a well-formed blueprint", () => {
    const p = makePrescription({
      sets: 3,
      exercise: makeExercise({ fatigueCost: 7, muscles: [muscle("primary", "chest")] }),
    });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [p] }));
    expect(result.templateId).toBe("tmpl-1");
    expect(result.analyzedAt).toBeTruthy();
    expect(result.qualitySummary.dimensionStatus).toBeDefined();
  });

  it("includes all module results", () => {
    const p = makePrescription({ sets: 3 });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [p] }));
    expect(result.validationResult).toBeDefined();
    expect(result.volumeAnalysis).toBeDefined();
    expect(result.fatigueAnalysis).toBeDefined();
    expect(result.movementAnalysis).toBeDefined();
    expect(result.completenessReport).toBeDefined();
  });
});

describe("orchestrateBlueprint — dimensionStatus derivation", () => {
  it("sets validity=has_errors when blueprint has inverted reps", () => {
    const p = makePrescription({ repsMin: 12, repsMax: 6 });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [p] }));
    expect(result.qualitySummary.dimensionStatus.validity).toBe("has_errors");
  });

  it("sets validity=ok for a clean blueprint", () => {
    const result = orchestrateBlueprint(makeBlueprint());
    expect(result.qualitySummary.dimensionStatus.validity).toBe("ok");
  });

  it("sets movement=imbalanced when MOVEMENT_PUSH_PULL_H fires", () => {
    const push = makePrescription({
      id: "pte-1",
      exerciseId: "ex-push",
      orderIndex: 0,
      sets: 7,
      exercise: makeExercise({ id: "ex-push", name: "Bench Press", movementPattern: "push_horizontal" }),
    });
    const pull = makePrescription({
      id: "pte-2",
      exerciseId: "ex-pull",
      orderIndex: 1,
      sets: 2,
      exercise: makeExercise({ id: "ex-pull", name: "Cable Row", movementPattern: "pull_horizontal" }),
    });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [push, pull] }));
    expect(result.qualitySummary.dimensionStatus.movement).toBe("imbalanced");
  });

  it("sets movement=balanced for a balanced session", () => {
    const push = makePrescription({
      id: "pte-1",
      exerciseId: "ex-push",
      orderIndex: 0,
      sets: 3,
      exercise: makeExercise({ id: "ex-push", name: "Bench Press", movementPattern: "push_horizontal" }),
    });
    const pull = makePrescription({
      id: "pte-2",
      exerciseId: "ex-pull",
      orderIndex: 1,
      sets: 3,
      exercise: makeExercise({ id: "ex-pull", name: "Cable Row", movementPattern: "pull_horizontal" }),
    });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [push, pull] }));
    expect(result.qualitySummary.dimensionStatus.movement).toBe("balanced");
  });

  it("sets fatigue=high when FATIGUE_ACCUMULATION fires", () => {
    const prescriptions = [
      makePrescription({ id: "pte-1", exerciseId: "ex-1", orderIndex: 0, exercise: makeExercise({ id: "ex-1", fatigueCost: 9 }), sets: 3 }),
      makePrescription({ id: "pte-2", exerciseId: "ex-2", orderIndex: 1, exercise: makeExercise({ id: "ex-2", name: "RDL", fatigueCost: 8 }), sets: 3 }),
      makePrescription({ id: "pte-3", exerciseId: "ex-3", orderIndex: 2, exercise: makeExercise({ id: "ex-3", name: "Hip Thrust", fatigueCost: 7 }), sets: 3 }),
    ];
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions }));
    expect(result.qualitySummary.dimensionStatus.fatigue).toBe("high");
  });

  it("1C dimensions return ok for a clean, single-exercise blueprint", () => {
    const result = orchestrateBlueprint(makeBlueprint());
    const { jointStress, redundancy, duration } = result.qualitySummary.dimensionStatus;
    // Joint data present in makeExercise defaults → "ok" (not "unknown")
    expect(jointStress).toBe("ok");
    // Single prescription → no redundant group detected
    expect(redundancy).toBe("ok");
    // Heuristic estimate well under 90 min threshold
    expect(duration).toBe("ok");
  });
});

describe("orchestrateBlueprint — allFindings ordering", () => {
  it("orders findings error → warning → caution → info", () => {
    // Create a blueprint that produces findings at multiple severity levels
    // Invalid reps → error
    // High horizontal push:pull → warning
    // High fatigue cost exercise → caution
    const push = makePrescription({
      id: "pte-push",
      exerciseId: "ex-push",
      orderIndex: 0,
      sets: 7,
      repsMin: 10,
      repsMax: 6, // inverted → error
      exercise: makeExercise({
        id: "ex-push",
        name: "Bench Press",
        movementPattern: "push_horizontal",
        fatigueCost: 8,
      }),
    });
    const pull = makePrescription({
      id: "pte-pull",
      exerciseId: "ex-pull",
      orderIndex: 1,
      sets: 2,
      exercise: makeExercise({
        id: "ex-pull",
        name: "Cable Row",
        movementPattern: "pull_horizontal",
        fatigueCost: 5,
      }),
    });
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [push, pull] }));

    const severityOrder = ["error", "warning", "caution", "info"];
    let lastRank = -1;
    for (const f of result.allFindings) {
      const rank = severityOrder.indexOf(f.severity);
      expect(rank).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank;
    }
  });

  it("topFindings contains at most 2 findings", () => {
    const result = orchestrateBlueprint(makeBlueprint({ prescriptions: [] }));
    expect(result.qualitySummary.topFindings.length).toBeLessThanOrEqual(2);
  });
});

describe("orchestrateBlueprint — analyzedAt", () => {
  it("sets analyzedAt to a valid ISO timestamp", () => {
    const result = orchestrateBlueprint(makeBlueprint());
    expect(new Date(result.analyzedAt).getTime()).not.toBeNaN();
  });
});
