// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Check-In Review Queue
//
// Server Component. Shows all actionable check-ins sorted by
// oldest-waiting first.
//
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { Inbox, Clock3, CheckCircle2, ChevronRight } from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { listCoachCheckIns } from "@/lib/db/coach-check-in-service";
import { Card, Badge, EmptyState } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { SEVERITY_DOT, SEVERITY_TEXT } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

type QueueItem = Awaited<ReturnType<typeof listCoachCheckIns>>[number];

// Renders the exact scheduled occurrence date, weekday included — NOT
// just "Week of <Sunday>". Two occurrences in the same week (e.g. a
// Wednesday + Sunday check-in) share a weekStartDate but must never
// render identically here; a coach needs to tell them apart at a
// glance in the queue, not just after opening each one.
function fmtOccurrence(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Waiting for Review",
  in_review: "In Review",
  reviewed: "Reviewed",
};

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  draft: "neutral",
  submitted: "info",
  in_review: "warning",
  reviewed: "success",
};

// Bare status dot for actionable rows — kept as its own map (rather
// than reusing the Badge variant name directly) so the hue is
// explicit and pinned to exactly what the neighboring Badge renders:
// Badge variant="info" -> text-sky-400, variant="warning" ->
// text-sky/amber-400 (== SEVERITY_TEXT.caution). Sourcing "in_review"
// from SEVERITY_DOT ties it to the shared severity module since that
// hue already coincides with Severity's "caution" bucket; "submitted"
// has no Severity equivalent (Severity has no sky/info hue), so it's
// pinned directly to Badge's sky-400 to guarantee the two elements
// can never drift apart again.
const STATUS_DOT: Record<string, string> = {
  submitted: "bg-sky-400",
  in_review: SEVERITY_DOT.caution,
};

// ─────────────────────────────────────────────────────────────
// PRESENTATIONAL SUBCOMPONENTS
// ─────────────────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Card tone="dark" padding="sm">
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gold/20 bg-gold/10 text-gold/80"
          aria-hidden
        >
          {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/30">{label}</span>
      </div>
      <p className="text-2xl font-bold leading-none tabular-nums text-white">{value}</p>
      <p className="mt-2 text-[10px] text-white/25">{sub}</p>
    </Card>
  );
}

function QueueRow({ item, variant }: { item: QueueItem; variant: "actionable" | "reviewed" }) {
  return (
    <Link
      href={`/hq/check-ins/${item.id}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/40"
    >
      <Card tone="dark" interactive padding="sm" className="flex items-center gap-4">
        {variant === "actionable" && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              STATUS_DOT[item.status] ?? SEVERITY_DOT.unknown
            }`}
            aria-hidden
          />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              variant === "actionable" ? "text-white" : "text-white/70"
            }`}
          >
            {item.clientName}
          </p>
          <p className="text-[11px] text-white/35">{fmtOccurrence(item.scheduledDate)}</p>
        </div>

        <Badge tone="dark" variant={STATUS_BADGE_VARIANT[item.status]} size="sm" className="hidden shrink-0 sm:inline-flex">
          {STATUS_LABEL[item.status]}
        </Badge>

        {variant === "actionable" && item.waitingDays !== null && (
          <div className="hidden shrink-0 text-right md:block">
            <p
              className={`text-sm font-bold tabular-nums ${
                item.waitingDays >= 3 ? SEVERITY_TEXT.caution : "text-white/50"
              }`}
            >
              {item.waitingDays}d
            </p>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/25">waiting</p>
          </div>
        )}

        {variant === "actionable" && (
          <div className="hidden shrink-0 text-right lg:block">
            <p className="text-xs text-white/50">{fmtDate(item.submittedAt)}</p>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/25">submitted</p>
          </div>
        )}

        <ChevronRight size={14} className="shrink-0 text-white/20" aria-hidden />
      </Card>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function CheckInQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);
  const { client: clientFilter } = await searchParams;

  const allCheckIns = await listCoachCheckIns({
    status: ["submitted", "in_review", "reviewed"],
    coachId,
    clientId: clientFilter || undefined,
  });

  const actionable = allCheckIns.filter(
    (c) => c.status === "submitted" || c.status === "in_review",
  );
  const reviewed = allCheckIns.filter((c) => c.status === "reviewed");
  const inReviewCount = allCheckIns.filter((c) => c.status === "in_review").length;

  // clientId scoping in listCoachCheckIns already joins through
  // coachingEnrollments, so a filter for a client this coach doesn't
  // own just yields an empty result — never another coach's data.
  const filteredClientName = clientFilter ? allCheckIns[0]?.clientName ?? null : null;

  return (
    <div className="space-y-8">
      <HQBreadcrumbs crumbs={[
        { label: "Overview", href: "/hq" },
        { label: "Check-Ins" },
      ]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <HQPageHeader
          title="Check-In Queue"
          subtitle={
            clientFilter
              ? `Showing ${filteredClientName ?? "this client"}'s check-ins only.`
              : actionable.length === 0
                ? allCheckIns.length === 0
                  ? "No check-ins yet — clients submit these weekly from their portal."
                  : "All check-ins reviewed"
                : `${actionable.length} waiting for review`
          }
        />
        {clientFilter && (
          <Link
            href="/hq/check-ins"
            className="text-[10px] text-white/35 hover:text-white/60 uppercase tracking-[0.2em] transition-colors shrink-0 mt-1"
          >
            View all clients →
          </Link>
        )}
      </div>

      {/* ── Summary metric row ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          icon={<Inbox size={13} />}
          label="Needs Review"
          value={actionable.length}
          sub="Submitted + in review"
        />
        <MetricCard
          icon={<Clock3 size={13} />}
          label="In Review"
          value={inReviewCount}
          sub="Currently being reviewed"
        />
        <MetricCard
          icon={<CheckCircle2 size={13} />}
          label="Reviewed"
          value={reviewed.length}
          sub="Completed check-ins"
        />
      </div>

      {/* Queue */}
      {actionable.length === 0 ? (
        allCheckIns.length === 0 ? (
          <EmptyState
            tone="dark"
            icon={<Inbox className="size-5" />}
            title="No check-ins yet"
            description={
              clientFilter
                ? "This client hasn't submitted a check-in yet."
                : "Once a client submits their first weekly check-in from their portal, it'll show up here."
            }
          />
        ) : (
          <EmptyState
            tone="dark"
            icon={<CheckCircle2 className="size-5" />}
            title="All caught up"
            description="No check-ins waiting for review."
          />
        )
      ) : (
        <section>
          <p className="mb-3 text-[9px] uppercase tracking-[0.3em] text-white/30">Needs Review</p>
          <div className="space-y-2">
            {actionable.map((item) => (
              <QueueRow key={item.id} item={item} variant="actionable" />
            ))}
          </div>
        </section>
      )}

      {/* Reviewed (recent history) */}
      {reviewed.length > 0 && (
        <section>
          <p className="mb-3 text-[9px] uppercase tracking-[0.3em] text-white/30">Recently Reviewed</p>
          <div className="space-y-2">
            {reviewed.slice(0, 20).map((item) => (
              <QueueRow key={item.id} item={item} variant="reviewed" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
