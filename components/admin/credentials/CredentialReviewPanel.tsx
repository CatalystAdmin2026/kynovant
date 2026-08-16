"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewCredentialAction } from "@/app/admin/credentials/[id]/actions";
import type { CoachCredentialStatus } from "@/lib/db/schema-coach-credentials";

export default function CredentialReviewPanel({
  credentialId,
  status,
  initialNotes,
}: {
  credentialId: string;
  status: CoachCredentialStatus;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDecision(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewCredentialAction(credentialId, decision, notes);
      if (!result.ok) {
        setError(result.error ?? "Failed to save review.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-semibold mb-2">
          Current Status
        </p>
        <p className="text-sm text-white/80 capitalize">{status}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-semibold">
          Review Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Shown to the coach if you reject this submission — e.g. what's missing or unclear."
          className="w-full bg-[#141618] border border-white/8 px-4 py-3 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors"
        />
        <p className="text-[10px] text-gray-600">
          Visible to the coach — this is not an internal-only note.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("approved")}
          className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold tracking-[0.08em] uppercase hover:bg-emerald-500 transition-colors disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleDecision("rejected")}
          className="border border-red-500/30 text-red-400 px-4 py-2.5 text-xs font-bold tracking-[0.08em] uppercase hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
