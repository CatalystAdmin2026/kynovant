// ─────────────────────────────────────────────────────────────
// app/app/route.ts — PWA cold-launch entry point — source-inspection suite
//
// This route depends on a real Next.js request/cookie scope
// (next/headers cookies(), a live Supabase session) — same "read the
// source, assert on it" convention already established throughout
// this codebase for guard/route code a bare vitest process can't
// mount (see lib/auth/__tests__/rd-credential-gate.test.ts's header
// comment for the precedent, and lib/auth/__tests__/
// onboarding-gate-architecture.test.ts for the identical pattern
// applied to other new route.ts files this session).
//
// P0 production incident this closes: app/manifest.ts's start_url was
// "/" — launching the installed Home Screen icon opened the public
// marketing homepage instead of the authenticated user's actual app
// (Client Portal for a client, Coach HQ for a coach), confirmed by a
// real client (Fiona Walczynski) in production.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const LAUNCH_ROUTE = source("app/app/route.ts");
const MANIFEST = source("app/manifest.ts");
const ROLE_REDIRECT = source("app/auth/role-redirect/route.ts");

// Code only — everything after the last line of the file's own header
// comment block, so assertions about what the CODE does/doesn't
// contain aren't tripped up by the header's own explanatory prose
// mentioning the same strings (e.g. explaining why syncUserToPublic is
// NOT called, or how this differs from role-redirect's
// auth_callback_failed case).
const LAUNCH_ROUTE_CODE = LAUNCH_ROUTE.slice(LAUNCH_ROUTE.lastIndexOf("─────\n") + "─────\n".length);

describe("app/app/route.ts — role-based PWA launch delegator", () => {
  it("reuses the canonical resolvePostLoginRedirect + getPublicUser primitives — not a second, invented role system", () => {
    expect(LAUNCH_ROUTE).toContain('import { getPublicUser } from "@/lib/auth/sync"');
    expect(LAUNCH_ROUTE).toContain('import { resolvePostLoginRedirect } from "@/lib/auth/redirect"');
    expect(LAUNCH_ROUTE).toContain("resolvePostLoginRedirect(null, role)");
  });

  it("an unauthenticated launch goes to a clean /login — no error param, unlike role-redirect's own unauthenticated fallback", () => {
    expect(LAUNCH_ROUTE).toMatch(/if \(!authUser\) \{\s*\n\s*return NextResponse\.redirect\(`\$\{origin\}\/login`\);/);
    // Explicitly NOT the same wording-mismatched error role-redirect uses for its own (different) unauthenticated case.
    expect(LAUNCH_ROUTE_CODE).not.toContain("/login?error=auth_callback_failed");
  });

  it("a suspended/archived account is signed out and sent to the existing access_denied error, same as role-redirect", () => {
    expect(LAUNCH_ROUTE).toContain('dbUser?.status === "suspended" || dbUser?.status === "archived"');
    expect(LAUNCH_ROUTE).toContain("await supabase.auth.signOut();");
    expect(LAUNCH_ROUTE).toContain("/login?error=access_denied");
  });

  it("role falls back to \"client\" when no public.users row exists yet, matching role-redirect's own fallback exactly", () => {
    expect(LAUNCH_ROUTE).toContain('const role = dbUser?.role ?? "client";');
    expect(ROLE_REDIRECT).toContain('const role = dbUser?.role ?? "client";');
  });

  it("does NOT call syncUserToPublic — this is a routine relaunch entry point, not a post-auth-event sync step", () => {
    expect(LAUNCH_ROUTE_CODE).not.toContain("syncUserToPublic");
  });

  it("no redirect loop: every destination this route can produce is a dead end relative to /app", () => {
    // Every destination is one of: /login, /login?error=access_denied,
    // or whatever resolvePostLoginRedirect(null, role) returns
    // (/admin, /hq, /portal per lib/auth/redirect.ts's ROLE_FALLBACK)
    // — none of those routes redirect back to /app.
    const destinations = [...LAUNCH_ROUTE.matchAll(/redirect\(`\$\{origin\}([^`]*)`\)/g)].map((m) => m[1]);
    expect(destinations.length).toBeGreaterThan(0);
    for (const dest of destinations) {
      expect(dest).not.toContain("/app");
    }
  });

  it("is a GET Route Handler at app/app/route.ts, matching the manifest's declared start_url", () => {
    expect(LAUNCH_ROUTE).toContain("export async function GET(");
    expect(MANIFEST).toContain('start_url: "/app"');
  });
});

describe("app/manifest.ts — start_url no longer the marketing homepage", () => {
  it("start_url points at the role-aware launch delegator, not \"/\"", () => {
    expect(MANIFEST).toContain('start_url: "/app"');
    expect(MANIFEST).not.toMatch(/start_url:\s*"\/",/);
  });

  it("scope remains broad (\"/\") — the whole app stays inside the installed PWA container", () => {
    expect(MANIFEST).toContain('scope: "/"');
  });
});
