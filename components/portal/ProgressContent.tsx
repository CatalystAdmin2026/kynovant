"use client";

import Link from "next/link";
import type {
  ProgressData,
  BodyMetricEntry,
  WeeklySessionCount,
  Achievement,
  GoalProgress,
  CoachVoiceEntry,
  PromisesKeptStats,
} from "@/lib/db/portal-dashboard-service";
import AchievementsPanel from "./AchievementsPanel";

// Exported so page.tsx can import the type without circular dependency issues
export interface VictoryMoment {
  headline: string;
  subtext: string;
  accent: "gold" | "emerald" | "neutral";
}

// ─── Sparkline ────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 96;
  const H = 36;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 4 - ((v - min) / range) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastY = H - 4 - ((values[values.length - 1] - min) / range) * (H - 8);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="overflow-visible shrink-0"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#c9a24d"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <circle cx={W} cy={lastY} r="2.5" fill="#c9a24d" opacity="0.85" />
    </svg>
  );
}

// ─── Victory Moment ───────────────────────────────────────────

const VICTORY_ACCENT = {
  emerald: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.04]",
    headline: "text-emerald-400/95",
    bar: "bg-emerald-500/30",
  },
  gold: {
    border: "border-[#c9a24d]/25",
    bg: "bg-[#c9a24d]/[0.05]",
    headline: "text-[#c9a24d]/95",
    bar: "bg-[#c9a24d]/40",
  },
  neutral: {
    border: "border-white/[0.07]",
    bg: "bg-white/[0.02]",
    headline: "text-white/80",
    bar: "bg-white/15",
  },
} as const;

function VictoryMomentCard({ moment }: { moment: VictoryMoment }) {
  const accent = VICTORY_ACCENT[moment.accent];

  return (
    <div className={`border ${accent.border} ${accent.bg} relative overflow-hidden`}>
      {/* Left accent bar — matches Coach Voice visual language */}
      <div className={`absolute top-0 left-0 w-px h-full ${accent.bar}`} aria-hidden />
      <div className="pl-6 pr-5 py-5 space-y-1.5">
        <p className={`text-[15px] font-semibold leading-snug ${accent.headline}`}>
          {moment.headline}
        </p>
        <p className="text-white/55 text-sm leading-relaxed">
          {moment.subtext}
        </p>
      </div>
    </div>
  );
}

// ─── Goal Status Hero ─────────────────────────────────────────

const GOAL_TYPE_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  body_recomposition: "Body Recomposition",
  strength: "Strength",
  athletic_performance: "Athletic Performance",
  general_health: "General Health",
  mobility: "Mobility",
  competition_prep: "Competition Prep",
  reverse_diet: "Reverse Diet",
  maintenance: "Maintenance",
  executive_performance: "Executive Performance",
  custom: "Custom Goal",
};

const PACE_CONFIG = {
  ahead: {
    label: "Ahead of Pace",
    color: "text-emerald-400",
    pill: "bg-emerald-500/10 border border-emerald-500/20",
  },
  on_pace: {
    label: "On Pace",
    color: "text-[#c9a24d]",
    pill: "bg-[#c9a24d]/10 border border-[#c9a24d]/25",
  },
  behind: {
    label: "Behind Pace",
    color: "text-amber-400",
    pill: "bg-amber-500/10 border border-amber-500/20",
  },
  in_progress: {
    label: "In Progress",
    color: "text-white/40",
    pill: "bg-white/[0.04] border border-white/[0.08]",
  },
  no_goal: { label: "", color: "", pill: "" },
} as const;

function GoalStatusHero({ goalProgress }: { goalProgress: GoalProgress }) {
  const { goal, paceStatus, percentComplete, distance, qualitativeState } = goalProgress;
  if (!goal) return null;

  const pace = PACE_CONFIG[paceStatus];
  const typeLabel = GOAL_TYPE_LABELS[goal.goalType] ?? goal.goalType;

  const targetDateLabel = goal.targetDate
    ? new Date(goal.targetDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-3">
          {typeLabel}
        </p>
        <p className="text-white/90 text-xl font-medium leading-snug max-w-lg">
          {goal.description}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {pace.label && (
          <span
            className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full ${pace.color} ${pace.pill}`}
          >
            {pace.label}
          </span>
        )}
        {percentComplete !== null && (
          <span className="text-[10px] text-white/40 tabular-nums">
            {percentComplete}% toward goal
          </span>
        )}
        {targetDateLabel && (
          <span className="text-[10px] text-white/25">
            Target {targetDateLabel}
          </span>
        )}
      </div>

      {percentComplete !== null && (
        <div className="h-1.5 bg-white/[0.05] relative overflow-hidden rounded-full">
          <div
            className="absolute left-0 top-0 h-full bg-[#c9a24d]/70 transition-all rounded-full"
            style={{ width: `${Math.min(100, percentComplete)}%` }}
          />
        </div>
      )}

      {/* Goal distance — quantified progress for numeric targets */}
      {distance?.completedLabel && distance?.remainingLabel && (
        <p className="text-[13px] tabular-nums">
          <span className="text-white/80 font-semibold">{distance.completedLabel}</span>
          <span className="text-white/20 mx-2">·</span>
          <span className="text-white/40">{distance.remainingLabel}</span>
        </p>
      )}

      {/* Qualitative state — shown for non-numeric or data-poor goals */}
      {percentComplete === null && qualitativeState && (
        <p className="text-[11px] text-white/30 italic">{qualitativeState}</p>
      )}
    </div>
  );
}

// ─── Coach Voice ──────────────────────────────────────────────

function CoachVoice({ entry }: { entry: CoachVoiceEntry }) {
  return (
    <div className="flex gap-3">
      <div className="w-px bg-[#c9a24d]/30 shrink-0" />
      <div className="space-y-2">
        <p className="text-white/75 text-sm leading-relaxed italic max-w-lg">
          &ldquo;{entry.response}&rdquo;
        </p>
        <p className="text-[9px] text-white/22 uppercase tracking-[0.3em]">
          Your Coach &middot; {entry.weekLabel}
        </p>
      </div>
    </div>
  );
}

// ─── Body Metric Card ─────────────────────────────────────────

function BodyMetricCard({
  label,
  unit,
  values,
  entries,
}: {
  label: string;
  unit: string;
  values: number[];
  entries: { weekLabel: string; value: number }[];
}) {
  if (values.length === 0) {
    return (
      <div className="border-t border-white/[0.05] pt-5">
        <p className="text-[9px] text-white/20 uppercase tracking-[0.3em] mb-2">{label}</p>
        <p className="text-white/30 text-sm leading-relaxed">
          Add your {label.toLowerCase()} to your next check-in to see your trend here.
        </p>
      </div>
    );
  }

  const current = values[0];
  const first = values[values.length - 1];
  const delta = current - first;
  const isImprovement = delta < 0;

  const deltaStr =
    delta === 0
      ? "No change"
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${unit} from start`;

  return (
    <div className="border-t border-white/[0.05] pt-5">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-[9px] text-white/20 uppercase tracking-[0.3em] mb-1.5">{label}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-white tabular-nums">{current.toFixed(1)}</p>
            <p className="text-[10px] text-white/30 ml-0.5">{unit}</p>
          </div>
          <p
            className={`text-[13px] font-semibold mt-2 tabular-nums ${
              delta === 0
                ? "text-white/30"
                : isImprovement
                  ? "text-emerald-400/90"
                  : "text-amber-400/80"
            }`}
          >
            {deltaStr}
          </p>
        </div>
        {values.length >= 2 && <Sparkline values={[...values].reverse()} />}
      </div>

      {entries.length > 0 && (
        <div className="divide-y divide-white/[0.04]">
          {entries.slice(0, 4).map((e, index) => (
            <div key={`${e.weekLabel}-${index}`} className="py-2 flex items-center justify-between">
              <p className="text-[10px] text-white/28">{e.weekLabel}</p>
              <p className="text-[10px] text-white/55 font-medium tabular-nums">
                {e.value.toFixed(1)} {unit}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Consistency Chart ────────────────────────────────────────

function ConsistencyChart({ weeks }: { weeks: WeeklySessionCount[] }) {
  if (weeks.length === 0) {
    return (
      <p className="text-white/30 text-sm leading-relaxed">
        Log your first workout to begin tracking your weekly consistency. Each bar represents one week.
      </p>
    );
  }

  const maxCompleted = Math.max(...weeks.map((w) => w.completed), 1);

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 64 }}>
        {[...weeks].reverse().map((w) => {
          const heightPct = (w.completed / maxCompleted) * 100;
          return (
            <div
              key={w.weekStartDate}
              className="flex-1 flex flex-col items-center justify-end"
              title={`${w.weekLabel}: ${w.completed} of ${w.total} ${w.total === 1 ? "session" : "sessions"}`}
              aria-label={`${w.weekLabel}: ${w.completed} ${w.completed === 1 ? "session" : "sessions"}`}
            >
              <div
                className={`w-full transition-all ${
                  w.completed > 0 ? "bg-[#c9a24d]/60" : "bg-white/[0.04]"
                }`}
                style={{ height: `${Math.max(3, heightPct)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2.5">
        <p className="text-[9px] text-white/18">{[...weeks].reverse()[0]?.weekLabel}</p>
        <p className="text-[9px] text-white/18">{weeks[0]?.weekLabel}</p>
      </div>
    </div>
  );
}

// ─── Recovery Trend ───────────────────────────────────────────

function RecoveryTrend({ metrics }: { metrics: BodyMetricEntry[] }) {
  const withSleep = metrics.filter((m) => m.sleep !== null);
  const withStress = metrics.filter((m) => m.stress !== null);
  const withEnergy = metrics.filter((m) => m.energy !== null);

  if (withSleep.length === 0 && withStress.length === 0 && withEnergy.length === 0) {
    return (
      <p className="text-white/30 text-sm leading-relaxed">
        Submit check-ins with sleep, stress, and energy ratings. Your trends appear here automatically.
      </p>
    );
  }

  const avg = (arr: BodyMetricEntry[], key: keyof BodyMetricEntry): number | null => {
    const vals = arr.map((m) => m[key] as number | null).filter((v): v is number => v !== null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const avgSleep = avg(withSleep, "sleep");
  const avgStress = avg(withStress, "stress");
  const avgEnergy = avg(withEnergy, "energy");

  return (
    <div className="flex gap-8 flex-wrap">
      {[
        { label: "Avg Sleep", value: avgSleep !== null ? `${avgSleep.toFixed(1)}h` : "—" },
        { label: "Avg Stress", value: avgStress !== null ? `${avgStress.toFixed(1)}/10` : "—" },
        { label: "Avg Energy", value: avgEnergy !== null ? `${avgEnergy.toFixed(1)}/10` : "—" },
      ].map((item) => (
        <div key={item.label}>
          <p className="text-lg font-bold text-white/80 tabular-nums">{item.value}</p>
          <p className="text-[9px] text-white/22 uppercase tracking-[0.25em] mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] font-medium mb-0">
      {children}
    </p>
  );
}

// ─── Main Component ───────────────────────────────────────────

interface Props {
  data: ProgressData;
  achievements: Achievement[];
  narrativeSummary: string;
  promises: PromisesKeptStats;
  victoryMoment: VictoryMoment;
  newlyEarnedMilestoneKeys: string[];
}

export default function ProgressContent({ data, achievements, narrativeSummary, promises, victoryMoment, newlyEarnedMilestoneKeys }: Props) {
  const weightValues = data.bodyMetrics
    .map((m) => m.weightLbs)
    .filter((v): v is number => v !== null);
  const waistValues = data.bodyMetrics
    .map((m) => m.waistInches)
    .filter((v): v is number => v !== null);

  const weightEntries = data.bodyMetrics
    .filter((m) => m.weightLbs !== null)
    .map((m) => ({ weekLabel: m.weekLabel, value: m.weightLbs! }));
  const waistEntries = data.bodyMetrics
    .filter((m) => m.waistInches !== null)
    .map((m) => ({ weekLabel: m.weekLabel, value: m.waistInches! }));

  const isOnboarding =
    weightValues.length === 0 &&
    waistValues.length === 0 &&
    data.weeklySessionCounts.length === 0 &&
    achievements.filter((a) => a.earned).length === 0;

  return (
    <div className="space-y-12">

      {/* Goal + Current Status — the orienting frame for everything below */}
      {data.goalProgress.goal && (
        <GoalStatusHero goalProgress={data.goalProgress} />
      )}

      {/* Victory Moment — single strongest recognition from recent data */}
      <VictoryMomentCard moment={victoryMoment} />

      {/* Narrative Summary — broader arc context after the recognition moment */}
      <p className="text-white/70 text-[15px] leading-[1.8] max-w-lg">
        {narrativeSummary}
      </p>

      {/* Coach Voice — highest authority signal; only shown when response exists */}
      {data.coachVoice && (
        <CoachVoice entry={data.coachVoice} />
      )}

      {isOnboarding ? (
        <>
          {/* Milestones first — locked achievements show what's achievable on Day 1 */}
          <div>
            <SectionLabel>Coaching Milestones</SectionLabel>
            <div className="border-t border-white/[0.05] pt-5">
              <AchievementsPanel achievements={achievements} newlyEarned={newlyEarnedMilestoneKeys} />
            </div>
          </div>

          {/* Single preview replaces four stacked empty sections */}
          <div>
            <SectionLabel>What This Page Tracks</SectionLabel>
            <div className="border-t border-white/[0.05] pt-5 space-y-5">
              <p className="text-white/30 text-sm leading-relaxed max-w-sm">
                Every check-in and every session builds this page into your
                transformation record. Here&apos;s what accumulates over time:
              </p>
              <div className="space-y-4">
                {([
                  {
                    label: "Body Metrics",
                    detail: "Weight and waist logged weekly through check-ins. Charted so the trend is visible — not just the number.",
                  },
                  {
                    label: "Behavioral Consistency",
                    detail: "Every session, every week. The chart that matters is the one after three months.",
                  },
                  {
                    label: "Recovery Context",
                    detail: "Sleep, stress, and energy tracked weekly. Averages reveal patterns your daily self cannot see.",
                  },
                ] as const).map((item) => (
                  <div key={item.label} className="flex items-start gap-4">
                    <div className="w-1 h-1 rounded-full bg-[#c9a24d]/40 mt-2 shrink-0" />
                    <div>
                      <p className="text-white/50 text-sm font-medium">{item.label}</p>
                      <p className="text-white/22 text-xs leading-relaxed mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/portal/check-ins/new"
                className="inline-block border border-[#c9a24d]/30 text-[#c9a24d] text-[11px] font-bold uppercase tracking-[0.3em] px-6 py-3 hover:bg-[#c9a24d]/10 transition-colors mt-2"
              >
                Submit First Check-In
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Body Metrics */}
          <div>
            <SectionLabel>Body Metrics</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <BodyMetricCard
                label="Weight"
                unit="lbs"
                values={weightValues}
                entries={weightEntries}
              />
              <BodyMetricCard
                label="Waist"
                unit="in"
                values={waistValues}
                entries={waistEntries}
              />
            </div>
          </div>

          {/* Behavioral Identity
              ─ Reserved zone: future Integrity / Momentum / Reliability scores
                will occupy the space above the consistency chart when the
                behavioral identity system is built. The section label and
                stat row establish the architectural slot now so no redesign
                is needed when that layer arrives.
          */}
          <div>
            <SectionLabel>Behavioral Consistency</SectionLabel>
            <div className="border-t border-white/[0.05] pt-5 space-y-5">
              {/* Only surface streak + promise count once sessions exist.
                  Showing "0 | 0" before the client has logged a single session
                  reads as failure when they may be doing everything else right. */}
              {promises.hasAnyData && (
                <div className="flex gap-8">
                  <div>
                    <p className="text-2xl font-bold text-white tabular-nums">
                      {promises.lifetimeKept}
                    </p>
                    <p className="text-[9px] text-[#c9a24d]/60 uppercase tracking-[0.25em] mt-0.5">
                      {promises.lifetimeKept === 1 ? "Promise Kept" : "Promises Kept"}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white/55 tabular-nums">
                      {promises.currentStreak}
                    </p>
                    <p className="text-[9px] text-white/22 uppercase tracking-[0.25em] mt-0.5">
                      Week Streak
                    </p>
                  </div>
                </div>
              )}
              <ConsistencyChart weeks={data.weeklySessionCounts} />
            </div>
          </div>

          {/* Recovery Context — inputs to progress, not outcomes */}
          {data.bodyMetrics.length > 0 && (
            <div>
              <SectionLabel>Recovery Context</SectionLabel>
              <div className="border-t border-white/[0.05] pt-5">
                <RecoveryTrend metrics={data.bodyMetrics} />
              </div>
            </div>
          )}

          {/* Coaching Milestones — meaningful moments, not arcade badges */}
          <div>
            <SectionLabel>Coaching Milestones</SectionLabel>
            <div className="border-t border-white/[0.05] pt-5">
              <AchievementsPanel achievements={achievements} newlyEarned={newlyEarnedMilestoneKeys} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
