import { describe, it, expect } from "vitest";
import { analyzeVolume } from "../modules/volume";
import { makeBlueprint, makeExercise, makePrescription, makeSection } from "./helpers";
import type { EnrichedMuscle, EnrichedPrescription } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function muscle(
  role: "primary" | "secondary" | "stabilizer",
  muscleGroup: string,
): EnrichedMuscle {
  return { muscleGroup: muscleGroup as EnrichedMuscle["muscleGroup"], role, emphasisPercent: null };
}

function prescriptionWithMuscles(
  overrides: Partial<EnrichedPrescription>,
  muscles: EnrichedMuscle[],
): EnrichedPrescription {
  return makePrescription({
    exercise: makeExercise({ muscles }),
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("analyzeVolume — clean blueprint", () => {
  it("returns no findings when all major muscles are covered at moderate volume", () => {
    // One prescription per major muscle group; 3 sets each — no threshold exceeded
    const majorMuscles = ["chest", "quadriceps", "hamstrings", "glutes", "lats", "upper_back"] as const;
    const prescriptions = majorMuscles.map((group, i) =>
      prescriptionWithMuscles(
        { id: `pte-${i}`, exerciseId: `ex-${i}`, orderIndex: i, sets: 3 },
        [muscle("primary", group)],
      ),
    );
    const result = analyzeVolume(makeBlueprint({ prescriptions }));
    expect(result.findings).toHaveLength(0);
  });
});

describe("analyzeVolume — direct set counting", () => {
  it("counts sets where muscle role is primary as direct sets", () => {
    const p = prescriptionWithMuscles({ sets: 4 }, [
      muscle("primary", "chest"),
      muscle("secondary", "triceps"),
    ]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const chest = result.byMuscle.find((m) => m.muscleGroup === "chest");
    const triceps = result.byMuscle.find((m) => m.muscleGroup === "triceps");
    expect(chest?.directSets).toBe(4);
    expect(triceps?.directSets).toBe(0);
  });

  it("counts secondary and stabilizer sets as indirect sets", () => {
    const p = prescriptionWithMuscles({ sets: 3 }, [
      muscle("secondary", "triceps"),
      muscle("stabilizer", "core" as EnrichedMuscle["muscleGroup"]),
    ]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const triceps = result.byMuscle.find((m) => m.muscleGroup === "triceps");
    expect(triceps?.directSets).toBe(0);
    expect(triceps?.indirectSets).toBe(3);
  });

  it("accumulates sets across multiple prescriptions for the same muscle", () => {
    const p1 = prescriptionWithMuscles(
      { id: "pte-1", exerciseId: "ex-1", orderIndex: 0, sets: 4 },
      [muscle("primary", "chest")],
    );
    const p2 = prescriptionWithMuscles(
      {
        id: "pte-2",
        exerciseId: "ex-2",
        exercise: makeExercise({ id: "ex-2", name: "Dumbbell Fly" }),
        orderIndex: 1,
        sets: 3,
      },
      [muscle("primary", "chest"), muscle("secondary", "front_deltoid")],
    );
    const result = analyzeVolume(
      makeBlueprint({
        prescriptions: [
          makePrescription({ id: "pte-1", exerciseId: "ex-1", sets: 4, exercise: makeExercise({ muscles: [muscle("primary", "chest")] }) }),
          makePrescription({
            id: "pte-2",
            exerciseId: "ex-2",
            orderIndex: 1,
            exercise: makeExercise({
              id: "ex-2",
              name: "Dumbbell Fly",
              muscles: [muscle("primary", "chest"), muscle("secondary", "front_deltoid")],
            }),
            sets: 3,
          }),
        ],
      }),
    );
    const chest = result.byMuscle.find((m) => m.muscleGroup === "chest");
    expect(chest?.directSets).toBe(7); // 4 + 3
  });
});

describe("analyzeVolume — indirect set counting", () => {
  it("sums indirect sets from both secondary and stabilizer roles", () => {
    const p = prescriptionWithMuscles({ sets: 5 }, [
      muscle("primary", "chest"),
      muscle("secondary", "triceps"),
      muscle("stabilizer", "front_deltoid"),
    ]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const triceps = result.byMuscle.find((m) => m.muscleGroup === "triceps");
    const frontDelt = result.byMuscle.find((m) => m.muscleGroup === "front_deltoid");
    expect(triceps?.indirectSets).toBe(5);
    expect(frontDelt?.indirectSets).toBe(5);
  });
});

describe("analyzeVolume — VOLUME_HIGH_DIRECT", () => {
  it("fires at ≥10 direct sets", () => {
    const p = prescriptionWithMuscles({ sets: 10 }, [muscle("primary", "chest")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "VOLUME_HIGH_DIRECT")).toBe(true);
  });

  it("does not fire at 9 direct sets", () => {
    const p = prescriptionWithMuscles({ sets: 9 }, [muscle("primary", "chest")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "VOLUME_HIGH_DIRECT")).toBe(false);
  });

  it("fires independently for each muscle that exceeds threshold", () => {
    const p = prescriptionWithMuscles({ sets: 10 }, [
      muscle("primary", "chest"),
      muscle("primary", "triceps"),
    ]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const codes = result.findings.filter((f) => f.code === "VOLUME_HIGH_DIRECT").map((f) => f.affectedEntities[0].id);
    expect(codes).toContain("chest");
    expect(codes).toContain("triceps");
  });
});

describe("analyzeVolume — VOLUME_ZERO_DIRECT_MAJOR", () => {
  it("fires for a major muscle group with 0 direct sets", () => {
    // Blueprint with no chest exercises
    const p = prescriptionWithMuscles({ sets: 3 }, [muscle("primary", "triceps")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const codes = result.findings.filter((f) => f.code === "VOLUME_ZERO_DIRECT_MAJOR").map((f) => f.affectedEntities[0].id);
    // Chest, quads, hamstrings, glutes, lats, upper_back all have 0 direct sets
    expect(codes).toContain("chest");
    expect(codes).toContain("quadriceps");
    expect(codes).toContain("lats");
  });

  it("does not fire for a major muscle group that has direct sets", () => {
    const p = prescriptionWithMuscles({ sets: 3 }, [muscle("primary", "chest")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const codes = result.findings.filter((f) => f.code === "VOLUME_ZERO_DIRECT_MAJOR").map((f) => f.affectedEntities[0].id);
    expect(codes).not.toContain("chest");
  });

  it("does not fire for non-major muscle groups (e.g. biceps)", () => {
    const p = prescriptionWithMuscles({ sets: 3 }, [muscle("primary", "triceps")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    const codes = result.findings.filter((f) => f.code === "VOLUME_ZERO_DIRECT_MAJOR").map((f) => f.affectedEntities[0].id);
    expect(codes).not.toContain("biceps");
  });
});

describe("analyzeVolume — VOLUME_DATA_INCOMPLETE", () => {
  it("fires when >30% of prescriptions have no muscle data", () => {
    // 4 prescriptions; 2 have no muscle data (50%)
    const withMuscles = prescriptionWithMuscles(
      { id: "pte-1", exerciseId: "ex-1", orderIndex: 0, sets: 3 },
      [muscle("primary", "chest")],
    );
    const noMuscles1 = makePrescription({
      id: "pte-2",
      exerciseId: "ex-2",
      orderIndex: 1,
      exercise: makeExercise({ id: "ex-2", name: "Unknown A", muscles: [] }),
      sets: 3,
    });
    const noMuscles2 = makePrescription({
      id: "pte-3",
      exerciseId: "ex-3",
      orderIndex: 2,
      exercise: makeExercise({ id: "ex-3", name: "Unknown B", muscles: [] }),
      sets: 3,
    });
    const result = analyzeVolume(
      makeBlueprint({ prescriptions: [withMuscles, noMuscles1, noMuscles2] }),
    );
    expect(result.findings.some((f) => f.code === "VOLUME_DATA_INCOMPLETE")).toBe(true);
  });

  it("does not fire when ≤30% have no muscle data", () => {
    // 1 prescription with muscle data = 100% coverage
    const p = prescriptionWithMuscles({ sets: 3 }, [muscle("primary", "chest")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    expect(result.findings.some((f) => f.code === "VOLUME_DATA_INCOMPLETE")).toBe(false);
  });
});

describe("analyzeVolume — null sets handling", () => {
  it("excludes prescriptions with null sets from volume count", () => {
    const p = prescriptionWithMuscles({ sets: null }, [muscle("primary", "chest")]);
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    expect(result.unknownVolume.prescriptionsWithNullSets).toContain("ex-1");
    const chest = result.byMuscle.find((m) => m.muscleGroup === "chest");
    expect(chest).toBeUndefined(); // no muscle entry created
  });

  it("excludes prescriptions with no muscle data from volume count", () => {
    const p = makePrescription({
      exercise: makeExercise({ muscles: [] }),
      sets: 3,
    });
    const result = analyzeVolume(makeBlueprint({ prescriptions: [p] }));
    expect(result.unknownVolume.prescriptionsWithNoMuscleData).toContain("ex-1");
    expect(result.totalPrescribedSets).toBe(0);
  });
});
