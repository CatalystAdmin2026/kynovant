import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachProfiles,
  coachingEnrollments,
  programTemplates,
  users,
  workoutTemplates,
} from "./schema";
import { clientPrograms, workoutSessions } from "./schema-program";
import { exercises } from "./schema-exercise";
import { coachSubscriptions } from "./schema-billing";
import { coachAcquisitionLeads } from "./schema-coach-acquisition";
import { weeklyCheckIns } from "./schema-check-in";
import { conversations, messages } from "./schema-messaging";
import { programGenerationRuns } from "./schema-program-generator";
import { internalAccountFlags, operatorProfiles, type AccountClassification } from "./schema-overwatch-ops";

export interface OverwatchCoachRow {
  id: string;
  email: string;
  accountStatus: string;
  createdAt: Date;
  displayName: string | null;
  classification: AccountClassification;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  cancelledAt: Date | null;
  activeClientCount: number;
  lastActiveAt: Date | null;
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

export interface OverwatchFunnelStage {
  key: "startedSignup" | "inviteSent" | "accountActivated" | "trialStarted" | "paidActive" | "cancelledChurned";
  label: string;
  count: number;
  previousRate: number | null;
  startedRate: number | null;
}

export interface OverwatchAiDistributionRow {
  label: string;
  count: number;
}

export interface OverwatchMetrics {
  overview: {
    activeTrials: number;
    payingAccounts: number;
    newSignups7d: number;
    activeCustomerCoaches: number;
    activeClients: number;
    workouts7d: number;
    trialToPaid: number | null;
    aiGenerations7d: number;
  };
  revenue: {
    activeTrials: number;
    payingAccounts: number;
    trialingSubscriptions: number;
    pastDueSubscriptions: number;
    cancelledSubscriptions: number;
    trialEndingSoon: number;
    upcomingRenewals: OverwatchCoachRow[];
  };
  acquisition: {
    startedSignup: number;
    inviteSent: number;
    accountActivated: number;
    trialStarted: number;
    paidActive: number;
    cancelledChurned: number;
    conversionRateTrialToPaid: number | null;
    stages: OverwatchFunnelStage[];
    recentLeads: OverwatchAcquisitionLeadRow[];
  };
  accounts: OverwatchCoachRow[];
  engagement: {
    workouts7d: number;
    checkInsSubmitted7d: number;
    messages7d: number;
  };
  aiOperations: {
    runs7d: number;
    runs30d: number;
    completed: number;
    failed: number;
    successRate: number | null;
    averageLatencyMs: number | null;
    providerDistribution: OverwatchAiDistributionRow[];
    modelDistribution: OverwatchAiDistributionRow[];
  };
  product: {
    activeClientPrograms: number;
    programsTotal: number;
    programsActive: number;
    blueprintsTotal: number;
    blueprintsActive: number;
    exercisesTotal: number;
    exercisesActive: number;
  };
  platform: {
    dbReachable: boolean;
    admins: number;
    totalUsers: number;
    recentStripeEventAt: Date | null;
    failedSignupInvites: number;
    pastDueSubscriptions: number;
  };
}

export interface OverwatchFounderProfile {
  firstName: string | null;
  timezone: string;
}

export async function getOverwatchFounderProfile(userId: string): Promise<OverwatchFounderProfile> {
  const db = getDb();
  const [profile] = await db
    .select({
      firstName: operatorProfiles.firstName,
      displayName: operatorProfiles.displayName,
      timezone: operatorProfiles.timezone,
    })
    .from(operatorProfiles)
    .where(eq(operatorProfiles.userId, userId))
    .limit(1);

  const profileName = profile?.firstName ?? profile?.displayName?.trim().split(/\s+/)[0];
  const firstName = profileName?.trim();
  return {
    firstName: firstName && firstName.length > 0 ? firstName : null,
    timezone: profile?.timezone ?? "America/Chicago",
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinDateWindow(value: Date | string | null | undefined, start: Date, end: Date): boolean {
  const date = toDateOrNull(value);
  return Boolean(date && date >= start && date <= end);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

const MIN_CONVERSION_DENOMINATOR = 3;

function conversionRate(numerator: number, denominator: number): number | null {
  return denominator >= MIN_CONVERSION_DENOMINATOR ? numerator / denominator : null;
}

function businessCoachPredicate() {
  return sql`${users.role} = 'coach' and coalesce(${internalAccountFlags.classification}, 'customer') = 'customer'`;
}

// BUG FIXED HERE (2026-08-16): the second OR branch used to read just
// `coalesce(${internalAccountFlags.classification}, 'customer') = 'customer'`,
// with no accountUserId guard. Both joins that feed internalAccountFlags
// (users on accountUserId, then internalAccountFlags on users.id) are
// LEFT JOINs, so a lead with no linked account (accountUserId IS NULL —
// true for every isolation-test.invalid signup-flow fixture, since those
// leads intentionally never complete signup) produces a NULL
// classification, and coalesce(NULL, 'customer') always evaluates to
// 'customer' — making that branch unconditionally true for every
// unlinked lead and silently canceling out the first branch's
// @isolation-test.invalid exclusion. Confirmed against production: the
// old predicate counted all 16 of 16 known @isolation-test.invalid
// fixture leads as real acquisition funnel activity. The fix adds the
// same `accountUserId is not null` guard to the second branch, so it can
// only apply to a lead that actually resolved to a real account (whose
// classification is then meaningful) — an unlinked lead's fate is
// decided by the first branch alone, exactly as originally intended.
function acquisitionLeadPredicate() {
  return sql`(
    (${coachAcquisitionLeads.accountUserId} is null and ${coachAcquisitionLeads.normalizedEmail} not like '%@isolation-test.invalid')
    or (${coachAcquisitionLeads.accountUserId} is not null and coalesce(${internalAccountFlags.classification}, 'customer') = 'customer')
  )`;
}

export async function getOverwatchMetrics(): Promise<OverwatchMetrics> {
  const db = getDb();
  const now = Date.now();
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
  const sevenDaysFromNowIso = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

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
      classification: sql<AccountClassification>`coalesce(${internalAccountFlags.classification}, 'customer')`,
      subscriptionStatus: coachSubscriptions.status,
      currentPeriodEnd: coachSubscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd,
      cancelledAt: coachSubscriptions.cancelledAt,
      activeClientCount: sql<number>`count(${coachingEnrollments.id})::int`,
      lastActiveAt: sql<Date | null>`nullif(greatest(
        coalesce((select max(${workoutSessions.completedAt}) from ${workoutSessions} inner join ${coachingEnrollments} ce_ws on ce_ws.client_id = ${workoutSessions.clientId} where ce_ws.coach_id = ${users.id} and ce_ws.status = 'active' and ${workoutSessions.completedAt} <= ${nowIso}::timestamptz), 'epoch'::timestamptz),
        coalesce((select max(${weeklyCheckIns.submittedAt}) from ${weeklyCheckIns} inner join ${coachingEnrollments} ce_ci on ce_ci.client_id = ${weeklyCheckIns.clientId} where ce_ci.coach_id = ${users.id} and ce_ci.status = 'active' and ${weeklyCheckIns.submittedAt} <= ${nowIso}::timestamptz), 'epoch'::timestamptz),
        coalesce((select max(${conversations.lastMessageAt}) from ${conversations} where ${conversations.coachId} = ${users.id} and ${conversations.lastMessageAt} <= ${nowIso}::timestamptz), 'epoch'::timestamptz)
      ), 'epoch'::timestamptz)`,
    })
      .from(users)
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id))
      .leftJoin(
        coachingEnrollments,
        and(
          eq(coachingEnrollments.coachId, users.id),
          eq(coachingEnrollments.status, "active"),
        ),
      )
      .where(businessCoachPredicate())
      .groupBy(users.id, coachProfiles.displayName, internalAccountFlags.classification, coachSubscriptions.id)
      .orderBy(desc(users.createdAt));

  const acquisitionRows = await db.select({
      startedSignup: sql<number>`count(*)::int`,
      inviteSent: sql<number>`count(*) filter (where ${coachAcquisitionLeads.inviteSentAt} is not null or ${coachAcquisitionLeads.inviteStatus} = 'sent')::int`,
      accountActivated: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
      trialStarted: sql<number>`count(*) filter (where ${coachSubscriptions.status} in ('trialing', 'active', 'past_due', 'cancelled', 'suspended'))::int`,
      paidActive: sql<number>`count(*) filter (where ${coachSubscriptions.status} = 'active')::int`,
      cancelledChurned: sql<number>`count(*) filter (where ${coachSubscriptions.status} in ('cancelled', 'suspended'))::int`,
    })
      .from(coachAcquisitionLeads)
      .leftJoin(users, eq(users.id, coachAcquisitionLeads.accountUserId))
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id))
      .where(acquisitionLeadPredicate());

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
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .leftJoin(coachSubscriptions, eq(coachSubscriptions.coachId, users.id))
      .where(acquisitionLeadPredicate())
      .orderBy(desc(coachAcquisitionLeads.firstSignupAt))
      .limit(8);

  const engagementRows = await db.execute<{
    workouts7d: number;
    checkInsSubmitted7d: number;
    messages7d: number;
  }>(sql`
    with customer_coaches as (
      select u.id
      from ${users} u
      left join ${internalAccountFlags} f on f.user_id = u.id
      where u.role = 'coach'
        and coalesce(f.classification, 'customer') = 'customer'
    )
    select
      (
        select count(distinct ws.id)::int
        from ${workoutSessions} ws
        inner join ${coachingEnrollments} ce on ce.client_id = ws.client_id
        inner join customer_coaches cc on cc.id = ce.coach_id
        where ce.status = 'active'
          and ws.status = 'completed'
          and ws.completed_at >= ${sevenDaysAgoIso}::timestamptz
          and ws.completed_at <= ${nowIso}::timestamptz
      ) as "workouts7d",
      (
        select count(distinct ci.id)::int
        from ${weeklyCheckIns} ci
        inner join ${coachingEnrollments} ce on ce.client_id = ci.client_id
        inner join customer_coaches cc on cc.id = ce.coach_id
        where ce.status = 'active'
          and ci.submitted_at >= ${sevenDaysAgoIso}::timestamptz
          and ci.submitted_at <= ${nowIso}::timestamptz
      ) as "checkInsSubmitted7d",
      (
        select count(distinct m.id)::int
        from ${messages} m
        inner join ${conversations} c on c.id = m.conversation_id
        inner join customer_coaches cc on cc.id = c.coach_id
        where m.created_at >= ${sevenDaysAgoIso}::timestamptz
          and m.created_at <= ${nowIso}::timestamptz
      ) as "messages7d"
  `);

  const aiRows = await db.select({
      runs7d: sql<number>`count(*) filter (where ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz)::int`,
      runs30d: sql<number>`count(*) filter (where ${programGenerationRuns.createdAt} >= ${thirtyDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz)::int`,
      completed: sql<number>`count(*) filter (where ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz and ${programGenerationRuns.status} = 'complete')::int`,
      failed: sql<number>`count(*) filter (where ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz and ${programGenerationRuns.status} = 'failed')::int`,
      averageLatencyMs: sql<number | null>`avg(extract(epoch from (${programGenerationRuns.completedAt} - ${programGenerationRuns.startedAt})) * 1000) filter (where ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz and ${programGenerationRuns.startedAt} is not null and ${programGenerationRuns.completedAt} is not null and ${programGenerationRuns.completedAt} >= ${programGenerationRuns.startedAt} and ${programGenerationRuns.completedAt} <= ${nowIso}::timestamptz)`,
    })
      .from(programGenerationRuns)
      .innerJoin(users, eq(users.id, programGenerationRuns.requestedByUserId))
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .where(businessCoachPredicate());

  const aiProviderRows = await db.select({
      label: sql<string>`coalesce(${programGenerationRuns.provider}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
      .from(programGenerationRuns)
      .innerJoin(users, eq(users.id, programGenerationRuns.requestedByUserId))
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .where(sql`${businessCoachPredicate()} and ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz`)
      .groupBy(sql`coalesce(${programGenerationRuns.provider}, 'unknown')`)
      .orderBy(sql`count(*) desc`)
      .limit(5);

  const aiModelRows = await db.select({
      label: sql<string>`coalesce(${programGenerationRuns.model}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
      .from(programGenerationRuns)
      .innerJoin(users, eq(users.id, programGenerationRuns.requestedByUserId))
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .where(sql`${businessCoachPredicate()} and ${programGenerationRuns.createdAt} >= ${sevenDaysAgoIso}::timestamptz and ${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz`)
      .groupBy(sql`coalesce(${programGenerationRuns.model}, 'unknown')`)
      .orderBy(sql`count(*) desc`)
      .limit(5);

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
      activeClientPrograms: sql<number>`count(distinct ${clientPrograms.id}) filter (where ${clientPrograms.status} = 'active')::int`,
    })
      .from(clientPrograms)
      .innerJoin(coachingEnrollments, eq(coachingEnrollments.clientId, clientPrograms.clientId))
      .innerJoin(users, eq(users.id, coachingEnrollments.coachId))
      .leftJoin(internalAccountFlags, eq(internalAccountFlags.userId, users.id))
      .where(businessCoachPredicate());

  const platformHealthRows = await db.execute(sql<{
    recent_stripe_event_at: Date | null;
    failed_signup_invites: number;
  }>`select
    (select max(processed_at) from processed_stripe_events) as recent_stripe_event_at,
    (select count(*)::int from coach_acquisition_leads where invite_status in ('failed', 'error')) as failed_signup_invites`);

  const accounts = coachRows.map((coach) => ({
    ...coach,
    classification: coach.classification ?? "customer",
    createdAt: toDateOrNull(coach.createdAt) ?? new Date(0),
    currentPeriodEnd: toDateOrNull(coach.currentPeriodEnd),
    cancelledAt: toDateOrNull(coach.cancelledAt),
    lastActiveAt: toDateOrNull(coach.lastActiveAt),
    activeClientCount: toNumber(coach.activeClientCount),
  }));
  const activeClients = accounts.reduce((sum, coach) => sum + coach.activeClientCount, 0);
  const trialStarted = toNumber(acquisitionRows[0]?.trialStarted);
  const paidActive = toNumber(acquisitionRows[0]?.paidActive);
  const activeTrials = accounts.filter((coach) => coach.subscriptionStatus === "trialing").length;
  const payingAccounts = accounts.filter((coach) => coach.subscriptionStatus === "active" || coach.subscriptionStatus === "manually_activated").length;
  const workouts7d = toNumber(engagementRows[0]?.workouts7d);
  const aiRuns7d = toNumber(aiRows[0]?.runs7d);
  const aiCompleted = toNumber(aiRows[0]?.completed);
  const aiFailed = toNumber(aiRows[0]?.failed);
  const funnelCounts = {
    startedSignup: toNumber(acquisitionRows[0]?.startedSignup),
    inviteSent: toNumber(acquisitionRows[0]?.inviteSent),
    accountActivated: toNumber(acquisitionRows[0]?.accountActivated),
    trialStarted,
    paidActive,
    cancelledChurned: toNumber(acquisitionRows[0]?.cancelledChurned),
  };
  const funnelOrder: Array<[OverwatchFunnelStage["key"], string]> = [
    ["startedSignup", "Started Signup"],
    ["inviteSent", "Invite Sent"],
    ["accountActivated", "Account Activated"],
    ["trialStarted", "Trial Started"],
    ["paidActive", "Paid / Active"],
    ["cancelledChurned", "Cancelled / Churned"],
  ];
  const stages = funnelOrder.map(([key, label], index) => {
    const previousKey = funnelOrder[index - 1]?.[0];
    const count = funnelCounts[key];
    return {
      key,
      label,
      count,
      previousRate: previousKey ? rate(count, funnelCounts[previousKey]) : null,
      startedRate: index === 0 ? null : rate(count, funnelCounts.startedSignup),
    };
  });
  const platformHealth = platformHealthRows[0] as {
    recent_stripe_event_at: Date | string | null;
    failed_signup_invites: number | string | null;
  } | undefined;
  const recentStripeEventAt = platformHealth?.recent_stripe_event_at
    ? new Date(platformHealth.recent_stripe_event_at)
    : null;

  return {
    overview: {
      activeTrials,
      payingAccounts,
      newSignups7d: accounts.filter((coach) => isWithinDateWindow(coach.createdAt, sevenDaysAgo, nowDate)).length,
      activeCustomerCoaches: accounts.filter((coach) => coach.accountStatus === "active").length,
      activeClients,
      workouts7d,
      trialToPaid: conversionRate(paidActive, trialStarted),
      aiGenerations7d: aiRuns7d,
    },
    revenue: {
      activeTrials,
      payingAccounts,
      trialingSubscriptions: activeTrials,
      pastDueSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "past_due").length,
      cancelledSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "cancelled" || coach.subscriptionStatus === "suspended").length,
      trialEndingSoon: accounts.filter((coach) => coach.subscriptionStatus === "trialing" && coach.currentPeriodEnd && coach.currentPeriodEnd >= nowDate && coach.currentPeriodEnd.toISOString() <= sevenDaysFromNowIso).length,
      upcomingRenewals: accounts
        .filter((coach) => coach.currentPeriodEnd && (coach.subscriptionStatus === "trialing" || coach.subscriptionStatus === "active"))
        .sort((a, b) => (a.currentPeriodEnd?.getTime() ?? 0) - (b.currentPeriodEnd?.getTime() ?? 0))
        .slice(0, 5),
    },
    acquisition: {
      ...funnelCounts,
      trialStarted,
      paidActive,
      conversionRateTrialToPaid: conversionRate(paidActive, trialStarted),
      stages,
      recentLeads: acquisitionRecent.map((lead) => ({
        ...lead,
        firstSignupAt: toDateOrNull(lead.firstSignupAt) ?? new Date(0),
        inviteSentAt: toDateOrNull(lead.inviteSentAt),
      })),
    },
    accounts,
    engagement: {
      workouts7d,
      checkInsSubmitted7d: toNumber(engagementRows[0]?.checkInsSubmitted7d),
      messages7d: toNumber(engagementRows[0]?.messages7d),
    },
    aiOperations: {
      runs7d: aiRuns7d,
      runs30d: toNumber(aiRows[0]?.runs30d),
      completed: aiCompleted,
      failed: aiFailed,
      successRate: aiCompleted + aiFailed > 0 ? aiCompleted / (aiCompleted + aiFailed) : null,
      averageLatencyMs: aiRows[0]?.averageLatencyMs ? toNumber(aiRows[0].averageLatencyMs) : null,
      providerDistribution: aiProviderRows.map((row) => ({ label: row.label, count: toNumber(row.count) })),
      modelDistribution: aiModelRows.map((row) => ({ label: row.label, count: toNumber(row.count) })),
    },
    product: {
      activeClientPrograms: toNumber(activeClientProgramsRow[0]?.activeClientPrograms),
      programsTotal: toNumber(productRows[0]?.total),
      programsActive: toNumber(productRows[0]?.active),
      blueprintsTotal: toNumber(blueprintRows[0]?.total),
      blueprintsActive: toNumber(blueprintRows[0]?.active),
      exercisesTotal: toNumber(exerciseRows[0]?.total),
      exercisesActive: toNumber(exerciseRows[0]?.active),
    },
    platform: {
      dbReachable: true,
      admins: toNumber(platformRows[0]?.admins),
      totalUsers: toNumber(platformRows[0]?.totalUsers),
      recentStripeEventAt,
      failedSignupInvites: toNumber(platformHealth?.failed_signup_invites),
      pastDueSubscriptions: accounts.filter((coach) => coach.subscriptionStatus === "past_due").length,
    },
  };
}
