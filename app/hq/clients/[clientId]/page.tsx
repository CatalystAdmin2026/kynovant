// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Client Workspace (Sprint 6.2C)
//
// Server component. Auth via app/hq/layout.tsx (coach or admin).
// Renders the complete coach command center for a single client.
//
// Security:
//   workspace.sensitive is rendered only in SensitiveHealthPanel.
//   It is never serialized to the browser outside that component.
//   The page itself passes no JWT claims or secrets to the client.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getCoachClientWorkspace } from "@/lib/db/coach-client-workspace-service";
import { listAssignableBlueprints, getClientProgramHistory } from "@/lib/db/coach-program-assignment-service";
import { getClientCheckInSummary } from "@/lib/db/coach-check-in-service";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import AssignProgramButton from "@/components/hq/workspace/AssignProgramButton";
import AssignProgramModal from "@/components/hq/workspace/AssignProgramModal";
import ProgramTimeline from "@/components/hq/workspace/ProgramTimeline";
import { Card, EmptyState, cx } from "@/components/ui";
import { SEVERITY_DOT, SEVERITY_TEXT, SEVERITY_BAR, type Severity } from "@/lib/ui/status";
import type {
  CoachClientWorkspace,
  ExercisePerformance,
  BodyCompSnapshot,
  WorkspaceGoal,
  WorkspaceTimelineEntry,
  SetAnalytics,
  AttentionLevel,
} from "@/lib/db/coach-client-workspace-service";
import type { ProfileReadiness } from "@/lib/db/profile-readiness";
import type { HistorySession } from "@/lib/db/workout-session-service";
import SensitiveHealthPanel from "@/components/hq/workspace/SensitiveHealthPanel";
import GoalManager from "@/components/hq/workspace/GoalManager";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null, short = false): string {
  if (!d) return "—";
  const opts: Intl.DateTimeFormatOptions = short
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return new Date(d instanceof Date ? d : d + "T12:00:00").toLocaleDateString("en-US", opts);
}

function fmtRelative(d: Date | null): string {
  if (!d) return "Never";
  const diffMs = Date.now() - new Date(d).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

// Every domain concept below (attention level, readiness %, readiness
// section state, compliance %) maps into the shared Severity type
// (lib/ui/status.ts) so their colors always agree with each other and
// with every other severity indicator in HQ — no more independently
// hand-tuned red/amber/yellow/emerald per concept.

const ATTENTION_SEVERITY: Record<AttentionLevel, Severity> = {
  critical: "critical",
  high: "high",
  medium: "caution",
  healthy: "ok",
};

function attentionSeverity(level: AttentionLevel): Severity {
  return ATTENTION_SEVERITY[level];
}

function attentionColor(level: AttentionLevel) {
  return SEVERITY_TEXT[attentionSeverity(level)];
}

// Border + tinted bg for the attention pill/banner — built from the
// same hue as SEVERITY_DOT/SEVERITY_TEXT for that severity.
const SEVERITY_BORDER_BG: Record<Severity, string> = {
  ok: "border-white/10 bg-white/[0.03]",
  caution: "border-amber-500/25 bg-amber-500/[0.05]",
  high: "border-orange-500/25 bg-orange-500/[0.05]",
  critical: "border-red-500/25 bg-red-500/[0.05]",
  unknown: "border-white/10 bg-white/[0.03]",
};

function attentionBorder(level: AttentionLevel) {
  return SEVERITY_BORDER_BG[attentionSeverity(level)];
}

function readinessSeverity(pct: number): Severity {
  if (pct >= 80) return "ok";
  if (pct >= 50) return "caution";
  return "critical";
}

function readinessColor(pct: number) {
  return SEVERITY_TEXT[readinessSeverity(pct)];
}

const READINESS_LEVEL_SEVERITY: Record<string, Severity> = {
  complete: "ok",
  partial: "caution",
  missing: "critical",
  not_applicable: "unknown",
};

function readinessBar(level: string) {
  return SEVERITY_BAR[READINESS_LEVEL_SEVERITY[level] ?? "unknown"];
}

function complianceSeverity(pct: number | null): Severity {
  if (pct === null) return "unknown";
  if (pct >= 75) return "ok";
  if (pct >= 50) return "caution";
  return "critical";
}

function complianceColor(pct: number | null) {
  return SEVERITY_TEXT[complianceSeverity(pct)];
}

function deltaIndicator(delta: number | null) {
  if (delta === null) return null;
  if (delta > 0) return <span className="text-emerald-400 text-[10px] font-semibold">+{delta} lb</span>;
  if (delta < 0) return <span className="text-red-400 text-[10px] font-semibold">{delta} lb</span>;
  return <span className="text-gray-500 text-[10px]">no change</span>;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[10px] text-gray-400 uppercase tracking-[0.4em] font-semibold shrink-0">
        {title}
      </h2>
      <div className="flex-1 h-px bg-white/[0.04]" />
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: CLIENT HEADER
// ─────────────────────────────────────────────────────────────

// "invited" uses sky (not blue) to match Badge's dark "info" variant —
// the only other "info"-toned state used across HQ.
const STATUS_PILL: Record<string, string> = {
  active: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400",
  invited: "border-sky-500/25 bg-sky-500/[0.06] text-sky-400",
  suspended: "border-red-500/25 bg-red-500/[0.06] text-red-400",
  archived: "border-white/10 bg-white/[0.04] text-white/40",
};

function ClientHeader({
  w,
  assignAction,
}: {
  w: CoachClientWorkspace;
  assignAction: React.ReactNode;
}) {
  const displayName = w.preferredName ?? w.fullName;
  const statusClass = STATUS_PILL[w.userStatus] ?? "border-white/10 bg-white/[0.04] text-gray-400";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-white/[0.06]">
      {/* Identity */}
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap mb-1.5">
          <h1 className="text-2xl font-bold tracking-wide text-white">{displayName}</h1>
          <span
            className={cx(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.25em] font-semibold",
              statusClass,
            )}
          >
            {w.userStatus}
          </span>
          {w.attentionLevel !== "healthy" && (
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.25em] font-semibold",
                attentionBorder(w.attentionLevel),
                attentionColor(w.attentionLevel),
              )}
            >
              {w.attentionLevel}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-sm">{w.email}</p>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {w.enrollment && (
            <span className="text-[10px] text-gray-400">
              {w.enrollment.packageType}
              <span className="text-gray-600"> · {w.enrollment.enrollmentStatus}</span>
            </span>
          )}
          <span className="text-[10px] text-gray-500">
            Client since {fmtDate(w.clientSince)}
          </span>
          {w.enrollment?.checkInDayOfWeek !== null && w.enrollment?.checkInDayOfWeek !== undefined && (
            <span className="text-[10px] text-gray-500">
              Check-in: {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][w.enrollment.checkInDayOfWeek]}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Link
          href="/hq/clients"
          className="ds-focus-ring text-[10px] text-white/50 uppercase tracking-[0.2em] font-medium hover:text-white/85 hover:bg-white/5 border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors"
        >
          ← Clients
        </Link>
        {assignAction}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: ATTENTION BANNER
// ─────────────────────────────────────────────────────────────

function AttentionBanner({ level, reason }: { level: AttentionLevel; reason: string }) {
  if (level === "healthy") {
    return (
      <div className={cx("rounded-xl border px-4 py-3 flex items-center gap-3", attentionBorder(level))}>
        <div className={cx("w-1.5 h-1.5 rounded-full shrink-0", SEVERITY_DOT[attentionSeverity(level)])} />
        <p className={cx("text-xs font-medium", attentionColor(level))}>
          On Track — no immediate coaching action required.
        </p>
      </div>
    );
  }

  return (
    <div className={cx("rounded-xl border px-4 py-3 flex items-start gap-3", attentionBorder(level))}>
      <div className={cx(
        "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
        SEVERITY_DOT[attentionSeverity(level)],
      )} />
      <div>
        <p className={cx("text-xs font-semibold uppercase tracking-[0.15em]", attentionColor(level))}>
          {level === "critical" ? "Critical" : level === "high" ? "Needs Attention" : "Review This Week"}
        </p>
        <p className="text-gray-300 text-xs mt-0.5">{reason}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: COACHING SNAPSHOT
// ─────────────────────────────────────────────────────────────

function CoachingSnapshot({ w }: { w: CoachClientWorkspace }) {
  const stats = w.sessionStats;
  const program = w.activeProgram;

  const cards = [
    {
      label: "30d Compliance",
      value: stats.compliancePct !== null ? `${stats.compliancePct}%` : "—",
      color: complianceColor(stats.compliancePct),
      sub: stats.compliancePct === null ? "<3 sessions" : `${stats.completedLast30d} completed`,
    },
    {
      label: "Total Sessions",
      value: String(stats.completedTotal),
      color: "text-white",
      sub: `${stats.skippedTotal} skipped all time`,
    },
    {
      label: "Last Workout",
      value: fmtRelative(stats.lastCompletedAt),
      color: SEVERITY_TEXT[stats.completedLast7d > 0 ? "ok" : "caution"],
      sub: `${stats.completedLast7d} this week`,
    },
    {
      label: "Program Week",
      value: program ? `${program.currentWeek}${program.totalWeeks ? `/${program.totalWeeks}` : ""}` : "—",
      color: program ? "text-[#C9A24D]" : "text-gray-600",
      sub: program?.daysRemaining !== null && program?.daysRemaining !== undefined
        ? `${program.daysRemaining}d remaining`
        : program
        ? "No end date set"
        : "No active program",
    },
    {
      label: "Sets (30d)",
      value: stats.setAnalytics.totalSetsLast30d > 0
        ? String(stats.setAnalytics.totalSetsLast30d)
        : "—",
      color: "text-white",
      sub: stats.setAnalytics.totalSetsLast7d > 0
        ? `${stats.setAnalytics.totalSetsLast7d} this week`
        : "None this week",
    },
    {
      label: "Profile Ready",
      value: `${w.readiness.overallPercent}%`,
      color: readinessColor(w.readiness.overallPercent),
      sub: w.readiness.blockersForWorkoutGeneration.length > 0
        ? `${w.readiness.blockersForWorkoutGeneration.length} blocker${w.readiness.blockersForWorkoutGeneration.length > 1 ? "s" : ""}`
        : "No blockers",
    },
  ];

  return (
    <section>
      <SectionHeader title="Coaching Snapshot" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {cards.map(({ label, value, color, sub }) => (
          <Card key={label} tone="dark" padding="sm" className="relative overflow-hidden">
            <div className="h-px absolute top-0 inset-x-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
            <p className={cx("text-2xl font-bold tabular-nums leading-none mb-1.5", color)}>{value}</p>
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em] leading-relaxed">{label}</p>
            {sub && <p className="text-[9px] text-gray-600 mt-0.5">{sub}</p>}
          </Card>
        ))}
      </div>
    </section>
  );
}

// CurrentProgramPanel and WeekDayCell replaced by ProgramTimeline (Sprint 6.3A)

// ─────────────────────────────────────────────────────────────
// SECTION: TRAINING PERFORMANCE
// ─────────────────────────────────────────────────────────────

function TrainingPerformance({
  recentSessions,
  setAnalytics,
  exerciseHighlights,
  clientId,
}: {
  recentSessions: HistorySession[];
  setAnalytics: SetAnalytics;
  exerciseHighlights: ExercisePerformance[];
  clientId: string;
}) {
  return (
    <section className="space-y-5">
      <SectionHeader title="Training Performance" />

      {/* A: Recent sessions */}
      <div>
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em] mb-2">Recent Sessions</p>
        {recentSessions.length === 0 ? (
          <EmptyState tone="dark" title="No sessions recorded yet." />
        ) : (
          <div className="rounded-xl bg-[var(--surface)] border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
            {recentSessions.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/hq/clients/${clientId}/history/${s.id}`}
                className="ds-focus-ring flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
              >
                <div
                  className={cx(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    s.status === "completed" ? "bg-emerald-400" : "bg-gray-600",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{s.workoutName}</p>
                  {s.programWeekNumber && (
                    <p className="text-gray-600 text-[9px]">Week {s.programWeekNumber}</p>
                  )}
                </div>
                {s.status === "completed" && s.completionPercent > 0 && (
                  <p className="text-[#C9A24D] text-xs font-bold tabular-nums shrink-0">
                    {s.completionPercent}%
                  </p>
                )}
                <p className="text-gray-500 text-[10px] shrink-0">
                  {fmtDate(s.completedAt, true)}
                </p>
                <span className="text-gray-700 text-xs shrink-0 group-hover:text-gray-400 transition-colors">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* B: Volume summary */}
      <div>
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em] mb-2">Volume Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            {
              label: "Sets (7d)",
              value: setAnalytics.totalSetsLast7d > 0 ? String(setAnalytics.totalSetsLast7d) : "—",
            },
            {
              label: "Sets (30d)",
              value: setAnalytics.totalSetsLast30d > 0 ? String(setAnalytics.totalSetsLast30d) : "—",
            },
            {
              label: "Avg RPE (30d)",
              value: setAnalytics.avgRpeLast30d !== null
                ? setAnalytics.avgRpeLast30d.toFixed(1)
                : "—",
            },
            {
              label: "Vol. Load (30d)",
              value: setAnalytics.totalVolumeKgLast30d !== null
                ? `${Math.round(setAnalytics.totalVolumeKgLast30d * 2.2046).toLocaleString()} lb`
                : "—",
            },
          ].map(({ label, value }) => (
            <Card key={label} tone="dark" padding="sm">
              <p className="text-base font-bold text-white tabular-nums">{value}</p>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] mt-1">{label}</p>
            </Card>
          ))}
        </div>
        {setAnalytics.totalSetsLast30d === 0 && (
          <p className="text-gray-600 text-[10px] mt-2">
            Not enough data — set logging required for volume tracking.
          </p>
        )}
      </div>

      {/* C: Exercise highlights */}
      {exerciseHighlights.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em] mb-2">
            Exercise Performance (last 90d)
          </p>
          <div className="space-y-1.5">
            {exerciseHighlights.map((ex) => (
              <Card key={ex.exerciseId} tone="dark" padding="sm" className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium">{ex.exerciseName}</p>
                  <p className="text-gray-500 text-[9px]">{fmtDate(ex.latestDate, true)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white text-xs font-semibold tabular-nums">
                    {ex.latestSetCount}×
                    {ex.latestMaxWeightLbs !== null && ` ${ex.latestMaxWeightLbs}lb`}
                    {ex.latestMaxReps !== null && ` ${ex.latestMaxReps}r`}
                  </p>
                  {ex.priorDate && (
                    <p className="text-gray-600 text-[9px]">
                      prev {fmtDate(ex.priorDate, true)}
                      {ex.priorMaxWeightLbs !== null && ` · ${ex.priorMaxWeightLbs}lb`}
                    </p>
                  )}
                </div>
                <div className="shrink-0 w-14 text-right">
                  {deltaIndicator(ex.weightDeltaLbs)}
                </div>
              </Card>
            ))}
          </div>
          <p className="text-[9px] text-gray-700 mt-2">
            Delta shown only where weight was logged in two comparable sessions.
          </p>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: BODY PROGRESS
// ─────────────────────────────────────────────────────────────

function BodyProgress({
  latest,
  prior,
  history,
}: {
  latest: BodyCompSnapshot | null;
  prior: BodyCompSnapshot | null;
  history: BodyCompSnapshot[];
}) {
  return (
    <section>
      <SectionHeader title="Body Progress" />
      {!latest ? (
        <EmptyState tone="dark" title="No body-composition records have been imported yet." />
      ) : (
        <div className="space-y-3">
          {/* Key metrics */}
          <Card tone="dark" padding="sm" className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em]">Weight</p>
                <p className="text-white text-2xl font-bold tabular-nums leading-tight">
                  {latest.weightPounds !== null ? `${latest.weightPounds} lb` : "—"}
                </p>
                {prior?.weightPounds !== null && prior !== null && latest.weightPounds !== null && (
                  <p className="text-[10px] mt-0.5">
                    <span
                      className={
                        latest.weightPounds < prior.weightPounds
                          ? "text-emerald-400"
                          : latest.weightPounds > prior.weightPounds
                          ? "text-red-400"
                          : "text-gray-500"
                      }
                    >
                      {latest.weightPounds > prior.weightPounds ? "+" : ""}
                      {(latest.weightPounds - prior.weightPounds).toFixed(1)} lb
                    </span>
                    <span className="text-gray-600"> vs prior</span>
                  </p>
                )}
              </div>
              {latest.bodyFatPercent !== null && (
                <div className="text-right">
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em]">Body Fat</p>
                  <p className="text-white text-xl font-bold">{latest.bodyFatPercent}%</p>
                </div>
              )}
            </div>
            {latest.waistInches !== null && (
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em]">Waist</p>
                <p className="text-gray-300 text-sm font-medium">{latest.waistInches}&quot;</p>
              </div>
            )}
            <p className="text-[9px] text-gray-600">
              Recorded {fmtDate(latest.recordedAt)} · {latest.source.replace("_", " ")}
            </p>
          </Card>

          {/* Mini sparkline (weight trend) */}
          {history.length >= 2 && (
            <Card tone="dark" padding="sm">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] mb-2">Weight Trend</p>
              <WeightSparkline records={history} />
            </Card>
          )}
        </div>
      )}
    </section>
  );
}

function WeightSparkline({ records }: { records: BodyCompSnapshot[] }) {
  const weights = records
    .slice()
    .reverse()
    .map((r) => r.weightPounds)
    .filter((w): w is number => w !== null);

  if (weights.length < 2) return null;

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const w = 180;
  const h = 36;
  const pts = weights
    .map((v, i) => {
      const x = (i / (weights.length - 1)) * w;
      const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="flex items-end gap-4">
      <svg width={w} height={h} className="overflow-visible" aria-hidden>
        <polyline
          points={pts}
          fill="none"
          stroke="#C9A24D"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
        {weights.map((v, i) => (
          <circle
            key={i}
            cx={(i / (weights.length - 1)) * w}
            cy={h - ((v - min) / range) * h * 0.8 - h * 0.1}
            r="2"
            fill="#C9A24D"
            opacity="0.8"
          />
        ))}
      </svg>
      <div className="text-right">
        <p className="text-[9px] text-gray-600">{weights.length} records</p>
        <p className="text-[9px] text-gray-700">
          {min}–{max} lb
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: GOALS & READINESS
// ─────────────────────────────────────────────────────────────

function GoalsReadiness({
  goals,
  readiness,
  clientId,
}: {
  goals: WorkspaceGoal[];
  readiness: ProfileReadiness;
  clientId: string;
}) {
  const sections = [
    { label: "Identity",  level: readiness.sections.identity },
    { label: "Health",    level: readiness.sections.health },
    { label: "Goals",     level: readiness.sections.goals },
    { label: "Training",  level: readiness.sections.training },
    { label: "Equipment", level: readiness.sections.equipment },
    { label: "Nutrition", level: readiness.sections.nutrition },
  ] as const;

  return (
    <section className="space-y-5">
      <SectionHeader title="Goals &amp; Readiness" />

      {/* Goals */}
      <div>
        <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em] mb-2">Active Goals</p>
        <GoalManager goals={goals} clientId={clientId} />
      </div>

      {/* Profile readiness */}
      <Card tone="dark" padding="sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.25em]">Profile Readiness</p>
          <p className={cx("text-sm font-bold tabular-nums", readinessColor(readiness.overallPercent))}>
            {readiness.overallPercent}%
          </p>
        </div>
        <div className="space-y-1">
          {sections.map(({ label, level }) => (
            <div key={label} className="flex items-center gap-3">
              <p className="text-[9px] text-gray-500 w-16 shrink-0">{label}</p>
              <div className="flex-1 h-1 bg-white/[0.05] overflow-hidden rounded-full">
                <div
                  className={cx("h-full rounded-full", readinessBar(level))}
                  style={{
                    width: level === "complete" ? "100%" : level === "partial" ? "50%" : "0%",
                  }}
                />
              </div>
              <p className="text-[9px] text-gray-600 w-16 text-right capitalize">{level}</p>
            </div>
          ))}
        </div>

        {readiness.blockersForWorkoutGeneration.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em]">Blockers</p>
            {readiness.blockersForWorkoutGeneration.map((b, i) => (
              <p key={i} className="text-[10px] text-amber-400/70 flex items-start gap-1">
                <span className="shrink-0 mt-px">·</span>
                {b}
              </p>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: SAFE PROFILE SUMMARY
// ─────────────────────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2 py-1 border-b border-white/[0.04] last:border-0">
      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] w-28 shrink-0 pt-px">{label}</p>
      <p className="text-xs text-gray-300">{String(value)}</p>
    </div>
  );
}

function ProfileJsonRow({ label, value }: { label: string; value: unknown }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
  return <ProfileRow label={label} value={display} />;
}

function ProfileSummary({ w }: { w: CoachClientWorkspace }) {
  const tp = w.trainingProfile;
  const np = w.nutritionProfile;
  const prefs = w.preferences;

  const hasTraining = !!tp;
  const hasNutrition = !!np;
  const hasPrefs = !!prefs;

  if (!hasTraining && !hasNutrition && !hasPrefs) {
    return (
      <section>
        <SectionHeader title="Client Profile" />
        <EmptyState
          tone="dark"
          title="No profile data on file"
          description="Complete the onboarding process to populate this section."
        />
      </section>
    );
  }

  return (
    <section>
      <SectionHeader title="Client Profile" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Training */}
        <Card tone="dark" padding="sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.4em] mb-3">Training</p>
          {tp ? (
            <div>
              <ProfileRow label="Experience" value={tp.experienceLevel ?? null} />
              <ProfileRow label="Days/Week" value={tp.availableDaysPerWeek ?? null} />
              <ProfileRow label="Session Length" value={tp.sessionDurationMinutes ? `${tp.sessionDurationMinutes} min` : null} />
              <ProfileRow label="Training Time" value={tp.preferredTrainingTime ?? null} />
              <ProfileRow label="Environment" value={tp.gymEnvironment?.replace(/_/g, " ") ?? null} />
              <ProfileJsonRow label="Likes" value={tp.exerciseLikes} />
              <ProfileJsonRow label="Dislikes" value={tp.exerciseDislikes} />
            </div>
          ) : (
            <p className="text-gray-600 text-xs">Not provided</p>
          )}
        </Card>

        {/* Nutrition */}
        <Card tone="dark" padding="sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.4em] mb-3">Nutrition</p>
          {np ? (
            <div>
              <ProfileRow label="Meals/Day" value={np.currentMealsPerDay ?? null} />
              <ProfileRow label="Diet Pattern" value={np.dietaryPattern ?? null} />
              <ProfileJsonRow label="Allergies" value={np.allergies} />
              <ProfileJsonRow label="Intolerances" value={np.intolerances} />
              <ProfileJsonRow label="Foods Liked" value={np.foodsLiked} />
              <ProfileJsonRow label="Foods Disliked" value={np.foodsDisliked} />
              <ProfileRow
                label="Hydration"
                value={np.hydrationOuncesAverage ? `${np.hydrationOuncesAverage} oz/day` : null}
              />
            </div>
          ) : (
            <p className="text-gray-600 text-xs">Not provided</p>
          )}
        </Card>

        {/* Preferences */}
        <Card tone="dark" padding="sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.4em] mb-3">Preferences</p>
          {prefs ? (
            <div>
              <ProfileRow label="Communication" value={prefs.communicationPreference ?? null} />
              <ProfileRow label="Accountability" value={prefs.accountabilityStyle ?? null} />
              <ProfileRow label="Coaching Tone" value={prefs.coachingTone ?? null} />
              <ProfileRow label="Check-in Day" value={
                prefs.preferredCheckInDay !== null
                  ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][prefs.preferredCheckInDay]
                  : null
              } />
              <ProfileRow label="Timezone" value={prefs.timezone ?? null} />
            </div>
          ) : (
            <p className="text-gray-600 text-xs">Not provided</p>
          )}
        </Card>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: ACTIVITY TIMELINE
// ─────────────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  workout_completed: "✓",
  workout_skipped: "—",
  program_assigned: "📋",
  account_activated: "★",
  onboarding_submitted: "◎",
  body_comp_recorded: "⊕",
  enrollment_created: "●",
};

function ActivityTimeline({ events }: { events: WorkspaceTimelineEntry[] }) {
  return (
    <section>
      <SectionHeader title="Activity Timeline" />
      {events.length === 0 ? (
        <EmptyState tone="dark" title="No activity recorded yet." />
      ) : (
        <div className="space-y-px">
          {events.map((e, i) => (
            <div key={e.id} className="flex items-start gap-3 px-1 py-2">
              {/* Timeline bar */}
              <div className="flex flex-col items-center gap-0 shrink-0 pt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#C9A24D]/40 shrink-0" />
                {i < events.length - 1 && (
                  <div className="w-px bg-white/[0.04] mt-1" style={{ height: "20px" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" aria-hidden>
                    {EVENT_ICON[e.eventType] ?? "·"}
                  </span>
                  <p className="text-white text-xs font-medium">{e.title}</p>
                </div>
                {e.description && (
                  <p className="text-gray-500 text-[10px] mt-0.5 ml-4">{e.description}</p>
                )}
              </div>
              <p className="text-gray-600 text-[9px] shrink-0">{fmtDate(e.occurredAt, true)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION: COACH NOTES (Coming Soon)
// ─────────────────────────────────────────────────────────────

// No coach_notes table exists yet. Private coach notes must not
// share a table with client-visible fields or timeline_events.
//
// Recommended future schema:
//   CREATE TABLE coach_notes (
//     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     client_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
//     coach_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
//     enrollment_id uuid REFERENCES coaching_enrollments(id) ON DELETE SET NULL,
//     body          text NOT NULL,
//     is_private    boolean NOT NULL DEFAULT true,
//     pinned        boolean NOT NULL DEFAULT false,
//     created_at    timestamptz NOT NULL DEFAULT now(),
//     updated_at    timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX ON coach_notes (client_id, created_at DESC);
//   CREATE INDEX ON coach_notes (coach_id, client_id);
//
// Security: is_private=true rows are never exposed via RLS to clients.

function CoachNotesComingSoon() {
  return (
    <section>
      <SectionHeader title="Coach Notes" />
      <EmptyState
        tone="dark"
        title="Coach Notes — Coming Soon"
        description="Private coach notes will appear here once the note-taking feature is built."
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);

  const [workspace, blueprints, programHistory, checkInSummary] = await Promise.all([
    getCoachClientWorkspace(clientId, coachId),
    listAssignableBlueprints(coachId),
    getClientProgramHistory(clientId),
    getClientCheckInSummary(clientId),
  ]);

  // getCoachClientWorkspace returns null both when clientId doesn't exist
  // and when this coach isn't enrolled with them — same non-disclosing
  // 404 posture used throughout this codebase (authorizeWorkoutSession).
  if (!workspace) notFound();

  const displayName = workspace.preferredName ?? workspace.fullName;
  const hasActiveProgram = !!workspace.activeProgram;

  return (
    <div className="space-y-8 max-w-[1200px]">
      <HQBreadcrumbs crumbs={[
        { label: "Overview", href: "/hq" },
        { label: "Clients",         href: "/hq/clients" },
        { label: displayName },
      ]} />

      {/* Header — gold "Assign / Replace Program" CTA */}
      <ClientHeader
        w={workspace}
        assignAction={
          <AssignProgramButton variant="header" hasActiveProgram={hasActiveProgram} />
        }
      />

      {/* Attention banner */}
      <AttentionBanner level={workspace.attentionLevel} reason={workspace.attentionReason} />

      {/* Coaching snapshot */}
      <CoachingSnapshot w={workspace} />

      {/* 2-column: main content + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: 2/3 */}
        <div className="lg:col-span-2 space-y-8">
          {/* Program Timeline replaces static program card */}
          <ProgramTimeline
            activeProgram={workspace.activeProgram}
            programHistory={programHistory}
            emptyStateAction={
              <AssignProgramButton variant="primary" hasActiveProgram={false} />
            }
            replaceAction={
              <AssignProgramButton variant="section" hasActiveProgram={hasActiveProgram} />
            }
          />
          <TrainingPerformance
            recentSessions={workspace.recentSessions}
            setAnalytics={workspace.sessionStats.setAnalytics}
            exerciseHighlights={workspace.exerciseHighlights}
            clientId={clientId}
          />
        </div>

        {/* Right: 1/3 */}
        <div className="space-y-8">
          <BodyProgress
            latest={workspace.bodyComposition.latest}
            prior={workspace.bodyComposition.prior}
            history={workspace.bodyComposition.history}
          />
          <GoalsReadiness goals={workspace.goals} readiness={workspace.readiness} clientId={clientId} />
        </div>
      </div>

      {/* Full-width sections */}
      <ProfileSummary w={workspace} />

      {/* Check-In summary panel */}
      <section>
        <SectionHeader
          title="Check-Ins"
          action={
            <Link
              href={`/hq/check-ins?client=${clientId}`}
              className="text-[10px] text-gray-500 hover:text-[#C9A24D] transition-colors uppercase tracking-[0.2em]"
            >
              View Queue →
            </Link>
          }
        />
        {checkInSummary.totalCheckIns === 0 ? (
          <EmptyState tone="dark" title="No check-ins submitted yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card tone="dark" padding="sm">
              <p className="text-2xl font-bold text-white tabular-nums">
                {checkInSummary.totalCheckIns}
              </p>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] mt-1">
                Total Check-Ins
              </p>
            </Card>
            <Card tone="dark" padding="sm">
              <p className={cx(
                "text-2xl font-bold tabular-nums",
                checkInSummary.pendingCount > 0 ? SEVERITY_TEXT.caution : "text-white",
              )}>
                {checkInSummary.pendingCount}
              </p>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] mt-1">
                Pending Review
              </p>
            </Card>
            <Card tone="dark" padding="sm">
              {checkInSummary.lastCheckIn ? (
                <>
                  <p className="text-sm font-semibold text-white">
                    Week of {fmtDate(checkInSummary.lastCheckIn.weekStartDate, true)}
                  </p>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.25em] mt-1">
                    Last Check-In · {checkInSummary.lastCheckIn.status}
                  </p>
                  <Link
                    href={`/hq/check-ins/${checkInSummary.lastCheckIn.id}`}
                    className="text-[10px] text-[#C9A24D]/60 hover:text-[#C9A24D] transition-colors mt-1.5 inline-block"
                  >
                    Review →
                  </Link>
                </>
              ) : (
                <p className="text-gray-600 text-xs">No recent check-in</p>
              )}
            </Card>
          </div>
        )}
      </section>

      {/* Nutrition quick-link */}
      <section>
        <SectionHeader
          title="Nutrition"
          action={
            <Link
              href={`/hq/clients/${clientId}/nutrition`}
              className="text-[10px] text-gray-500 hover:text-[#C9A24D] transition-colors uppercase tracking-[0.2em]"
            >
              Manage Targets →
            </Link>
          }
        />
        <Card tone="dark" padding="sm">
          <p className="text-xs text-white/40 leading-relaxed">
            Set daily calorie and macro targets for this client. Targets are calculated
            using Mifflin-St Jeor and require coach review before publishing.
          </p>
          <Link
            href={`/hq/clients/${clientId}/nutrition`}
            className="inline-block mt-3 text-[10px] text-[#C9A24D]/60 hover:text-[#C9A24D] transition-colors"
          >
            Open Nutrition →
          </Link>
        </Card>
      </section>

      {/* Sensitive health — collapsible client component */}
      <SensitiveHealthPanel {...workspace.sensitive} />

      <ActivityTimeline events={workspace.activityTimeline} />

      <CoachNotesComingSoon />

      {/* Assignment modal — mounted once, opened via custom event */}
      <AssignProgramModal
        clientId={clientId}
        hasActiveProgram={hasActiveProgram}
        activeProgramName={workspace.activeProgram?.name ?? null}
        blueprints={blueprints}
      />
    </div>
  );
}
