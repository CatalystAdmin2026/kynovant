import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import {
  getCurrentCheckInWindow,
  listClientCheckIns,
} from "@/lib/db/check-in-service";
import PortalShell from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// STATE → PRESENTATION MAPPING
//
// All client-facing copy lives here. Edit this record to change
// language for any state without touching JSX or data logic.
//
// coach_responded  — reviewed check-in with coach response ready
// first_ever       — no check-in history at all; first invitation
// available        — current window open, not yet started
// overdue          — window open, past due date, not yet started
// draft            — started but not submitted
// submitted        — submitted, not yet in coach's hands
// in_review        — coach has opened it
// ─────────────────────────────────────────────────────────────

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

function determineCheckInState(
  currentWeekCheckIn:
    | { status: string; hasCoachResponse: boolean }
    | null
    | undefined,
  isOverdue: boolean,
  isFirstEver: boolean,
): CheckInPageState {
  if (!currentWeekCheckIn) {
    if (isFirstEver) return "first_ever";
    if (isOverdue) return "overdue";
    return "available";
  }
  if (
    currentWeekCheckIn.hasCoachResponse &&
    (currentWeekCheckIn.status === "reviewed" ||
      currentWeekCheckIn.status === "in_review")
  ) {
    return "coach_responded";
  }
  if (currentWeekCheckIn.status === "draft") return "draft";
  if (currentWeekCheckIn.status === "in_review") return "in_review";
  // submitted, reviewed-without-response, or any unknown status
  return "submitted";
}

// ─────────────────────────────────────────────────────────────
// HISTORY STATUS LABELS
//
// "Feedback Ready" replaces "Reviewed" in client-facing history.
// Internal DB status names are unchanged.
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────

function fmtWeek(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function CheckInsPage() {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") redirect("/admin");

  const profile = await getClientProfile(dbUser.id);
  const clientName = profile?.preferredName ?? profile?.fullName ?? "Client";

  const [window_, history] = await Promise.all([
    getCurrentCheckInWindow(dbUser.id),
    listClientCheckIns(dbUser.id),
  ]);

  const currentWeekCheckIn = window_.existingCheckIn;
  const pastCheckIns = history.filter(
    (c) => c.weekStartDate < window_.weekStartDate,
  );

  const dueDateLabel = new Date(
    window_.dueDate + "T12:00:00",
  ).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const nextWeekStart = new Date(window_.weekEndDate + "T12:00:00");
  nextWeekStart.setDate(nextWeekStart.getDate() + 1);
  const nextCheckInLabel = nextWeekStart.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const isFirstEver = !currentWeekCheckIn && pastCheckIns.length === 0;
  const state = determineCheckInState(
    currentWeekCheckIn,
    window_.isOverdue,
    isFirstEver,
  );
  const presentation = CHECK_IN_PRESENTATION[state];

  return (
    <PortalShell clientName={clientName}>

      {/* ── CURRENT WEEK ── */}
      <section aria-label="This week's check-in">

        <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-4">
          Check-Ins
        </p>

        {/* Status chip — draft, submitted, in_review, feedback ready */}
        {presentation.statusLabel && (
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
              {presentation.statusLabel}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1
          className="text-white font-bold leading-tight mb-2"
          style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}
        >
          {presentation.headline}
        </h1>

        {/* Week + due-date context */}
        {(state === "available" ||
          state === "first_ever" ||
          state === "overdue" ||
          state === "draft") && (
          <p className="text-white/35 text-sm mb-1">
            Week of {fmtWeek(window_.weekStartDate)}
          </p>
        )}

        {(state === "available" ||
          state === "first_ever" ||
          state === "overdue") && (
          <p className="text-white/22 text-xs mb-6">
            Due {dueDateLabel}
            {window_.isOverdue && (
              <span className="text-amber-400/80 ml-2">· Overdue</span>
            )}
          </p>
        )}

        {state === "draft" && (
          <p className="text-white/22 text-xs mb-6">
            Due {dueDateLabel}
            {window_.isOverdue && (
              <span className="text-amber-400/80 ml-2">· Overdue</span>
            )}
          </p>
        )}

        {(state === "submitted" || state === "in_review") && (
          <>
            <p className="text-white/35 text-sm mb-1">
              Week of {fmtWeek(window_.weekStartDate)}
            </p>
            {currentWeekCheckIn?.submittedAt && (
              <p className="text-white/22 text-xs mb-1">
                Submitted {fmtDate(currentWeekCheckIn.submittedAt)}
              </p>
            )}
            <p className="text-white/15 text-xs mb-6">
              Next check-in opens {nextCheckInLabel}
            </p>
          </>
        )}

        {state === "coach_responded" && (
          <p className="text-white/35 text-sm mb-1">
            Week of {fmtWeek(window_.weekStartDate)}
          </p>
        )}

        {/* Supporting copy */}
        {presentation.supportingCopy && (
          <p className="text-white/38 text-sm leading-relaxed max-w-sm mb-8">
            {presentation.supportingCopy}
          </p>
        )}

        {/* Spacing when no supporting copy */}
        {!presentation.supportingCopy &&
          (state === "submitted" || state === "in_review") && (
            <div className="mb-8" />
          )}

        {state === "coach_responded" && !presentation.supportingCopy && (
          <div className="mb-8" />
        )}

        {/* Primary CTA */}
        {state === "coach_responded" && currentWeekCheckIn && (
          <div className="flex items-center gap-4">
            <Link
              href={`/portal/check-ins/${currentWeekCheckIn.id}`}
              className="inline-block bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 hover:bg-[#d4af63] transition-colors"
            >
              {presentation.ctaLabel}
            </Link>
          </div>
        )}

        {(state === "available" ||
          state === "first_ever" ||
          state === "overdue") && (
          <Link
            href="/portal/check-ins/new"
            className="inline-block bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 hover:bg-[#d4af63] transition-colors"
          >
            {presentation.ctaLabel}
          </Link>
        )}

        {state === "draft" && (
          <Link
            href="/portal/check-ins/new"
            className="inline-block border border-[#c9a24d]/30 text-[#c9a24d] text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 hover:bg-[#c9a24d]/10 transition-colors"
          >
            {presentation.ctaLabel}
          </Link>
        )}

        {(state === "submitted" || state === "in_review") &&
          currentWeekCheckIn && (
            <div className="flex items-center gap-4">
              <Link
                href={`/portal/check-ins/${currentWeekCheckIn.id}`}
                className="inline-block border border-white/[0.10] text-white/45 hover:text-white hover:border-white/[0.18] text-[10px] font-medium uppercase tracking-[0.2em] px-5 py-2.5 transition-colors"
              >
                {presentation.ctaLabel}
              </Link>
              {currentWeekCheckIn.status === "submitted" && (
                <Link
                  href={`/portal/check-ins/${currentWeekCheckIn.id}/edit`}
                  className="text-[10px] text-white/25 hover:text-white/55 uppercase tracking-[0.2em] transition-colors"
                >
                  Edit
                </Link>
              )}
            </div>
          )}

      </section>

      {/* ── HISTORY — secondary, below the fold ── */}
      {pastCheckIns.length > 0 && (
        <section aria-label="Check-in history" className="mt-12">
          <p className="text-[9px] text-white/18 uppercase tracking-[0.45em] mb-4">
            History
          </p>
          <div className="divide-y divide-white/[0.04]">
            {pastCheckIns.map((c) => (
              <Link
                key={c.id}
                href={`/portal/check-ins/${c.id}`}
                className="flex items-center gap-4 py-3 hover:opacity-75 transition-opacity"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white/45 text-sm">
                    Week of {fmtWeek(c.weekStartDate)}
                  </p>
                  {c.submittedAt && (
                    <p className="text-white/20 text-[10px] mt-0.5">
                      Submitted {fmtDate(c.submittedAt)}
                    </p>
                  )}
                </div>
                {c.hasCoachResponse && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 shrink-0" />
                )}
                <span
                  className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 ${HISTORY_STATUS_COLOR[c.status]}`}
                >
                  {HISTORY_STATUS_LABEL[c.status] ?? c.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

    </PortalShell>
  );
}
