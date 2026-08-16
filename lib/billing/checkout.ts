// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Checkout Sessions
//
// SERVER-ONLY. Stripe Checkout Sessions (hosted, redirect-based) — not
// Payment Links (those are static, shareable URLs with no per-coach
// identity attached) and not embedded Stripe Elements (no client-side
// Stripe.js is required for this flow: a Checkout Session returns its
// own hosted `url`, and the caller just redirects to it).
//
// Every price this app can sell comes from lib/billing/prices.ts's
// registry — this file never hardcodes a Price ID or plan name.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type Stripe from "stripe";
import { kynovantStripe } from "./stripe-client";
import { getPlanPriceId, type CoachPlanKey } from "./prices";

// 14-day free trial (requirement) for a coach's FIRST subscription
// only. Repeat-trial abuse prevention (checking coach_subscriptions
// history before granting another trial — see
// lib/db/coach-subscription-service.ts's resolveCheckoutEligibility())
// decides per-call whether this Checkout Session includes a trial at
// all; this function never decides that itself, it only applies
// whatever the caller determined.
const TRIAL_PERIOD_DAYS = 14;

export interface CreateCoachCheckoutSessionParams {
  coachId: string;
  email: string;
  /** Defaults to "monthly" — the only plan sold at launch. */
  plan?: CoachPlanKey;
  /**
   * Required, not defaulted — forces every call site to make an
   * explicit, considered choice rather than silently inheriting
   * "always trial" if a future call site is added without thinking
   * about repeat-trial abuse. See
   * lib/db/coach-subscription-service.ts's resolveCheckoutEligibility(),
   * the canonical decision of whether a given coach has already
   * consumed a trial.
   */
  grantTrial: boolean;
  /**
   * Reuse an existing Stripe Customer (e.g. a coach resubscribing after
   * a prior cancellation) instead of letting Stripe create a new one
   * from `email`. Avoids duplicate Customer objects for the same coach
   * across multiple subscription lifecycles.
   */
  existingStripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export type CreateCoachCheckoutSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function createCoachCheckoutSession(
  params: CreateCoachCheckoutSessionParams,
): Promise<CreateCoachCheckoutSessionResult> {
  const plan = params.plan ?? "monthly";
  const priceId = getPlanPriceId(plan);
  if (!priceId) {
    return {
      ok: false,
      error:
        `No Stripe Price ID is configured for the "${plan}" plan. ` +
        "Set its environment variable — see lib/billing/prices.ts — before checkout can run.",
    };
  }

  const session = await kynovantStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    // Exactly one of customer / customer_email — Stripe rejects both.
    ...(params.existingStripeCustomerId
      ? { customer: params.existingStripeCustomerId }
      : { customer_email: params.email }),
    subscription_data: {
      ...(params.grantTrial ? { trial_period_days: TRIAL_PERIOD_DAYS } : {}),
      // The webhook (app/api/stripe/webhook/route.ts, via
      // lib/billing/sync.ts) resolves coachId from the SUBSCRIPTION's
      // own metadata for every subsequent lifecycle event — this is
      // the one place that metadata gets set.
      metadata: { coachId: params.coachId },
    },
    // Session-level metadata too, for any handler keyed off the
    // Checkout Session itself (e.g. the checkout-return fast path in
    // app/account-status/page.tsx) rather than the subscription.
    metadata: { coachId: params.coachId },
    // Native Stripe-hosted promo-code entry field. Future-proofs
    // coupons/promo codes with zero additional application code —
    // inert until a promotion code actually exists in the Stripe
    // Dashboard.
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a Checkout Session URL." };
  }
  return { ok: true, url: session.url };
}

/**
 * Retrieves a Checkout Session with its subscription expanded — used
 * by the checkout-return fast path (app/account-status/page.tsx) to
 * activate a coach's account synchronously on return from Stripe,
 * without waiting on webhook delivery. Returns null on any lookup
 * failure (unknown/expired session id, transient API error) rather
 * than throwing — the caller falls back to "the webhook will catch up
 * shortly" in that case, since the webhook remains the authoritative,
 * always-eventually-consistent path regardless of whether this
 * fast-path lookup succeeds.
 */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await kynovantStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch (err) {
    console.error(
      "[Billing] retrieveCheckoutSession failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
