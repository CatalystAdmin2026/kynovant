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
} from "../program-generation-service";
import { validateGeneratedDraft } from "@/lib/program-generator/validation";
import { approveDraft } from "@/lib/program-generator/approval";
import { resolveProgramDraftExercises } from "@/lib/program-generator/exercise-resolution";
import { coachOwnsProgramTemplate, coachOwnsWorkoutTemplate } from "@/lib/auth/guards";
import { generateProgramDraft, regenerateDayDraft } from "@/lib/program-generator/provider";
import type { GeneratedProgramDraft, ModelProgramDraft } from "@/lib/program-generator/contracts";
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
});

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
      })
      .returning({ id: exercises.id });
    exerciseFixtureIds.push(dupeA.id, dupeB.id);

    const modelDraft = buildModelDraft(duplicateName);
    const resolved = await resolveProgramDraftExercises(modelDraft);
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
    const resolved = await resolveProgramDraftExercises(modelDraft);
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

describe("generateProgramDraft — provider configuration", () => {
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

    const outcome = await generateProgramDraft(VALID_BRIEF, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe("not_configured");
  });

  it("the dev fixture, when explicitly enabled, produces a schema-valid draft from real exercises", async () => {
    process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
    delete process.env.PROGRAM_GENERATOR_MODEL;

    const outcome = await generateProgramDraft(VALID_BRIEF, null);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.provider).toBe("dev-fixture");
      // Provider returns unresolved model output (name only) — resolve
      // it exactly as the orchestration layer (actions.ts) would before
      // validating. Every exercise the fixture referenced must resolve
      // against the real library via the "exact" tier, since fixture.ts
      // builds prescriptions from each row's own real canonical name —
      // proves the fixture exercises the full resolve path rather than
      // bypassing it.
      const resolved = await resolveProgramDraftExercises(outcome.draft);
      for (const week of resolved.weeks) {
        for (const day of week.days) {
          for (const section of day.workout?.sections ?? []) {
            for (const prescription of section.prescriptions) {
              expect(prescription.exerciseResolution?.outcome).toBe("exact");
              expect(prescription.exerciseId).not.toBeNull();
            }
          }
        }
      }

      const validation = await validateGeneratedDraft(resolved, VALID_BRIEF, coachA.id);
      expect(validation.unresolvedExerciseIds).toHaveLength(0);
      expect(validation.blockers).toHaveLength(0);
    }
  });

  it("regenerate-day resolves exercises through the same resolver as full generation", async () => {
    process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
    delete process.env.PROGRAM_GENERATOR_MODEL;

    const initial = await generateProgramDraft(VALID_BRIEF, null);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const resolvedInitial = await resolveProgramDraftExercises(initial.draft);

    const dayId = resolvedInitial.weeks[0].days[0].id;
    const regenOutcome = await regenerateDayDraft(VALID_BRIEF, null, resolvedInitial, dayId, undefined);
    expect(regenOutcome.ok).toBe(true);
    if (!regenOutcome.ok) return;

    // Provider's regenerate-day output is the same unresolved
    // ModelProgramDraft shape as full generation — no exerciseId
    // anywhere, even for days it echoed back unchanged — proving both
    // entry points require, and are compatible with, the identical
    // resolveProgramDraftExercises() call.
    const resolvedAfterRegen = await resolveProgramDraftExercises(regenOutcome.draft);
    let sawAtLeastOnePrescription = false;
    for (const week of resolvedAfterRegen.weeks) {
      for (const day of week.days) {
        for (const section of day.workout?.sections ?? []) {
          for (const prescription of section.prescriptions) {
            sawAtLeastOnePrescription = true;
            expect(prescription.exerciseId).not.toBeNull();
            expect(prescription.exerciseId).not.toBe("00000000-0000-0000-0000-000000000000");
            expect(prescription.exerciseResolution?.outcome).toBe("exact");
          }
        }
      }
    }
    expect(sawAtLeastOnePrescription).toBe(true);
  });
});
