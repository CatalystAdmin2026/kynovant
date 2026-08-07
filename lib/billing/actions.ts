"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant — Coach SaaS Billing: Server Actions
//
// Bound directly to <form action={...}> in Server Components — no
// client-side Stripe.js needed for either flow, since both Checkout
// Sessions and Billing Portal Sessions return a hosted `url` this app
// simply redirects to.
//
// Guarded by requireAuthenticatedPage() (authenticated only, no role or
// entitlement check) rather than requireCoachOrAdminPage() — a coach
// who isn't entitled yet is exactly who startCheckoutAction must be
// reachable for, and requireCoachOrAdminPage() would redirect them to
// /account-status before they could ever click "Start Subscription",
// which is the page these actions are called from in the first place.
// ─────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuthenticatedPage } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { coachSubscriptions } from "@/lib/db/schema-billing";
import { createCoachCheckoutSession } from "./checkout";
import { createBillingPortalSession } from "./portal";
import type { CoachPlanKey } from "./prices";

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";
}

async function lookupStripeCustomerId(coachId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ stripeCustomerId: coachSubscriptions.stripeCustomerId })
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.coachId, coachId))
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

// Starts (or restarts, after a prior full cancellation) a coach's
// subscription via Stripe Checkout. Reuses their existing Stripe
// Customer when one exists, so a resubscribing coach never ends up
// with duplicate Customer objects. Reachable from app/account-status —
// never from inside /hq, since app/hq/layout.tsx's entitlement guard
// would never let a non-entitled coach reach a page under /hq at all.
export async function startCheckoutAction(_formData: FormData): Promise<void> {
  const { authUser, dbUser } = await requireAuthenticatedPage();
  if (dbUser.role !== "coach") redirect("/");
  if (!authUser.email) redirect("/account-status?error=missing_email");

  // Only plan sold at launch. A future plan-select control on the
  // account-status page would read the chosen plan from _formData here
  // instead of hardcoding "monthly" — lib/billing/checkout.ts and
  // lib/billing/prices.ts already accept/support any registered
  // CoachPlanKey, so that's the only line that would need to change.
  const plan: CoachPlanKey = "monthly";

  const origin = siteOrigin();
  const result = await createCoachCheckoutSession({
    coachId: dbUser.id,
    email: authUser.email,
    plan,
    existingStripeCustomerId: await lookupStripeCustomerId(dbUser.id),
    // {CHECKOUT_SESSION_ID} is a literal Stripe template token — Stripe
    // substitutes it into the redirect URL itself. account-status reads
    // it to activate the coach synchronously (see retrieveCheckoutSession
    // in lib/billing/checkout.ts) rather than waiting on webhook delivery.
    successUrl: `${origin}/account-status?checkout_session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/account-status?checkout=cancelled`,
  });

  if (!result.ok) {
    console.error("[Billing] startCheckoutAction failed:", result.error);
    redirect("/account-status?error=checkout_failed");
  }
  redirect(result.url);
}

// Sends a coach to Stripe's hosted Billing Portal — payment method,
// invoice history, cancellation, and (Portal configuration permitting)
// undoing a scheduled cancellation all happen there, not in this app.
// Reachable from app/account-status (a past_due coach still inside
// their grace period) and app/hq/billing (an active/trialing coach
// managing their subscription).
export async function openBillingPortalAction(_formData: FormData): Promise<void> {
  const { dbUser } = await requireAuthenticatedPage();
  if (dbUser.role !== "coach") redirect("/");

  const customerId = await lookupStripeCustomerId(dbUser.id);
  if (!customerId) {
    // No Stripe Customer yet (e.g. manually_activated with no real
    // subscription behind it, or a coach who never checked out) —
    // nothing for the Billing Portal to manage.
    redirect("/account-status?error=no_billing_account");
  }

  const origin = siteOrigin();
  const result = await createBillingPortalSession(customerId, `${origin}/hq/billing`);
  if (!result.ok) {
    console.error("[Billing] openBillingPortalAction failed:", result.error);
    redirect("/account-status?error=portal_failed");
  }
  redirect(result.url);
}
