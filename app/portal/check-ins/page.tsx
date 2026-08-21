import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import {
  getCurrentCheckInWindows,
  listClientCheckIns,
  type CheckInOccurrenceWindow,
  type CheckInListItem,
} from "@/lib/db/check-in-service";
import { describeSchedule, WEEKDAY_LABELS } from "@/lib/checkin/schedule";
import PortalShell from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// STATE → PRESENTATION MAPPING (single-occurrence hero — unchanged
// from before the multi-day pass; used verbatim when a client has
// exactly one required check-in this week, which is still the
// common case and must keep looking exactly as it did before).
//
// All client-facing copy lives here. Edit this record to change
// language for any state without touching JSX or data logic.
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
  currentCheckIn:
    | { status: string; hasCoachResponse: boolean }
    | null
    | undefined,
  isOverdue: boolean,
  isFirstEver: boolean,
): CheckInPageState {
  if (!currentCheckIn) {
    if (isFirstEver) return "first_ever";
    if (isOverdue) return "overdue";
    return "available";
  }
  if (
    currentCheckIn.hasCoachResponse &&
    (currentCheckIn.status === "reviewed" ||
      currentCheckIn.status === "in_review")
  ) {
    return "coach_responded";
  }
  if (currentCheckIn.status === "draft") return "draft";
  if (currentCheckIn.status === "in_review") return "in_review";
  // submitted, reviewed-without-response, or any unknown status
  return "submitted";
}

// ─────────────────────────────────────────────────────────────
// MULTI-OCCURRENCE CARD STATE (Wed+Sun, or any 2+ required days)
//
// A lighter-weight per-occurrence status — the whole week's hero
// treatment doesn't scale to N occurrences, so each occurrence gets
// a compact status line instead. Phase 6 UX target:
//   "Wednesday ✓ Submitted Aug 19"
//   "Sunday    Due today [Start Check-In]"
// ─────────────────────────────────────────────────────────────

type OccurrenceState =
  | "feedback_ready"
  | "in_review"
  | "submitted"
  | "draft"
  | "due_today"
  | "overdue"
  | "upcoming";

interface OccurrencePresentation {
  statusLabel: string;
  tone: "neutral" | "supportive" | "ready" | "warning";
  ctaLabel: string | null;
}

const OCCURRENCE_PRESENTATION: Record<OccurrenceState, OccurrencePresentation> = {
  feedback_ready: { statusLabel: "Feedback Ready", tone: "ready", ctaLabel: "View" },
  in_review: { statusLabel: "In Review", tone: "neutral", ctaLabel: "View" },
  submitted: { statusLabel: "Submitted", tone: "neutral", ctaLabel: "View" },
  draft: { statusLabel: "Draft saved", tone: "neutral", ctaLabel: "Continue" },
  due_today: { statusLabel: "Due today", tone: "ready", ctaLabel: "Start Check-In" },
  overdue: { statusLabel: "Missed", tone: "warning", ctaLabel: "Start Check-In" },
  upcoming: { statusLabel: "Upcoming", tone: "neutral", ctaLabel: "Start Check-In" },
};

const OCCURRENCE_TONE_CLASS: Record<OccurrencePresentation["tone"], string> = {
  neutral: "text-white/30 border-white/10",
  supportive: "text-[#c9a24d]/70 border-[#c9a24d]/20",
  ready: "text-emerald-400/70 border-emerald-500/20",
  warning: "text-amber-400/70 border-amber-500/20",
};

function determineOccurrenceState(w: CheckInOccurrenceWindow): OccurrenceState {
  const c = w.existingCheckIn;
  if (c) {
    if (c.hasCoachResponse && (c.status === "reviewed" || c.status === "in_review")) {
      return "feedback_ready";
    }
    if (c.status === "draft") return "draft";
    if (c.status === "in_review") return "in_review";
    return "submitted";
  }
  if (w.isOverdue) return "overdue";
  if (w.isToday) return "due_today";
  return "upcoming";
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

function fmtDueDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
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
  const timezone = profile?.timezone ?? "America/Chicago";

  const [windows, history] = await Promise.all([
    getCurrentCheckInWindows(dbUser.id, timezone),
    listClientCheckIns(dbUser.id),
  ]);

  // Anything already reflected as one of this week's required
  // occurrences is excluded from "history" below it — history is
  // strictly prior occurrences, never a duplicate of the current
  // week's cards. Matched on scheduledDate, not weekStartDate, so a
  // Wed+Sun week correctly keeps BOTH out of history once either is
  // showing up top, instead of hiding one because they share a week.
  const currentScheduledDates = new Set(windows.map((w) => w.scheduledDate));
  const pastCheckIns: CheckInListItem[] = history.filter(
    (c) => !currentScheduledDates.has(c.scheduledDate),
  );

  const isFirstEver =
    windows.every((w) => !w.existingCheckIn) && pastCheckIns.length === 0;

  const requiredWeekdays = windows.map((w) => w.weekday);
  const scheduleLabel = requiredWeekdays.length > 0 ? describeSchedule(requiredWeekdays) : null;

  return (
    <PortalShell clientName={clientName}>

      {/* ── CURRENT WEEK ── */}
      <section aria-label="This week's check-in">

        <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-4">
          Check-Ins
        </p>

        {windows.length === 0 ? (
          <NoScheduleCard />
        ) : windows.length === 1 ? (
          <SingleOccurrenceCard
            window_={windows[0]}
            isFirstEver={isFirstEver}
            scheduleLabel={scheduleLabel}
          />
        ) : (
          <MultiOccurrenceCards windows={windows} scheduleLabel={scheduleLabel} />
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
                    {WEEKDAY_LABELS[new Date(c.scheduledDate + "T12:00:00").getDay()]}, {fmtWeek(c.scheduledDate)}
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

// ─────────────────────────────────────────────────────────────
// NO SCHEDULE — client has never been configured with a check-in
// schedule (Phase 15: a brand-new client under a coach who hasn't
// set one up yet gets zero windows, not a silent Sunday default).
// No artificial due/overdue pressure per Phase 4/10.
// ─────────────────────────────────────────────────────────────

function NoScheduleCard() {
  return (
    <>
      <h1
        className="text-white font-bold leading-tight mb-2"
        style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}
      >
        Check-ins aren&apos;t set up yet.
      </h1>
      <p className="text-white/38 text-sm leading-relaxed max-w-sm mb-2">
        Your coach hasn&apos;t configured a check-in schedule for you yet.
        Check back soon, or reach out if you&apos;re not sure what to expect.
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SINGLE OCCURRENCE — exactly one required day this week. Keeps the
// original full hero treatment byte-identical in behavior to the
// pre-multi-day product (still the common case).
// ─────────────────────────────────────────────────────────────

function SingleOccurrenceCard({
  window_,
  isFirstEver,
  scheduleLabel,
}: {
  window_: CheckInOccurrenceWindow;
  isFirstEver: boolean;
  scheduleLabel: string | null;
}) {
  const currentCheckIn = window_.existingCheckIn;
  const state = determineCheckInState(currentCheckIn, window_.isOverdue, isFirstEver);
  const presentation = CHECK_IN_PRESENTATION[state];

  const dueDateLabel = fmtDueDate(window_.scheduledDate);

  const nextWeekStart = new Date(window_.weekEndDate + "T12:00:00");
  nextWeekStart.setDate(nextWeekStart.getDate() + 1);
  const nextCheckInLabel = nextWeekStart.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const newHref = `/portal/check-ins/new?date=${window_.scheduledDate}`;

  return (
    <>
      {/* Schedule awareness — additive only, no fake pressure when
          there's no fixed schedule configured. */}
      {scheduleLabel && (
        <p className="text-white/25 text-[10px] mb-1">
          Required: {scheduleLabel}
          {window_.isToday && !currentCheckIn && (
            <span className="text-[#c9a24d]/80 ml-2">· Check-in due today</span>
          )}
        </p>
      )}

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
        state === "overdue" ||
        state === "draft") && (
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
          {currentCheckIn?.submittedAt && (
            <p className="text-white/22 text-xs mb-1">
              Submitted {fmtDate(currentCheckIn.submittedAt)}
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
      {state === "coach_responded" && currentCheckIn && (
        <div className="flex items-center gap-4">
          <Link
            href={`/portal/check-ins/${currentCheckIn.id}`}
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
          href={newHref}
          className="inline-block bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 hover:bg-[#d4af63] transition-colors"
        >
          {presentation.ctaLabel}
        </Link>
      )}

      {state === "draft" && (
        <Link
          href={newHref}
          className="inline-block border border-[#c9a24d]/30 text-[#c9a24d] text-[11px] font-bold uppercase tracking-[0.3em] px-8 py-4 hover:bg-[#c9a24d]/10 transition-colors"
        >
          {presentation.ctaLabel}
        </Link>
      )}

      {(state === "submitted" || state === "in_review") && currentCheckIn && (
        <div className="flex items-center gap-4">
          <Link
            href={`/portal/check-ins/${currentCheckIn.id}`}
            className="inline-block border border-white/[0.10] text-white/45 hover:text-white hover:border-white/[0.18] text-[10px] font-medium uppercase tracking-[0.2em] px-5 py-2.5 transition-colors"
          >
            {presentation.ctaLabel}
          </Link>
          {currentCheckIn.status === "submitted" && (
            <Link
              href={`/portal/check-ins/${currentCheckIn.id}/edit`}
              className="text-[10px] text-white/25 hover:text-white/55 uppercase tracking-[0.2em] transition-colors"
            >
              Edit
            </Link>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// MULTI OCCURRENCE — 2+ required days this week (e.g. Wed+Sun).
// Simple status cards, one per occurrence — no calendar, no
// elaborate visualization, per Phase 6's explicit "no elaborate
// calendar if simple cards suffice."
// ─────────────────────────────────────────────────────────────

function MultiOccurrenceCards({
  windows,
  scheduleLabel,
}: {
  windows: CheckInOccurrenceWindow[];
  scheduleLabel: string | null;
}) {
  return (
    <>
      {scheduleLabel && (
        <p className="text-white/25 text-[10px] mb-4">Required: {scheduleLabel}</p>
      )}

      <h1
        className="text-white font-bold leading-tight mb-6"
        style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}
      >
        This week&apos;s check-ins
      </h1>

      <div className="space-y-3">
        {windows.map((w) => {
          const occState = determineOccurrenceState(w);
          const p = OCCURRENCE_PRESENTATION[occState];
          const dayLabel = WEEKDAY_LABELS[w.weekday];
          const c = w.existingCheckIn;

          let detailLine: string;
          if (c?.submittedAt) {
            detailLine = `Submitted ${fmtDate(c.submittedAt)}`;
          } else if (occState === "overdue") {
            detailLine = `Was due ${fmtDueDate(w.scheduledDate)}`;
          } else {
            detailLine = fmtDueDate(w.scheduledDate);
          }

          const href = c
            ? `/portal/check-ins/${c.id}`
            : `/portal/check-ins/new?date=${w.scheduledDate}`;

          return (
            <Link
              key={w.scheduledDate}
              href={href}
              className="flex items-center gap-4 py-4 px-4 border border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white/85 text-sm font-medium">{dayLabel}</p>
                <p className="text-white/25 text-xs mt-0.5">{detailLine}</p>
              </div>
              <span
                className={`text-[9px] border px-1.5 py-0.5 uppercase tracking-[0.2em] shrink-0 ${OCCURRENCE_TONE_CLASS[p.tone]}`}
              >
                {p.statusLabel}
              </span>
              {p.ctaLabel && (
                <span
                  className={`hidden sm:inline-block text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-2 shrink-0 ${
                    occState === "due_today"
                      ? "bg-[#c9a24d] text-black"
                      : "border border-white/[0.10] text-white/45"
                  }`}
                >
                  {p.ctaLabel}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
