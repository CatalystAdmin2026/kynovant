// ─────────────────────────────────────────────────────────────
// Price Registry — pure unit tests, no DB / no live Stripe calls.
//
// Proves the env-var-driven registry: nothing is hardcoded, an
// unconfigured plan fails cleanly (never guesses a default price), and
// isCoachPlanPrice() only recognizes exactly what's configured.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";

const ENV_VAR = "KYNOVANT_STRIPE_MONTHLY_PRICE_ID";
const originalValue = process.env[ENV_VAR];

async function freshPricesModule() {
  // Re-import so each test observes the env var as currently set —
  // getPlanPriceId()/isCoachPlanPrice() read process.env directly (no
  // module-level caching), so a plain re-import per test is enough;
  // vi.resetModules() isn't required, but doesn't hurt correctness.
  return import("../prices");
}

describe("price registry — env-var-driven, never hardcoded", () => {
  afterEach(() => {
    if (originalValue === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = originalValue;
  });

  it("getMonthlyPriceId() returns null when the env var is unset", async () => {
    delete process.env[ENV_VAR];
    const { getMonthlyPriceId } = await freshPricesModule();
    expect(getMonthlyPriceId()).toBeNull();
  });

  it("getMonthlyPriceId() returns null for a blank/whitespace-only value, not the blank string", async () => {
    process.env[ENV_VAR] = "   ";
    const { getMonthlyPriceId } = await freshPricesModule();
    expect(getMonthlyPriceId()).toBeNull();
  });

  it("getMonthlyPriceId() returns exactly the configured Price ID, trimmed", async () => {
    process.env[ENV_VAR] = "  price_test_abc123  ";
    const { getMonthlyPriceId } = await freshPricesModule();
    expect(getMonthlyPriceId()).toBe("price_test_abc123");
  });

  it("isCoachPlanPrice() is false for null", async () => {
    process.env[ENV_VAR] = "price_test_abc123";
    const { isCoachPlanPrice } = await freshPricesModule();
    expect(isCoachPlanPrice(null)).toBe(false);
  });

  it("isCoachPlanPrice() is false for an unconfigured/unrelated price id", async () => {
    process.env[ENV_VAR] = "price_test_abc123";
    const { isCoachPlanPrice } = await freshPricesModule();
    expect(isCoachPlanPrice("price_some_other_catalyst_client_package")).toBe(false);
  });

  it("isCoachPlanPrice() is false for every price id when nothing is configured", async () => {
    delete process.env[ENV_VAR];
    const { isCoachPlanPrice } = await freshPricesModule();
    expect(isCoachPlanPrice("price_test_abc123")).toBe(false);
  });

  it("isCoachPlanPrice() is true for exactly the configured monthly Price ID", async () => {
    process.env[ENV_VAR] = "price_test_abc123";
    const { isCoachPlanPrice } = await freshPricesModule();
    expect(isCoachPlanPrice("price_test_abc123")).toBe(true);
  });
});
