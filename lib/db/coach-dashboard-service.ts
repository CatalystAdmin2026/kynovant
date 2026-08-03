// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Coach Dashboard Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Multi-tenant: pass coachId to scope to one coach's own clients via
// coaching_enrollments. Pass null (admin) for unscoped, all-platform
// visibility — see resolveTenantScope() in lib/auth/guards.ts, which
// is the only place that should decide which of the two callers get.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { users, clientProfiles, programTemplates, workoutTemplates, coachingEnrollments } from "./schema";
import { clientPrograms, workoutSessions } from "./schema-program";
import { coachOwnsClient } from "@/lib/auth/guards";
import {
  getWorkoutHistory,
  getHistoricalSessionDetail,
  type HistorySession,
} from "./workout-session-service";
import {
  getCheckInMissionStats,
  type CheckInMissionStats,
} from "./coach-check-in-service";
export type { HistoricalSessionDetail, HistoricalSetLog } from "./workout-session-service";

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export type AttentionLevel = "critical" | "high" | "medium" | "healthy";

export interface CoachClientSummary {
  userId: string;
  email: string;
  userStatus: string;
  fullName: string;
  preferredName: string | null;
  // Active program
  activeProgramId: string | null;
  activeProgramTemplateId: string | null;
  activeProgramName: string | null;
  programStartDate: string | null;
  programEndDate: string | null;
  currentWeek: number | null;
  totalWeeks: number | null;
  // Session stats
  completedTotal: number;
  skippedTotal: number;
  completedLast7d: number;
  completedLast30d: number;
  skippedLast30d: number;
  completedToday: number;
  lastCompletedAt: Date | null;
  compliancePct: number | null; // last 30 days; null if <3 sessions
  // Derived
  attentionLevel: AttentionLevel;
  attentionReason: string;
}

export interface RecentSessionActivity {
  sessionId: string;
  clientId: string;
  clientName: string;
  workoutName: string;
  status: string;
  completionPercent: number;
  occurredAt: Date;
  programWeekNumber: number | null;
}

export interface MissionControlData {
  activeClientCount: number;
  noActiveProgramCount: number;
  noWorkoutLast7dCount: number;
  workoutsCompletedToday: number;
  workoutsCompletedLast7d: number;
  recentSkippedCount: number;
  prioritizedClients: CoachClientSummary[]; // non-healthy, sorted by urgency
  recentActivity: RecentSessionActivity[];
  checkIns: CheckInMissionStats;
}

export interface CoachClientDetail extends CoachClientSummary {
  recentSessions: HistorySession[];
}

// ─────────────────────────────────────────────────────────────
// ATTENTION SCORING
//
// Deterministic rules for prioritizing clients. These are
// operational coaching signals, not medical or diagnostic scores.
//
// critical  — act today
//   · No active program assigned
//
// high      — attention needed this week
//   · No completed workout in 7+ days (only after program is 7d old)
//   · 2+ skipped workouts in last 30 days
//   · Compliance < 50% (minimum 3 sessions to normalize)
//
// medium    — review this week
//   · Compliance < 75% (minimum 3 sessions to normalize)
//   · Program ending within 7 days
//
// healthy   — no triggers
//
// Future: add check-in overdue, missed assessment when those
// data sources exist.
// ─────────────────────────────────────────────────────────────

export interface AttentionInput {
  activeProgramId: string | null;
  completedLast7d: number;
  skippedLast30d: number;
  compliancePct: number | null;
  programStartDate: string | null;
  programEndDate: string | null;
}

export function computeAttention(input: AttentionInput): { level: AttentionLevel; reason: string } {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (!input.activeProgramId) {
    return { level: "critical", reason: "No active program" };
  }

  // Only flag "no workout in 7d" once the program has been active ≥7 days
  const programOldEnough = input.programStartDate
    ? new Date(input.programStartDate + "T00:00:00Z") <= sevenDaysAgo
    : false;

  if (programOldEnough && input.completedLast7d === 0) {
    return { level: "high", reason: "No workout in 7+ days" };
  }

  if (input.skippedLast30d >= 2) {
    return { level: "high", reason: `${input.skippedLast30d} skipped workouts (30d)` };
  }

  if (input.compliancePct !== null && input.compliancePct < 50) {
    return { level: "high", reason: `${input.compliancePct}% compliance (30d)` };
  }

  if (input.compliancePct !== null && input.compliancePct < 75) {
    return { level: "medium", reason: `${input.compliancePct}% compliance (30d)` };
  }

  if (input.programEndDate) {
    const endDate = new Date(input.programEndDate + "T23:59:59Z");
    if (endDate <= sevenDaysFromNow) {
      return { level: "medium", reason: "Program ending within 7 days" };
    }
  }

  return { level: "healthy", reason: "" };
}

// Compliance = completed / (completed + skipped) over last 30 days.
// Returns null if fewer than 3 sessions — not enough to be meaningful.
export function computeCompliancePct(completedLast30d: number, skippedLast30d: number): number | null {
  const total = completedLast30d + skippedLast30d;
  if (total < 3) return null;
  return Math.round((completedLast30d / total) * 100);
}

// Week 1 starts on program start date; advances every 7 days.
export function computeCurrentWeek(startDateStr: string): number {
  const startDate = new Date(startDateStr + "T00:00:00Z");
  const diffDays = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

const ATTENTION_ORDER: Record<AttentionLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  healthy: 3,
};

// ─────────────────────────────────────────────────────────────
// LIST ALL CLIENTS
//
// Returns clients enriched with active program and session stats.
// Two SQL queries total (no N+1).
//
// coachId === null (admin): every client on the platform.
// coachId === <uuid>: only clients this coach has a coaching_enrollments
//   row with (any status — see coachOwnsClient() in lib/auth/guards.ts
//   for why status is deliberately not filtered here).
// ─────────────────────────────────────────────────────────────

export async function listCoachClients(
  coachId: string | null = null,
): Promise<CoachClientSummary[]> {
  const db = getDb();

  // ── Query 1: client rows with profile + single active program ─
  const rawRows = await db
    .select({
      userId: users.id,
      email: users.email,
      userStatus: users.status,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
      programId: clientPrograms.id,
      programTemplateId: programTemplates.id,
      programName: programTemplates.name,
      programStartDate: clientPrograms.startDate,
      programEndDate: clientPrograms.endDate,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(users)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(
      clientPrograms,
      and(
        eq(clientPrograms.clientId, users.id),
        eq(clientPrograms.status, "active"),
      ),
    )
    .leftJoin(programTemplates, eq(programTemplates.id, clientPrograms.programTemplateId))
    .where(
      and(
        eq(users.role, "client"),
        // EXISTS rather than a join: keeps this a single row per client
        // regardless of how many coaching_enrollments rows exist (a
        // client can have several over time — see coachingEnrollments'
        // own schema comment), and leaves the admin (coachId === null)
        // path byte-for-byte identical to the pre-scoping query.
        coachId === null
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM ${coachingEnrollments}
              WHERE ${coachingEnrollments.clientId} = ${users.id}
                AND ${coachingEnrollments.coachId} = ${coachId}
            )`,
      ),
    )
    .orderBy(asc(users.createdAt));

  if (rawRows.length === 0) return [];

  // Dedup on userId in case multiple active programs exist (overrideAllowMultiple)
  const seen = new Set<string>();
  const clientRows = rawRows.filter((r) => {
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });

  const clientIds = clientRows.map((r) => r.userId);

  // ── Query 2: session stats for all clients in one aggregation ─
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoDate = thirtyDaysAgo.split("T")[0]; // date string for scheduledDate compare
  const todayUTC = now.toISOString().split("T")[0] + "T00:00:00.000Z";

  const sessionStats = await db
    .select({
      clientId: workoutSessions.clientId,
      completedTotal: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed')::int`,
      skippedTotal: sql<number>`count(*) filter (where ${workoutSessions.status} = 'skipped')::int`,
      completedLast7d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${sevenDaysAgo}::timestamptz)::int`,
      completedLast30d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
      skippedLast30d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'skipped' AND ${workoutSessions.scheduledDate} >= ${thirtyDaysAgoDate})::int`,
      completedToday: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' AND ${workoutSessions.completedAt} >= ${todayUTC}::timestamptz)::int`,
      lastCompletedAt: sql<Date | null>`max(${workoutSessions.completedAt}) filter (where ${workoutSessions.status} = 'completed')`,
    })
    .from(workoutSessions)
    .where(inArray(workoutSessions.clientId, clientIds))
    .groupBy(workoutSessions.clientId);

  const statsMap = new Map(sessionStats.map((s) => [s.clientId, s]));

  return clientRows.map((row) => {
    const stats = statsMap.get(row.userId);
    const completedTotal = stats?.completedTotal ?? 0;
    const skippedTotal = stats?.skippedTotal ?? 0;
    const completedLast7d = stats?.completedLast7d ?? 0;
    const completedLast30d = stats?.completedLast30d ?? 0;
    const skippedLast30d = stats?.skippedLast30d ?? 0;
    const completedToday = stats?.completedToday ?? 0;
    const lastCompletedAtRaw = stats?.lastCompletedAt ?? null;
    const lastCompletedAt = lastCompletedAtRaw
      ? new Date(lastCompletedAtRaw as unknown as string | Date)
      : null;

    const compliancePct = computeCompliancePct(completedLast30d, skippedLast30d);
    const currentWeek = row.programStartDate ? computeCurrentWeek(row.programStartDate) : null;
    const { level, reason } = computeAttention({
      activeProgramId: row.programId ?? null,
      completedLast7d,
      skippedLast30d,
      compliancePct,
      programStartDate: row.programStartDate ?? null,
      programEndDate: row.programEndDate ?? null,
    });

    return {
      userId: row.userId,
      email: row.email,
      userStatus: row.userStatus,
      fullName: row.fullName ?? row.email,
      preferredName: row.preferredName ?? null,
      activeProgramId: row.programId ?? null,
      activeProgramTemplateId: row.programTemplateId ?? null,
      activeProgramName: row.programName ?? null,
      programStartDate: row.programStartDate ?? null,
      programEndDate: row.programEndDate ?? null,
      currentWeek,
      totalWeeks: row.totalWeeks ?? null,
      completedTotal,
      skippedTotal,
      completedLast7d,
      completedLast30d,
      skippedLast30d,
      completedToday,
      lastCompletedAt,
      compliancePct,
      attentionLevel: level,
      attentionReason: reason,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// MISSION CONTROL
//
// Returns aggregate counts and prioritized client list for the
// coach's daily command center.  Calls listCoachClients() to
// avoid duplicating the session-stats query.
// ─────────────────────────────────────────────────────────────

export async function getCoachMissionControl(
  coachId: string | null = null,
): Promise<MissionControlData> {
  const db = getDb();

  const [clients, recentRows, checkIns] = await Promise.all([
    listCoachClients(coachId),
    // Recent activity: completed/skipped sessions across this coach's
    // own clients only (all clients, for admin).
    db
      .select({
        sessionId: workoutSessions.id,
        clientId: workoutSessions.clientId,
        clientName: clientProfiles.fullName,
        clientEmail: users.email,
        workoutName: workoutTemplates.name,
        status: workoutSessions.status,
        completionPercent: workoutSessions.completionPercent,
        completedAt: workoutSessions.completedAt,
        updatedAt: workoutSessions.updatedAt,
        programWeekNumber: workoutSessions.programWeekNumber,
      })
      .from(workoutSessions)
      .innerJoin(workoutTemplates, eq(workoutSessions.workoutTemplateId, workoutTemplates.id))
      .innerJoin(
        users,
        and(eq(workoutSessions.clientId, users.id), eq(users.role, "client")),
      )
      .leftJoin(clientProfiles, eq(workoutSessions.clientId, clientProfiles.userId))
      .where(
        and(
          sql`${workoutSessions.status} != 'in_progress'`,
          coachId === null
            ? undefined
            : sql`EXISTS (
                SELECT 1 FROM ${coachingEnrollments}
                WHERE ${coachingEnrollments.clientId} = ${workoutSessions.clientId}
                  AND ${coachingEnrollments.coachId} = ${coachId}
              )`,
        ),
      )
      .orderBy(
        sql`COALESCE(${workoutSessions.completedAt}, ${workoutSessions.updatedAt}) DESC NULLS LAST`,
      )
      .limit(20),
    getCheckInMissionStats(coachId),
  ]);

  const activeClientCount = clients.filter(
    (c) => c.userStatus === "active" || c.userStatus === "invited",
  ).length;

  const noActiveProgramCount = clients.filter((c) => !c.activeProgramId).length;
  const noWorkoutLast7dCount = clients.filter(
    (c) =>
      c.activeProgramId !== null &&
      c.completedLast7d === 0 &&
      c.programStartDate !== null &&
      new Date(c.programStartDate + "T00:00:00Z") <=
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  ).length;

  const workoutsCompletedToday = clients.reduce((s, c) => s + c.completedToday, 0);
  const workoutsCompletedLast7d = clients.reduce((s, c) => s + c.completedLast7d, 0);
  const recentSkippedCount = clients.reduce((s, c) => s + c.skippedLast30d, 0);

  const prioritizedClients = clients
    .filter((c) => c.attentionLevel !== "healthy")
    .sort(
      (a, b) =>
        ATTENTION_ORDER[a.attentionLevel] - ATTENTION_ORDER[b.attentionLevel],
    );

  const recentActivity: RecentSessionActivity[] = recentRows.map((r) => ({
    sessionId: r.sessionId,
    clientId: r.clientId,
    clientName: r.clientName ?? r.clientEmail,
    workoutName: r.workoutName,
    status: r.status,
    completionPercent: r.completionPercent,
    occurredAt: r.completedAt ?? r.updatedAt,
    programWeekNumber: r.programWeekNumber,
  }));

  return {
    activeClientCount,
    noActiveProgramCount,
    noWorkoutLast7dCount,
    workoutsCompletedToday,
    workoutsCompletedLast7d,
    recentSkippedCount,
    prioritizedClients,
    recentActivity,
    checkIns,
  };
}

// ─────────────────────────────────────────────────────────────
// CLIENT DETAIL
//
// Returns full client data including recent sessions.
// Returns null if clientId does not correspond to a client user
// (prevents coaches from looking up other coaches by ID).
// ─────────────────────────────────────────────────────────────

export async function getCoachClientDetail(
  clientId: string,
  coachId: string | null = null,
): Promise<CoachClientDetail | null> {
  const db = getDb();

  // Verify this is a client-role user
  const userRow = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);

  if (!userRow[0] || userRow[0].role !== "client") return null;

  const [allClients, recentSessions] = await Promise.all([
    listCoachClients(coachId),
    getWorkoutHistory(clientId, 10),
  ]);

  const summary = allClients.find((c) => c.userId === clientId);
  if (!summary) return null;

  return { ...summary, recentSessions };
}

// ─────────────────────────────────────────────────────────────
// SESSION DETAIL FOR COACH
//
// Thin wrapper around getHistoricalSessionDetail that:
//   1. Verifies clientId is a client-role user
//   2. Verifies session belongs to that client (via the existing
//      service which returns null on mismatch → caller → 404)
//
// Read-only. No mutations.
// ─────────────────────────────────────────────────────────────

export async function getCoachClientSessionDetail(
  clientId: string,
  sessionId: string,
  coachId: string | null = null,
) {
  const db = getDb();

  const userRow = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1);

  if (!userRow[0] || userRow[0].role !== "client") return null;

  // Coach-ownership check — admin (coachId === null) always passes.
  if (coachId !== null && !(await coachOwnsClient(coachId, clientId))) {
    return null;
  }

  // Delegates ownership check to the existing service.
  // Returns null if session doesn't belong to clientId.
  return getHistoricalSessionDetail(sessionId, clientId);
}
