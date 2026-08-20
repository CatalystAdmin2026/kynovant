"use client";

// ─────────────────────────────────────────────────────────────
// Client Portal — first-use PWA install onboarding.
//
// The ONE canonical Portal install surface (Phase 7 of the launch
// brief) — mounted once in PortalShell, never duplicated per-page.
// Reuses usePwaInstallState() (lib/pwa/use-install-state.ts) and
// InstallInstructions (components/pwa/InstallInstructions.tsx) — the
// exact same install-state plumbing and iOS instructions
// InstallKynovant.tsx already uses, not a second PWA-install system.
//
// Renders exactly one of two things, decided by isMobile (UA/touch-
// based — see lib/pwa/install.ts's isMobileDevice() for why this is
// NOT a CSS viewport-width check):
//   - Mobile + eligible (native_prompt | ios_instructions, not
//     dismissed, not installed, not already shown this session): a
//     prominent, non-blocking bottom sheet — the actual "polished
//     install onboarding prompt."
//   - Everything else (desktop, already installed, unsupported
//     browser, previously dismissed, or already shown once this
//     session): falls back to the existing
//     <InstallKynovant variant="card" /> — which already correctly
//     renders nothing for installed/unsupported/dismissed on its own,
//     and is the "existing legitimate desktop install affordance" the
//     brief explicitly says to preserve rather than replace.
//
// PortalShell is imported directly by every app/portal/*/page.tsx (no
// shared app/portal/layout.tsx), so this component fully remounts on
// every Portal page navigation — without the session guard below, the
// sheet would re-appear (after its reveal delay) on every single page
// a client visits until they dismiss it once, which is exactly the
// "shows again on every page load" behavior the brief says not to do.
// kynovant:pwa-onboarding-shown-session (sessionStorage — cleared on a
// new tab/session, unlike the permanent dismissal flag) suppresses the
// sheet after its first appearance for the rest of THIS browsing
// session; a fresh session (new tab, next visit) can show it again if
// the coach's client never dismissed or installed.
//
// Non-blocking by design: no full-screen backdrop, no focus trap.
// Portal content and navigation underneath stay fully usable while the
// sheet is visible — there is always a way to dismiss it (X and "Not
// now"), so it can never trap a user (Phase 12's adversarial concern).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { usePwaInstallState } from "@/lib/pwa/use-install-state";
import InstallKynovant from "./InstallKynovant";
import InstallInstructions from "./InstallInstructions";

// Brief delay before the sheet slides up — lets the Portal's own
// content render first so the onboarding reads as a considered nudge,
// not an instant jarring pop-in on page load.
const REVEAL_DELAY_MS = 900;

const SESSION_SHOWN_KEY = "kynovant:pwa-onboarding-shown-session";

function hasShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_SHOWN_KEY) === "true";
  } catch {
    return false;
  }
}

function markShownThisSession() {
  try {
    window.sessionStorage.setItem(SESSION_SHOWN_KEY, "true");
  } catch {
    // Storage can be unavailable in some private browsing contexts —
    // worst case the sheet can reappear on the next page in that rare
    // case, never worse than that.
  }
}

export default function PortalInstallOnboarding() {
  // scope: "portal" — the client Portal's dismissal is tracked
  // independently from Coach HQ and the public site (see
  // lib/pwa/use-install-state.ts's InstallScope). Without this, a coach
  // dismissing install inside HQ on a shared browser/device would
  // silently suppress this exact onboarding for a genuinely first-time
  // client using the same device — contradicting the invitation email's
  // promise that Kynovant will show them how to install.
  const { mounted, surface, dismissed, isMobile, install, dismiss } = usePwaInstallState("portal");
  // Lazy initializer, not an effect+setState: hasShownThisSession() is
  // itself SSR-safe (try/catch around window.sessionStorage, false when
  // window doesn't exist), and this component's actual rendered output
  // stays null on both the server render and the pre-mount client render
  // either way (gated by `mounted` below) — so there is nothing for a
  // later correction pass to fix, and no cascading extra render.
  const [alreadyShownThisSession] = useState(() => hasShownThisSession());
  const [revealed, setRevealed] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const eligible =
    mounted &&
    isMobile &&
    !dismissed &&
    !alreadyShownThisSession &&
    (surface === "native_prompt" || surface === "ios_instructions");

  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => {
      setRevealed(true);
      markShownThisSession();
    }, REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!mounted) return null;

  if (!eligible) {
    // Desktop, already installed, unsupported browser, previously
    // dismissed, or already shown once this session — InstallKynovant
    // already no-ops correctly for installed/unsupported/dismissed, so
    // this is a true no-op in every case except "desktop, install-
    // eligible" (its intended preserved affordance).
    return <InstallKynovant variant="card" scope="portal" />;
  }

  if (!revealed) return null;

  async function handlePrimaryAction() {
    if (surface === "ios_instructions") {
      setInstructionsOpen(true);
      return;
    }
    await install();
  }

  function handleDismiss() {
    setInstructionsOpen(false);
    dismiss();
  }

  return (
    <>
      {/* P0 FIX: hide the sheet itself while InstallInstructions is open,
          rather than stacking both. InstallInstructions.tsx now also
          renders above this sheet's z-index regardless (belt-and-
          suspenders — see its header comment for the full root-cause
          proof), but there is no reason to keep a second, redundant
          "install Kynovant" surface visible underneath the one the user
          is actually looking at. */}
      {!instructionsOpen && (
        <div
          role="region"
          aria-label="Install Kynovant"
          className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#C9A24D]/20 bg-[#0b0c0d] p-4 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9A24D]/25 bg-[#C9A24D]/10 text-[#C9A24D]">
                <Download size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Add Kynovant to your Home Screen</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  It works like an app — faster to open, no browser bar, no App Store download needed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="min-h-11 flex-1 rounded-lg bg-[#C9A24D] px-4 text-xs font-semibold text-black transition-colors hover:bg-[#D4B56A]"
              >
                {surface === "ios_instructions" ? "Show Me How" : "Add to Home Screen"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-11 rounded-lg px-4 text-xs font-semibold text-white/50 transition-colors hover:text-white/80"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {instructionsOpen && <InstallInstructions onClose={() => setInstructionsOpen(false)} />}
    </>
  );
}
