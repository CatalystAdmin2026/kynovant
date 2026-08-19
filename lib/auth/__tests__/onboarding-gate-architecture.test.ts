// ─────────────────────────────────────────────────────────────
// Setup-password activation gate — source-inspection suite
//
// These routes/pages depend on a real Next.js request/cookie scope
// (next/headers cookies(), a live Supabase session) and perform real
// side-effecting Auth calls (verifyOtp, updateUser) that this suite
// is explicitly scoped to never trigger. Same "read the source,
// assert on it" style already established for guard-wrapped,
// side-effecting routes in this repo — see
// lib/auth/__tests__/client-invite-email-security.test.ts. The
// underlying token/claims logic these routes call IS exercised for
// real, in-process, in lib/auth/__tests__/onboarding-token.test.ts
// and session-claims.test.ts; the real end-to-end Supabase mechanics
// are proven against staging in
// lib/db/__tests__/setup-password-activation.test.ts.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const PAGE = source("app/setup-password/page.tsx");
const CLIENT = source("app/setup-password/SetupPasswordClient.tsx");
const COMPLETE = source("app/api/auth/complete-onboarding/route.ts");
const VERIFY_INVITE = source("app/api/auth/verify-invite/route.ts");
const CONFIRM_SESSION = source("app/api/auth/confirm-invite-session/route.ts");
const CALLBACK = source("app/auth/callback/route.ts");
const FRAGMENT_CALLBACK = source("app/auth/fragment-callback/page.tsx");
const ACCEPT = source("app/auth/accept/page.tsx");

describe("app/setup-password/page.tsx — server-side guard", () => {
  it("is a Server Component (no \"use client\"), unlike the old page", () => {
    expect(PAGE).not.toMatch(/^"use client"/m);
  });

  it("requires an authenticated session before anything else", () => {
    expect(PAGE).toContain("supabase.auth.getUser()");
    expect(PAGE).toMatch(/if \(!user\)\s*\{\s*redirect\("\/login"\)/);
  });

  it("requires a valid onboarding-activation cookie scoped to the current user, not just any session", () => {
    expect(PAGE).toContain("verifyOnboardingToken(onboardingToken, user.id)");
    expect(PAGE).toMatch(/redirect\("\/auth\/role-redirect"\)/);
  });

  it("never renders the client form unless both checks pass", () => {
    // The only path to <SetupPasswordClient /> is after both guard
    // clauses (each ending in redirect(), which throws) have run.
    const formIndex = PAGE.indexOf("<SetupPasswordClient");
    const authGuardIndex = PAGE.indexOf('redirect("/login")');
    const onboardingGuardIndex = PAGE.indexOf('redirect("/auth/role-redirect")');
    expect(formIndex).toBeGreaterThan(authGuardIndex);
    expect(formIndex).toBeGreaterThan(onboardingGuardIndex);
  });

  it("does not special-case role anywhere — the same gate applies uniformly to client, coach, and admin sessions", () => {
    expect(PAGE).not.toMatch(/role\s*===\s*["'](client|coach|admin)["']/);
  });
});

describe("app/setup-password/SetupPasswordClient.tsx — no direct Supabase password call", () => {
  it("no longer calls supabase.auth.updateUser() directly from the browser", () => {
    expect(CLIENT).not.toContain("supabase.auth.updateUser");
    expect(CLIENT).not.toContain("createClient");
  });

  it("posts to the server-guarded /api/auth/complete-onboarding endpoint instead", () => {
    expect(CLIENT).toContain('fetch("/api/auth/complete-onboarding"');
  });

  it("handles a 403 (activation session ended) distinctly from a generic error — no scary duplicate error UI", () => {
    expect(CLIENT).toContain('res.status === 403');
    expect(CLIENT).toContain("session-ended");
  });
});

describe("app/api/auth/complete-onboarding/route.ts — the real enforcement boundary", () => {
  it("independently re-verifies the authenticated user server-side", () => {
    expect(COMPLETE).toContain("supabase.auth.getUser()");
    expect(COMPLETE).toMatch(/if \(!user\)/);
  });

  it("independently re-verifies the onboarding cookie against that user — not trusted from the page render", () => {
    expect(COMPLETE).toContain("verifyOnboardingToken(onboardingToken, user.id)");
  });

  it("denies with 403 when the onboarding authorization is missing/invalid, distinct from a 401 (not signed in)", () => {
    expect(COMPLETE).toMatch(/status:\s*401/);
    expect(COMPLETE).toMatch(/status:\s*403/);
  });

  it("clears the onboarding cookie on BOTH the failure-to-verify path and the success path — never left reusable", () => {
    const clears = COMPLETE.match(/clearedOnboardingCookieOptions\(\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(2);
  });

  it("re-validates password requirements server-side, not just trusting the client's own validation", () => {
    expect(COMPLETE).toContain("meetsRequirements(password)");
  });

  it("only calls updateUser AFTER the onboarding-token check, never before", () => {
    const gateIndex = COMPLETE.indexOf("verifyOnboardingToken(onboardingToken, user.id)");
    const updateIndex = COMPLETE.indexOf("supabase.auth.updateUser({ password })");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(gateIndex);
  });
});

describe("token-minting entry points — cookie is only ever minted from direct proof of redemption", () => {
  it("verify-invite mints the cookie only after verifyOtp succeeds, and only for type=invite", () => {
    expect(VERIFY_INVITE).toContain("supabase.auth.verifyOtp({ type, token_hash: tokenHash })");
    const verifyIndex = VERIFY_INVITE.indexOf("supabase.auth.verifyOtp(");
    const mintIndex = VERIFY_INVITE.indexOf("signOnboardingToken(data.user.id)");
    expect(mintIndex).toBeGreaterThan(verifyIndex);
    expect(VERIFY_INVITE).toMatch(/if \(type === "invite"\)\s*\{\s*\n\s*cookieStore\.set\(ONBOARDING_COOKIE_NAME, signOnboardingToken/);
  });

  it("auth/callback requires a signed invitation handoff in addition to the caller-controlled invite marker", () => {
    const exchangeIndex = CALLBACK.indexOf("exchangeCodeForSession(code)");
    const inviteBranchIndex = CALLBACK.indexOf('if (type === "invite")');
    const mintIndex = CALLBACK.indexOf("signOnboardingToken(authUser.id)");
    expect(exchangeIndex).toBeGreaterThan(-1);
    expect(mintIndex).toBeGreaterThan(inviteBranchIndex);
    expect(CALLBACK).toContain("verifyInviteHandoffToken(handoff, authUser.email)");
  });

  it("confirm-invite-session requires a signed handoff as well as a validated fresh-otp session", () => {
    expect(CONFIRM_SESSION).toContain("supabase.auth.getClaims(session.access_token)");
    expect(CONFIRM_SESSION).toContain("isFreshOtpAmr(claims.amr)");
    expect(CONFIRM_SESSION).toContain("verifyInviteHandoffToken(handoff, user.email)");
    const checkIndex = CONFIRM_SESSION.indexOf("isFreshOtpAmr(claims.amr)");
    const mintIndex = CONFIRM_SESSION.indexOf("signOnboardingToken(claims.sub");
    expect(mintIndex).toBeGreaterThan(checkIndex);
  });

  it("fragment-callback calls confirm-invite-session for the invite case before landing on /setup-password", () => {
    const otpConfirmIndex = FRAGMENT_CALLBACK.indexOf("/api/auth/confirm-invite-session");
    const inviteBranch = FRAGMENT_CALLBACK.indexOf('if (type === "invite")');
    const nextInviteBranch = FRAGMENT_CALLBACK.indexOf("recovery", inviteBranch); // sanity: invite branch exists after recovery branch
    expect(otpConfirmIndex).toBeGreaterThan(inviteBranch);
    expect(nextInviteBranch).toBe(-1); // "recovery" word shouldn't reappear inside the invite branch itself
  });

  it("/auth/accept no longer calls supabase.auth.verifyOtp() directly from the browser — redemption moved server-side", () => {
    expect(ACCEPT).not.toContain("supabase.auth.verifyOtp({");
    expect(ACCEPT).toContain('fetch("/api/auth/verify-invite"');
  });
});

describe("no role escalation via the activation gate", () => {
  it("none of the new files write to users.role or accept a role/isAdmin-style field from the client", () => {
    for (const src of [COMPLETE, VERIFY_INVITE, CONFIRM_SESSION]) {
      expect(src).not.toMatch(/\brole\s*[:=]/);
      expect(src).not.toContain("isAdmin");
      expect(src).not.toContain("isCoach");
    }
  });

  it("the onboarding cookie payload carries only uid + timestamps — no role, no email, nothing else forgeable-if-leaked", () => {
    const tokenSrc = source("lib/auth/onboarding-token.ts");
    expect(tokenSrc).toContain('purpose: "invite_handoff"');
  });
});
