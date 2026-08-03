// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Mission Control
//
// Server component. Auth is handled by app/hq/layout.tsx.
// Answers: "Who needs my attention today?"
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { Check, Activity, CalendarDays } from "lucide-react";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getCoachMissionControl, type AttentionLevel } from "@/lib/db/coach-dashboard-service";
import HQPageHeader from "@/components/hq/HQPageHeader";
import { StatusChip } from "@/components/ui";
import { SEVERITY_DOT, SEVERITY_TEXT, type Severity } from "@/lib/ui/status";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Maps this page's attention vocabulary into the shared severity
// scale so a client row's dot, reason chip, and compliance % never
// disagree with each other.
function attentionSeverity(level: AttentionLevel): Severity {
  const map: Record<AttentionLevel, Severity> = {
    critical: "critical",
    high:     "high",
    medium:   "caution",
    healthy:  "ok",
  };
  return map[level];
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function MissionControlPage() {
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);
  const data = await getCoachMissionControl(coachId);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <HQPageHeader
        title="Overview"
        subtitle={today}
        action={
          <Link
            href="/hq/clients"
            className="text-[10px] text-white/50 uppercase tracking-[0.3em] font-semibold hover:text-white/70 transition-colors border border-white/[0.07] px-3 py-1.5"
          >
            All Clients →
          </Link>
        }
      />

      {/* ── Welcome banner: shown until this coach has a client ── */}
      {data.activeClientCount === 0 && (
        <section aria-label="Get started">
          <div className="border border-[#C9A24D]/25 bg-gradient-to-br from-[#C9A24D]/[0.06] to-transparent px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div>
              <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.3em] uppercase mb-1.5">
                Welcome to Kynovant
              </p>
              <p className="text-white text-sm font-medium">
                Let&apos;s get your first client on a program.
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Three quick steps — add a client, set up a program, assign the first workout.
              </p>
            </div>
            <Link
              href="/hq/get-started"
              className="shrink-0 bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-3 hover:bg-[#D4B56A] transition-colors text-center"
            >
              Get Started →
            </Link>
          </div>
        </section>
      )}

      {/* ── Section A: Count cards ───────────────────────────── */}
      <section aria-label="Summary counts">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            {
              label: "Active Clients",
              value: data.activeClientCount,
              color: "text-white",
              note: null,
              href: null,
            },
            {
              label: "Needs Attention",
              value: data.prioritizedClients.length,
              color: data.prioritizedClients.length > 0 ? SEVERITY_TEXT.caution : "text-white",
              note: null,
              href: null,
            },
            {
              label: "No Program Assigned",
              value: data.noActiveProgramCount,
              color: data.noActiveProgramCount > 0 ? SEVERITY_TEXT.critical : "text-white",
              note: null,
              href: null,
            },
            {
              label: "Check-Ins Waiting",
              value: data.checkIns.waitingCount,
              color: "text-white",
              note: data.checkIns.inReviewCount > 0 ? `${data.checkIns.inReviewCount} in review` : null,
              href: data.checkIns.waitingCount > 0 ? "/hq/check-ins" : null,
            },
            {
              label: "Workouts Today",
              value: data.workoutsCompletedToday,
              color: "text-[#C9A24D]",
              note: null,
              href: null,
            },
          ].map(({ label, value, color, note, href }) => {
            const inner = (
              <>
                <div className="h-px absolute top-0 inset-x-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                <p className={`text-3xl font-bold tabular-nums leading-none mb-2 ${color}`}>
                  {value}
                </p>
                <p className="text-[10px] text-white/50 uppercase tracking-[0.3em] font-semibold leading-relaxed">
                  {label}
                </p>
                {note && <p className="text-[10px] text-white/40 mt-1">{note}</p>}
              </>
            );
            return href ? (
              <Link
                key={label}
                href={href}
                className="bg-[#0d0e0f] border border-white/[0.06] px-5 py-5 relative overflow-hidden hover:border-white/[0.12] transition-colors block"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={label}
                className="bg-[#0d0e0f] border border-white/[0.06] px-5 py-5 relative overflow-hidden"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section B + C: Attention list + Activity ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* B: Clients requiring attention */}
        <section className="lg:col-span-2" aria-label="Clients requiring attention">
          <h2 className="text-[10px] text-white/60 uppercase tracking-[0.3em] font-semibold mb-3">
            Clients Requiring Attention
          </h2>
          {data.prioritizedClients.length === 0 ? (
            <div className="border border-dashed border-white/[0.06] px-5 py-8 text-center">
              <div className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] mx-auto mb-3">
                <Check size={16} className="text-white/40" />
              </div>
              <p className="text-white/60 text-sm font-medium">All clients on track</p>
              <p className="text-white/40 text-xs mt-1">No attention triggers at this time.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.prioritizedClients.map((client) => {
                // Same Severity value drives the dot, the reason chip, and
                // the compliance % below — a row can never show two colors
                // that disagree about how urgent it is.
                const severity = attentionSeverity(client.attentionLevel);
                return (
                <Link
                  key={client.userId}
                  href={`/hq/clients/${client.userId}`}
                  className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-3.5 flex items-center gap-4 hover:border-white/[0.12] hover:bg-[#101213] transition-colors block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/40"
                >
                  {/* Urgency dot */}
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[severity]}`}
                    aria-hidden
                  />

                  {/* Name + program */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-semibold">
                        {client.preferredName ?? client.fullName}
                      </span>
                      {client.activeProgramName ? (
                        <span className="text-white/50 text-[10px] truncate">
                          {client.activeProgramName}
                          {client.currentWeek !== null && client.totalWeeks !== null && (
                            <> · Wk {client.currentWeek}/{client.totalWeeks}</>
                          )}
                        </span>
                      ) : (
                        <span className="text-white/40 text-[10px]">No program</span>
                      )}
                    </div>
                    <p className="mt-0.5" aria-label="Reason for attention">
                      <StatusChip tone="dark" status={severity} label={client.attentionReason} size="sm" />
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0 hidden sm:block">
                    {client.compliancePct !== null ? (
                      <>
                        <p className={`text-sm font-bold tabular-nums ${SEVERITY_TEXT[severity]}`}>
                          {client.compliancePct}%
                        </p>
                        <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-semibold">
                          compliance
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-white/40">—</p>
                        <p className="text-[10px] text-white/25 uppercase tracking-[0.3em] font-semibold">
                          compliance
                        </p>
                      </>
                    )}
                  </div>

                  {/* Last workout */}
                  <div className="text-right shrink-0 hidden md:block">
                    <p className="text-xs text-white/60">
                      {fmtRelative(client.lastCompletedAt)}
                    </p>
                    <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-semibold">
                      last workout
                    </p>
                  </div>

                  <span className="text-white/40 text-xs shrink-0">→</span>
                </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* C: Recent activity */}
        <section aria-label="Recent activity">
          <h2 className="text-[10px] text-white/60 uppercase tracking-[0.3em] font-semibold mb-3">
            Recent Activity
          </h2>
          {data.recentActivity.length === 0 ? (
            <div className="border border-dashed border-white/[0.06] px-4 py-6 text-center">
              <div className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] mx-auto mb-3">
                <Activity size={16} className="text-white/40" />
              </div>
              <p className="text-white/40 text-xs">No recent activity.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.recentActivity.slice(0, 10).map((activity) => (
                <Link
                  key={activity.sessionId}
                  href={`/hq/clients/${activity.clientId}/history/${activity.sessionId}`}
                  className="bg-[#0d0e0f] border border-white/[0.05] px-3.5 py-3 flex items-start gap-3 hover:border-white/[0.10] hover:bg-[#101213] transition-colors block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/40"
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                      activity.status === "completed" ? "bg-emerald-400" : "bg-gray-600"
                    }`}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{activity.clientName}</p>
                    <p className="text-white/50 text-[10px] truncate">{activity.workoutName}</p>
                    {activity.status === "completed" && (
                      <p className="text-[#C9A24D] text-[10px] font-semibold">
                        {activity.completionPercent}%
                      </p>
                    )}
                    {activity.status === "skipped" && (
                      <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] font-semibold">
                        Skipped
                      </p>
                    )}
                  </div>
                  <p className="text-white/40 text-[10px] shrink-0 mt-0.5">
                    {fmtDate(activity.occurredAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Section D: Today's schedule ─────────────────────── */}
      <section aria-label="Today's schedule">
        <h2 className="text-[10px] text-white/60 uppercase tracking-[0.3em] font-semibold mb-3">
          Today&apos;s Schedule
        </h2>
        <div className="border border-dashed border-white/[0.06] px-5 py-6 text-center">
          <div className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] mx-auto mb-3">
            <CalendarDays size={16} className="text-white/40" />
          </div>
          <p className="text-white/50 text-sm font-medium">Schedule integration coming soon</p>
          <p className="text-white/40 text-xs mt-1">
            Calendar sync will surface coaching calls and client sessions here.
          </p>
        </div>
      </section>
    </div>
  );
}
