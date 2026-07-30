"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PortalScenario } from "@/lib/portal/types";
import { getMissionBriefing } from "@/lib/portal/briefingData";
import type { MissionBriefing } from "@/lib/portal/briefingData";

// ─────────────────────────────────────────────────────────────
// Animation step machine
//
//  0  initial   → nothing visible
//  1  logo      → Catalyst mark fades in with gold glow
//  2  greeting  → GOOD EVENING, / EMMA. appears
//  3  message   → coaching paragraph fades in (waits for briefing)
//  4  card      → Today's Mission card slides up; CTA available
//  5  exiting   → full screen fades to black; onComplete fires
// ─────────────────────────────────────────────────────────────

// Delays between steps (milliseconds). Reduced-motion path uses 0 for all.
const STEP_DELAYS = [
  150,  // 0 → 1: show logo after paint
  1000, // 1 → 2: greeting (logo visible for ~500ms after its 500ms fade)
  600,  // 2 → 3: coaching message
  550,  // 3 → 4: mission card
] as const;

const EXIT_DURATION = 400; // ms for full-screen fade-out

function getTimeGreeting(): { line1: string; line2: string } {
  const h = new Date().getHours();
  const period =
    h < 12 ? "GOOD MORNING," : h < 17 ? "GOOD AFTERNOON," : "GOOD EVENING,";
  return { line1: period, line2: "" };
}

interface Props {
  clientName: string;
  scenario: PortalScenario;
  onComplete: () => void;
}

export default function MissionEntry({ clientName, scenario, onComplete }: Props) {
  const firstName = clientName.split(" ")[0].toUpperCase();
  const { line1 } = getTimeGreeting();

  // Detect reduced-motion once on mount
  const [rm] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false
  );

  // Async briefing — starts fetching immediately, step 2→3 waits for it
  const [briefing, setBriefing] = useState<MissionBriefing | null>(null);
  useEffect(() => {
    getMissionBriefing(scenario).then(setBriefing);
  }, [scenario]);

  const [step, setStep] = useState(0);
  const advancedRef = useRef(false); // prevent double-firing in StrictMode

  // Advance through steps 0→1→2→3→4
  useEffect(() => {
    if (step >= 4) return; // step 4 (card) and 5 (exit) are user/onComplete driven

    // Step 2 → 3 waits for the briefing to arrive
    if (step === 2 && !briefing) return;

    const delay = rm ? 0 : STEP_DELAYS[step];
    const t = setTimeout(() => {
      if (!advancedRef.current || step < 4) {
        setStep((s) => s + 1);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [step, rm, briefing]);

  function handleBegin() {
    setStep(5);
    setTimeout(() => onComplete(), rm ? 0 : EXIT_DURATION);
  }

  // ── Transition helpers ──────────────────────────────────
  // Base classes for elements that animate in via opacity + translate.
  function fadeUp(visible: boolean, durationMs = 450, delayMs = 0): React.CSSProperties {
    if (rm) return {};
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? "none" : "translateY(8px)",
      transition: `opacity ${durationMs}ms ease-out, transform ${durationMs}ms ease-out`,
      transitionDelay: `${delayMs}ms`,
    };
  }

  // Full-screen exit: opacity of the wrapper
  const exiting = step === 5;
  const wrapperStyle: React.CSSProperties = rm
    ? {}
    : {
        opacity: exiting ? 0 : 1,
        transition: `opacity ${EXIT_DURATION}ms ease`,
      };

  // Logo glow appears with the logo
  const logoGlow: React.CSSProperties =
    step >= 1
      ? { filter: "drop-shadow(0 0 22px rgba(201, 162, 77, 0.38))" }
      : {};

  return (
    <div
      className="fixed inset-0 z-50 bg-[#080909] flex items-center justify-center px-6"
      style={wrapperStyle}
      aria-live="polite"
      aria-label="Loading your mission"
    >
      <div className="flex flex-col items-center text-center w-full max-w-sm gap-10">

        {/* ── Step 1: Catalyst mark ──────────────────────── */}
        <div
          style={{
            ...fadeUp(step >= 1, 500, 0),
            ...logoGlow,
          }}
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

        {/* ── Step 2: Greeting ──────────────────────────── */}
        <div
          className="flex flex-col gap-0.5 -mt-2 w-full min-w-0"
          style={fadeUp(step >= 2, 450, 0)}
        >
          <p className="font-headline text-xl sm:text-2xl md:text-3xl uppercase tracking-[0.1em] text-white/38 leading-none">
            {line1}
          </p>
          <h1
            className="font-headline uppercase tracking-[0.04em] text-white leading-tight break-words"
            style={{ fontSize: "clamp(2rem, 10vw, 4.5rem)" }}
          >
            {firstName}.
          </h1>
        </div>

        {/* ── Step 3: Coaching message ──────────────────── */}
        <div style={fadeUp(step >= 3, 400, 0)}>
          <p className="text-sm text-white/45 leading-relaxed">
            {briefing?.coachingMessage ?? ""}
          </p>
        </div>

        {/* ── Step 4: Today's Mission card + CTA ────────── */}
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
            {/* Card header */}
            <div className="flex flex-col gap-1.5 text-left">
              <p className="text-[10px] text-[#c9a24d]/55 font-semibold tracking-[0.2em] uppercase">
                Today&apos;s Mission
              </p>
              <p className="text-base font-semibold text-white/85 leading-snug">
                {briefing?.missionLine ?? ""}
              </p>
            </div>

            {/* Primary CTA */}
            <button
              type="button"
              onClick={handleBegin}
              disabled={step < 4}
              className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-0 min-h-[44px]"
            >
              Begin Today&apos;s Mission &rarr;
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
