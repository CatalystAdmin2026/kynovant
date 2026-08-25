// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Program Service (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
// Handles program assignment to clients, the single-active-program
// rule, and the "today's workout" lookup logic.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "./client";
import { coachOwnsClient } from "@/lib/auth/guards";
import {
  users,
  programTemplates,
  workoutTemplates,
  clientProfiles,
  timelineEvents,
  coachingEnrollments,
} from "./schema";
import { clientGoals } from "./schema-profile";
import {
  clientPrograms,
  clientProgramWeeks,
  clientProgramWeekDays,
  programWeeks,
  programWeekDays,
  workoutSessions,
  type ClientProgram,
  type ClientProgramStatus,
  type WorkoutSession as WorkoutSessionRow,
} from "./schema-program";
import { getDateInTimezone, getWeekdayInTimezone } from "@/lib/checkin/schedule";
import {
  workoutTemplateSections,
  workoutTemplateExercises,
  exercises,
} from "./schema-exercise";

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export interface ExerciseSnapshotItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  groupId: string | null;
  groupPosition: number | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null;
  targetRir: string | null;
  setTechnique: string | null;
  coachNotes: string | null;
  isRequired: boolean;
}

export interface SectionSnapshot {
  id: string;
  name: string;
  sectionType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  exercises: ExerciseSnapshotItem[];
}

export interface WorkoutSnapshot {
  templateId: string;
  templateName: string;
  estimatedDurationMinutes: number | null;
  sections: SectionSnapshot[];
  unsectioned: ExerciseSnapshotItem[];
}

export interface TodayWorkout {
  clientProgramId: string;
  programName: string;
  weekNumber: number;
  dayOfWeek: number;
  totalWeeks: number;
  workoutTemplateId: string;
  workoutName: string;
  estimatedDurationMinutes: number | null;
  scheduledDate: string;
  existingSessionId: string | null;
  existingSessionStatus: string | null;
  snapshot: WorkoutSnapshot;
}

export interface NotStartedData {
  programName: string;
  startDate: string;
  daysUntilStart: number;
  totalWeeks: number | null;
}

export type TodayResult =
  | { kind: "workout"; data: TodayWorkout }
  | { kind: "rest_day" }
  | { kind: "no_program" }
  | { kind: "program_complete" }
  | { kind: "not_started"; data: NotStartedData };

export interface AssignProgramInput {
  clientId: string;
  programTemplateId: string;
  startDate: string;
  enrollmentId?: string | null;
  coachNotes?: string | null;
  overrideAllowMultiple?: boolean;
  /**
   * Defense-in-depth ownership check, in addition to whatever the
   * caller already did at the Server Action / API route boundary.
   * Omit (or pass null) for an admin-initiated call — no check runs.
   * Pass the acting coach's userId to also verify, here, that this
   * coach actually owns clientId before the assignment is written.
   */
  coachId?: string | null;
}

export interface ClientProgramWithMeta {
  assignment: ClientProgram;
  programName: string;
  programCategory: string;
  clientName: string;
  totalWeeks: number | null;
}

export interface ComplianceSummary {
  clientId: string;
  clientName: string;
  programName: string;
  weekNumber: number;
  totalWeeks: number | null;
  scheduledSessions: number;
  completedSessions: number;
  compliancePercent: number;
  lastCompletedAt: Date | null;
  nextScheduledDate: string | null;
  assignmentId: string;
}

// ─────────────────────────────────────────────────────────────
// ASSIGNMENT CRUD
// ─────────────────────────────────────────────────────────────

export async function assignProgram(
  input: AssignProgramInput,
): Promise<{ ok: boolean; assignment?: ClientProgram; error?: string }> {
  const db = getDb();

  // Validate target is a client user
  const [client] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, input.clientId))
    .limit(1);

  if (!client || client.role !== "client") {
    return { ok: false, error: "Client not found." };
  }

  // Defense-in-depth ownership check — see AssignProgramInput.coachId.
  if (input.coachId && !(await coachOwnsClient(input.coachId, input.clientId))) {
    return { ok: false, error: "Client not found." };
  }

  // Validate template is published
  const [tmpl] = await db
    .select({
      name: programTemplates.name,
      status: programTemplates.status,
      version: programTemplates.version,
    })
    .from(programTemplates)
    .where(eq(programTemplates.id, input.programTemplateId))
    .limit(1);

  if (!tmpl) return { ok: false, error: "Program template not found." };
  if (tmpl.status !== "active") {
    return {
      ok: false,
      error: `Program "${tmpl.name}" is not published. Publish it before assigning.`,
    };
  }

  // Fetch template structure outside the transaction (read-only)
  const templateWeeks = await db
    .select({
      id: programWeeks.id,
      weekNumber: programWeeks.weekNumber,
      label: programWeeks.label,
      notes: programWeeks.notes,
    })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, input.programTemplateId))
    .orderBy(asc(programWeeks.weekNumber));

  const templateDays =
    templateWeeks.length > 0
      ? await db
          .select({
            id: programWeekDays.id,
            programWeekId: programWeekDays.programWeekId,
            dayOfWeek: programWeekDays.dayOfWeek,
            workoutTemplateId: programWeekDays.workoutTemplateId,
            label: programWeekDays.label,
            notes: programWeekDays.notes,
          })
          .from(programWeekDays)
          .where(
            inArray(
              programWeekDays.programWeekId,
              templateWeeks.map((w) => w.id),
            ),
          )
      : [];

  try {
    const assignment = await db.transaction(async (tx) => {
      // Archive any existing active program unless override allows coexistence
      let hadExisting = false;
      if (!input.overrideAllowMultiple) {
        const [existing] = await tx
          .select({ id: clientPrograms.id })
          .from(clientPrograms)
          .where(
            and(
              eq(clientPrograms.clientId, input.clientId),
              eq(clientPrograms.status, "active"),
            ),
          )
          .limit(1);

        if (existing) {
          await tx
            .update(clientPrograms)
            .set({ status: "cancelled", endDate: input.startDate, updatedAt: new Date() })
            .where(eq(clientPrograms.id, existing.id));
          hadExisting = true;
        }
      }

      // Insert new assignment with lineage snapshot
      const [row] = await tx
        .insert(clientPrograms)
        .values({
          clientId: input.clientId,
          programTemplateId: input.programTemplateId,
          startDate: input.startDate,
          enrollmentId: input.enrollmentId ?? null,
          coachNotes: input.coachNotes ?? null,
          overrideAllowMultiple: input.overrideAllowMultiple ?? false,
          status: "active",
          sourceTemplateName: tmpl.name,
          sourceTemplateVersion: tmpl.version,
        })
        .returning();

      // Deep-copy scheduling structure into client-owned rows
      for (const week of templateWeeks) {
        const [newWeek] = await tx
          .insert(clientProgramWeeks)
          .values({
            clientProgramId: row.id,
            sourceWeekId: week.id,
            weekNumber: week.weekNumber,
            label: week.label,
            notes: week.notes,
          })
          .returning({ id: clientProgramWeeks.id });

        const daysForWeek = templateDays.filter((d) => d.programWeekId === week.id);
        if (daysForWeek.length > 0) {
          await tx.insert(clientProgramWeekDays).values(
            daysForWeek.map((d) => ({
              clientProgramWeekId: newWeek.id,
              sourceDayId: d.id,
              dayOfWeek: d.dayOfWeek,
              workoutTemplateId: d.workoutTemplateId,
              label: d.label,
              notes: d.notes,
            })),
          );
        }
      }

      // Record timeline event
      await tx.insert(timelineEvents).values({
        clientId: input.clientId,
        eventType: "program_assigned",
        actorRole: "coach",
        title: `Program assigned: ${tmpl.name}`,
        description: `Started ${input.startDate}${hadExisting ? " · previous program archived" : ""}`,
        occurredAt: new Date(),
      });

      return row;
    });

    return { ok: true, assignment };
  } catch (err) {
    // Concurrent assignment race on the unique partial index
    if (
      err instanceof Error &&
      ((err as unknown as Record<string, unknown>).code === "23505" ||
        err.message.includes("uq_client_active_program"))
    ) {
      return {
        ok: false,
        error: "A program was just assigned to this client. Refresh and try again.",
      };
    }
    throw err;
  }
}

export async function updateClientProgram(
  id: string,
  data: {
    status?: ClientProgramStatus;
    endDate?: string | null;
    coachNotes?: string | null;
  },
): Promise<ClientProgram> {
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.status !== undefined) updates.status = data.status;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.coachNotes !== undefined) updates.coachNotes = data.coachNotes;

  const [row] = await db
    .update(clientPrograms)
    .set(updates)
    .where(eq(clientPrograms.id, id))
    .returning();
  return row;
}

export async function getClientActiveProgram(
  clientId: string,
  dbClient?: DbOrTx,
): Promise<ClientProgram | null> {
  const db = dbClient ?? getDb();
  const rows = await db
    .select()
    .from(clientPrograms)
    .where(
      and(
        eq(clientPrograms.clientId, clientId),
        eq(clientPrograms.status, "active"),
      ),
    )
    .orderBy(desc(clientPrograms.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listClientPrograms(
  clientId: string,
): Promise<ClientProgramWithMeta[]> {
  const db = getDb();
  const rows = await db
    .select({
      assignment: clientPrograms,
      programName: programTemplates.name,
      programCategory: programTemplates.category,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(clientPrograms)
    .innerJoin(
      programTemplates,
      eq(clientPrograms.programTemplateId, programTemplates.id),
    )
    .where(eq(clientPrograms.clientId, clientId))
    .orderBy(desc(clientPrograms.createdAt));

  return rows.map((r) => ({
    assignment: r.assignment,
    programName: r.programName,
    programCategory: r.programCategory,
    clientName: "",
    totalWeeks: r.totalWeeks,
  }));
}

export async function listAllActiveAssignments(
  coachId: string | null = null,
): Promise<ClientProgramWithMeta[]> {
  const db = getDb();
  const rows = await db
    .select({
      assignment: clientPrograms,
      programName: programTemplates.name,
      programCategory: programTemplates.category,
      totalWeeks: programTemplates.defaultDurationWeeks,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
    })
    .from(clientPrograms)
    .innerJoin(
      programTemplates,
      eq(clientPrograms.programTemplateId, programTemplates.id),
    )
    .leftJoin(
      clientProfiles,
      eq(clientPrograms.clientId, clientProfiles.userId),
    )
    .where(
      and(
        eq(clientPrograms.status, "active"),
        coachId === null
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM ${coachingEnrollments}
              WHERE ${coachingEnrollments.clientId} = ${clientPrograms.clientId}
                AND ${coachingEnrollments.coachId} = ${coachId}
            )`,
      ),
    )
    .orderBy(asc(clientPrograms.startDate));

  return rows.map((r) => ({
    assignment: r.assignment,
    programName: r.programName,
    programCategory: r.programCategory,
    clientName:
      r.preferredName ?? r.fullName ?? r.assignment.clientId,
    totalWeeks: r.totalWeeks,
  }));
}

// ─────────────────────────────────────────────────────────────
// ACTIVE CLIENT LIST
//
// Returns all non-archived, non-suspended clients for the Assign
// panel. Every active client should be selectable, not just those
// who already have at least one program assignment.
// ─────────────────────────────────────────────────────────────

export interface ActiveClientSummary {
  id: string;
  name: string;
}

export async function listActiveClients(
  coachId: string | null = null,
): Promise<ActiveClientSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
    })
    .from(users)
    .innerJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(
      and(
        eq(users.role, "client"),
        inArray(users.status, ["invited", "active"]),
        coachId === null
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM ${coachingEnrollments}
              WHERE ${coachingEnrollments.clientId} = ${users.id}
                AND ${coachingEnrollments.coachId} = ${coachId}
            )`,
      ),
    )
    .orderBy(asc(clientProfiles.fullName));

  return rows.map((r) => ({
    id: r.id,
    name: r.preferredName ?? r.fullName,
  }));
}

// ─────────────────────────────────────────────────────────────
// SNAPSHOT BUILDER
//
// Freezes the full workout structure into a JSONB-ready object
// at session-creation time. Preserves historical fidelity even
// if the blueprint is later edited.
// ─────────────────────────────────────────────────────────────

export async function buildWorkoutSnapshot(
  workoutTemplateId: string,
): Promise<WorkoutSnapshot> {
  const db = getDb();

  const [template] = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, workoutTemplateId))
    .limit(1);

  if (!template) throw new Error("Workout template not found");

  const sections = await db
    .select()
    .from(workoutTemplateSections)
    .where(eq(workoutTemplateSections.workoutTemplateId, workoutTemplateId))
    .orderBy(asc(workoutTemplateSections.orderIndex));

  const prescriptions = await db
    .select({
      p: workoutTemplateExercises,
      exerciseName: exercises.name,
    })
    .from(workoutTemplateExercises)
    .innerJoin(exercises, eq(workoutTemplateExercises.exerciseId, exercises.id))
    .where(
      eq(workoutTemplateExercises.workoutTemplateId, workoutTemplateId),
    )
    .orderBy(asc(workoutTemplateExercises.orderIndex));

  function toItem(
    p: (typeof prescriptions)[0]["p"],
    name: string,
  ): ExerciseSnapshotItem {
    return {
      id: p.id,
      exerciseId: p.exerciseId,
      exerciseName: name,
      orderIndex: p.orderIndex,
      groupId: p.groupId,
      groupPosition: p.groupPosition,
      sets: p.sets,
      repsMin: p.repsMin,
      repsMax: p.repsMax,
      durationSeconds: p.durationSeconds,
      restSeconds: p.restSeconds,
      tempo: p.tempo,
      targetRpe: p.targetRpe ? String(p.targetRpe) : null,
      targetRir: p.targetRir ? String(p.targetRir) : null,
      setTechnique: p.setTechnique,
      coachNotes: p.coachNotes,
      isRequired: p.isRequired,
    };
  }

  const sectionSnapshots: SectionSnapshot[] = sections.map((sec) => {
    const secExercises = prescriptions
      .filter((p) => p.p.sectionId === sec.id)
      .map(({ p, exerciseName }) => toItem(p, exerciseName))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      id: sec.id,
      name: sec.name,
      sectionType: sec.sectionType,
      orderIndex: sec.orderIndex,
      estimatedMinutes: sec.estimatedMinutes,
      exercises: secExercises,
    };
  });

  const unsectioned = prescriptions
    .filter((p) => p.p.sectionId === null)
    .map(({ p, exerciseName }) => toItem(p, exerciseName))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    templateId: workoutTemplateId,
    templateName: template.name,
    estimatedDurationMinutes: template.estimatedDurationMinutes,
    sections: sectionSnapshots,
    unsectioned,
  };
}

// ─────────────────────────────────────────────────────────────
// TODAY'S WORKOUT LOOKUP
//
// [In-progress workout session resilience] Resolves which workout the
// client should be doing right now. As of this remediation, that is
// NO LONGER purely a fresh calendar computation — it is, in order:
//
//   1. SESSION-FIRST: does this client have an authoritative
//      status='in_progress' workout_sessions row at all? If so, THAT
//      session — its own frozen workoutTemplateId, scheduledDate, and
//      workoutSnapshot — is the answer, full stop. Refresh, remount,
//      PWA reopen, a calendar-date rollover, or the client's program
//      being edited must never silently swap it out for "whatever the
//      schedule says right now." See getActiveWorkoutSession() below.
//
//   2. Only when no in-progress session exists does normal, timezone-
//      correct calendar scheduling run (weekNumber/dayOfWeek from the
//      client's own IANA timezone — see getClientTimezone() and
//      lib/checkin/schedule.ts's getDateInTimezone/getWeekdayInTimezone
//      — not the server's raw UTC clock, which is what silently
//      produced "tomorrow's workout" for an evening session; see this
//      investigation's own reproduction).
//
// Returns the same tagged union as before so every existing caller is
// unaffected when no session is active — this is additive precedence,
// not a redesign of the result shape:
//   workout       — a specific blueprint is scheduled/active today
//   rest_day      — program has this day as rest
//   no_program    — client has no active program
//   program_complete — past the last week of the program
//   not_started   — program start date is in the future
// ─────────────────────────────────────────────────────────────

function daysBetween(from: string, toDateStr: string): number {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(toDateStr + "T00:00:00Z");
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

// The client's own IANA timezone, for date/weekday math — NOT the
// server's. client_profiles.timezone already exists (default
// "America/Chicago") and is already the canonical source
// lib/checkin/schedule.ts's callers use for the identical class of
// problem; this reuses it rather than inventing a second notion of
// "the client's timezone." A client with no profile row at all (should
// not happen in practice — no FK guarantees it, so this stays
// defensive) falls back to an empty string, which
// getDateInTimezone/getWeekdayInTimezone already treat as an invalid
// zone and safely resolve to their own UTC fallback — one fallback
// path, not a second one invented here.
//
// Accepts an optional transaction (see DbOrTx in lib/db/client.ts) so
// createWorkoutSession() can resolve everything it depends on —
// including this — inside its own SERIALIZABLE transaction, keeping
// the concurrent-start correctness guarantee intact even now that
// starting a session also revalidates against this and
// getTodayWorkout().
async function getClientTimezone(clientId: string, dbClient?: DbOrTx): Promise<string> {
  const db = dbClient ?? getDb();
  const [profile] = await db
    .select({ timezone: clientProfiles.timezone })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, clientId))
    .limit(1);
  return profile?.timezone ?? "";
}

// [Independent review remediation — P1 legacy duplicate resurrection]
// The schema has no unique constraint enforcing "at most one
// in-progress session per client" (investigated: no migration was
// found to be genuinely necessary — see createWorkoutSession()'s own
// comment for how NEW duplicates are prevented going forward at the
// application layer instead). For legacy/edge-case rows that could
// already exist despite that prevention, the FIRST version of this
// function picked "the newest status='in_progress' row" — which let an
// OLDER still-in_progress duplicate (A) resurface as authoritative the
// moment a NEWER one (B) was completed, since completing B removed it
// from the in_progress pool and A then became "the newest in_progress
// row" again. That is exactly backwards: once B ever existed, A must
// never become authoritative again, regardless of what B's status
// later becomes.
//
// Fixed by changing the question entirely: instead of "what is the
// newest in_progress row," this asks "what is the single most
// recently created session for this client, of ANY status — and is
// THAT one currently in_progress." Once a newer session (B) exists at
// all, an older row (A) can never again be "the most recent," so it
// can never again be selected here — independent of B's own status.
// If the most recent session has since moved to a terminal state
// (completed/skipped), there is NO active session, full stop; normal
// schedule-based resolution takes over, exactly as required. No status
// is invented, no row is ever mutated or deleted here — this is a
// read-only reinterpretation of existing, already-persisted fields
// (clientId, status, createdAt, id).
//
// Deterministic tie-break: ORDER BY createdAt DESC, id DESC — never an
// unordered LIMIT 1, and never reliant on createdAt alone in case two
// rows share the same timestamp precision.
export async function getActiveWorkoutSession(
  clientId: string,
  dbClient?: DbOrTx,
): Promise<WorkoutSessionRow | null> {
  const db = dbClient ?? getDb();
  const [mostRecent] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.clientId, clientId))
    .orderBy(desc(workoutSessions.createdAt), desc(workoutSessions.id))
    .limit(1);
  return mostRecent && mostRecent.status === "in_progress" ? mostRecent : null;
}

export async function getTodayWorkout(
  clientId: string,
  dbClient?: DbOrTx,
): Promise<TodayResult> {
  const db = dbClient ?? getDb();

  // ── 1. Session-first resolution ──────────────────────────
  const activeSession = await getActiveWorkoutSession(clientId, dbClient);
  if (activeSession) {
    // Authoritative — frozen at session-creation time, never rederived
    // from the current (possibly since-edited) program/blueprint. See
    // this function's own header comment.
    const snapshot = activeSession.workoutSnapshot as unknown as WorkoutSnapshot;

    let programName = "Program";
    let totalWeeks = 0;
    if (activeSession.clientProgramId) {
      const [row] = await db
        .select({
          programName: programTemplates.name,
          totalWeeks: programTemplates.defaultDurationWeeks,
        })
        .from(clientPrograms)
        .innerJoin(programTemplates, eq(clientPrograms.programTemplateId, programTemplates.id))
        .where(eq(clientPrograms.id, activeSession.clientProgramId))
        .limit(1);
      if (row) {
        programName = row.programName;
        totalWeeks = row.totalWeeks ?? 0;
      }
    }

    return {
      kind: "workout",
      data: {
        clientProgramId: activeSession.clientProgramId ?? "",
        programName,
        weekNumber: activeSession.programWeekNumber ?? 0,
        dayOfWeek: activeSession.programDayOfWeek ?? 0,
        totalWeeks,
        workoutTemplateId: activeSession.workoutTemplateId,
        workoutName: snapshot.templateName,
        estimatedDurationMinutes: snapshot.estimatedDurationMinutes,
        scheduledDate: activeSession.scheduledDate ?? "",
        existingSessionId: activeSession.id,
        existingSessionStatus: activeSession.status,
        snapshot,
      },
    };
  }

  // ── 2. No active session — normal, timezone-correct scheduling ──
  const assignment = await getClientActiveProgram(clientId, dbClient);
  if (!assignment) return { kind: "no_program" };

  // Fetch template early — needed for not_started data and program_complete check.
  const [tmpl] = await db
    .select({
      name: programTemplates.name,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(programTemplates)
    .where(eq(programTemplates.id, assignment.programTemplateId))
    .limit(1);

  if (!tmpl) return { kind: "no_program" };

  // Both the date string and the weekday are derived from the SAME
  // timezone-interpreted instant — the exact inconsistency the
  // investigation found (todayStr via raw toISOString()/UTC,
  // dayOfWeek via the process's own local getDay()) is gone; there is
  // now exactly one timezone interpretation of "now" for this client.
  const timezone = await getClientTimezone(clientId, dbClient);
  const now = new Date();
  const todayStr = getDateInTimezone(now, timezone);
  const dayOfWeek = getWeekdayInTimezone(now, timezone);
  const elapsed = daysBetween(assignment.startDate, todayStr);

  if (elapsed < 0) {
    return {
      kind: "not_started",
      data: {
        programName: tmpl.name,
        startDate: assignment.startDate,
        daysUntilStart: Math.abs(elapsed),
        totalWeeks: tmpl.totalWeeks,
      },
    };
  }

  const weekNumber = Math.floor(elapsed / 7) + 1;

  if (tmpl.totalWeeks !== null && weekNumber > tmpl.totalWeeks) {
    return { kind: "program_complete" };
  }

  // Find the client's week row (client-owned, not the shared template)
  const [week] = await db
    .select()
    .from(clientProgramWeeks)
    .where(
      and(
        eq(clientProgramWeeks.clientProgramId, assignment.id),
        eq(clientProgramWeeks.weekNumber, weekNumber),
      ),
    )
    .limit(1);

  if (!week) return { kind: "rest_day" };

  // Find the client's day slot
  const [daySlot] = await db
    .select()
    .from(clientProgramWeekDays)
    .where(
      and(
        eq(clientProgramWeekDays.clientProgramWeekId, week.id),
        eq(clientProgramWeekDays.dayOfWeek, dayOfWeek),
      ),
    )
    .limit(1);

  if (!daySlot || !daySlot.workoutTemplateId) return { kind: "rest_day" };

  // Fetch workout template metadata
  const [wt] = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, daySlot.workoutTemplateId))
    .limit(1);

  if (!wt) return { kind: "rest_day" };

  // Check for an existing (any status — including already-completed
  // today, which drives the "Session logged" UI) session today. This
  // can no longer find an in_progress row (that's handled by step 1
  // above, unconditionally, before this code ever runs) — it exists
  // purely to preserve "already completed today" detection.
  const [existingSession] = await db
    .select({ id: workoutSessions.id, status: workoutSessions.status })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        eq(workoutSessions.scheduledDate, todayStr),
        eq(workoutSessions.workoutTemplateId, daySlot.workoutTemplateId),
      ),
    )
    .orderBy(desc(workoutSessions.createdAt))
    .limit(1);

  const snapshot = await buildWorkoutSnapshot(daySlot.workoutTemplateId);

  return {
    kind: "workout",
    data: {
      clientProgramId: assignment.id,
      programName: tmpl.name,
      weekNumber,
      dayOfWeek,
      totalWeeks: tmpl.totalWeeks ?? 0,
      workoutTemplateId: daySlot.workoutTemplateId,
      workoutName: wt.name,
      estimatedDurationMinutes: wt.estimatedDurationMinutes,
      scheduledDate: todayStr,
      existingSessionId: existingSession?.id ?? null,
      existingSessionStatus: existingSession?.status ?? null,
      snapshot,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// COACH DASHBOARD — COMPLIANCE METRICS
// ─────────────────────────────────────────────────────────────

export async function getComplianceSummary(
  clientId: string,
): Promise<ComplianceSummary | null> {
  const db = getDb();

  const assignment = await getClientActiveProgram(clientId);
  if (!assignment) return null;

  const [tmpl] = await db
    .select({
      name: programTemplates.name,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(programTemplates)
    .where(eq(programTemplates.id, assignment.programTemplateId))
    .limit(1);

  const [profile] = await db
    .select({
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
    })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, clientId))
    .limit(1);

  if (!tmpl) return null;

  const today = new Date();
  // Unchanged UTC-based semantics for this call site — this function
  // is compliance/program-page metadata, not the today's-workout
  // resolution this remediation targets; daysBetween's signature moved
  // to a plain date string, so this preserves exactly the prior
  // behavior explicitly rather than silently inheriting a timezone
  // change out of scope for this fix.
  const elapsed = daysBetween(assignment.startDate, today.toISOString().slice(0, 10));
  const weekNumber = Math.max(1, Math.floor(elapsed / 7) + 1);

  // Count scheduled sessions: client-owned day slots with a workout assigned
  // in weeks 1..weekNumber
  const clientWeeks = await db
    .select({
      id: clientProgramWeeks.id,
      weekNumber: clientProgramWeeks.weekNumber,
    })
    .from(clientProgramWeeks)
    .where(eq(clientProgramWeeks.clientProgramId, assignment.id));

  const pastWeekIds = clientWeeks
    .filter((w) => w.weekNumber <= weekNumber)
    .map((w) => w.id);

  let scheduledCount = 0;
  if (pastWeekIds.length > 0) {
    const dayRows = await db
      .select({ id: clientProgramWeekDays.id })
      .from(clientProgramWeekDays)
      .where(
        and(
          inArray(clientProgramWeekDays.clientProgramWeekId, pastWeekIds),
          isNotNull(clientProgramWeekDays.workoutTemplateId),
        ),
      );
    scheduledCount = dayRows.length;
  }

  // Count completed sessions
  const sessions = await db
    .select({
      status: workoutSessions.status,
      completedAt: workoutSessions.completedAt,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        eq(workoutSessions.clientProgramId, assignment.id),
      ),
    )
    .orderBy(desc(workoutSessions.completedAt));

  const completedSessions = sessions.filter(
    (s) => s.status === "completed",
  ).length;
  const lastCompletedAt =
    sessions.find((s) => s.status === "completed")?.completedAt ?? null;

  const compliancePercent =
    scheduledCount > 0
      ? Math.round((completedSessions / scheduledCount) * 100)
      : 0;

  return {
    clientId,
    clientName:
      profile?.preferredName ?? profile?.fullName ?? clientId,
    programName: tmpl.name,
    weekNumber,
    totalWeeks: tmpl.totalWeeks,
    scheduledSessions: scheduledCount,
    completedSessions,
    compliancePercent,
    lastCompletedAt,
    nextScheduledDate: null, // future enhancement
    assignmentId: assignment.id,
  };
}

// ─────────────────────────────────────────────────────────────
// PROGRAM PAGE DATA
//
// Full data bundle for the client's /portal/program page.
// Returns the primary active goal (if any), the active program
// with current-week workout schedule, and all weeks for the
// journey arc.
// ─────────────────────────────────────────────────────────────

export interface DaySchedule {
  dayOfWeek: number;
  workoutName: string | null;
  workoutDescription: string | null;
  estimatedMinutes: number | null;
  workoutTemplateId: string | null;
}

export interface ProgramWeekPreview {
  weekNumber: number;
  label: string | null;
  notes: string | null;
}

export interface ActiveGoalData {
  id: string;
  goalType: string;
  description: string;
  targetDate: string | null;
  targetValue: string | null;
  targetUnit: string | null;
  status: string;
}

export interface ActiveProgramData {
  id: string;
  programTemplateId: string;
  programName: string;
  programDescription: string | null;
  programCategory: string;
  coachNotes: string | null;
  startDate: string;
  totalWeeks: number | null;
  currentWeekNum: number | null;
  currentWeekLabel: string | null;
  currentWeekNotes: string | null;
  daysSchedule: DaySchedule[];
  allWeeks: ProgramWeekPreview[];
  isPreparing: boolean;
}

export interface ProgramPageData {
  goal: ActiveGoalData | null;
  activeProgram: ActiveProgramData | null;
}

function buildEmptyWeek(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    workoutName: null,
    workoutDescription: null,
    estimatedMinutes: null,
    workoutTemplateId: null,
  }));
}

function buildDaySchedule(
  slots: {
    dayOfWeek: number;
    workoutTemplateId: string | null;
    workoutName: string | null;
    workoutDescription: string | null;
    estimatedMinutes: number | null;
  }[],
): DaySchedule[] {
  const byDay = new Map(slots.map((s) => [s.dayOfWeek, s]));
  return Array.from({ length: 7 }, (_, i) => {
    const slot = byDay.get(i);
    const isTraining = Boolean(slot?.workoutTemplateId);
    return {
      dayOfWeek: i,
      workoutName: isTraining ? (slot!.workoutName ?? null) : null,
      workoutDescription: isTraining ? (slot!.workoutDescription ?? null) : null,
      estimatedMinutes: slot?.estimatedMinutes ?? null,
      workoutTemplateId: slot?.workoutTemplateId ?? null,
    };
  });
}

export async function getProgramPageData(
  clientId: string,
): Promise<ProgramPageData> {
  const db = getDb();
  const today = new Date();

  // Primary active goal — lowest priority number wins; null priority last
  const [goalRow] = await db
    .select({
      id: clientGoals.id,
      goalType: clientGoals.goalType,
      description: clientGoals.description,
      targetDate: clientGoals.targetDate,
      targetValue: clientGoals.targetValue,
      targetUnit: clientGoals.targetUnit,
      status: clientGoals.status,
    })
    .from(clientGoals)
    .where(
      and(
        eq(clientGoals.clientId, clientId),
        eq(clientGoals.status, "active"),
      ),
    )
    .orderBy(asc(clientGoals.priority), desc(clientGoals.createdAt))
    .limit(1);

  const assignment = await getClientActiveProgram(clientId);
  if (!assignment) {
    return { goal: goalRow ?? null, activeProgram: null };
  }

  const [tmpl] = await db
    .select({
      name: programTemplates.name,
      description: programTemplates.description,
      category: programTemplates.category,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(programTemplates)
    .where(eq(programTemplates.id, assignment.programTemplateId))
    .limit(1);

  if (!tmpl) return { goal: goalRow ?? null, activeProgram: null };

  // Unchanged UTC-based semantics for this call site — this function
  // is compliance/program-page metadata, not the today's-workout
  // resolution this remediation targets; daysBetween's signature moved
  // to a plain date string, so this preserves exactly the prior
  // behavior explicitly rather than silently inheriting a timezone
  // change out of scope for this fix.
  const elapsed = daysBetween(assignment.startDate, today.toISOString().slice(0, 10));
  const isPreparing = elapsed < 0;
  const rawWeekNum = isPreparing ? null : Math.floor(elapsed / 7) + 1;

  // Query client-owned week rows first — totalWeeks must reflect the client's
  // actual schedule, not the template default, so currentWeekNum caps correctly
  // when a coach adds or removes weeks for an individual client.
  const allWeekRows = await db
    .select({
      id: clientProgramWeeks.id,
      weekNumber: clientProgramWeeks.weekNumber,
      label: clientProgramWeeks.label,
      notes: clientProgramWeeks.notes,
    })
    .from(clientProgramWeeks)
    .where(eq(clientProgramWeeks.clientProgramId, assignment.id))
    .orderBy(asc(clientProgramWeeks.weekNumber));

  const totalWeeks = allWeekRows.length > 0 ? allWeekRows.length : tmpl.totalWeeks;

  const currentWeekNum =
    rawWeekNum === null
      ? null
      : totalWeeks
      ? Math.min(rawWeekNum, totalWeeks)
      : rawWeekNum;

  // When preparing, show week 1's data as a preview; when active, show current week
  const displayWeekRow = isPreparing
    ? allWeekRows.find((w) => w.weekNumber === 1)
    : allWeekRows.find((w) => w.weekNumber === currentWeekNum);

  let daysSchedule: DaySchedule[] = buildEmptyWeek();

  if (displayWeekRow) {
    const daySlots = await db
      .select({
        dayOfWeek: clientProgramWeekDays.dayOfWeek,
        workoutTemplateId: clientProgramWeekDays.workoutTemplateId,
        workoutName: workoutTemplates.name,
        workoutDescription: workoutTemplates.description,
        estimatedMinutes: workoutTemplates.estimatedDurationMinutes,
      })
      .from(clientProgramWeekDays)
      .leftJoin(
        workoutTemplates,
        eq(clientProgramWeekDays.workoutTemplateId, workoutTemplates.id),
      )
      .where(eq(clientProgramWeekDays.clientProgramWeekId, displayWeekRow.id));

    daysSchedule = buildDaySchedule(daySlots);
  }

  return {
    goal: goalRow ?? null,
    activeProgram: {
      id: assignment.id,
      programTemplateId: assignment.programTemplateId,
      // Prefer the snapshotted name so renames don't silently change display;
      // fall back to live template name for pre-migration rows (should not occur
      // after backfill but kept as a safe defensive fallback).
      programName: assignment.sourceTemplateName ?? tmpl.name,
      programDescription: tmpl.description ?? null,
      programCategory: tmpl.category,
      coachNotes: assignment.coachNotes,
      startDate: assignment.startDate,
      totalWeeks,
      currentWeekNum,
      currentWeekLabel: displayWeekRow?.label ?? null,
      currentWeekNotes: displayWeekRow?.notes ?? null,
      daysSchedule,
      allWeeks: allWeekRows.map((w) => ({
        weekNumber: w.weekNumber,
        label: w.label,
        notes: w.notes,
      })),
      isPreparing,
    },
  };
}
