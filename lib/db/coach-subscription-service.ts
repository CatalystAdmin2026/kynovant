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
//   manually_activated, trialing, active → allowed, no warning
//   past_due, within 7-day grace          → allowed, warning
//   past_due, grace expired               → lazily transitions to
//                                            suspended (no background
//                                            job runner exists yet;
//                                            this check applies the
//                                            expiry on read instead)
//   suspended, cancelled                  → not allowed
//   no row at all                         → not allowed ("none")
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import {
  coachSubscriptions,
  type CoachSubscriptionStatus,
} from "./schema-billing";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─────────────────────────────────────────────────────────────
// ENTITLEMENT CHECK
// ─────────────────────────────────────────────────────────────

export interface CoachEntitlement {
  status: CoachSubscriptionStatus | "none";
  allowed: boolean;
  /** true only for past_due within the grace window — HQ stays usable,
   *  but the caller should surface a visible billing warning. */
  warning: boolean;
  gracePeriodEnd: Date | null;
}

export async function getCoachEntitlement(
  coachId: string,
): Promise<CoachEntitlement> {
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

  let gracePeriodEnd: Date | null;
  if (sync.status === "past_due") {
    gracePeriodEnd =
      existing?.status === "past_due"
        ? existing.gracePeriodEnd
        : new Date(Date.now() + GRACE_PERIOD_MS);
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

  await db
    .insert(coachSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: coachSubscriptions.coachId, set: values });
}
