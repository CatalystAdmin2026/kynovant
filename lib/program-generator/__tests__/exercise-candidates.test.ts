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
  type ExerciseCandidate,
} from "../exercise-candidates";
import { buildWeekGenerationPrompt } from "../prompt";
import type { ProgramGenerationBrief, ModelWeekDraft, ModelProgramDraft } from "../contracts";

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
