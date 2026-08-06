"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Check-In Review Panel
//
// Client Component. Handles coach response drafting and all
// status-transition actions for a single check-in.
//
// Rendered by: app/hq/check-ins/[checkInId]/page.tsx
// ─────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import {
  startReviewAction,
  saveDraftResponseAction,
  markReviewedAction,
  reopenCheckInAction,
} from "@/app/hq/check-ins/[checkInId]/actions";
import { Button, Card, Badge, Textarea, Label } from "@/components/ui";

interface Props {
  checkInId: string;
  status: string;
  clientName: string;
  initialResponse: string | null;
}

export default function CheckInReviewPanel({
  checkInId,
  status,
  clientName,
  initialResponse,
}: Props) {
  const [response, setResponse] = useState(initialResponse ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);

  const [isPendingStart, startStartTx] = useTransition();
  const [isPendingSaveDraft, startSaveDraftTx] = useTransition();
  const [isPendingMarkReviewed, startMarkReviewedTx] = useTransition();
  const [isPendingReopen, startReopenTx] = useTransition();

  function clearError() {
    setActionError(null);
  }

  function handleStartReview() {
    clearError();
    startStartTx(async () => {
      const result = await startReviewAction(checkInId);
      if (result.ok) {
        setCurrentStatus("in_review");
      } else {
        setActionError(result.error ?? "Failed to start review.");
      }
    });
  }

  function handleSaveDraft() {
    clearError();
    startSaveDraftTx(async () => {
      const result = await saveDraftResponseAction(checkInId, response);
      if (result.ok) {
        setSavedAt(new Date());
      } else {
        setActionError(result.error ?? "Failed to save draft.");
      }
    });
  }

  function handleMarkReviewed() {
    clearError();
    startMarkReviewedTx(async () => {
      const result = await markReviewedAction(checkInId, response);
      if (result.ok) {
        setCurrentStatus("reviewed");
        setSavedAt(new Date());
      } else {
        setActionError(result.error ?? "Failed to mark as reviewed.");
      }
    });
  }

  // "Update Response" on an already-reviewed check-in must NOT call
  // markReviewedAction — that hard-rejects anything not currently
  // "in_review" (see lib/db/coach-check-in-service.ts's
  // markCheckInReviewed), so wiring it there guaranteed the button
  // failed on every click with "This check-in has already been
  // reviewed." saveDraftResponseAction is the one already documented
  // as valid for both in_review and reviewed — it just doesn't
  // transition status, which is exactly right here (the check-in stays
  // "reviewed", only the response text changes).
  function handleUpdateResponse() {
    clearError();
    startSaveDraftTx(async () => {
      const result = await saveDraftResponseAction(checkInId, response);
      if (result.ok) {
        setSavedAt(new Date());
      } else {
        setActionError(result.error ?? "Failed to update response.");
      }
    });
  }

  function handleReopen() {
    clearError();
    startReopenTx(async () => {
      const result = await reopenCheckInAction(checkInId);
      if (result.ok) {
        setCurrentStatus("in_review");
      } else {
        setActionError(result.error ?? "Failed to reopen check-in.");
      }
    });
  }

  const isAnyPending =
    isPendingStart ||
    isPendingSaveDraft ||
    isPendingMarkReviewed ||
    isPendingReopen;

  const responseFieldId = `coach-response-${checkInId}`;

  return (
    <div className="space-y-4">
      {/* Start Review CTA — a neutral "next step ready" prompt, not
          an outcome/status, so it stays outside the emerald/red
          outcome-color vocabulary used elsewhere in this panel. */}
      {currentStatus === "submitted" && (
        <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-5 py-4">
          <p className="text-white/70 text-sm font-medium mb-1">
            Ready to review {clientName}&apos;s check-in?
          </p>
          <p className="text-white/40 text-xs mb-3">
            Starting review marks it as &quot;in review&quot; and lets you write a response.
          </p>
          <Button
            type="button"
            variant="primary"
            tone="dark"
            onClick={handleStartReview}
            disabled={isAnyPending}
            loading={isPendingStart}
          >
            Start Review
          </Button>
        </div>
      )}

      {/* Response editor */}
      {(currentStatus === "in_review" || currentStatus === "reviewed") && (
        <Card tone="dark" padding="md">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Label htmlFor={responseFieldId} tone="dark" className="mb-0">
              Response to {clientName}
            </Label>
            {currentStatus === "reviewed" && (
              <Badge tone="dark" variant="success" size="sm">
                Reviewed
              </Badge>
            )}
          </div>

          <Textarea
            id={responseFieldId}
            tone="dark"
            value={response}
            onChange={(e) => {
              setResponse(e.target.value);
              setSavedAt(null);
            }}
            placeholder={`Write your response to ${clientName}…`}
            rows={8}
            className="leading-relaxed"
          />

          {/* Save status */}
          <div className="text-[10px] text-white/30 h-4 mt-2">
            {isPendingSaveDraft && <span>Saving draft…</span>}
            {!isPendingSaveDraft && savedAt && (
              <span>
                Saved at{" "}
                {savedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-3">
            {currentStatus === "in_review" && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  tone="dark"
                  onClick={handleMarkReviewed}
                  disabled={isAnyPending}
                  loading={isPendingMarkReviewed}
                >
                  Mark Reviewed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  tone="dark"
                  onClick={handleSaveDraft}
                  disabled={isAnyPending}
                  loading={isPendingSaveDraft}
                >
                  Save Draft
                </Button>
              </>
            )}
            {currentStatus === "reviewed" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  tone="dark"
                  onClick={handleUpdateResponse}
                  disabled={isAnyPending}
                  loading={isPendingSaveDraft}
                >
                  Update Response
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  tone="dark"
                  onClick={handleReopen}
                  disabled={isAnyPending}
                  loading={isPendingReopen}
                >
                  Reopen
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Error state */}
      {actionError && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3" role="alert">
          <p className="text-red-400 text-xs">{actionError}</p>
          <button
            type="button"
            onClick={clearError}
            className="text-[10px] text-red-400/60 hover:text-red-400 mt-1 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
