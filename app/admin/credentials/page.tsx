// ─────────────────────────────────────────────────────────────
// Kynovant Admin — RD/RDN Credential Review Queue
//
// Server Component. Auth via app/admin/credentials/layout.tsx
// (requireAdminPage) — admin-only.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import HQPageHeader from "@/components/hq/HQPageHeader";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { listCredentialsForReview } from "@/lib/db/coach-credential-service";
import { isExpired } from "@/lib/db/coach-credential-service";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { rd: "RD", rdn: "RDN" };

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string, expired: boolean): { label: string; cls: string } {
  if (status === "approved" && expired) {
    return { label: "Expired", cls: "text-amber-400 border-amber-500/30" };
  }
  if (status === "approved") return { label: "Approved", cls: "text-emerald-400 border-emerald-500/30" };
  if (status === "rejected") return { label: "Rejected", cls: "text-red-400 border-red-500/30" };
  return { label: "Pending", cls: "text-blue-400 border-blue-500/30" };
}

export default async function AdminCredentialsPage() {
  const all = await listCredentialsForReview();

  const pending = all.filter((c) => c.status === "pending");
  const reviewed = all.filter((c) => c.status !== "pending");

  return (
    <div className="space-y-6">
      <HQBreadcrumbs crumbs={[{ label: "Kynovant Admin" }, { label: "RD/RDN Credentials" }]} />

      <HQPageHeader
        title="RD/RDN Credentials"
        subtitle={
          pending.length === 0
            ? "No submissions waiting for review."
            : `${pending.length} submission${pending.length === 1 ? "" : "s"} waiting for review.`
        }
      />

      {pending.length === 0 ? (
        <div className="border border-dashed border-white/[0.06] px-5 py-10 text-center">
          <p className="text-gray-400 text-sm font-medium">No pending submissions</p>
          <p className="text-gray-600 text-xs mt-1">
            Submissions from Coach HQ → RD/RDN Verification will appear here.
          </p>
        </div>
      ) : (
        <section>
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.4em] mb-3">Pending Review</p>
          <div className="space-y-1.5">
            {pending.map((item) => (
              <Link
                key={item.id}
                href={`/admin/credentials/${item.id}`}
                className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-3.5 flex items-center gap-4 hover:border-white/[0.12] hover:bg-[#101213] transition-colors block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24D]/40"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {item.coachDisplayName ?? item.coachEmail}
                    {item.resubmissionCount > 0 && (
                      <span className="ml-2 text-[9px] text-amber-400/80 font-normal align-middle">
                        resubmitted ×{item.resubmissionCount}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-500 text-[10px] truncate">
                    {TYPE_LABEL[item.credentialType]} · {item.issuingState} · #{item.licenseNumber}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden md:block">
                  <p className="text-xs text-gray-400">{fmtDate(item.submittedAt)}</p>
                  <p className="text-[9px] text-gray-600 uppercase tracking-[0.15em]">submitted</p>
                </div>
                <span className="text-gray-600 text-xs shrink-0">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.4em] mb-3">Reviewed</p>
          <div className="space-y-1.5">
            {reviewed.slice(0, 50).map((item) => {
              const badge = statusBadge(item.status, item.status === "approved" && isExpired(item.expirationDate));
              return (
                <Link
                  key={item.id}
                  href={`/admin/credentials/${item.id}`}
                  className="bg-[#0a0b0c] border border-white/[0.04] px-4 py-3 flex items-center gap-4 hover:border-white/[0.08] transition-colors block"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-sm truncate">{item.coachDisplayName ?? item.coachEmail}</p>
                    <p className="text-gray-600 text-[10px] truncate">
                      {TYPE_LABEL[item.credentialType]} · reviewed {item.reviewedAt ? fmtDate(item.reviewedAt) : "—"}
                    </p>
                  </div>
                  <span className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-gray-700 text-xs shrink-0">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
