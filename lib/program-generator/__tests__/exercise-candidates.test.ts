// ─────────────────────────────────────────────────────────────
// Exercise Candidate Selection — real-DB test suite
//
// Requires a reachable DATABASE_URL — vitest.config.ts loads .env.local
// automatically. Mirrors the fixture/cleanup pattern established by
// coach-tenant-isolation.test.ts: real Supabase Auth users, real
// exercise rows (including two temporary fixture rows this suite
// inserts and cleans up itself to prove tenant-visibility rules).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "@/lib/db/schema";
import { exercises } from "@/lib/db/schema-exercise";
import {
  buildExerciseCandidateSet,
  verifyWeekAgainstCandidates,
  verifyProgramDraftAgainstCandidates,
  selectCandidatesFromPool,
  type ExerciseCandidate,
} from "../exercise-candidates";
import { buildWeekGenerationPrompt } from "../prompt";
import type { ProgramGenerationBrief, ModelWeekDraft, ModelProgramDraft } from "../contracts";
import type { MuscleGroup } from "@/lib/db/schema-exercise";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const exerciseFixtureIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `candidate-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

const BASE_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 4,
  daysPerWeek: 3,
  preferredSplit: "coach_decides",
  experienceLevel: "intermediate",
  equipmentAccess: "commercial_gym",
  targetSessionMinutes: 60,
  excludedExerciseIds: [],
  allowedTechniques: ["straight_set"],
  avoidedTechniques: [],
  hardSessionCap: false,
  warmupIncluded: true,
  musclePriorities: [],
};

beforeAll(async () => {
  [coachA.id, coachB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
  ]);
});

afterAll(async () => {
  if (exerciseFixtureIds.length > 0) {
    await db.delete(exercises).where(inArray(exercises.id, exerciseFixtureIds));
  }
  const userIds = [coachA.id, coachB.id].filter(Boolean);
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const adminClient = createAdminClient();
    await Promise.all(userIds.map((id) => adminClient.auth.admin.deleteUser(id)));
  }
});

function buildWeekWithPrescription(prescription: { exerciseId?: string; exerciseName: string }): ModelWeekDraft {
  return {
    id: randomUUID(),
    weekNumber: 1,
    days: [
      {
        id: randomUUID(),
        dayOfWeek: 1,
        workout: {
          id: randomUUID(),
          name: "Test Day",
          sections: [
            {
              id: randomUUID(),
              name: "Main",
              sectionType: "main_lift",
              orderIndex: 0,
              prescriptions: [{ id: randomUUID(), orderIndex: 0, isRequired: true, ...prescription }],
            },
          ],
        },
      },
    ],
  };
}

describe("buildExerciseCandidateSet — filtering", () => {
  it("respects equipment: a bodyweight-only brief never includes a non-bodyweight resistance type", async () => {
    const { candidates } = await buildExerciseCandidateSet(
      { ...BASE_BRIEF, equipmentAccess: "bodyweight" },
      coachA.id,
    );
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.resistanceType === null || c.resistanceType === "bodyweight").toBe(true);
    }
  });

  it("respects exclusions: an excluded exercise never appears in the candidate set", async () => {
    const { candidates: baseline } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    expect(baseline.length).toBeGreaterThan(0);
    const toExclude = baseline[0].id;

    const { candidates: withExclusion } = await buildExerciseCandidateSet(
      { ...BASE_BRIEF, excludedExerciseIds: [toExclude] },
      coachA.id,
    );
    expect(withExclusion.some((c) => c.id === toExclude)).toBe(false);
  });

  it("excludes another coach's private (coach-scope) exercise", async () => {
    const [row] = await db
      .insert(exercises)
      .values({
        slug: `candidate-test-private-${randomUUID()}`,
        name: `Candidate Test Private ${randomUUID().slice(0, 8)}`,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        scope: "coach",
        createdBy: coachB.id,
        primaryMuscleGroup: "chest",
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(row.id);

    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    expect(candidates.some((c) => c.id === row.id)).toBe(false);
  });

  it("includes the requesting coach's own private (coach-scope) exercise", async () => {
    const [row] = await db
      .insert(exercises)
      .values({
        slug: `candidate-test-own-${randomUUID()}`,
        name: `Candidate Test Own ${randomUUID().slice(0, 8)}`,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        scope: "coach",
        createdBy: coachA.id,
        primaryMuscleGroup: "chest",
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(row.id);

    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    expect(candidates.some((c) => c.id === row.id)).toBe(true);
  });

  it("includes a system-scope (shared) exercise for any coach", async () => {
    const [row] = await db
      .insert(exercises)
      .values({
        slug: `candidate-test-system-${randomUUID()}`,
        name: `Candidate Test System ${randomUUID().slice(0, 8)}`,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        scope: "system",
        primaryMuscleGroup: "chest",
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(row.id);

    const [forCoachA, forCoachB] = await Promise.all([
      buildExerciseCandidateSet(BASE_BRIEF, coachA.id),
      buildExerciseCandidateSet(BASE_BRIEF, coachB.id),
    ]);
    expect(forCoachA.candidates.some((c) => c.id === row.id)).toBe(true);
    expect(forCoachB.candidates.some((c) => c.id === row.id)).toBe(true);
  });

  it("is bounded — never exceeds the deterministic upper limit even with broad muscle-priority coverage", async () => {
    const { candidates } = await buildExerciseCandidateSet(
      { ...BASE_BRIEF, musclePriorities: ["chest", "lats", "quadriceps", "hamstrings"] },
      coachA.id,
    );
    expect(candidates.length).toBeLessThanOrEqual(150);
  });

  it("provides warmup/mobility coverage when the library has it, or flags a catalog gap when it doesn't", async () => {
    const { candidates, gaps } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const mobilityCandidates = candidates.filter((c) => c.isMobility);
    if (mobilityCandidates.length === 0) {
      expect(gaps.some((g) => g.category === "warmup/mobility")).toBe(true);
    } else {
      expect(mobilityCandidates.length).toBeGreaterThan(0);
      expect(gaps.some((g) => g.category === "warmup/mobility")).toBe(false);
    }
  });

  // Injuries/limitations are freeform coach text (no structured injury-
  // to-contraindication mapping exists in this MVP — see
  // client-context.ts's own documented decision on the same point).
  // Rather than pretending to hard-filter on unstructured text (which
  // would risk silently and incorrectly excluding or including
  // exercises), the candidate set carries structured joint-stress data
  // per exercise and the brief's freeform text is passed to the model
  // directly, so it can apply judgment against real data. This test
  // proves that wiring, not a nonexistent hard filter.
  it("passes brief limitations/movementRestrictions text into the week-generation prompt for model judgment (not a hard filter)", async () => {
    const brief: ProgramGenerationBrief = {
      ...BASE_BRIEF,
      limitations: "Avoid overhead pressing due to a prior shoulder injury.",
      movementRestrictions: "No deep knee flexion.",
    };
    const { candidates } = await buildExerciseCandidateSet(brief, coachA.id);
    const shell = {
      title: "t",
      description: "d",
      totalWeeks: brief.weeks,
      days: [{ dayOfWeek: 1, label: "Day 1" }],
      phases: [{ phaseNumber: 1, name: "p", weekStart: 1, weekEnd: brief.weeks, progressionTarget: "x", isDeload: false }],
      globalConstraints: "",
    };
    const prompt = buildWeekGenerationPrompt(brief, null, shell, 1, null, candidates);
    expect(prompt).toContain("Avoid overhead pressing due to a prior shoulder injury.");
    expect(prompt).toContain("No deep knee flexion.");
  });
});

describe("verifyWeekAgainstCandidates — never trust an id merely because it's present", () => {
  it("rejects (strips) an exerciseId that is not in the supplied candidate set", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const week = buildWeekWithPrescription({ exerciseId: randomUUID(), exerciseName: "Whatever Exercise" });

    const { result, rejectedCount } = verifyWeekAgainstCandidates(week, candidates);
    expect(rejectedCount).toBe(1);
    expect(result.days[0].workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
    // Name is preserved for the resolver fallback.
    expect(result.days[0].workout!.sections[0].prescriptions[0].exerciseName).toBe("Whatever Exercise");
  });

  it("rejects an id/name mismatch even when the id IS a real candidate", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    expect(candidates.length).toBeGreaterThan(0);
    const real = candidates[0];

    const week = buildWeekWithPrescription({ exerciseId: real.id, exerciseName: "Definitely Not The Real Name XYZ" });
    const { result, rejectedCount } = verifyWeekAgainstCandidates(week, candidates);
    expect(rejectedCount).toBe(1);
    expect(result.days[0].workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
  });

  it("accepts a verified id/name pair drawn from the candidate set", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const real = candidates[0];

    const week = buildWeekWithPrescription({ exerciseId: real.id, exerciseName: real.name });
    const { result, rejectedCount } = verifyWeekAgainstCandidates(week, candidates);
    expect(rejectedCount).toBe(0);
    expect(result.days[0].workout!.sections[0].prescriptions[0].exerciseId).toBe(real.id);
  });

  it("accepts a verified id paired with one of the candidate's alternate names", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const withAlt = candidates.find((c: ExerciseCandidate) => c.alternateNames.length > 0);
    if (!withAlt) {
      console.warn("No candidate with alternateNames found in seed data — alternate-name verification not exercised.");
      return;
    }
    const week = buildWeekWithPrescription({ exerciseId: withAlt.id, exerciseName: withAlt.alternateNames[0] });
    const { result, rejectedCount } = verifyWeekAgainstCandidates(week, candidates);
    expect(rejectedCount).toBe(0);
    expect(result.days[0].workout!.sections[0].prescriptions[0].exerciseId).toBe(withAlt.id);
  });
});

// regenerate-day (app/hq/programs/generate/actions.ts's regenerateDayAction)
// calls buildExerciseCandidateSet() and verifyProgramDraftAgainstCandidates()
// — the exact same functions staged generation uses for the shell/week
// path above — rather than a second, parallel implementation. These
// tests exercise verifyProgramDraftAgainstCandidates() (the
// ModelProgramDraft-shaped variant regenerate-day's provider call
// returns) directly, proving "the same catalog rules" without needing
// to invoke the Server Action itself (which requires a real Next.js
// request context for cookies()/headers() and can't run under vitest).
describe("verifyProgramDraftAgainstCandidates — same rules, regenerate-day's shape", () => {
  function buildProgramDraftWithPrescription(prescription: { exerciseId?: string; exerciseName: string }): ModelProgramDraft {
    return {
      name: "Regen Test",
      category: "muscle_growth",
      experienceLevel: "intermediate",
      defaultDurationWeeks: 1,
      recommendedDaysPerWeek: 1,
      weeks: [buildWeekWithPrescription(prescription)],
    };
  }

  it("rejects an off-catalog id identically to the per-week path", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const draft = buildProgramDraftWithPrescription({ exerciseId: randomUUID(), exerciseName: "Whatever Exercise" });
    const { result, rejectedCount } = verifyProgramDraftAgainstCandidates(draft, candidates);
    expect(rejectedCount).toBe(1);
    expect(result.weeks[0].days[0].workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
  });

  it("accepts a verified candidate id identically to the per-week path", async () => {
    const { candidates } = await buildExerciseCandidateSet(BASE_BRIEF, coachA.id);
    const real = candidates[0];
    const draft = buildProgramDraftWithPrescription({ exerciseId: real.id, exerciseName: real.name });
    const { result, rejectedCount } = verifyProgramDraftAgainstCandidates(draft, candidates);
    expect(rejectedCount).toBe(0);
    expect(result.weeks[0].days[0].workout!.sections[0].prescriptions[0].exerciseId).toBe(real.id);
  });

  it("applies the same equipment filter as staged generation's candidate set", async () => {
    const { candidates: bodyweightOnly } = await buildExerciseCandidateSet(
      { ...BASE_BRIEF, equipmentAccess: "bodyweight" },
      coachA.id,
    );
    for (const c of bodyweightOnly) {
      expect(c.resistanceType === null || c.resistanceType === "bodyweight").toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// selectCandidatesFromPool — global-cap fairness (real-library defect,
// found once the Exercise Library grew to ~647 rows post Seed 011)
//
// Pure, synchronous, in-memory — no DB — so a synthetic pool large
// enough to actually exceed TARGET_MAX_CANDIDATES (150) can be built
// directly, deterministically, without inserting 150+ real rows into
// the shared database. buildExerciseCandidateSet's own DB query,
// tenant filter, equipment filter, and exclusions all run BEFORE this
// function and are untouched by anything below — these tests only
// exercise the selection/capping algorithm itself.
//
// THE PROVEN DEFECT (previous implementation): every per-category
// bucket (per muscle group, mobility, cardio) was independently capped
// and merged into one Map, then the GLOBAL cap was applied by sorting
// the entire merged set by classification-then-name and slicing the
// first 150 — a truncation blind to category boundaries. Coverage gaps
// were (and still are) computed from each bucket's PRE-global-cap match
// count, so a category with real matches that got entirely sliced away
// by the global cap produced no gap warning: a silent, complete drop of
// a required category purely because other categories' candidates
// happened to sort earlier.
// ─────────────────────────────────────────────────────────────

let candidateCounter = 0;
function makeCandidate(overrides: Partial<ExerciseCandidate> & { primaryMuscleGroup: MuscleGroup | null }): ExerciseCandidate {
  candidateCounter++;
  return {
    id: `synthetic-${candidateCounter}-${randomUUID()}`,
    name: `Synthetic Candidate ${candidateCounter}`,
    alternateNames: [],
    secondaryMuscleGroups: [],
    movementPattern: "push_horizontal",
    classification: "compound",
    resistanceType: null,
    difficulty: "beginner",
    isCardio: false,
    isMobility: false,
    highJointStress: [],
    defaultPrescription: null,
    ...overrides,
  };
}

// All 14 groups selectCandidatesFromPool always targets (mirrors
// CORE_MUSCLE_GROUPS in exercise-candidates.ts — not exported, so
// listed here; any drift would show up as an unexpected gap in the
// "no muscle-group gaps" assertion below, which would catch it).
const ALL_CORE_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest", "lats", "upper_back", "front_deltoid", "lateral_deltoid", "rear_deltoid",
  "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves",
  "rectus_abdominis", "obliques",
];

describe("selectCandidatesFromPool — global cap no longer silently drops a whole category", () => {
  it("guarantees at least one survivor for every category with real matches, even when supply exceeds the global cap and that category's own candidates would sort last", () => {
    // 13 muscle groups at their full per-category cap (12), all
    // "compound" classification (sorts FIRST) — 156 candidates, already
    // over TARGET_MAX_CANDIDATES(150) on its own.
    const heavyGroups = ALL_CORE_MUSCLE_GROUPS.slice(0, 13);
    const starvedGroup = ALL_CORE_MUSCLE_GROUPS[13]; // "obliques"

    const pool: ExerciseCandidate[] = [];
    for (const mg of heavyGroups) {
      for (let i = 0; i < 12; i++) {
        pool.push(makeCandidate({ primaryMuscleGroup: mg, classification: "compound" }));
      }
    }
    // The starved category: only 3 real matches, but "isolation"
    // classification — under the OLD flat classification-then-name
    // sort, EVERY "compound" candidate above sorts before ALL THREE of
    // these, so with 156 compound candidates already exceeding the 150
    // cap, a flat slice(0, 150) would keep zero of them.
    for (let i = 0; i < 3; i++) {
      pool.push(makeCandidate({ primaryMuscleGroup: starvedGroup, classification: "isolation" }));
    }
    expect(pool.length).toBe(159); // 156 + 3, safely over the 150 cap

    const { candidates, gaps } = selectCandidatesFromPool(pool, []);

    // Global cap is still enforced exactly.
    expect(candidates.length).toBe(150);

    // THE FIX: the starved category is not silently zeroed out.
    const starvedSurvivors = candidates.filter((c) => c.primaryMuscleGroup === starvedGroup);
    expect(starvedSurvivors.length).toBeGreaterThanOrEqual(1);

    // Every one of the 14 core muscle groups had at least one real
    // match in this synthetic pool, so there must be no muscle-group
    // gap at all — including no gap for the starved category (it DID
    // have matches; it was merely at risk of losing all of them to the
    // global cap, which is exactly what this test proves no longer
    // happens).
    const muscleGroupGaps = gaps.filter((g) => (ALL_CORE_MUSCLE_GROUPS as string[]).includes(g.category));
    expect(muscleGroupGaps).toEqual([]);

    // Deterministic output ordering is unaffected by the fix — still
    // classification-then-name.
    for (let i = 1; i < candidates.length; i++) {
      const rank = (c: ExerciseCandidate) =>
        c.classification === "compound" ? 0 : c.classification === "power" ? 1 : c.classification === "skill" ? 2 : 3;
      const prevRank = rank(candidates[i - 1]);
      const curRank = rank(candidates[i]);
      expect(prevRank <= curRank).toBe(true);
    }
  });

  it("is deterministic: the same oversized pool produces the identical candidate id set and order on repeated calls", () => {
    const pool: ExerciseCandidate[] = [];
    for (const mg of ALL_CORE_MUSCLE_GROUPS) {
      for (let i = 0; i < 12; i++) {
        pool.push(makeCandidate({ primaryMuscleGroup: mg, classification: i % 2 === 0 ? "compound" : "isolation" }));
      }
    }
    expect(pool.length).toBe(168); // 14 * 12, over the 150 cap

    const first = selectCandidatesFromPool(pool, []);
    const second = selectCandidatesFromPool(pool, []);
    expect(second.candidates.map((c) => c.id)).toEqual(first.candidates.map((c) => c.id));
    expect(second.gaps).toEqual(first.gaps);
  });

  it("under uniform oversupply (every category equally over cap), round-robin still gives every category fair representation, not just the first ones processed", () => {
    const pool: ExerciseCandidate[] = [];
    for (const mg of ALL_CORE_MUSCLE_GROUPS) {
      for (let i = 0; i < 12; i++) {
        pool.push(makeCandidate({ primaryMuscleGroup: mg, classification: "compound" }));
      }
    }
    expect(pool.length).toBe(168);

    const { candidates } = selectCandidatesFromPool(pool, []);
    expect(candidates.length).toBe(150);

    const countByGroup = new Map<string, number>();
    for (const c of candidates) {
      if (!c.primaryMuscleGroup) continue;
      countByGroup.set(c.primaryMuscleGroup, (countByGroup.get(c.primaryMuscleGroup) ?? 0) + 1);
    }
    // 150 / 14 groups = ~10-11 each — every group must survive with a
    // near-even share, not "first 12 groups get their full 12, last 2
    // groups get nothing" (what a naive flat-slice would tend toward
    // when every candidate shares the same classification, since ties
    // then fall to a global name sort with no category awareness).
    expect(countByGroup.size).toBe(14);
    for (const count of countByGroup.values()) {
      expect(count).toBeGreaterThanOrEqual(10);
    }
  });

  it("preserves per-category caps: a non-priority group never contributes more than 12, a priority group never more than 16", () => {
    const pool: ExerciseCandidate[] = [];
    for (let i = 0; i < 20; i++) {
      pool.push(makeCandidate({ primaryMuscleGroup: "chest", classification: "compound" }));
      pool.push(makeCandidate({ primaryMuscleGroup: "lats", classification: "compound" }));
    }

    const { candidates } = selectCandidatesFromPool(pool, ["lats"]);
    const chestCount = candidates.filter((c) => c.primaryMuscleGroup === "chest").length;
    const latsCount = candidates.filter((c) => c.primaryMuscleGroup === "lats").length;
    expect(chestCount).toBe(12); // non-priority cap
    expect(latsCount).toBe(16); // priority cap — unchanged by this fix
  });

  it("regression: when total real matches are within the global cap, every match survives (identical to pre-fix behavior) — most briefs never approach 150", () => {
    const pool: ExerciseCandidate[] = [
      makeCandidate({ primaryMuscleGroup: "chest" }),
      makeCandidate({ primaryMuscleGroup: "chest" }),
      makeCandidate({ primaryMuscleGroup: "lats" }),
      makeCandidate({ primaryMuscleGroup: null, isMobility: true }),
      makeCandidate({ primaryMuscleGroup: null, isCardio: true }),
    ];
    const { candidates } = selectCandidatesFromPool(pool, []);
    expect(candidates.length).toBe(pool.length);
    expect(new Set(candidates.map((c) => c.id))).toEqual(new Set(pool.map((c) => c.id)));
  });

  it("still reports a real gap for a core muscle group with zero matches, even in an oversized pool", () => {
    const pool: ExerciseCandidate[] = [];
    // Every core group except "glutes" gets matches; "glutes" gets none.
    for (const mg of ALL_CORE_MUSCLE_GROUPS) {
      if (mg === "glutes") continue;
      for (let i = 0; i < 12; i++) {
        pool.push(makeCandidate({ primaryMuscleGroup: mg, classification: "compound" }));
      }
    }

    const { gaps } = selectCandidatesFromPool(pool, []);
    expect(gaps.some((g) => g.category === "glutes")).toBe(true);
  });
});
