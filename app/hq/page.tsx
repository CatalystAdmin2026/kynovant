// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Overview (Executive Command Center)
//
// Server component. Auth is handled by app/hq/layout.tsx.
//
// Design intent: answer one question — "what deserves my attention
// right now?" — with no hero banner and no greeting copy. Every
// section below is either real data (mission control, check-ins,
// AI generation drafts) or a clearly-labeled "Coming Soon"
// placeholder for backend that doesn't exist yet (coach-facing
// notifications, scheduled/upcoming sessions). Nothing here is
// fabricated to fill space.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  Layers,
  Plus,
  Radio,
  Sparkles,
} from "lucide-react";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getCoachMissionControl } from "@/lib/db/coach-dashboard-service";
import { listCoachCheckIns } from "@/lib/db/coach-check-in-service";
import { listAttentionDrafts } from "@/lib/db/program-generation-service";
import { listProgramTemplates } from "@/lib/db/program-builder-service";
import AddClientButton from "@/components/hq/clients/AddClientButton";
import HQPageHeader from "@/components/hq/HQPageHeader";
import { Badge, type BadgeVariant } from "@/components/ui";
import { SEVERITY_BAR, SEVERITY_DOT, type Severity } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDateTime(d: Date | null): string {
  if (!d) return "No timestamp";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

const CHECKIN_STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for Review",
  in_review: "In Review",
  reviewed: "Reviewed",
};

const CHECKIN_STATUS_VARIANT: Record<string, BadgeVariant> = {
  submitted: "info",
  in_review: "warning",
  reviewed: "success",
};

// ─────────────────────────────────────────────────────────────
// PRESENTATIONAL PRIMITIVES
// ─────────────────────────────────────────────────────────────

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

function Row({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border border-white/[0.05] bg-[#101213] px-4 py-3.5 transition-colors hover:border-white/[0.12] hover:bg-[#121416] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/50"
    >
      {children}
    </Link>
  );
}

function EmptyRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="border border-dashed border-white/[0.06] px-4 py-5 text-center">
      <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center text-white/30">{icon}</div>
      <p className="text-sm font-medium text-white/55">{title}</p>
      <p className="mt-1 text-xs text-white/35">{detail}</p>
    </div>
  );
}

function IconTile({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "gold";
}) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.06] bg-white/[0.03] ${
        tone === "gold" ? "text-[#C9A24D]/65" : "text-white/35"
      }`}
    >
      {children}
    </div>
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

function MetricTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
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
      <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/45">{label}</p>
    </div>
  );
}

// Deliberately distinct from the real-data cards elsewhere on this
// page — dashed border, no severity dot, explicit "Coming Soon" chip
// — so a coach never mistakes "not built yet" for "nothing's happening".
function PlaceholderCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-dashed border-white/[0.08] bg-[#0d0e0f] p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-white/25">{icon}</span>
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/35">{title}</p>
        <span className="ml-auto shrink-0 border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-white/30">
          Coming Soon
        </span>
      </div>
      <p className="text-xs leading-relaxed text-white/35">{body}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const { dbUser } = await requireCoachOrAdminPage();
  const scope = resolveTenantScope(dbUser);
  const { coachId } = scope;

  const [data, attentionDrafts, checkInRows, programTemplates] = await Promise.all([
    getCoachMissionControl(coachId),
    listAttentionDrafts(scope),
    listCoachCheckIns({
      coachId,
      status: ["submitted", "in_review", "reviewed"],
      limit: 50,
    }),
    listProgramTemplates(coachId),
  ]);

  // ── Onboarding: contextual, not a separate page. Each row hides
  // itself the moment its own condition is met; the whole card
  // disappears once both are done. Replaces the old /hq/get-started
  // checklist page entirely.
  const hasClients = data.activeClientCount > 0;
  const hasPrograms = programTemplates.length > 0;
  const showOnboarding = !hasClients || !hasPrograms;

  const criticalClients = data.prioritizedClients.filter((c) => c.attentionLevel === "critical");
  const highClients = data.prioritizedClients.filter((c) => c.attentionLevel === "high");
  const mediumClients = data.prioritizedClients.filter((c) => c.attentionLevel === "medium");
  const healthyClientCount = Math.max(
    0,
    data.activeClientCount - criticalClients.length - highClients.length - mediumClients.length,
  );
  const clientsWithPrograms = Math.max(0, data.activeClientCount - data.noActiveProgramCount);

  const portfolioSegments = [
    { label: "Healthy", value: healthyClientCount, severity: "ok" as Severity },
    { label: "Needs Attention", value: highClients.length + mediumClients.length, severity: "caution" as Severity },
    { label: "Critical", value: criticalClients.length, severity: "critical" as Severity },
  ];
  const totalPortfolioSegments = Math.max(1, portfolioSegments.reduce((s, seg) => s + seg.value, 0));

  const generatingDrafts = attentionDrafts.filter((d) => d.status === "queued" || d.status === "running");
  const readyDrafts = attentionDrafts.filter((d) => d.status === "ready_for_review");

  const awaitingCheckIns = checkInRows.filter((c) => c.status !== "reviewed").slice(0, 5);
  const recentCheckIns = [...checkInRows]
    .sort((a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime())
    .slice(0, 5);

  // ── Today's Priorities — the answer to "what deserves my attention
  // right now". Every entry here is a real, actionable signal; nothing
  // is synthesized just to populate the list.
  interface Priority {
    icon: React.ReactNode;
    label: string;
    detail: string;
    href: string;
    severity: Severity;
  }

  const priorities: Priority[] = [];

  if (data.checkIns.waitingCount > 0) {
    priorities.push({
      icon: <ClipboardCheck size={16} />,
      label: `${data.checkIns.waitingCount} check-in${data.checkIns.waitingCount === 1 ? "" : "s"} awaiting review`,
      detail: fmtWaiting(data.checkIns.oldestWaitingAt),
      href: "/hq/check-ins",
      severity: "caution",
    });
  }

  for (const draft of readyDrafts) {
    priorities.push({
      icon: <Sparkles size={16} />,
      label: `AI draft ready for review — ${draft.title ?? draft.clientName ?? "Untitled Program"}`,
      detail: draft.clientName ? `For ${draft.clientName}` : "No client assigned yet",
      href: `/hq/programs/generate/${draft.id}`,
      severity: "caution",
    });
  }

  if (data.noActiveProgramCount > 0) {
    priorities.push({
      icon: <Layers size={16} />,
      label: `${data.noActiveProgramCount} client${data.noActiveProgramCount === 1 ? "" : "s"} without an active program`,
      detail: "Assign a multi-week program from the client workspace.",
      href: criticalClients[0] ? `/hq/clients/${criticalClients[0].userId}` : "/hq/clients",
      severity: "critical",
    });
  }

  if (data.noWorkoutLast7dCount > 0) {
    priorities.push({
      icon: <Radio size={16} />,
      label: `${data.noWorkoutLast7dCount} client${data.noWorkoutLast7dCount === 1 ? "" : "s"} inactive 7+ days`,
      detail: "Active program, no completed workout in a week or more.",
      href: highClients[0] ? `/hq/clients/${highClients[0].userId}` : "/hq/clients",
      severity: "high",
    });
  }

  const visiblePriorities = priorities.slice(0, 6);
  const hiddenPriorityCount = priorities.length - visiblePriorities.length;

  const headerSubtitle =
    priorities.length === 0
      ? "Nothing urgent — your coaching queue is clear."
      : `${priorities.length} item${priorities.length === 1 ? "" : "s"} need your attention.`;

  return (
    <div className="space-y-8">
      <HQPageHeader title="Overview" subtitle={headerSubtitle} />

      {showOnboarding && (
        <DashboardCard className="p-5">
          <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#C9A24D]/55">
            Get Started
          </p>
          <div className="space-y-3">
            {!hasClients && (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-white/[0.05] bg-[#101213] px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-white">Invite your first client</p>
                  <p className="mt-0.5 text-xs text-white/35">
                    Send an email invite so they can log into their Kynovant portal.
                  </p>
                </div>
                <AddClientButton />
              </div>
            )}
            {!hasPrograms && (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-white/[0.05] bg-[#101213] px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-white">Set up your first program</p>
                  <p className="mt-0.5 text-xs text-white/35">
                    Start from a template or build one from scratch. Assigning it to a client is a separate, later step.
                  </p>
                </div>
                <Link
                  href="/hq/programs"
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9A24D] hover:text-[#D4B56A] transition-colors"
                >
                  Go to Programs →
                </Link>
              </div>
            )}
          </div>
        </DashboardCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section aria-label="Today's priorities">
          <SectionHeader eyebrow="Attention" title="Today's Priorities" />
          <DashboardCard className="p-4">
            {visiblePriorities.length === 0 ? (
              <EmptyRow
                icon={<CheckCircle2 size={18} />}
                title="You're all caught up."
                detail="Nothing needs your attention right now."
              />
            ) : (
              <div className="space-y-2">
                {visiblePriorities.map((p, i) => (
                  <Row key={i} href={p.href}>
                    <IconTile>{p.icon}</IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{p.label}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[p.severity]}`} />
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-white/35">{p.detail}</p>
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-white/25" />
                  </Row>
                ))}
                {hiddenPriorityCount > 0 && (
                  <p className="px-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-white/25">
                    +{hiddenPriorityCount} more in Check-Ins / Clients
                  </p>
                )}
              </div>
            )}
          </DashboardCard>
        </section>

        <section aria-label="Quick actions">
          <SectionHeader eyebrow="Next" title="Quick Actions" />
          <DashboardCard className="p-4">
            <AddClientButton />
            <div className="mt-3 grid grid-cols-1 gap-2">
              <QuickAction href="/hq/programs" icon={<Plus size={14} />} label="Create Program" />
              <QuickAction href="/hq/blueprints" icon={<FileText size={14} />} label="Create Blueprint" />
              <QuickAction href="/hq/check-ins" icon={<ClipboardCheck size={14} />} label="Review Check-Ins" />
            </div>
          </DashboardCard>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Clients awaiting review">
          <SectionHeader
            eyebrow="Queue"
            title="Clients Awaiting Review"
            action={
              <Link href="/hq/check-ins" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-colors hover:text-white/60">
                View all →
              </Link>
            }
          />
          <DashboardCard className="p-4">
            {awaitingCheckIns.length === 0 ? (
              <EmptyRow icon={<Inbox size={18} />} title="No check-ins waiting." detail="New submissions will show up here." />
            ) : (
              <div className="space-y-2">
                {awaitingCheckIns.map((c) => (
                  <Row key={c.id} href={`/hq/check-ins/${c.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{c.clientName}</p>
                      <p className="mt-0.5 text-xs text-white/35">
                        {c.waitingDays !== null ? `Waiting ${c.waitingDays}d` : "Just submitted"}
                      </p>
                    </div>
                    <Badge tone="dark" variant={CHECKIN_STATUS_VARIANT[c.status]} size="sm" className="hidden shrink-0 sm:inline-flex">
                      {CHECKIN_STATUS_LABEL[c.status]}
                    </Badge>
                    <ArrowRight size={14} className="shrink-0 text-white/25" />
                  </Row>
                ))}
              </div>
            )}
          </DashboardCard>
        </section>

        <section aria-label="Programs currently generating">
          <SectionHeader
            eyebrow="AI Generator"
            title="Programs Currently Generating"
            action={
              <Link href="/hq/programs/generate" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-colors hover:text-white/60">
                New Draft →
              </Link>
            }
          />
          <DashboardCard className="p-4">
            {generatingDrafts.length === 0 ? (
              <EmptyRow icon={<Sparkles size={18} />} title="Nothing generating right now." detail="Start a new AI draft from Programs." />
            ) : (
              <div className="space-y-2">
                {generatingDrafts.map((d) => (
                  <Row key={d.id} href={`/hq/programs/generate/${d.id}`}>
                    <IconTile tone="gold"><Sparkles size={16} /></IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{d.title ?? "Untitled Program"}</p>
                      <p className="mt-0.5 truncate text-xs text-white/35">
                        {d.clientName ? `For ${d.clientName}` : "No client assigned yet"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-[#C9A24D]/80">
                        {d.currentWeek && d.totalWeeks ? `Week ${d.currentWeek} of ${d.totalWeeks}` : "Starting…"}
                      </p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-white/25">Generating</p>
                    </div>
                  </Row>
                ))}
              </div>
            )}
          </DashboardCard>
        </section>
      </div>

      <section aria-label="Coach metrics">
        <SectionHeader eyebrow="Portfolio" title="Coach Metrics" />
        <DashboardCard className="p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricTile label="Active Clients" value={data.activeClientCount} />
            <MetricTile label="With Program" value={clientsWithPrograms} />
            <MetricTile label="Workouts Today" value={data.workoutsCompletedToday} tone="gold" />
            <MetricTile label="Workouts (7d)" value={data.workoutsCompletedLast7d} tone="gold" />
            <MetricTile
              label="Skipped (30d)"
              value={data.recentSkippedCount}
              tone={data.recentSkippedCount > 0 ? "critical" : "muted"}
            />
          </div>

          <div className="my-5 h-px bg-white/[0.05]" />

          <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/30">Portfolio Health</p>
          <div className="mb-4 flex h-2 overflow-hidden bg-white/[0.05]">
            {portfolioSegments.map((segment) => (
              <div
                key={segment.label}
                className={SEVERITY_BAR[segment.severity]}
                style={{ width: `${(segment.value / totalPortfolioSegments) * 100}%` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {portfolioSegments.map((segment) => (
              <div key={segment.label} className="border border-white/[0.05] bg-[#101213] px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[segment.severity]}`} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 leading-tight">
                    {segment.label}
                  </p>
                </div>
                <p className="text-xl font-bold tabular-nums text-white">{segment.value}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Recent activity">
          <SectionHeader
            eyebrow="Changed"
            title="Recent Activity"
            action={
              <Link href="/hq/clients" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-colors hover:text-white/60">
                Client Directory →
              </Link>
            }
          />
          <DashboardCard className="p-4">
            {data.recentActivity.length === 0 ? (
              <EmptyRow icon={<Activity size={18} />} title="No recent workout activity." detail="Completed and skipped sessions will appear here." />
            ) : (
              <div className="space-y-2">
                {data.recentActivity.slice(0, 6).map((activity) => (
                  <Row key={activity.sessionId} href={`/hq/clients/${activity.clientId}/history/${activity.sessionId}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{activity.clientName}</p>
                        <Badge tone="dark" variant={activity.status === "completed" ? "success" : "warning"} size="sm">
                          {activity.status === "completed" ? "Completed" : "Skipped"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-white/35">
                        {activity.workoutName}
                        {activity.programWeekNumber ? ` · Week ${activity.programWeekNumber}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-white/35">{fmtDateTime(activity.occurredAt)}</p>
                  </Row>
                ))}
              </div>
            )}
          </DashboardCard>
        </section>

        <section aria-label="Recent client check-ins">
          <SectionHeader
            eyebrow="Pulse"
            title="Recent Client Check-Ins"
            action={
              <Link href="/hq/check-ins" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 transition-colors hover:text-white/60">
                View all →
              </Link>
            }
          />
          <DashboardCard className="p-4">
            {recentCheckIns.length === 0 ? (
              <EmptyRow icon={<ClipboardCheck size={18} />} title="No check-ins yet." detail="Clients submit these weekly from their portal." />
            ) : (
              <div className="space-y-2">
                {recentCheckIns.map((c) => (
                  <Row key={c.id} href={`/hq/check-ins/${c.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{c.clientName}</p>
                        <Badge tone="dark" variant={CHECKIN_STATUS_VARIANT[c.status]} size="sm">
                          {CHECKIN_STATUS_LABEL[c.status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-white/35">Week of {c.weekStartDate}</p>
                    </div>
                    <p className="shrink-0 text-xs text-white/35">{fmtDateTime(c.submittedAt)}</p>
                  </Row>
                ))}
              </div>
            )}
          </DashboardCard>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <PlaceholderCard
          icon={<Bell size={16} />}
          title="Unread Notifications"
          body="Coach-facing notifications aren't wired up yet — this will surface unread client activity once the delivery layer ships."
        />
        <PlaceholderCard
          icon={<CalendarClock size={16} />}
          title="Upcoming Sessions"
          body="Session scheduling isn't tracked ahead of time yet — this will show what's on each client's calendar for the days ahead."
        />
      </div>
    </div>
  );
}
