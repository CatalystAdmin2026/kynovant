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

  // Review finding on the day-level architecture v1: musclePriorities
  // used to be unioned into EVERY day regardless of relevance. Fixed —
  // a priority muscle now only widens the cap on a day that's already
  // one of that muscle's own target groups; it's no longer injected
  // into an unrelated day. See exercise-candidates.ts's own comment.
  it("does NOT leak an unrelated priority muscle into a day that doesn't target it", () => {
    const pool = buildPool();
    const narrowed = narrowCandidatesForDay(pool, PUSH_DAY, ["quadriceps"]);
    expect(narrowed.some((c) => c.primaryMuscleGroup === "quadriceps")).toBe(false);
  });

  it("widens the cap (not the group set) for a priority muscle that IS one of this day's own targets", () => {
    // buildPool()'s default 8-per-group is under the 10-candidate
    // default cap — needs a deeper chest pool to observe the cap
    // actually binding (and widening) in the first place.
    const base = buildPool();
    const deepChestPool: typeof base = {
      ...base,
      candidates: [
        ...base.candidates.filter((c) => c.primaryMuscleGroup !== "chest"),
        ...Array.from({ length: 20 }, (_, i) => candidate({ id: `chest-deep-${i}`, primaryMuscleGroup: "chest" })),
      ],
    };
    const withoutPriority = narrowCandidatesForDay(deepChestPool, PUSH_DAY, []);
    const withPriority = narrowCandidatesForDay(deepChestPool, PUSH_DAY, ["chest"]);
    const chestCountWithout = withoutPriority.filter((c) => c.primaryMuscleGroup === "chest").length;
    const chestCountWith = withPriority.filter((c) => c.primaryMuscleGroup === "chest").length;
    expect(chestCountWith).toBeGreaterThan(chestCountWithout);
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

// Review finding on the day-level architecture v1: primary-muscle-only
// filtering made a legitimate secondary-muscle exercise (e.g. an RDL —
// primary hamstrings, secondary glutes) invisible to a day whose focus
// is the SECONDARY muscle. Fixed — see exercise-candidates.ts's comment.
describe("narrowCandidatesForDay — secondary-muscle relevance", () => {
  const GLUTE_DAY: ProgramShellDay = { dayOfWeek: 1, label: "Glutes", targetMuscleGroups: ["glutes"] };

  it("includes an exercise whose SECONDARY (not primary) muscle matches the day's target", () => {
    const rdl = candidate({ id: "rdl-1", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: ["glutes"] });
    const pool: ExerciseCandidateSet = { candidates: [rdl], gaps: [] };
    const narrowed = narrowCandidatesForDay(pool, GLUTE_DAY, []);
    expect(narrowed.some((c) => c.id === "rdl-1")).toBe(true);
  });

  it("still excludes an exercise with no primary or secondary relevance to the day", () => {
    // Enough genuinely relevant candidates to clear the safety floor on
    // their own, so an irrelevant exercise isn't pulled in by top-up —
    // that's the floor's job (tested separately), not this check's.
    const relevant = Array.from({ length: 35 }, (_, i) => candidate({ id: `glute-${i}`, primaryMuscleGroup: "glutes" }));
    const curl = candidate({ id: "curl-1", name: "Bicep Curl", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [] });
    const pool: ExerciseCandidateSet = { candidates: [...relevant, curl], gaps: [] };
    const narrowed = narrowCandidatesForDay(pool, GLUTE_DAY, []);
    expect(narrowed.some((c) => c.id === "curl-1")).toBe(false);
  });
});

// Review finding: a "Mobility"/"Conditioning" day isn't served by
// muscle-group narrowing at all (isMobility/isCardio are a different
// axis) — it used to fall through to the "unclassifiable -> full pool"
// branch. Fixed with explicit day-type detection.
describe("narrowCandidatesForDay — mobility/conditioning day type", () => {
  function typedPool(): ExerciseCandidateSet {
    const candidates: ExerciseCandidate[] = [
      ...Array.from({ length: 20 }, (_, i) => candidate({ id: `mob-${i}`, isMobility: true })),
      ...Array.from({ length: 20 }, (_, i) => candidate({ id: `car-${i}`, isCardio: true })),
      ...Array.from({ length: 20 }, (_, i) => candidate({ id: `chest-${i}`, primaryMuscleGroup: "chest" })),
    ];
    return { candidates, gaps: [] };
  }

  it("a Mobility day is narrowed to mostly mobility candidates, not the full pool", () => {
    const day: ProgramShellDay = { dayOfWeek: 1, label: "Mobility & Recovery" };
    const narrowed = narrowCandidatesForDay(typedPool(), day, []);
    const mobilityShare = narrowed.filter((c) => c.isMobility).length / narrowed.length;
    expect(mobilityShare).toBeGreaterThan(0.5);
    expect(narrowed.length).toBeLessThan(typedPool().candidates.length);
  });

  it("a Conditioning day is narrowed to mostly cardio candidates", () => {
    const day: ProgramShellDay = { dayOfWeek: 1, label: "Conditioning" };
    const narrowed = narrowCandidatesForDay(typedPool(), day, []);
    const cardioShare = narrowed.filter((c) => c.isCardio).length / narrowed.length;
    expect(cardioShare).toBeGreaterThan(0.5);
  });

  it("day-type detection takes priority over muscle-keyword detection when both could match", () => {
    // "Recovery" alone isn't a muscle keyword, so this also proves the
    // day-type path is reached rather than falling through to
    // "unclassifiable -> full pool".
    const day: ProgramShellDay = { dayOfWeek: 1, label: "Recovery" };
    const narrowed = narrowCandidatesForDay(typedPool(), day, []);
    expect(narrowed.length).toBeLessThan(typedPool().candidates.length);
  });
});
