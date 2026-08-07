// ─────────────────────────────────────────────────────────────
// Checkout Session creation — the unconfigured-price guard only.
//
// Deliberately does NOT test the live Stripe API call path:
// STRIPE_SECRET_KEY in this environment is a live key
// (sk_live_...), and STRIPE_MONTHLY_PRICE_ID is intentionally unset
// until the operator configures a real Stripe Product/Price (see
// lib/billing/prices.ts) — creating real Checkout Sessions against a
// live Stripe account from an automated test suite is out of scope
// here. This test proves the one thing fully verifiable without
// calling Stripe at all: an unconfigured plan fails cleanly and never
// falls back to a guessed/hardcoded price.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";

const ENV_VAR = "STRIPE_MONTHLY_PRICE_ID";
const originalValue = process.env[ENV_VAR];

describe("createCoachCheckoutSession — unconfigured price fails cleanly", () => {
  afterEach(() => {
    if (originalValue === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = originalValue;
  });

  it("returns ok:false without calling Stripe when no monthly Price ID is configured", async () => {
    delete process.env[ENV_VAR];
    const { createCoachCheckoutSession } = await import("../checkout");

    const result = await createCoachCheckoutSession({
      coachId: "00000000-0000-0000-0000-000000000001",
      email: "coach@example.invalid",
      successUrl: "https://example.invalid/success",
      cancelUrl: "https://example.invalid/cancel",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("monthly");
    }
  });
});
