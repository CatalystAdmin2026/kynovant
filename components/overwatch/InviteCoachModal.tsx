"use client";

// ─────────────────────────────────────────────────────────────
// Overwatch — Invite Coach Modal
//
// Founder/operator action, not an analytics surface. Mirrors
// components/hq/clients/AddClientModal.tsx's exact shape (local-only
// form/success state, "invite another" reset, Modal primitive) — same
// established pattern, different endpoint
// (/api/internal/overwatch/invite-coach, admin-only server-side).
//
// Minimum fields only: first name + email. No last name field — the
// existing signup architecture (provisionInvitedCoach) takes a single
// displayName string, same as the self-service flow's own name field.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

type InviteResult =
  | { kind: "sent" }
  | { kind: "already_invited" }
  | { kind: "already_active" }
  | { kind: "email_failed" };

const EMPTY_FORM = { firstName: "", email: "" };

function resultCopy(result: InviteResult): { title: string; body: string } {
  switch (result.kind) {
    case "sent":
      return { title: "Invitation Sent", body: "They'll get a Kynovant email with a secure link to get started." };
    case "already_invited":
      return {
        title: "Already Invited",
        body: "This person already has a pending Kynovant invite — ask them to check their inbox, or follow up directly.",
      };
    case "already_active":
      return {
        title: "Already on Kynovant",
        body: "This email already belongs to an active Kynovant account — no new invite was sent.",
      };
    case "email_failed":
      return {
        title: "Account Created — Email Failed",
        body: "The invitation exists, but we couldn't send the email. Retry delivery now or try again later.",
      };
  }
}

export default function InviteCoachModal({ open, onClose }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const resetAll = useCallback(() => {
    setForm(EMPTY_FORM);
    setError(null);
    setResult(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  function inviteAnother() {
    resetAll();
  }

  async function submitInvite() {
    const firstName = form.firstName.trim();
    const email = form.email.trim();

    if (!firstName || !email) {
      setError("First name and email are both required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/overwatch/invite-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok: boolean;
        status?: string;
        error?: string;
      };

      if (data.ok && data.status === "sent") {
        setResult({ kind: "sent" });
      } else if (data.ok && data.status === "already_invited") {
        setResult({ kind: "already_invited" });
      } else if (data.ok && data.status === "already_active") {
        setResult({ kind: "already_active" });
      } else if (!data.ok && data.status === "email_failed") {
        setResult({ kind: "email_failed" });
      } else {
        // Never surfaces raw exception/database text — always the
        // server's own user-facing message, or a generic fallback.
        setError(data.error ?? "Couldn't send that invitation. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitInvite();
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-3.5 py-3 text-white text-base sm:text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors";
  const label = "block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={result ? resultCopy(result).title : "Invite Coach"}
      description={result ? undefined : "Send a Kynovant invitation directly to a trainer or coach."}
      size="sm"
    >
      {result ? (
        <div className="text-center py-2">
          <div
            className="w-12 h-12 rounded-full bg-[#C9A24D]/15 border border-[#C9A24D]/40 flex items-center justify-center mx-auto mb-5"
            style={{ boxShadow: "0 0 32px rgba(201,162,77,0.2)" }}
          >
            <span className="text-[#C9A24D] text-xl">
              {result.kind === "sent" ? "✓" : result.kind === "email_failed" ? "!" : "•"}
            </span>
          </div>
          <p className="text-white text-sm font-semibold mb-1">{form.firstName || "Invitation"}</p>
          <p className="text-gray-500 text-xs mb-6 leading-relaxed">{resultCopy(result).body}</p>

          <div className="flex flex-col gap-2.5">
            {result.kind === "email_failed" && (
              <button
                onClick={() => {
                  setResult(null);
                  void submitInvite();
                }}
                disabled={submitting}
                className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
              >
                Retry Invitation
              </button>
            )}
            <button
              onClick={inviteAnother}
              className={result.kind === "email_failed"
                ? "text-gray-500 hover:text-gray-300 text-[11px] tracking-[0.1em] uppercase py-2 transition-colors"
                : "bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors"}
            >
              Invite Another Coach
            </button>
            <button
              onClick={handleClose}
              className="text-gray-600 hover:text-gray-400 text-[11px] tracking-[0.1em] uppercase py-2 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={label}>First Name</label>
            <input
              className={input}
              placeholder="Alex"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              disabled={submitting}
              autoFocus
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className={label}>Email</label>
            <input
              type="email"
              inputMode="email"
              className={input}
              placeholder="alex@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={submitting}
              autoComplete="email"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50 mt-2"
          >
            {submitting ? "Sending…" : "Send Invitation"}
          </button>
        </form>
      )}
    </Modal>
  );
}
