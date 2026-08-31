// ─────────────────────────────────────────────────────────────
// PWA install persistence — architecture (source-inspection) suite.
//
// Pairs with install-store.test.ts (which proves the store's runtime
// behaviour). This file pins the WIRING: the browser event is owned by a
// tab-lifetime singleton started at the persistent root boundary, and
// every consumer reads from it instead of owning its own listener.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const STORE = "lib/pwa/install-store.ts";
const HOOK = "lib/pwa/use-install-state.ts";
const BOOT = "components/pwa/PwaInstallBoot.tsx";
const ROOT_LAYOUT = "app/layout.tsx";
const INSTALL_KYNOVANT = "components/pwa/InstallKynovant.tsx";
const PORTAL_ONBOARDING = "components/pwa/PortalInstallOnboarding.tsx";
const PORTAL_MOBILE_HEADER = "components/portal/PortalMobileHeader.tsx";
const MANIFEST = "app/manifest.ts";

describe("Singleton store — one listener set, module scope, never torn down", () => {
  const store = source(STORE);

  it("holds the captured prompt event in module scope, not React state", () => {
    expect(store).toMatch(/^let promptEvent: BeforeInstallPromptEvent \| null = null;/m);
    expect(store).not.toMatch(/from ["']react["']/);
    expect(store).not.toMatch(/\buseState\(/);
    expect(store).not.toContain('"use client"');
  });

  it("attaches window listeners behind an idempotent `started` guard", () => {
    expect(store).toContain("if (started || typeof window === \"undefined\") return;");
    expect(store).toContain("started = true;");
    expect(store).toContain('window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)');
    expect(store).toContain('window.addEventListener("appinstalled", onAppInstalled)');
  });

  it("NEVER removes the beforeinstallprompt / appinstalled listeners — the store outlives every component", () => {
    expect(store).not.toMatch(/removeEventListener\(\s*["']beforeinstallprompt["']/);
    expect(store).not.toMatch(/removeEventListener\(\s*["']appinstalled["']/);
  });

  it("suppresses the mini-infobar and does not auto-invoke the prompt", () => {
    expect(store).toContain("event.preventDefault();");
    // The only prompt() call sits inside consumeNativePrompt(), which is
    // only ever reached from a user-gesture handler in the hook.
    const promptCalls = store.match(/\.prompt\(\)/g) ?? [];
    expect(promptCalls.length).toBe(1);
    expect(store.indexOf(".prompt()")).toBeGreaterThan(store.indexOf("export async function consumeNativePrompt"));
  });

  it("exposes a useSyncExternalStore-shaped API (subscribe + client + server snapshot)", () => {
    expect(store).toContain("export function subscribeInstallStore(");
    expect(store).toContain("export function getInstallStoreVersion(");
    expect(store).toContain("export function getInstallStoreServerVersion(");
    expect(store).toContain("return 0;"); // stable server snapshot
  });
});

describe("Root boot — capture starts at the persistent layout boundary", () => {
  const boot = source(BOOT);
  const layout = source(ROOT_LAYOUT);

  it("PwaInstallBoot is a client component that starts the store and renders nothing", () => {
    expect(boot.trimStart().startsWith('"use client"')).toBe(true);
    expect(boot).toContain("ensureInstallStoreStarted()");
    expect(boot).toContain("return null;");
  });

  it("PwaInstallBoot's effect returns no cleanup (the store is tab-lifetime, not component-lifetime)", () => {
    // A `return () => ...` inside the effect would imply teardown.
    const effect = boot.slice(boot.indexOf("useEffect("));
    expect(effect).not.toMatch(/return\s*\(\s*\)\s*=>/);
  });

  it("is mounted once in the root layout (app/layout.tsx), above {children}", () => {
    expect(layout).toContain('import PwaInstallBoot from "@/components/pwa/PwaInstallBoot"');
    expect(layout).toContain("<PwaInstallBoot />");
    expect(layout.indexOf("<PwaInstallBoot />")).toBeLessThan(layout.indexOf("{children}"));
  });
});

describe("usePwaInstallState — a view over the store, no private browser listeners", () => {
  const hook = source(HOOK);

  it("no longer registers its own beforeinstallprompt / appinstalled listeners", () => {
    expect(hook).not.toMatch(/addEventListener\(\s*["']beforeinstallprompt["']/);
    expect(hook).not.toMatch(/addEventListener\(\s*["']appinstalled["']/);
  });

  it("subscribes to the singleton store via useSyncExternalStore", () => {
    expect(hook).toContain('from "./install-store"');
    expect(hook).toContain("useSyncExternalStore(");
    expect(hook).toContain("subscribeInstallStore");
  });

  it("keeps per-scope dismissal exactly as before — three localStorage keys, no DB", () => {
    expect(hook).toMatch(/default:\s*"kynovant:pwa-install-dismissed",/);
    expect(hook).toMatch(/hq:\s*"kynovant:pwa-install-dismissed:hq",/);
    expect(hook).toMatch(/portal:\s*"kynovant:pwa-install-dismissed:portal",/);
    expect(hook).not.toMatch(/fetch\(|getDb\(|drizzle/);
  });

  it("preserves the public hook signature so existing consumers are untouched", () => {
    expect(hook).toContain('export function usePwaInstallState(scope: InstallScope = "default")');
    expect(hook).toContain("return { mounted, surface, dismissed, isMobile, install, dismiss };");
  });
});

describe("Consumers unchanged — still the shared hook, no re-wiring", () => {
  it("InstallKynovant and PortalInstallOnboarding both consume usePwaInstallState only", () => {
    for (const file of [INSTALL_KYNOVANT, PORTAL_ONBOARDING]) {
      const src = source(file);
      expect(src).toContain('from "@/lib/pwa/use-install-state"');
      expect(src).not.toMatch(/addEventListener\(\s*["']beforeinstallprompt["']/);
    }
  });

  it("the new Portal mobile header still exposes the install entry (menu variant, portal scope)", () => {
    expect(source(PORTAL_MOBILE_HEADER)).toMatch(/<InstallKynovant variant="menu" scope="portal" \/>/);
  });
});

describe("Platform hint surfaces — accurate fallbacks, not silent disappearance", () => {
  const component = source(INSTALL_KYNOVANT);

  it("renders a browser-neutral hint for ios_open_in_safari and android_manual", () => {
    expect(component).toContain('surface === "ios_open_in_safari" || surface === "android_manual"');
    expect(component).toContain("Open in Safari, then Share → Add to Home Screen.");
    expect(component).toContain("Open your browser menu, then");
  });

  it("keeps the hint OUT of the prominent card variant (card = actionable surfaces only)", () => {
    expect(component).toContain('if (variant === "card" && (dismissed || isHint)) {');
  });

  it("never prints Android browser-specific menu paths that would be wrong in other Android browsers", () => {
    expect(component).not.toMatch(/three-dot|⋮|Chrome menu|Samsung Internet/i);
  });
});

describe("Manifest — stable identity pinned", () => {
  const manifest = source(MANIFEST);

  it("declares an explicit id, still start_url /app, still scope /", () => {
    expect(manifest).toMatch(/id:\s*"\/app"/);
    expect(manifest).toContain('start_url: "/app"');
    expect(manifest).toContain('scope: "/"');
    expect(manifest).toContain('display: "standalone"');
  });
});
