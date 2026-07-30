// Temporary dev preview — delete after visual QA
// Renders all 7 check-in page states without auth.

import Link from "next/link";

// ── Duplicated from portal page to avoid auth import at preview time ──

type CheckInPageState =
  | "coach_responded"
  | "first_ever"
  | "available"
  | "overdue"
  | "draft"
  | "submitted"
  | "in_review";

interface CheckInPresentation {
  headline: string;
  supportingCopy: string;
  ctaLabel: string;
  statusLabel?: string;
  tone: "neutral" | "supportive" | "ready";
}

const CHECK_IN_PRESENTATION: Record<CheckInPageState, CheckInPresentation> = {
  coach_responded: {
    headline: "Your latest coaching is ready.",
    supportingCopy:
      "Review your coach's feedback and use it to guide the week ahead.",
    ctaLabel: "View Feedback",
    statusLabel: "Feedback Ready",
    tone: "ready",
  },
  first_ever: {
    headline: "Let's start with this week.",
    supportingCopy:
      "Your first check-in gives your coach a clearer picture of where you are and what support you need.",
    ctaLabel: "Start Check-In",
    tone: "supportive",
  },
  available: {
    headline: "How did this week go?",
    supportingCopy:
      "Take a few minutes to reflect on your week. Your coach reads every check-in and uses it to guide what comes next.",
    ctaLabel: "Start Check-In",
    tone: "neutral",
  },
  overdue: {
    headline: "You can still check in.",
    supportingCopy:
      "An honest update — even if the week did not go as planned — gives your coach what they need to help you move forward.",
    ctaLabel: "Start Check-In",
    tone: "supportive",
  },
  draft: {
    headline: "Pick up where you left off.",
    supportingCopy: "Your answers are saved. Finish when you are ready.",
    ctaLabel: "Continue Check-In",
    statusLabel: "Draft saved",
    tone: "neutral",
  },
  submitted: {
    headline: "Your check-in is ready for your coach.",
    supportingCopy: "",
    ctaLabel: "View Check-In",
    statusLabel: "Submitted",
    tone: "neutral",
  },
  in_review: {
    headline: "Your coach is reviewing your check-in.",
    supportingCopy: "",
    ctaLabel: "View Check-In",
    statusLabel: "In Review",
    tone: "neutral",
  },
};

const HISTORY_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  reviewed: "Feedback Ready",
};
const HISTORY_STATUS_COLOR: Record<string, string> = {
  draft: "text-white/30 border-white/10",
  submitted: "text-blue-400/70 border-blue-500/20",
  in_review: "text-amber-400/70 border-amber-500/20",
  reviewed: "text-emerald-400/70 border-emerald-500/20",
};

// ── Fake dates ──
const WEEK_OF = "July 14";
const DUE = "Wednesday, Jul 16";
const SUBMITTED_DATE = "Jul 14";
const NEXT_CHECK_IN = "Sunday, Jul 20";

const PAST_HISTORY = [
  { id: "h1", weekStartDate: "2026-06-30", weekLabel: "Jun 30", submittedAt: "Jun 30", status: "reviewed", hasCoachResponse: true },
  { id: "h2", weekStartDate: "2026-06-23", weekLabel: "Jun 23", submittedAt: "Jun 23", status: "reviewed", hasCoachResponse: false },
  { id: "h3", weekStartDate: "2026-06-16", weekLabel: "Jun 16", submittedAt: null,     status: "draft",    hasCoachResponse: false },
];

// ── Preview shell ──
function PreviewShell({ label, state }: { label: string; state: CheckInPageState }) {
  const p = CHECK_IN_PRESENTATION[state];
  return (
    <section className="border border-white/[0.06] rounded-lg p-8 bg-[#0a0b0c]">
      <p className="text-[9px] text-[#C9A24D]/60 uppercase tracking-[0.45em] mb-6">
        State: {label}
      </p>

      {/* eyebrow */}
      <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-4">
        Check-Ins
      </p>

      {/* Status chip */}
      {p.statusLabel && (
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] ${
              state === "coach_responded"
                ? "text-emerald-400/70 border-emerald-500/20"
                : state === "in_review"
                  ? "text-amber-400/70 border-amber-500/20"
                  : state === "submitted"
                    ? "text-blue-400/70 border-blue-500/20"
                    : "text-white/28 border-white/10"
            }`}
          >
            {p.statusLabel}
          </span>
        </div>
      )}

      {/* Headline */}
      <h1
        className="text-white font-bold leading-tight mb-2"
        style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}
      >
        {p.headline}
      </h1>

      {/* Context line */}
      {(state === "available" || state === "first_ever" || state === "overdue" || state === "draft") && (
        <p className="text-white/35 text-sm mb-1">Week of {WEEK_OF}</p>
      )}
      {(state === "available" || state === "first_ever" || state === "overdue" || state === "draft") && (
        <p className="text-white/22 text-xs mb-6">
          Due {DUE}
          {state === "overdue" && (
            <span className="text-amber-400/80 ml-2">· Overdue</span>
          )}
        </p>
      )}
      {(state === "submitted" || state === "in_review") && (
        <>
          <p className="text-white/35 text-sm mb-1">Week of {WEEK_OF}</p>
          <p className="text-white/22 text-xs mb-1">Submitted {SUBMITTED_DATE}</p>
          <p className="text-white/15 text-xs mb-6">Next check-in opens {NEXT_CHECK_IN}</p>
        </>
      )}
      {state === "coach_responded" && (
        <p className="text-white/35 text-sm mb-1">Week of {WEEK_OF}</p>
      )}

      {/* Supporting copy */}
      {p.supportingCopy && (
        <p className="text-white/38 text-sm leading-relaxed max-w-sm mb-8">
          {p.supportingCopy}
        </p>
      )}
      {!p.supportingCopy && <div className="mb-8" />}

      {/* CTA */}
      {state === "coach_responded" && (
        <button className="inline-block bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 cursor-default">
          {p.ctaLabel}
        </button>
      )}
      {(state === "available" || state === "first_ever" || state === "overdue") && (
        <button className="inline-block bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 cursor-default">
          {p.ctaLabel}
        </button>
      )}
      {state === "draft" && (
        <button className="inline-block border border-[#c9a24d]/30 text-[#c9a24d] text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 cursor-default">
          {p.ctaLabel}
        </button>
      )}
      {(state === "submitted" || state === "in_review") && (
        <div className="flex items-center gap-4">
          <button className="inline-block border border-white/[0.10] text-white/45 text-[10px] font-medium uppercase tracking-[0.2em] px-5 py-2.5 cursor-default">
            {p.ctaLabel}
          </button>
          {state === "submitted" && (
            <span className="text-[10px] text-white/25 uppercase tracking-[0.2em]">
              Edit
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryPreview() {
  return (
    <section className="border border-white/[0.06] rounded-lg p-8 bg-[#0a0b0c]">
      <p className="text-[9px] text-[#C9A24D]/60 uppercase tracking-[0.45em] mb-6">
        History section labels
      </p>
      <p className="text-[9px] text-white/18 uppercase tracking-[0.45em] mb-4">
        History
      </p>
      <div className="divide-y divide-white/[0.04]">
        {PAST_HISTORY.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white/45 text-sm">Week of {c.weekLabel}</p>
              {c.submittedAt && (
                <p className="text-white/20 text-[10px] mt-0.5">
                  Submitted {c.submittedAt}
                </p>
              )}
            </div>
            {c.hasCoachResponse && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 shrink-0" />
            )}
            <span
              className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 ${HISTORY_STATUS_COLOR[c.status]}`}
            >
              {HISTORY_STATUS_LABEL[c.status]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DevPreviewCheckInsPage() {
  return (
    <div className="min-h-screen bg-[#0d0e0f] px-6 py-12 max-w-xl mx-auto space-y-8">
      <div className="mb-10">
        <p className="text-white/50 text-sm font-medium mb-1">
          Check-In List Page — State Preview
        </p>
        <p className="text-white/20 text-xs">
          All 7 states · No auth required · Delete after QA
        </p>
      </div>

      <PreviewShell label="first_ever" state="first_ever" />
      <PreviewShell label="available" state="available" />
      <PreviewShell label="overdue" state="overdue" />
      <PreviewShell label="draft" state="draft" />
      <PreviewShell label="submitted" state="submitted" />
      <PreviewShell label="in_review" state="in_review" />
      <PreviewShell label="coach_responded" state="coach_responded" />
      <HistoryPreview />
    </div>
  );
}
