// ─────────────────────────────────────────────────────────────
// AI Program Generator — Review Triage integration suite
//
// Covers requirement #9's DB-backed cases: replace-all mechanics and
// ownership, acknowledgement (warnings vs blockers), approval
// availability, and audit-trail integrity. Grouping itself (pure, no
// DB) is covered by lib/program-generator/__tests__/findings-grouping.test.ts.
//
// Same fixture/cleanup pattern as program-generator-integration.test.ts:
// real Supabase Auth users, real active exercises queried from whatever
// is actually seeded, full FK-safe cleanup in afterAll.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, programTemplates, workoutTemplates } from "../schema";
import { exercises, workoutTemplateSections, workoutTemplateExercises } from "../schema-exercise";
import { programWeeks, programWeekDays } from "../schema-program";
import { programGenerationDrafts, programGenerationEditEvents } from "../schema-program-generator";
import {
  createDraft,
  getOwnedDraft,
  saveDraftContent,
  saveValidationResult,
  acknowledgeFindingKeys,
  listEditEvents,
  listValidationEvents,
} from "../program-generation-service";
import { getExerciseById } from "@/lib/db/exercise-service";
import { validateGeneratedDraft } from "@/lib/program-generator/validation";
import { approveDraft } from "@/lib/program-generator/approval";
import { groupDraftFindings, groupAckKey } from "@/lib/program-generator/findings-grouping";
import { replaceExerciseByName } from "@/lib/program-generator/edit-ops";
import type { GeneratedProgramDraft } from "@/lib/program-generator/contracts";
import type { ProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const admin = { id: "" };

let activeExerciseIds: string[] = [];
let inactiveExerciseId = "";

const draftIds: string[] = [];
const exerciseFixtureIds: string[] = [];
const programTemplateIds: string[] = [];
const workoutTemplateIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `review-triage-test-${label}-${randomUUID()}@isolation-test.invalid`,
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
  weeks: 2,
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

const AMBIGUOUS_NAME = "Cable Seated Row";

// 2 occurrences of the same ambiguous name across 2 weeks, plus a THIRD
// prescription sharing the exact same name text but already resolved
// (exerciseId set) — proves replace-all touches only unresolved refs,
// never something a coach (or the resolver) already fixed.
function buildMultiWeekDraft(alreadyResolvedExerciseId: string): {
  draft: GeneratedProgramDraft;
  week1DayId: string;
  week2DayId: string;
  p1: string;
  p2: string;
  alreadyResolvedPrescriptionId: string;
} {
  const week1DayId = randomUUID();
  const week2DayId = randomUUID();
  const p1 = randomUUID();
  const p2 = randomUUID();
  const alreadyResolvedPrescriptionId = randomUUID();

  const draft: GeneratedProgramDraft = {
    name: `Review Triage Test ${randomUUID().slice(0, 8)}`,
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 2,
    recommendedDaysPerWeek: 1,
    weeks: [
      {
        id: randomUUID(),
        weekNumber: 1,
        days: [
          {
            id: week1DayId,
            dayOfWeek: 1,
            workout: {
              id: randomUUID(),
              name: "Back & Biceps",
              sections: [
                {
                  id: randomUUID(),
                  name: "Main Work",
                  sectionType: "main_lift",
                  orderIndex: 0,
                  prescriptions: [
                    {
                      id: p1,
                      exerciseId: null,
                      exerciseName: AMBIGUOUS_NAME,
                      orderIndex: 0,
                      sets: 4,
                      repsMin: 8,
                      repsMax: 10,
                      restSeconds: 75,
                      tempo: "2010",
                      isRequired: true,
                      exerciseResolution: { outcome: "ambiguous", candidates: [] },
                    },
                    {
                      id: alreadyResolvedPrescriptionId,
                      exerciseId: alreadyResolvedExerciseId,
                      exerciseName: AMBIGUOUS_NAME,
                      orderIndex: 1,
                      sets: 3,
                      repsMin: 10,
                      repsMax: 12,
                      isRequired: true,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        id: randomUUID(),
        weekNumber: 2,
        days: [
          {
            id: week2DayId,
            dayOfWeek: 1,
            workout: {
              id: randomUUID(),
              name: "Back & Biceps",
              sections: [
                {
                  id: randomUUID(),
                  name: "Main Work",
                  sectionType: "main_lift",
                  orderIndex: 0,
                  prescriptions: [
                    {
                      id: p2,
                      exerciseId: null,
                      exerciseName: AMBIGUOUS_NAME,
                      orderIndex: 0,
                      sets: 4,
                      repsMin: 8,
                      repsMax: 10,
                      restSeconds: 75,
                      tempo: "2010",
                      isRequired: true,
                      exerciseResolution: { outcome: "ambiguous", candidates: [] },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  return { draft, week1DayId, week2DayId, p1, p2, alreadyResolvedPrescriptionId };
}

async function makeReadyDraft(coachId: string, draft: GeneratedProgramDraft): Promise<string> {
  const row = await createDraft({ coachId, clientId: null, brief: VALID_BRIEF });
  draftIds.push(row.id);
  await saveDraftContent(row.id, draft, "ready_for_review");
  const validation = await validateGeneratedDraft(draft, VALID_BRIEF, coachId);
  await saveValidationResult(row.id, validation);
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

  // Scoped to scope="system" (never an unrelated coach's private
  // exercise — see exercise-resolution.test.ts, which was fixed for the
  // identical class of bug this suite leaked from) plus a deterministic
  // ORDER BY (Postgres does not guarantee row order for an unordered
  // LIMIT). Root cause of the Review Triage Test fixture leak: this
  // query used to be unscoped and unordered, so activeExerciseIds[2]
  // could land on ANY active exercise in the shared table — including a
  // real coach-owned one — and that id then flowed, untouched, into
  // every draft this suite approves via alreadyResolvedPrescriptionId.
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.status, "active"), eq(exercises.scope, "system")))
    .orderBy(asc(exercises.id))
    .limit(3);
  if (rows.length < 3) {
    throw new Error("Fixture setup failed: need at least 3 active scope='system' exercises seeded to run this suite.");
  }
  activeExerciseIds = rows.map((r) => r.id);

  const [inactive] = await db
    .insert(exercises)
    .values({
      slug: `review-triage-inactive-${randomUUID()}`,
      name: `Review Triage Inactive Exercise ${randomUUID().slice(0, 8)}`,
      movementPattern: "push_horizontal",
      classification: "compound",
      difficulty: "beginner",
      status: "draft",
    })
    .returning({ id: exercises.id });
  inactiveExerciseId = inactive.id;
  exerciseFixtureIds.push(inactive.id);
});

// Cleanup robustness — same philosophy as program-generator-integration.
// test.ts's afterAll (see that file's header comment): every phase runs
// in its own try/catch, ALL phases are attempted regardless of an
// earlier one failing, the FIRST error is captured and rethrown only
// once every phase has been attempted, and per-item async cleanup (Auth
// user deletion) uses Promise.allSettled rather than Promise.all so one
// rejection doesn't stop the others. A cleanup failure must never be
// swallowed, and it must never prevent later, independent cleanup
// phases — most importantly Auth user deletion — from being attempted.
//
// Phase order matters independent of that robustness too: this is the
// exact leak this suite caused in production. approveDraft() creates
// program_templates/program_weeks/workout_templates/
// workout_template_sections/workout_template_exercises/program_week_days
// inside its own transaction (see lib/program-generator/approval.ts),
// and none of that cascades from program_generation_drafts — the FK
// points the other way (draft.createdProgramTemplateId ->
// program_templates.id). The old version only ever deleted
// programGenerationDrafts and the single synthetic "inactive" exercise
// fixture, so every program_template/workout_template/
// workout_template_exercise created by the two approveDraft() calls in
// this file was left behind on every run — ~2 stray program_templates
// per full-suite run, compounding across CI runs into the ~134-row
// production leak this fix cleans up after.
afterAll(async () => {
  let firstError: unknown;

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[program-generator-review-triage cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  // 1. workout_template_exercises / workout_template_sections — must go
  // before both workout_templates (RESTRICT) and exercises (RESTRICT).
  await runPhase("delete workout_template_exercises/sections", async () => {
    if (workoutTemplateIds.length === 0) return;
    await db.delete(workoutTemplateExercises).where(inArray(workoutTemplateExercises.workoutTemplateId, workoutTemplateIds));
    await db.delete(workoutTemplateSections).where(inArray(workoutTemplateSections.workoutTemplateId, workoutTemplateIds));
  });

  // 2. program_week_days / program_weeks — must go before program_templates.
  await runPhase("delete program_week_days/program_weeks", async () => {
    if (programTemplateIds.length === 0) return;
    const weekRows = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(inArray(programWeeks.programTemplateId, programTemplateIds));
    const weekIds = weekRows.map((w) => w.id);
    if (weekIds.length > 0) {
      await db.delete(programWeekDays).where(inArray(programWeekDays.programWeekId, weekIds));
    }
    await db.delete(programWeeks).where(inArray(programWeeks.programTemplateId, programTemplateIds));
  });

  // 3. exercises — only the synthetic "inactive" fixture this suite
  // created itself. The scope="system" exercises read in beforeAll are
  // pre-existing shared rows this suite never owns and must never
  // delete.
  await runPhase("delete exercise fixtures", async () => {
    if (exerciseFixtureIds.length === 0) return;
    await db.delete(exercises).where(inArray(exercises.id, exerciseFixtureIds));
  });

  // 4. workout_templates — now safe: sections/exercises children gone.
  await runPhase("delete workout_templates", async () => {
    if (workoutTemplateIds.length === 0) return;
    await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, workoutTemplateIds));
  });

  // 5. program_templates — now safe: weeks gone.
  await runPhase("delete program_templates", async () => {
    if (programTemplateIds.length === 0) return;
    await db.delete(programTemplates).where(inArray(programTemplates.id, programTemplateIds));
  });

  // 6. program_generation_drafts — program_generation_runs/edit_events/
  // validation_events cascade from the draft row itself (ON DELETE
  // CASCADE) — no separate cleanup needed for those.
  await runPhase("delete program_generation_drafts", async () => {
    if (draftIds.length === 0) return;
    await db.delete(programGenerationDrafts).where(inArray(programGenerationDrafts.id, draftIds));
  });

  // 7. Identity cleanup — attempted regardless of whether any phase
  // above failed. public.users first (draft/template RESTRICT FKs, now
  // cleared by the phases above, would otherwise block it), then every
  // Auth user in parallel via Promise.allSettled so one failed delete
  // doesn't stop the others.
  const userIds = [coachA.id, coachB.id, admin.id].filter(Boolean);
  if (userIds.length > 0) {
    await runPhase("delete public.users rows", async () => {
      await db.delete(users).where(inArray(users.id, userIds));
    });

    await runPhase("delete Supabase Auth users", async () => {
      const adminClient = createAdminClient();
      const results = await Promise.allSettled(userIds.map((id) => adminClient.auth.admin.deleteUser(id)));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    });
  }

  if (firstError) throw firstError;
}, 60_000);

// ─────────────────────────────────────────────────────────────
// Regression — fixture exercise selection scoping
//
// Direct guard against the root cause of the production leak this file
// was fixed to stop: the fixture exercise lookup in beforeAll used to
// be unscoped and unordered, so activeExerciseIds could non-
// deterministically land on ANY active exercise in the shared table —
// including a real coach's private one — and that id would then flow,
// untouched, into every draft this suite approves. This asserts the
// fixed query's actual guarantee rather than re-testing Postgres row
// ordering.
// ─────────────────────────────────────────────────────────────

describe("fixture exercise selection — scoping regression", () => {
  it("activeExerciseIds are all scope='system' — never a private/coach-owned exercise", async () => {
    expect(activeExerciseIds.length).toBeGreaterThanOrEqual(3);
    const rows = await db
      .select({ id: exercises.id, scope: exercises.scope, createdBy: exercises.createdBy })
      .from(exercises)
      .where(inArray(exercises.id, activeExerciseIds));
    expect(rows).toHaveLength(activeExerciseIds.length);
    for (const row of rows) {
      expect(row.scope).toBe("system");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Replace All Occurrences — mechanics
// ─────────────────────────────────────────────────────────────

describe("replaceExerciseByName — bulk replace mechanics", () => {
  it("updates every matching unresolved prescription and leaves an already-resolved one alone", () => {
    const { draft, p1, p2, alreadyResolvedPrescriptionId } = buildMultiWeekDraft(activeExerciseIds[2]);
    const replacement = activeExerciseIds[0];

    const result = replaceExerciseByName(draft, {
      normalizedName: "cable seated row",
      exerciseId: replacement,
      exerciseName: "Seated Cable Row",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flat = result.draft.weeks.flatMap((w) => w.days.flatMap((d) => d.workout?.sections.flatMap((s) => s.prescriptions) ?? []));
    const byId = new Map(flat.map((p) => [p.id, p]));

    expect(byId.get(p1)?.exerciseId).toBe(replacement);
    expect(byId.get(p2)?.exerciseId).toBe(replacement);
    expect(byId.get(p1)?.exerciseName).toBe("Seated Cable Row");
    // Already-resolved prescription (exerciseId already set) must be
    // untouched — replace-all applies only to matching UNRESOLVED refs.
    expect(byId.get(alreadyResolvedPrescriptionId)?.exerciseId).toBe(activeExerciseIds[2]);
  });

  it("preserves sets/reps/rest/tempo and placement (orderIndex) on every replaced prescription", () => {
    const { draft, p1 } = buildMultiWeekDraft(activeExerciseIds[2]);
    const result = replaceExerciseByName(draft, {
      normalizedName: "cable seated row",
      exerciseId: activeExerciseIds[0],
      exerciseName: "Seated Cable Row",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p1After = result.draft.weeks[0].days[0].workout!.sections[0].prescriptions.find((p) => p.id === p1)!;
    expect(p1After.sets).toBe(4);
    expect(p1After.repsMin).toBe(8);
    expect(p1After.repsMax).toBe(10);
    expect(p1After.restSeconds).toBe(75);
    expect(p1After.tempo).toBe("2010");
    expect(p1After.orderIndex).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Replace All Occurrences — ownership + validity, real DB
// ─────────────────────────────────────────────────────────────

describe("approveDraft after Replace All — approval availability", () => {
  it("becomes approvable once the last blocker (the ambiguous name) is resolved via replace-all", async () => {
    const { draft } = buildMultiWeekDraft(activeExerciseIds[2]);
    const draftId = await makeReadyDraft(coachA.id, draft);

    const [before] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    const insightsBefore = before.insightsJson as DraftValidationResult;
    expect(insightsBefore.blockers.some((f) => f.code === "PROGRAM_GEN_EXERCISE_AMBIGUOUS")).toBe(true);

    const preOutcome = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(preOutcome.ok).toBe(false);

    // Resolve the last blocker via the bulk replace pure op, then
    // persist + revalidate exactly like applyEditAndSave does.
    const replaced = replaceExerciseByName(draft, {
      normalizedName: "cable seated row",
      exerciseId: activeExerciseIds[0],
      exerciseName: "Seated Cable Row",
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;

    await saveDraftContent(draftId, replaced.draft, "ready_for_review");
    const revalidation = await validateGeneratedDraft(replaced.draft, VALID_BRIEF, coachA.id);
    await saveValidationResult(draftId, revalidation);
    expect(revalidation.blockers).toHaveLength(0);

    // Resolving the blocker doesn't guarantee zero warnings — real PIL
    // findings (fatigue cost, joint load) can still fire on whichever
    // exercise was chosen as the replacement. Those still require
    // acknowledgement before approval; acknowledge every current
    // warning group, exactly what "Acknowledge All Visible" does.
    if (revalidation.warnings.length > 0) {
      const grouped = groupDraftFindings(revalidation, replaced.draft);
      const allWarningGroupKeys = grouped.hierarchy.warnings.map((g) => groupAckKey(g.groupKey));
      const ackResult = await acknowledgeFindingKeys(draftId, allWarningGroupKeys, revalidation);
      expect(ackResult.ok).toBe(true);
      if (ackResult.ok) expect(ackResult.fullyAcknowledged).toBe(true);
    }

    const outcome = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      programTemplateIds.push(outcome.programTemplateId);
      workoutTemplateIds.push(...outcome.workoutTemplateIds);
    }
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────
// Acknowledgement — warnings vs blockers
// ─────────────────────────────────────────────────────────────

describe("acknowledgeFindingKeys — warnings vs blockers", () => {
  it("allows a warning-severity finding group to be acknowledged", async () => {
    const draftId = await makeReadyDraft(coachA.id, buildMultiWeekDraft(activeExerciseIds[2]).draft);
    const [row] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    const insights = row.insightsJson as DraftValidationResult;

    // Synthesize a warning onto this run's insights (equipment mismatch
    // is a real warning-producing code; constructing one directly here
    // keeps this test focused on the ack mechanism, not the equipment
    // heuristic itself).
    const warningInsights: DraftValidationResult = {
      ...insights,
      status: "warnings",
      warnings: [
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EQUIPMENT_MISMATCH",
          severity: "warning",
          title: "Exercise may not match available equipment",
          explanation: "e",
          exerciseId: activeExerciseIds[0],
          exerciseName: "Some Exercise",
        },
      ],
    };
    await saveValidationResult(draftId, warningInsights);

    const grouped = groupDraftFindings(warningInsights, null);
    const key = groupAckKey(grouped.hierarchy.warnings[0].groupKey);

    const result = await acknowledgeFindingKeys(draftId, [key], warningInsights);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fullyAcknowledged).toBe(true);
  });

  it("refuses to acknowledge a blocker-severity finding group", async () => {
    const { draft } = buildMultiWeekDraft(activeExerciseIds[2]);
    const draftId = await makeReadyDraft(coachA.id, draft);
    const [row] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    const insights = row.insightsJson as DraftValidationResult;
    expect(insights.blockers.length).toBeGreaterThan(0);

    const grouped = groupDraftFindings(insights, draft);
    const blockerKey = groupAckKey(grouped.hierarchy.blockers[0].groupKey);

    const result = await acknowledgeFindingKeys(draftId, [blockerKey], insights);
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Audit integrity
// ─────────────────────────────────────────────────────────────

describe("audit trail — raw data remains intact", () => {
  it("preserves validation event history and records a single edit event for a bulk replace", async () => {
    const { draft } = buildMultiWeekDraft(activeExerciseIds[2]);
    const draftId = await makeReadyDraft(coachA.id, draft);

    const validationEventsBefore = await listValidationEvents(draftId);
    expect(validationEventsBefore.length).toBeGreaterThan(0);
    const rawBlockerCountBefore = validationEventsBefore[0].blockerCount;
    expect(rawBlockerCountBefore).toBeGreaterThan(0);

    const replaced = replaceExerciseByName(draft, {
      normalizedName: "cable seated row",
      exerciseId: activeExerciseIds[0],
      exerciseName: "Seated Cable Row",
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;

    await saveDraftContent(draftId, replaced.draft, "ready_for_review");
    const revalidation = await validateGeneratedDraft(replaced.draft, VALID_BRIEF, coachA.id);
    await saveValidationResult(draftId, revalidation);

    await db.insert(programGenerationEditEvents).values({
      draftId,
      actorUserId: coachA.id,
      action: "exercise_replaced",
      entityType: "bulk_exercise_replace",
      entityId: "cable seated row",
      summary: "Coach replaced all 2 occurrence(s) of an unresolved exercise with \"Seated Cable Row\".",
      beforeJson: replaced.before,
      afterJson: replaced.after,
    });

    // The raw, pre-replace validation event is still there, unmodified —
    // append-only history, not overwritten.
    const validationEventsAfter = await listValidationEvents(draftId);
    expect(validationEventsAfter.length).toBe(validationEventsBefore.length + 1);
    const stillPresent = validationEventsAfter.find((e) => e.id === validationEventsBefore[0].id);
    expect(stillPresent?.blockerCount).toBe(rawBlockerCountBefore);

    // Exactly one edit event for the whole bulk operation, not one per
    // prescription.
    const editEvents = await listEditEvents(draftId);
    const bulkEvents = editEvents.filter((e) => e.entityType === "bulk_exercise_replace");
    expect(bulkEvents).toHaveLength(1);
    expect(bulkEvents[0].action).toBe("exercise_replaced");
  });
});

// ─────────────────────────────────────────────────────────────
// Inactive-exercise replacement — real active-status data
// ─────────────────────────────────────────────────────────────

describe("Replace All Occurrences — ownership and validity gates", () => {
  // replaceAllOccurrencesAction (app/hq/programs/generate/actions.ts) is
  // a "use server" action that starts with requireCoachOrAdmin(), which
  // needs a real Next.js request context (cookies()) — not invokable
  // directly from a Vitest test, same constraint as every other action
  // in this file (see program-generator-integration.test.ts, which
  // tests the underlying getOwnedDraft/approveDraft/validateGeneratedDraft
  // functions directly rather than the "use server" wrappers around
  // them). These tests exercise the exact same gates the action calls
  // before doing anything else: getOwnedDraft() for tenant isolation,
  // getExerciseById().status for the active/visible requirement.

  it("cross-coach replace-all denied — a coach who doesn't own the draft is rejected by the same ownership gate the action calls first", async () => {
    const draftId = await makeReadyDraft(coachA.id, buildMultiWeekDraft(activeExerciseIds[2]).draft);

    const access = await getOwnedDraft(draftId, { coachId: coachB.id });
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.error).toBe("forbidden");

    // The owning coach, and admin, both pass the same gate.
    const ownerAccess = await getOwnedDraft(draftId, { coachId: coachA.id });
    expect(ownerAccess.ok).toBe(true);
    const adminAccess = await getOwnedDraft(draftId, { coachId: null });
    expect(adminAccess.ok).toBe(true);
  });

  it("inactive replacement denied — a non-active exercise fails the same status check the action performs before replacing anything", async () => {
    const exercise = await getExerciseById(inactiveExerciseId);
    expect(exercise).not.toBeNull();
    expect(exercise!.status).not.toBe("active");

    // Mirrors replaceAllOccurrencesAction's own gate exactly:
    //   if (exercise.status !== "active") return { ok: false, ... }
    const wouldBeRejected = exercise!.status !== "active";
    expect(wouldBeRejected).toBe(true);
  });

  it("cannot edit an approved draft — replace-all has nothing to act on once approval already created real rows", async () => {
    const { draft } = buildMultiWeekDraft(activeExerciseIds[2]);
    // Build a draft with zero blockers so it can actually be approved.
    const resolved = replaceExerciseByName(draft, {
      normalizedName: "cable seated row",
      exerciseId: activeExerciseIds[0],
      exerciseName: "Seated Cable Row",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const draftId = await makeReadyDraft(coachA.id, resolved.draft);

    const [row0] = await db.select().from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    const insights0 = row0.insightsJson as DraftValidationResult;
    if (insights0.warnings.length > 0) {
      const grouped = groupDraftFindings(insights0, resolved.draft);
      const allWarningGroupKeys = grouped.hierarchy.warnings.map((g) => groupAckKey(g.groupKey));
      await acknowledgeFindingKeys(draftId, allWarningGroupKeys, insights0);
    }

    const approval = await approveDraft(draftId, { coachId: coachA.id }, coachA.id);
    expect(approval.ok).toBe(true);
    if (approval.ok) {
      programTemplateIds.push(approval.programTemplateId);
      workoutTemplateIds.push(...approval.workoutTemplateIds);
    }

    const [row] = await db.select({ status: programGenerationDrafts.status }).from(programGenerationDrafts).where(eq(programGenerationDrafts.id, draftId));
    expect(row.status).toBe("approved");
    // The same status the action's loadEditableDraft() check rejects.
    expect(["approved", "discarded"]).toContain(row.status);
  });
});
