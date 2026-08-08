// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Price Registry
//
// SERVER-ONLY.
//
//   Stripe Product → Stripe Price → Price ID → Environment Variable → Application
//
// The application never hardcodes a price, an amount, or a Stripe
// Product ID. Every plan Kynovant can sell is one entry in
// PLAN_PRICE_ENV_VARS below, backed by exactly one environment
// variable holding a real Stripe Price ID (price_...) created in the
// Stripe Dashboard. Nothing in this app knows what a plan costs, how
// it's billed, or what it's named in the Stripe Dashboard — only which
// Price ID corresponds to which plan key.
//
// TODO (operator — insert real values):
//   KYNOVANT_STRIPE_MONTHLY_PRICE_ID — required for coach checkout to
//   work at all. Create the Product + a recurring monthly Price in
//   Kynovant's Stripe account (NOT Catalyst Coaching Elite's — see
//   lib/billing/stripe-client.ts), then set this to that Price's id
//   (price_...).
//
// Adding a plan later (annual, enterprise, ...) is exactly:
//   1. Create the Product/Price in Kynovant's Stripe Dashboard.
//   2. Add one line to PLAN_PRICE_ENV_VARS below (key + env var name,
//      KYNOVANT_STRIPE_-prefixed).
//   3. Set that env var in the deployment.
// No other file in this billing surface needs to change — checkout
// (lib/billing/checkout.ts) accepts a plan key, and isCoachPlanPrice()
// is derived entirely from this registry, so a newly configured plan is
// automatically recognized.
//
// Coupons/promo codes: no registry entry needed — Stripe Checkout's
// native `allow_promotion_codes` (enabled in lib/billing/checkout.ts)
// lets a customer apply any promotion code configured in the Stripe
// Dashboard against the price they're checking out with. Nothing here
// needs to know which codes exist.
//
// Enterprise: a custom/negotiated plan is still just another Price ID
// once one exists — add it the same way as any other plan. Until then,
// there is no "enterprise" key below, so isCoachPlanPrice() correctly
// treats an enterprise-priced subscription as unrecognized rather than
// guessing.
// ─────────────────────────────────────────────────────────────

import "server-only";

export type CoachPlanKey = "monthly";
// Add here once the Stripe Price + env var exist, e.g.:
//   export type CoachPlanKey = "monthly" | "annual" | "enterprise";

const PLAN_PRICE_ENV_VARS: Record<CoachPlanKey, string> = {
  monthly: "KYNOVANT_STRIPE_MONTHLY_PRICE_ID",
  // annual: "KYNOVANT_STRIPE_ANNUAL_PRICE_ID",
  // enterprise: "KYNOVANT_STRIPE_ENTERPRISE_PRICE_ID",
};

function envPriceId(envVarName: string): string | null {
  const value = process.env[envVarName];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The configured Stripe Price ID for a plan, or null if the operator
 * hasn't set that plan's environment variable yet. Never throws or
 * falls back to a guessed/default price — callers (checkout) decide
 * how to fail when a plan isn't configured.
 */
export function getPlanPriceId(plan: CoachPlanKey): string | null {
  return envPriceId(PLAN_PRICE_ENV_VARS[plan]);
}

/** The one plan Kynovant sells at launch. */
export function getMonthlyPriceId(): string | null {
  return getPlanPriceId("monthly");
}

// Every configured (non-null) Price ID across every known plan.
// Recomputed on each call rather than cached: it's a handful of env
// var reads, and tests need to observe a changed env var without a
// stale cache surviving between cases.
function allConfiguredCoachPlanPriceIds(): Set<string> {
  const ids = new Set<string>();
  for (const plan of Object.keys(PLAN_PRICE_ENV_VARS) as CoachPlanKey[]) {
    const id = getPlanPriceId(plan);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * True only for a Price ID configured as a real Kynovant coach-platform
 * plan above. The Stripe webhook (app/api/stripe/webhook/route.ts)
 * already separates Catalyst and Kynovant events structurally — by
 * hostname, before either business's Stripe secret is ever touched, so
 * an event reaching the Kynovant branch can only ever have come from
 * Kynovant's own Stripe account in the first place. This function is
 * the defense-in-depth check WITHIN that branch: is this specific
 * price one of Kynovant's own known, registered plans, or something
 * else that account might someday emit (a future non-subscription
 * product, a test object, etc.) that this billing surface shouldn't
 * blindly treat as a coach subscription.
 */
export function isCoachPlanPrice(priceId: string | null): boolean {
  if (!priceId) return false;
  return allConfiguredCoachPlanPriceIds().has(priceId);
}
