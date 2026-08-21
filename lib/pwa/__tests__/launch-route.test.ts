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

describe("P0 FIX — /app must never expose a raw server exception (digest 877070528)", () => {
  // Real production incident: three real clients (Monica Wiazdowski,
  // Jenny Ryan, Maddie Ryan) each hit a raw Next.js
  // "Application error: a server-side exception has occurred" page,
  // digest 877070528, tapping their installed Home Screen icon. Proven
  // via Vercel production runtime logs (not assumed): getPublicUser()'s
  // query threw Postgres error XX000 (EMAXCONNSESSION — Supabase
  // Session Mode's 15-connection pool transiently exhausted by
  // concurrent app-wide load), uncaught, inside this Route Handler.
  // Reproduced directly against staging by genuinely saturating its
  // connection pool and hitting the live route: pre-fix, HTTP 500;
  // post-fix, a clean redirect — see this task's report for the full
  // before/after proof. This suite pins the structural fix (an
  // unhandled throw here can never happen again by construction).
  it("wraps the entire route body in a top-level try/catch that falls back to /login on any unanticipated failure", () => {
    const tryIndex = LAUNCH_ROUTE.indexOf("try {");
    const exportIndex = LAUNCH_ROUTE.indexOf("export async function GET(");
    expect(tryIndex).toBeGreaterThan(exportIndex);
    // The final catch block (after the last getPublicUser-specific
    // one) must itself redirect to a plain /login — never rethrow,
    // never let the framework's default 500 handler render.
    const lastCatchIndex = LAUNCH_ROUTE.lastIndexOf("} catch {");
    const tail = LAUNCH_ROUTE.slice(lastCatchIndex);
    expect(tail).toContain("return NextResponse.redirect(`${origin}/login`);");
  });

  it("wraps getPublicUser() in its own try/catch — a DB failure on an otherwise-valid session degrades to the existing null-row fallback, not a crash", () => {
    const callIndex = LAUNCH_ROUTE.indexOf("dbUser = await getPublicUser(authUser.id);");
    expect(callIndex).toBeGreaterThan(-1);
    // That call site must itself be inside a try, with a catch that
    // sets dbUser back to null rather than propagating the error.
    const precedingTry = LAUNCH_ROUTE.lastIndexOf("try {", callIndex);
    const followingCatch = LAUNCH_ROUTE.indexOf("} catch {", callIndex);
    expect(precedingTry).toBeGreaterThan(-1);
    expect(followingCatch).toBeGreaterThan(callIndex);
    const catchBody = LAUNCH_ROUTE.slice(followingCatch, followingCatch + 60);
    expect(catchBody).toContain("dbUser = null;");
  });

  it("a getPublicUser() failure can only ever degrade to the SAME lowest-privilege fallback already used for a legitimately-missing row — never a different, more-privileged path", () => {
    // Exactly one role-resolution line in the whole file — the catch
    // branch doesn't special-case anything, it just leaves dbUser
    // null and falls through to the one existing line below.
    const roleLines = LAUNCH_ROUTE_CODE.match(/const role = dbUser\?\.role \?\? "client";/g) ?? [];
    expect(roleLines.length).toBe(1);
  });

  it("signOut() is also guarded — a failed cleanup call cannot prevent the access_denied redirect from completing", () => {
    const signOutIndex = LAUNCH_ROUTE.indexOf("await supabase.auth.signOut();");
    expect(signOutIndex).toBeGreaterThan(-1);
    const precedingTry = LAUNCH_ROUTE.lastIndexOf("try {", signOutIndex);
    const followingCatch = LAUNCH_ROUTE.indexOf("} catch {", signOutIndex);
    expect(precedingTry).toBeGreaterThan(-1);
    expect(followingCatch).toBeGreaterThan(signOutIndex);
    // The access_denied redirect must come after that inner try/catch,
    // not inside the try itself — i.e. it always executes regardless
    // of whether signOut() succeeded.
    const accessDeniedIndex = LAUNCH_ROUTE.indexOf("/login?error=access_denied");
    expect(accessDeniedIndex).toBeGreaterThan(followingCatch);
  });

  it("still resolves the correct destination for a valid session once the DB is healthy — the fix didn't weaken the happy path", () => {
    expect(LAUNCH_ROUTE_CODE).toContain('dbUser?.status === "suspended" || dbUser?.status === "archived"');
    expect(LAUNCH_ROUTE_CODE).toContain('const role = dbUser?.role ?? "client";');
    expect(LAUNCH_ROUTE_CODE).toContain("resolvePostLoginRedirect(null, role)");
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
