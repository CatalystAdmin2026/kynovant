"use client";

// Overwatch — Grant/Revoke Complimentary Access
//
// Client control for app/overwatch/accounts/[coachId]/page.tsx. Mirrors
// InviteCoachModal's self-contained local-state shape. Revocation
// requires an explicit two-step confirmation (Modal primitive) — never
// a single click — per the product requirement that this must not be a
// hidden, one-click, easy-to-fat-finger admin action.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";

interface Props {
  coachId: string;
  active: {
    grantedAt: string;
    expiresAt: string | null;
    reason: string | null;
    expiringSoon: boolean;
  } | null;
}

export default function ComplimentaryAccessControl({ coachId, active }: Props) {
  const router = useRouter();
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitGrant() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/overwatch/coaches/${coachId}/complimentary/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Couldn't grant complimentary access.");
        return;
      }
      setGrantOpen(false);
      setReason("");
      setExpiresAt("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRevoke() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/overwatch/coaches/${coachId}/complimentary/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Couldn't revoke complimentary access.");
        return;
      }
      setRevokeOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-3.5 py-3 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors";
  const label = "block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2";

  if (active) {
    return (
      <>
        <div className="border border-[#C9A24D]/25 bg-[#C9A24D]/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E3C778]">Complimentary Access — Active</p>
            {active.expiringSoon && (
              <span className="border border-amber-300/25 bg-amber-300/[0.07] px-2 py-1 text-[10px] text-amber-100">Expiring</span>
            )}
          </div>
          <p className="mt-2 text-xs text-white/50">
            Granted {new Date(active.grantedAt).toLocaleDateString()}
            {active.expiresAt ? ` · expires ${new Date(active.expiresAt).toLocaleDateString()}` : " · no expiration"}
          </p>
          {active.reason && <p className="mt-1 text-xs text-white/40">{active.reason}</p>}
          <button
            type="button"
            onClick={() => setRevokeOpen(true)}
            className="mt-4 border border-red-300/25 bg-red-300/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-300/[0.12] transition-colors"
          >
            Revoke Complimentary Access
          </button>
        </div>

        <Modal
          open={revokeOpen}
          onClose={() => {
            setRevokeOpen(false);
            setError(null);
            setReason("");
          }}
          title="Revoke Complimentary Access"
          description="This coach will lose HQ access immediately unless they have a separate valid subscription."
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className={label}>Reason (optional, founder-facing only)</label>
              <textarea
                className={input}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void submitRevoke()}
                disabled={submitting}
                className="bg-red-400 text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-red-300 transition-colors disabled:opacity-50"
              >
                {submitting ? "Revoking…" : "Confirm Revoke"}
              </button>
              <button
                type="button"
                onClick={() => setRevokeOpen(false)}
                disabled={submitting}
                className="text-gray-500 hover:text-gray-300 text-[11px] tracking-[0.1em] uppercase py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <>
      <div className="border border-white/[0.08] bg-white/[0.02] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Complimentary Access — None</p>
        <p className="mt-2 text-xs text-white/40">Full Coach HQ access without billing. Can be revoked later.</p>
        <button
          type="button"
          onClick={() => setGrantOpen(true)}
          className="mt-4 border border-[#C9A24D]/40 bg-[#C9A24D]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E3C778] hover:bg-[#C9A24D]/20 transition-colors"
        >
          Grant Complimentary Access
        </button>
      </div>

      <Modal
        open={grantOpen}
        onClose={() => {
          setGrantOpen(false);
          setError(null);
          setReason("");
          setExpiresAt("");
        }}
        title="Grant Complimentary Access"
        description="Full Coach HQ access without billing. Can be revoked later."
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className={label}>Reason (optional, founder-facing only)</label>
            <textarea
              className={input}
              rows={3}
              placeholder="Strategic partner, ambassador, beta coach…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label className={label}>Expiration (optional — leave blank for lifetime access)</label>
            <input
              type="date"
              className={input}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={submitting}
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="button"
            onClick={() => void submitGrant()}
            disabled={submitting}
            className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
          >
            {submitting ? "Granting…" : "Grant Access"}
          </button>
        </div>
      </Modal>
    </>
  );
}
