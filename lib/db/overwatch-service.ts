import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachProfiles,
  coachingEnrollments,
  programTemplates,
  timelineEvents,
  users,
  workoutTemplates,
} from "./schema";
import { clientPrograms, workoutSessions } from "./schema-program";
import { exercises } from "./schema-exercise";
import { coachSubscriptions } from "./schema-billing";
import { coachAcquisitionLeads } from "./schema-coach-acquisition";

export interface OverwatchCoachRow {
  id: string;
  email: string;
  accountStatus: string;
  createdAt: Date;
  displayName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  cancelledAt: Date | null;
  activeClientCount: number;
}

export interface OverwatchAcquisitionLeadRow {
  id: string;
  submittedName: string;
  normalizedEmail: string;
  source: string;
  firstSignupAt: Date;
  inviteSentAt: Date | null;
  inviteStatus: string;
  accountUserId: string | null;
  accountStatus: string | null;
  subscriptionStatus: string | null;
}

export interface OverwatchActivityRow {
  eventType: string;
  count: number;
  lastOccurredAt: Date | null;
}

export interface OverwatchMetrics {
  overview: {
    totalCoachAccounts: number;
    activeCoachAccounts: number;
    invitedCoachAccounts: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    pastDueSubscriptions: number;
    cancelledSubscriptions: number;
    totalActiveClients: number;
    averageClientsPerCoach: number;
    newCoachAccounts7d: number;
    newCoachAccounts30d: number;
  };
  acquisition: {
    startedSignup: number;
    inviteSent: number;
    accountActivated: number;
    trialStarted: number;
    paidActive: number;
    cancelledChurned: number;
    conversionRateTrialToPaid: number | null;
    recentLeads: OverwatchAcquisitionLeadRow[];
  };
  accounts: OverwatchCoachRow[];
  product: {
    activeClientPrograms: number;
    completedWorkoutsLast7d: number;
    programsTotal: number;
    programsActive: number;
    blueprintsTotal: number;
    blueprintsActive: number;
    exercisesTotal: number;
    exercisesActive: number;
  };
  platform: {
    admins: number;
    totalUsers: number;
    activity: OverwatchActivityRow[];
  };
}

export async function getOverwatchFounderFirstName(userId: string): Promise<string | null> {
  const db = getDb();
  const [profile] = await db
    .select({ displayName: coachProfiles.displayName })
    .from(coachProfiles)
    .where(eq(coachProfiles.userId, userId))
    .limit(1);

  const first = profile?.displayName?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

export async function getOverwatchMetrics(): Promise<OverwatchMetrics> {
  const db = getDb();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  // Keep these reads sequential. Supabase session-mode pooling has a small
  // per-session client cap; fanning out every Overwatch query concurrently can
  // exhaust it and crash the server-rendered dashboard.
  const platformRows = await db.select({
      totalUsers: sql<number>`count(*)::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
    }).from(users);

  const coachRows = await db.select({
      id: users.id,
      email: users.email,
      accountStatus: users.status,
      createdAt: users.createdAt,
      displayName: coachProfiles.displayName,
      subscriptionStatus: coachSubscriptions.status,
      currentPeriodEnd: coachSubscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd,
      cancelledAt: coachSubscriptions.cancelledAt,
      activeClientCount: sql<number>`count(${coachingEnrollments.id})::int`,
    })
      .from(users)
      .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id))
      .leftJoin(
        coachingEnrollments,
        and(
          eq(coachingEnrollments.coachId, users.id),
          eq(coachingEnrollments.status, "active"),
        ),
      )
      .where(eq(users.role, "coach"))
      .groupBy(users.id, coachProfiles.displayName, coachSubscriptions.id)
      .orderBy(desc(users.createdAt));

  const acquisitionRows = await db.select({
      startedSignup: sql<number>`count(*)::int`,
      inviteSent: sql<number>`count(*) filter (where ${coachAcquisitionLeads.inviteSentAt} is not null or ${coachAcquisitionLeads.inviteStatus} in ('sent', 'already_invited', 'already_active'))::int`,
      accountActivated: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      trialStarted: sql<number>`count(*) filter (where ${coachSubscriptions.status} in ('trialing', 'active', 'past_due', 'cancelled', 'suspended'))::int`,
      paidActive: sql<number>`count(*) filter (where ${coachSubscriptions.status} = 'active')::int`,
      cancelledChurned: sql<number>`count(*) filter (where ${coachSubscriptions.status} in ('cancelled', 'suspended'))::int`,
    })
      .from(coachAcquisitionLeads)
      .leftJoin(users, eq(users.id, coachAcquisitionLeads.accountUserId))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id));

  const acquisitionRecent = await db.select({
      id: coachAcquisitionLeads.id,
      submittedName: coachAcquisitionLeads.submittedName,
      normalizedEmail: coachAcquisitionLeads.normalizedEmail,
      source: coachAcquisitionLeads.source,
      firstSignupAt: coachAcquisitionLeads.firstSignupAt,
      inviteSentAt: coachAcquisitionLeads.inviteSentAt,
      inviteStatus: coachAcquisitionLeads.inviteStatus,
      accountUserId: coachAcquisitionLeads.accountUserId,
      accountStatus: users.status,
      subscriptionStatus: coachSubscriptions.status,
    })
      .from(coachAcquisitionLeads)
      .leftJoin(users, eq(users.id, coachAcquisitionLeads.accountUserId))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id))
      .orderBy(desc(coachAcquisitionLeads.firstSignupAt))
      .limit(8);

  const productRows = await db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${programTemplates.status} = 'active')::int`,
    }).from(programTemplates);

  const blueprintRows = await db.select({
      total: sql<number>`count(distinct ${workoutTemplates.id})::int`,
      active: sql<number>`count(distinct ${workoutTemplates.id}) filter (where ${workoutTemplates.status} = 'active')::int`,
    }).from(workoutTemplates);

  const exerciseRows = await db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${exercises.status} = 'active')::int`,
    }).from(exercises);

  const activeClientProgramsRow = await db.select({
      activeClientPrograms: sql<number>`count(*) filter (where ${clientPrograms.status} = 'active')::int`,
    }).from(clientPrograms);

  const completedWorkoutRows = await db.select({
      completedWorkoutsLast7d: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed' and ${workoutSessions.completedAt} >= ${sevenDaysAgoIso}::timestamptz)::int`,
    }).from(workoutSessions);

  const activityRows = await db.select({
      eventType: timelineEvents.eventType,
      count: sql<number>`count(*)::int`,
      lastOccurredAt: sql<Date | null>`max(${timelineEvents.occurredAt})`,
    })
      .from(timelineEvents)
      .where(sql`${timelineEvents.occurredAt} >= ${sevenDaysAgoIso}::timestamptz`)
      .groupBy(timelineEvents.eventType)
      .orderBy(sql`max(${timelineEvents.occurredAt}) desc`)
      .limit(8);

  const accounts = coachRows.map((coach) => ({
    ...coach,
    activeClientCount: toNumber(coach.activeClientCount),
  }));
  const totalActiveClients = accounts.reduce((sum, coach) => sum + coach.activeClientCount, 0);
  const totalCoachAccounts = accounts.length;
  const trialStarted = toNumber(acquisitionRows[0]?.trialStarted);
  const paidActive = toNumber(acquisitionRows[0]?.paidActive);

  return {
    overview: {
      totalCoachAccounts,
      activeCoachAccounts: accounts.filter((coach) => coach.accountStatus === "active").length,
      invitedCoachAccounts: accounts.filter((coach) => coach.accountStatus === "invited").length,
      activeSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "active").length,
      trialingSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "trialing").length,
      pastDueSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "past_due").length,
      cancelledSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "cancelled" || coach.subscriptionStatus === "suspended").length,
      totalActiveClients,
      averageClientsPerCoach: totalCoachAccounts > 0 ? totalActiveClients / totalCoachAccounts : 0,
      newCoachAccounts7d: accounts.filter((coach) => coach.createdAt >= sevenDaysAgo).length,
      newCoachAccounts30d: accounts.filter((coach) => coach.createdAt >= thirtyDaysAgo).length,
    },
    acquisition: {
      startedSignup: toNumber(acquisitionRows[0]?.startedSignup),
      inviteSent: toNumber(acquisitionRows[0]?.inviteSent),
      accountActivated: toNumber(acquisitionRows[0]?.accountActivated),
      trialStarted,
      paidActive,
      cancelledChurned: toNumber(acquisitionRows[0]?.cancelledChurned),
      conversionRateTrialToPaid: trialStarted > 0 ? paidActive / trialStarted : null,
      recentLeads: acquisitionRecent,
    },
    accounts,
    product: {
      activeClientPrograms: toNumber(activeClientProgramsRow[0]?.activeClientPrograms),
      completedWorkoutsLast7d: toNumber(completedWorkoutRows[0]?.completedWorkoutsLast7d),
      programsTotal: toNumber(productRows[0]?.total),
      programsActive: toNumber(productRows[0]?.active),
      blueprintsTotal: toNumber(blueprintRows[0]?.total),
      blueprintsActive: toNumber(blueprintRows[0]?.active),
      exercisesTotal: toNumber(exerciseRows[0]?.total),
      exercisesActive: toNumber(exerciseRows[0]?.active),
    },
    platform: {
      admins: toNumber(platformRows[0]?.admins),
      totalUsers: toNumber(platformRows[0]?.totalUsers),
      activity: activityRows.map((row) => ({
        eventType: row.eventType,
        count: toNumber(row.count),
        lastOccurredAt: row.lastOccurredAt,
      })),
    },
  };
}
