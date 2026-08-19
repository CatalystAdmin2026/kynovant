// Pure logic tests for the amr freshness predicate — no DB/network.
// See lib/db/__tests__/setup-password-activation.test.ts for the
// staging-backed proof that REAL Supabase-issued claims for an
// invite-OTP session satisfy this, and REAL password-login claims do
// not.
import { describe, it, expect } from "vitest";
import { isFreshOtpAmr } from "../session-claims";

const NOW = 1_800_000_000;

describe("isFreshOtpAmr", () => {
  it("true for a fresh otp entry", () => {
    expect(isFreshOtpAmr([{ method: "otp", timestamp: NOW - 5 }], NOW)).toBe(true);
  });

  it("false for a password entry, no matter how fresh", () => {
    expect(isFreshOtpAmr([{ method: "password", timestamp: NOW - 1 }], NOW)).toBe(false);
  });

  it("false for an otp entry older than the freshness window", () => {
    expect(isFreshOtpAmr([{ method: "otp", timestamp: NOW - 121 }], NOW)).toBe(false);
  });

  it("true for an otp entry exactly at the window boundary", () => {
    expect(isFreshOtpAmr([{ method: "otp", timestamp: NOW - 120 }], NOW)).toBe(true);
  });

  it("false for an otp entry with a future timestamp (clock-skew abuse)", () => {
    expect(isFreshOtpAmr([{ method: "otp", timestamp: NOW + 500 }], NOW)).toBe(false);
  });

  it("false for the RFC-8176 bare-string amr form — no timestamp to prove freshness", () => {
    expect(isFreshOtpAmr(["otp"], NOW)).toBe(false);
  });

  it("false for missing/malformed amr", () => {
    expect(isFreshOtpAmr(undefined, NOW)).toBe(false);
    expect(isFreshOtpAmr(null, NOW)).toBe(false);
    expect(isFreshOtpAmr([], NOW)).toBe(false);
    expect(isFreshOtpAmr([{ method: "otp" }], NOW)).toBe(false); // no timestamp
  });

  it("true if ANY entry in a multi-entry amr array is a fresh otp", () => {
    expect(
      isFreshOtpAmr(
        [
          { method: "password", timestamp: NOW - 999999 },
          { method: "otp", timestamp: NOW - 3 },
        ],
        NOW,
      ),
    ).toBe(true);
  });
});
