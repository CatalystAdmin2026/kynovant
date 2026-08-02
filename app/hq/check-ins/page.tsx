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
import { listCoachCheckIns } from "@/lib/db/coach-check-in-service";
import { Card, Badge, EmptyState } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { SEVERITY_DOT, SEVERITY_TEXT } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

type QueueItem = Awaited<ReturnType<typeof listCoachCheckIns>>[number];

function fmtWeek(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
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
  submitted: "Waiting",
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
          <p className="text-[11px] text-white/35">Week of {fmtWeek(item.weekStartDate)}</p>
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

export default async function CheckInQueuePage() {
  const allCheckIns = await listCoachCheckIns({
    status: ["submitted", "in_review", "reviewed"],
  });

  const actionable = allCheckIns.filter(
    (c) => c.status === "submitted" || c.status === "in_review",
  );
  const reviewed = allCheckIns.filter((c) => c.status === "reviewed");
  const inReviewCount = allCheckIns.filter((c) => c.status === "in_review").length;

  return (
    <div className="space-y-8">
      <HQBreadcrumbs crumbs={[
        { label: "Mission Control", href: "/hq" },
        { label: "Check-Ins" },
      ]} />

      <HQPageHeader
        title="Check-In Queue"
        subtitle={
          actionable.length === 0
            ? "All check-ins reviewed"
            : `${actionable.length} waiting for review`
        }
      />

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
        <EmptyState
          tone="dark"
          icon={<CheckCircle2 className="size-5" />}
          title="All caught up"
          description="No check-ins waiting for review."
        />
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
