// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Stripe Client
//
// SERVER-ONLY. Initializes the Stripe SDK for Kynovant's coach-platform
// Stripe account with KYNOVANT_STRIPE_SECRET_KEY, which must never
// reach the browser bundle.
//
// This is a DIFFERENT Stripe account from Catalyst Coaching Elite's
// client-payment account — see lib/stripe.ts's catalystStripe() for
// that one. Every file under lib/billing/ must use kynovantStripe(),
// never catalystStripe() — Catalyst and Kynovant are separate
// businesses with separate Stripe accounts, and nothing in this
// directory should ever read a CATALYST_STRIPE_* env var.
// ─────────────────────────────────────────────────────────────

import "server-only";
import Stripe from "stripe";

// Lazily accessed so Next.js build doesn't fail when
// KYNOVANT_STRIPE_SECRET_KEY is absent — it will fail at runtime
// (server-side only) if missing.
function getKynovantStripe(): Stripe {
  const key = process.env.KYNOVANT_STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "KYNOVANT_STRIPE_SECRET_KEY is not set. Add it to .env.local — see env.local.example.",
    );
  }
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

// Singleton — module-level cache safe in server context.
let _kynovantStripe: Stripe | null = null;
export function kynovantStripe(): Stripe {
  if (!_kynovantStripe) _kynovantStripe = getKynovantStripe();
  return _kynovantStripe;
}
