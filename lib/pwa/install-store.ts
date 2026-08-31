// ─────────────────────────────────────────────────────────────
// PWA install store — a module-level singleton that owns the browser's
// `beforeinstallprompt` / `appinstalled` / display-mode lifecycle for
// the entire tab.
//
// Why a singleton and not per-component state (the bug this fixes):
// `beforeinstallprompt` fires ONCE per eligible page load and is not
// re-fired on App Router (SPA) navigation. The old design captured it
// inside usePwaInstallState's own useState, so any component that
// remounted during Portal navigation — and the Portal shell/install
// components do remount — permanently lost the captured event, and with
// it the only way to invoke the native install prompt. On Android that
// meant "no Kynovant install affordance at all" whenever the mounted
// component didn't happen to be holding the event.
//
// This store is started once, at the earliest client boundary
// (components/pwa/PwaInstallBoot.tsx, mounted in app/layout.tsx — the
// persistent root layout) and also lazily by the first usePwaInstallState
// consumer as a fallback. Its window listeners are attached exactly once
// and are NEVER removed — the store lives for the lifetime of the
// document, so a captured prompt event survives unlimited React
// remounting and every Portal navigation.
//
// It does NOT own dismissal state. Per-scope dismissal stays in
// use-install-state.ts (device-local localStorage, three scoped keys) —
// unchanged by this refactor.
// ─────────────────────────────────────────────────────────────

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type PromptConsumeOutcome = "accepted" | "dismissed" | "unavailable";

type Listener = () => void;

let started = false;
let promptEvent: BeforeInstallPromptEvent | null = null;
let installed = false; // an `appinstalled` event fired this session
let version = 0; // bumps on every state change a consumer must observe
const listeners = new Set<Listener>();
let standaloneQuery: MediaQueryList | null = null;

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function onBeforeInstallPrompt(event: Event): void {
  // Suppress Chromium's automatic mini-infobar — Kynovant surfaces its
  // own install affordance and calls prompt() from an explicit user tap.
  event.preventDefault();
  promptEvent = event as BeforeInstallPromptEvent;
  // Deliberately touches nothing else — not dismissal (this store has no
  // concept of it), not `installed`. Chromium re-fires this on nearly
  // every qualifying full page load; it must never be read as "the user
  // changed their mind."
  emit();
}

function onAppInstalled(): void {
  promptEvent = null;
  installed = true;
  emit();
}

function onStandaloneChange(): void {
  // display-mode: standalone can flip mid-session (installed from the
  // browser UI while the tab stays open). Consumers re-derive surface.
  emit();
}

/**
 * Attach the singleton window listeners. Idempotent and SSR-safe: a
 * no-op on the server and on every call after the first (so React Strict
 * Mode's double-invoke, multiple providers, and lazy consumer starts all
 * converge on exactly one set of listeners). The listeners are never
 * torn down — that is the whole point.
 */
export function ensureInstallStoreStarted(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
  standaloneQuery = window.matchMedia?.("(display-mode: standalone)") ?? null;
  standaloneQuery?.addEventListener?.("change", onStandaloneChange);
}

/** useSyncExternalStore subscribe — also lazily starts the store. */
export function subscribeInstallStore(listener: Listener): () => void {
  ensureInstallStoreStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** useSyncExternalStore snapshot — a monotonically increasing version. */
export function getInstallStoreVersion(): number {
  return version;
}

/** Server snapshot for useSyncExternalStore — stable, never changes. */
export function getInstallStoreServerVersion(): number {
  return 0;
}

/** Whether a live, unconsumed beforeinstallprompt event is currently held. */
export function hasNativePrompt(): boolean {
  return promptEvent !== null;
}

/** Whether an `appinstalled` event has fired in this session. */
export function isInstalledSignal(): boolean {
  return installed;
}

/**
 * Fire the native install prompt from a user gesture and report the
 * outcome. A beforeinstallprompt event is single-use: it is cleared
 * whether the user accepts or dismisses, and whether prompt()/userChoice
 * resolves or rejects (a stale/revoked event can reject — fail closed to
 * "unavailable" rather than surface an unhandled rejection). Never
 * invoked automatically; there is no silent-install path.
 */
export async function consumeNativePrompt(): Promise<PromptConsumeOutcome> {
  const event = promptEvent;
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const choice = await event.userChoice;
    promptEvent = null;
    emit();
    return choice.outcome;
  } catch {
    promptEvent = null;
    emit();
    return "unavailable";
  }
}

/**
 * Test-only: reset the singleton so a fresh test can simulate "no
 * listeners attached yet -> event fires -> consumer mounts". Not used by
 * application code.
 */
export function __resetInstallStoreForTests(): void {
  started = false;
  promptEvent = null;
  installed = false;
  version = 0;
  listeners.clear();
  standaloneQuery = null;
}
