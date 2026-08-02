"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateApplicationStatusAction,
  saveApplicationNotesAction,
} from "@/app/admin/growth/applications/[id]/actions";
import type { ApplicationStatus } from "@/lib/db/schema-applications";

const STAGE_ORDER: ApplicationStatus[] = [
  "new",
  "qualified",
  "demo_scheduled",
  "demo_complete",
  "accepted",
];

const ADVANCE_LABEL: Record<ApplicationStatus, string> = {
  new: "Mark Qualified",
  qualified: "Schedule Demo",
  demo_scheduled: "Mark Demo Complete",
  demo_complete: "Accept Application",
  accepted: "",
  declined: "",
};

function nextStage(current: ApplicationStatus): ApplicationStatus | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

export default function ApplicationReviewPanel({
  applicationId,
  status,
  initialNotes,
}: {
  applicationId: string;
  status: ApplicationStatus;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);

  const isTerminal = status === "accepted" || status === "declined";
  const advanceTo = nextStage(status);

  function handleStatusChange(newStatus: ApplicationStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateApplicationStatusAction(applicationId, newStatus);
      if (!result.ok) {
        setError(result.error ?? "Failed to update status.");
        return;
      }
      router.refresh();
    });
  }

  function handleSaveNotes() {
    setError(null);
    setNotesSaved(false);
    startTransition(async () => {
      const result = await saveApplicationNotesAction(applicationId, notes);
      if (!result.ok) {
        setError(result.error ?? "Failed to save notes.");
        return;
      }
      setNotesSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status transitions */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {advanceTo && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange(advanceTo)}
              className="bg-[#C9A24D] text-black px-4 py-2.5 text-xs font-bold tracking-[0.08em] uppercase hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
            >
              {ADVANCE_LABEL[status]}
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleStatusChange("declined")}
            className="border border-red-500/30 text-red-400 px-4 py-2.5 text-xs font-bold tracking-[0.08em] uppercase hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}

      {isTerminal && (
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">
          Application closed — {status === "accepted" ? "accepted" : "declined"}.
        </p>
      )}

      {/* Review notes */}
      <div className="flex flex-col gap-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-semibold">
          Staff Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
          rows={4}
          placeholder="Internal notes — not visible to the applicant."
          className="w-full bg-[#141618] border border-white/8 px-4 py-3 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveNotes}
            className="self-start border border-white/10 text-white/70 px-3.5 py-2 text-[11px] font-semibold tracking-[0.06em] uppercase hover:border-white/20 hover:text-white transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Notes"}
          </button>
          {notesSaved && !isPending && (
            <span className="text-emerald-400 text-[11px]">Saved</span>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
