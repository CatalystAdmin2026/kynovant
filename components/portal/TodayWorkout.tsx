"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import WorkoutSession from "./WorkoutSession";
import type { WorkoutSnapshot } from "./WorkoutSession";

interface TodayWorkoutData {
  clientProgramId: string;
  programName: string;
  weekNumber: number;
  dayOfWeek: number;
  totalWeeks: number;
  workoutTemplateId: string;
  workoutName: string;
  estimatedDurationMinutes: number | null;
  scheduledDate: string;
  existingSessionId: string | null;
  existingSessionStatus: string | null;
  snapshot: WorkoutSnapshot;
}

type TodayResult =
  | { kind: "workout"; data: TodayWorkoutData }
  | {
      kind: "week";
      data: { startDate: string; endDate: string; workouts: TodayWorkoutData[] };
    }
  | { kind: "rest_day" }
  | { kind: "no_program" }
  | { kind: "program_complete" }
  | { kind: "not_started"; data: { startDate: string; daysUntilStart: number; programName: string } };

type View = "today" | "active_session" | "completed";

function formatWorkoutDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────
// CARD SHELL — shared visual container for all states
// ─────────────────────────────────────────────────────────────

function HeroCard({
  accentGold = false,
  children,
}: {
  accentGold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative bg-[#0d0e0f] border border-white/[0.07] overflow-hidden">
      {accentGold && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#c9a24d]" aria-hidden />
      )}
      <div className="p-6 md:p-8">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REST DAY — atmospheric bedroom background
// ─────────────────────────────────────────────────────────────

function RestDayCard() {
  const items = [
    "Prioritize 7–9 hours of sleep",
    "Hydrate: 100 oz",
    "10–15 min mobility or stretching",
  ];

  return (
    <div
      className="relative overflow-hidden bg-[#0d0e0f] border border-white/[0.07]"
      style={{ minHeight: "380px" }}
    >
      {/* Atmospheric bedroom background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/images/bedroom-bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center 32%",
        }}
      />
      {/* Heavy gradient layering — image becomes mood, not decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/65 to-black/96" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-transparent" />
      {/* Vignette — darkens corners, keeps center alive */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 130% 110% at 72% 38%, transparent 28%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* Content layer */}
      <div
        className="relative z-10 p-6 md:p-8 flex flex-col"
        style={{ minHeight: "380px" }}
      >
        {/* Label + heading */}
        <div className="flex items-start gap-3 mb-4">
          {/* Recovery icon */}
          <div className="w-8 h-8 rounded-full bg-[#c9a24d]/12 border border-[#c9a24d]/20 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                stroke="#c9a24d"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <p className="text-[9px] text-[#c9a24d]/55 uppercase tracking-[0.45em] mb-1">
              Today
            </p>
            <h2
              className="text-white font-bold leading-none"
              style={{ fontSize: "clamp(1.75rem, 7vw, 2.75rem)" }}
            >
              Rest &amp; Recover.
            </h2>
          </div>
        </div>

        <p className="text-white/50 text-sm leading-relaxed mb-6 max-w-xs">
          Your body grows when you recover.<br />Make today count.
        </p>

        {/* Recovery checklist */}
        <div className="space-y-3 flex-1">
          {items.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border border-[#c9a24d]/30 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-[#c9a24d]/45" />
              </div>
              <p className="text-white/55 text-sm">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING STATES — direction, not absence
// ─────────────────────────────────────────────────────────────

function fmtStartDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function countdownLabel(days: number): string {
  if (days === 1) return "1 day until your first training session.";
  if (days < 14) return `${days} days until your first training session.`;
  const weeks = Math.floor(days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"} until your first training session.`;
}

function OnboardingCard({
  kind,
  startDate,
  daysUntilStart,
}: {
  kind: "no_program" | "program_complete" | "not_started";
  startDate?: string;
  daysUntilStart?: number;
}) {
  if (kind === "program_complete") {
    return (
      <HeroCard>
        <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-5">Today</p>
        <h2
          className="text-white font-bold leading-none mb-4"
          style={{ fontSize: "clamp(1.5rem, 6vw, 2.6rem)" }}
        >
          Program complete.
        </h2>
        <p className="text-white/35 text-sm leading-relaxed max-w-xs">
          Every session logged. Your coach will assign your next block soon.
        </p>
      </HeroCard>
    );
  }

  if (kind === "not_started") {
    return (
      <HeroCard accentGold>
        <p className="text-[9px] text-[#c9a24d]/50 uppercase tracking-[0.45em] mb-5">
          Today
        </p>
        <h2
          className="text-white font-bold leading-none"
          style={{ fontSize: "clamp(1.5rem, 6vw, 2.6rem)" }}
        >
          Your Journey Starts Soon.
        </h2>
        {startDate && (
          <p className="text-[#c9a24d]/65 text-sm font-medium mt-3 mb-0.5">
            {fmtStartDate(startDate)}
          </p>
        )}
        {daysUntilStart !== undefined && daysUntilStart > 0 && (
          <p className="text-white/30 text-xs mb-6">
            {countdownLabel(daysUntilStart)}
          </p>
        )}
        {!startDate && <div className="mb-4" />}
        <p className="text-white/35 text-sm leading-relaxed max-w-sm mb-8">
          The habits you build before Day 1 will shape everything that follows.
        </p>
        <Link
          href="/portal/program"
          className="inline-flex items-center gap-2 text-[#c9a24d]/75 text-xs font-semibold hover:text-[#c9a24d] transition-colors"
        >
          See your program
          <span aria-hidden>→</span>
        </Link>
      </HeroCard>
    );
  }

  // no_program — hero is atmospheric/informational; check-in card handles submission
  return (
    <HeroCard accentGold>
      <p className="text-[9px] text-[#c9a24d]/50 uppercase tracking-[0.45em] mb-5">
        Today
      </p>
      <h2
        className="text-white font-bold leading-none mb-4"
        style={{ fontSize: "clamp(1.5rem, 6vw, 2.6rem)" }}
      >
        Your first mission.
      </h2>
      <p className="text-white/35 text-sm leading-relaxed max-w-sm">
        Tell your coach where you&apos;re starting from. Your starting metrics —
        weight, energy, recovery, schedule — are how they build the right
        program for you.
      </p>
    </HeroCard>
  );
}

// ─────────────────────────────────────────────────────────────
// WORKOUT CARD — the hero state
// ─────────────────────────────────────────────────────────────

function WorkoutCard({
  data,
  onStartWorkout,
  onResumeWorkout,
}: {
  data: TodayWorkoutData;
  onStartWorkout: () => void;
  onResumeWorkout: (sessionId: string) => void;
}) {
  const [starting, setStarting] = useState(false);

  const allExercises = [
    ...data.snapshot.sections.flatMap((s) => s.exercises),
    ...data.snapshot.unsectioned,
  ];
  const totalSets = allExercises.reduce((s, ex) => s + (ex.sets ?? 1), 0);
  const totalExercises = allExercises.length;

  const exerciseNames =
    data.snapshot.sections.length > 0
      ? data.snapshot.sections.flatMap((s) => s.exercises.map((e) => e.exerciseName))
      : data.snapshot.unsectioned.map((e) => e.exerciseName);

  const isCompleted = data.existingSessionStatus === "completed";
  const isInProgress = data.existingSessionStatus === "in_progress";

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch("/api/portal/workout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientProgramId: data.clientProgramId,
          workoutTemplateId: data.workoutTemplateId,
          programWeekNumber: data.weekNumber,
          programDayOfWeek: data.dayOfWeek,
          scheduledDate: data.scheduledDate,
        }),
      });
      const res2 = (await res.json()) as { ok: boolean; session?: { id: string } };
      if (res2.ok && res2.session) onStartWorkout();
    } finally {
      setStarting(false);
    }
  }

  if (isCompleted) {
    return (
      <HeroCard accentGold>
        <p className="text-[9px] text-[#c9a24d]/50 uppercase tracking-[0.45em] mb-6">
          {data.programName} · Week {data.weekNumber}
        </p>
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 border border-emerald-500/30 bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
            <span className="text-emerald-400 text-sm">✓</span>
          </div>
          <div>
            <p className="text-white text-lg font-semibold leading-snug">
              Session logged. You showed up.
            </p>
            <p className="text-white/30 text-sm mt-1">{data.workoutName}</p>
          </div>
        </div>
        <p className="text-white/18 text-xs leading-relaxed max-w-xs mt-5">
          Rest up, hit your targets, and come back stronger.
        </p>
      </HeroCard>
    );
  }

  return (
    <HeroCard accentGold>
      {/* Program context — muted, subordinate */}
      <p className="text-[9px] text-white/22 uppercase tracking-[0.42em] mb-4">
        {data.programName}&nbsp;·&nbsp;Week {data.weekNumber}/{data.totalWeeks}
        {data.estimatedDurationMinutes ? ` · ${data.estimatedDurationMinutes} min` : ""}
      </p>

      {/* Workout name — the dominant anchor */}
      <h2
        className="text-white font-bold leading-none mb-4"
        style={{ fontSize: "clamp(2.5rem, 10vw, 4.5rem)" }}
      >
        {data.workoutName}
      </h2>

      {/* Volume — muted but present */}
      <p className="text-white/20 text-[10px] tabular-nums mb-4">
        {totalExercises} exercise{totalExercises !== 1 ? "s" : ""}&nbsp;·&nbsp;
        {totalSets} sets
      </p>

      {/* Exercise preview — flowing text */}
      {exerciseNames.length > 0 && (
        <p className="text-white/22 text-xs leading-relaxed mb-7">
          {exerciseNames.slice(0, 10).join(" · ")}
          {exerciseNames.length > 10 && ` +${exerciseNames.length - 10}`}
        </p>
      )}

      {/* CTA — full-width, commanding */}
      {isInProgress && data.existingSessionId ? (
        <button
          onClick={() => onResumeWorkout(data.existingSessionId!)}
          className="w-full border border-[#c9a24d]/40 text-[#c9a24d] text-[11px] font-bold uppercase tracking-[0.3em] py-5 hover:bg-[#c9a24d]/10 transition-colors"
        >
          Resume Workout
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-[#c9a24d] text-black text-[11px] font-bold uppercase tracking-[0.35em] py-5 hover:bg-[#d4af63] disabled:opacity-50 transition-colors"
        >
          {starting ? "Starting…" : "Keep This Promise"}
        </button>
      )}
    </HeroCard>
  );
}

function WeeklyWorkoutList({
  workouts,
  startDate,
  endDate,
  onOpen,
}: {
  workouts: TodayWorkoutData[];
  startDate: string;
  endDate: string;
  onOpen: (workout: TodayWorkoutData) => void;
}) {
  return (
    <HeroCard accentGold>
      <p className="text-[9px] text-[#c9a24d]/55 uppercase tracking-[0.45em] mb-2">
        This Week
      </p>
      <p className="text-white/35 text-xs mb-6">
        {formatWorkoutDate(startDate)} – {formatWorkoutDate(endDate)}
      </p>
      {workouts.length === 0 ? (
        <p className="text-white/35 text-sm">No workouts are scheduled this week.</p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {workouts.map((workout) => (
            <button
              key={`${workout.scheduledDate}-${workout.workoutTemplateId}`}
              type="button"
              onClick={() => onOpen(workout)}
              className="w-full py-4 flex items-center gap-4 text-left group"
            >
              <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/35">
                {formatWorkoutDate(workout.scheduledDate)}
              </span>
              <span className="flex-1 text-sm font-semibold text-white group-hover:text-[#c9a24d] transition-colors">
                {workout.workoutName}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a24d]/60">
                {workout.existingSessionStatus === "completed" ? "Complete" : "Open →"}
              </span>
            </button>
          ))}
        </div>
      )}
    </HeroCard>
  );
}

// ─────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.07] p-6 md:p-8">
      <div className="h-2 bg-white/[0.04] animate-pulse w-1/3 mb-6 rounded-sm" />
      <div className="h-14 bg-white/[0.06] animate-pulse w-5/6 mb-4 rounded-sm" />
      <div className="h-2 bg-white/[0.03] animate-pulse w-1/4 mb-4 rounded-sm" />
      <div className="h-2 bg-white/[0.03] animate-pulse w-full mb-1 rounded-sm" />
      <div className="h-2 bg-white/[0.03] animate-pulse w-3/4 mb-8 rounded-sm" />
      <div className="h-14 bg-white/[0.05] animate-pulse w-full rounded-sm" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function TodayWorkout({ devPreviewState }: { devPreviewState?: string }) {
  const [result, setResult] = useState<TodayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [completionPct, setCompletionPct] = useState<number | null>(null);
  const [workoutName, setWorkoutName] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<TodayWorkoutData | null>(null);

  useEffect(() => {
    // Dev-only: bypass API and render preview state directly
    if (devPreviewState && process.env.NODE_ENV === "development") {
      if (devPreviewState === "rest_day") {
        setResult({ kind: "rest_day" });
      } else if (devPreviewState === "not_started") {
        const futureDate = new Date();
        futureDate.setUTCDate(futureDate.getUTCDate() + 14);
        setResult({
          kind: "not_started",
          data: {
            startDate: futureDate.toISOString().slice(0, 10),
            daysUntilStart: 14,
            programName: "Foundation Program",
          },
        });
      } else if (devPreviewState === "no_program") {
        setResult({ kind: "no_program" });
      } else if (devPreviewState === "program_complete") {
        setResult({ kind: "program_complete" });
      }
      setLoading(false);
      return;
    }

    let mounted = true;
    fetch("/api/portal/today-workout")
      .then((r) => r.json())
      .then((data: { ok: boolean; result?: TodayResult }) => {
        if (!mounted) return;
        if (data.ok && data.result) setResult(data.result);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [devPreviewState]);

  if (loading) return <LoadingSkeleton />;

  if (!result || result.kind === "rest_day") return <RestDayCard />;

  if (result.kind === "week" && !selectedWorkout) {
    return (
      <WeeklyWorkoutList
        workouts={result.data.workouts}
        startDate={result.data.startDate}
        endDate={result.data.endDate}
        onOpen={setSelectedWorkout}
      />
    );
  }

  if (result.kind !== "workout" && result.kind !== "week") {
    return (
      <OnboardingCard
        kind={result.kind}
        startDate={result.kind === "not_started" ? result.data.startDate : undefined}
        daysUntilStart={result.kind === "not_started" ? result.data.daysUntilStart : undefined}
      />
    );
  }

  const todayData = result.kind === "workout" ? result.data : selectedWorkout!;

  if (view === "active_session" && activeSessionId) {
    return (
      <div className="border border-white/[0.07] bg-[#0d0e0f]">
        <WorkoutSession
          sessionId={activeSessionId}
          snapshot={todayData.snapshot}
          programWeekNumber={todayData.weekNumber}
          scheduledDate={todayData.scheduledDate}
          onComplete={(pct) => {
            setCompletionPct(pct);
            setWorkoutName(todayData.workoutName);
            setView("completed");
          }}
          onCancel={() => {
            setView("today");
            if (result.kind === "week") setSelectedWorkout(null);
          }}
        />
      </div>
    );
  }

  if (view === "completed") {
    return (
      <HeroCard accentGold>
        <p className="text-[9px] text-[#c9a24d]/50 uppercase tracking-[0.45em] mb-6">
          Today
        </p>
        <div className="flex items-start gap-4 mb-5">
          <div className="w-8 h-8 border border-emerald-500/30 bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
            <span className="text-emerald-400 text-sm">✓</span>
          </div>
          <div>
            <p className="text-white text-lg font-semibold leading-snug">
              Session logged. You showed up.
            </p>
            <p className="text-white/30 text-sm mt-1">
              {workoutName ?? todayData.workoutName}
            </p>
          </div>
          {completionPct !== null && (
            <p className="text-[#c9a24d] font-bold text-2xl tabular-nums ml-auto mt-0.5">
              {completionPct}%
            </p>
          )}
        </div>
        <p className="text-white/22 text-xs leading-relaxed max-w-xs">
          Rest up, hit your targets, and come back stronger.
        </p>
        {result.kind === "week" && (
          <button
            type="button"
            onClick={() => {
              setView("today");
              setSelectedWorkout(null);
              setActiveSessionId(null);
              fetch("/api/portal/today-workout")
                .then((response) => response.json())
                .then((data: { ok: boolean; result?: TodayResult }) => {
                  if (data.ok && data.result) setResult(data.result);
                });
            }}
            className="mt-6 border border-[#c9a24d]/35 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#c9a24d] hover:bg-[#c9a24d]/10"
          >
            Back to This Week
          </button>
        )}
      </HeroCard>
    );
  }

  return (
    <div className="space-y-3">
      {result.kind === "week" && (
        <button
          type="button"
          onClick={() => setSelectedWorkout(null)}
          className="text-[10px] uppercase tracking-[0.25em] text-white/35 hover:text-[#c9a24d]"
        >
          ← This Week
        </button>
      )}
      <WorkoutCard
        data={todayData}
        onStartWorkout={() => {
          fetch("/api/portal/today-workout")
            .then((r) => r.json())
            .then((d: { ok: boolean; result?: TodayResult }) => {
              if (d.ok && d.result?.kind === "workout") {
                const sid = d.result.data.existingSessionId;
                if (sid) {
                  setActiveSessionId(sid);
                  setView("active_session");
                }
              }
            });
        }}
        onResumeWorkout={(sessionId) => {
          setActiveSessionId(sessionId);
          setView("active_session");
        }}
      />
    </div>
  );
}
