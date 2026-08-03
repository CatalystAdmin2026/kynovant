// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Coach Client Workspace Service (Sprint 6.2C)
//
// SERVER-ONLY — never import from a Client Component.
//
// Returns a single normalized view model for the coach's full
// client command center at /hq/clients/[clientId].
//
// Query strategy: 2-phase parallel execution.
//   Phase 1: core identity + program + session stats (independent)
//   Phase 2: everything that depends on phase 1 output (parallel)
//   Phase 3: synchronous derivations (attention, readiness)
//
// Multi-tenant:
//   coachId === null (admin): unscoped, any client.
//   coachId === <uuid> (coach): returns null unless that coach has a
//   coaching_enrollments row with this client — see coachOwnsClient()
//   in lib/auth/guards.ts. Returning null (not throwing) matches this
//   file's existing role-mismatch behavior below, and the page callers
//   already treat a null workspace as notFound().
//
// Security:
//   All functions verify role=client before returning data.
//   Sensitive health data is returned only in workspace.sensitive —
//   callers must never forward this sub-object to client routes.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import { coachOwnsClient } from "@/lib/auth/guards";
import {
  users,
  clientProfiles,
  coachingEnrollments,
  programTemplates,
  workoutTemplates,
  timelineEvents as timelineEventsTable,
} from "./schema";
import {
  clientPrograms,
  workoutSessions,
  workoutSetLogs,
  programWeeks,
  programWeekDays,
} from "./schema-program";
import { workoutTemplateExercises, exercises } from "./schema-exercise";
import { bodyCompositionRecords } from "./schema-profile";
import { getClientProfileBundle } from "./profile-service";
import { getClientHealthRestrictions } from "./profile-service";
import { calculateProfileReadiness } from "./profile-readiness";
import { getWorkoutHistory } from "./workout-session-service";
import {
  computeAttention,
  computeCompliancePct,
  computeCurrentWeek,
  type AttentionLevel,
} from "./coach-dashboard-service";
import type { HistorySession } from "./workout-session-service";
import type { ProfileReadiness } from "./profile-readiness";
import type { TrainingProfile, NutritionProfile, ClientPreference } from "./schema-profile";

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export type { AttentionLevel, ProfileReadiness };

export interface WeekDaySchedule {
  dayOfWeek: number; // 0=Sun … 6=Sat
  dayName: string;
  workoutName: string | null;
  workoutTemplateId: string | null;
  isRestDay: boolean;
  sessionStatus: "completed" | "skipped" | "upcoming" | null;
  sessionId: string | null;
  completionPercent: number | null;
}

export interface ExercisePerformance {
  exerciseId: string;
  exerciseName: string;
  latestDate: Date;
  latestMaxWeightLbs: number | null;
  latestMaxReps: number | null;
  latestAvgRpe: number | null;
  latestSetCount: number;
  priorDate: Date | null;
  priorMaxWeightLbs: number | null;
  priorMaxReps: number | null;
  weightDeltaLbs: number | null;
}

export interface BodyCompSnapshot {
  id: string;
  recordedAt: Date;
  weightPounds: number | null;
  bodyFatPercent: number | null;
  waistInches: number | null;
  source: string;
}

export interface WorkspaceGoal {
  id: string;
  goalType: string;
  description: string;
  priority: number | null;
  targetValue: string | null;
  targetUnit: string | null;
  targetDate: string | null;
  status: string;
}

export interface InjurySummary {
  id: string;
  bodyRegion: string;
  conditionName: string | null;
  description: string;
  status: string;
  severity: number | null;
  exerciseRestrictions: string | null;
}

export interface WorkspaceTimelineEntry {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  occurredAt: Date;
  source: "timeline" | "session" | "body_comp";
}

export interface SetAnalytics {
  totalSetsLast7d: number;
  totalSetsLast30d: number;
  avgRpeLast30d: number | null;
  totalVolumeKgLast30d: number | null;
}

export interface ActiveProgramInfo {
  id: string;
  templateId: string;
  name: string;
  startDate: string;
  endDate: string | null;
  derivedEndDate: string | null; // startDate + totalWeeks * 7 if endDate is null
  totalWeeks: number | null;
  currentWeek: number;
  daysRemaining: number | null;
  recommendedDaysPerWeek: number | null;
  programCompletionPct: number | null;
  currentWeekSchedule: WeekDaySchedule[];
}

export interface CoachClientWorkspace {
  // Identity
  userId: string;
  email: string;
  userStatus: string;
  fullName: string;
  preferredName: string | null;
  timezone: string;
  clientSince: Date;

  // Enrollment (most recent active or any)
  enrollment: {
    id: string;
    packageType: string;
    enrollmentStatus: string;
    startDate: string | null;
    endDate: string | null;
    checkInDayOfWeek: number | null;
    pipelineStage: string;
  } | null;

  // Attention
  attentionLevel: AttentionLevel;
  attentionReason: string;

  // Active program
  activeProgram: ActiveProgramInfo | null;

  // Session stats
  sessionStats: {
    completedTotal: number;
    skippedTotal: number;
    completedLast7d: number;
    completedLast30d: number;
    skippedLast30d: number;
    completedToday: number;
    lastCompletedAt: Date | null;
    compliancePct: number | null;
    setAnalytics: SetAnalytics;
  };

  // Recent sessions (last 10)
  recentSessions: HistorySession[];

  // Exercise performance highlights (up to 5 exercises with recent logs)
  exerciseHighlights: ExercisePerformance[];

  // Body composition (last 5 records)
  bodyComposition: {
    latest: BodyCompSnapshot | null;
    prior: BodyCompSnapshot | null;
    history: BodyCompSnapshot[];
  };

  // Goals
  goals: WorkspaceGoal[];

  // Profile readiness
  readiness: ProfileReadiness;

  // Safe profile summaries
  trainingProfile: TrainingProfile | null;
  nutritionProfile: NutritionProfile | null;
  preferences: ClientPreference | null;

  // SENSITIVE — coach/admin only; never expose to client routes or browser
  sensitive: {
    medicalClearanceRequired: boolean;
    medicalClearanceReceived: boolean;
    physicianRestrictions: string | null;
    activeInjuries: InjurySummary[];
  };

  // Activity timeline (merged, chronological desc, last 20)
  activityTimeline: WorkspaceTimelineEntry[];
}

// ─────────────────────────────────────────────────────────────
// INTERNAL CONSTANTS
// ─────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const KG_TO_LBS = 2.20462;

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export async function getCoachClientWorkspace(
  clientId: string,
  coachId: string | null = null,
): Promise<CoachClientWorkspace | null> {
  const db = getDb();

  // ── Role verification ─────────────────────────────────────
  const [roleCheck] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);

  if (!roleCheck || roleCheck.role !== "client") return null;

  // ── Ownership verification ────────────────────────────────
  // Admin (coachId === null) bypasses. A coach only reaches this
  // client's workspace — including workspace.sensitive health data —
  // if they actually have a coaching_enrollments row with them.
  if (coachId !== null && !(await coachOwnsClient(coachId, clientId))) {
    return null;
  }

  // ── Phase 1: Core client identity + program + session stats (parallel) ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoDate = thirtyDaysAgo.split("T")[0];
  const todayUTC = now.toISOString().split("T")[0] + "T00:00:00.000Z";
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [coreRows, enrollmentRow, programRow, sessionStatsRows, profileBundle, healthData] =
    await Promise.all([
      // users + clientProfiles join
      db
        .select({
          id: users.id,
          email: users.email,
          status: users.status,
          createdAt: users.createdAt,
          fullName: clientProfiles.fullName,
          preferredName: clientProfiles.preferredName,
          timezone: clientProfiles.timezone,
        })
        .from(users)
        .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
        .where(eq(users.id, clientId))
        .limit(1),

      // Most recent coaching enrollment (active preferred, else latest)
      db
        .select({
          id: coachingEnrollments.id,
          packageType: coachingEnrollments.packageType,
          status: coachingEnrollments.status,
          startDate: coachingEnrollments.startDate,
          endDate: coachingEnrollments.endDate,
          checkInDayOfWeek: coachingEnrollments.checkInDayOfWeek,
          pipelineStage: coachingEnrollments.pipelineStage,
        })
        .from(coachingEnrollments)
        .where(eq(coachingEnrollments.clientId, clientId))
        .orderBy(desc(coachingEnrollments.createdAt))
        .limit(1),

      // Active client program + template
      db
        .select({
          programId: clientPrograms.id,
          templateId: programTemplates.id,
          programName: programTemplates.name,
          startDate: clientPrograms.startDate,
          endDate: clientPrograms.endDate,
          totalWeeks: programTemplates.defaultDurationWeeks,
          recommendedDaysPerWeek: programTemplates.recommendedDaysPerWeek,
        })
        .from(clientPrograms)
        .innerJoin(programTemplates, eq(programTemplates.id, clientPrograms.programTemplateId))
        .where(and(eq(clientPrograms.clientId, clientId), eq(clientPrograms.status, "active")))
        .orderBy(desc(clientPrograms.createdAt))
        .limit(1),

      // Session statistics aggregation (single query)
      db
        .select({
          completedTotal: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed')::int`,
          skippedTotal: sql<number>`count(*) filter (where ${workoutSessions.status} = 'skipped')::int`,
          completedLast7d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${sevenDaysAgo}::timestamptz)::int`,
          completedLast30d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
          skippedLast30d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'skipped' AND ${workoutSessions.scheduledDate} >= ${thirtyDaysAgoDate})::int`,
          completedToday: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${todayUTC}::timestamptz)::int`,
          lastCompletedAt: sql<Date | null>`max(${workoutSessions.completedAt}) filter (where ${workoutSessions.status} = 'completed')`,
        })
        .from(workoutSessions)
        .where(eq(workoutSessions.clientId, clientId)),

      // Profile bundle (reuses safe-query pattern from profile-service)
      getClientProfileBundle(clientId),

      // Health restrictions (server-only)
      getClientHealthRestrictions(clientId),
    ]);

  const core = coreRows[0];
  if (!core) return null;

  const program = programRow[0] ?? null;

  // ── Phase 2: All dependent + independent reads (parallel) ──
  const currentWeek = program ? computeCurrentWeek(program.startDate) : null;

  const [
    weekSchedule,
    recentSessions,
    bodyCompRows,
    timelineRows,
    exerciseLogs,
    setAnalyticsRows,
  ] = await Promise.all([
    // Current week schedule (requires programId + templateId)
    program && currentWeek !== null
      ? fetchWeekSchedule(program.templateId, program.programId, currentWeek, clientId)
      : Promise.resolve([]),

    // Recent sessions (last 10)
    getWorkoutHistory(clientId, 10),

    // Body comp history (last 5 records)
    db
      .select({
        id: bodyCompositionRecords.id,
        recordedAt: bodyCompositionRecords.recordedAt,
        weightPounds: bodyCompositionRecords.weightPounds,
        bodyFatPercent: bodyCompositionRecords.bodyFatPercent,
        waistInches: bodyCompositionRecords.waistInches,
        source: bodyCompositionRecords.source,
      })
      .from(bodyCompositionRecords)
      .where(eq(bodyCompositionRecords.clientId, clientId))
      .orderBy(desc(bodyCompositionRecords.recordedAt))
      .limit(5),

    // Timeline events (last 15)
    db
      .select({
        id: timelineEventsTable.id,
        eventType: timelineEventsTable.eventType,
        title: timelineEventsTable.title,
        description: timelineEventsTable.description,
        occurredAt: timelineEventsTable.occurredAt,
      })
      .from(timelineEventsTable)
      .where(eq(timelineEventsTable.clientId, clientId))
      .orderBy(desc(timelineEventsTable.occurredAt))
      .limit(15),

    // Exercise performance logs (last 90d, weight-tracked only)
    db
      .select({
        exerciseId: exercises.id,
        exerciseName: exercises.name,
        weightKg: workoutSetLogs.actualWeightKg,
        reps: workoutSetLogs.actualReps,
        rpe: workoutSetLogs.actualRpe,
        setNumber: workoutSetLogs.setNumber,
        sessionDate: workoutSessions.completedAt,
      })
      .from(workoutSetLogs)
      .innerJoin(workoutSessions, eq(workoutSetLogs.workoutSessionId, workoutSessions.id))
      .innerJoin(
        workoutTemplateExercises,
        eq(workoutSetLogs.workoutTemplateExerciseId, workoutTemplateExercises.id),
      )
      .innerJoin(exercises, eq(workoutTemplateExercises.exerciseId, exercises.id))
      .where(
        and(
          eq(workoutSessions.clientId, clientId),
          eq(workoutSessions.status, "completed"),
          sql`${workoutSessions.completedAt} >= ${ninetyDaysAgo}::timestamptz`,
          sql`(${workoutSetLogs.actualWeightKg} IS NOT NULL OR ${workoutSetLogs.actualReps} IS NOT NULL)`,
        ),
      )
      .orderBy(exercises.id, desc(workoutSessions.completedAt), workoutSetLogs.setNumber),

    // Set analytics (30d completed sessions)
    db
      .select({
        totalSets30d: sql<number>`count(*)::int`,
        totalSets7d: sql<number>`count(*) filter (where ${workoutSessions.completedAt} >= ${sevenDaysAgo}::timestamptz)::int`,
        avgRpe30d: sql<string | null>`avg(${workoutSetLogs.actualRpe}::numeric)`,
        totalVolumeKg: sql<string | null>`sum(case when ${workoutSetLogs.actualWeightKg} is not null and ${workoutSetLogs.actualReps} is not null then ${workoutSetLogs.actualWeightKg}::numeric * ${workoutSetLogs.actualReps}::numeric else null end)`,
      })
      .from(workoutSetLogs)
      .innerJoin(workoutSessions, eq(workoutSetLogs.workoutSessionId, workoutSessions.id))
      .where(
        and(
          eq(workoutSessions.clientId, clientId),
          eq(workoutSessions.status, "completed"),
          sql`${workoutSessions.completedAt} >= ${thirtyDaysAgo}::timestamptz`,
        ),
      ),
  ]);

  // ── Phase 3: Synchronous derivation ──────────────────────────

  // Session stats
  const rawStats = sessionStatsRows[0];
  const completedTotal = rawStats?.completedTotal ?? 0;
  const skippedTotal = rawStats?.skippedTotal ?? 0;
  const completedLast7d = rawStats?.completedLast7d ?? 0;
  const completedLast30d = rawStats?.completedLast30d ?? 0;
  const skippedLast30d = rawStats?.skippedLast30d ?? 0;
  const completedToday = rawStats?.completedToday ?? 0;
  const lastCompletedAtRaw = rawStats?.lastCompletedAt ?? null;
  const lastCompletedAt = lastCompletedAtRaw
    ? new Date(lastCompletedAtRaw as unknown as string | Date)
    : null;

  const compliancePct = computeCompliancePct(completedLast30d, skippedLast30d);

  // Set analytics
  const rawAnalytics = setAnalyticsRows[0];
  const setAnalytics: SetAnalytics = {
    totalSetsLast7d: rawAnalytics?.totalSets7d ?? 0,
    totalSetsLast30d: rawAnalytics?.totalSets30d ?? 0,
    avgRpeLast30d: rawAnalytics?.avgRpe30d ? parseFloat(rawAnalytics.avgRpe30d) : null,
    totalVolumeKgLast30d: rawAnalytics?.totalVolumeKg ? parseFloat(rawAnalytics.totalVolumeKg) : null,
  };

  // Attention scoring
  const { level: attentionLevel, reason: attentionReason } = computeAttention({
    activeProgramId: program?.programId ?? null,
    completedLast7d,
    skippedLast30d,
    compliancePct,
    programStartDate: program?.startDate ?? null,
    programEndDate: program?.endDate ?? null,
  });

  // Active program info
  let activeProgram: ActiveProgramInfo | null = null;
  if (program && currentWeek !== null) {
    const totalWeeks = program.totalWeeks ?? null;
    const endDate = program.endDate ?? null;
    const derivedEndDate =
      !endDate && totalWeeks
        ? (() => {
            const d = new Date(program.startDate + "T00:00:00Z");
            d.setDate(d.getDate() + totalWeeks * 7);
            return d.toISOString().split("T")[0];
          })()
        : null;

    const effectiveEnd = endDate ?? derivedEndDate;
    const daysRemaining = effectiveEnd
      ? Math.max(
          0,
          Math.ceil(
            (new Date(effectiveEnd + "T23:59:59Z").getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    const programCompletionPct =
      totalWeeks !== null
        ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100))
        : null;

    activeProgram = {
      id: program.programId,
      templateId: program.templateId,
      name: program.programName,
      startDate: program.startDate,
      endDate,
      derivedEndDate,
      totalWeeks,
      currentWeek,
      daysRemaining,
      recommendedDaysPerWeek: program.recommendedDaysPerWeek ?? null,
      programCompletionPct,
      currentWeekSchedule: weekSchedule,
    };
  }

  // Body composition
  const bodyCompHistory: BodyCompSnapshot[] = bodyCompRows.map((r) => ({
    id: r.id,
    recordedAt: new Date(r.recordedAt as unknown as string | Date),
    weightPounds: r.weightPounds ? parseFloat(r.weightPounds as unknown as string) : null,
    bodyFatPercent: r.bodyFatPercent ? parseFloat(r.bodyFatPercent as unknown as string) : null,
    waistInches: r.waistInches ? parseFloat(r.waistInches as unknown as string) : null,
    source: r.source,
  }));

  // Exercise highlights (group by exercise, take 2 distinct sessions per exercise)
  const exerciseHighlights = deriveExerciseHighlights(exerciseLogs);

  // Goals from profile bundle
  const goals: WorkspaceGoal[] = (profileBundle.activeGoals ?? []).map((g) => ({
    id: g.id,
    goalType: g.goalType,
    description: g.description,
    priority: g.priority ?? null,
    targetValue: g.targetValue ?? null,
    targetUnit: g.targetUnit ?? null,
    targetDate: g.targetDate ?? null,
    status: g.status,
  }));

  // Profile readiness (synchronous derive from bundle)
  const readiness = await calculateProfileReadiness(clientId, profileBundle);

  // Sensitive health data
  const sensitive = {
    medicalClearanceRequired: healthData.healthProfile?.medicalClearanceRequired ?? false,
    medicalClearanceReceived: healthData.healthProfile?.medicalClearanceReceivedAt !== null,
    physicianRestrictions: healthData.healthProfile?.physicianRestrictions ?? null,
    activeInjuries: healthData.activeInjuries.map((i) => ({
      id: i.id,
      bodyRegion: i.bodyRegion,
      conditionName: i.conditionName ?? null,
      description: i.description,
      status: i.status,
      severity: i.severity ?? null,
      exerciseRestrictions: i.exerciseRestrictions ?? null,
    })),
  };

  // Activity timeline: merge DB events + session-derived events
  const activityTimeline = buildTimeline(timelineRows, recentSessions, bodyCompHistory);

  // Enrollment
  const enrollmentData = enrollmentRow[0] ?? null;
  const enrollment = enrollmentData
    ? {
        id: enrollmentData.id,
        packageType: enrollmentData.packageType,
        enrollmentStatus: enrollmentData.status,
        startDate: enrollmentData.startDate ?? null,
        endDate: enrollmentData.endDate ?? null,
        checkInDayOfWeek: enrollmentData.checkInDayOfWeek ?? null,
        pipelineStage: enrollmentData.pipelineStage,
      }
    : null;

  return {
    userId: core.id,
    email: core.email,
    userStatus: core.status,
    fullName: core.fullName ?? core.email,
    preferredName: core.preferredName ?? null,
    timezone: core.timezone ?? "America/Chicago",
    clientSince: new Date(core.createdAt as unknown as string | Date),
    enrollment,
    attentionLevel,
    attentionReason,
    activeProgram,
    sessionStats: {
      completedTotal,
      skippedTotal,
      completedLast7d,
      completedLast30d,
      skippedLast30d,
      completedToday,
      lastCompletedAt,
      compliancePct,
      setAnalytics,
    },
    recentSessions,
    exerciseHighlights,
    bodyComposition: {
      latest: bodyCompHistory[0] ?? null,
      prior: bodyCompHistory[1] ?? null,
      history: bodyCompHistory,
    },
    goals,
    readiness,
    trainingProfile: profileBundle.trainingProfile,
    nutritionProfile: profileBundle.nutritionProfile,
    preferences: profileBundle.preferences,
    sensitive,
    activityTimeline,
  };
}

// ─────────────────────────────────────────────────────────────
// CURRENT WEEK SCHEDULE FETCHER
// ─────────────────────────────────────────────────────────────

async function fetchWeekSchedule(
  templateId: string,
  programId: string,
  weekNumber: number,
  clientId: string,
): Promise<WeekDaySchedule[]> {
  const db = getDb();

  // Find the program_week row for this template + week
  const [weekRow] = await db
    .select({ id: programWeeks.id })
    .from(programWeeks)
    .where(
      and(eq(programWeeks.programTemplateId, templateId), eq(programWeeks.weekNumber, weekNumber)),
    )
    .limit(1);

  if (!weekRow) return [];

  // Parallel: week day assignments + actual session completions this week
  const [weekDays, weeklySessions] = await Promise.all([
    db
      .select({
        dayOfWeek: programWeekDays.dayOfWeek,
        workoutTemplateId: programWeekDays.workoutTemplateId,
        workoutName: workoutTemplates.name,
      })
      .from(programWeekDays)
      .leftJoin(workoutTemplates, eq(programWeekDays.workoutTemplateId, workoutTemplates.id))
      .where(eq(programWeekDays.programWeekId, weekRow.id)),

    db
      .select({
        dayOfWeek: workoutSessions.programDayOfWeek,
        sessionId: workoutSessions.id,
        status: workoutSessions.status,
        completionPercent: workoutSessions.completionPercent,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.clientId, clientId),
          eq(workoutSessions.clientProgramId, programId),
          sql`${workoutSessions.programWeekNumber} = ${weekNumber}`,
        ),
      ),
  ]);

  // Map dayOfWeek → session info
  const sessionMap = new Map<number, (typeof weeklySessions)[0]>();
  for (const s of weeklySessions) {
    if (s.dayOfWeek !== null) sessionMap.set(s.dayOfWeek, s);
  }

  // Map dayOfWeek → scheduled workout
  const scheduleMap = new Map<number, (typeof weekDays)[0]>();
  for (const d of weekDays) {
    scheduleMap.set(d.dayOfWeek, d);
  }

  // Build all 7 days
  return Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = i;
    const scheduled = scheduleMap.get(dayOfWeek) ?? null;
    const session = sessionMap.get(dayOfWeek) ?? null;

    let sessionStatus: WeekDaySchedule["sessionStatus"] = null;
    if (session) {
      if (session.status === "completed") sessionStatus = "completed";
      else if (session.status === "skipped") sessionStatus = "skipped";
      else sessionStatus = "upcoming";
    } else if (scheduled) {
      sessionStatus = "upcoming";
    }

    return {
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      workoutName: scheduled?.workoutName ?? null,
      workoutTemplateId: scheduled?.workoutTemplateId ?? null,
      isRestDay: !scheduled,
      sessionStatus,
      sessionId: session?.sessionId ?? null,
      completionPercent: session?.completionPercent ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// EXERCISE PERFORMANCE HIGHLIGHTS
// ─────────────────────────────────────────────────────────────

type ExerciseLogRow = {
  exerciseId: string;
  exerciseName: string;
  weightKg: string | null;
  reps: number | null;
  rpe: string | null;
  setNumber: number;
  sessionDate: Date | null;
};

function deriveExerciseHighlights(rows: ExerciseLogRow[]): ExercisePerformance[] {
  // Group by exerciseId → sessions → sets
  type SessionData = {
    date: Date;
    sets: ExerciseLogRow[];
  };

  const byExercise = new Map<string, { name: string; sessions: SessionData[] }>();

  for (const row of rows) {
    if (!row.sessionDate) continue;
    const sessionDate = new Date(row.sessionDate as unknown as string | Date);
    let entry = byExercise.get(row.exerciseId);
    if (!entry) {
      entry = { name: row.exerciseName, sessions: [] };
      byExercise.set(row.exerciseId, entry);
    }

    // Find existing session bucket (same day to nearest minute)
    const sessionKey = sessionDate.toISOString().slice(0, 16);
    let session = entry.sessions.find(
      (s) => s.date.toISOString().slice(0, 16) === sessionKey,
    );
    if (!session) {
      session = { date: sessionDate, sets: [] };
      entry.sessions.push(session);
    }
    session.sets.push(row);
  }

  // Sort sessions descending within each exercise, already ordered by DB
  const results: ExercisePerformance[] = [];

  for (const [exerciseId, entry] of byExercise) {
    const sessions = entry.sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    if (sessions.length === 0) continue;

    const latest = sessions[0];
    const prior = sessions[1] ?? null;

    const latestMaxWeightKg = maxOf(latest.sets.map((s) => parseFloatOrNull(s.weightKg)));
    const latestMaxWeightLbs =
      latestMaxWeightKg !== null ? Math.round(latestMaxWeightKg * KG_TO_LBS * 10) / 10 : null;
    const latestMaxReps = maxOf(latest.sets.map((s) => s.reps));
    const latestAvgRpe = avgOf(latest.sets.map((s) => parseFloatOrNull(s.rpe)));

    const priorMaxWeightKg = prior ? maxOf(prior.sets.map((s) => parseFloatOrNull(s.weightKg))) : null;
    const priorMaxWeightLbs =
      priorMaxWeightKg !== null ? Math.round(priorMaxWeightKg * KG_TO_LBS * 10) / 10 : null;
    const priorMaxReps = prior ? maxOf(prior.sets.map((s) => s.reps)) : null;

    const weightDeltaLbs =
      latestMaxWeightLbs !== null && priorMaxWeightLbs !== null
        ? Math.round((latestMaxWeightLbs - priorMaxWeightLbs) * 10) / 10
        : null;

    results.push({
      exerciseId,
      exerciseName: entry.name,
      latestDate: latest.date,
      latestMaxWeightLbs,
      latestMaxReps,
      latestAvgRpe: latestAvgRpe !== null ? Math.round(latestAvgRpe * 10) / 10 : null,
      latestSetCount: latest.sets.length,
      priorDate: prior?.date ?? null,
      priorMaxWeightLbs,
      priorMaxReps,
      weightDeltaLbs,
    });

    if (results.length >= 5) break;
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY TIMELINE BUILDER
// ─────────────────────────────────────────────────────────────

function buildTimeline(
  dbEvents: { id: string; eventType: string; title: string; description: string | null; occurredAt: Date }[],
  recentSessions: HistorySession[],
  bodyCompHistory: BodyCompSnapshot[],
): WorkspaceTimelineEntry[] {
  const entries: WorkspaceTimelineEntry[] = [];

  // DB timeline events
  for (const e of dbEvents) {
    entries.push({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      occurredAt: new Date(e.occurredAt as unknown as string | Date),
      source: "timeline",
    });
  }

  // Session events from recentSessions (complement timeline, avoid duplicates)
  const timelineTypes = new Set(dbEvents.map((e) => e.eventType));
  for (const s of recentSessions) {
    if (s.status === "completed" || s.status === "skipped") {
      const occurredAt = s.completedAt ?? null;
      if (!occurredAt) continue;
      // Only add if no timeline event already covers workout_completed
      if (!timelineTypes.has("workout_completed") && !timelineTypes.has("workout_skipped")) {
        entries.push({
          id: `session-${s.id}`,
          eventType: s.status === "completed" ? "workout_completed" : "workout_skipped",
          title: s.status === "completed"
            ? `Completed: ${s.workoutName}`
            : `Skipped: ${s.workoutName}`,
          description:
            s.status === "completed" && s.completionPercent > 0
              ? `${s.completionPercent}% completion`
              : null,
          occurredAt: new Date(occurredAt as unknown as string | Date),
          source: "session",
        });
      }
    }
  }

  // Body comp events
  for (const b of bodyCompHistory) {
    if (b.weightPounds !== null) {
      entries.push({
        id: `bcomp-${b.id}`,
        eventType: "body_comp_recorded",
        title: `Body measurement recorded`,
        description: `${b.weightPounds} lbs`,
        occurredAt: b.recordedAt,
        source: "body_comp",
      });
    }
  }

  // Sort descending, deduplicate by id, cap at 20
  const seen = new Set<string>();
  return entries
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .slice(0, 20);
}

// ─────────────────────────────────────────────────────────────
// MICRO UTILITIES
// ─────────────────────────────────────────────────────────────

function parseFloatOrNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function maxOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length > 0 ? Math.max(...nums) : null;
}

function avgOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
