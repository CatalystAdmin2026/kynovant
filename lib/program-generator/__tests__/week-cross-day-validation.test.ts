// ─────────────────────────────────────────────────────────────
// Cross-day week validation — pure unit suite, no DB.
//
// P1 review finding: day-level generation can produce individually
// reasonable days that combine into a bad week. These tests prove the
// checks are deterministic, context-aware (a full-body plan's expected
// repetition is not flagged; a specialized priority muscle's expected
// emphasis is not flagged), and every finding is a warning, never a
// blocker — see the module's own header comment for the full design.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { validateWeekCrossDay } from "../week-cross-day-validation";
import type { ExerciseCandidate } from "../exercise-candidates";
import type { ModelWeekDraft, ModelDayDraft, ProgramGenerationBrief } from "../contracts";
import type { WorkoutSectionType } from "@/lib/db/schema-exercise";

function candidate(overrides: Partial<ExerciseCandidate> & { id: string }): ExerciseCandidate {
  return {
    name: `Exercise ${overrides.id}`,
    alternateNames: [],
    primaryMuscleGroup: null,
    secondaryMuscleGroups: [],
    movementPattern: "push_horizontal",
    classification: "compound",
    resistanceType: "barbell",
    difficulty: "intermediate",
    isCardio: false,
    isMobility: false,
    highJointStress: [],
    defaultPrescription: null,
    ...overrides,
  };
}

function dayWithExercises(
  dayOfWeek: number,
  label: string,
  exercises: { id: string; name: string }[],
  sectionType: WorkoutSectionType = "main_lift",
): ModelDayDraft {
  return {
    id: `day-${dayOfWeek}`,
    dayOfWeek,
    label,
    workout: {
      id: `workout-${dayOfWeek}`,
      name: label,
      sections: [
        {
          id: `section-${dayOfWeek}`,
          name: "Main",
          sectionType,
          orderIndex: 0,
          prescriptions: exercises.map((e, i) => ({
            id: `p-${dayOfWeek}-${i}`,
            exerciseId: e.id,
            exerciseName: e.name,
            orderIndex: i,
            isRequired: true,
          })),
        },
      ],
    },
  };
}

const BASE_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 8,
  daysPerWeek: 5,
  preferredSplit: "push_pull_legs",
  experienceLevel: "intermediate",
  musclePriorities: [],
  equipmentAccess: "commercial_gym",
  excludedExerciseIds: [],
  allowedTechniques: ["straight_set"],
  avoidedTechniques: [],
  targetSessionMinutes: 60,
  hardSessionCap: false,
  warmupIncluded: true,
};

describe("validateWeekCrossDay — duplicate main-lift detection", () => {
  it("flags the same main-lift exercise repeated on two different days for a split that doesn't call for it", () => {
    const squat = candidate({ id: "squat-1", name: "Back Squat", primaryMuscleGroup: "quadriceps", classification: "compound" });
    const candidatesById = new Map([[squat.id, squat]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [
        dayWithExercises(1, "Legs A", [{ id: squat.id, name: squat.name }]),
        dayWithExercises(3, "Legs B", [{ id: squat.id, name: squat.name }]),
      ],
    };
    const findings = validateWeekCrossDay(week, BASE_BRIEF, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT")).toBe(true);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });

  it("does NOT flag repetition for a full-body split — repetition is inherent to the split", () => {
    const squat = candidate({ id: "squat-1", name: "Back Squat", primaryMuscleGroup: "quadriceps", classification: "compound" });
    const candidatesById = new Map([[squat.id, squat]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [
        dayWithExercises(1, "Full Body A", [{ id: squat.id, name: squat.name }]),
        dayWithExercises(3, "Full Body B", [{ id: squat.id, name: squat.name }]),
      ],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, preferredSplit: "full_body" };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT")).toBe(false);
  });

  it("does NOT flag repetition of a prioritized muscle group's exercise — intentional specialization", () => {
    const hipThrust = candidate({ id: "hip-thrust-1", name: "Barbell Hip Thrust", primaryMuscleGroup: "glutes", classification: "compound" });
    const candidatesById = new Map([[hipThrust.id, hipThrust]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [
        dayWithExercises(1, "Glutes A", [{ id: hipThrust.id, name: hipThrust.name }]),
        dayWithExercises(3, "Glutes B", [{ id: hipThrust.id, name: hipThrust.name }]),
      ],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, musclePriorities: ["glutes"] };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT")).toBe(false);
  });
});

describe("validateWeekCrossDay — coverage gaps", () => {
  it("flags a prioritized muscle group with zero volume anywhere in the week", () => {
    const chest = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest" });
    const candidatesById = new Map([[chest.id, chest]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Push", [{ id: chest.id, name: chest.name }])],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, musclePriorities: ["hamstrings"] };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_PRIORITY_MUSCLE_GAP")).toBe(true);
  });

  it("does not flag a priority muscle that IS trained somewhere in the week", () => {
    const hamstring = candidate({ id: "rdl-1", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings" });
    const candidatesById = new Map([[hamstring.id, hamstring]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Legs", [{ id: hamstring.id, name: hamstring.name }])],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, musclePriorities: ["hamstrings"] };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_PRIORITY_MUSCLE_GAP")).toBe(false);
  });

  it("flags a broad muscle-coverage gap for a full-body split missing a major muscle group", () => {
    const chest = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest" });
    const candidatesById = new Map([[chest.id, chest]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Full Body", [{ id: chest.id, name: chest.name }])],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, preferredSplit: "full_body" };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_MUSCLE_COVERAGE_GAP")).toBe(true);
  });

  it("does NOT apply the broad-coverage check to a body_part split (specialization phases are legitimate)", () => {
    const chest = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest" });
    const candidatesById = new Map([[chest.id, chest]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Chest", [{ id: chest.id, name: chest.name }])],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, preferredSplit: "body_part" };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_MUSCLE_COVERAGE_GAP")).toBe(false);
  });

  it("flags a missing foundational movement pattern for a standard split", () => {
    // Only push_horizontal exercises all week — no hip_hinge/squat/pull anywhere.
    const bench = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest", movementPattern: "push_horizontal" });
    const candidatesById = new Map([[bench.id, bench]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Push", [{ id: bench.id, name: bench.name }])],
    };
    const findings = validateWeekCrossDay(week, BASE_BRIEF, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_MOVEMENT_PATTERN_GAP")).toBe(true);
  });

  it("does NOT apply the movement-pattern check to a coach_decides split", () => {
    const bench = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest", movementPattern: "push_horizontal" });
    const candidatesById = new Map([[bench.id, bench]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [dayWithExercises(1, "Day 1", [{ id: bench.id, name: bench.name }])],
    };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, preferredSplit: "coach_decides" };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_MOVEMENT_PATTERN_GAP")).toBe(false);
  });
});

describe("validateWeekCrossDay — equipment overuse", () => {
  it("flags heavy overuse of one equipment family when the brief has broader access", () => {
    const candidatesById = new Map<string, ExerciseCandidate>();
    const exercises: { id: string; name: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const c = candidate({ id: `bb-${i}`, name: `Barbell Exercise ${i}`, resistanceType: "barbell" });
      candidatesById.set(c.id, c);
      exercises.push({ id: c.id, name: c.name });
    }
    const week: ModelWeekDraft = { id: "week-1", weekNumber: 1, days: [dayWithExercises(1, "Day 1", exercises)] };
    const findings = validateWeekCrossDay(week, BASE_BRIEF, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_EQUIPMENT_OVERUSE")).toBe(true);
  });

  it("does NOT flag near-single-equipment when the brief itself is dumbbells-only", () => {
    const candidatesById = new Map<string, ExerciseCandidate>();
    const exercises: { id: string; name: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const c = candidate({ id: `db-${i}`, name: `Dumbbell Exercise ${i}`, resistanceType: "dumbbell" });
      candidatesById.set(c.id, c);
      exercises.push({ id: c.id, name: c.name });
    }
    const week: ModelWeekDraft = { id: "week-1", weekNumber: 1, days: [dayWithExercises(1, "Day 1", exercises)] };
    const brief: ProgramGenerationBrief = { ...BASE_BRIEF, equipmentAccess: "dumbbells_only" };
    const findings = validateWeekCrossDay(week, brief, candidatesById);
    expect(findings.some((f) => f.code === "PROGRAM_GEN_WEEK_EQUIPMENT_OVERUSE")).toBe(false);
  });
});

describe("validateWeekCrossDay — every finding is a warning, never a blocker", () => {
  it("returns only severity: warning findings across every check", () => {
    // A pathological week designed to trip several checks at once.
    const squat = candidate({ id: "squat-1", name: "Back Squat", primaryMuscleGroup: "quadriceps", resistanceType: "barbell" });
    const candidatesById = new Map([[squat.id, squat]]);
    const week: ModelWeekDraft = {
      id: "week-1",
      weekNumber: 1,
      days: [
        dayWithExercises(1, "Day A", [{ id: squat.id, name: squat.name }]),
        dayWithExercises(3, "Day B", [{ id: squat.id, name: squat.name }]),
      ],
    };
    const findings = validateWeekCrossDay(week, BASE_BRIEF, candidatesById);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });
});
