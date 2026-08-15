// ─────────────────────────────────────────────────────────────
// Normal password-recovery redirect — source-level regression gates.
//
// Same "read the source, assert on it" style as
// production-security-release.test.ts / coach-signup-security.test.ts /
// resend-isolation-security.test.ts — these are invariants about how
// the code is written, not just how it behaves for one input, so they
// stay true even for a code path a runtime test wouldn't happen to
// exercise (e.g. the exact browser origin a real user's tab has).
//
// Root cause this whole suite guards against: app/forgot-password/
// page.tsx built resetPasswordForEmail's redirectTo from
// window.location.origin. Supabase's redirect-URL allow list rejects
// a bare-apex origin (https://kynovant.com/...) once a query string is
// appended, silently falling back to the project's Site URL and
// stripping both the /auth/callback path and the type=recovery marker
// — landing the user on the public homepage with an unusable bare
// ?code=... See lib/site-url.ts's header comment and
// lib/auth/__tests__/recovery-redirect-supabase.test.ts for the live
// reproduction against the real Supabase allow list.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("normal recovery redirectTo — canonical SITE_URL, never window.location.origin", () => {
  it("app/forgot-password/page.tsx builds redirectTo from SITE_URL and includes /auth/callback?type=recovery", () => {
    const route = source("app/forgot-password/page.tsx");
    expect(route).toContain('import { SITE_URL } from "@/lib/site-url"');
    expect(route).toContain("redirectTo: `${SITE_URL}/auth/callback?type=recovery`");
    // The specific bug: building this from the browser's current origin
    // instead of the canonical, always-allow-listed constant. (Only
    // asserting the template-literal construction is gone — an
    // explanatory code comment is allowed to mention the phrase.)
    expect(route).not.toContain("${window.location.origin}");
  });

  it("app/login/page.tsx's magic-link emailRedirectTo also uses SITE_URL, never window.location.origin", () => {
    const route = source("app/login/page.tsx");
    expect(route).toContain('import { SITE_URL } from "@/lib/site-url"');
    expect(route).toContain("emailRedirectTo: `${SITE_URL}/auth/callback");
    expect(route).not.toContain("${window.location.origin}");
  });

  it("proxy.ts's Kynovant redirect target is the same canonical SITE_URL, not a bare-apex fallback", () => {
    const route = source("proxy.ts");
    expect(route).toContain('import { SITE_URL } from "@/lib/site-url"');
    expect(route).toContain("const KYNOVANT_URL = SITE_URL;");
    // The specific pre-existing bug: a hardcoded fallback that omitted
    // "www." — inconsistent with every other NEXT_PUBLIC_SITE_URL
    // fallback in the codebase, and live in production since
    // NEXT_PUBLIC_SITE_URL is unset in Vercel.
    expect(route).not.toContain('?? "https://kynovant.com"');
  });

  it("lib/site-url.ts's fallback matches the www host, consistent with every other call site", () => {
    const config = source("lib/site-url.ts");
    expect(config).toContain('process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com"');
  });
});

describe("normal recovery callback routing — unchanged, verified still present", () => {
  it("app/auth/callback/route.ts (PKCE ?code= path) still routes type=recovery to /reset-password", () => {
    const route = source("app/auth/callback/route.ts");
    expect(route).toMatch(/if \(type === "recovery"\)[\s\S]{0,200}\/reset-password/);
  });

  it("app/auth/fragment-callback/page.tsx (implicit #access_token= path) still routes type=recovery to /reset-password", () => {
    const route = source("app/auth/fragment-callback/page.tsx");
    expect(route).toMatch(/if \(type === "recovery"\)[\s\S]{0,200}\/reset-password/);
  });

  it("app/reset-password/page.tsx still calls updateUser({ password }) and redirects non-Overwatch users to /login", () => {
    const route = source("app/reset-password/page.tsx");
    expect(route).toContain("supabase.auth.updateUser({ password })");
    expect(route).toContain('"/login?message=password_updated"');
  });

  it("neither callback entry point ever redirects a recovery/invite type to the bare origin or root path", () => {
    for (const file of ["app/auth/callback/route.ts", "app/auth/fragment-callback/page.tsx"]) {
      const route = source(file);
      // The bug this whole fix addresses landed users on `origin` alone
      // (the public homepage) instead of a specific auth destination —
      // neither file should ever construct a bare `${origin}` (or
      // fragment-callback's client-side equivalent) redirect for the
      // recovery/invite branches specifically.
      expect(route).not.toMatch(/type === "recovery"\)[\s\S]{0,120}redirect\(`\$\{origin\}`\)/);
      expect(route).not.toMatch(/type === "recovery"\)[\s\S]{0,120}window\.location\.replace\(origin\)/);
    }
  });
});

describe("Overwatch context isolation — preserved only for Overwatch flows, unmodified by this fix", () => {
  it("OverwatchLoginClient.tsx was not touched by this change (still uses its own window.location.origin, unchanged)", () => {
    // Deliberately NOT asserting this should be fixed — this task is
    // scoped to the NORMAL coach/client recovery flow only. Asserting
    // the Overwatch file is untouched (still on its pre-existing
    // pattern) is itself the regression guard: if a future change
    // accidentally rewrites this file while "helpfully" applying the
    // same SITE_URL fix, this test's git-blame will make that obvious
    // as an out-of-scope change to review, not a silent side effect.
    const route = source("app/overwatch/login/OverwatchLoginClient.tsx");
    expect(route).toContain("window.location.origin");
  });

  it("normal recovery/login flows never set overwatch=1 and never default to /overwatch", () => {
    const forgotPassword = source("app/forgot-password/page.tsx");
    const login = source("app/login/page.tsx");
    expect(forgotPassword).not.toContain("overwatch=1");
    expect(forgotPassword).not.toContain("/overwatch");
    expect(login).not.toContain("overwatch=1");
    expect(login).not.toContain("/overwatch");
  });

  it("the callback routes only enter the Overwatch branch when overwatch=1 was explicitly requested", () => {
    for (const file of ["app/auth/callback/route.ts", "app/auth/fragment-callback/page.tsx"]) {
      const route = source(file);
      expect(route).toMatch(/overwatch === "1"/);
    }
  });
});
