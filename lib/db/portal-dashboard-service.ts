// ─────────────────────────────────────────────────────────────
// Catalyst OS — Portal Dashboard Service (Sprint 6.4)
//
// SERVER-ONLY — never import from a Client Component.
//
// Aggregates dashboard data from workout_sessions and
// weekly_check_ins into structured DTOs for the client portal.
// All heavy lifting happens here; UI components receive plain
// serializable objects — no Date values, no DB row types.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, gte, lte, sql, desc, asc, ne, isNotNull } from "drizzle-orm";
import { getDb } from "./client";
import { coachProfiles, coachingEnrollments, clientMilestoneAcknowledgements } from "./schema";
import { weeklyCheckIns } from "./schema-check-in";
import { workoutSessions, clientPrograms } from "./schema-program";
import { clientGoals } from "./schema-profile";

// ─────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────

export interface PromisesKeptStats {
  lifetimeKept: number;
  currentStreak: number;
  dailyStreak: number;
  todayKept: boolean | null;
  hasAnyData: boolean;
}

export interface DailyPromiseStatus {
  date: string;
  dayLabel: string;      // "Su" "Mo" "Tu" "We" "Th" "Fr" "Sa"
  isToday: boolean;
  isPast: boolean;
  sessionsScheduled: number;
  sessionsCompleted: number;
  pct: number; // 0–100 if sessions exist; -1 = rest day / no sessions
}

export interface WeeklyComplianceSnapshot {
  sessionsThisWeek: number;
  completedThisWeek: number;
  skippedThisWeek: number;
  checkInStatus: string | null;
  weekStartDate: string;
  weekEndDate: string;
  dailyStatuses: DailyPromiseStatus[];
}

export interface RecoverySnapshot {
  hasData: boolean;
  sleep: number | null;
  stress: number | null;
  energy: number | null;
  weekLabel: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  category: "consistency" | "milestone" | "accountability";
}

export interface BodyMetricEntry {
  scheduledDate?: string;
  weekStartDate: string;
  weekLabel: string;
  weightLbs: number | null;
  waistInches: number | null;
  sleep: number | null;
  stress: number | null;
  energy: number | null;
  workoutCompliancePct: number | null;
}

export interface WeeklySessionCount {
  weekStartDate: string;
  weekLabel: string;
  completed: number;
  total: number;
}

export interface DashboardData {
  promises: PromisesKeptStats;
  weeklyCompliance: WeeklyComplianceSnapshot;
  recovery: RecoverySnapshot;
  achievements: Achievement[];
  // IDs of earned milestones the client has not yet seen the unlock animation for.
  // Computed server-side from earned achievements minus acknowledged keys in DB.
  // Passed to AchievementsPanel so animation is account-scoped, not browser-scoped.
  newlyEarnedMilestoneKeys: string[];
}

export type GoalPaceStatus = "ahead" | "on_pace" | "behind" | "in_progress" | "no_goal";

export interface ClientGoalForProgress {
  id: string;
  goalType: string;
  description: string;
  targetValue: number | null;
  targetUnit: string | null;
  targetDate: string | null;
  startedAt: string | null;
}

// How far a client has travelled toward a numeric goal target, and how far remains.
// Only populated for goals with a measurable start, current, and target value.
// Null for goals without a quantifiable metric — those use qualitativeState instead.
export interface GoalDistance {
  completedValue: number | null;
  remainingValue: number | null;
  unit: string | null;
  completedLabel: string | null; // e.g. "6.6 lbs completed"
  remainingLabel: string | null; // e.g. "18.4 lbs remaining"
}

export interface GoalProgress {
  goal: ClientGoalForProgress | null;
  paceStatus: GoalPaceStatus;
  percentComplete: number | null;
  currentValue: number | null;
  startValue: number | null;
  // Populated when goal has a numeric target and enough measurement data.
  // Null for non-quantifiable goals — use qualitativeState in UI instead.
  distance: GoalDistance | null;
  // Human-readable state for goals without a numeric target.
  // Coach is responsible for defining measurable targets when a meaningful
  // numeric goal exists; otherwise this describes what progress looks like.
  qualitativeState: string | null;
}

export interface CoachVoiceEntry {
  response: string;
  weekLabel: string;
}

export interface ProgressData {
  bodyMetrics: BodyMetricEntry[];
  weeklySessionCounts: WeeklySessionCount[];
  hasBodyData: boolean;
  hasSessionData: boolean;
  goalProgress: GoalProgress;
  coachVoice: CoachVoiceEntry | null;
}

// ─────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function getWeekEnd(weekStartStr: string): string {
  const d = new Date(weekStartStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(weekStartStr: string): string {
  return new Date(weekStartStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Consecutive-day streak: counts how many calendar days in a row (going
// backward from today or yesterday) the client had at least one completed
// session. Yesterday counts as a grace day if today has no session.
function computeDailyStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const dateSet = new Set(completedDates);
  const todayStr = new Date().toISOString().slice(0, 10);
  const cursor = new Date(todayStr + "T12:00:00Z");

  if (!dateSet.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!dateSet.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  let streak = 0;
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// Consecutive-week streak: counts how many weeks in a row (going
// backward from the most recent week with a completion) the client
// had at least one completed session. Current-week completions count;
// a week with no completions breaks the streak.
function computeWeekStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const weekSet = new Set<string>();
  for (const d of completedDates) {
    weekSet.add(getWeekStart(d));
  }

  const sortedWeeks = Array.from(weekSet).sort().reverse();
  if (sortedWeeks.length === 0) return 0;

  let streak = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    const prev = new Date(sortedWeeks[i - 1] + "T12:00:00Z");
    const curr = new Date(sortedWeeks[i] + "T12:00:00Z");
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86_400_000);
    if (diff === 7) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Computes how far a client has moved toward a numeric goal target and how far remains.
// Direction is inferred from whether target < start (reducing) or target > start (gaining).
// Returns null for goals without compatible numeric units.
function computeGoalDistance(
  goal: ClientGoalForProgress,
  startValue: number,
  currentValue: number,
): GoalDistance | null {
  const { targetValue, targetUnit } = goal;
  if (!targetValue || !targetUnit) return null;

  const isInches = /in(ch)?/i.test(targetUnit);
  const isLbs = /lb|pound/i.test(targetUnit);
  if (!isInches && !isLbs) return null;

  const unit = isInches ? "in" : "lbs";
  const isReducing = targetValue < startValue;

  const completed = parseFloat(Math.max(0, isReducing ? startValue - currentValue : currentValue - startValue).toFixed(1));
  const remaining = parseFloat(Math.max(0, isReducing ? currentValue - targetValue : targetValue - currentValue).toFixed(1));
  const verb = isInches ? (isReducing ? "reduced" : "added") : (isReducing ? "completed" : "added");

  return {
    completedValue: completed,
    remainingValue: remaining,
    unit,
    completedLabel: `${completed} ${unit} ${verb}`,
    remainingLabel: `${remaining} ${unit} remaining`,
  };
}

// Returns a human-readable qualitative state for goals that cannot produce a numeric
// progress percentage. Covers both non-numeric goal types and numeric goals with
// insufficient measurement data. Coaches are responsible for setting numeric targets
// on goals where measurable progress matters (fat_loss, muscle_gain, etc.).
function deriveQualitativeState(
  goal: ClientGoalForProgress,
  reason: "insufficient_data" | "no_target" | "non_numeric",
): string {
  if (reason === "insufficient_data") return "Each check-in builds your progress picture";
  if (reason === "no_target") return "No numeric target set";
  const byType: Record<string, string> = {
    strength: "Progress measured through what you lift",
    athletic_performance: "Progress measured through performance",
    general_health: "Building your baseline",
    mobility: "Progress measured through movement quality",
    executive_performance: "Building your baseline",
    competition_prep: "Progress measured through performance",
    reverse_diet: "Building your baseline",
  };
  return byType[goal.goalType] ?? "Your coach is tracking the signals that matter";
}

// Computes goal pacing from already-fetched data — no additional DB round-trip.
// Weight-based goals with a numeric target + enough check-in data get a
// percentage-complete, pace status, and distance. All others return 'in_progress'.
function computeGoalProgressInMemory(
  goal: {
    id: string;
    goalType: string;
    description: string;
    targetValue: string | null;
    targetUnit: string | null;
    targetDate: string | null;
    startedAt: string | null;
  } | null,
  bodyMetrics: BodyMetricEntry[],
): GoalProgress {
  if (!goal) {
    return { goal: null, paceStatus: "no_goal", percentComplete: null, currentValue: null, startValue: null, distance: null, qualitativeState: null };
  }

  const goalForProgress: ClientGoalForProgress = {
    id: goal.id,
    goalType: goal.goalType,
    description: goal.description,
    targetValue: goal.targetValue ? parseFloat(goal.targetValue) : null,
    targetUnit: goal.targetUnit,
    targetDate: goal.targetDate,
    startedAt: goal.startedAt,
  };

  const isWeightUnit =
    goal.targetUnit &&
    (goal.targetUnit.toLowerCase().includes("lb") ||
      goal.targetUnit.toLowerCase().includes("pound"));

  const isWeightGoal = ["fat_loss", "body_recomposition", "maintenance", "muscle_gain", "custom"].includes(
    goal.goalType,
  );

  if (isWeightGoal && isWeightUnit && goal.targetValue) {
    const weightValues = bodyMetrics
      .filter((m) => m.weightLbs !== null)
      .map((m) => m.weightLbs!);

    if (weightValues.length >= 2) {
      const currentWeight = weightValues[0];
      const startWeight = weightValues[weightValues.length - 1];
      const targetWeight = parseFloat(goal.targetValue);
      const totalChange = startWeight - targetWeight;
      const achievedChange = startWeight - currentWeight;

      if (Math.abs(totalChange) > 0.5) {
        const raw = (achievedChange / totalChange) * 100;
        const percentComplete = Math.max(0, Math.min(100, Math.round(raw)));

        let paceStatus: GoalPaceStatus = "in_progress";
        if (goal.targetDate && goal.startedAt) {
          const startMs = new Date(goal.startedAt + "T12:00:00").getTime();
          const endMs = new Date(goal.targetDate + "T12:00:00").getTime();
          const nowMs = Date.now();
          const totalMs = endMs - startMs;
          const elapsedMs = nowMs - startMs;
          if (totalMs > 0 && elapsedMs > 0) {
            const timePercent = Math.min(100, (elapsedMs / totalMs) * 100);
            if (percentComplete >= timePercent + 10) paceStatus = "ahead";
            else if (percentComplete <= timePercent - 15) paceStatus = "behind";
            else paceStatus = "on_pace";
          }
        }

        const distance = computeGoalDistance(goalForProgress, startWeight, currentWeight);
        return { goal: goalForProgress, paceStatus, percentComplete, currentValue: currentWeight, startValue: startWeight, distance, qualitativeState: null };
      }
    }
    // Weight goal but insufficient data points
    const qualitativeState = deriveQualitativeState(goalForProgress, goal.targetValue ? "insufficient_data" : "no_target");
    return { goal: goalForProgress, paceStatus: "in_progress", percentComplete: null, currentValue: null, startValue: null, distance: null, qualitativeState };
  }

  // Non-numeric goal type — qualitative state describes what progress looks like
  const qualitativeState = deriveQualitativeState(goalForProgress, isWeightUnit ? "no_target" : "non_numeric");
  return { goal: goalForProgress, paceStatus: "in_progress", percentComplete: null, currentValue: null, startValue: null, distance: null, qualitativeState };
}

// ─────────────────────────────────────────────────────────────
// PROMISES KEPT
// ─────────────────────────────────────────────────────────────

export async function getPromisesKeptStats(
  clientId: string,
): Promise<PromisesKeptStats> {
  const db = getDb();

  const [{ lifetimeKept }] = await db
    .select({ lifetimeKept: sql<number>`count(*)::int` })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        eq(workoutSessions.status, "completed"),
      ),
    );

  if (lifetimeKept === 0) {
    return { lifetimeKept: 0, currentStreak: 0, dailyStreak: 0, todayKept: null, hasAnyData: false };
  }

  // Dates for streak calculation (use scheduledDate; fall back to completedAt)
  const completed = await db
    .select({
      scheduledDate: workoutSessions.scheduledDate,
      completedAt: workoutSessions.completedAt,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        eq(workoutSessions.status, "completed"),
      ),
    );

  const dates = completed
    .map(
      (s) =>
        s.scheduledDate ??
        s.completedAt?.toISOString().slice(0, 10),
    )
    .filter(Boolean) as string[];

  const currentStreak = computeWeekStreak(dates);
  const dailyStreak = computeDailyStreak(dates);

  // Today's promise status
  const todayStr = new Date().toISOString().slice(0, 10);
  const [todaySession] = await db
    .select({ status: workoutSessions.status })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        eq(workoutSessions.scheduledDate, todayStr),
      ),
    )
    .limit(1);

  const todayKept = todaySession
    ? todaySession.status === "completed"
    : null;

  return { lifetimeKept, currentStreak, dailyStreak, todayKept, hasAnyData: true };
}

// ─────────────────────────────────────────────────────────────
// WEEKLY COMPLIANCE
// ─────────────────────────────────────────────────────────────

export async function getWeeklyComplianceSnapshot(
  clientId: string,
): Promise<WeeklyComplianceSnapshot> {
  const db = getDb();

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(todayStr);
  const weekEnd = getWeekEnd(weekStart);

  // Include scheduledDate so we can build the 7-day per-day breakdown
  const sessions = await db
    .select({
      status: workoutSessions.status,
      scheduledDate: workoutSessions.scheduledDate,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.clientId, clientId),
        gte(workoutSessions.scheduledDate, weekStart),
        lte(workoutSessions.scheduledDate, weekEnd),
      ),
    );

  const completedThisWeek = sessions.filter((s) => s.status === "completed").length;
  const skippedThisWeek = sessions.filter((s) => s.status === "skipped").length;

  // Per-day promise completion — designed to accept variable denominators
  // once the promise_definitions schema exists (Sprint 7.0)
  const byDate = new Map<string, { kept: number; total: number }>();
  for (const s of sessions) {
    const d = s.scheduledDate;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, { kept: 0, total: 0 });
    const entry = byDate.get(d)!;
    entry.total++;
    if (s.status === "completed") entry.kept++;
  }

  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const dailyStatuses: DailyPromiseStatus[] = [];
  const ptr = new Date(weekStart + "T12:00:00Z");
  for (let i = 0; i < 7; i++) {
    const dateStr = ptr.toISOString().slice(0, 10);
    const entry = byDate.get(dateStr) ?? { kept: 0, total: 0 };
    dailyStatuses.push({
      date: dateStr,
      dayLabel: DAY_LABELS[ptr.getUTCDay()],
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      sessionsScheduled: entry.total,
      sessionsCompleted: entry.kept,
      pct: entry.total === 0 ? -1 : Math.round((entry.kept / entry.total) * 100),
    });
    ptr.setUTCDate(ptr.getUTCDate() + 1);
  }

  const checkIns = await db
    .select({ status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        eq(weeklyCheckIns.weekStartDate, weekStart),
      ),
    )
    ;
  const checkInStatus = checkIns.some((row) => row.status !== "draft")
    ? checkIns.find((row) => row.status === "submitted")?.status ?? checkIns[0]?.status ?? null
    : checkIns[0]?.status ?? null;

  return {
    sessionsThisWeek: sessions.length,
    completedThisWeek,
    skippedThisWeek,
    checkInStatus,
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    dailyStatuses,
  };
}

// ─────────────────────────────────────────────────────────────
// RECOVERY SNAPSHOT
// ─────────────────────────────────────────────────────────────

export async function getRecoverySnapshot(
  clientId: string,
): Promise<RecoverySnapshot> {
  const db = getDb();

  const [row] = await db
    .select({
      averageSleepHours: weeklyCheckIns.averageSleepHours,
      averageStress: weeklyCheckIns.averageStress,
      averageEnergy: weeklyCheckIns.averageEnergy,
      weekStartDate: weeklyCheckIns.weekStartDate,
    })
    .from(weeklyCheckIns)
    .where(
      and(
        eq(weeklyCheckIns.clientId, clientId),
        ne(weeklyCheckIns.status, "draft"),
      ),
    )
    .orderBy(desc(weeklyCheckIns.submittedAt))
    .limit(1);

  if (!row) {
    return { hasData: false, sleep: null, stress: null, energy: null, weekLabel: null };
  }

  const sleep = row.averageSleepHours ? parseFloat(row.averageSleepHours) : null;

  return {
    hasData: sleep !== null || row.averageStress !== null || row.averageEnergy !== null,
    sleep,
    stress: row.averageStress,
    energy: row.averageEnergy,
    weekLabel: row.weekStartDate ? fmtWeekLabel(row.weekStartDate) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────────────────────

export async function getClientAchievements(
  clientId: string,
): Promise<Achievement[]> {
  const db = getDb();

  const [completedCount, checkInCount, completedProgramCount, completedDates] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.clientId, clientId),
            eq(workoutSessions.status, "completed"),
          ),
        )
        .then((r) => r[0]?.count ?? 0),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(weeklyCheckIns)
        .where(
          and(
            eq(weeklyCheckIns.clientId, clientId),
            ne(weeklyCheckIns.status, "draft"),
          ),
        )
        .then((r) => r[0]?.count ?? 0),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clientPrograms)
        .where(
          and(
            eq(clientPrograms.clientId, clientId),
            eq(clientPrograms.status, "completed"),
          ),
        )
        .then((r) => r[0]?.count ?? 0),

      db
        .select({
          scheduledDate: workoutSessions.scheduledDate,
          completedAt: workoutSessions.completedAt,
        })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.clientId, clientId),
            eq(workoutSessions.status, "completed"),
          ),
        )
        .then((rows) =>
          rows
            .map((s) => s.scheduledDate ?? s.completedAt?.toISOString().slice(0, 10))
            .filter(Boolean) as string[],
        ),
    ]);

  const streak = computeWeekStreak(completedDates);

  return [
    {
      id: "first_checkin",
      title: "First Check-In",
      description: "Started your coaching record",
      earned: checkInCount >= 1,
      category: "accountability",
    },
    {
      id: "first_promise",
      title: "First Promise Kept",
      description: "Showed up and did the work",
      earned: completedCount >= 1,
      category: "milestone",
    },
    {
      id: "promises_10",
      title: "10 Promises Kept",
      description: "Ten sessions of consistent effort",
      earned: completedCount >= 10,
      category: "milestone",
    },
    {
      id: "streak_4w",
      title: "Four-Week Standard",
      description: "Four consecutive weeks of showing up",
      earned: streak >= 4,
      category: "consistency",
    },
    {
      id: "promises_25",
      title: "25 Promises Kept",
      description: "Building a track record that matters",
      earned: completedCount >= 25,
      category: "milestone",
    },
    {
      id: "streak_8w",
      title: "Eight-Week Commitment",
      description: "Two months of unbroken consistency",
      earned: streak >= 8,
      category: "consistency",
    },
    {
      id: "checkins_12",
      title: "Three Months In",
      description: "Twelve weeks of weekly accountability",
      earned: checkInCount >= 12,
      category: "accountability",
    },
    {
      id: "promises_50",
      title: "50 Promises Kept",
      description: "Halfway to a century of commitment",
      earned: completedCount >= 50,
      category: "milestone",
    },
    {
      id: "streak_12w",
      title: "Twelve-Week Standard",
      description: "The habit is no longer a question",
      earned: streak >= 12,
      category: "consistency",
    },
    {
      id: "first_program",
      title: "First Program Complete",
      description: "Finished an entire coaching program",
      earned: completedProgramCount >= 1,
      category: "milestone",
    },
    {
      id: "promises_100",
      title: "100 Promises Kept",
      description: "A century of commitment",
      earned: completedCount >= 100,
      category: "milestone",
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// PROGRESS DATA
// ─────────────────────────────────────────────────────────────

export async function getProgressData(clientId: string): Promise<ProgressData> {
  const db = getDb();

  const [checkIns, weeklySessionCounts, coachVoiceRow, activeGoalRow] =
    await Promise.all([
      // Last 12 submitted/reviewed check-ins with body metrics
      db
        .select({
          scheduledDate: weeklyCheckIns.scheduledDate,
          weekStartDate: weeklyCheckIns.weekStartDate,
          bodyWeightLbs: weeklyCheckIns.bodyWeightLbs,
          waistInches: weeklyCheckIns.waistInches,
          averageSleepHours: weeklyCheckIns.averageSleepHours,
          averageStress: weeklyCheckIns.averageStress,
          averageEnergy: weeklyCheckIns.averageEnergy,
          workoutCompliancePct: weeklyCheckIns.workoutCompliancePct,
        })
        .from(weeklyCheckIns)
        .where(
          and(
            eq(weeklyCheckIns.clientId, clientId),
            ne(weeklyCheckIns.status, "draft"),
          ),
        )
        .orderBy(desc(weeklyCheckIns.scheduledDate))
        .limit(12),

      // Sessions per week for consistency chart
      db
        .select({
          weekStart: sql<string>`date_trunc('week', ${workoutSessions.scheduledDate}::timestamp)::date::text`,
          completed: sql<number>`count(*) filter (where ${workoutSessions.status} = 'completed')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.clientId, clientId),
            isNotNull(workoutSessions.scheduledDate),
          ),
        )
        .groupBy(sql`date_trunc('week', ${workoutSessions.scheduledDate}::timestamp)`)
        .orderBy(sql`date_trunc('week', ${workoutSessions.scheduledDate}::timestamp) desc`)
        .limit(12),

      // Most recent coach response from a reviewed check-in
      db
        .select({
          coachResponse: weeklyCheckIns.coachResponse,
          weekStartDate: weeklyCheckIns.weekStartDate,
        })
        .from(weeklyCheckIns)
        .where(
          and(
            eq(weeklyCheckIns.clientId, clientId),
            eq(weeklyCheckIns.status, "reviewed"),
            isNotNull(weeklyCheckIns.coachResponse),
          ),
        )
        .orderBy(desc(weeklyCheckIns.weekStartDate))
        .limit(1),

      // Primary active goal for pace tracking
      db
        .select({
          id: clientGoals.id,
          goalType: clientGoals.goalType,
          description: clientGoals.description,
          targetValue: clientGoals.targetValue,
          targetUnit: clientGoals.targetUnit,
          targetDate: clientGoals.targetDate,
          startedAt: clientGoals.startedAt,
        })
        .from(clientGoals)
        .where(
          and(
            eq(clientGoals.clientId, clientId),
            eq(clientGoals.status, "active"),
          ),
        )
        .orderBy(asc(clientGoals.priority), desc(clientGoals.createdAt))
        .limit(1),
    ]);

  const bodyMetrics: BodyMetricEntry[] = checkIns.map((c) => ({
    scheduledDate: c.scheduledDate,
    weekStartDate: c.weekStartDate,
    weekLabel: fmtWeekLabel(c.weekStartDate),
    weightLbs: c.bodyWeightLbs ? parseFloat(c.bodyWeightLbs) : null,
    waistInches: c.waistInches ? parseFloat(c.waistInches) : null,
    sleep: c.averageSleepHours ? parseFloat(c.averageSleepHours) : null,
    stress: c.averageStress,
    energy: c.averageEnergy,
    workoutCompliancePct: c.workoutCompliancePct,
  }));

  const weeklySessionCountsFormatted: WeeklySessionCount[] = weeklySessionCounts
    .filter((w) => w.weekStart)
    .map((w) => ({
      weekStartDate: w.weekStart,
      weekLabel: fmtWeekLabel(w.weekStart),
      completed: w.completed,
      total: w.total,
    }));

  const hasBodyData = bodyMetrics.some(
    (m) => m.weightLbs !== null || m.waistInches !== null,
  );

  const goalProgress = computeGoalProgressInMemory(
    activeGoalRow[0] ?? null,
    bodyMetrics,
  );

  const coachVoiceData = coachVoiceRow[0];
  const coachVoice: CoachVoiceEntry | null =
    coachVoiceData?.coachResponse
      ? { response: coachVoiceData.coachResponse, weekLabel: fmtWeekLabel(coachVoiceData.weekStartDate) }
      : null;

  return {
    bodyMetrics,
    weeklySessionCounts: weeklySessionCountsFormatted,
    hasBodyData,
    hasSessionData: weeklySessionCountsFormatted.length > 0,
    goalProgress,
    coachVoice,
  };
}

// Returns coach first name + avatar URL for dashboard presence block.
export async function getCoachData(
  clientId: string,
): Promise<{ firstName: string; avatarUrl: string | null } | null> {
  const db = getDb();
  const result = await db
    .select({
      displayName: coachProfiles.displayName,
      avatarUrl: coachProfiles.avatarUrl,
    })
    .from(coachingEnrollments)
    .innerJoin(coachProfiles, eq(coachingEnrollments.coachId, coachProfiles.userId))
    .where(eq(coachingEnrollments.clientId, clientId))
    .orderBy(desc(coachingEnrollments.createdAt))
    .limit(1);

  const row = result[0];
  if (!row) return null;
  return {
    firstName: row.displayName.split(" ")[0],
    avatarUrl: row.avatarUrl,
  };
}

// Kept for backward compatibility.
export async function getCoachFirstName(clientId: string): Promise<string | null> {
  const db = getDb();
  const result = await db
    .select({ displayName: coachProfiles.displayName })
    .from(coachingEnrollments)
    .innerJoin(coachProfiles, eq(coachingEnrollments.coachId, coachProfiles.userId))
    .where(eq(coachingEnrollments.clientId, clientId))
    .orderBy(desc(coachingEnrollments.createdAt))
    .limit(1);

  const name = result[0]?.displayName;
  if (!name) return null;
  return name.split(" ")[0];
}

// ─────────────────────────────────────────────────────────────
// COMBINED DASHBOARD DATA
// ─────────────────────────────────────────────────────────────

async function getAcknowledgedMilestoneKeys(clientId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ milestoneKey: clientMilestoneAcknowledgements.milestoneKey })
    .from(clientMilestoneAcknowledgements)
    .where(eq(clientMilestoneAcknowledgements.clientId, clientId));
  return new Set(rows.map((r) => r.milestoneKey));
}

export async function getDashboardData(clientId: string): Promise<DashboardData> {
  const [promises, weeklyCompliance, recovery, achievements, acknowledgedKeys] =
    await Promise.all([
      getPromisesKeptStats(clientId),
      getWeeklyComplianceSnapshot(clientId),
      getRecoverySnapshot(clientId),
      getClientAchievements(clientId),
      getAcknowledgedMilestoneKeys(clientId),
    ]);

  const newlyEarnedMilestoneKeys = achievements
    .filter((a) => a.earned && !acknowledgedKeys.has(a.id))
    .map((a) => a.id);

  return { promises, weeklyCompliance, recovery, achievements, newlyEarnedMilestoneKeys };
}
