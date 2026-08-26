// ─────────────────────────────────────────────────────────────
// Workout Set Draft Autosave — integration suite
//
// Covers the A–U items of this feature's own test matrix (V/W/X —
// "existing workout-session-resilience/timezone/concurrent-session-
// creation behavior unchanged" — are regression checks, not new
// behavior, and are satisfied by re-running
// workout-session-resilience.test.ts unchanged, not duplicated here).
//
// Same fixture/cleanup pattern established in
// workout-session-resilience.test.ts: real Supabase Auth users,
// randomUUID()-based slugs, full FK-safe cleanup in afterAll(), a
// pinned Monday-noon-Chicago "now" for every createWorkoutSession call
// (that function re-derives and validates against getTodayWorkout()'s
// own authoritative, timezone-dependent resolution).
// ─────────────────────────────────────────────────────────────

process.env.TZ = "UTC";

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, programTemplates, workoutTemplates, type TemplateStatus } from "../schema";
import {
  clientPrograms,
  clientProgramWeeks,
  clientProgramWeekDays,
  workoutSessions,
  workoutSetLogs,
} from "../schema-program";
import { exercises, workoutTemplateSections, workoutTemplateExercises } from "../schema-exercise";
import {
  createWorkoutSession,
  logSet,
  saveSetDraft,
  getWorkoutSession,
  updateWorkoutSession,
  getHistoricalSessionDetail,
  WorkoutSessionAuthorizationError,
} from "../workout-session-service";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

vi.setConfig({ testTimeout: 30_000 });

const db = getDb();

const clientA = { id: "" };
const clientB = { id: "" };
const coach = { id: "" };

let exerciseId = "";

const programIds: string[] = [];
const clientProgramIds: string[] = [];
const clientProgramWeekIds: string[] = [];
const workoutTemplateIds: string[] = [];
const sessionIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `wsda-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
  return data.user.id;
}

// Every exercise here prescribes 3 sets (setsPerExercise) so out-of-
// range setNumber tests (Q) have a real, deterministic boundary.
async function createBlueprint(name: string, status: TemplateStatus = "active"): Promise<string> {
  const [wt] = await db
    .insert(workoutTemplates)
    .values({ name, slug: `wsda-test-${randomUUID()}`, recommendedExperienceLevel: "intermediate", status, createdBy: coach.id })
    .returning({ id: workoutTemplates.id });
  const [section] = await db
    .insert(workoutTemplateSections)
    .values({ workoutTemplateId: wt.id, name: "Main", sectionType: "main_lift", orderIndex: 0 })
    .returning({ id: workoutTemplateSections.id });
  await db.insert(workoutTemplateExercises).values({ workoutTemplateId: wt.id, sectionId: section.id, exerciseId, orderIndex: 0, sets: 3, repsMin: 8, repsMax: 12 });
  workoutTemplateIds.push(wt.id);
  return wt.id;
}

async function resetClient(clientId: string): Promise<void> {
  await db.update(clientPrograms).set({ status: "inactive" }).where(and(eq(clientPrograms.clientId, clientId), eq(clientPrograms.status, "active")));
  await db
    .update(workoutSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(workoutSessions.clientId, clientId), eq(workoutSessions.status, "in_progress")));
}

async function createClientProgram(clientId: string, startDate: string, dayWorkouts: Record<number, string | null>): Promise<{ clientProgramId: string }> {
  await resetClient(clientId);

  const [pt] = await db
    .insert(programTemplates)
    .values({ name: `WSDA Test Program ${randomUUID().slice(0, 8)}`, slug: `wsda-test-program-${randomUUID()}`, category: "muscle_growth", experienceLevel: "intermediate", status: "active", createdBy: coach.id, defaultDurationWeeks: 8 })
    .returning({ id: programTemplates.id });
  programIds.push(pt.id);

  const [cp] = await db
    .insert(clientPrograms)
    .values({ clientId, programTemplateId: pt.id, startDate, status: "active" })
    .returning({ id: clientPrograms.id });
  clientProgramIds.push(cp.id);

  const [week] = await db.insert(clientProgramWeeks).values({ clientProgramId: cp.id, weekNumber: 1, label: "Week 1" }).returning({ id: clientProgramWeeks.id });
  clientProgramWeekIds.push(week.id);

  const rows = Object.entries(dayWorkouts).map(([dow, wtId]) => ({
    clientProgramWeekId: week.id,
    dayOfWeek: Number(dow),
    workoutTemplateId: wtId,
  }));
  if (rows.length > 0) await db.insert(clientProgramWeekDays).values(rows);

  return { clientProgramId: cp.id };
}

const MONDAY_NOON_CHICAGO = "2026-08-24T12:00:00-05:00";
const MONDAY_STARTDATE = "2026-08-24";

// Creates a fresh in-progress session for clientA on a fresh blueprint
// (3 sets prescribed) and returns its id + the one exercise's row id.
async function freshSession(label: string): Promise<{ sessionId: string; exId: string }> {
  const wtId = await createBlueprint(`WSDA ${label}`);
  const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
  const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
  vi.useRealTimers();
  sessionIds.push(session.id);
  const [row] = await db.select({ id: workoutTemplateExercises.id }).from(workoutTemplateExercises).where(eq(workoutTemplateExercises.workoutTemplateId, wtId));
  return { sessionId: session.id, exId: row.id };
}

async function rawSetLog(sessionId: string, exId: string, setNumber: number) {
  const [row] = await db
    .select()
    .from(workoutSetLogs)
    .where(and(eq(workoutSetLogs.workoutSessionId, sessionId), eq(workoutSetLogs.workoutTemplateExerciseId, exId), eq(workoutSetLogs.setNumber, setNumber)));
  return row ?? null;
}

afterEach(() => {
  vi.useRealTimers();
});

beforeAll(async () => {
  [clientA.id, clientB.id, coach.id] = await Promise.all([createAuthUser("client-a"), createAuthUser("client-b"), createAuthUser("coach")]);
  await Promise.all([
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "WSDA Client A", timezone: "America/Chicago" },
    { userId: clientB.id, fullName: "WSDA Client B", timezone: "America/Chicago" },
  ]);

  const [active] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.status, "active")).limit(1);
  if (!active) throw new Error("no active exercise rows exist");
  exerciseId = active.id;
});

afterAll(async () => {
  vi.useRealTimers();
  let firstError: unknown;
  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[workout-set-draft-autosave cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  await runPhase("delete workout_set_logs/workout_sessions", async () => {
    if (sessionIds.length > 0) {
      await db.delete(workoutSetLogs).where(inArray(workoutSetLogs.workoutSessionId, sessionIds));
      await db.delete(workoutSessions).where(inArray(workoutSessions.id, sessionIds));
    }
    if (clientProgramIds.length > 0) {
      const rows = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(inArray(workoutSessions.clientProgramId, clientProgramIds));
      const extra = rows.map((r) => r.id).filter((id) => !sessionIds.includes(id));
      if (extra.length > 0) {
        await db.delete(workoutSetLogs).where(inArray(workoutSetLogs.workoutSessionId, extra));
        await db.delete(workoutSessions).where(inArray(workoutSessions.id, extra));
      }
    }
  });

  await runPhase("delete client_program_week_days/weeks/programs", async () => {
    if (clientProgramWeekIds.length > 0) {
      await db.delete(clientProgramWeekDays).where(inArray(clientProgramWeekDays.clientProgramWeekId, clientProgramWeekIds));
      await db.delete(clientProgramWeeks).where(inArray(clientProgramWeeks.id, clientProgramWeekIds));
    }
    if (clientProgramIds.length > 0) await db.delete(clientPrograms).where(inArray(clientPrograms.id, clientProgramIds));
  });

  await runPhase("delete program_templates", async () => {
    if (programIds.length > 0) await db.delete(programTemplates).where(inArray(programTemplates.id, programIds));
  });

  await runPhase("delete workout_template_exercises/sections/templates", async () => {
    if (workoutTemplateIds.length > 0) {
      await db.delete(workoutTemplateExercises).where(inArray(workoutTemplateExercises.workoutTemplateId, workoutTemplateIds));
      await db.delete(workoutTemplateSections).where(inArray(workoutTemplateSections.workoutTemplateId, workoutTemplateIds));
      await db.delete(workoutTemplates).where(inArray(workoutTemplates.id, workoutTemplateIds));
    }
  });

  await runPhase("delete client_profiles/users", async () => {
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, [clientA.id, clientB.id]));
    await db.delete(users).where(inArray(users.id, [clientA.id, clientB.id, coach.id]));
  });

  await runPhase("delete Supabase Auth users", async () => {
    const admin = createAdminClient();
    const results = await Promise.allSettled([clientA.id, clientB.id, coach.id].map((id) => admin.auth.admin.deleteUser(id)));
    for (const r of results) if (r.status === "rejected") throw r.reason;
  });

  if (firstError) throw firstError;
}, 60_000);

// ─────────────────────────────────────────────────────────────

describe("A/B/C/D — draft autosave persists reps, weight, duration, and RPE", () => {
  it("saveSetDraft writes all four fields as status='draft'", async () => {
    const { sessionId, exId } = await freshSession("ABCD");
    const result = await saveSetDraft({
      workoutSessionId: sessionId,
      clientId: clientA.id,
      workoutTemplateExerciseId: exId,
      setNumber: 1,
      actualReps: 8,
      actualWeightKg: "61.2350",
      actualDurationSeconds: 45,
      actualRpe: "7.5",
      draftSeq: 1,
    });
    expect(result.applied).toBe(true);

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.status).toBe("draft");
    expect(row?.actualReps).toBe(8);
    expect(row?.actualWeightKg).toBe("61.24"); // numeric(7,2) storage
    expect(row?.actualDurationSeconds).toBe(45);
    expect(row?.actualRpe).toBe("7.5");
    expect(row?.draftSeq).toBe(1);
  });
});

describe("E/F/L — hydration distinguishes a restored draft from a restored logged set", () => {
  it("a draft row surfaces status='draft' and a logged row surfaces status='logged' from getWorkoutSession", async () => {
    const { sessionId, exId } = await freshSession("EFL");

    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, actualWeightKg: "40.00", draftSeq: 1 });
    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 2, actualReps: 10, actualWeightKg: "50.00" });

    const result = await getWorkoutSession(sessionId, clientA.id);
    expect(result).not.toBeNull();
    const draftRow = result!.sets.find((s) => s.setNumber === 1)!;
    const loggedRow = result!.sets.find((s) => s.setNumber === 2)!;

    // (E) unfinished autosave restores as unfinished, with its typed
    // values intact — (L) same contract, framed as "after refresh".
    expect(draftRow.status).toBe("draft");
    expect(draftRow.actualReps).toBe(5);
    expect(draftRow.actualWeightKg).toBe("40.00");

    // (F) a logged set restores as completed.
    expect(loggedRow.status).toBe("logged");
    expect(loggedRow.actualReps).toBe(10);
  });
});

describe("G — draft rows never move completionPercent", () => {
  it("two drafted sets leave completionPercent at 0; logging one of the three prescribed sets moves it to exactly one set's share", async () => {
    const { sessionId, exId } = await freshSession("G");

    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 1 });
    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 2, actualReps: 5, draftSeq: 1 });

    const [afterDrafts] = await db.select({ pct: workoutSessions.completionPercent }).from(workoutSessions).where(eq(workoutSessions.id, sessionId));
    expect(afterDrafts.pct).toBe(0);

    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 3, actualReps: 5 });

    const [afterLog] = await db.select({ pct: workoutSessions.completionPercent }).from(workoutSessions).where(eq(workoutSessions.id, sessionId));
    // 1 of 3 prescribed sets logged — the two drafts must not be
    // counted alongside it.
    expect(afterLog.pct).toBe(33);
  });
});

describe("H — Log transitions a drafted set to completed", () => {
  it("logSet on a set that already has a draft row overwrites it to status='logged' and clears draftSeq", async () => {
    const { sessionId, exId } = await freshSession("H");

    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, actualWeightKg: "40.00", draftSeq: 1 });
    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 12, actualWeightKg: "70.00" });

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.status).toBe("logged");
    expect(row?.draftSeq).toBeNull();
    expect(row?.actualReps).toBe(12);
    expect(row?.actualWeightKg).toBe("70.00");
  });
});

describe("I/J/R — the newest draftSeq always wins regardless of arrival order (single- or multi-tab)", () => {
  it("a lower draftSeq arriving after a higher one is rejected and never overwrites it", async () => {
    const { sessionId, exId } = await freshSession("IJR");

    const first = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 11, draftSeq: 200 });
    expect(first.applied).toBe(true);

    // Simulates a network-reordered (or second-tab, older-edit) write
    // arriving AFTER the newer one, carrying an OLDER seq.
    const second = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 100 });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe("stale");

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.actualReps).toBe(11); // the newer write's value, untouched
    expect(row?.draftSeq).toBe(200);
  });

  it("a strictly higher draftSeq is always applied, confirming the guard compares rather than just rejecting all conflicts", async () => {
    const { sessionId, exId } = await freshSession("IJR2");

    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 100 });
    const later = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 9, draftSeq: 200 });
    expect(later.applied).toBe(true);

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.actualReps).toBe(9);
    expect(row?.draftSeq).toBe(200);
  });
});

describe("K — a draft can never downgrade an already-logged set", () => {
  it("saveSetDraft against a logged row is rejected and leaves the logged values untouched", async () => {
    const { sessionId, exId } = await freshSession("K");

    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 10, actualWeightKg: "60.00" });

    const attempt = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 999, actualWeightKg: "1.00", draftSeq: Date.now() });
    expect(attempt.applied).toBe(false);

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.status).toBe("logged");
    expect(row?.actualReps).toBe(10);
    expect(row?.actualWeightKg).toBe("60.00");
  });
});

describe("M — a rejected/invalid autosave never reports applied:true", () => {
  it("a value that violates a DB check constraint throws rather than silently reporting success", async () => {
    const { sessionId, exId } = await freshSession("M");

    await expect(
      saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualRpe: "15", draftSeq: 1 }),
    ).rejects.toThrow();

    // No row should have been left behind by the failed insert.
    const row = await rawSetLog(sessionId, exId, 1);
    expect(row).toBeNull();
  });
});

describe("N — Log persists its own latest values even after an earlier draft was rejected as stale", () => {
  it("a stale-rejected draft has no effect on the values Log subsequently persists", async () => {
    const { sessionId, exId } = await freshSession("N");

    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 200 });
    const stale = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 1, draftSeq: 50 });
    expect(stale.applied).toBe(false);

    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 12, actualWeightKg: "80.00" });

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row?.status).toBe("logged");
    expect(row?.actualReps).toBe(12);
    expect(row?.actualWeightKg).toBe("80.00");
  });
});

describe("O — cross-client autosave is rejected", () => {
  it("clientB cannot saveSetDraft against clientA's session", async () => {
    const { sessionId, exId } = await freshSession("O");

    await expect(
      saveSetDraft({ workoutSessionId: sessionId, clientId: clientB.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 1 }),
    ).rejects.toThrow(WorkoutSessionAuthorizationError);

    const row = await rawSetLog(sessionId, exId, 1);
    expect(row).toBeNull();
  });
});

describe("P — an unrecognized session id is rejected", () => {
  it("saveSetDraft against a random UUID session throws", async () => {
    const { exId } = await freshSession("P");
    await expect(
      saveSetDraft({ workoutSessionId: randomUUID(), clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 5, draftSeq: 1 }),
    ).rejects.toThrow(WorkoutSessionAuthorizationError);
  });
});

describe("Q — an exercise/set not in the frozen snapshot is rejected", () => {
  it("an exercise id that never belonged to this session's workout is rejected", async () => {
    const { sessionId } = await freshSession("Q1");
    await expect(
      saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: randomUUID(), setNumber: 1, actualReps: 5, draftSeq: 1 }),
    ).rejects.toThrow(WorkoutSessionAuthorizationError);
  });

  it("a set number beyond what this exercise prescribes (3 sets) is rejected", async () => {
    const { sessionId, exId } = await freshSession("Q2");
    await expect(
      saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 99, actualReps: 5, draftSeq: 1 }),
    ).rejects.toThrow(WorkoutSessionAuthorizationError);
  });
});

describe("S/T — a finished session rejects a late draft and is never reopened or corrupted by it", () => {
  it("saveSetDraft against a completed session is a silent no-op and leaves the session completed with no stray row", async () => {
    const { sessionId, exId } = await freshSession("ST");

    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 10 });
    await updateWorkoutSession(sessionId, clientA.id, { status: "completed" });

    // A set that was NEVER touched before Finish — the case that would
    // otherwise let a late draft insert a stray row into a finished
    // session.
    const late = await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 2, actualReps: 8, draftSeq: 1 });
    expect(late.applied).toBe(false);
    expect(late.reason).toBe("session-not-active");

    const [session] = await db.select({ status: workoutSessions.status }).from(workoutSessions).where(eq(workoutSessions.id, sessionId));
    expect(session.status).toBe("completed"); // never reopened

    const strayRow = await rawSetLog(sessionId, exId, 2);
    expect(strayRow).toBeNull(); // no draft row was ever inserted
  });
});

describe("U — existing logged rows remain fully compatible with history", () => {
  it("a logged set in a completed session still appears correctly via getHistoricalSessionDetail", async () => {
    const { sessionId, exId } = await freshSession("U");

    await logSet({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 10, actualWeightKg: "55.00" });
    await saveSetDraft({ workoutSessionId: sessionId, clientId: clientA.id, workoutTemplateExerciseId: exId, setNumber: 2, actualReps: 4, draftSeq: 1 });
    await updateWorkoutSession(sessionId, clientA.id, { status: "completed" });

    const detail = await getHistoricalSessionDetail(sessionId, clientA.id);
    expect(detail).not.toBeNull();
    // The logged set (1) must appear; the never-logged draft (2) must
    // not appear as if it were a completed historical set.
    expect(detail!.setLogs).toHaveLength(1);
    expect(detail!.setLogs[0].setNumber).toBe(1);
    expect(detail!.setLogs[0].actualReps).toBe(10);
  });
});
