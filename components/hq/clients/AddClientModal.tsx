"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Add Client Modal
//
// The single client-invitation surface for HQ. Reused from the
// Clients page ("+ Add Client") and from the Get Started checklist
// — same component, same behavior, so there is exactly one place
// this logic lives.
//
// Collects first name, last name, and email only. Program selection
// and assignment are never part of this flow — they're optional
// follow-up actions a coach takes later from Programs or the
// client's own page. See app/api/internal/clients/route.ts: it
// invites the client via Supabase Auth Admin and creates their
// client_profiles row with role='client' from the on_auth_user_created
// trigger default. No promotion, no program logic, nothing else.
//
// All form/success state is local component state — nothing is
// persisted to localStorage/sessionStorage. Selecting "Invite
// another client" or closing the modal fully resets it, so there is
// no stale state to get stuck on between opens.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui";

interface CreatedClient {
  id: string;
  name: string;
  email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called once, right after a successful invite. */
  onCreated?: (client: CreatedClient) => void;
}

const EMPTY_FORM = { firstName: "", lastName: "", email: "" };

export default function AddClientModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClient | null>(null);

  const resetAll = useCallback(() => {
    setForm(EMPTY_FORM);
    setError(null);
    setCreated(null);
    setSubmitting(false);
  }, []);

  // Memoized: Modal's focus-trap effect no longer depends on onClose
  // (see components/ui/Modal.tsx), but keeping this stable is still
  // the correct, low-cost convention — matches
  // components/hq/workspace/AssignProgramModal.tsx's handleClose.
  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  function inviteAnother() {
    resetAll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();

    if (!firstName || !lastName || !email) {
      setError("First name, last name, and email are all required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // The invite API takes a single fullName field — combine here
      // rather than changing the API contract.
      const res = await fetch("/api/internal/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: `${firstName} ${lastName}`, email }),
      });
      const data = await res.json() as {
        ok: boolean;
        client?: { id: string; name: string; email: string };
        error?: string;
      };
      if (data.ok && data.client) {
        const client = data.client;
        setCreated(client);
        onCreated?.(client);
      } else {
        setError(data.error ?? "Could not invite that client.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-3.5 py-2.5 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors";
  const label = "block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={created ? "Client Invited" : "Add Client"}
      description={
        created
          ? undefined
          : "They'll get an email to set their password and open their portal. You can build out their profile and program later."
      }
      size="sm"
    >
      {created ? (
        <div className="text-center py-2">
          <div
            className="w-12 h-12 rounded-full bg-[#C9A24D]/15 border border-[#C9A24D]/40 flex items-center justify-center mx-auto mb-5"
            style={{ boxShadow: "0 0 32px rgba(201,162,77,0.2)" }}
          >
            <span className="text-[#C9A24D] text-xl">✓</span>
          </div>
          <p className="text-white text-sm font-semibold mb-1">{created.name}</p>
          <p className="text-gray-500 text-xs mb-7">Invite sent to {created.email}</p>

          <div className="flex flex-col gap-2.5">
            <Link
              href={`/hq/clients/${created.id}`}
              onClick={handleClose}
              className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3 hover:bg-[#D4B56A] transition-colors"
            >
              View Client
            </Link>
            <button
              onClick={inviteAnother}
              className="border border-white/10 text-white/70 font-bold text-[11px] tracking-[0.14em] uppercase py-3 hover:border-white/25 hover:text-white transition-colors"
            >
              Invite Another Client
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>First Name</label>
              <input
                className={input}
                placeholder="Alex"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div>
              <label className={label}>Last Name</label>
              <input
                className={input}
                placeholder="Johnson"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                disabled={submitting}
              />
            </div>
          </div>
          <div>
            <label className={label}>Email</label>
            <input
              type="email"
              className={input}
              placeholder="alex@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={submitting}
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase py-3.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50 mt-2"
          >
            {submitting ? "Sending invite…" : "Send Invite"}
          </button>
        </form>
      )}
    </Modal>
  );
}
