"use client";

// ─────────────────────────────────────────────────────────────
// Shared PWA install state — event wiring extracted from
// components/pwa/InstallKynovant.tsx so a second consumer
// (components/pwa/PortalInstallOnboarding.tsx) can react to the same
// beforeinstallprompt/appinstalled lifecycle without a second, divergent
// copy of this logic. The pure decision functions this hook is built on
// (resolveInstallSurface, isMobileDevice, ...) still live in
// lib/pwa/install.ts and stay directly unit-testable there; this file is
// only the stateful glue around them.
//
// SSR-safe by construction: every window/localStorage access happens
// inside useEffect or an event-driven callback, never during render —
// `mounted` starts false and only flips true after the mount effect
// runs, so server-rendered output and the pre-effect client render both
// render nothing, avoiding a hydration mismatch (same pattern
// InstallKynovant.tsx already used before this extraction).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { isMobileDevice, resolveInstallSurface, type InstallSurface } from "./install";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "kynovant:pwa-install-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean) {
  try {
    if (value) window.localStorage.setItem(DISMISSED_KEY, "true");
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Storage can be unavailable in some private browsing contexts.
  }
}

function getEnvironment(hasNativePrompt: boolean) {
  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
    displayModeStandalone: Boolean(standaloneQuery?.matches),
    navigatorStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    hasNativePrompt,
  };
}

export type InstallOutcome = "accepted" | "dismissed" | "ios_instructions" | "unavailable";

export interface UsePwaInstallStateResult {
  mounted: boolean;
  surface: InstallSurface;
  dismissed: boolean;
  isMobile: boolean;
  /** Triggers the real native prompt (native_prompt), or reports
   * "ios_instructions" so the caller can show InstallInstructions
   * itself — this hook never renders UI. Never throws: a stale/expired
   * beforeinstallprompt event rejecting prompt()/userChoice resolves to
   * "unavailable" instead of an unhandled rejection. */
  install: () => Promise<InstallOutcome>;
  dismiss: () => void;
}

export function usePwaInstallState(): UsePwaInstallStateResult {
  const [mounted, setMounted] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [surface, setSurface] = useState<InstallSurface>("unsupported");
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function update(nextPrompt: BeforeInstallPromptEvent | null = null) {
      setSurface(resolveInstallSurface(getEnvironment(Boolean(nextPrompt))));
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      setPromptEvent(installEvent);
      setDismissed(false);
      writeDismissed(false);
      update(installEvent);
    }

    function onAppInstalled() {
      setPromptEvent(null);
      setSurface("installed");
    }

    const initTimer = window.setTimeout(() => {
      setMounted(true);
      setDismissed(readDismissed());
      setIsMobile(
        isMobileDevice({
          userAgent: window.navigator.userAgent,
          platform: window.navigator.platform,
          maxTouchPoints: window.navigator.maxTouchPoints,
        }),
      );
      update(null);
    }, 0);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const onStandaloneChange = () => update(null);
    standaloneQuery?.addEventListener?.("change", onStandaloneChange);

    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      standaloneQuery?.removeEventListener?.("change", onStandaloneChange);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (surface === "ios_instructions") return "ios_instructions";
    if (!promptEvent) return "unavailable";
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      if (choice.outcome === "dismissed") {
        setDismissed(true);
        writeDismissed(true);
      }
      setSurface(resolveInstallSurface(getEnvironment(false)));
      return choice.outcome;
    } catch {
      // A stale/expired prompt event (already consumed, or the browser
      // revoked it) can reject prompt()/userChoice — fail closed rather
      // than let it surface as an unhandled rejection.
      setPromptEvent(null);
      return "unavailable";
    }
  }, [surface, promptEvent]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeDismissed(true);
  }, []);

  return { mounted, surface, dismissed, isMobile, install, dismiss };
}
