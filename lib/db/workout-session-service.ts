// ─────────────────────────────────────────────────────────────
// Catalyst OS — Workout Session Service (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
// Manages workout_sessions and workout_set_logs.
// Handles session creation, set logging, completion, and history.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { getDb, isSerializationFailure, type Database } from "./client";
import { programTemplates, workoutTemplates } from "./schema";
import {
  clientPrograms,
  workoutSessions,
  workoutSetLogs,
  type WorkoutSession,
  type WorkoutSetLog,
} from "./schema-program";
import { workoutTemplateExercises } from "./schema-exercise";
import { buildWorkoutSnapshot, getActiveWorkoutSession, getTodayWorkout } from "./client-program-service";

// [Independent review remediation — P2 start-session authorization]
// Thrown when a session-start request's claimed workoutTemplateId does
// not match what getTodayWorkout() independently, authoritatively
// resolves for that same client. Distinguished from a generic Error so
// the API route can map it to a 403/422-style client error instead of
// a raw 500 — a rejected request, not a server fault.
export class WorkoutSessionAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutSessionAuthorizationError";
  }
}

// [Workout set draft autosave — Phase 12 session authorization]
// Neither logSet() nor the new saveSetDraft() may trust a client-
// supplied (workoutSessionId, workoutTemplateExerciseId, setNumber)
// tuple merely because the UI emitted it — a tampered or stale client
// could send another client's session id, an arbitrary exercise id, or
// a set number past what was ever prescribed. This is the ONE shared
// check both writers use, reused rather than duplicated:
//   1. workoutSessionId + clientId are looked up together (never
//      trust a pre-checked authorization elsewhere — this repo's route
//      layer already calls authorizeWorkoutSession() before reaching
//      either service function, but that guard only returns a 404
//      response or null, never the session row itself, and a service
//      function should never assume its caller re-validated ownership
//      correctly). A miss (wrong client, or no such session) throws —
//      cross-client and arbitrary-session-id attempts are rejected
//      identically, so a response can't be used to probe which case
//      occurred.
//   2. workoutTemplateExerciseId must appear in the session's own
//      FROZEN workoutSnapshot (never the live, editable
//      workout_template_exercises table — the snapshot is what this
//      session actually prescribed at start time, and is the only
//      thing an execution write may be validated against). Note the
//      snapshot's own field for this is `id` (see buildWorkoutSnapshot
//      in client-program-service.ts) — `workoutTemplateExerciseId` is
//      the name used everywhere set-logging code refers to that same
//      value, not a field name inside the snapshot's own JSON.
//   3. setNumber must fall within 1..(exercise.sets ?? 1) as prescribed
//      by that same frozen snapshot entry — an out-of-range set number
//      (e.g. set 99 of a 3-set exercise) is rejected the same way.
// Returns the full session row (so callers that also need `status` —
// saveSetDraft's Phase 14 completed-session guard — don't need a
// second query) rather than a bare boolean.
// [Independent review remediation — P1#2 extraction] Split out of what
// used to be validateSetIdentity's single function so saveSetDraft/
// clearSetDraft can validate against a session row they've ALREADY
// fetched under a row lock (see those functions' own comments) without
// a second, redundant, unlocked query. logSet keeps using
// validateSetIdentity below unchanged — Log's own lifecycle vis-a-vis
// Finish is explicitly out of this remediation's scope.
function validateExerciseSetAgainstSnapshot(
  session: Pick<WorkoutSession, "workoutSnapshot">,
  workoutTemplateExerciseId: string,
  setNumber: number,
): void {
  const snapshot = session.workoutSnapshot as {
    sections?: { exercises?: { id: string; sets: number | null }[] }[];
    unsectioned?: { id: string; sets: number | null }[];
  } | null;

  const allExercises = [
    ...(snapshot?.sections?.flatMap((s) => s.exercises ?? []) ?? []),
    ...(snapshot?.unsectioned ?? []),
  ];
  const exercise = allExercises.find((e) => e.id === workoutTemplateExerciseId);
  if (!exercise) {
    throw new WorkoutSessionAuthorizationError(
      "This exercise is not part of this workout session's prescribed structure.",
    );
  }

  const totalSets = exercise.sets ?? 1;
  if (setNumber < 1 || setNumber > totalSets) {
    throw new WorkoutSessionAuthorizationError(
      "This set number is not part of this exercise's prescription.",
    );
  }
}

async function validateSetIdentity(
  db: Database,
  params: {
    workoutSessionId: string;
    clientId: string;
    workoutTemplateExerciseId: string;
    setNumber: number;
  },
): Promise<WorkoutSession> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, params.workoutSessionId),
        eq(workoutSessions.clientId, params.clientId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new WorkoutSessionAuthorizationError(
      "Workout session not found or not owned by this client.",
    );
  }

  validateExerciseSetAgainstSnapshot(session, params.workoutTemplateExerciseId, params.setNumber);

  return session;
}

// Bounded recovery constants for the 40001 (serialization_failure)
// path in createWorkoutSession() below — see that catch block's own
// comment for why this is a small, fixed number of attempts rather
// than an unbounded loop.
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_RETRY_DELAY_MS = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export interface HistoricalSetLog {
  workoutTemplateExerciseId: string;
  setNumber: number;
  completedAt: Date;
  actualReps: number | null;
  actualWeightLbs: number | null; // converted from kg at read time
  actualDurationSeconds: number | null;
  actualRpe: number | null;
  notes: string | null;
}

export interface HistoricalSessionDetail {
  id: string;
  workoutName: string;
  status: string;
  scheduledDate: string | null;
  completedAt: Date | null;
  startedAt: Date | null;
  completionPercent: number;
  programWeekNumber: number | null;
  programName: string | null;
  clientNotes: string | null;
  snapshot: Record<string, unknown> | null;
  setLogs: HistoricalSetLog[];
}

export interface SessionWithSets {
  session: WorkoutSession;
  sets: WorkoutSetLog[];
}

export interface HistorySession {
  id: string;
  workoutTemplateId: string;
  workoutName: string;
  scheduledDate: string | null;
  completedAt: Date | null;
  status: string;
  completionPercent: number;
  programWeekNumber: number | null;
  clientNotes: string | null;
  // From snapshot for display
  sectionCount: number;
  exerciseCount: number;
}

// ─────────────────────────────────────────────────────────────
// SESSION CRUD
// ─────────────────────────────────────────────────────────────

// [In-progress workout session resilience] The schema has no unique
// constraint preventing a second status='in_progress' row for the same
// client (investigated — see getActiveWorkoutSession()'s own comment
// in client-program-service.ts for why a migration wasn't introduced
// for this). Since getTodayWorkout() now resolves to an existing
// in-progress session before ever showing a "start" button, the
// ordinary flow should never even attempt to create a second one — but
// this function itself is the ONLY place a workout_sessions row is
// ever inserted (confirmed), so it is also the correct, narrow place
// to make duplicate creation impossible even under a refresh-then-
// resubmit, a stale tab, or a genuine double-click race, without
// relying on the UI alone (Part 7's own requirement).
//
// Reuses the SAME SERIALIZABLE-transaction + 40001-detection pattern
// already established for publishProgramWithDependencies() (see
// isSerializationFailure's own comment in lib/db/client.ts): check for
// an existing in-progress session and insert only if none exists, all
// inside one transaction, so two concurrent calls can never both pass
// the check and both insert. If Postgres aborts the losing transaction
// with 40001, that call re-queries (outside any transaction, since by
// definition the winner has now committed) and returns the session the
// winner just created — both concurrent callers converge on the same
// single authoritative row instead of one of them surfacing a raw
// error.
// [Independent review remediation — P2 start-session authorization]
// input.workoutTemplateId/clientProgramId/programWeekNumber/
// programDayOfWeek/scheduledDate are the SAME fields the client has
// always sent, but they are no longer trusted as authorization for
// what gets created. Before ever inserting a new session, this
// re-derives what the authenticated client is ACTUALLY scheduled to
// do right now via getTodayWorkout() — the exact same authoritative
// resolution the "Today's Workout" card itself uses, reused rather
// than reimplemented (no parallel scheduling system). A request is
// only honored if its claimed workoutTemplateId matches that
// resolution; the row that actually gets inserted uses the
// AUTHORITATIVE values from that resolution, not the caller's raw
// input, for clientProgramId/programWeekNumber/programDayOfWeek/
// scheduledDate — so even a partially-tampered request (right
// workoutTemplateId, wrong secondary fields) can never persist an
// inconsistent row. This closes off cross-client, unrelated-program,
// unrelated-template, and arbitrary-UUID start attempts uniformly: none
// of them can ever equal the server's own independently-resolved
// workoutTemplateId for that client.
export async function createWorkoutSession(input: {
  clientId: string;
  clientProgramId: string | null;
  workoutTemplateId: string;
  programWeekNumber?: number | null;
  programDayOfWeek?: number | null;
  scheduledDate?: string | null;
}): Promise<WorkoutSession> {
  const db = getDb();

  try {
    return await db.transaction(
      async (tx) => {
        const existing = await getActiveWorkoutSession(input.clientId, tx);
        if (existing) return existing;

        // Resolved INSIDE this same transaction (see DbOrTx in
        // lib/db/client.ts) so the active-session check just above and
        // the schedule resolution here share one consistent snapshot —
        // without this, a session created by a concurrent request
        // between the two reads would be invisible to this one, and
        // this call could still attempt to insert a second row for the
        // same client.
        const authoritative = await getTodayWorkout(input.clientId, tx);
        if (authoritative.kind !== "workout") {
          throw new WorkoutSessionAuthorizationError("No workout is currently scheduled for this client.");
        }
        if (authoritative.data.workoutTemplateId !== input.workoutTemplateId) {
          throw new WorkoutSessionAuthorizationError("The requested workout is not the one currently scheduled for this client.");
        }

        // Snapshot the workout structure at session-creation time —
        // only actually needed when a new session is really being
        // created, so this runs after both checks above, not before
        // them.
        const snapshot = await buildWorkoutSnapshot(authoritative.data.workoutTemplateId);

        const [row] = await tx
          .insert(workoutSessions)
          .values({
            clientId: input.clientId,
            clientProgramId: authoritative.data.clientProgramId || null,
            workoutTemplateId: authoritative.data.workoutTemplateId,
            programWeekNumber: authoritative.data.weekNumber,
            programDayOfWeek: authoritative.data.dayOfWeek,
            scheduledDate: authoritative.data.scheduledDate,
            startedAt: new Date(),
            status: "in_progress",
            completionPercent: 0,
            workoutSnapshot: snapshot as unknown as Record<string, unknown>,
          })
          .returning();

        return row;
      },
      { isolationLevel: "serializable" },
    );
  } catch (err) {
    if (err instanceof WorkoutSessionAuthorizationError) throw err;
    if (isSerializationFailure(err)) {
      // [Independent review remediation — bounded recovery]
      // By the time Postgres tells this (losing) transaction it lost a
      // serialization conflict, the WINNING transaction has, by
      // definition, already committed — Postgres can only detect the
      // conflict once it knows what the other side committed, and a
      // committed transaction's effects are visible to every other
      // session on the same primary synchronously (this isn't
      // replication lag). A single immediate re-query is therefore
      // expected to find it. This retries a handful of times with a
      // short delay purely as defense in depth against any timing edge
      // case the analysis above doesn't fully rule out — explicitly
      // BOUNDED (never an unbounded loop), tenant-scoped to
      // input.clientId, and NEVER attempts the insert again (which
      // would risk a genuine duplicate rather than converging on the
      // winner's row).
      for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt++) {
        const existing = await getActiveWorkoutSession(input.clientId, db);
        if (existing) return existing;
        if (attempt < RECOVERY_MAX_ATTEMPTS - 1) await sleep(RECOVERY_RETRY_DELAY_MS);
      }
    }
    throw err;
  }
}

export async function getWorkoutSession(
  sessionId: string,
  clientId: string,
): Promise<SessionWithSets | null> {
  const db = getDb();

  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.clientId, clientId),
      ),
    )
    .limit(1);

  if (!session) return null;

  const sets = await db
    .select()
    .from(workoutSetLogs)
    .where(eq(workoutSetLogs.workoutSessionId, sessionId))
    .orderBy(
      asc(workoutSetLogs.workoutTemplateExerciseId),
      asc(workoutSetLogs.setNumber),
    );

  return { session, sets };
}

// [Independent review remediation — P2 cross-client finish response]
// Returns null (never a fabricated/undefined WorkoutSession) when the
// WHERE clause's tenant scoping (id + clientId) matches no row — a
// nonexistent session id or one belonging to another client are
// indistinguishable to the caller, exactly like getWorkoutSession's
// own existing contract. Previously this destructured `[row]` from an
// empty `.returning()` result and returned `row` (`undefined`)
// silently typed as a non-nullable WorkoutSession — no mutation ever
// happened, but the caller (the PUT route) had no way to tell success
// from a no-op and returned ok:true regardless.
export async function updateWorkoutSession(
  sessionId: string,
  clientId: string,
  data: {
    status?: "completed" | "skipped";
    clientNotes?: string | null;
  },
): Promise<WorkoutSession | null> {
  const db = getDb();

  const baseUpdates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.status !== undefined) {
    baseUpdates.status = data.status;
    baseUpdates.completedAt = data.status === "completed" ? new Date() : null;
  }
  if (data.clientNotes !== undefined) baseUpdates.clientNotes = data.clientNotes;

  // Wrap completion in a transaction: compute pct and persist atomically
  if (data.status === "completed") {
    const [row] = await db.transaction(async (tx) => {
      const pct = await computeCompletionPercent(tx as unknown as Database, sessionId);
      return tx
        .update(workoutSessions)
        .set({ ...baseUpdates, completionPercent: pct })
        .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.clientId, clientId)))
        .returning();
    });
    return row ?? null;
  }

  const [row] = await db
    .update(workoutSessions)
    .set(baseUpdates)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.clientId, clientId)))
    .returning();
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────
// SET LOGGING
// ─────────────────────────────────────────────────────────────

export async function logSet(input: {
  workoutSessionId: string;
  clientId: string;
  workoutTemplateExerciseId: string;
  setNumber: number;
  actualReps?: number | null;
  actualWeightKg?: string | null;
  actualDurationSeconds?: number | null;
  actualRpe?: string | null;
  notes?: string | null;
}): Promise<WorkoutSetLog> {
  const db = getDb();

  // Wrap insert + completion update in one transaction so the set log
  // row and the updated completionPercent are always consistent.
  return db.transaction(async (tx) => {
    // [Workout set draft autosave — Phase 12] Validate BEFORE ever
    // writing — see validateSetIdentity's own comment. Run inside this
    // same transaction so the identity check and the write it gates
    // share one consistent snapshot.
    await validateSetIdentity(tx as unknown as Database, {
      workoutSessionId: input.workoutSessionId,
      clientId: input.clientId,
      workoutTemplateExerciseId: input.workoutTemplateExerciseId,
      setNumber: input.setNumber,
    });

    // ON CONFLICT DO UPDATE (idempotent: re-tapping a set updates it).
    // [Workout set draft autosave] status:'logged' is written
    // unconditionally on BOTH the insert and update branches — Log is
    // the one authoritative completion boundary, and always wins
    // regardless of whatever draft state (if any) previously occupied
    // this row. draftSeq is cleared to null on the update branch: once
    // a row is logged, draftSeq no longer has any active meaning (the
    // draft-vs-logged guard in saveSetDraft's setWhere already refuses
    // to touch a status='logged' row regardless of draftSeq's value),
    // so leaving a stale number there would only be confusing, not
    // unsafe.
    const [row] = await tx
      .insert(workoutSetLogs)
      .values({
        workoutSessionId: input.workoutSessionId,
        workoutTemplateExerciseId: input.workoutTemplateExerciseId,
        setNumber: input.setNumber,
        completedAt: new Date(),
        actualReps: input.actualReps ?? null,
        actualWeightKg: input.actualWeightKg ?? null,
        actualDurationSeconds: input.actualDurationSeconds ?? null,
        actualRpe: input.actualRpe ?? null,
        notes: input.notes ?? null,
        status: "logged",
      })
      .onConflictDoUpdate({
        target: [
          workoutSetLogs.workoutSessionId,
          workoutSetLogs.workoutTemplateExerciseId,
          workoutSetLogs.setNumber,
        ],
        set: {
          completedAt: new Date(),
          actualReps: input.actualReps ?? null,
          actualWeightKg: input.actualWeightKg ?? null,
          actualDurationSeconds: input.actualDurationSeconds ?? null,
          actualRpe: input.actualRpe ?? null,
          notes: input.notes ?? null,
          status: "logged",
          draftSeq: null,
        },
      })
      .returning();

    const pct = await computeCompletionPercent(tx as unknown as Database, input.workoutSessionId);
    await tx
      .update(workoutSessions)
      .set({ completionPercent: pct, updatedAt: new Date() })
      .where(eq(workoutSessions.id, input.workoutSessionId));

    return row;
  });
}

// [Independent review remediation — draftSeq hardening]
// draftSeq is a client-supplied Date.now()-based sequence used ONLY as
// a strict-comparison ordering key (see the setWhere/DELETE guards
// below) — never treated as a real distributed clock (see this file's
// own "same-millisecond cross-tab" comment further down). A malformed
// value here would corrupt that comparison in ways that are easy to
// miss (a fractional or unsafe-integer draftSeq can silently break a
// strict `<` comparison), so this is validated explicitly at the API
// request boundary (see the draft route) AND re-asserted here as a
// defense-in-depth backstop for any other caller (tests included) —
// never trust that a caller already validated it correctly.
// Number.isSafeInteger rejects NaN, ±Infinity, and fractional values
// in one call; the extra >= 0 rejects negative sequences, matching the
// column's own chk_draft_seq_nonneg constraint.
export function isValidDraftSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertValidDraftSeq(value: number): void {
  if (!isValidDraftSeq(value)) {
    throw new Error(`Invalid draftSeq: ${String(value)} (must be a non-negative safe integer)`);
  }
}

// [Workout set draft autosave]
// Persists what the client TYPED, not what they LOGGED — status is
// always written as 'draft', and this function never touches
// completionPercent or workoutSessions (Phase 5's explicit "autosave
// alone must not increment completion, mark a set done, or trigger
// completion/history semantics"). Distinguished from logSet in three
// load-bearing ways:
//   1. Never wrapped in the completionPercent-updating transaction.
//   2. The upsert's setWhere guard (status='draft' AND draft_seq <
//      incoming) makes it structurally impossible for this function to
//      ever downgrade an already-logged row, or to apply an
//      out-of-order/stale write — see the column's own comment in
//      schema-program.ts for the full design rationale. This is
//      enforced by Postgres itself inside one statement, not by any
//      read-then-write check on the application side that a race could
//      slip between.
//   3. [Independent review remediation — P1#2] Rejects (as a normal,
//      non-error outcome — see SaveSetDraftResult) once the session is
//      no longer 'in_progress' — Phase 14's "a completed workout
//      cannot be reopened by a late draft write." The ORIGINAL version
//      of this function checked session.status BEFORE the insert/
//      upsert as a separate, non-atomic read — Codex correctly found
//      that a Finish request could commit status='completed' in the
//      window between that read and this function's own write, letting
//      a late autosave insert a brand-new draft row into an already-
//      completed session (a never-before-touched set has no existing
//      row for the upsert's own setWhere guard to protect, unlike the
//      "downgrade a logged row" case in point 2, which the upsert guard
//      always covered correctly on its own).
//      FIX: the session status check and the draft write now share ONE
//      transaction, and the session row is read with `SELECT ... FOR
//      UPDATE` — a real Postgres row lock, not just an in-app read. If
//      a concurrent Finish (updateWorkoutSession's own UPDATE
//      statement) is already touching this exact session row, this
//      transaction blocks until Finish's implicit transaction commits,
//      then re-reads the row and sees the POST-COMMIT status (Postgres
//      re-evaluates the locked row after the lock is released, it does
//      not serve a stale pre-lock snapshot) — so this transaction is
//      guaranteed to observe status='completed' if Finish won the race,
//      and status='in_progress' only if Finish had not yet started (or
//      had not yet committed) when this transaction acquired the lock.
//      There is no window left in which this function can observe
//      'in_progress' and then have Finish commit before its own insert.
//      This is a short, purely server-side transaction (one row lock +
//      one upsert) — never held open across a browser round trip, and
//      never SERIALIZABLE/retry-based, matching "do not hold a long
//      transaction open" and "do not overengineer."
export interface SaveSetDraftResult {
  applied: boolean;
  reason?: "stale" | "session-not-active";
  row: WorkoutSetLog | null;
}

export async function saveSetDraft(input: {
  workoutSessionId: string;
  clientId: string;
  workoutTemplateExerciseId: string;
  setNumber: number;
  actualReps?: number | null;
  actualWeightKg?: string | null;
  actualDurationSeconds?: number | null;
  actualRpe?: string | null;
  draftSeq: number;
}): Promise<SaveSetDraftResult> {
  assertValidDraftSeq(input.draftSeq);
  const db = getDb();

  return db.transaction(async (tx) => {
    // Row-locked read — see this function's own comment above for why
    // this specific lock is what makes the in_progress check atomic
    // with the write below.
    const [session] = await tx
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, input.workoutSessionId),
          eq(workoutSessions.clientId, input.clientId),
        ),
      )
      .for("update");

    if (!session) {
      throw new WorkoutSessionAuthorizationError(
        "Workout session not found or not owned by this client.",
      );
    }
    validateExerciseSetAgainstSnapshot(session, input.workoutTemplateExerciseId, input.setNumber);

    if (session.status !== "in_progress") {
      return { applied: false, reason: "session-not-active", row: null };
    }

    const [row] = await tx
      .insert(workoutSetLogs)
      .values({
        workoutSessionId: input.workoutSessionId,
        workoutTemplateExerciseId: input.workoutTemplateExerciseId,
        setNumber: input.setNumber,
        status: "draft",
        draftSeq: input.draftSeq,
        actualReps: input.actualReps ?? null,
        actualWeightKg: input.actualWeightKg ?? null,
        actualDurationSeconds: input.actualDurationSeconds ?? null,
        actualRpe: input.actualRpe ?? null,
      })
      .onConflictDoUpdate({
        target: [
          workoutSetLogs.workoutSessionId,
          workoutSetLogs.workoutTemplateExerciseId,
          workoutSetLogs.setNumber,
        ],
        set: {
          status: "draft",
          draftSeq: input.draftSeq,
          actualReps: input.actualReps ?? null,
          actualWeightKg: input.actualWeightKg ?? null,
          actualDurationSeconds: input.actualDurationSeconds ?? null,
          actualRpe: input.actualRpe ?? null,
        },
        setWhere: sql`${workoutSetLogs.status} = 'draft' AND (${workoutSetLogs.draftSeq} IS NULL OR ${workoutSetLogs.draftSeq} < ${input.draftSeq})`,
      })
      .returning();

    if (!row) {
      // The conflict guard rejected the update: either the existing row
      // is already status='logged' (never touched, by design), or a
      // draftSeq >= this write's already won (out-of-order arrival, or a
      // second tab's newer edit). Either way the newest true value is
      // already durably persisted — this is a silent no-op, not a
      // failure, from this write's point of view.
      return { applied: false, reason: "stale", row: null };
    }

    return { applied: true, row };
  });
}

// [Independent review remediation — P1#1 clear-last-field]
// A DRAFT row (never a logged one) whose client-typed values have all
// been cleared back to blank is deleted outright rather than persisted
// as an all-null row — Option B from the review's own two proposed
// approaches. Chosen because a workout_set_logs row with every
// execution field NULL and status='draft' carries no information a
// missing row doesn't already carry just as well (hydration's own
// contract is "no row for this set slot" = blank/never-touched, which
// is exactly correct for "the client cleared everything"), so
// persisting an all-null row would just be a second, redundant
// representation of the same "nothing to show" state — more schema
// surface for zero product benefit.
//
// This is genuinely a SEPARATE, draft-specific, identity-validated
// delete path — NOT a call into the pre-existing deleteSet() (a known,
// separately-tracked P2: deleteSet() has no session/client/prescription
// identity validation at all). Reusing it here would have silently
// inherited that gap into the new autosave-clear feature; this
// function instead reuses the SAME validateExerciseSetAgainstSnapshot
// check and the SAME row-locked, in_progress-gated transaction pattern
// as saveSetDraft above, so a clear is exactly as strongly authorized
// and exactly as safe against the Finish race as a normal draft write.
//
// The delete itself carries the SAME staleness-ordering contract as
// the upsert: it only removes a row that is status='draft' AND whose
// stored draft_seq is older than this clear's own draftSeq — so a
// delayed/stale clear can never remove a NEWER edit that landed after
// it was issued (race #2 in the review), and can never touch a
// status='logged' row (race #4) regardless of timing.
export interface ClearSetDraftResult {
  applied: boolean;
  deleted: boolean;
  reason?: "nothing-to-clear" | "stale" | "already-logged" | "session-not-active";
}

export async function clearSetDraft(input: {
  workoutSessionId: string;
  clientId: string;
  workoutTemplateExerciseId: string;
  setNumber: number;
  draftSeq: number;
}): Promise<ClearSetDraftResult> {
  assertValidDraftSeq(input.draftSeq);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, input.workoutSessionId),
          eq(workoutSessions.clientId, input.clientId),
        ),
      )
      .for("update");

    if (!session) {
      throw new WorkoutSessionAuthorizationError(
        "Workout session not found or not owned by this client.",
      );
    }
    validateExerciseSetAgainstSnapshot(session, input.workoutTemplateExerciseId, input.setNumber);

    if (session.status !== "in_progress") {
      return { applied: false, deleted: false, reason: "session-not-active" };
    }

    const identity = and(
      eq(workoutSetLogs.workoutSessionId, input.workoutSessionId),
      eq(workoutSetLogs.workoutTemplateExerciseId, input.workoutTemplateExerciseId),
      eq(workoutSetLogs.setNumber, input.setNumber),
    );

    const [deletedRow] = await tx
      .delete(workoutSetLogs)
      .where(
        and(
          identity,
          eq(workoutSetLogs.status, "draft"),
          sql`(${workoutSetLogs.draftSeq} IS NULL OR ${workoutSetLogs.draftSeq} < ${input.draftSeq})`,
        ),
      )
      .returning();

    if (deletedRow) {
      return { applied: true, deleted: true };
    }

    // Nothing was deleted — read back (inside the same transaction, so
    // still consistent with the decision above) to report WHY, purely
    // for caller/telemetry clarity. None of these branches mutate
    // anything: the DELETE's own WHERE clause already made the one
    // correctness-relevant decision atomically.
    const [current] = await tx.select({ status: workoutSetLogs.status, draftSeq: workoutSetLogs.draftSeq }).from(workoutSetLogs).where(identity);
    if (!current) {
      // Nothing ever existed for this set slot — blank stays blank.
      // This is success, not a failure to report.
      return { applied: true, deleted: false, reason: "nothing-to-clear" };
    }
    if (current.status === "logged") {
      return { applied: false, deleted: false, reason: "already-logged" };
    }
    return { applied: false, deleted: false, reason: "stale" };
  });
}

export async function deleteSet(
  workoutSessionId: string,
  workoutTemplateExerciseId: string,
  setNumber: number,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(workoutSetLogs)
      .where(
        and(
          eq(workoutSetLogs.workoutSessionId, workoutSessionId),
          eq(workoutSetLogs.workoutTemplateExerciseId, workoutTemplateExerciseId),
          eq(workoutSetLogs.setNumber, setNumber),
        ),
      );

    const pct = await computeCompletionPercent(tx as unknown as Database, workoutSessionId);
    await tx
      .update(workoutSessions)
      .set({ completionPercent: pct, updatedAt: new Date() })
      .where(eq(workoutSessions.id, workoutSessionId));
  });
}

// ─────────────────────────────────────────────────────────────
// COMPLETION CALCULATION
//
// Sets prescribed = sum of workout_template_exercises.sets for
// this workout template. Sets completed = count of set log rows
// for this session. Percent = min(100, completed / prescribed * 100).
//
// Accepts db or a transaction tx (cast to Database) so it can
// run inside a db.transaction() without escaping the transaction.
// ─────────────────────────────────────────────────────────────

async function computeCompletionPercent(
  db: Database,
  sessionId: string,
): Promise<number> {
  const [session] = await db
    .select({ workoutTemplateId: workoutSessions.workoutTemplateId })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);

  if (!session) return 0;

  // Total sets prescribed
  const prescribed = await db
    .select({ sets: workoutTemplateExercises.sets })
    .from(workoutTemplateExercises)
    .where(
      eq(
        workoutTemplateExercises.workoutTemplateId,
        session.workoutTemplateId,
      ),
    );

  const totalSets = prescribed.reduce((s, p) => s + (p.sets ?? 1), 0);
  if (totalSets === 0) return 0;

  // Count completed set logs. [Workout set draft autosave] Explicitly
  // filtered to status='logged' — a draft row (client typed values but
  // never tapped Log) must never count toward completion. Before the
  // status column existed, row existence alone meant "logged" and this
  // filter was unnecessary; now that saveSetDraft() can insert 'draft'
  // rows into this same table, omitting this filter would silently
  // inflate completionPercent from unfinished input.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workoutSetLogs)
    .where(
      and(
        eq(workoutSetLogs.workoutSessionId, sessionId),
        eq(workoutSetLogs.status, "logged"),
      ),
    );

  return Math.min(100, Math.round((count / totalSets) * 100));
}

// ─────────────────────────────────────────────────────────────
// WORKOUT HISTORY
// ─────────────────────────────────────────────────────────────

export async function getWorkoutHistory(
  clientId: string,
  limit = 20,
): Promise<HistorySession[]> {
  const db = getDb();

  const sessions = await db
    .select({
      session: workoutSessions,
      workoutName: workoutTemplates.name,
    })
    .from(workoutSessions)
    .innerJoin(
      workoutTemplates,
      eq(workoutSessions.workoutTemplateId, workoutTemplates.id),
    )
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        sql`${workoutSessions.status} != 'in_progress'`,
      ),
    )
    // 5B: skipped sessions (null completedAt) sort by scheduledDate rather than
    // sinking below all completed sessions, which DESC NULLS LAST would cause.
    .orderBy(
      sql`COALESCE(${workoutSessions.completedAt}, ${workoutSessions.scheduledDate}::timestamptz, ${workoutSessions.updatedAt}) DESC NULLS LAST`,
    )
    .limit(limit);

  const results = sessions.map(({ session, workoutName }) => {
    const snap = session.workoutSnapshot as {
      sections?: { exercises?: unknown[] }[];
      unsectioned?: unknown[];
    } | null;

    const sectionCount = snap?.sections?.length ?? 0;
    const exerciseCount =
      (snap?.sections?.reduce(
        (s, sec) => s + (sec.exercises?.length ?? 0),
        0,
      ) ?? 0) + (snap?.unsectioned?.length ?? 0);

    return {
      id: session.id,
      workoutTemplateId: session.workoutTemplateId,
      workoutName,
      scheduledDate: session.scheduledDate,
      completedAt: session.completedAt,
      status: session.status,
      completionPercent: session.completionPercent,
      programWeekNumber: session.programWeekNumber,
      clientNotes: session.clientNotes,
      sectionCount,
      exerciseCount,
    };
  });

  // 5A: for sessions where the snapshot held no exercise data (e.g. empty {}
  // default), fall back to counting distinct workout_template_exercise_id
  // values from workout_set_logs — one query for all affected sessions.
  const needsFallback = results.filter((r) => r.exerciseCount === 0).map((r) => r.id);
  if (needsFallback.length > 0) {
    const fallbackRows = await db
      .select({
        sessionId: workoutSetLogs.workoutSessionId,
        exerciseCount: sql<number>`count(distinct ${workoutSetLogs.workoutTemplateExerciseId})::int`,
      })
      .from(workoutSetLogs)
      .where(
        and(
          inArray(workoutSetLogs.workoutSessionId, needsFallback),
          eq(workoutSetLogs.status, "logged"),
        ),
      )
      .groupBy(workoutSetLogs.workoutSessionId);

    const fallbackMap = new Map(fallbackRows.map((r) => [r.sessionId, r.exerciseCount]));
    for (const r of results) {
      if (r.exerciseCount === 0 && fallbackMap.has(r.id)) {
        r.exerciseCount = fallbackMap.get(r.id)!;
      }
    }
  }

  return results;
}

export async function getSessionWithSetsForHistory(
  sessionId: string,
  clientId: string,
): Promise<SessionWithSets | null> {
  return getWorkoutSession(sessionId, clientId);
}

// ─────────────────────────────────────────────────────────────
// HISTORICAL SESSION DETAIL
//
// Fetches a single completed/skipped session with its full set logs.
// Validates ownership: returns null if sessionId belongs to a
// different client (non-disclosing — caller should respond with 404).
//
// Weight is converted kg→lbs here so the UI layer never touches kg.
// Snapshot is returned as-is (JSONB); the page parses the structure.
// Program name is resolved via clientPrograms → programTemplates join
// (left join because clientProgramId may be null if program was deleted).
// ─────────────────────────────────────────────────────────────

function kgToLbsService(kg: string | null | undefined): number | null {
  if (kg == null) return null;
  const n = parseFloat(kg);
  return isNaN(n) ? null : Math.round((n / 0.453592) * 10) / 10;
}

export async function getHistoricalSessionDetail(
  sessionId: string,
  clientId: string,
): Promise<HistoricalSessionDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      session: workoutSessions,
      workoutName: workoutTemplates.name,
      programName: programTemplates.name,
    })
    .from(workoutSessions)
    .innerJoin(workoutTemplates, eq(workoutSessions.workoutTemplateId, workoutTemplates.id))
    .leftJoin(clientPrograms, eq(workoutSessions.clientProgramId, clientPrograms.id))
    .leftJoin(programTemplates, eq(clientPrograms.programTemplateId, programTemplates.id))
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.clientId, clientId),
      ),
    )
    .limit(1);

  if (!row) return null;

  // [Workout set draft autosave] History is a record of what the
  // client actually completed — a lingering 'draft' row (values typed
  // but never logged before the session finished) must not appear
  // here as if it were a completed set.
  const setRows = await db
    .select()
    .from(workoutSetLogs)
    .where(
      and(
        eq(workoutSetLogs.workoutSessionId, sessionId),
        eq(workoutSetLogs.status, "logged"),
      ),
    )
    .orderBy(
      asc(workoutSetLogs.workoutTemplateExerciseId),
      asc(workoutSetLogs.setNumber),
    );

  const setLogs: HistoricalSetLog[] = setRows.map((s) => ({
    workoutTemplateExerciseId: s.workoutTemplateExerciseId,
    setNumber: s.setNumber,
    completedAt: s.completedAt,
    actualReps: s.actualReps ?? null,
    actualWeightLbs: kgToLbsService(s.actualWeightKg),
    actualDurationSeconds: s.actualDurationSeconds ?? null,
    actualRpe: s.actualRpe !== null ? parseFloat(s.actualRpe) : null,
    notes: s.notes ?? null,
  }));

  return {
    id: row.session.id,
    workoutName: row.workoutName,
    status: row.session.status,
    scheduledDate: row.session.scheduledDate,
    completedAt: row.session.completedAt,
    startedAt: row.session.startedAt,
    completionPercent: row.session.completionPercent,
    programWeekNumber: row.session.programWeekNumber,
    programName: row.programName ?? null,
    clientNotes: row.session.clientNotes,
    snapshot: row.session.workoutSnapshot as Record<string, unknown> | null,
    setLogs,
  };
}
