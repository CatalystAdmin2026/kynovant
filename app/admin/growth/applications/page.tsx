// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Growth Applications Dashboard
//
// Server Component. Shows all Kynovant coach applications (submitted
// via /coach-apply), newest first, grouped into an active pipeline
// and a resolved (accepted/declined) history.
//
// Auth: app/admin/growth/layout.tsx (requireAdminPage) — admin-only,
// not reachable by an ordinary coach account. No secondary gate
// needed at this level; the mutating actions on the detail page
// re-validate independently (see [id]/actions.ts).
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import HQPageHeader from "@/components/hq/HQPageHeader";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { listApplications } from "@/lib/db/application-service";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  demo_scheduled: "Demo Scheduled",
  demo_complete: "Demo Complete",
  accepted: "Accepted",
  declined: "Declined",
};

const STATUS_COLOR: Record<string, string> = {
  new: "text-blue-400 border-blue-500/30",
  qualified: "text-sky-400 border-sky-500/30",
  demo_scheduled: "text-violet-400 border-violet-500/30",
  demo_complete: "text-amber-400 border-amber-500/30",
  accepted: "text-emerald-400 border-emerald-500/30",
  declined: "text-red-400 border-red-500/30",
};

const PIPELINE_STATUSES = new Set(["new", "qualified", "demo_scheduled", "demo_complete"]);

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function AdminGrowthApplicationsPage() {
  const all = await listApplications();

  const pipeline = all.filter((a) => PIPELINE_STATUSES.has(a.status));
  const resolved = all.filter((a) => !PIPELINE_STATUSES.has(a.status));
  const newCount = all.filter((a) => a.status === "new").length;

  return (
    <div className="space-y-6">
      <HQBreadcrumbs crumbs={[{ label: "Kynovant Admin" }, { label: "Applications" }]} />

      <HQPageHeader
        title="Coach Applications"
        subtitle={
          newCount === 0
            ? "No new applications waiting for triage."
            : `${newCount} new application${newCount === 1 ? "" : "s"} waiting for triage.`
        }
      />

      {pipeline.length === 0 ? (
        <div className="border border-dashed border-white/[0.06] px-5 py-10 text-center">
          <p className="text-gray-400 text-sm font-medium">No active applications</p>
          <p className="text-gray-600 text-xs mt-1">
            New submissions from /coach-apply will appear here.
          </p>
        </div>
      ) : (
        <section>
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.4em] mb-3">
            Active Pipeline
          </p>
          <div className="space-y-1.5">
            {pipeline.map((item) => (
              <Link
                key={item.id}
                href={`/admin/growth/applications/${item.id}`}
                className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-3.5 flex items-center gap-4 hover:border-white/[0.12] hover:bg-[#101213] transition-colors block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/40"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.status === "new" ? "bg-blue-400" : "bg-[#C9A24D]"
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {item.name}
                    {item.resubmissionCount > 0 && (
                      <span className="ml-2 text-[9px] text-amber-400/80 font-normal align-middle">
                        resubmitted ×{item.resubmissionCount}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-500 text-[10px] truncate">
                    {/* businessStage is only null for non-coach_apply rows, which
                        this list never returns (see listApplications) — the
                        fallback is defensive, not expected to render. */}
                    {item.businessStage ?? "—"} · via {item.referralSource}
                  </p>
                </div>

                <span
                  className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 hidden sm:inline ${STATUS_COLOR[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>

                <div className="text-right shrink-0 hidden md:block">
                  <p className="text-xs text-gray-400">{fmtDate(item.createdAt)}</p>
                  <p className="text-[9px] text-gray-600 uppercase tracking-[0.15em]">applied</p>
                </div>

                <span className="text-gray-600 text-xs shrink-0">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.4em] mb-3">
            Resolved
          </p>
          <div className="space-y-1.5">
            {resolved.slice(0, 30).map((item) => (
              <Link
                key={item.id}
                href={`/admin/growth/applications/${item.id}`}
                className="bg-[#0a0b0c] border border-white/[0.04] px-4 py-3 flex items-center gap-4 hover:border-white/[0.08] transition-colors block"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-sm truncate">{item.name}</p>
                  <p className="text-gray-600 text-[10px] truncate">{fmtDate(item.createdAt)}</p>
                </div>
                <span
                  className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 ${STATUS_COLOR[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="text-gray-700 text-xs shrink-0">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
