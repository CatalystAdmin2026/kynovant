"use client";

// ─────────────────────────────────────────────────────────────
// Shared PWA install state.
//
// The browser event lifecycle (beforeinstallprompt / appinstalled /
// display-mode: standalone) is NOT owned here any more — it lives in a
// module-level singleton, lib/pwa/install-store.ts, that is started once
// at the persistent root boundary (components/pwa/PwaInstallBoot.tsx in
// app/layout.tsx) and never torn down. That is the fix for "the install
// affordance disappears after Portal navigation": beforeinstallprompt
// fires once per page load and is not re-fired on SPA navigation, so a
// component that captured it in its own useState lost it forever on
// remount. The singleton holds it for the lifetime of the tab, so every
// consumer — however many times it remounts — sees the same live event.
//
// This hook is now a thin per-consumer view over that store, plus the
// two pieces of state that ARE genuinely per-consumer:
//   - `dismissed`: device-local, per-scope (three localStorage keys),
//     exactly as before this refactor.
//   - `isMobile`: a cheap UA/touch check, read once on mount.
//
// SSR-safe by construction: `mounted` starts false and only flips true
// after the mount effect runs; the store's snapshot uses a stable server
// value; every window/localStorage access is inside an effect or an
// event-driven callback.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isMobileDevice, resolveInstallSurface, type InstallSurface } from "./install";
import {
  consumeNativePrompt,
  ensureInstallStoreStarted,
  getInstallStoreServerVersion,
  getInstallStoreVersion,
  hasNativePrompt,
  isInstalledSignal,
  subscribeInstallStore,
} from "./install-store";

// Re-exported for backwards compatibility — the type now lives in the store.
export type { BeforeInstallPromptEvent } from "./install-store";

// Scoped dismissal storage — HQ and the client Portal each get their own
// key, distinct from the public marketing site's ("default", unscoped —
// unchanged, same key as before this fix, so existing public-site
// dismissals on a visitor's browser keep working exactly as before).
//
// Root cause this scoping fixes: a single shared key meant a coach
// dismissing install inside Coach HQ on a given browser/device silently
// suppressed a completely different client's first-ever Portal install
// onboarding on that SAME browser/device (e.g. a coach testing both
// surfaces on their own laptop) — contradicting the per-client "first
// eligible session" promise made in the invitation email. HQ and Portal
// are different account contexts and must not share one dismissal fact.
export type InstallScope = "default" | "hq" | "portal";

const DISMISSED_KEYS: Record<InstallScope, string> = {
  default: "kynovant:pwa-install-dismissed",
  hq: "kynovant:pwa-install-dismissed:hq",
  portal: "kynovant:pwa-install-dismissed:portal",
};

function readDismissed(scope: InstallScope): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEYS[scope]) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(scope: InstallScope, value: boolean) {
  try {
    if (value) window.localStorage.setItem(DISMISSED_KEYS[scope], "true");
    else window.localStorage.removeItem(DISMISSED_KEYS[scope]);
  } catch {
    // Storage can be unavailable in some private browsing contexts.
  }
}

function getEnvironment(nativePromptHeld: boolean) {
  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
    displayModeStandalone: Boolean(standaloneQuery?.matches),
    navigatorStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    hasNativePrompt: nativePromptHeld,
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
   * "unavailable" instead of an unhandled rejection (handled in the
   * store's consumeNativePrompt). */
  install: () => Promise<InstallOutcome>;
  dismiss: () => void;
}

export function usePwaInstallState(scope: InstallScope = "default"): UsePwaInstallStateResult {
  // Subscribes to the singleton browser-event store and re-renders on any
  // change (prompt captured, appinstalled, display-mode flip). The server
  // snapshot is a stable constant, so SSR and the pre-mount client render
  // agree.
  const storeVersion = useSyncExternalStore(
    subscribeInstallStore,
    getInstallStoreVersion,
    getInstallStoreServerVersion,
  );

  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Belt-and-suspenders: PwaInstallBoot (app/layout.tsx) already starts
    // the store, and useSyncExternalStore's subscribe starts it too; this
    // just guarantees it for any consumer that somehow renders first.
    ensureInstallStoreStarted();
    setMounted(true);
    setDismissed(readDismissed(scope));
    setIsMobile(
      isMobileDevice({
        userAgent: window.navigator.userAgent,
        platform: window.navigator.platform,
        maxTouchPoints: window.navigator.maxTouchPoints,
      }),
    );
  }, [scope]);

  const surface: InstallSurface = useMemo(() => {
    if (!mounted) return "unsupported";
    // An appinstalled event this session wins even before display-mode
    // has flipped to standalone (the old hook special-cased this too).
    if (isInstalledSignal()) return "installed";
    return resolveInstallSurface(getEnvironment(hasNativePrompt()));
    // storeVersion is the dependency that makes this recompute when the
    // store changes; mounted gates the first real read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, storeVersion]);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (surface === "ios_instructions") return "ios_instructions";
    const outcome = await consumeNativePrompt();
    if (outcome === "dismissed") {
      setDismissed(true);
      writeDismissed(scope, true);
    }
    return outcome;
  }, [surface, scope]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeDismissed(scope, true);
  }, [scope]);

  return { mounted, surface, dismissed, isMobile, install, dismiss };
}
