// ─────────────────────────────────────────────────────────────
// Kynovant — Service Worker registration decision (V1).
//
// Pure host/environment logic for "should this client register the
// service worker, unregister an existing one, or do nothing". Kept
// separate from components/pwa/ServiceWorkerBoot.tsx so it is unit-
// testable in the repo's node-only Vitest setup, and separate from the
// accepted install-state architecture (lib/pwa/install-store.ts /
// PwaInstallBoot) — different lifecycle, different failure domain,
// different kill path. See docs/service-worker.md.
//
// V1 is INFRASTRUCTURE, NOT OFFLINE MODE: the worker itself
// (public/sw.js) has no fetch handler and no Cache Storage use.
// ─────────────────────────────────────────────────────────────

import { hostBrand } from "@/lib/domain-routing";

/** The one canonical worker URL. Stable forever — the emergency
 *  tombstone (public/sw-kill.js) is deployed by replacing THIS file's
 *  body at THIS url. Never hash or version the filename. */
export const SW_URL = "/sw.js";

/** Root scope — broad CONTROL (needed for the future Web Push slice's
 *  notificationclick navigation across /portal, /hq, /account, /app),
 *  NOT broad caching. V1 caches nothing. */
export const SW_SCOPE = "/";

/**
 * Secondary, page-JavaScript kill switch.
 *
 * The PRIMARY emergency mechanism is the same-URL tombstone: replace
 * public/sw.js's body with public/sw-kill.js's body and deploy (see
 * docs/service-worker.md). This constant is the backup path — flip it
 * to `true` ONLY during an incident, together with the tombstone swap.
 * It only reaches clients that still successfully load app JavaScript,
 * which a broken worker may prevent — hence secondary.
 */
export const SW_KILL = false;

export type ServiceWorkerRegistrationDecision = "register" | "unregister" | "noop";

export interface ServiceWorkerEnvironment {
  /** window.location.hostname */
  hostname: string;
  /** window.isSecureContext */
  isSecureContext: boolean;
  /** "serviceWorker" in navigator */
  serviceWorkerSupported: boolean;
  /** window.location.search, e.g. "?__sw=1" */
  search: string;
  /** SW_KILL (or an incident override) */
  kill: boolean;
}

const PREVIEW_HOST_SUFFIX = ".vercel.app";
const PREVIEW_OPT_IN_PARAM = "__sw";

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().split(":")[0];
}

function isVercelPreviewHost(hostname: string): boolean {
  return normalizeHost(hostname).endsWith(PREVIEW_HOST_SUFFIX);
}

function hasPreviewOptIn(search: string): boolean {
  try {
    return new URLSearchParams(search).get(PREVIEW_OPT_IN_PARAM) === "1";
  } catch {
    return false;
  }
}

/**
 * Pure decision. Order matters:
 *
 *  1. KILL is evaluated FIRST and is host-independent by design. If a
 *     bad worker shipped, we must be able to clean it up from ANY origin
 *     a previously-registered client might now be on — cleanup must
 *     never be gated behind a host classification.
 *  2. Capability gates (serviceWorker support, secure context) — a
 *     browser that can't run a worker has nothing to register OR clean
 *     up.
 *  3. Host classification via the repo's existing domain-routing
 *     primitive: Kynovant production hosts register; Kept/Catalyst
 *     hosts never do.
 *  4. Unrecognized hosts (localhost, 127.0.0.1, *.vercel.app previews)
 *     are noop — EXCEPT an isolated *.vercel.app preview origin may opt
 *     in via ?__sw=1. localhost NEVER registers, even with ?__sw=1.
 *
 * NODE_ENV is deliberately NOT consulted: Vercel Preview and Production
 * both build with NODE_ENV=production, so it cannot distinguish them.
 */
export function resolveServiceWorkerRegistrationDecision(
  env: ServiceWorkerEnvironment,
): ServiceWorkerRegistrationDecision {
  if (env.kill) {
    // Try to clean up wherever the client is. The executor guards
    // `"serviceWorker" in navigator` and is fully best-effort, so a
    // browser with no worker API simply no-ops on this.
    return "unregister";
  }

  if (!env.serviceWorkerSupported) return "noop";
  if (!env.isSecureContext) return "noop";

  const brand = hostBrand(env.hostname);
  if (brand === "kynovant") return "register";
  if (brand === "catalyst") return "noop";

  if (isVercelPreviewHost(env.hostname) && hasPreviewOptIn(env.search)) {
    return "register";
  }

  return "noop";
}

/** Snapshots the live browser environment. Client-only. */
export function readServiceWorkerEnvironment(): ServiceWorkerEnvironment {
  return {
    hostname: window.location.hostname,
    isSecureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    search: window.location.search,
    kill: SW_KILL,
  };
}
