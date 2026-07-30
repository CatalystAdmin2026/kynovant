"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// ─────────────────────────────────────────────────────────────
// Curated Catalyst lines — rotate once per client-local calendar
// day. Selected deterministically from clientId + local date.
// No API call, no database write, stable across refreshes.
// ─────────────────────────────────────────────────────────────

const CATALYST_LINES: readonly string[] = [
  "Keep showing up. The results will catch up.",
  "Consistency changes everything.",
  "What you repeat becomes who you are.",
  "Progress is built before it is noticed.",
  "The next step still counts.",
  "Discipline makes the difference.",
  "Small choices shape lasting change.",
  "Keep becoming.",
  "Today still matters.",
  "The work compounds.",
  "Show up again. That's the whole strategy.",
  "Every rep builds the record.",
  "The habit is the result.",
  "One more day.",
  "Earned, not given.",
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function getDailyLine(clientId: string): string {
  const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  return CATALYST_LINES[hashString(clientId + localDate) % CATALYST_LINES.length];
}

// ─────────────────────────────────────────────────────────────
// Greeting — four time buckets, client local time.
// Late-night / early-morning window gets "Welcome Back."
// ─────────────────────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 21) return "WELCOME BACK,";
  if (h < 12) return "GOOD MORNING,";
  if (h < 17) return "GOOD AFTERNOON,";
  return "GOOD EVENING,";
}

// ─────────────────────────────────────────────────────────────
// Animation step machine
//
//  0  initial   → nothing visible
//  1  logo      → Catalyst mark fades in with gold glow
//  2  greeting  → greeting + name + daily line appear
//  3  message   → coaching paragraph fades in
//  4  card      → Today's Promise card slides up; CTA available
//  5  exiting   → full screen fades to black; onComplete fires
// ─────────────────────────────────────────────────────────────

const STEP_DELAYS = [
  150,  // 0 → 1: logo appears after first paint
  1000, // 1 → 2: greeting (logo visible ~500ms during its 500ms fade)
  600,  // 2 → 3: coaching paragraph
  550,  // 3 → 4: promise card
] as const;

const EXIT_DURATION = 400;

interface Props {
  clientName: string;
  clientId: string;
  onComplete: () => void;
}

export default function MissionEntry({ clientName, clientId, onComplete }: Props) {
  const firstName = clientName.split(" ")[0].toUpperCase();
  const greeting = getTimeGreeting();
  const dailyLine = getDailyLine(clientId);

  const [rm] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
  );

  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= 4) return;
    const delay = rm ? 0 : STEP_DELAYS[step];
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, rm]);

  function handleBegin() {
    setStep(5);
    setTimeout(() => onComplete(), rm ? 0 : EXIT_DURATION);
  }

  function fadeUp(visible: boolean, durationMs = 450, delayMs = 0): React.CSSProperties {
    if (rm) return {};
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? "none" : "translateY(8px)",
      transition: `opacity ${durationMs}ms ease-out, transform ${durationMs}ms ease-out`,
      transitionDelay: `${delayMs}ms`,
    };
  }

  const exiting = step === 5;
  const wrapperStyle: React.CSSProperties = rm
    ? {}
    : {
        opacity: exiting ? 0 : 1,
        transition: `opacity ${EXIT_DURATION}ms ease`,
      };

  const logoGlow: React.CSSProperties =
    step >= 1
      ? { filter: "drop-shadow(0 0 22px rgba(201, 162, 77, 0.38))" }
      : {};

  return (
    <div
      className="fixed inset-0 z-50 bg-[#080909] flex items-center justify-center px-6"
      style={wrapperStyle}
      aria-live="polite"
      aria-label="Welcome to Catalyst"
    >
      <div className="flex flex-col items-center text-center w-full max-w-sm gap-10">

        {/* ── Step 1: Catalyst mark ──────────────────────── */}
        <div
          style={{ ...fadeUp(step >= 1, 500, 0), ...logoGlow }}
          aria-hidden
        >
          <Image
            src="/logos/kynovant-mark.png"
            alt=""
            width={44}
            height={44}
            priority
          />
        </div>

        {/* ── Step 2: Greeting + Name + Daily line ──────── */}
        <div className="flex flex-col items-center gap-3 -mt-2 w-full min-w-0">
          {/* Greeting and name animate in together */}
          <div className="w-full" style={fadeUp(step >= 2, 450, 0)}>
            <p className="font-headline text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.1em] text-white/38 leading-none">
              {greeting}
            </p>
            <h1
              className="font-headline uppercase tracking-[0.04em] text-white leading-tight break-words"
              style={{ fontSize: "clamp(2rem, 10vw, 4.5rem)" }}
            >
              {firstName}.
            </h1>
          </div>

          {/* Daily Catalyst line — fades in 220ms after the name */}
          <div style={fadeUp(step >= 2, 380, 220)} aria-hidden>
            <p className="text-[11px] text-white/25 tracking-[0.12em]">
              {dailyLine}
            </p>
          </div>
        </div>

        {/* ── Step 3: Coaching paragraph ────────────────── */}
        <div style={fadeUp(step >= 3, 400, 0)}>
          <p className="text-sm text-white/45 leading-relaxed">
            Small promises become lasting results. Show up today, trust the
            process, and let consistency do what motivation never can.
          </p>
        </div>

        {/* ── Step 4: Today's Promise card + CTA ────────── */}
        <div
          className="w-full"
          style={
            rm
              ? {}
              : {
                  opacity: step >= 4 ? 1 : 0,
                  transform: step >= 4 ? "none" : "translateY(20px)",
                  transition: "opacity 500ms ease-out, transform 500ms ease-out",
                }
          }
        >
          <div className="border border-[#c9a24d]/22 bg-[#c9a24d]/[0.04] rounded-sm px-6 py-6 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5 text-left">
              <p className="text-[10px] text-[#c9a24d]/55 font-semibold tracking-[0.2em] uppercase">
                Today&apos;s Promise
              </p>
              <p className="text-base font-semibold text-white/85 leading-snug">
                Keep the promise you made to yourself. Everything else follows.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBegin}
              disabled={step < 4}
              className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-0 min-h-[44px]"
            >
              Enter Catalyst &rarr;
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
