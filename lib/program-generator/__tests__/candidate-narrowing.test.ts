// ─────────────────────────────────────────────────────────────
// Day-level candidate narrowing — pure unit suite, no DB.
//
// P0 architecture change (see exercise-candidates.ts's
// narrowCandidatesForDay() header comment): whole-week generation sent
// the full ~150-candidate program-wide pool to every call regardless
// of which muscle groups a day actually trains. These tests prove the
// narrowing is deterministic, respects the shell's structured
// targetMuscleGroups field, falls back sanely for a legacy shell that
// predates it, and never narrows below a safe floor.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  narrowCandidatesForDay,
  inferMuscleGroupsFromDayText,
  type ExerciseCandidate,
  type ExerciseCandidateSet,
} from "../exercise-candidates";
import type { ProgramShellDay } from "../contracts";
import type { MuscleGroup } from "@/lib/db/schema-exercise";

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

// A realistic-shaped program-wide pool: several exercises per muscle
// group across the full CORE_MUSCLE_GROUPS list, plus a mobility and a
// cardio bucket — mirroring what buildExerciseCandidateSet() actually
// returns, without needing a live database.
function buildPool(): ExerciseCandidateSet {
  const groups: MuscleGroup[] = [
    "chest",
    "lats",
    "upper_back",
    "front_deltoid",
    "lateral_deltoid",
    "rear_deltoid",
    "biceps",
    "triceps",
    "quadriceps",
    "hamstrings",
    "glutes",
    "calves",
    "rectus_abdominis",
    "obliques",
  ];
  const candidates: ExerciseCandidate[] = [];
  for (const group of groups) {
    for (let i = 0; i < 8; i++) {
      candidates.push(candidate({ id: `${group}-${i}`, primaryMuscleGroup: group }));
    }
  }
  for (let i = 0; i < 10; i++) candidates.push(candidate({ id: `mobility-${i}`, isMobility: true }));
  for (let i = 0; i < 8; i++) candidates.push(candidate({ id: `cardio-${i}`, isCardio: true }));

  return { candidates, gaps: [] };
}

const PUSH_DAY: ProgramShellDay = {
  dayOfWeek: 1,
  label: "Push Day",
  focus: "Chest, shoulders, triceps",
  targetMuscleGroups: ["chest", "front_deltoid", "lateral_deltoid", "triceps"],
};

const UNCLASSIFIABLE_DAY: ProgramShellDay = {
  dayOfWeek: 3,
  label: "Session C",
};

describe("narrowCandidatesForDay — structured targetMuscleGroups (new shells)", () => {
  it("returns a materially smaller pool than the full ~150-candidate program-wide set", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, PUSH_DAY, []);
    expect(pool.candidates.length).toBeGreaterThan(100);
    expect(narrowed.length).toBeLessThan(pool.candidates.length);
    // Report the actual before/after sizes (Phase 3's explicit ask).
    console.log(`candidate-narrowing: full pool ${pool.candidates.length} -> narrowed ${narrowed.length} for "${PUSH_DAY.label}"`);
  });

  it("only includes target-muscle-group exercises plus the mobility/cardio baseline — never an unrelated muscle group", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, PUSH_DAY, []);
    const allowedGroups = new Set(PUSH_DAY.targetMuscleGroups);
    for (const c of narrowed) {
      const isAllowedMuscle = c.primaryMuscleGroup !== null && allowedGroups.has(c.primaryMuscleGroup);
      expect(isAllowedMuscle || c.isMobility || c.isCardio).toBe(true);
      if (c.primaryMuscleGroup) {
        expect(["chest", "front_deltoid", "lateral_deltoid", "triceps"]).toContain(c.primaryMuscleGroup);
      }
    }
  });

  it("always includes a mobility and a cardio allowance regardless of the day's target muscles", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, PUSH_DAY, []);
    expect(narrowed.some((c) => c.isMobility)).toBe(true);
    expect(narrowed.some((c) => c.isCardio)).toBe(true);
  });

  it("unions in musclePriorities even when not part of the day's own target groups", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, PUSH_DAY, ["quadriceps"]);
    expect(narrowed.some((c) => c.primaryMuscleGroup === "quadriceps")).toBe(true);
  });

  it("is deterministic — same inputs produce the same output every time", () => {
    const pool = buildPool();
    const first = narrowCandidatesForDay(pool, PUSH_DAY, []).map((c) => c.id);
    const second = narrowCandidatesForDay(pool, PUSH_DAY, []).map((c) => c.id);
    expect(first).toEqual(second);
  });
});

describe("narrowCandidatesForDay — legacy shell without targetMuscleGroups (keyword fallback)", () => {
  it("infers muscle groups from label/focus text when the structured field is absent", () => {
    const legacyPushDay: ProgramShellDay = { dayOfWeek: 1, label: "Push Day", focus: "Chest and shoulders" };
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, legacyPushDay, []);
    expect(narrowed.length).toBeLessThan(pool.candidates.length);
    expect(narrowed.some((c) => c.primaryMuscleGroup === "chest")).toBe(true);
    expect(narrowed.some((c) => c.primaryMuscleGroup === "quadriceps")).toBe(false);
  });

  it("never narrows an unclassifiable day — hands back the full pool rather than guessing", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, UNCLASSIFIABLE_DAY, []);
    expect(narrowed).toEqual(pool.candidates);
  });
});

describe("narrowCandidatesForDay — never makes legitimate programming impossible", () => {
  it("tops back up to the minimum floor when a target muscle group has very few library matches", () => {
    // A pool where the day's target muscle groups have almost nothing —
    // narrowing must never leave the model with too few options.
    const thinPool: ExerciseCandidateSet = {
      candidates: [
        candidate({ id: "chest-1", primaryMuscleGroup: "chest" }),
        candidate({ id: "chest-2", primaryMuscleGroup: "chest" }),
        ...Array.from({ length: 40 }, (_, i) => candidate({ id: `other-${i}`, primaryMuscleGroup: "hamstrings" })),
      ],
      gaps: [],
    };
    const narrowed = narrowCandidatesForDay(thinPool, PUSH_DAY, []);
    expect(narrowed.length).toBeGreaterThanOrEqual(30);
  });
});

describe("inferMuscleGroupsFromDayText", () => {
  it("maps common split terminology to the expected muscle groups", () => {
    expect(inferMuscleGroupsFromDayText("Push Day", undefined)).toEqual(
      expect.arrayContaining(["chest", "front_deltoid", "lateral_deltoid", "triceps"]),
    );
    expect(inferMuscleGroupsFromDayText("Pull", undefined)).toEqual(
      expect.arrayContaining(["lats", "upper_back", "rear_deltoid", "biceps"]),
    );
    expect(inferMuscleGroupsFromDayText("Leg Day", undefined)).toEqual(
      expect.arrayContaining(["quadriceps", "hamstrings", "glutes", "calves"]),
    );
  });

  it("returns an empty array for text with no recognizable split terminology", () => {
    expect(inferMuscleGroupsFromDayText("Session C", undefined)).toEqual([]);
  });

  it("considers both label and focus", () => {
    expect(inferMuscleGroupsFromDayText("Day 3", "core and abs")).toEqual(
      expect.arrayContaining(["rectus_abdominis", "obliques"]),
    );
  });
});
