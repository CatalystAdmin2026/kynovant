// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Subscription → coach_subscriptions Sync
//
// SERVER-ONLY. Pure translation from a Stripe Subscription object to a
// coach_subscriptions row, via the existing
// upsertCoachSubscriptionFromStripe() (lib/db/coach-subscription-
// service.ts) — this file adds no new persistence logic of its own,
// only the Stripe-shape → sync-input mapping.
//
// Extracted so the SAME logic runs from two call sites without drift:
//   1. app/api/stripe/webhook/route.ts — the authoritative path. Every
//      subscription lifecycle event (created/updated/deleted) and
//      every invoice event Stripe sends eventually reaches here,
//      regardless of how the subscription was created (Checkout,
//      Billing Portal, or a Dashboard action).
//   2. app/account-status/page.tsx's checkout-return fast path — calls
//      this synchronously right after a coach completes Stripe
//      Checkout, using the Checkout Session's own expanded
//      subscription, so the coach sees their account activated
//      immediately rather than waiting on webhook delivery. The
//      webhook still fires afterward and calls the same function again
//      with the same data — upsertCoachSubscriptionFromStripe() is
//      idempotent (upsert by coachId), so this is always safe to call
//      twice for the same subscription state.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type Stripe from "stripe";
import { strOrNull } from "@/lib/stripe";
import { kynovantStripe } from "./stripe-client";
import {
  upsertCoachSubscriptionFromStripe,
  type StripeSubscriptionSync,
} from "@/lib/db/coach-subscription-service";

/**
 * Maps a raw Stripe subscription status to this app's status enum.
 * Returns null for statuses this app doesn't model yet (incomplete,
 * incomplete_expired, unpaid, paused) — callers log and skip rather
 * than guess a mapping for those.
 */
export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): StripeSubscriptionSync["status"] | null {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return null;
  }
}

export type SyncCoachSubscriptionResult =
  | { ok: true; coachId: string; status: StripeSubscriptionSync["status"] }
  | { ok: false; reason: "missing_coach_id" | "unmapped_status"; detail: string };

/**
 * Resolves coachId from sub.metadata.coachId (set at Checkout Session
 * creation — see lib/billing/checkout.ts's subscription_data.metadata)
 * and upserts coach_subscriptions from the subscription's current
 * shape. forceStatus overrides the derived status — used for
 * customer.subscription.deleted, whose own sub.status is already
 * "canceled" by the time Stripe sends it, but is passed explicitly by
 * the caller for clarity rather than relying on that always being true.
 */
export async function syncCoachSubscriptionFromStripeSubscription(
  sub: Stripe.Subscription,
  eventId: string,
  forceStatus?: "cancelled",
): Promise<SyncCoachSubscriptionResult> {
  const coachId = sub.metadata?.coachId;
  if (!coachId) {
    return {
      ok: false,
      reason: "missing_coach_id",
      detail: `Subscription ${sub.id} has no metadata.coachId.`,
    };
  }

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;

  const status = forceStatus ?? mapStripeSubscriptionStatus(sub.status);
  if (!status) {
    return {
      ok: false,
      reason: "unmapped_status",
      detail: `Subscription ${sub.id} has unmapped status '${sub.status}'.`,
    };
  }

  await upsertCoachSubscriptionFromStripe({
    coachId,
    stripeCustomerId: strOrNull(sub.customer),
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    status,
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: isScheduledToCancelAtPeriodEnd(sub),
    cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    eventId,
  });

  return { ok: true, coachId, status };
}

// ─────────────────────────────────────────────────────────────
// LIVE REFRESH — fixes a real gap found via a genuine Stripe test-mode
// Billing Portal cancellation walked through end-to-end: unlike
// Checkout (app/account-status's synchronous fast path, using the
// Checkout Session's own {CHECKOUT_SESSION_ID}), the Billing Portal's
// return_url (${origin}/hq/billing — see lib/billing/actions.ts)
// carries no session token to resync from, so nothing synchronous ever
// ran on return from the Portal. In an environment where the webhook
// endpoint isn't reachable (no public URL — true of any local/preview
// deployment, and construction is possible even in production if
// delivery is merely delayed relative to how fast the coach clicks
// back), a coach who just scheduled or undid a cancellation in the
// Portal would see stale data on /hq/billing until a webhook happened
// to arrive. Proven: scheduled a real cancellation via the Portal,
// confirmed via Stripe's own API that cancel_at was set on the
// subscription, and confirmed coach_subscriptions was never updated —
// no webhook had reached this environment.
//
// This re-fetches the subscription directly from Stripe and re-syncs
// it through the exact same, already-idempotent
// syncCoachSubscriptionFromStripeSubscription() used by both the
// webhook and the Checkout fast path — no new sync logic, just another
// caller of it. Safe to call on every /hq/billing render: a single
// Stripe API read, and the eventId it's tagged with is never used for
// dedup gating (see upsertCoachSubscriptionFromStripe) — only stored
// for traceability — so calling this repeatedly is exactly as safe as
// receiving the same webhook event multiple times.
//
// Returns null (never throws) on any lookup failure — the caller falls
// back to whatever's already in coach_subscriptions, same fallback
// behavior as the Checkout fast path.
// ─────────────────────────────────────────────────────────────
export async function refreshCoachSubscriptionFromStripe(
  stripeSubscriptionId: string,
): Promise<SyncCoachSubscriptionResult | null> {
  try {
    const sub = await kynovantStripe().subscriptions.retrieve(stripeSubscriptionId);
    return await syncCoachSubscriptionFromStripeSubscription(sub, `hq_billing_refresh_${Date.now()}`);
  } catch (err) {
    console.error(
      "[Billing] refreshCoachSubscriptionFromStripe failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// PROVEN DEFECT (found via a real Stripe test-mode Billing Portal
// cancellation, replayed against this app's own webhook route):
// scheduling a cancellation through the Billing Portal does NOT set
// sub.cancel_at_period_end — Stripe leaves that false and instead sets
// sub.cancel_at to the period-end timestamp. `cancelAtPeriodEnd:
// sub.cancel_at_period_end ?? false` therefore stayed false forever for
// a real, live-scheduled cancellation, so /hq/billing's "scheduled to
// cancel" notice (app/hq/billing/page.tsx, reads
// subscription.cancelAtPeriodEnd) could never appear no matter what a
// coach actually did in the Portal.
//
// A subscription is "scheduled to cancel at period end" when EITHER
// the (still-respected, in case a future/older API shape sets it)
// legacy boolean is true, OR a future cancel_at timestamp exists on a
// subscription that hasn't actually been deleted yet — once
// customer.subscription.deleted arrives, status flips to "canceled"
// and this correctly reports false again (nothing is still "scheduled"
// once it has already happened).
// ─────────────────────────────────────────────────────────────
function isScheduledToCancelAtPeriodEnd(sub: Stripe.Subscription): boolean {
  if (sub.cancel_at_period_end) return true;
  return typeof sub.cancel_at === "number" && sub.status !== "canceled";
}
