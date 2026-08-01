"use client";

import { useState, useEffect } from "react";
import AdminGate from "@/components/AdminGate";

interface CoachRow {
  id: string;
  email: string;
  role: "coach" | "admin";
  status: "invited" | "active" | "suspended" | "archived";
  createdAt: string;
  displayName: string | null;
}

function statusCls(s: string) {
  if (s === "active") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (s === "invited") return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
}

export default function AdminCoachesPage() {
  return (
    <AdminGate>
      <CoachesInner />
    </AdminGate>
  );
}

function CoachesInner() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", displayName: "" });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  function loadCoaches() {
    setLoading(true);
    fetch("/api/admin/coaches")
      .then((r) => r.json())
      .then((data: { ok: boolean; coaches?: CoachRow[]; error?: string }) => {
        if (data.ok && data.coaches) setCoaches(data.coaches);
        else setError(data.error ?? "Failed to load");
        setLoading(false);
      })
      .catch(() => { setError("Network error"); setLoading(false); });
  }

  useEffect(loadCoaches, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (!form.email.trim() || !form.displayName.trim()) {
      setInviteError("Email and name are required.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          displayName: form.displayName.trim(),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setInviteSuccess(`Invite sent to ${form.email.trim()}.`);
        setForm({ email: "", displayName: "" });
        loadCoaches();
      } else {
        setInviteError(data.error ?? "Failed to send invite");
      }
    } catch {
      setInviteError("Network error");
    } finally {
      setInviting(false);
    }
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-3.5 py-2.5 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors";

  return (
    <div className="min-h-screen bg-[#080909] px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.4em] uppercase mb-2">
          Founding Coach Program
        </p>
        <h1 className="font-headline text-3xl font-bold uppercase text-white mb-1">
          Invite a Coach
        </h1>
        <p className="text-gray-500 text-sm mb-10">
          Grants coach-level HQ access. The invited coach receives an email to set their password and land in HQ.
        </p>

        {/* Invite form */}
        <form
          onSubmit={handleInvite}
          className="bg-[#0c0e0f] border border-white/5 p-6 mb-12 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end"
        >
          <div>
            <label className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2">
              Coach Name
            </label>
            <input
              className={input}
              placeholder="Jane Smith"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              disabled={inviting}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2">
              Email
            </label>
            <input
              type="email"
              className={input}
              placeholder="jane@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={inviting}
            />
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.14em] uppercase px-6 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {inviting ? "Sending…" : "Send Invite"}
          </button>

          {inviteError && (
            <p className="sm:col-span-3 text-red-400 text-xs">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="sm:col-span-3 text-emerald-400 text-xs">{inviteSuccess}</p>
          )}
        </form>

        {/* Roster */}
        <h2 className="text-[10px] text-gray-400 uppercase tracking-[0.4em] font-semibold mb-4">
          Coaches &amp; Admins
        </h2>

        {loading ? (
          <p className="text-gray-600 text-sm">Loading…</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : coaches.length === 0 ? (
          <div className="border border-dashed border-white/[0.06] px-5 py-8 text-center">
            <p className="text-gray-500 text-sm">No coaches invited yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {coaches.map((c) => (
              <div
                key={c.id}
                className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-3.5 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {c.displayName ?? c.email}
                  </p>
                  <p className="text-gray-500 text-xs truncate">{c.email}</p>
                </div>
                <span className="text-gray-600 text-[10px] uppercase tracking-[0.15em] shrink-0">
                  {c.role}
                </span>
                <span className={`text-[10px] uppercase tracking-[0.1em] px-2 py-1 shrink-0 ${statusCls(c.status)}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-gray-700 text-[11px] leading-relaxed mt-10 max-w-lg">
          Data isolation between coach accounts is not yet enforced at the
          query layer (tracked separately) — every invited coach can
          currently see every client and program on the platform. Treat this
          invite tool as provisioning for a trusted, small Founding Coach
          cohort until that lands.
        </p>
      </div>
    </div>
  );
}
