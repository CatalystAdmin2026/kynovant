// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Daily Coach Command Dashboard
//
// Server component. Auth is handled by app/hq/layout.tsx.
// Uses only the existing mission-control data contract.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Layers,
  Plus,
  Radio,
  Target,
  Users,
} from "lucide-react";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getCoachMissionControl } from "@/lib/db/coach-dashboard-service";
import AddClientButton from "@/components/hq/clients/AddClientButton";
import { StatusChip } from "@/components/ui";
import { SEVERITY_BAR, SEVERITY_DOT, SEVERITY_TEXT, type Severity } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date | null): string {
  if (!d) return "No timestamp";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmtWaiting(d: Date | null): string {
  if (!d) return "No submitted check-ins waiting";
  const diffMs = Date.now() - new Date(d).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Oldest waiting: today";
  if (days === 1) return "Oldest waiting: 1 day";
  return `Oldest waiting: ${days} days`;
}

function getPrimaryAction(data: Awaited<ReturnType<typeof getCoachMissionControl>>) {
  if (data.checkIns.waitingCount > 0) {
    return {
      label: "Review Check-Ins",
      href: "/hq/check-ins",
      body: `${data.checkIns.waitingCount} submitted check-in${data.checkIns.waitingCount === 1 ? "" : "s"} waiting.`,
    };
  }

  const noProgramClient = data.prioritizedClients.find((client) => !client.activeProgramId);
  if (noProgramClient) {
    return {
      label: "Assign Program",
      href: `/hq/clients/${noProgramClient.userId}`,
      body: `${noProgramClient.preferredName ?? noProgramClient.fullName} has no active program.`,
    };
  }

  const inactiveClient = data.prioritizedClients.find(
    (client) => client.attentionReason === "No workout in 7+ days",
  );
  if (inactiveClient) {
    return {
      label: "Review Client",
      href: `/hq/clients/${inactiveClient.userId}`,
      body: `${inactiveClient.preferredName ?? inactiveClient.fullName} has no completed workout in 7+ days.`,
    };
  }

  return {
    label: "View Clients",
    href: "/hq/clients",
    body: data.activeClientCount > 0
      ? "No urgent coaching queue items are open."
      : "Start by adding your first client.",
  };
}

function DashboardCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-white/[0.06] bg-[#0d0e0f] ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.35em] text-[#C9A24D]/55">
          {eyebrow}
        </p>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function QueueRow({
  icon,
  label,
  value,
  detail,
  href,
  severity = "unknown",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  href?: string;
  severity?: Severity;
}) {
  const content = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.06] bg-white/[0.03] text-white/35">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{label}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-white/35">{detail}</p>
      </div>
      <div className="text-right">
        <p className={`text-xl font-bold tabular-nums ${SEVERITY_TEXT[severity]}`}>{value}</p>
      </div>
      {href && <ArrowRight size={14} className="shrink-0 text-white/25" />}
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center gap-3 border border-white/[0.05] bg-[#101213] px-4 py-4">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 border border-white/[0.05] bg-[#101213] px-4 py-4 transition-colors hover:border-white/[0.12] hover:bg-[#121416] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/50"
    >
      {content}
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border border-white/[0.06] bg-[#0d0e0f] px-4 py-3 text-xs font-semibold text-white/65 transition-colors hover:border-white/[0.14] hover:text-white"
    >
      <span className="flex items-center gap-3">
        <span className="text-[#C9A24D]/65">{icon}</span>
        {label}
      </span>
      <ArrowRight size={13} className="text-white/25" />
    </Link>
  );
}

export default async function MissionControlPage() {
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);
  const data = await getCoachMissionControl(coachId);
  const primaryAction = getPrimaryAction(data);

  const today = fmtDate(new Date());
  const criticalClients = data.prioritizedClients.filter((client) => client.attentionLevel === "critical");
  const highClients = data.prioritizedClients.filter((client) => client.attentionLevel === "high");
  const mediumClients = data.prioritizedClients.filter((client) => client.attentionLevel === "medium");
  const healthyClientCount = Math.max(
    0,
    data.activeClientCount - criticalClients.length - highClients.length - mediumClients.length,
  );
  const clientsWithPrograms = Math.max(0, data.activeClientCount - data.noActiveProgramCount);
  const allQueueClear =
    data.checkIns.waitingCount === 0 &&
    data.noActiveProgramCount === 0 &&
    data.noWorkoutLast7dCount === 0 &&
    data.checkIns.inReviewCount === 0;

  const portfolioSegments = [
    { label: "Healthy", value: healthyClientCount, severity: "ok" as Severity },
    { label: "Needs Attention", value: highClients.length + mediumClients.length, severity: "caution" as Severity },
    { label: "Critical", value: criticalClients.length, severity: "critical" as Severity },
  ];

  const totalPortfolioSegments = Math.max(1, portfolioSegments.reduce((sum, item) => sum + item.value, 0));

  return (
    <div className="space-y-7">
      <section aria-label="Daily brief" className="overflow-hidden border border-white/[0.07] bg-[#0b0c0d]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px]">
          <div className="relative min-h-[280px] px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A24D]/35 to-transparent" />
              <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,77,0.08),transparent_58%)]" />
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between gap-10">
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.45em] text-[#C9A24D]/70">
                  Daily Brief
                </p>
                <h1 className="font-headline text-4xl font-bold uppercase leading-none text-white md:text-[58px]">
                  Good day, Coach.
                </h1>
                <p className="mt-3 text-sm text-white/40">{today}</p>
              </div>

              <div className="max-w-2xl">
                <p className="text-base leading-relaxed text-white/75">
                  {primaryAction.body}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href={primaryAction.href}
                    className="inline-flex items-center justify-center gap-2 bg-[#C9A24D] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#D4B56A]"
                  >
                    {primaryAction.label}
                    <ArrowRight size={13} />
                  </Link>
                  {data.activeClientCount === 0 && (
                    <Link
                      href="/hq/get-started"
                      className="inline-flex items-center justify-center gap-2 border border-white/[0.08] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 transition-colors hover:border-white/[0.16] hover:text-white"
                    >
                      Open Get Started
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] bg-[#080909]/60 p-5 lg:border-l lg:border-t-0">
            <div className="grid h-full grid-cols-2 gap-3">
              <BriefStat label="Active Clients" value={data.activeClientCount} />
              <BriefStat label="Check-Ins Waiting" value={data.checkIns.waitingCount} tone={data.checkIns.waitingCount > 0 ? "gold" : "muted"} />
              <BriefStat label="Need Programs" value={data.noActiveProgramCount} tone={data.noActiveProgramCount > 0 ? "critical" : "muted"} />
              <BriefStat label="Workouts Today" value={data.workoutsCompletedToday} tone="gold" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section aria-label="Today's coaching queue">
          <SectionHeader eyebrow="Today" title="Coaching Queue" />
          <DashboardCard className="p-4">
            <div className="space-y-3">
              <QueueRow
                icon={<ClipboardCheck size={16} />}
                label="Check-ins awaiting review"
                value={data.checkIns.waitingCount}
                detail={fmtWaiting(data.checkIns.oldestWaitingAt)}
                href="/hq/check-ins"
                severity={data.checkIns.waitingCount > 0 ? "caution" : "ok"}
              />
              <QueueRow
                icon={<Layers size={16} />}
                label="Clients without a program"
                value={data.noActiveProgramCount}
                detail={data.noActiveProgramCount > 0 ? "Assign a multi-week program from the client workspace." : "Every active client has a program assignment."}
                href={criticalClients[0] ? `/hq/clients/${criticalClients[0].userId}` : "/hq/clients"}
                severity={data.noActiveProgramCount > 0 ? "critical" : "ok"}
              />
              <QueueRow
                icon={<Radio size={16} />}
                label="Inactive 7+ days"
                value={data.noWorkoutLast7dCount}
                detail={data.noWorkoutLast7dCount > 0 ? "Clients with active programs and no completed workout in 7+ days." : "No active-program clients are stale by this rule."}
                href={highClients[0] ? `/hq/clients/${highClients[0].userId}` : "/hq/clients"}
                severity={data.noWorkoutLast7dCount > 0 ? "high" : "ok"}
              />
              <QueueRow
                icon={<Target size={16} />}
                label="Nutrition drafts"
                value="--"
                detail="Draft publication state is not tracked in HQ yet."
                severity="unknown"
              />
              {allQueueClear && (
                <div className="border border-dashed border-white/[0.06] px-4 py-5 text-center">
                  <CheckCircle2 size={18} className="mx-auto mb-2 text-white/30" />
                  <p className="text-sm font-medium text-white/55">No open queue items from current data.</p>
                  <p className="mt-1 text-xs text-white/35">Recent activity below is the best source for what changed.</p>
                </div>
              )}
            </div>
          </DashboardCard>
        </section>

        <section aria-label="Quick actions">
          <SectionHeader eyebrow="Next" title="Quick Actions" />
          <div className="space-y-3">
            <DashboardCard className="p-4">
              <AddClientButton />
              <div className="mt-3 grid grid-cols-1 gap-2">
                <QuickAction href="/hq/programs" icon={<Plus size={14} />} label="Create Program" />
                <QuickAction href="/hq/blueprints" icon={<FileText size={14} />} label="Create Blueprint" />
                <QuickAction href="/hq/check-ins" icon={<ClipboardCheck size={14} />} label="Review Check-Ins" />
              </div>
            </DashboardCard>

            <DashboardCard className="p-5">
              <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.35em] text-white/30">
                Operational Note
              </p>
              <p className="text-sm leading-relaxed text-white/55">
                Upcoming actions and last-login deltas need event or task tracking.
                This dashboard only shows signals currently backed by HQ data.
              </p>
            </DashboardCard>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section aria-label="Portfolio health">
          <SectionHeader eyebrow="Portfolio" title="Health Distribution" />
          <DashboardCard className="p-5">
            <div className="mb-5 flex h-2 overflow-hidden bg-white/[0.05]">
              {portfolioSegments.map((segment) => (
                <div
                  key={segment.label}
                  className={`${SEVERITY_BAR[segment.severity]}`}
                  style={{ width: `${(segment.value / totalPortfolioSegments) * 100}%` }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {portfolioSegments.map((segment) => (
                <div key={segment.label} className="border border-white/[0.05] bg-[#101213] px-3 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[segment.severity]}`} />
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      {segment.label}
                    </p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-white">{segment.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/35">
              Distribution uses the same deterministic attention rules as the client workspace.
            </p>
          </DashboardCard>
        </section>

        <section aria-label="Coaching momentum">
          <SectionHeader eyebrow="Momentum" title="Coaching Signals" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MomentumCard
              icon={<Dumbbell size={16} />}
              label="Workouts Completed"
              value={String(data.workoutsCompletedLast7d)}
              detail="Last 7 days"
            />
            <MomentumCard
              icon={<ClipboardCheck size={16} />}
              label="Check-Ins In Review"
              value={String(data.checkIns.inReviewCount)}
              detail="Currently open"
            />
            <MomentumCard
              icon={<Users size={16} />}
              label="Clients With Programs"
              value={String(clientsWithPrograms)}
              detail="Active client portfolio"
            />
            <MomentumCard
              icon={<AlertTriangle size={16} />}
              label="Skipped Sessions"
              value={String(data.recentSkippedCount)}
              detail="Last 30 days"
              severity={data.recentSkippedCount > 0 ? "caution" : "unknown"}
            />
          </div>
        </section>
      </div>

      <section aria-label="Recent activity">
        <SectionHeader
          eyebrow="Changed"
          title="Recent Activity"
          action={
            <Link href="/hq/clients" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-colors hover:text-white/60">
              Client Directory
            </Link>
          }
        />
        <DashboardCard className="p-4">
          {data.recentActivity.length === 0 ? (
            <div className="border border-dashed border-white/[0.06] px-5 py-8 text-center">
              <Activity size={18} className="mx-auto mb-2 text-white/30" />
              <p className="text-sm font-medium text-white/55">No recent workout activity.</p>
              <p className="mt-1 text-xs text-white/35">Completed and skipped sessions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recentActivity.slice(0, 8).map((activity) => (
                <Link
                  key={activity.sessionId}
                  href={`/hq/clients/${activity.clientId}/history/${activity.sessionId}`}
                  className="grid grid-cols-1 gap-3 border border-white/[0.05] bg-[#101213] px-4 py-3.5 transition-colors hover:border-white/[0.12] hover:bg-[#121416] sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{activity.clientName}</p>
                      <StatusChip
                        tone="dark"
                        status={activity.status === "completed" ? "ok" : "caution"}
                        label={activity.status === "completed" ? "Completed" : "Skipped"}
                        size="sm"
                      />
                    </div>
                    <p className="mt-1 truncate text-xs text-white/40">
                      {activity.workoutName}
                      {activity.programWeekNumber ? ` | Week ${activity.programWeekNumber}` : ""}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-semibold text-white/60">
                      {activity.status === "completed" ? `${activity.completionPercent}% logged` : "No completion logged"}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-white/25">
                      Session
                    </p>
                  </div>
                  <p className="text-xs text-white/35">{fmtDateTime(activity.occurredAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </DashboardCard>
      </section>
    </div>
  );
}

function BriefStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "gold" | "critical" | "muted";
}) {
  const color =
    tone === "gold"
      ? "text-[#C9A24D]"
      : tone === "critical"
      ? "text-red-400"
      : tone === "muted"
      ? "text-white/45"
      : "text-white";

  return (
    <div className="border border-white/[0.05] bg-[#101213] p-4">
      <p className={`text-3xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/[0.32]">
        {label}
      </p>
    </div>
  );
}

function MomentumCard({
  icon,
  label,
  value,
  detail,
  severity = "unknown",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  severity?: Severity;
}) {
  return (
    <DashboardCard className="p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center border border-white/[0.06] bg-white/[0.03] text-[#C9A24D]/65">
          {icon}
        </div>
        <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      </div>
      <p className="text-3xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-xs text-white/30">{detail}</p>
    </DashboardCard>
  );
}
