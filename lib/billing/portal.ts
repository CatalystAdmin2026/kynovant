// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Billing Portal
//
// SERVER-ONLY. Stripe's hosted Billing Portal handles payment-method
// updates, invoice history, and — depending on the Portal's Dashboard
// configuration (Settings → Billing → Customer portal) — subscription
// cancellation and undoing a scheduled cancellation (Stripe's native
// "renew" action, which is how a coach who cancelled but is still
// inside their current paid period reactivates without going through
// Checkout again). None of that behavior lives in this app's code —
// this file only creates the session that hands the coach off to it.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { stripe } from "@/lib/stripe";

export type CreateBillingPortalSessionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<CreateBillingPortalSessionResult> {
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create billing portal session.",
    };
  }
}
