"use client";

// ─────────────────────────────────────────────────────────────
// Starts the PWA install store (lib/pwa/install-store.ts) at the
// earliest persistent client boundary — mounted once in app/layout.tsx,
// the root layout that never unmounts across any navigation.
//
// This is what makes the captured beforeinstallprompt event outlive
// every component remount and every App Router navigation: the store's
// window listeners attach here, on first hydration, and are never torn
// down. Renders nothing.
//
// StrictMode-safe: ensureInstallStoreStarted() is idempotent and this
// effect intentionally returns no cleanup — the store is a tab-lifetime
// singleton by design, not tied to this component's lifecycle.
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { ensureInstallStoreStarted } from "@/lib/pwa/install-store";

export default function PwaInstallBoot() {
  useEffect(() => {
    ensureInstallStoreStarted();
  }, []);
  return null;
}
