// ─────────────────────────────────────────────────────────────
// Catalyst OS — Client Program Service (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
// Handles program assignment to clients, the single-active-program
// rule, and the "today's workout" lookup logic.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./client";
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
} from "./schema-program";
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
): Promise<ClientProgram | null> {
  const db = getDb();
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
// Resolves which workout (if any) the client should do today
// based on their active program and today's calendar date.
//
// Week calculation:
//   weekNumber = floor(daysBetween(startDate, today) / 7) + 1
//   dayOfWeek  = today.getDay()   (0=Sun … 6=Sat)
//
// Returns a tagged union so callers can handle each case:
//   workout       — a specific blueprint is scheduled today
//   rest_day      — program has this day as rest
//   no_program    — client has no active program
//   program_complete — past the last week of the program
//   not_started   — program start date is in the future
// ─────────────────────────────────────────────────────────────

function daysBetween(from: string, to: Date): number {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(
    to.toISOString().slice(0, 10) + "T00:00:00Z",
  );
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export async function getTodayWorkout(
  clientId: string,
): Promise<TodayResult> {
  const db = getDb();

  const assignment = await getClientActiveProgram(clientId);
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

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const elapsed = daysBetween(assignment.startDate, today);

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
  const dayOfWeek = today.getDay();

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

  // Check for an existing session today
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
  const elapsed = daysBetween(assignment.startDate, today);
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

  const elapsed = daysBetween(assignment.startDate, today);
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
