import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireOverwatchAdminPage } from "@/lib/auth/guards";
import { getOverwatchCoachDetail } from "@/lib/db/overwatch-service";
import ComplimentaryAccessControl from "@/components/overwatch/ComplimentaryAccessControl";

export const dynamic = "force-dynamic";

function labelize(value: string | null | undefined): string {
  if (!value) return "None";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtDate(date: Date | null): string {
  if (!date) return "None";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

// Account detail surface for founder/admin management actions —
// currently just Grant/Revoke Complimentary Access (Phase 4 of the
// complimentary-access feature). Deliberately read-mostly: this page
// does not let an admin edit unrelated client/coach data — the ONLY
// mutation reachable from here is the complimentary-access grant/revoke
// pair, both admin-only and both requiring their own explicit
// confirmation (see ComplimentaryAccessControl).
export default async function OverwatchAccountDetailPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  await requireOverwatchAdminPage();
  const { coachId } = await params;
  const coach = await getOverwatchCoachDetail(coachId);

  if (!coach) notFound();

  return (
    <main className="min-h-screen bg-[#080909] text-[#F3F1EA]">
      <header className="border-b border-white/[0.07] bg-[#080909]/95">
        <div className="mx-auto flex max-w-[900px] items-center gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/overwatch"
            className="flex h-8 w-8 items-center justify-center border border-white/[0.08] text-white/45 hover:border-white/[0.16] hover:text-white/70 transition-colors"
            aria-label="Back to Overwatch"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center border border-[#C9A24D]/30 bg-[#C9A24D]/10 text-[#D8B867]">
            <ShieldCheck size={16} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-[#D8B867]/80">Overwatch</p>
            <p className="text-[11px] text-white/34">Account detail</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] space-y-6 px-5 py-7 sm:px-8">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Account</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{coach.displayName ?? "Unnamed coach"}</h1>
          <p className="mt-1 text-sm text-white/42">{coach.email}</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Account Status</p>
            <p className="mt-2 text-sm text-white">{labelize(coach.accountStatus)}</p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Subscription</p>
            <p className="mt-2 text-sm text-white">{labelize(coach.subscriptionStatus)}</p>
          </div>
          <div className="border border-white/[0.08] bg-[#101113] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/34">Joined</p>
            <p className="mt-2 text-sm text-white">{fmtDate(coach.createdAt)}</p>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Complimentary Access</p>
          <ComplimentaryAccessControl
            coachId={coach.id}
            active={
              coach.activeComplimentary
                ? {
                    grantedAt: coach.activeComplimentary.grantedAt.toISOString(),
                    expiresAt: coach.activeComplimentary.expiresAt?.toISOString() ?? null,
                    reason: coach.activeComplimentary.reason,
                    expiringSoon: coach.activeComplimentary.expiringSoon,
                  }
                : null
            }
          />
        </section>

        {coach.complimentaryHistory.length > 0 && (
          <section>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D8B867]/62">Grant History</p>
            <div className="border border-white/[0.08] bg-[#101113] divide-y divide-white/[0.045]">
              {coach.complimentaryHistory.map((h) => (
                <div key={h.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-white/70">{labelize(h.status)}</span>
                    <span className="text-[11px] text-white/30">{fmtDate(h.grantedAt)}</span>
                  </div>
                  {h.reason && <p className="mt-1 text-xs text-white/40">{h.reason}</p>}
                  {h.revokedAt && <p className="mt-1 text-[11px] text-white/30">Ended {fmtDate(h.revokedAt)}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
