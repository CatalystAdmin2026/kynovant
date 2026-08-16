// ─────────────────────────────────────────────────────────────
// Catalyst OS — Coach Subscription Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Backs Kynovant SaaS entitlement: whether an authenticated coach's
// HQ access is currently allowed. See lib/db/schema-billing.ts for
// the coach_subscriptions table this reads/writes, and
// lib/auth/guards.ts (requireCoachOrAdmin/requireCoachOrAdminPage)
// for where getCoachEntitlement() is actually enforced.
//
// Status behavior (approved product decision):
//   complimentary (active grant)          → allowed, no warning —
//                                            checked FIRST, before
//                                            coach_subscriptions is even
//                                            queried; see the
//                                            precedence note below.
//   manually_activated, trialing, active → allowed, no warning
//   past_due, within 7-day grace          → allowed, warning
//   past_due, grace expired               → lazily transitions to
//                                            suspended (no background
//                                            job runner exists yet;
//                                            this check applies the
//                                            expiry on read instead)
//   suspended, cancelled                  → not allowed
//   no row at all                         → not allowed ("none")
//
// COMPLIMENTARY PRECEDENCE (deterministic, by construction): an active
// coach_complimentary_access grant always wins, and getCoachEntitlement()
// returns immediately without reading coach_subscriptions at all — so
// granting complimentary access can NEVER read, modify, or clobber a
// real Stripe-backed coach_subscriptions row. Once the grant is revoked
// or expires (see getActiveComplimentaryAccess()'s own lazy-expiry
// handling), this function falls through to the coach_subscriptions
// logic below completely unmodified — a coach who had a valid paid/
// trialing subscription before, during, or after a complimentary grant
// keeps exactly that subscription's own state, because nothing here
// ever wrote to it.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachSubscriptions,
  type CoachSubscriptionStatus,
} from "./schema-billing";
import { notifyBillingPastDue } from "./coach-notification-service";
import { getActiveComplimentaryAccess } from "./coach-complimentary-access-service";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─────────────────────────────────────────────────────────────
// ENTITLEMENT CHECK
// ─────────────────────────────────────────────────────────────

export interface CoachEntitlement {
  status: CoachSubscriptionStatus | "none" | "complimentary";
  allowed: boolean;
  /** true only for past_due within the grace window — HQ stays usable,
   *  but the caller should surface a visible billing warning. */
  warning: boolean;
  gracePeriodEnd: Date | null;
}

export async function getCoachEntitlement(
  coachId: string,
): Promise<CoachEntitlement> {
  // Complimentary access is checked first and, if active, decides the
  // outcome entirely on its own — coach_subscriptions is never read in
  // that case. See this file's header comment for why that precedence
  // is deliberate.
  const complimentary = await getActiveComplimentaryAccess(coachId);
  if (complimentary) {
    return { status: "complimentary", allowed: true, warning: false, gracePeriodEnd: null };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.coachId, coachId))
    .limit(1);

  if (!row) {
    return { status: "none", allowed: false, warning: false, gracePeriodEnd: null };
  }

  if (row.status === "past_due") {
    const graceEnd = row.gracePeriodEnd;
    const withinGrace = graceEnd !== null && Date.now() < graceEnd.getTime();
    if (withinGrace) {
      return { status: "past_due", allowed: true, warning: true, gracePeriodEnd: graceEnd };
    }

    // Grace window has elapsed — lazily persist the suspension. Optimistic
    // WHERE guard (status still 'past_due') mirrors the pattern already
    // used elsewhere in this codebase (e.g. startCheckInReview) so a
    // concurrent webhook-driven update (e.g. invoice.paid arriving right
    // as grace expires) can't be clobbered by this read-triggered write.
    await db
      .update(coachSubscriptions)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(
        eq(coachSubscriptions.coachId, coachId),
      );

    return { status: "suspended", allowed: false, warning: false, gracePeriodEnd: graceEnd };
  }

  const allowed =
    row.status === "manually_activated" ||
    row.status === "trialing" ||
    row.status === "active";

  return { status: row.status, allowed, warning: false, gracePeriodEnd: row.gracePeriodEnd };
}

// ─────────────────────────────────────────────────────────────
// CHECKOUT ELIGIBILITY — built entirely on getCoachEntitlement() above,
// not a parallel entitlement system. Two decisions, one canonical
// source of truth:
//
//   1. Can this coach start a NEW Checkout Session at all? No, if
//      they're already entitled (getCoachEntitlement().allowed) — an
//      already-active/trialing/manually_activated/in-grace-past_due
//      coach creating a second Checkout Session would risk a second,
//      competing Stripe subscription for the same coach. This is the
//      check startCheckoutAction (lib/billing/actions.ts) must apply
//      itself, not just trust the account-status page to have hidden
//      the button — a Server Action is reachable by direct invocation
//      regardless of what the page renders.
//
//   2. If they can, should this NEW session include a free trial?
//      Only for a genuinely first-time coach (coach_subscriptions has
//      NO row at all — status "none"). coach_subscriptions rows are
//      never hard-deleted in application code (only upserted — see
//      schema-billing.ts's header and upsertCoachSubscriptionFromStripe's
//      onConflictDoUpdate below); a coach whose subscription was
//      cancelled still has a row (status "cancelled") right up until
//      the moment a NEW checkout's webhook overwrites it. Reading that
//      row HERE, before creating the new session, is the smallest
//      durable evidence this architecture already has that a trial (or
//      manual-activation equivalent) was previously consumed — no new
//      table, no new column, no Stripe API call required. A coach with
//      status "cancelled" or "suspended" can still check out (this
//      only withholds the trial, never blocks reactivation) — just
//      without another 14 free days.
// ─────────────────────────────────────────────────────────────

export type CheckoutEligibility =
  | { allowed: false; entitlement: CoachEntitlement }
  | { allowed: true; grantTrial: boolean };

export async function resolveCheckoutEligibility(
  coachId: string,
): Promise<CheckoutEligibility> {
  const entitlement = await getCoachEntitlement(coachId);
  if (entitlement.allowed) {
    return { allowed: false, entitlement };
  }
  return { allowed: true, grantTrial: entitlement.status === "none" };
}

// ─────────────────────────────────────────────────────────────
// MANUAL ACTIVATION / SUSPENSION (admin-only — see requireAdmin()
// on the routes that call these)
// ─────────────────────────────────────────────────────────────

export async function activateCoachBeta(
  coachId: string,
  activatedBy: string,
  opts?: { currentPeriodEnd?: Date | null },
): Promise<void> {
  const db = getDb();
  const values = {
    coachId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    status: "manually_activated" as const,
    currentPeriodStart: null,
    currentPeriodEnd: opts?.currentPeriodEnd ?? null,
    gracePeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    activatedBy,
    updatedAt: new Date(),
  };

  await db
    .insert(coachSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: coachSubscriptions.coachId, set: values });
}

export async function suspendCoachSubscription(
  coachId: string,
  activatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: coachSubscriptions.id })
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.coachId, coachId))
    .limit(1);

  if (!existing) {
    return { ok: false, error: "No subscription record for this coach." };
  }

  await db
    .update(coachSubscriptions)
    .set({
      status: "suspended",
      activatedBy,
      updatedAt: new Date(),
    })
    .where(eq(coachSubscriptions.coachId, coachId));

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// STRIPE WEBHOOK SYNC
//
// Called by the coach-plan branch of the Stripe webhook handler.
// Upserts by coachId (resolved from the Stripe object's metadata —
// see app/api/stripe/webhook/route.ts). Grace-period handling: only
// (re)sets gracePeriodEnd on a fresh transition into past_due, never
// on a replayed/duplicate past_due for the same billing failure —
// otherwise a retried webhook could keep extending the grace clock
// indefinitely.
// ─────────────────────────────────────────────────────────────

export interface StripeSubscriptionSync {
  coachId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: Exclude<CoachSubscriptionStatus, "manually_activated">;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
  eventId: string;
}

export async function upsertCoachSubscriptionFromStripe(
  sync: StripeSubscriptionSync,
): Promise<void> {
  const db = getDb();

  const [existing] = await db
    .select({ status: coachSubscriptions.status, gracePeriodEnd: coachSubscriptions.gracePeriodEnd })
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.coachId, sync.coachId))
    .limit(1);

  // Fresh transition into past_due only — never on a replayed webhook
  // or a repeat invoice.payment_failed retry for the same still-
  // unresolved failure. Reuses the exact same condition gracePeriodEnd
  // re-arming already relies on, so this can't fire on a case that
  // condition doesn't also treat as "new."
  const isFreshPastDue = sync.status === "past_due" && existing?.status !== "past_due";

  let gracePeriodEnd: Date | null;
  if (sync.status === "past_due") {
    gracePeriodEnd = isFreshPastDue
      ? new Date(Date.now() + GRACE_PERIOD_MS)
      : (existing?.gracePeriodEnd ?? null);
  } else {
    gracePeriodEnd = null;
  }

  const values = {
    coachId: sync.coachId,
    stripeCustomerId: sync.stripeCustomerId,
    stripeSubscriptionId: sync.stripeSubscriptionId,
    stripePriceId: sync.stripePriceId,
    status: sync.status,
    currentPeriodStart: sync.currentPeriodStart ?? null,
    currentPeriodEnd: sync.currentPeriodEnd ?? null,
    gracePeriodEnd,
    cancelAtPeriodEnd: sync.cancelAtPeriodEnd ?? false,
    cancelledAt: sync.cancelledAt ?? null,
    activatedBy: null,
    lastProcessedEventId: sync.eventId,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(coachSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: coachSubscriptions.coachId, set: values })
    .returning({ id: coachSubscriptions.id });

  if (isFreshPastDue) {
    await notifyBillingPastDue({
      coachId: sync.coachId,
      subscriptionId: row.id,
      gracePeriodEnd,
    });
  }
}
