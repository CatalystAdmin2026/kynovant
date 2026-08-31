// ─────────────────────────────────────────────────────────────
// Service Worker V1 — structural (source-inspection) suite.
//
// The repo has no jsdom / browser Vitest env (vitest.config.ts:
// environment "node"), so real worker lifecycle is NOT provable here.
// This suite pins the STRUCTURE that guarantees the release invariant:
// the real worker is incapable of intercepting requests or touching
// Cache Storage. Real lifecycle / non-interception / empty-cache
// behaviour is verified on an isolated *.vercel.app?__sw=1 preview —
// see docs/service-worker.md.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const SW = source("public/sw.js");
const SW_KILL = source("public/sw-kill.js");
const BOOT = source("components/pwa/ServiceWorkerBoot.tsx");
const LAYOUT = source("app/layout.tsx");
const NEXT_CONFIG = source("next.config.ts");
const REGISTRATION = source("lib/pwa/service-worker-registration.ts");

describe("public/sw.js — the real V1 worker: no network behaviour", () => {
  it("has an explicit SW_VERSION constant", () => {
    expect(SW).toMatch(/const\s+SW_VERSION\s*=\s*["'][^"']+["']/);
  });

  it("has install and activate listeners", () => {
    expect(SW).toMatch(/self\.addEventListener\(\s*["']install["']/);
    expect(SW).toMatch(/self\.addEventListener\(\s*["']activate["']/);
  });

  it("has NO fetch-event listener (cannot intercept ANY request)", () => {
    expect(SW).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(SW).not.toMatch(/\bonfetch\s*=/);
  });

  it("makes NO Cache Storage calls", () => {
    expect(SW).not.toMatch(/\bcaches\s*\.\s*(open|match|keys|delete|has)\s*\(/);
    expect(SW).not.toMatch(/\bnew\s+Cache\b/);
  });

  it("uses NO IndexedDB", () => {
    expect(SW).not.toMatch(/\bindexedDB\b/);
  });

  it("does NOT call skipWaiting()", () => {
    expect(SW).not.toMatch(/skipWaiting\s*\(/);
  });

  it("does NOT call clients.claim()", () => {
    expect(SW).not.toMatch(/clients\s*\.\s*claim\s*\(/);
  });

  it("has NO push or notificationclick listener yet (Web Push is a separate slice)", () => {
    expect(SW).not.toMatch(/addEventListener\(\s*["'](push|notificationclick)["']/);
  });

  it("does not read cookies or storage", () => {
    expect(SW).not.toMatch(/document\s*\.\s*cookie/);
    expect(SW).not.toMatch(/localStorage|sessionStorage/);
  });

  it("stays tiny (auditable at a glance)", () => {
    expect(SW.split("\n").length).toBeLessThan(80);
  });
});

describe("public/sw-kill.js — the emergency tombstone", () => {
  it("is clearly marked DO NOT REGISTER", () => {
    expect(SW_KILL).toMatch(/DO NOT REGISTER THIS FILE DIRECTLY/i);
  });

  it("skips the waiting phase (removal is intentionally urgent)", () => {
    expect(SW_KILL).toMatch(/self\.skipWaiting\s*\(\s*\)/);
  });

  it("deletes Cache Storage entries defensively", () => {
    expect(SW_KILL).toMatch(/caches\s*\.\s*keys\s*\(/);
    expect(SW_KILL).toMatch(/caches\s*\.\s*delete\s*\(/);
  });

  it("unregisters its own registration", () => {
    expect(SW_KILL).toMatch(/self\.registration\.unregister\s*\(/);
  });

  it("navigates controlled window clients once to shed the dead controller (no loop)", () => {
    expect(SW_KILL).toMatch(/self\.clients\s*\.\s*matchAll\(\s*\{\s*type:\s*["']window["']\s*\}\s*\)/);
    expect(SW_KILL).toMatch(/\.navigate\(\s*[a-zA-Z]+\.url\s*\)/);
    // one navigate call, inside a bounded for-of — no setInterval / recursion
    expect(SW_KILL).not.toMatch(/setInterval|setTimeout/);
  });

  it("has its own version marker distinct from the real worker", () => {
    expect(SW_KILL).toMatch(/const\s+SW_VERSION\s*=\s*["']kill-/);
  });
});

describe("no normal registration of /sw-kill.js anywhere in app code", () => {
  it("ServiceWorkerBoot and the decision module only ever register /sw.js", () => {
    // Prose may reference the tombstone file by name (good docs); what
    // must never exist is a register() call or a URL literal for it.
    expect(BOOT).not.toMatch(/\.register\(\s*["']\/?sw-kill/);
    expect(REGISTRATION).not.toMatch(/\.register\(\s*["']\/?sw-kill/);
    expect(REGISTRATION).not.toMatch(/["']\/sw-kill\.js["']/);
    expect(BOOT).toContain("SW_URL");
    expect(REGISTRATION).toMatch(/SW_URL\s*=\s*["']\/sw\.js["']/);
    expect(BOOT).toMatch(/\.register\(\s*SW_URL/);
  });
});

describe("ServiceWorkerBoot — client boot component", () => {
  it("is a client component that renders nothing", () => {
    expect(BOOT.trimStart().startsWith('"use client"')).toBe(true);
    expect(BOOT).toMatch(/return null;/);
  });

  it("runs from an effect, guards unsupported browsers, and never throws into React", () => {
    expect(BOOT).toContain("useEffect(");
    expect(BOOT).toMatch(/["']serviceWorker["']\s+in\s+navigator/);
    expect(BOOT).toMatch(/\.register\(\s*SW_URL\s*,\s*\{\s*scope:\s*SW_SCOPE\s*\}\s*\)/);
    expect(BOOT).toMatch(/\.catch\(/);
  });

  it("has no fetch, cache-for-normal-registration, or notification logic", () => {
    expect(BOOT).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    // caches are only touched on the SECONDARY unregister/kill path,
    // never during a normal register.
    const registerBlock = BOOT.slice(
      BOOT.indexOf('decision === "register"'),
      BOOT.indexOf('decision === "unregister"'),
    );
    expect(registerBlock).not.toMatch(/caches\./);
  });

  it("delegates the host/environment decision to the pure module", () => {
    expect(BOOT).toContain('from "@/lib/pwa/service-worker-registration"');
    expect(BOOT).toContain("resolveServiceWorkerRegistrationDecision(");
  });
});

describe("root mount — app/layout.tsx", () => {
  it("mounts ServiceWorkerBoot exactly once", () => {
    expect(LAYOUT).toContain('import ServiceWorkerBoot from "@/components/pwa/ServiceWorkerBoot"');
    expect((LAYOUT.match(/<ServiceWorkerBoot \/>/g) ?? []).length).toBe(1);
  });

  it("keeps PwaInstallBoot mounted exactly once, as a sibling (responsibilities NOT merged)", () => {
    expect((LAYOUT.match(/<PwaInstallBoot \/>/g) ?? []).length).toBe(1);
  });
});

describe("next.config.ts — service-worker script headers", () => {
  it("serves /sw.js (and /sw-kill.js) with no-cache, JS MIME, and Service-Worker-Allowed: /", () => {
    expect(NEXT_CONFIG).toMatch(/source:\s*["']\/sw\.js["']/);
    expect(NEXT_CONFIG).toMatch(/source:\s*["']\/sw-kill\.js["']/);
    expect(NEXT_CONFIG).toMatch(/Cache-Control["']?\s*,\s*value:\s*["']no-cache, no-store, must-revalidate["']/);
    expect(NEXT_CONFIG).toMatch(/text\/javascript; charset=utf-8/);
    expect(NEXT_CONFIG).toMatch(/Service-Worker-Allowed["']?\s*,\s*value:\s*["']\/["']/);
  });

  it("does NOT set global security headers in this slice (prose may name them as out-of-scope)", () => {
    expect(NEXT_CONFIG).not.toMatch(/key:\s*["']Content-Security-Policy["']/);
    expect(NEXT_CONFIG).not.toMatch(/key:\s*["']Strict-Transport-Security["']/);
    expect(NEXT_CONFIG).not.toMatch(/key:\s*["']X-Frame-Options["']/);
    expect(NEXT_CONFIG).not.toMatch(/key:\s*["']Permissions-Policy["']/);
    expect(NEXT_CONFIG).not.toMatch(/key:\s*["']Referrer-Policy["']/);
  });
});

describe("accepted install-state architecture is untouched by name", () => {
  it("ServiceWorkerBoot does not import or wire into the install store / PwaInstallBoot (prose may explain the separation)", () => {
    expect(BOOT).not.toMatch(/import[^\n]*install-store/);
    expect(BOOT).not.toMatch(/import[^\n]*PwaInstallBoot/);
    expect(BOOT).not.toContain("ensureInstallStoreStarted");
    expect(BOOT).not.toContain("usePwaInstallState");
  });

  it("PwaInstallBoot still owns install-store startup (not moved into SW code)", () => {
    const pwaBoot = source("components/pwa/PwaInstallBoot.tsx");
    expect(pwaBoot).toContain("ensureInstallStoreStarted()");
    expect(pwaBoot).not.toContain("serviceWorker");
  });
});
