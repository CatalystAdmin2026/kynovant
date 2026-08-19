// ─────────────────────────────────────────────────────────────
// Onboarding-activation cookie — pure logic tests.
//
// No DB, no network, no staging required — signOnboardingToken/
// verifyOnboardingToken are pure functions over process.env and
// system time. Proves the actual cryptographic/expiry properties the
// /setup-password gate depends on: a token is only valid for the uid
// it was minted for, expires on schedule, and any tampering (payload
// or signature) is rejected.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  signOnboardingToken,
  verifyOnboardingToken,
  signInviteHandoffToken,
  verifyInviteHandoffToken,
  ONBOARDING_COOKIE_NAME,
  onboardingCookieOptions,
  clearedOnboardingCookieOptions,
} from "../onboarding-token";

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-fake-service-role-key-not-real";
});

describe("signOnboardingToken / verifyOnboardingToken", () => {
  it("a freshly-minted token verifies for the uid it was minted for", () => {
    const token = signOnboardingToken("user-123");
    expect(verifyOnboardingToken(token, "user-123")).toBe(true);
  });

  it("does NOT verify for a different uid — no cross-user reuse", () => {
    const token = signOnboardingToken("user-123");
    expect(verifyOnboardingToken(token, "some-other-user")).toBe(false);
  });

  it("rejects a tampered payload (uid swapped after signing)", () => {
    const token = signOnboardingToken("user-123");
    const [payloadB64, sigB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const forged = { ...payload, uid: "attacker-uid" };
    const forgedPayloadB64 = Buffer.from(JSON.stringify(forged)).toString("base64url");
    const forgedToken = `${forgedPayloadB64}.${sigB64}`;
    expect(verifyOnboardingToken(forgedToken, "attacker-uid")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signOnboardingToken("user-123");
    const [payloadB64] = token.split(".");
    const tampered = `${payloadB64}.${"a".repeat(43)}`;
    expect(verifyOnboardingToken(tampered, "user-123")).toBe(false);
  });

  it("rejects malformed tokens (missing parts, empty, undefined)", () => {
    expect(verifyOnboardingToken("not-a-token", "user-123")).toBe(false);
    expect(verifyOnboardingToken("", "user-123")).toBe(false);
    expect(verifyOnboardingToken(undefined, "user-123")).toBe(false);
    expect(verifyOnboardingToken(null, "user-123")).toBe(false);
  });

  describe("expiry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("is still valid just before the 15-minute TTL elapses", () => {
      const token = signOnboardingToken("user-123");
      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(verifyOnboardingToken(token, "user-123")).toBe(true);
    });

    it("is no longer valid once the 15-minute TTL elapses — not reusable indefinitely", () => {
      const token = signOnboardingToken("user-123");
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(verifyOnboardingToken(token, "user-123")).toBe(false);
    });
  });

  it("throws a clear error if SUPABASE_SERVICE_ROLE_KEY is unset, rather than signing with a weak/empty key", () => {
    const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => signOnboardingToken("user-123")).toThrow();
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  });
});

describe("signed invitation handoff", () => {
  it("binds the callback marker to the invited email", () => {
    const token = signInviteHandoffToken(" Coach@Example.com ");
    expect(verifyInviteHandoffToken(token, "coach@example.com")).toBe(true);
    expect(verifyInviteHandoffToken(token, "other@example.com")).toBe(false);
  });

  it("rejects a handoff token for a recovery session with no marker", () => {
    expect(verifyInviteHandoffToken(null, "coach@example.com")).toBe(false);
  });
});

describe("cookie options", () => {
  it("the onboarding cookie is HttpOnly, SameSite=Lax, and single-purpose named", () => {
    expect(ONBOARDING_COOKIE_NAME).toBe("kv_onboarding");
    const opts = onboardingCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBe(15 * 60);
  });

  it("the cleared-cookie options have maxAge 0 — actually expires it, not just overwrites", () => {
    const opts = clearedOnboardingCookieOptions();
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
  });
});
