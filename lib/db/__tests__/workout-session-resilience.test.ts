// ─────────────────────────────────────────────────────────────
// In-Progress Workout Session Resilience — integration suite
//
// Covers the remediation for two independently-confirmed P1 defects:
//   Bug A — WorkoutSession.tsx never hydrated persisted
//           workout_set_logs on mount (fixed client-side; the
//           server-side half of that contract — getWorkoutSession's
//           returned shape and correctness — is what's tested here).
//   Bug B — getTodayWorkout() recomputed "today" from server/UTC time
//           on every call and never preferred an existing in-progress
//           session, so a refresh late enough in the evening (server
//           UTC date rolled over while the client's own local day had
//           not) silently swapped to a different scheduled workout.
//
// Same fixture/cleanup pattern established across this session's other
// suites: real Supabase Auth users, randomUUID()-based slugs, full
// FK-safe cleanup in afterAll(). Timezone-boundary tests pin
// process.env.TZ="UTC" (matching Vercel's actual runtime default —
// see this file's own comment on that) and use vi.setSystemTime to
// move a mocked "now" across real UTC-vs-America/Chicago boundaries,
// exactly as the investigation's own reproduction did.
// ─────────────────────────────────────────────────────────────

// Pinned to UTC — see lib/db/__tests__/tmp-jenny-bug-repro.test.ts's
// investigation-era rationale (deleted; reasoning restated here):
// Date.getDay()/local Intl calls read the PROCESS's own timezone, so
// running this suite from a non-UTC dev machine without this line
// would exercise a different (also real, but not the production)
// server/client timezone mismatch than what Vercel actually runs.
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
import { getTodayWorkout, getActiveWorkoutSession } from "../client-program-service";
import { createWorkoutSession, logSet, getWorkoutSession, updateWorkoutSession, WorkoutSessionAuthorizationError } from "../workout-session-service";
import { authorizeWorkoutSession } from "@/lib/auth/guards";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

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
const exerciseFixtureIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `wsr-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
  return data.user.id;
}

async function createBlueprint(name: string, status: TemplateStatus = "active"): Promise<string> {
  const [wt] = await db
    .insert(workoutTemplates)
    .values({ name, slug: `wsr-test-${randomUUID()}`, recommendedExperienceLevel: "intermediate", status, createdBy: coach.id })
    .returning({ id: workoutTemplates.id });
  const [section] = await db
    .insert(workoutTemplateSections)
    .values({ workoutTemplateId: wt.id, name: "Main", sectionType: "main_lift", orderIndex: 0 })
    .returning({ id: workoutTemplateSections.id });
  await db.insert(workoutTemplateExercises).values({ workoutTemplateId: wt.id, sectionId: section.id, exerciseId, orderIndex: 0, sets: 3, repsMin: 8, repsMax: 12 });
  workoutTemplateIds.push(wt.id);
  return wt.id;
}

// Resets a client to a hermetic starting state for the NEXT test: no
// active client_programs row (uq_client_active_program allows at most
// one) and no in_progress workout_sessions row (createWorkoutSession's
// own new idempotent-reuse behavior would otherwise hand a later
// test's "start a fresh session" call back an EARLIER test's leftover
// in-progress session for the same client). Both are marked
// inactive/completed — never deleted — so this stays a realistic
// "client moved on" state rather than a destructive reset, and every
// row this suite ever creates is still swept in afterAll() regardless.
async function resetClient(clientId: string): Promise<void> {
  await db.update(clientPrograms).set({ status: "inactive" }).where(and(eq(clientPrograms.clientId, clientId), eq(clientPrograms.status, "active")));
  await db
    .update(workoutSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(workoutSessions.clientId, clientId), eq(workoutSessions.status, "in_progress")));
}

// dayWorkouts maps dayOfWeek (0=Sun..6=Sat) -> workoutTemplateId | null
//
// Several tests below reuse clientA/clientB across multiple it() blocks
// rather than minting a fresh Auth user per test (Auth user creation is
// the slow, rate-limited part of this suite) — resetClient() keeps each
// test's own fixtures hermetic despite that reuse.
async function createClientProgram(clientId: string, startDate: string, dayWorkouts: Record<number, string | null>, totalWeeks = 8): Promise<{ clientProgramId: string; weekId: string }> {
  await resetClient(clientId);

  const [pt] = await db
    .insert(programTemplates)
    .values({ name: `WSR Test Program ${randomUUID().slice(0, 8)}`, slug: `wsr-test-program-${randomUUID()}`, category: "muscle_growth", experienceLevel: "intermediate", status: "active", createdBy: coach.id, defaultDurationWeeks: totalWeeks })
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

  return { clientProgramId: cp.id, weekId: week.id };
}

// [Independent review remediation] createWorkoutSession() now
// re-derives and validates against getTodayWorkout()'s own
// authoritative resolution before creating a new session — which
// itself depends on real wall-clock time interpreted in the client's
// stored timezone. Every test that starts a session (rather than just
// reading already-created fixtures) therefore needs a PINNED, known
// "now" that actually resolves to the dayOfWeek its fixture's
// client_program_week_days row uses — relying on "whatever day this
// suite happens to run on" would make the whole file nondeterministic
// (and did, transiently, the moment this authorization check landed).
// Monday, Aug 24 2026, noon Central — already independently confirmed
// via the C/D/E boundary tests below — is the shared reference for
// clientA (timezone="America/Chicago"): resolves to dayOfWeek=1 in
// Chicago, matching a startDate of the same calendar day (elapsed=0,
// week 1).
const MONDAY_NOON_CHICAGO = "2026-08-24T12:00:00-05:00";
const MONDAY_STARTDATE = "2026-08-24";

// Ensures a thrown assertion inside a vi.useFakeTimers() block never
// leaves fake timers active for a LATER test in this file — every
// timer-mocking test below still calls vi.useRealTimers() itself on
// its own success path, but this is the backstop.
afterEach(() => {
  vi.useRealTimers();
});

async function getExerciseRowId(workoutTemplateId: string): Promise<string> {
  const [row] = await db.select({ id: workoutTemplateExercises.id }).from(workoutTemplateExercises).where(eq(workoutTemplateExercises.workoutTemplateId, workoutTemplateId));
  return row.id;
}

beforeAll(async () => {
  [clientA.id, clientB.id, coach.id] = await Promise.all([createAuthUser("client-a"), createAuthUser("client-b"), createAuthUser("coach")]);
  await Promise.all([
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "WSR Client A", timezone: "America/Chicago" },
    { userId: clientB.id, fullName: "WSR Client B", timezone: "Pacific/Auckland" },
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
      console.error(`[workout-session-resilience cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  await runPhase("delete workout_set_logs/workout_sessions", async () => {
    if (sessionIds.length > 0) {
      await db.delete(workoutSetLogs).where(inArray(workoutSetLogs.workoutSessionId, sessionIds));
      await db.delete(workoutSessions).where(inArray(workoutSessions.id, sessionIds));
    }
    // Also sweep by clientProgramId in case a test created a session via
    // createWorkoutSession() without the id being explicitly tracked.
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

  await runPhase("delete exercise fixtures", async () => {
    if (exerciseFixtureIds.length > 0) await db.delete(exercises).where(inArray(exercises.id, exerciseFixtureIds));
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

describe("A/H — persisted set hydration data (server-side contract WorkoutSession.tsx now consumes)", () => {
  it("logged sets round-trip weight/reps/duration/RPE correctly through getWorkoutSession", async () => {
    const wtId = await createBlueprint("WSR Hydration Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);
    const exId = await getExerciseRowId(wtId);

    await logSet({ workoutSessionId: session.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 8, actualWeightKg: "61.2350", actualDurationSeconds: 45, actualRpe: "7.5" });
    await logSet({ workoutSessionId: session.id, workoutTemplateExerciseId: exId, setNumber: 2, actualReps: 10, actualWeightKg: "58.9670", actualDurationSeconds: null, actualRpe: "8" });

    const result = await getWorkoutSession(session.id, clientA.id);
    expect(result).not.toBeNull();
    expect(result!.sets).toHaveLength(2);
    const set1 = result!.sets.find((s) => s.setNumber === 1)!;
    expect(set1.actualReps).toBe(8);
    expect(set1.actualWeightKg).toBe("61.24"); // numeric(7,2) storage
    expect(set1.actualDurationSeconds).toBe(45);
    expect(set1.actualRpe).toBe("7.5");
    const set2 = result!.sets.find((s) => s.setNumber === 2)!;
    expect(set2.actualReps).toBe(10);
    expect(set2.actualDurationSeconds).toBeNull();
  });
});

describe("I — no duplicate set logs on re-log (upsert identity)", () => {
  it("logging the same set twice updates in place rather than creating a second row", async () => {
    const wtId = await createBlueprint("WSR Upsert Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);
    const exId = await getExerciseRowId(wtId);

    await logSet({ workoutSessionId: session.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 8, actualWeightKg: "50.00" });
    await logSet({ workoutSessionId: session.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 9, actualWeightKg: "52.50" });

    const result = await getWorkoutSession(session.id, clientA.id);
    expect(result!.sets).toHaveLength(1);
    expect(result!.sets[0].actualReps).toBe(9);
  });
});

describe("B/C/D — session-first resolution across refresh, evening, and local-midnight boundaries", () => {
  it("B: a normal same-day refresh returns the exact same in-progress session", async () => {
    const wtId = await createBlueprint("WSR SameDay Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    const first = await getTodayWorkout(clientA.id);
    const second = await getTodayWorkout(clientA.id);
    expect(first.kind).toBe("workout");
    expect(second.kind).toBe("workout");
    if (first.kind !== "workout" || second.kind !== "workout") return;
    expect(first.data.existingSessionId).toBe(session.id);
    expect(second.data.existingSessionId).toBe(session.id);
    expect(second.data.workoutTemplateId).toBe(wtId);
  });

  it("C: Monday 6:30 PM Central session remains authoritative at 7:15 PM Central (already Tuesday UTC)", async () => {
    const wtMon = await createBlueprint("WSR Central Monday");
    const wtTue = await createBlueprint("WSR Central Tuesday");
    const { clientProgramId } = await createClientProgram(clientA.id, "2026-08-24", { 1: wtMon, 2: wtTue });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-24T18:30:00-05:00"));
    const before = await getTodayWorkout(clientA.id);
    expect(before.kind).toBe("workout");
    if (before.kind !== "workout") return;
    expect(before.data.workoutTemplateId).toBe(wtMon);

    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtMon, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: before.data.scheduledDate });
    sessionIds.push(session.id);

    vi.setSystemTime(new Date("2026-08-24T19:15:00-05:00")); // 00:15 UTC Tuesday
    const after = await getTodayWorkout(clientA.id);
    vi.useRealTimers();

    expect(after.kind).toBe("workout");
    if (after.kind !== "workout") return;
    expect(after.data.existingSessionId).toBe(session.id);
    expect(after.data.workoutTemplateId).toBe(wtMon); // NOT wtTue
    expect(after.data.scheduledDate).toBe(before.data.scheduledDate); // frozen, not re-derived
  });

  it("D: a session started before true local (Chicago) midnight remains authoritative after crossing it", async () => {
    const wtMon = await createBlueprint("WSR Local Midnight Monday");
    const wtTue = await createBlueprint("WSR Local Midnight Tuesday");
    const { clientProgramId } = await createClientProgram(clientA.id, "2026-08-24", { 1: wtMon, 2: wtTue });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-24T23:30:00-05:00")); // 11:30 PM Monday Chicago
    const before = await getTodayWorkout(clientA.id);
    expect(before.kind).toBe("workout");
    if (before.kind !== "workout") return;
    expect(before.data.workoutTemplateId).toBe(wtMon);

    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtMon, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: before.data.scheduledDate });
    sessionIds.push(session.id);

    vi.setSystemTime(new Date("2026-08-25T00:10:00-05:00")); // 12:10 AM Tuesday Chicago — true local midnight crossed
    const after = await getTodayWorkout(clientA.id);
    vi.useRealTimers();

    expect(after.kind).toBe("workout");
    if (after.kind !== "workout") return;
    expect(after.data.existingSessionId).toBe(session.id);
    expect(after.data.workoutTemplateId).toBe(wtMon);
  });
});

describe("E — completion after midnight hands off correctly, without hijacking the new day", () => {
  it("completing the Monday session after Tuesday begins locally stops it from being selected, and Tuesday's schedule proceeds normally", async () => {
    const wtMon = await createBlueprint("WSR PostMidnight Monday");
    const wtTue = await createBlueprint("WSR PostMidnight Tuesday");
    const { clientProgramId } = await createClientProgram(clientA.id, "2026-08-24", { 1: wtMon, 2: wtTue });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-24T23:30:00-05:00"));
    const before = await getTodayWorkout(clientA.id);
    if (before.kind !== "workout") throw new Error("setup failed");
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtMon, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: before.data.scheduledDate });
    sessionIds.push(session.id);

    vi.setSystemTime(new Date("2026-08-25T00:20:00-05:00")); // after local midnight
    await updateWorkoutSession(session.id, clientA.id, { status: "completed" });

    const active = await getActiveWorkoutSession(clientA.id);
    expect(active).toBeNull();

    const after = await getTodayWorkout(clientA.id);
    vi.useRealTimers();

    expect(after.kind).toBe("workout");
    if (after.kind !== "workout") return;
    expect(after.data.workoutTemplateId).toBe(wtTue);
    expect(after.data.existingSessionId).not.toBe(session.id);

    // The Monday session itself is untouched by this — completed, not
    // silently reassociated with Tuesday.
    const monday = await getWorkoutSession(session.id, clientA.id);
    expect(monday?.session.status).toBe("completed");
    expect(monday?.session.scheduledDate).toBe(before.data.scheduledDate);
  });
});

describe("F/N/O — no-active-session fallthrough regressions", () => {
  it("F: no active session — timezone-correct calendar scheduling still works", async () => {
    const wtId = await createBlueprint("WSR NoSession Blueprint");
    await createClientProgram(clientA.id, "2026-08-01", { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-03T18:00:00-05:00")); // a Monday, mid-afternoon Chicago
    const result = await getTodayWorkout(clientA.id);
    vi.useRealTimers();
    expect(result.kind).toBe("workout");
    if (result.kind !== "workout") return;
    expect(result.data.workoutTemplateId).toBe(wtId);
    expect(result.data.existingSessionId).toBeNull();
  });

  it("N: rest day (no workout assigned) still resolves to rest_day when no active session exists", async () => {
    await createClientProgram(clientA.id, "2026-08-01", { 1: null });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-03T18:00:00-05:00"));
    const result = await getTodayWorkout(clientA.id);
    vi.useRealTimers();
    expect(result.kind).toBe("rest_day");
  });

  it("O: no_program and program_complete are unchanged when no active session exists", async () => {
    const noProgram = await getTodayWorkout(randomUUID());
    expect(noProgram.kind).toBe("no_program");

    const wtId = await createBlueprint("WSR Complete Blueprint");
    await createClientProgram(clientB.id, "2020-01-01", { 1: wtId }, 1); // 1-week program, long since elapsed
    const result = await getTodayWorkout(clientB.id);
    expect(result.kind).toBe("program_complete");
  });
});

describe("G — timezone correctness for a genuinely different (non-Central) timezone", () => {
  it("a Pacific/Auckland client gets Auckland's calendar day, not UTC's, at a UTC/local disagreement", async () => {
    const wtId = await createBlueprint("WSR Auckland Blueprint");
    // Auckland is UTC+12/+13 — local date is AHEAD of UTC for a large
    // part of the day, the opposite direction of the Chicago case,
    // proving the fix isn't Central-specific.
    // 2026-08-25 is a Tuesday; Auckland dayOfWeek should be 2.
    // startDate matches the mocked "today" itself so elapsed=0 lands
    // in week 1 (the only week this fixture creates) regardless of
    // Auckland's calendar-day offset from UTC.
    await createClientProgram(clientB.id, "2026-08-25", { 2: wtId });

    vi.useFakeTimers({ toFake: ["Date"] });
    // 6:00 AM Aug 25 in Auckland (UTC+12) = 6:00 PM Aug 24 UTC — still
    // Monday in UTC, but already Tuesday in Auckland.
    vi.setSystemTime(new Date("2026-08-25T06:00:00+12:00"));
    const result = await getTodayWorkout(clientB.id);
    vi.useRealTimers();

    expect(result.kind).toBe("workout");
    if (result.kind !== "workout") return;
    expect(result.data.dayOfWeek).toBe(2); // Tuesday per Auckland, not Monday per UTC
    expect(result.data.workoutTemplateId).toBe(wtId);
  });
});

describe("J — deterministic resolution of legacy multiple-in-progress sessions", () => {
  it("picks the most-recently-created in-progress session, never an unordered/arbitrary one", async () => {
    const wt1 = await createBlueprint("WSR Legacy Dup 1");
    const wt2 = await createBlueprint("WSR Legacy Dup 2");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wt1, 2: wt2 });

    // Simulate a legacy/edge-case state directly at the DB layer —
    // application code no longer creates a second in-progress session
    // (see createWorkoutSession's own concurrency-safety), but
    // getActiveWorkoutSession must still behave deterministically if
    // one is somehow already present.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const older = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt1, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(older.id);
    await new Promise((r) => setTimeout(r, 10));
    const [newer] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt2, programWeekNumber: 1, programDayOfWeek: 2, scheduledDate: "2026-08-04", startedAt: new Date(), status: "in_progress", completionPercent: 0, workoutSnapshot: {} })
      .returning();
    sessionIds.push(newer.id);

    const active = await getActiveWorkoutSession(clientA.id);
    expect(active?.id).toBe(newer.id);

    // The older one is untouched — not deleted, not silently completed.
    const olderRow = await getWorkoutSession(older.id, clientA.id);
    expect(olderRow?.session.status).toBe("in_progress");
  });
});

describe("K — concurrent session start cannot create two authoritative sessions", () => {
  it("two simultaneous createWorkoutSession calls for the same client converge on one session", async () => {
    const wtId = await createBlueprint("WSR Concurrent Start Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const [r1, r2] = await Promise.all([
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
    ]);
    vi.useRealTimers();
    sessionIds.push(r1.id, r2.id);

    expect(r1.id).toBe(r2.id);

    const rows = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, clientProgramId));
    expect(rows).toHaveLength(1);
  });

  it("one legitimate start + one tampered (wrong workoutTemplateId) concurrent start: legitimate succeeds, tampered is rejected, no extra row is created", async () => {
    const wtId = await createBlueprint("WSR Concurrent Legit Blueprint");
    const foreignWt = await createBlueprint("WSR Concurrent Tampered Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const [legit, tampered] = await Promise.allSettled([
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: foreignWt, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
    ]);
    vi.useRealTimers();

    expect(legit.status).toBe("fulfilled");
    if (legit.status === "fulfilled") {
      sessionIds.push(legit.value.id);
      expect(legit.value.workoutTemplateId).toBe(wtId);
    }
    expect(tampered.status).toBe("rejected");
    if (tampered.status === "rejected") {
      expect(tampered.reason).toBeInstanceOf(WorkoutSessionAuthorizationError);
    }

    const rows = await db.select({ id: workoutSessions.id, workoutTemplateId: workoutSessions.workoutTemplateId }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, clientProgramId));
    expect(rows).toHaveLength(1);
    expect(rows[0].workoutTemplateId).toBe(wtId);
  });
});

describe("L — frozen snapshot survives a coach editing the underlying blueprint", () => {
  it("an active session's returned name/content is unaffected by a later blueprint rename", async () => {
    const wtId = await createBlueprint("WSR Original Name");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    // Simulate a coach editing/renaming the blueprint after the
    // session has already started.
    await db.update(workoutTemplates).set({ name: "WSR Renamed By Coach Later" }).where(eq(workoutTemplates.id, wtId));

    const result = await getTodayWorkout(clientA.id);
    expect(result.kind).toBe("workout");
    if (result.kind !== "workout") return;
    expect(result.data.existingSessionId).toBe(session.id);
    expect(result.data.workoutName).toBe("WSR Original Name"); // frozen, not the coach's later rename
  });
});

describe("M — historical completed sessions are unchanged", () => {
  it("a pre-existing completed session is never selected as active and its own data is untouched", async () => {
    const wtId = await createBlueprint("WSR History Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);
    const exId = await getExerciseRowId(wtId);
    await logSet({ workoutSessionId: session.id, workoutTemplateExerciseId: exId, setNumber: 1, actualReps: 8, actualWeightKg: "50.00" });
    await updateWorkoutSession(session.id, clientA.id, { status: "completed" });

    const before = await getWorkoutSession(session.id, clientA.id);
    expect(before?.session.status).toBe("completed");
    expect(before?.sets).toHaveLength(1);

    const active = await getActiveWorkoutSession(clientA.id);
    expect(active).toBeNull();

    const after = await getWorkoutSession(session.id, clientA.id);
    expect(after?.session.status).toBe("completed");
    expect(after?.session.completedAt).toEqual(before?.session.completedAt);
    expect(after?.sets).toHaveLength(1);
    expect(after?.sets[0].actualReps).toBe(8);
  });
});

describe("P — client isolation for session lookup and authorization", () => {
  it("client B cannot read client A's in-progress session via getWorkoutSession", async () => {
    const wtId = await createBlueprint("WSR Isolation Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    const asOwner = await getWorkoutSession(session.id, clientA.id);
    expect(asOwner).not.toBeNull();

    const asOther = await getWorkoutSession(session.id, clientB.id);
    expect(asOther).toBeNull();
  });

  it("authorizeWorkoutSession denies a client acting on another client's session id", async () => {
    const wtId = await createBlueprint("WSR Authorize Isolation Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    const ownerDenied = await authorizeWorkoutSession(session.id, clientA.id);
    expect(ownerDenied).toBeNull();

    const otherDenied = await authorizeWorkoutSession(session.id, clientB.id);
    expect(otherDenied).not.toBeNull();
  });

  it("client B's active-session resolution never returns client A's session, even with an in-progress session of B's own", async () => {
    const wtA = await createBlueprint("WSR Isolation A Blueprint");
    const wtB = await createBlueprint("WSR Isolation B Blueprint");
    const { clientProgramId: cpA } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtA });
    // clientB's timezone is Pacific/Auckland — at the SAME pinned "now"
    // used for clientA, Auckland's local calendar is already Tuesday
    // (see the "G" timezone test's own comment for the exact math), so
    // this fixture and startDate are Auckland-correct, not a copy-paste
    // of clientA's Monday/Chicago values.
    const { clientProgramId: cpB } = await createClientProgram(clientB.id, "2026-08-25", { 2: wtB });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const sessionA = await createWorkoutSession({ clientId: clientA.id, clientProgramId: cpA, workoutTemplateId: wtA, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    const sessionB = await createWorkoutSession({ clientId: clientB.id, clientProgramId: cpB, workoutTemplateId: wtB, programWeekNumber: 1, programDayOfWeek: 2, scheduledDate: "2026-08-25" });
    vi.useRealTimers();
    sessionIds.push(sessionA.id, sessionB.id);

    const activeForB = await getActiveWorkoutSession(clientB.id);
    expect(activeForB?.id).toBe(sessionB.id);
    expect(activeForB?.id).not.toBe(sessionA.id);
  });
});

describe("Cross-client / unrelated / tampered start-session authorization", () => {
  it("a client cannot start a session for an unrelated coach's workout template that isn't scheduled for them", async () => {
    const scheduledWt = await createBlueprint("WSR Auth Scheduled Blueprint");
    const unrelatedWt = await createBlueprint("WSR Auth Unrelated Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: scheduledWt });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    await expect(
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: unrelatedWt, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
    ).rejects.toBeInstanceOf(WorkoutSessionAuthorizationError);
    vi.useRealTimers();

    const rows = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, clientProgramId));
    expect(rows).toHaveLength(0);
  });

  it("a client cannot start a session using another client's clientProgramId/workoutTemplateId pairing", async () => {
    const wtA = await createBlueprint("WSR Auth CrossClient A");
    const wtB = await createBlueprint("WSR Auth CrossClient B");
    const { clientProgramId: cpA } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtA });
    const { clientProgramId: cpB } = await createClientProgram(clientB.id, "2026-08-25", { 2: wtB });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    // Client A's authenticated identity (clientId) is server-controlled
    // and can't itself be spoofed to clientB — but this proves that
    // even if a tampered request submits client B's own
    // clientProgramId/workoutTemplateId pairing alongside client A's
    // real clientId, the mismatch against client A's OWN authoritative
    // schedule still rejects it.
    await expect(
      createWorkoutSession({ clientId: clientA.id, clientProgramId: cpB, workoutTemplateId: wtB, programWeekNumber: 1, programDayOfWeek: 2, scheduledDate: "2026-08-25" }),
    ).rejects.toBeInstanceOf(WorkoutSessionAuthorizationError);
    vi.useRealTimers();

    const rowsA = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, cpA));
    expect(rowsA).toHaveLength(0);
    const rowsB = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, cpB));
    expect(rowsB).toHaveLength(0);
  });

  it("an arbitrary/nonexistent workoutTemplateId is rejected", async () => {
    const scheduledWt = await createBlueprint("WSR Auth Arbitrary Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: scheduledWt });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    await expect(
      createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: randomUUID(), programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE }),
    ).rejects.toBeInstanceOf(WorkoutSessionAuthorizationError);
    vi.useRealTimers();

    const rows = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(eq(workoutSessions.clientProgramId, clientProgramId));
    expect(rows).toHaveLength(0);
  });

  it("a legitimate, correctly-scheduled start still succeeds", async () => {
    const scheduledWt = await createBlueprint("WSR Auth Legit Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: scheduledWt });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: scheduledWt, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    expect(session.workoutTemplateId).toBe(scheduledWt);
    expect(session.status).toBe("in_progress");
  });
});

describe("Cross-client finish (updateWorkoutSession/PUT contract)", () => {
  it("attempting to finish another client's session mutates nothing and resolves to null (mapped to 404 at the route)", async () => {
    const wtId = await createBlueprint("WSR Cross-Client Finish Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    const result = await updateWorkoutSession(session.id, clientB.id, { status: "completed" });
    expect(result).toBeNull();

    // No mutation — the session, viewed by its real owner, is still
    // exactly as it was.
    const untouched = await getWorkoutSession(session.id, clientA.id);
    expect(untouched?.session.status).toBe("in_progress");
    expect(untouched?.session.completedAt).toBeNull();
  });

  it("finishing one's own session still works (regression)", async () => {
    const wtId = await createBlueprint("WSR Own Finish Blueprint");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wtId });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY_NOON_CHICAGO));
    const session = await createWorkoutSession({ clientId: clientA.id, clientProgramId, workoutTemplateId: wtId, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE });
    vi.useRealTimers();
    sessionIds.push(session.id);

    const result = await updateWorkoutSession(session.id, clientA.id, { status: "completed" });
    expect(result).not.toBeNull();
    expect(result?.status).toBe("completed");
    expect(result?.completedAt).not.toBeNull();
  });

  it("a nonexistent session id resolves to null, indistinguishable from a cross-client one", async () => {
    const result = await updateWorkoutSession(randomUUID(), clientA.id, { status: "completed" });
    expect(result).toBeNull();
  });
});

describe("P1 rollout-blocking test — legacy duplicate resurrection after authoritative completion", () => {
  it("older duplicate A does NOT resurface once newer authoritative session B completes", async () => {
    const wt1 = await createBlueprint("WSR Resurrection Dup 1");
    const wt2 = await createBlueprint("WSR Resurrection Dup 2");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wt1, 2: wt2 });

    // 1. Older in-progress A, created directly at the DB layer to
    // simulate the exact legacy state the review's own repro steps
    // describe (application code no longer creates a duplicate, but
    // this proves resolution is safe even if one already exists).
    const [olderA] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt1, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: "2026-08-24", startedAt: new Date(), status: "in_progress", completionPercent: 0, workoutSnapshot: {} })
      .returning();
    sessionIds.push(olderA.id);

    await new Promise((r) => setTimeout(r, 10));

    // 2. Newer in-progress B.
    const [newerB] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt2, programWeekNumber: 1, programDayOfWeek: 2, scheduledDate: "2026-08-25", startedAt: new Date(), status: "in_progress", completionPercent: 0, workoutSnapshot: {} })
      .returning();
    sessionIds.push(newerB.id);

    // 3. getTodayWorkout() (via getActiveWorkoutSession) returns B.
    const whileBActive = await getActiveWorkoutSession(clientA.id);
    expect(whileBActive?.id).toBe(newerB.id);

    // 4. Complete B.
    const completed = await updateWorkoutSession(newerB.id, clientA.id, { status: "completed" });
    expect(completed?.status).toBe("completed");

    // 5/6. getActiveWorkoutSession() again — MUST NOT return A. This is
    // the exact P1 the independent review flagged: the old "newest
    // in_progress row" query would have returned A here, resurrecting
    // it as authoritative purely because B was no longer in_progress.
    const afterBCompletes = await getActiveWorkoutSession(clientA.id);
    expect(afterBCompletes).toBeNull();

    // Historical data preserved exactly — A was never deleted, never
    // silently completed, never rewritten.
    const aRow = await getWorkoutSession(olderA.id, clientA.id);
    expect(aRow?.session.status).toBe("in_progress");
    expect(aRow?.session.workoutTemplateId).toBe(wt1);

    // With no active session, timezone-correct schedule resolution
    // resumes normally (real current time — by this point neither
    // session is selectable, so whatever "today" actually is doesn't
    // matter for this specific assertion; the key invariant is just
    // that resolution no longer treats A as authoritative).
    const scheduleResumed = await getTodayWorkout(clientA.id);
    if (scheduleResumed.kind === "workout") {
      expect(scheduleResumed.data.existingSessionId).not.toBe(olderA.id);
    }
  });

  it("A alone (no B) still resumes normally", async () => {
    const wt1 = await createBlueprint("WSR SingleActive Dup 1");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wt1 });
    const [onlyA] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt1, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: MONDAY_STARTDATE, startedAt: new Date(), status: "in_progress", completionPercent: 0, workoutSnapshot: {} })
      .returning();
    sessionIds.push(onlyA.id);

    const active = await getActiveWorkoutSession(clientA.id);
    expect(active?.id).toBe(onlyA.id);
  });

  it("A and B both completed — normal schedule resolution, neither resurfaces", async () => {
    const wt1 = await createBlueprint("WSR BothDone Dup 1");
    const wt2 = await createBlueprint("WSR BothDone Dup 2");
    const { clientProgramId } = await createClientProgram(clientA.id, MONDAY_STARTDATE, { 1: wt1, 2: wt2 });
    const [olderA] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt1, programWeekNumber: 1, programDayOfWeek: 1, scheduledDate: "2026-08-24", startedAt: new Date(), completedAt: new Date(), status: "completed", completionPercent: 100, workoutSnapshot: {} })
      .returning();
    sessionIds.push(olderA.id);
    await new Promise((r) => setTimeout(r, 10));
    const [newerB] = await db
      .insert(workoutSessions)
      .values({ clientId: clientA.id, clientProgramId, workoutTemplateId: wt2, programWeekNumber: 1, programDayOfWeek: 2, scheduledDate: "2026-08-25", startedAt: new Date(), completedAt: new Date(), status: "completed", completionPercent: 100, workoutSnapshot: {} })
      .returning();
    sessionIds.push(newerB.id);

    const active = await getActiveWorkoutSession(clientA.id);
    expect(active).toBeNull();
  });
});
