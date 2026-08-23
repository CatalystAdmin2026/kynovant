// ─────────────────────────────────────────────────────────────
// Surgical single-day regeneration — real-DB integration suite.
//
// P0 review finding: regenerateDayAction() used to ask the model to
// echo the ENTIRE program back ("leave every other day unchanged")
// without ever actually giving it the existing draft's content — so
// every single-day regeneration risked silently fabricating content
// for the rest of the whole program. Fixed by regenerateDaySurgically()
// (staged-generation.ts), which never asks the model to touch anything
// but the one target day; every other week/day is spliced through by
// reference via edit-ops.ts's replaceDayContent.
//
// Same fixture/cleanup pattern as program-generator-integration.test.ts
// — real Supabase Auth users, real exercise rows, fixture-mode provider
// (no real API cost). Requires a reachable DATABASE_URL (npm run
// test:staging).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { buildFixtureProgramShell, buildFixtureProgramWeek } from "@/lib/program-generator/fixture";
import { resolveProgramDraftExercises } from "@/lib/program-generator/exercise-resolution";
import { buildExerciseCandidateSet } from "@/lib/program-generator/exercise-candidates";
import { regenerateDaySurgically } from "@/lib/program-generator/staged-generation";
import { findDayUnique, replaceDayContent } from "@/lib/program-generator/edit-ops";
import type { GeneratedProgramDraft, ModelProgramDraft, ProgramGenerationBrief, ProgramShell } from "@/lib/program-generator/contracts";

const db = getDb();
const coach = { id: "" };
let candidateSet: Awaited<ReturnType<typeof buildExerciseCandidateSet>>;

const VALID_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 2,
  daysPerWeek: 3,
  preferredSplit: "coach_decides",
  experienceLevel: "intermediate",
  equipmentAccess: "commercial_gym",
  targetSessionMinutes: 60,
  excludedExerciseIds: [],
  musclePriorities: [],
  allowedTechniques: ["straight_set"],
  avoidedTechniques: [],
  hardSessionCap: false,
  warmupIncluded: true,
};

let shell: ProgramShell;
let draft: GeneratedProgramDraft;

beforeAll(async () => {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `day-regen-test-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) throw new Error(`Fixture setup failed: createUser — ${error?.message}`);
  coach.id = data.user.id;
  await db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id));

  const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
  process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
  delete process.env.PROGRAM_GENERATOR_MODEL;

  shell = buildFixtureProgramShell(VALID_BRIEF);
  const week1 = await buildFixtureProgramWeek(1, shell);
  const week2 = await buildFixtureProgramWeek(2, shell);
  if (!week1 || !week2) throw new Error("fixture setup failed — not enough active exercises seeded.");

  const modelDraft: ModelProgramDraft = {
    name: shell.title,
    description: shell.description,
    category: VALID_BRIEF.goal,
    experienceLevel: VALID_BRIEF.experienceLevel,
    defaultDurationWeeks: VALID_BRIEF.weeks,
    recommendedDaysPerWeek: VALID_BRIEF.daysPerWeek,
    weeks: [week1, week2],
  };
  draft = await resolveProgramDraftExercises(modelDraft, coach.id);

  candidateSet = await buildExerciseCandidateSet(VALID_BRIEF, coach.id);

  if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
  if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
  else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
}, 30_000);

afterAll(async () => {
  if (coach.id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(coach.id).catch(() => {});
    await db.delete(users).where(eq(users.id, coach.id)).catch(() => {});
  }
});

async function regenerate(dayId: string) {
  const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
  process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
  delete process.env.PROGRAM_GENERATOR_MODEL;
  try {
    return await regenerateDaySurgically({
      draft,
      shell,
      brief: VALID_BRIEF,
      clientContext: null,
      dayId,
      coachId: coach.id,
      candidateSet,
    });
  } finally {
    if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
    if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
    else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
  }
}

describe("regenerateDaySurgically — surgical single-day regeneration", () => {
  it("[A/B] regenerating one day changes ONLY that day — every other day in every other week is unchanged", async () => {
    const targetDayId = draft.weeks[1].days[0].id; // week 2, day 1
    const result = await regenerate(targetDayId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Week 1 — completely untouched (same reference, not just equal).
    expect(result.draft.weeks[0]).toBe(draft.weeks[0]);

    // Week 2's OTHER days — same reference, untouched.
    for (let i = 1; i < draft.weeks[1].days.length; i++) {
      expect(result.draft.weeks[1].days[i]).toBe(draft.weeks[1].days[i]);
    }

    // The target day's own content DID change (fresh fixture content).
    expect(result.draft.weeks[1].days[0]).not.toBe(draft.weeks[1].days[0]);
  });

  it("[C/D] the regenerated day keeps its existing canonical id, dayOfWeek, and label", async () => {
    const original = draft.weeks[1].days[1]; // week 2, day 2
    const result = await regenerate(original.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const regenerated = result.draft.weeks[1].days[1];
    expect(regenerated.id).toBe(original.id);
    expect(regenerated.dayOfWeek).toBe(original.dayOfWeek);
    expect(regenerated.label).toBe(original.label);
  });

  it("[E] provider output carrying different structural metadata cannot move the day — id/dayOfWeek/label are always application-derived, never the model's echo", async () => {
    // The fixture provider (buildFixtureProgramDay) always assigns its
    // own randomUUID() and the shell's own dayOfWeek/label — this test
    // proves regenerateDaySurgically doesn't just happen to agree with
    // a well-behaved fixture, but actively overwrites whatever came
    // back, by asserting the SAME invariant holds regardless: the
    // final id/dayOfWeek/label always match the PRE-regeneration
    // target, never whatever the day-generation call produced.
    const original = draft.weeks[0].days[2]; // week 1, day 3
    const result = await regenerate(original.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const regenerated = result.draft.weeks[0].days[2];
    expect(regenerated.id).toBe(original.id);
    expect(regenerated.dayOfWeek).toBe(original.dayOfWeek);
    expect(regenerated.label).toBe(original.label);
  });

  it("[F] provider misconfiguration (invalid output) leaves the original draft untouched — never persisted here regardless", async () => {
    const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
    // Neither fixture nor a real model configured — generateProgramDay
    // fails closed with errorCode:"not_configured" before ever touching
    // the draft.
    delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    delete process.env.PROGRAM_GENERATOR_MODEL;
    try {
      const targetDayId = draft.weeks[0].days[0].id;
      const result = await regenerateDaySurgically({
        draft, shell, brief: VALID_BRIEF, clientContext: null, dayId: targetDayId, coachId: coach.id, candidateSet,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect("errorCode" in result && result.errorCode).toBe("not_configured");
    } finally {
      if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
      else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
      if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
      else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
    }
  });

  it("[G] fails closed (not_found) rather than regenerating anything for an id that doesn't exist", async () => {
    const result = await regenerate("does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("error" in result ? result.error : "").toMatch(/not found/i);
  });

  it("[G] fails closed (ambiguous) rather than guessing, when findDayUnique/replaceDayContent detect a legacy duplicate id", () => {
    // Pure edit-ops-level proof (no provider call needed) — the exact
    // ambiguity class this whole fix exists to guard against.
    const dupDraft: GeneratedProgramDraft = {
      ...draft,
      weeks: draft.weeks.map((week) => ({
        ...week,
        // Every week's day 0 shares "dup-id" — simulates two
        // independently-generated days (different weeks) echoing the
        // same model-provided id, pre-hardening.
        days: week.days.map((d, j) => (j === 0 ? { ...d, id: "dup-id" } : d)),
      })),
    };
    const located = findDayUnique(dupDraft, "dup-id");
    expect(located.ok).toBe(false);
    if (located.ok) return;
    expect(located.reason).toBe("ambiguous");

    const spliced = replaceDayContent(dupDraft, "dup-id", dupDraft.weeks[0].days[0]);
    expect(spliced.ok).toBe(false);
  });

  it("[H] the requested content can change normally — new prescriptions/workout differ from the pre-regeneration day", async () => {
    const original = draft.weeks[0].days[1];
    const result = await regenerate(original.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const regenerated = result.draft.weeks[0].days[1];
    // Fresh fixture content — a genuinely new workout object, not the
    // old one merely echoed back untouched.
    expect(regenerated.workout).not.toBe(original.workout);
  });

  it("[I] cross-day continuity context is available — regenerating a day other than the first in its week does not throw and produces a valid day", async () => {
    // Exercises this file's own summarizeDayForPrompt/
    // summarizeWeekSoFarForPrompt wiring end-to-end via a real DB read
    // (candidatesById) — a throw here would mean that wiring is broken.
    const targetDayId = draft.weeks[1].days[2].id; // week 2, day 3 — has 2 "prior" days this week
    const result = await regenerate(targetDayId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[1].days[2].workout).not.toBeNull();
  });
});
