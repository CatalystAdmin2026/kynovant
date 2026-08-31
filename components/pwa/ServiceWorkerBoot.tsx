"use client";

// ─────────────────────────────────────────────────────────────
// Registers (or, on the secondary kill path, unregisters) the V1
// service worker — mounted once in app/layout.tsx, as a SIBLING of
// PwaInstallBoot, never merged with it. The install-state architecture
// (lib/pwa/install-store.ts) is untouched by this component.
//
// V1 = infrastructure, not offline mode. public/sw.js has no fetch
// handler and no Cache Storage use, so registration here can never
// cause stale/authenticated content to be served. See
// docs/service-worker.md.
//
// The host/environment decision is pure and lives in
// lib/pwa/service-worker-registration.ts (unit-tested). This component
// only executes it, from an effect, best-effort:
//   - unsupported browsers no-op;
//   - a registration failure NEVER throws into React, NEVER blocks
//     rendering, and NEVER changes the install UX;
//   - the unregister/kill path is SECONDARY (the primary emergency
//     mechanism is the same-URL tombstone) and does not loop or reload.
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";
import {
  SW_SCOPE,
  SW_URL,
  readServiceWorkerEnvironment,
  resolveServiceWorkerRegistrationDecision,
} from "@/lib/pwa/service-worker-registration";

function warnInDev(message: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[sw] ${message}`, error);
  }
}

export default function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const decision = resolveServiceWorkerRegistrationDecision(
      readServiceWorkerEnvironment(),
    );

    if (decision === "register") {
      navigator.serviceWorker
        .register(SW_URL, { scope: SW_SCOPE })
        .catch((error) => warnInDev("registration failed", error));
      return;
    }

    if (decision === "unregister") {
      // SECONDARY kill path. Primary is the same-URL tombstone (see
      // docs/service-worker.md) because a broken worker can prevent new
      // app JavaScript — including this code — from ever loading.
      // Best-effort, never throws, no reload (the tombstone reloads).
      void (async () => {
        try {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) =>
              registration.unregister().catch(() => false),
            ),
          );
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
          }
        } catch (error) {
          warnInDev("kill path failed", error);
        }
      })();
    }

    // decision === "noop" → intentionally nothing.
  }, []);

  return null;
}
