// ─────────────────────────────────────────────────────────────
// Checkout Session creation — the unconfigured-price guard only.
//
// Deliberately does NOT test the live Stripe API call path here:
// exercising createCoachCheckoutSession() end-to-end would call
// Kynovant's real Stripe account (KYNOVANT_STRIPE_SECRET_KEY) — out of
// scope for this test, which only proves the one thing fully
// verifiable without calling Stripe at all: an unconfigured plan fails
// cleanly and never falls back to a guessed/hardcoded price. This
// guard fires before any Stripe API call, so it's exercised here
// regardless of whether a real key is configured.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";

const ENV_VAR = "KYNOVANT_STRIPE_MONTHLY_PRICE_ID";
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
      grantTrial: true,
      successUrl: "https://example.invalid/success",
      cancelUrl: "https://example.invalid/cancel",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("monthly");
    }
  });
});
