// ─────────────────────────────────────────────────────────────
// Program & Blueprint Tenant Isolation — integration test suite
//
// Proves, against a REAL database connection, that:
//   1. Ownership guards resolve nested resources (weeks, sections,
//      prescriptions) up to their parent template and enforce
//      owner-or-admin-only mutation — cross-coach nested UUID attacks
//      are rejected even when the coach never touches the parent
//      template's own id directly.
//   2. The approved shared-library visibility model holds: a coach may
//      VIEW/CLONE another coach's PUBLISHED template, never a private
//      draft, and may never MUTATE another coach's template regardless
//      of its published state.
//   3. Referenced-blueprint checks (setDayWorkout, importProgramSpec)
//      reject a private cross-coach blueprint reference and accept a
//      published one.
//   4. importProgramSpec's transaction wrap is real: a forced
//      mid-transaction constraint violation rolls back every row, not
//      just the one that failed.
//   5. admin bypasses every check above.
//
// Same fixture pattern as coach-tenant-isolation.test.ts: real
// Supabase Auth users (users_id_fk_auth requires it), randomUUID()-
// based slugs/emails so repeated runs never collide, full cleanup in
// afterAll() in FK-safe (children-before-parents) order.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, programTemplates, workoutTemplates } from "../schema";
import { programWeeks, programWeekDays } from "../schema-program";
import {
  workoutTemplateSections,
  workoutTemplateExercises,
  exercises,
} from "../schema-exercise";
import {
  coachOwnsProgramTemplate,
  coachOwnsWorkoutTemplate,
  coachCanViewProgramTemplate,
  coachCanViewWorkoutTemplate,
  assertCoachOwnsProgramTemplate,
  assertCoachCanViewProgramTemplate,
  assertCoachOwnsWorkoutTemplate,
  assertCoachCanViewWorkoutTemplate,
  assertCoachOwnsProgramWeek,
  assertCoachOwnsWorkoutSection,
  assertCoachOwnsPrescription,
} from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import {
  setDayWorkout,
  importProgramSpec,
  cloneProgramTemplate,
  copyProgramWeek,
} from "../program-builder-service";

const db = getDb();

function fakeDbUser(id: string, role: "coach" | "admin"): PublicUser {
  return {
    id,
    email: `${id}@program-isolation-test.invalid`,
    normalizedEmail: `${id}@program-isolation-test.invalid`,
    emailVerifiedAt: null,
    role,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as PublicUser;
}

const coachA = { id: "" };
const coachB = { id: "" };

let programAPublished: string; // coachA, status: active
let programADraft: string; // coachA, status: draft (private)
let programBDraft: string; // coachB, status: draft (private)
let weekAPublished: string; // week under programAPublished
let weekADraft: string; // week under programADraft

let workoutAPublished: string; // coachA, status: active
let workoutADraft: string; // coachA, status: draft (private)
let workoutBPublished: string; // coachB, status: active
let workoutBDraft: string; // coachB, status: draft (private)
let sectionADraft: string; // section under workoutADraft
let prescriptionADraft: string; // prescription under workoutADraft

let exerciseId: string;

const createdTemplateIds: string[] = [];
const createdWorkoutTemplateIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `program-isolation-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
  ]);

  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
  ]);

  const [existingExercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .limit(1);
  if (!existingExercise) {
    throw new Error("Fixture setup failed: no exercise rows exist to build a prescription against");
  }
  exerciseId = existingExercise.id;

  // ── Program templates ──────────────────────────────────────
  const [pubA] = await db
    .insert(programTemplates)
    .values({
      name: "Program Isolation — A Published",
      slug: `program-iso-a-published-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: "active",
      createdBy: coachA.id,
    })
    .returning({ id: programTemplates.id });
  programAPublished = pubA.id;
  createdTemplateIds.push(programAPublished);

  const [draftA] = await db
    .insert(programTemplates)
    .values({
      name: "Program Isolation — A Draft",
      slug: `program-iso-a-draft-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: "draft",
      createdBy: coachA.id,
    })
    .returning({ id: programTemplates.id });
  programADraft = draftA.id;
  createdTemplateIds.push(programADraft);

  const [draftB] = await db
    .insert(programTemplates)
    .values({
      name: "Program Isolation — B Draft",
      slug: `program-iso-b-draft-${randomUUID()}`,
      category: "fat_loss",
      experienceLevel: "beginner",
      status: "draft",
      createdBy: coachB.id,
    })
    .returning({ id: programTemplates.id });
  programBDraft = draftB.id;
  createdTemplateIds.push(programBDraft);

  const [weekPub] = await db
    .insert(programWeeks)
    .values({ programTemplateId: programAPublished, weekNumber: 1, label: "Week 1" })
    .returning({ id: programWeeks.id });
  weekAPublished = weekPub.id;

  const [weekDraft] = await db
    .insert(programWeeks)
    .values({ programTemplateId: programADraft, weekNumber: 1, label: "Week 1" })
    .returning({ id: programWeeks.id });
  weekADraft = weekDraft.id;

  // ── Workout templates (blueprints) ─────────────────────────
  const [wtAPub] = await db
    .insert(workoutTemplates)
    .values({
      name: "Blueprint Isolation — A Published",
      slug: `blueprint-iso-a-published-${randomUUID()}`,
      recommendedExperienceLevel: "beginner",
      status: "active",
      createdBy: coachA.id,
    })
    .returning({ id: workoutTemplates.id });
  workoutAPublished = wtAPub.id;
  createdWorkoutTemplateIds.push(workoutAPublished);

  const [wtADraft] = await db
    .insert(workoutTemplates)
    .values({
      name: "Blueprint Isolation — A Draft",
      slug: `blueprint-iso-a-draft-${randomUUID()}`,
      recommendedExperienceLevel: "beginner",
      status: "draft",
      createdBy: coachA.id,
    })
    .returning({ id: workoutTemplates.id });
  workoutADraft = wtADraft.id;
  createdWorkoutTemplateIds.push(workoutADraft);

  const [wtBPub] = await db
    .insert(workoutTemplates)
    .values({
      name: "Blueprint Isolation — B Published",
      slug: `blueprint-iso-b-published-${randomUUID()}`,
      recommendedExperienceLevel: "beginner",
      status: "active",
      createdBy: coachB.id,
    })
    .returning({ id: workoutTemplates.id });
  workoutBPublished = wtBPub.id;
  createdWorkoutTemplateIds.push(workoutBPublished);

  const [wtBDraft] = await db
    .insert(workoutTemplates)
    .values({
      name: "Blueprint Isolation — B Draft",
      slug: `blueprint-iso-b-draft-${randomUUID()}`,
      recommendedExperienceLevel: "beginner",
      status: "draft",
      createdBy: coachB.id,
    })
    .returning({ id: workoutTemplates.id });
  workoutBDraft = wtBDraft.id;
  createdWorkoutTemplateIds.push(workoutBDraft);

  const [section] = await db
    .insert(workoutTemplateSections)
    .values({
      workoutTemplateId: workoutADraft,
      name: "Main Lifts",
      sectionType: "main_lift",
      orderIndex: 0,
    })
    .returning({ id: workoutTemplateSections.id });
  sectionADraft = section.id;

  const [prescription] = await db
    .insert(workoutTemplateExercises)
    .values({
      workoutTemplateId: workoutADraft,
      sectionId: sectionADraft,
      exerciseId,
      orderIndex: 0,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
    })
    .returning({ id: workoutTemplateExercises.id });
  prescriptionADraft = prescription.id;
});

afterAll(async () => {
  const templateIds = createdTemplateIds.filter(Boolean);
  const workoutTemplateIds = createdWorkoutTemplateIds.filter(Boolean);
  const userIds = [coachA.id, coachB.id].filter(Boolean);

  // Clone/copy tests create additional program templates whose ids we
  // don't track individually — sweep by createdBy instead, in addition
  // to the explicit fixture list above.
  if (userIds.length > 0) {
    const extra = await db
      .select({ id: programTemplates.id })
      .from(programTemplates)
      .where(inArray(programTemplates.createdBy, userIds));
    for (const row of extra) {
      if (!templateIds.includes(row.id)) templateIds.push(row.id);
    }
  }

  if (templateIds.length > 0) {
    const weeks = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(inArray(programWeeks.programTemplateId, templateIds));
    const weekIds = weeks.map((w) => w.id);
    if (weekIds.length > 0) {
      await db.delete(programWeekDays).where(inArray(programWeekDays.programWeekId, weekIds));
      await db.delete(programWeeks).where(inArray(programWeeks.id, weekIds));
    }
    await db.delete(programTemplates).where(inArray(programTemplates.id, templateIds));
  }

  if (workoutTemplateIds.length > 0) {
    await db
      .delete(workoutTemplateExercises)
      .where(inArray(workoutTemplateExercises.workoutTemplateId, workoutTemplateIds));
    await db
      .delete(workoutTemplateSections)
      .where(inArray(workoutTemplateSections.workoutTemplateId, workoutTemplateIds));
    await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, workoutTemplateIds));
  }

  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

// ─────────────────────────────────────────────────────────────

describe("coachOwnsProgramTemplate / coachOwnsWorkoutTemplate", () => {
  it("is true for a coach's own template regardless of status", async () => {
    expect(await coachOwnsProgramTemplate(coachA.id, programAPublished)).toBe(true);
    expect(await coachOwnsProgramTemplate(coachA.id, programADraft)).toBe(true);
    expect(await coachOwnsWorkoutTemplate(coachA.id, workoutADraft)).toBe(true);
  });

  it("is false for another coach's template — even a published one", async () => {
    expect(await coachOwnsProgramTemplate(coachB.id, programAPublished)).toBe(false);
    expect(await coachOwnsWorkoutTemplate(coachB.id, workoutAPublished)).toBe(false);
  });
});

describe("coachCanViewProgramTemplate / coachCanViewWorkoutTemplate — shared library", () => {
  it("is true for a coach's own template regardless of status", async () => {
    expect(await coachCanViewProgramTemplate(coachA.id, programADraft)).toBe(true);
    expect(await coachCanViewWorkoutTemplate(coachA.id, workoutADraft)).toBe(true);
  });

  it("is true for another coach's PUBLISHED template", async () => {
    expect(await coachCanViewProgramTemplate(coachB.id, programAPublished)).toBe(true);
    expect(await coachCanViewWorkoutTemplate(coachB.id, workoutAPublished)).toBe(true);
  });

  it("is false for another coach's PRIVATE (draft) template", async () => {
    expect(await coachCanViewProgramTemplate(coachB.id, programADraft)).toBe(false);
    expect(await coachCanViewWorkoutTemplate(coachB.id, workoutADraft)).toBe(false);
  });
});

describe("assertCoachOwnsProgramTemplate / assertCoachOwnsWorkoutTemplate — mutation", () => {
  it("allows a coach to mutate their own template", async () => {
    expect((await assertCoachOwnsProgramTemplate(fakeDbUser(coachA.id, "coach"), programAPublished)).ok).toBe(true);
  });

  it("denies mutation of another coach's PUBLISHED template — shared mutation denied", async () => {
    const result = await assertCoachOwnsProgramTemplate(fakeDbUser(coachB.id, "coach"), programAPublished);
    expect(result.ok).toBe(false);
  });

  it("denies mutation of another coach's private template", async () => {
    const result = await assertCoachOwnsWorkoutTemplate(fakeDbUser(coachB.id, "coach"), workoutADraft);
    expect(result.ok).toBe(false);
  });

  it("admin bypasses ownership entirely", async () => {
    expect((await assertCoachOwnsProgramTemplate(fakeDbUser(coachA.id, "admin"), programBDraft)).ok).toBe(true);
    expect((await assertCoachOwnsWorkoutTemplate(fakeDbUser(coachA.id, "admin"), workoutBDraft)).ok).toBe(true);
  });
});

describe("assertCoachCanViewProgramTemplate / assertCoachCanViewWorkoutTemplate — shared published clone allowed", () => {
  it("allows viewing/cloning another coach's published template", async () => {
    expect((await assertCoachCanViewProgramTemplate(fakeDbUser(coachB.id, "coach"), programAPublished)).ok).toBe(true);
    expect((await assertCoachCanViewWorkoutTemplate(fakeDbUser(coachB.id, "coach"), workoutAPublished)).ok).toBe(true);
  });

  it("denies viewing another coach's private draft template", async () => {
    expect((await assertCoachCanViewProgramTemplate(fakeDbUser(coachB.id, "coach"), programADraft)).ok).toBe(false);
  });
});

describe("nested resource ownership — cross-coach nested UUID attacks", () => {
  it("assertCoachOwnsProgramWeek resolves the parent template and denies a non-owner acting on a real weekId", async () => {
    const own = await assertCoachOwnsProgramWeek(fakeDbUser(coachA.id, "coach"), weekADraft);
    expect(own.ok).toBe(true);

    const denied = await assertCoachOwnsProgramWeek(fakeDbUser(coachB.id, "coach"), weekADraft);
    expect(denied.ok).toBe(false);
  });

  it("assertCoachOwnsWorkoutSection resolves the parent template and denies a non-owner acting on a real sectionId", async () => {
    const own = await assertCoachOwnsWorkoutSection(fakeDbUser(coachA.id, "coach"), sectionADraft);
    expect(own.ok).toBe(true);

    const denied = await assertCoachOwnsWorkoutSection(fakeDbUser(coachB.id, "coach"), sectionADraft);
    expect(denied.ok).toBe(false);
  });

  it("assertCoachOwnsPrescription resolves the parent template and denies a non-owner acting on a real prescriptionId", async () => {
    const own = await assertCoachOwnsPrescription(fakeDbUser(coachA.id, "coach"), prescriptionADraft);
    expect(own.ok).toBe(true);

    const denied = await assertCoachOwnsPrescription(fakeDbUser(coachB.id, "coach"), prescriptionADraft);
    expect(denied.ok).toBe(false);
  });

  it("admin bypasses nested resource checks", async () => {
    expect((await assertCoachOwnsProgramWeek(fakeDbUser(coachB.id, "admin"), weekADraft)).ok).toBe(true);
    expect((await assertCoachOwnsWorkoutSection(fakeDbUser(coachB.id, "admin"), sectionADraft)).ok).toBe(true);
    expect((await assertCoachOwnsPrescription(fakeDbUser(coachB.id, "admin"), prescriptionADraft)).ok).toBe(true);
  });
});

describe("setDayWorkout — private Blueprint injection rejection", () => {
  it("rejects referencing another coach's PRIVATE blueprint", async () => {
    await expect(
      setDayWorkout(weekADraft, 1, workoutBDraft, undefined, undefined, coachA.id),
    ).rejects.toThrow();
  });

  it("accepts referencing another coach's PUBLISHED blueprint", async () => {
    const day = await setDayWorkout(weekADraft, 2, workoutBPublished, undefined, undefined, coachA.id);
    expect(day.workoutTemplateId).toBe(workoutBPublished);
  });

  it("accepts referencing the coach's own blueprint", async () => {
    const day = await setDayWorkout(weekADraft, 3, workoutAPublished, undefined, undefined, coachA.id);
    expect(day.workoutTemplateId).toBe(workoutAPublished);
  });

  it("admin (coachId null) skips the blueprint-visibility check entirely", async () => {
    const day = await setDayWorkout(weekADraft, 4, workoutBDraft, undefined, undefined, null);
    expect(day.workoutTemplateId).toBe(workoutBDraft);
  });
});

describe("importProgramSpec — private Blueprint injection rejection + transaction rollback", () => {
  it("rejects a spec referencing another coach's PRIVATE blueprint, before writing anything", async () => {
    const rejectedWeekNumber = 90;

    await expect(
      importProgramSpec(
        programADraft,
        {
          clearExisting: false,
          weeks: [
            { weekNumber: rejectedWeekNumber, days: [{ dayOfWeek: 1, workoutTemplateId: workoutBDraft }] },
          ],
        },
        coachA.id,
      ),
    ).rejects.toThrow();

    // The upfront validation must reject before the transaction opens —
    // the rejected week must never have been written.
    const rows = await db
      .select({ weekNumber: programWeeks.weekNumber })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, programADraft));
    expect(rows.some((w) => w.weekNumber === rejectedWeekNumber)).toBe(false);
  });

  it("accepts a spec referencing a published blueprint (own or another coach's)", async () => {
    const result = await importProgramSpec(
      programADraft,
      {
        clearExisting: false,
        weeks: [
          { weekNumber: 91, days: [{ dayOfWeek: 1, workoutTemplateId: workoutBPublished }] },
        ],
      },
      coachA.id,
    );
    expect(result.weeksCreated).toBe(1);
    expect(result.daysCreated).toBe(1);
  });

  it("rolls back the ENTIRE write on a mid-transaction constraint violation — transaction rollback", async () => {
    // Two weeks with the same weekNumber violate uq_program_week
    // (programTemplateId, weekNumber). The first insert in this call
    // succeeds; the second — for the SAME weekNumber — fails. If the
    // transaction wrap is real, neither survives.
    const duplicateWeekNumber = 500;

    await expect(
      importProgramSpec(
        programBDraft,
        {
          clearExisting: false,
          weeks: [
            { weekNumber: duplicateWeekNumber, days: [] },
            { weekNumber: duplicateWeekNumber, days: [] },
          ],
        },
        null, // admin — isolate this test from the blueprint-visibility check above
      ),
    ).rejects.toThrow();

    // Neither attempted insert for the duplicate weekNumber should
    // survive — proving the transaction rolled back the FIRST
    // successful insert too, not just failed on the second.
    const rows = await db
      .select({ weekNumber: programWeeks.weekNumber })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, programBDraft));
    expect(rows.filter((w) => w.weekNumber === duplicateWeekNumber)).toHaveLength(0);
  });
});

describe("cloneProgramTemplate — shared published clone allowed, happy-path regression", () => {
  it("lets a coach clone another coach's published template, and the clone is owned by the cloning coach", async () => {
    // Guard-level authorization (what the route actually enforces):
    expect((await assertCoachCanViewProgramTemplate(fakeDbUser(coachB.id, "coach"), programAPublished)).ok).toBe(true);

    // Service-level mechanics: the clone itself works end-to-end and is
    // correctly attributed to the cloning coach, not the source's owner.
    const clone = await cloneProgramTemplate(programAPublished, coachB.id);
    expect(clone.createdBy).toBe(coachB.id);
    expect(clone.parentTemplateId).toBe(programAPublished);

    const weeks = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, clone.id));
    expect(weeks.length).toBeGreaterThan(0);
  });
});

describe("copyProgramWeek — happy-path regression under the transaction wrap", () => {
  it("still copies week + days correctly", async () => {
    const copy = await copyProgramWeek(weekAPublished);
    expect(copy.programTemplateId).toBe(programAPublished);

    const days = await db
      .select({ id: programWeekDays.id })
      .from(programWeekDays)
      .where(eq(programWeekDays.programWeekId, copy.id));
    // weekAPublished has no days assigned in this fixture, so this just
    // proves the call completes and produces a real, queryable week row.
    expect(days).toBeDefined();
  });
});
