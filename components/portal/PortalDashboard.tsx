"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { DashboardData, PromisesKeptStats } from "@/lib/db/portal-dashboard-service";
import MissionEntry from "./MissionEntry";
import PortalShell from "./PortalShell";
import TodayWorkout from "./TodayWorkout";
import PromisesKept from "./PromisesKept";
import PromiseStreakCard from "./PromiseStreakCard";
import WeeklyRhythm from "./WeeklyRhythm";
import RecoverySnapshotCard from "./RecoverySnapshotCard";

const ENTRY_DATE_KEY = "catalyst_entry_date";

type Phase = "entry" | "portal";
type TodayKind =
  | "workout"
  | "rest_day"
  | "no_program"
  | "program_complete"
  | "not_started";

interface CoachData {
  firstName: string;
  avatarUrl: string | null;
}

interface Props {
  clientName: string;
  clientId: string;
  dashboardData: DashboardData;
  coachData: CoachData | null;
  devPreviewState?: string;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}

function getFirstName(fullName: string): string {
  return fullName.split(" ")[0];
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Coach Avatar ──────────────────────────────────────────────
function CoachAvatar({
  firstName,
  avatarUrl,
}: {
  firstName: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="w-12 h-12 rounded-full overflow-hidden border border-white/[0.1] bg-[#1c1c1c] shrink-0 shadow-[0_0_0_2px_rgba(201,162,77,0.08)]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={firstName}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-white/45 text-base font-bold">
            {firstName[0].toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Journey Timeline (onboarding only) ────────────────────────
function JourneyTimeline({
  coachConnected,
  checkInSubmitted,
  planReceived,
}: {
  coachConnected: boolean;
  checkInSubmitted: boolean;
  planReceived: boolean;
}) {
  const steps = [
    { shortLabel: "Account", done: true },
    { shortLabel: "Coach", done: coachConnected },
    { shortLabel: "Check-in", done: checkInSubmitted },
    { shortLabel: "Plan", done: planReceived },
    { shortLabel: "Day 1", done: false },
  ];

  return (
    <div className="bg-[#0d0e0f] border border-white/[0.07] p-5">
      <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-5">
        Your Journey
      </p>
      <div className="flex items-start">
        {steps.map((step, i) => (
          <div key={step.shortLabel} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div
                className={`flex-1 h-px ${
                  i === 0
                    ? "opacity-0"
                    : step.done
                    ? "bg-[#c9a24d]/25"
                    : "bg-white/[0.05]"
                }`}
              />
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  step.done
                    ? "bg-[#c9a24d] shadow-[0_0_6px_rgba(201,162,77,0.35)]"
                    : "border border-white/[0.12]"
                }`}
              />
              <div
                className={`flex-1 h-px ${
                  i === steps.length - 1 ? "opacity-0" : "bg-white/[0.05]"
                }`}
              />
            </div>
            <p
              className={`text-[8px] text-center mt-2 leading-tight ${
                step.done ? "text-white/40" : "text-white/15"
              }`}
            >
              {step.shortLabel}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortalDashboard({
  clientName,
  clientId,
  dashboardData,
  coachData,
  devPreviewState,
}: Props) {
  const [phase, setPhase] = useState<Phase>("entry");
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [todayKind, setTodayKind] = useState<TodayKind | null>(null);
  const [planReceived, setPlanReceived] = useState(false);

  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
  );

  useEffect(() => {
    const todayKey = new Date().toLocaleDateString("en-CA");
    const lastShown = localStorage.getItem(ENTRY_DATE_KEY);
    requestAnimationFrame(() => {
      if (lastShown === todayKey) setPhase("portal");
      setReady(true);
    });
  }, []);

  // Fetch today's kind for greeting + plan detection — also satisfies acceptance test
  useEffect(() => {
    if (devPreviewState && process.env.NODE_ENV === "development") {
      setTodayKind(devPreviewState as TodayKind);
      setPlanReceived(devPreviewState !== "no_program");
      return;
    }
    fetch("/api/portal/today-workout")
      .then((r) => r.json())
      .then((d: { ok: boolean; result?: { kind: TodayKind } }) => {
        if (d.ok && d.result) {
          setTodayKind(d.result.kind);
          setPlanReceived(d.result.kind !== "no_program");
        }
      })
      .catch(() => {});
  }, [devPreviewState]);

  useEffect(() => {
    if (phase === "portal") {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => setMounted(false));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  function handleEntryComplete() {
    const todayKey = new Date().toLocaleDateString("en-CA");
    localStorage.setItem(ENTRY_DATE_KEY, todayKey);
    setPhase("portal");
  }

  function fadeIn(index: number): CSSProperties {
    if (reducedMotion) return {};
    return {
      opacity: mounted ? 1 : 0,
      transform: mounted ? "none" : "translateY(0.4rem)",
      transition: "opacity 320ms ease, transform 320ms ease",
      transitionDelay: `${index * 70 + 40}ms`,
    };
  }

  if (!ready) return null;

  const firstName = getFirstName(clientName);
  const isRestDay = todayKind === "rest_day";

  const devIsOnboarding =
    process.env.NODE_ENV === "development" && devPreviewState === "not_started";
  const displayPromises: PromisesKeptStats = devIsOnboarding
    ? {
        ...dashboardData.promises,
        hasAnyData: false,
        lifetimeKept: 0,
        currentStreak: 0,
        dailyStreak: 0,
        todayKept: null,
      }
    : dashboardData.promises;

  const isOnboarding = !displayPromises.hasAnyData;
  const checkInSubmitted =
    dashboardData.achievements.find((a) => a.id === "first_checkin")?.earned ??
    false;

  return (
    <>
      {phase === "entry" && (
        <MissionEntry
          clientName={clientName}
          clientId={clientId}
          onComplete={handleEntryComplete}
        />
      )}

      {phase === "portal" && (
        <PortalShell clientName={clientName}>
          {/* Single child — PortalShell gap-10 doesn't apply; we own spacing */}
          <div className="flex flex-col gap-5">

            {/* ── HEADER ── */}
            <div
              className="flex items-start justify-between gap-4"
              style={fadeIn(0)}
            >
              {/* Left: greeting + name + philosophy */}
              <div>
                <p className="text-[10px] text-[#c9a24d]/60 uppercase tracking-[0.45em] mb-2">
                  {isRestDay ? "Rest Day" : getTimeGreeting()}
                </p>
                <h1
                  className="text-white font-bold leading-none mb-3"
                  style={{ fontSize: "clamp(2.25rem, 9vw, 4rem)" }}
                >
                  {firstName}.
                </h1>
                <p className="text-white/30 text-[11px] leading-relaxed">
                  Small choices. Kept daily.
                  <br />
                  Big transformation. Earned over time.
                </p>
              </div>

              {/* Right: coach block with avatar */}
              {coachData && (
                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  <div className="text-right">
                    <p className="text-[8px] text-white/20 uppercase tracking-[0.35em] mb-1">
                      Your Coach
                    </p>
                    <p className="text-white/50 text-sm font-medium leading-none">
                      {coachData.firstName}
                    </p>
                    {isOnboarding && (
                      <p className="text-[9px] text-white/20 mt-1.5 italic">
                        Preparing your plan
                      </p>
                    )}
                  </div>
                  <CoachAvatar
                    firstName={coachData.firstName}
                    avatarUrl={coachData.avatarUrl}
                  />
                </div>
              )}
            </div>

            {/* ── DATE LINE ── */}
            <div style={fadeIn(0)}>
              <div className="flex items-center gap-3 -mt-2">
                <p className="text-[8px] text-white/15 uppercase tracking-[0.5em]">
                  Today
                </p>
                <div className="h-px flex-1 bg-white/[0.04]" />
                <p className="text-[8px] text-white/15 uppercase tracking-[0.35em]">
                  {getTodayLabel()}
                </p>
              </div>
            </div>

            {/* ── TODAY'S PROMISE — the dashboard's one question ── */}
            <div style={fadeIn(1)}>
              <TodayWorkout devPreviewState={devPreviewState} />
            </div>

            {/* ── WEEK PROMISE RINGS — how this week is going ── */}
            <div style={fadeIn(2)}>
              <PromisesKept
                stats={displayPromises}
                wc={dashboardData.weeklyCompliance}
              />
            </div>

            {/* ── [PROMISE STREAK | CHECK-IN] — momentum + accountability ── */}
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              style={fadeIn(3)}
            >
              <PromiseStreakCard stats={displayPromises} />
              <WeeklyRhythm
                data={dashboardData.weeklyCompliance}
                isOnboarding={isOnboarding}
              />
            </div>

            {/* ── RECOVERY — supporting signal ── */}
            {dashboardData.recovery.hasData && (
              <div style={fadeIn(4)}>
                <RecoverySnapshotCard data={dashboardData.recovery} />
              </div>
            )}

            {/* ── JOURNEY TIMELINE — onboarding only ── */}
            {isOnboarding && (
              <div style={fadeIn(5)}>
                <JourneyTimeline
                  coachConnected={coachData !== null}
                  checkInSubmitted={checkInSubmitted}
                  planReceived={planReceived}
                />
              </div>
            )}

          </div>
        </PortalShell>
      )}
    </>
  );
}
