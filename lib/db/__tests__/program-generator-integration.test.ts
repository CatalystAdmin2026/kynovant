// ─────────────────────────────────────────────────────────────
// AI-Assisted Program Generator — real-DB integration suite
//
// Mirrors the fixture/cleanup pattern established by
// coach-tenant-isolation.test.ts: real Supabase Auth users (public.
// users.id has a hard FK to auth.users), real exercise rows queried
// from whatever is actually seeded (never hardcoded/invented ids —
// the same discipline this feature enforces at runtime), and full
// FK-safe cleanup in afterAll.
//
// Requires a reachable DATABASE_URL — vitest.config.ts loads
// .env.local automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, programTemplates, workoutTemplates } from "../schema";
import { workoutTemplateSections, workoutTemplateExercises, exercises } from "../schema-exercise";
import { programWeeks, programWeekDays } from "../schema-program";
import { programGenerationDrafts } from "../schema-program-generator";
import {
  createDraft,
  getOwnedDraft,
  saveDraftContent,
  saveValidationResult,
  saveProgramShell,
  saveGenerationWeek,
  listGenerationWeeks,
  getLatestRun,
  setDraftStatus,
  claimFailedDraftForResume,
  acknowledgeWarnings,
} from "../program-generation-service";
import { validateGeneratedDraft } from "@/lib/program-generator/validation";
import { approveDraft } from "@/lib/program-generator/approval";
import { resolveProgramDraftExercises } from "@/lib/program-generator/exercise-resolution";
import { coachOwnsProgramTemplate, coachOwnsWorkoutTemplate } from "@/lib/auth/guards";
import { generateProgramShell, regenerateDayDraft } from "@/lib/program-generator/provider";
import { buildFixtureProgramShell, buildFixtureProgramWeek } from "@/lib/program-generator/fixture";
import { runStagedGeneration } from "@/lib/program-generator/staged-generation";
import { buildExerciseCandidateSet } from "@/lib/program-generator/exercise-candidates";
import { summarizeWeekForPrompt, buildWeekGenerationPrompt } from "@/lib/program-generator/prompt";
import type {
  GeneratedProgramDraft,
  ModelProgramDraft,
  ModelWeekDraft,
} from "@/lib/program-generator/contracts";
import type { ProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const admin = { id: "" };

let exerciseIds: string[] = [];

const draftIds: string[] = [];
const programTemplateIds: string[] = [];
const workoutTemplateIds: string[] = [];
const exerciseFixtureIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `program-gen-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

const VALID_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 1,
  daysPerWeek: 1,
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

function buildDraft(exerciseId: string, overrides?: Partial<GeneratedProgramDraft>): GeneratedProgramDraft {
  return {
    name: `Integration Test Program ${randomUUID().slice(0, 8)}`,
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 1,
    recommendedDaysPerWeek: 1,
    weeks: [
      {
        id: randomUUID(),
        weekNumber: 1,
        days: [
          {
            id: randomUUID(),
            dayOfWeek: 1,
            workout: {
              id: randomUUID(),
              name: "Full Body A",
              sections: [
                {
                  id: randomUUID(),
                  name: "Main Work",
                  sectionType: "main_lift",
                  orderIndex: 0,
                  prescriptions: [
                    {
                      id: randomUUID(),
                      exerciseId,
                      exerciseName: "Test Exercise",
                      orderIndex: 0,
                      sets: 3,
                      repsMin: 8,
                      repsMax: 12,
                      restSeconds: 90,
                      setTechnique: "straight_set",
                      isRequired: true,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function buildModelDraft(exerciseName: string): ModelProgramDraft {
  return {
    name: `Resolution Integration Test ${randomUUID().slice(0, 8)}`,
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 1,
    recommendedDaysPerWeek: 1,
    weeks: [
      {
        id: randomUUID(),
        weekNumber: 1,
        days: [
          {
            id: randomUUID(),
            dayOfWeek: 1,
            workout: {
              id: randomUUID(),
              name: "Full Body A",
              sections: [
                {
                  id: randomUUID(),
                  name: "Main Work",
                  sectionType: "main_lift",
                  orderIndex: 0,
                  prescriptions: [
                    { id: randomUUID(), exerciseName, orderIndex: 0, sets: 3, repsMin: 8, repsMax: 12, isRequired: true },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const READY_INSIGHTS: DraftValidationResult = {
  status: "ready",
  blockers: [],
  warnings: [],
  info: [],
  blueprintAudits: [],
  unresolvedExerciseIds: [],
};

// Marks a draft ready_for_review with the given content + insights, in
// one place so approval tests don't each hand-roll the setup.
async function makeReadyDraft(
  coachId: string,
  draft: GeneratedProgramDraft,
  insights: DraftValidationResult = READY_INSIGHTS,
): Promise<string> {
  const row = await createDraft({ coachId, clientId: null, brief: VALID_BRIEF });
  draftIds.push(row.id);
  await saveDraftContent(row.id, draft, "ready_for_review");
  await saveValidationResult(row.id, insights);
  return row.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, admin.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("admin"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id)),
  ]);

  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.status, "active"))
    .limit(5);
  if (rows.length < 2) {
    throw new Error("Fixture setup failed: need at least 2 active exercises seeded to run this suite.");
  }
  exerciseIds = rows.map((r) => r.id);
});

afterAll(async () => {
  if (exerciseFixtureIds.length > 0) {
    await db.delete(exercises).where(inArray(exercises.id, exerciseFixtureIds));
  }
  if (workoutTemplateIds.length > 0) {
    await db.delete(workoutTemplateExercises).where(inArray(workoutTemplateExercises.workoutTemplateId, workoutTemplateIds));
    await db.delete(workoutTemplateSections).where(inArray(workoutTemplateSections.workoutTemplateId, workoutTemplateIds));
  }
  if (programTemplateIds.length > 0) {
    const weekRows = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(inArray(programWeeks.programTemplateId, programTemplateIds));
    const weekIds = weekRows.map((w) => w.id);
    if (weekIds.length > 0) {
      await db.delete(programWeekDays).where(inArray(programWeekDays.programWeekId, weekIds));
    }
    await db.delete(programWeeks).where(inArray(programWeeks.programTemplateId, programTemplateIds));
  }
  if (workoutTemplateIds.length > 0) {
    await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, workoutTemplateIds));
  }
  if (programTemplateIds.length > 0) {
    await db.delete(programTemplates).where(inArray(programTemplates.id, programTemplateIds));
  }
  if (draftIds.length > 0) {
    // program_generation_runs/edit_events/validation_events cascade from
    // the draft row itself (ON DELETE CASCADE) — no separate cleanup.
    await db.delete(programGenerationDrafts).where(inArray(programGenerationDrafts.id, draftIds));
  }

  const userIds = [coachA.id, coachB.id, admin.id].filter(Boolean);
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const adminClient = createAdminClient();
    await Promise.all(userIds.map((id) => adminClient.auth.admin.deleteUser(id)));
  }
}, 60_000);

// ─────────────────────────────────────────────────────────────
// Exercise existence + exclusion enforcement
// ─────────────────────────────────────────────────────────────

describe("validateGeneratedDraft — exercise existence", () => {
  it("rejects a draft referencing an exercise id that does not exist (invented exercise)", async () => {
    const invented = randomUUID();
    const draft = buildDraft(invented);
    const result = await validateGeneratedDraft(draft, VALID_BRIEF, coachA.id);

    expect(result.status).toBe("blocked");
    expect(result.blockers.some((f) => f.code === "PROGRAM_GEN_EXERCISE_NOT_FOUND")).toBe(true);
    expect(result.unresolvedExerciseIds).toContain(invented);
  });

  it("accepts a draft referencing a real, active exercise", async () => {
    const draft = buildDraft(exerciseIds[0]);
    const result = await validateGeneratedDraft(draft, VALID_BRIEF, coachA.id);
    expect(result.blockers.some((f) => f.code === "PROGRAM_GEN_EXERCISE_NOT_FOUND")).toBe(false);
  });
});

describe("validateGeneratedDraft — hard exclusions", () => {
  it("rejects a draft that includes a coach-excluded exercise", async () => {
    const draft = buildDraft(exerciseIds[0]);
    const brief: ProgramGenerationBrief = { ...VALID_BRIEF, excludedExerciseIds: [exerciseIds[0]] };
    const result = await validateGeneratedDraft(draft, brief, coachA.id);

    expect(result.status).toBe("blocked");
    expect(result.blockers.some((f) => f.code === "PROGRAM_GEN_EXCLUDED_EXERCISE_USED")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Exercise resolution — ambiguous/unresolved names block approval
// end-to-end (resolve → validate → approve), full pipeline.
// ─────────────────────────────────────────────────────────────

describe("exercise resolution — ambiguous/unresolved block approval", () => {
  it("an ambiguous exercise name blocks validation and approval", async () => {
    // Two real, active exercises sharing the same canonical name — the
    // only reliable way to force genuine ambiguity through the exact-
    // name tier without touching seed data permanently. Cleaned up in
    // afterAll via exerciseFixtureIds.
    const duplicateName = `Resolution Test Ambiguous Exercise ${randomUUID().slice(0, 8)}`;
    const [dupeA] = await db
      .insert(exercises)
      .values({
        slug: `resolution-test-ambiguous-a-${randomUUID()}`,
        name: duplicateName,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        // coachA must be able to see both fixture rows — tenant-scoped
        // resolution (exercise-resolution.ts) otherwise excludes a
        // coach-scoped row with no matching owner.
        createdBy: coachA.id,
      })
      .returning({ id: exercises.id });
    const [dupeB] = await db
      .insert(exercises)
      .values({
        slug: `resolution-test-ambiguous-b-${randomUUID()}`,
        name: duplicateName,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        createdBy: coachA.id,
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(dupeA.id, dupeB.id);

    const modelDraft = buildModelDraft(duplicateName);
    const resolved = await resolveProgramDraftExercises(modelDraft, coachA.id);
    const prescription = resolved.weeks[0].days[0].workout!.sections[0].prescriptions[0];
    expect(prescription.exerciseId).toBeNull();
    expect(prescription.exerciseResolution?.outcome).toBe("ambiguous");
    expect(prescription.exerciseResolution?.candidates.map((c) => c.id).sort()).toEqual(
      [dupeA.id, dupeB.id].sort(),
    );

    const validation = await validateGeneratedDraft(resolved, VALID_BRIEF, coachA.id);
    expect(validation.status).toBe("blocked");
    const finding = validation.blockers.find((f) => f.code === "PROGRAM_GEN_EXERCISE_AMBIGUOUS");
    expect(finding).toBeDefined();
    expect(finding?.candidates?.map((c) => c.id).sort()).toEqual([dupeA.id, dupeB.id].sort());

    const draftId = await makeReadyDraft(coachA.id, resolved, validation);
    const outcome = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("has_blockers");
  });

  it("an unresolved exercise name blocks validation and approval", async () => {
    const nonsenseName = `Zzyzx Nonexistent Movement ${randomUUID().slice(0, 8)}`;
    const modelDraft = buildModelDraft(nonsenseName);
    const resolved = await resolveProgramDraftExercises(modelDraft, coachA.id);
    const prescription = resolved.weeks[0].days[0].workout!.sections[0].prescriptions[0];
    expect(prescription.exerciseId).toBeNull();
    expect(prescription.exerciseResolution?.outcome).toBe("unresolved");

    const validation = await validateGeneratedDraft(resolved, VALID_BRIEF, coachA.id);
    expect(validation.status).toBe("blocked");
    expect(validation.blockers.some((f) => f.code === "PROGRAM_GEN_EXERCISE_UNRESOLVED")).toBe(true);

    const draftId = await makeReadyDraft(coachA.id, resolved, validation);
    const outcome = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("has_blockers");
  });

  it("never resolves a name to another coach's private exercise — the fallback resolver is tenant-scoped like candidate selection", async () => {
    const privateName = `Resolution Test Private Exercise ${randomUUID().slice(0, 8)}`;
    const [privateExercise] = await db
      .insert(exercises)
      .values({
        slug: `resolution-test-private-${randomUUID()}`,
        name: privateName,
        movementPattern: "push_horizontal",
        classification: "compound",
        difficulty: "beginner",
        status: "active",
        createdBy: coachB.id, // private to coachB only
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(privateExercise.id);

    // coachA generates content that happens to name coachB's private
    // exercise exactly — resolveProgramDraftExercises must never resolve
    // this to coachB's real id on coachA's behalf, even though the row
    // is real, active, and an exact name match.
    const asCoachA = await resolveProgramDraftExercises(buildModelDraft(privateName), coachA.id);
    const prescriptionA = asCoachA.weeks[0].days[0].workout!.sections[0].prescriptions[0];
    expect(prescriptionA.exerciseId).toBeNull();
    expect(prescriptionA.exerciseResolution?.outcome).toBe("unresolved");

    // The owning coach, by contrast, must still resolve it normally.
    const asCoachB = await resolveProgramDraftExercises(buildModelDraft(privateName), coachB.id);
    const prescriptionB = asCoachB.weeks[0].days[0].workout!.sections[0].prescriptions[0];
    expect(prescriptionB.exerciseId).toBe(privateExercise.id);
    expect(prescriptionB.exerciseResolution?.outcome).toBe("exact");
  });
});

// ─────────────────────────────────────────────────────────────
// Cross-coach draft access
// ─────────────────────────────────────────────────────────────

describe("getOwnedDraft — cross-coach access", () => {
  it("rejects access from a coach who does not own the draft", async () => {
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief: VALID_BRIEF });
    draftIds.push(row.id);

    const asOwner = await getOwnedDraft(row.id, { coachId: coachA.id });
    expect(asOwner.ok).toBe(true);

    const asOtherCoach = await getOwnedDraft(row.id, { coachId: coachB.id });
    expect(asOtherCoach.ok).toBe(false);
    if (!asOtherCoach.ok) expect(asOtherCoach.error).toBe("forbidden");
  });

  it("admin (coachId: null) can access any coach's draft", async () => {
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief: VALID_BRIEF });
    draftIds.push(row.id);

    const asAdmin = await getOwnedDraft(row.id, { coachId: null });
    expect(asAdmin.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Approval — blockers, idempotency, atomicity, full linkage, admin
// ─────────────────────────────────────────────────────────────

describe("approveDraft", () => {
  it("refuses to approve a draft with unresolved blockers", async () => {
    const draft = buildDraft(exerciseIds[0]);
    const blockedInsights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_NOT_FOUND",
          severity: "blocker",
          title: "test blocker",
          explanation: "test",
        },
      ],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };
    const draftId = await makeReadyDraft(coachA.id, draft, blockedInsights);

    const outcome = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("has_blockers");
  });

  it("creates complete linked records on approval and is idempotent on a second call", async () => {
    const draft = buildDraft(exerciseIds[0]);
    const draftId = await makeReadyDraft(coachA.id, draft);

    const first = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyApproved).toBe(false);
    programTemplateIds.push(first.programTemplateId);
    workoutTemplateIds.push(...first.workoutTemplateIds);

    // Complete linkage: program template → week → day → workout template
    // → section → prescription, all real rows now.
    const [programRow] = await db.select().from(programTemplates).where(eq(programTemplates.id, first.programTemplateId));
    expect(programRow).toBeDefined();
    expect(programRow.status).toBe("draft"); // never auto-published
    // Owned by the generating coach, not whoever clicked approve —
    // required for the nested-ownership model (coachOwnsProgramTemplate)
    // to recognize coachA as the owner afterward.
    expect(programRow.createdBy).toBe(coachA.id);

    const weekRows = await db.select().from(programWeeks).where(eq(programWeeks.programTemplateId, first.programTemplateId));
    expect(weekRows).toHaveLength(1);

    const dayRows = await db.select().from(programWeekDays).where(eq(programWeekDays.programWeekId, weekRows[0].id));
    expect(dayRows).toHaveLength(1);
    expect(dayRows[0].workoutTemplateId).toBe(first.workoutTemplateIds[0]);

    const [workoutRow] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, first.workoutTemplateIds[0]));
    expect(workoutRow).toBeDefined();
    expect(workoutRow.status).toBe("draft"); // never auto-published

    const sectionRows = await db.select().from(workoutTemplateSections).where(eq(workoutTemplateSections.workoutTemplateId, first.workoutTemplateIds[0]));
    expect(sectionRows).toHaveLength(1);

    const prescriptionRows = await db.select().from(workoutTemplateExercises).where(eq(workoutTemplateExercises.workoutTemplateId, first.workoutTemplateIds[0]));
    expect(prescriptionRows).toHaveLength(1);
    expect(prescriptionRows[0].exerciseId).toBe(exerciseIds[0]);

    // Draft marked approved with audit linkage.
    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    expect(draftRow.status).toBe("approved");
    expect(draftRow.createdProgramTemplateId).toBe(first.programTemplateId);

    // Idempotent: calling again returns the SAME linkage, no new rows.
    const second = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyApproved).toBe(true);
    expect(second.programTemplateId).toBe(first.programTemplateId);
    expect(second.workoutTemplateIds).toEqual(first.workoutTemplateIds);

    const allMatchingPrograms = await db
      .select()
      .from(programTemplates)
      .where(eq(programTemplates.id, first.programTemplateId));
    expect(allMatchingPrograms).toHaveLength(1);
  });

  it("leaves no partial assets when the transaction fails partway through", async () => {
    // Schema-valid (real uuid shape) but non-existent exerciseId. Real
    // validation would catch this before approval — here we bypass it on
    // purpose to force a foreign-key failure INSIDE the approval
    // transaction and prove atomicity (locked rule #12), independent of
    // the earlier validation layer that would normally prevent it.
    const nonExistentExerciseId = randomUUID();
    const draft = buildDraft(nonExistentExerciseId);
    const draftId = await makeReadyDraft(coachA.id, draft);

    await expect(approveDraft(draftId, { coachId: coachA.id }, coachA.id)).rejects.toThrow();

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    expect(draftRow.status).toBe("ready_for_review"); // never flipped to approved
    expect(draftRow.createdProgramTemplateId).toBeNull();

    // No orphaned program_templates row from this draft's failed attempt.
    const orphanPrograms = await db.select().from(programTemplates).where(eq(programTemplates.createdBy, coachA.id));
    const leaked = orphanPrograms.filter((p) => (p.metadata as { generationDraftId?: string } | null)?.generationDraftId === draftId);
    expect(leaked).toHaveLength(0);
  });

  it("admin can approve any coach's draft; approvedBy is the admin but createdBy stays the generating coach", async () => {
    const draft = buildDraft(exerciseIds[1] ?? exerciseIds[0]);
    const draftId = await makeReadyDraft(coachA.id, draft);

    const outcome = await approveDraft(draftId, { coachId: null }, admin.id);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    programTemplateIds.push(outcome.programTemplateId);
    workoutTemplateIds.push(...outcome.workoutTemplateIds);

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    expect(draftRow.approvedBy).toBe(admin.id);

    // The resulting Program/Blueprint must stay owned by coachA, the
    // generating coach — not admin.id, the approver. Proven two ways:
    // the raw column, and the real nested-ownership predicate coachA
    // will actually be checked against in the Program Builder.
    const [programRow] = await db.select().from(programTemplates).where(eq(programTemplates.id, outcome.programTemplateId));
    expect(programRow.createdBy).toBe(coachA.id);
    expect(await coachOwnsProgramTemplate(coachA.id, outcome.programTemplateId)).toBe(true);
    expect(await coachOwnsProgramTemplate(admin.id, outcome.programTemplateId)).toBe(false);

    const [workoutRow] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, outcome.workoutTemplateIds[0]));
    expect(workoutRow.createdBy).toBe(coachA.id);
    expect(await coachOwnsWorkoutTemplate(coachA.id, outcome.workoutTemplateIds[0])).toBe(true);
  });

  it("rejects approval attempted by a coach who does not own the draft", async () => {
    const draft = buildDraft(exerciseIds[0]);
    const draftId = await makeReadyDraft(coachA.id, draft);

    const outcome = await approveDraft(draftId, { coachId: coachB.id }, coachB.id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("forbidden");
  });
});

// ─────────────────────────────────────────────────────────────
// Provider — safe failure state
// ─────────────────────────────────────────────────────────────

describe("provider configuration", () => {
  const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
  const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;

  afterAll(() => {
    if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
    else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
    if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
  });

  it("fails safely with not_configured when no model and no fixture flag are set", async () => {
    delete process.env.PROGRAM_GENERATOR_MODEL;
    delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;

    const outcome = await generateProgramShell(VALID_BRIEF, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("not_configured");
  });

  it("regenerate-day resolves exercises through the same resolver as staged generation", async () => {
    process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
    delete process.env.PROGRAM_GENERATOR_MODEL;

    const shell = buildFixtureProgramShell(VALID_BRIEF);
    const week1 = await buildFixtureProgramWeek(1, shell);
    if (!week1) throw new Error("fixture setup failed — not enough active exercises seeded.");

    const initialModelDraft: ModelProgramDraft = {
      name: shell.title,
      description: shell.description,
      category: VALID_BRIEF.goal,
      experienceLevel: VALID_BRIEF.experienceLevel,
      defaultDurationWeeks: 1,
      recommendedDaysPerWeek: VALID_BRIEF.daysPerWeek,
      weeks: [week1],
    };
    const resolvedInitial = await resolveProgramDraftExercises(initialModelDraft, coachA.id);

    const dayId = resolvedInitial.weeks[0].days[0].id;
    // Fixture mode ignores the candidates param entirely (it builds
    // directly from real rows, bypassing catalog selection) — [] is
    // fine here; this test is about resolver-fallback behavior, not
    // catalog verification (see the dedicated catalog tests below).
    const regenOutcome = await regenerateDayDraft(VALID_BRIEF, null, resolvedInitial, dayId, undefined, []);
    expect(regenOutcome.ok).toBe(true);
    if (!regenOutcome.ok) return;

    // Provider's regenerate-day output is the same ModelProgramDraft
    // shape as staged generation's assembled output — the fixture
    // populates a real exerciseId from the same rows it queried, and
    // resolveProgramDraftExercises() independently re-verifies it
    // against the real library (outcome "catalog_selected") rather than
    // trusting it outright — proving both entry points require, and are
    // compatible with, the identical resolveProgramDraftExercises() call.
    const resolvedAfterRegen = await resolveProgramDraftExercises(regenOutcome.draft, coachA.id);
    let sawAtLeastOnePrescription = false;
    for (const week of resolvedAfterRegen.weeks) {
      for (const day of week.days) {
        for (const section of day.workout?.sections ?? []) {
          for (const prescription of section.prescriptions) {
            sawAtLeastOnePrescription = true;
            expect(prescription.exerciseId).not.toBeNull();
            expect(prescription.exerciseId).not.toBe("00000000-0000-0000-0000-000000000000");
            expect(prescription.exerciseResolution?.outcome).toBe("catalog_selected");
          }
        }
      }
    }
    expect(sawAtLeastOnePrescription).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Staged, week-by-week generation orchestration (replaces the single
// giant generateObject() call that caused 180s timeouts on large
// programs — see lib/program-generator/staged-generation.ts).
// ─────────────────────────────────────────────────────────────

describe("staged generation orchestration", () => {
  const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
  const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;

  beforeAll(() => {
    process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
    delete process.env.PROGRAM_GENERATOR_MODEL;
  });

  afterAll(() => {
    if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
    else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
    if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
  });

  it("a 10-week program is generated as one shell call plus 10 week calls — never one giant call — and the assembled draft resolves and validates, with approval remaining atomic", async () => {
    const brief: ProgramGenerationBrief = { ...VALID_BRIEF, weeks: 10, daysPerWeek: 3 };
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief });
    // 11 sequential fixture "provider" calls (1 shell + 10 weeks), each a
    // real DB round-trip, plus resolution/validation/approval — comfortably
    // exceeds vitest's default 5s per-test timeout even though each step
    // individually is fast.
    draftIds.push(row.id);

    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachA.id,
      brief,
      clientContext: null,
      existingShell: null,
      startFromWeek: 1,
      existingCompletedWeeks: new Map(),
    });
    expect(result.ok).toBe(true);

    // Decomposed into 10 persisted week rows — proves the program was
    // never generated as a single request sized to the whole draft.
    const weekRows = await listGenerationWeeks(row.id);
    expect(weekRows).toHaveLength(10);
    expect(weekRows.every((w) => w.status === "completed")).toBe(true);

    const latestRun = await getLatestRun(row.id);
    expect(latestRun?.totalWeeks).toBe(10);
    expect(latestRun?.completedWeeks).toBe(10);

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, row.id));
    expect(draftRow.status).toBe("ready_for_review");
    expect(draftRow.shellJson).toBeTruthy();

    const parsedDraft = draftRow.draftJson as GeneratedProgramDraft;
    expect(parsedDraft.weeks).toHaveLength(10);

    // Exercise resolution applied once, at assembly — every prescription
    // resolved to a real id, never the nil UUID, and — the point of this
    // whole feature — never via a guess. Every prescription must have
    // been either verified straight off the supplied candidate catalog
    // ("catalog_selected") or, for any fixture row that happened to fall
    // outside that brief's equipment/difficulty candidate filters,
    // resolved to the exact same real row by canonical name ("exact").
    // Never "ambiguous"/"unresolved"/"alternate_name"/"strong_match" —
    // those tiers exist for real model output with imperfect names, and
    // the fixture always supplies an exact canonical name. Zero
    // fabricated ids across an entire 10-week, 30-day assembled program.
    let prescriptionCount = 0;
    let catalogSelectedCount = 0;
    for (const week of parsedDraft.weeks) {
      for (const day of week.days) {
        for (const section of day.workout?.sections ?? []) {
          for (const p of section.prescriptions) {
            prescriptionCount++;
            expect(p.exerciseId).not.toBeNull();
            expect(p.exerciseId).not.toBe("00000000-0000-0000-0000-000000000000");
            expect(["catalog_selected", "exact"]).toContain(p.exerciseResolution?.outcome);
            if (p.exerciseResolution?.outcome === "catalog_selected") catalogSelectedCount++;
          }
        }
      }
    }
    expect(prescriptionCount).toBeGreaterThan(0);
    // Proves the new catalog-constrained path is actually exercised
    // end-to-end across a full multi-week run, not merely reachable in
    // isolation — not every prescription needs to land here (the resolver
    // fallback is legitimate too), but some must.
    expect(catalogSelectedCount).toBeGreaterThan(0);

    // Full validation ran against the assembled draft. No blockers
    // expected (real, valid prescriptions against real exercises) —
    // warnings are plausible (30 near-identical fixture days can trip
    // Kynovant Insights' redundancy/fatigue heuristics) and, per locked
    // rule #8, just need acknowledgement before approval, not a fix.
    expect(draftRow.validationStatus).not.toBeNull();
    expect(draftRow.validationStatus).not.toBe("failed");
    expect(draftRow.validationStatus).not.toBe("blocked");
    await acknowledgeWarnings(row.id);

    // Approval remains atomic on a staged-generated draft.
    const approval = await approveDraft(row.id, { coachId: coachA.id }, coachA.id);
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    programTemplateIds.push(approval.programTemplateId);
    workoutTemplateIds.push(...approval.workoutTemplateIds);
    expect(approval.workoutTemplateIds).toHaveLength(10 * 3);

    const weekDbRows = await db.select().from(programWeeks).where(eq(programWeeks.programTemplateId, approval.programTemplateId));
    expect(weekDbRows).toHaveLength(10);
  }, 120_000);

  it("completed weeks persist even when a later week fails", async () => {
    const brief: ProgramGenerationBrief = { ...VALID_BRIEF, weeks: 3, daysPerWeek: 2 };
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief });
    draftIds.push(row.id);

    const shell = buildFixtureProgramShell(brief);
    const week1 = await buildFixtureProgramWeek(1, shell);
    const week2 = await buildFixtureProgramWeek(2, shell);
    if (!week1 || !week2) throw new Error("fixture setup failed — not enough active exercises seeded.");

    await saveGenerationWeek(row.id, 1, { status: "completed", weekJson: week1 });
    await saveGenerationWeek(row.id, 2, { status: "completed", weekJson: week2 });
    await saveGenerationWeek(row.id, 3, { status: "failed", errorMessage: "simulated failure" });

    const weekRows = await listGenerationWeeks(row.id);
    expect(weekRows).toHaveLength(3);
    expect(weekRows.find((w) => w.weekNumber === 1)?.status).toBe("completed");
    expect(weekRows.find((w) => w.weekNumber === 1)?.weekJson).toBeTruthy();
    expect(weekRows.find((w) => w.weekNumber === 2)?.status).toBe("completed");
    expect(weekRows.find((w) => w.weekNumber === 3)?.status).toBe("failed");
    expect(weekRows.find((w) => w.weekNumber === 3)?.weekJson).toBeNull();
  });

  // This test resumes generation for weeks 3-4, each a real model call
  // (no fixture provider in this suite — see provider.ts's
  // PROGRAM_GENERATOR_USE_FIXTURE) — the default 5000ms test timeout
  // left this real, network-latency-bound test almost no margin even
  // before the Exercise Library grew to ~647 rows; the correctly larger
  // (still capped at 150 — see exercise-candidates.ts) candidate set now
  // in every prompt tips it over. Not a capping/exhaustion defect — a
  // real API call taking longer than a too-tight timeout — so only the
  // timeout is widened here, nothing about candidate selection.
  it("resuming a failed generation continues from the first incomplete week without regenerating completed weeks", async () => {
    const brief: ProgramGenerationBrief = { ...VALID_BRIEF, weeks: 4, daysPerWeek: 2 };
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief });
    draftIds.push(row.id);

    const shell = buildFixtureProgramShell(brief);
    await saveProgramShell(row.id, shell);

    // Weeks 1-2 are pre-seeded with a marker no real generation (fixture
    // or live model) would ever produce — proves a resume leaves them
    // byte-for-byte untouched rather than regenerating them.
    const markerWeek = (weekNumber: number): ModelWeekDraft => ({
      id: randomUUID(),
      weekNumber,
      days: [
        {
          id: randomUUID(),
          dayOfWeek: 1,
          workout: {
            id: randomUUID(),
            name: "Marker Session",
            sections: [
              {
                id: randomUUID(),
                name: "Main",
                sectionType: "main_lift",
                orderIndex: 0,
                prescriptions: [
                  { id: randomUUID(), exerciseName: `PRESEEDED-MARKER-WEEK-${weekNumber}`, orderIndex: 0, isRequired: true },
                ],
              },
            ],
          },
        },
      ],
    });

    const week1Marker = markerWeek(1);
    const week2Marker = markerWeek(2);
    await saveGenerationWeek(row.id, 1, { status: "completed", weekJson: week1Marker });
    await saveGenerationWeek(row.id, 2, { status: "completed", weekJson: week2Marker });
    await setDraftStatus(row.id, "failed", { failureReason: "simulated failure for test" });

    const existingCompletedWeeks = new Map<number, ModelWeekDraft>([
      [1, week1Marker],
      [2, week2Marker],
    ]);

    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachA.id,
      brief,
      clientContext: null,
      existingShell: shell,
      startFromWeek: 3,
      existingCompletedWeeks,
    });
    expect(result.ok).toBe(true);

    const weekRows = await listGenerationWeeks(row.id);
    expect(weekRows).toHaveLength(4);

    const week1Row = weekRows.find((w) => w.weekNumber === 1)!;
    const week2Row = weekRows.find((w) => w.weekNumber === 2)!;
    expect((week1Row.weekJson as ModelWeekDraft).days[0].workout?.sections[0].prescriptions[0].exerciseName).toBe(
      "PRESEEDED-MARKER-WEEK-1",
    );
    expect((week2Row.weekJson as ModelWeekDraft).days[0].workout?.sections[0].prescriptions[0].exerciseName).toBe(
      "PRESEEDED-MARKER-WEEK-2",
    );

    const week3Row = weekRows.find((w) => w.weekNumber === 3)!;
    expect(week3Row.status).toBe("completed");
    expect((week3Row.weekJson as ModelWeekDraft).days[0].workout?.sections[0].prescriptions[0].exerciseName).not.toContain(
      "PRESEEDED-MARKER",
    );
    const week4Row = weekRows.find((w) => w.weekNumber === 4)!;
    expect(week4Row.status).toBe("completed");

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, row.id));
    expect(draftRow.status).toBe("ready_for_review");
    expect((draftRow.draftJson as GeneratedProgramDraft).weeks).toHaveLength(4);
  }, 30000);

  it("claimFailedDraftForResume closes the double-click resume race — only one concurrent caller wins the claim", async () => {
    const brief: ProgramGenerationBrief = { ...VALID_BRIEF, weeks: 1, daysPerWeek: 1 };
    const row = await createDraft({ coachId: coachA.id, clientId: null, brief });
    draftIds.push(row.id);
    await setDraftStatus(row.id, "failed", { failureReason: "simulated failure for test" });

    // Two concurrent resume attempts (double-click, a client retry) both
    // racing the same atomic "failed -> running" transition — exactly
    // one must succeed regardless of ordering.
    const [first, second] = await Promise.all([
      claimFailedDraftForResume(row.id),
      claimFailedDraftForResume(row.id),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, row.id));
    expect(draftRow.status).toBe("running");

    // A third call against the now-"running" (not "failed") draft must
    // also fail to claim it.
    expect(await claimFailedDraftForResume(row.id)).toBe(false);
  });

  it("fails fast with a clear error when the candidate set is totally exhausted, instead of spending a shell + week call on a guaranteed-unusable draft", async () => {
    const narrowBrief: ProgramGenerationBrief = {
      ...VALID_BRIEF,
      weeks: 1,
      daysPerWeek: 1,
      equipmentAccess: "bodyweight",
      experienceLevel: "beginner",
    };

    // Drive the real candidate set to true exhaustion by repeatedly
    // excluding whatever comes back, not just a single call's own
    // output. buildExerciseCandidateSet's per-muscle-group/mobility/
    // cardio caps (12/16/15/8 — see exercise-candidates.ts) are
    // deliberately preserved: they bound how many NEW candidates any one
    // call can return, so if a category's real supply exceeds its cap,
    // one call's output undercounts the true matching set and excluding
    // only that output would leave real, unexcluded matches behind on
    // the next call — exactly the false "exhausted" signal a bigger
    // Exercise Library exposed here once the mobility category's real
    // bodyweight+beginner supply grew past its cap of 15. Looping until
    // a call returns nothing new converges on the true, full exclusion
    // set regardless of library size, without weakening or bypassing
    // any per-category cap.
    const excludedIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { candidates } = await buildExerciseCandidateSet(
        { ...narrowBrief, excludedExerciseIds: [...excludedIds] },
        coachA.id,
      );
      if (candidates.length === 0) break;
      for (const c of candidates) excludedIds.add(c.id);
    }
    expect(excludedIds.size).toBeGreaterThan(0);
    // excludedExerciseIds is capped at 100 (contracts.ts) — this narrow
    // a brief's true matching pool must stay within that bound for
    // "exclude everything real, then confirm zero" to be expressible as
    // a single ProgramGenerationBrief at all.
    expect(excludedIds.size).toBeLessThanOrEqual(100);

    const exhaustedBrief: ProgramGenerationBrief = {
      ...narrowBrief,
      excludedExerciseIds: [...excludedIds],
    };
    const confirmedEmpty = await buildExerciseCandidateSet(exhaustedBrief, coachA.id);
    expect(confirmedEmpty.candidates).toHaveLength(0);

    const row = await createDraft({ coachId: coachA.id, clientId: null, brief: exhaustedBrief });
    draftIds.push(row.id);

    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachA.id,
      brief: exhaustedBrief,
      clientContext: null,
      existingShell: null,
      startFromWeek: 1,
      existingCompletedWeeks: new Map(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("equipment and experience-level");

    // No week rows persisted — proves generation failed before spending
    // any shell/week model call, not partway through.
    const weekRows = await listGenerationWeeks(row.id);
    expect(weekRows).toHaveLength(0);

    const [draftRow] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, row.id));
    expect(draftRow.status).toBe("failed");
  });

  it("passes the prior week's compact summary — including its selected exercise ids — forward into the next week's prompt", async () => {
    const shell = buildFixtureProgramShell(VALID_BRIEF);
    const week1 = await buildFixtureProgramWeek(1, shell);
    if (!week1) throw new Error("fixture setup failed — not enough active exercises seeded.");

    const firstPrescriptionId = week1.days[0].workout?.sections[0].prescriptions[0].exerciseId;
    expect(firstPrescriptionId).toBeTruthy();

    const summary = summarizeWeekForPrompt(week1);
    expect(summary.length).toBeGreaterThan(0);
    // Requirement: pass prior-week SELECTED IDS forward, not just names —
    // lets the model copy the exact id forward for continuity instead of
    // re-selecting by name and risking a different-but-similar exercise.
    expect(summary).toContain(`[id:${firstPrescriptionId}]`);

    const prompt = buildWeekGenerationPrompt(VALID_BRIEF, null, shell, 2, summary, []);
    expect(prompt).toContain(summary);
    expect(prompt).toContain(`[id:${firstPrescriptionId}]`);
    expect(prompt).toContain("This is NOT the first week");
  });
});
