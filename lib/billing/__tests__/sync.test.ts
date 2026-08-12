// ─────────────────────────────────────────────────────────────
// lib/billing/sync.ts — real-DB test suite
//
// Constructs plain Stripe.Subscription-shaped fixture objects rather
// than calling the live Stripe API — syncCoachSubscriptionFromStripeSubscription()
// only ever reads fields off an already-resolved Subscription object
// (exactly what the webhook and the checkout-return fast path both
// already have on hand), so a fixture object is a faithful, safe way
// to exercise it without any network call.
//
// Same fixture pattern as lib/db/__tests__/coach-entitlement.test.ts:
// real Supabase Auth user, cleanup in afterAll().
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "@/lib/db/schema";
import { coachSubscriptions } from "@/lib/db/schema-billing";
import {
  mapStripeSubscriptionStatus,
  syncCoachSubscriptionFromStripeSubscription,
} from "../sync";

const db = getDb();
const coach = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `billing-sync-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  coach.id = await createAuthUser("sync");
  await db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id));
});

afterAll(async () => {
  if (coach.id) {
    await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coach.id));
    await db.delete(users).where(eq(users.id, coach.id));
    const supa = createAdminClient();
    await supa.auth.admin.deleteUser(coach.id);
  }
});

function fakeSubscription(
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  const priceId = (overrides.priceId as string | null | undefined) ?? "price_test_monthly";

  const base = {
    id: `sub_test_${randomUUID()}`,
    object: "subscription",
    customer: "cus_test_fake",
    status: "active",
    metadata: { coachId: coach.id },
    items: {
      object: "list",
      data: [
        {
          price: priceId ? { id: priceId } : null,
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60,
        },
      ],
    },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
  };

  const { priceId: _drop, ...rest } = overrides;
  void _drop;
  return { ...base, ...rest } as unknown as Stripe.Subscription;
}

describe("mapStripeSubscriptionStatus — pure mapping", () => {
  it("maps every modeled status", () => {
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("cancelled");
  });

  it("returns null for a not-yet-modeled status rather than guessing", () => {
    expect(mapStripeSubscriptionStatus("incomplete")).toBeNull();
    expect(mapStripeSubscriptionStatus("unpaid")).toBeNull();
    expect(mapStripeSubscriptionStatus("paused")).toBeNull();
  });
});

describe("syncCoachSubscriptionFromStripeSubscription — real DB", () => {
  it("fails cleanly with missing_coach_id when metadata.coachId is absent", async () => {
    const sub = fakeSubscription({ metadata: {} });
    const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_coach_id");
  });

  it("fails cleanly with unmapped_status for a status this app doesn't model", async () => {
    const sub = fakeSubscription({ status: "incomplete" });
    const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unmapped_status");
  });

  it("upserts coach_subscriptions with the subscription's real shape on success", async () => {
    const sub = fakeSubscription({ status: "trialing", priceId: "price_test_monthly" });
    const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coachId).toBe(coach.id);
    expect(result.status).toBe("trialing");

    const [row] = await db
      .select()
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row.status).toBe("trialing");
    expect(row.stripeSubscriptionId).toBe(sub.id);
    expect(row.stripePriceId).toBe("price_test_monthly");
    expect(row.stripeCustomerId).toBe("cus_test_fake");
    expect(row.currentPeriodEnd).not.toBeNull();
  });

  it("forceStatus overrides the subscription's own status — used for customer.subscription.deleted", async () => {
    const sub = fakeSubscription({ status: "active" });
    const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`, "cancelled");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("cancelled");

    const [row] = await db
      .select({ status: coachSubscriptions.status })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row.status).toBe("cancelled");
  });

  it("upserts by coachId — a second sync updates the same row rather than creating a duplicate", async () => {
    const first = fakeSubscription({ status: "trialing" });
    await syncCoachSubscriptionFromStripeSubscription(first, `evt_${randomUUID()}`);

    const second = fakeSubscription({ status: "active", customer: "cus_test_fake_2" });
    await syncCoachSubscriptionFromStripeSubscription(second, `evt_${randomUUID()}`);

    const rows = await db
      .select()
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].stripeSubscriptionId).toBe(second.id);
    expect(rows[0].stripeCustomerId).toBe("cus_test_fake_2");
  });

  // ─────────────────────────────────────────────────────────────
  // PROVEN DEFECT — found via a real Stripe test-mode Billing Portal
  // cancellation, replayed against the real webhook route end-to-end.
  // Scheduling a cancellation through the Portal leaves
  // sub.cancel_at_period_end false and sets sub.cancel_at (a future
  // timestamp) instead — the exact shape Stripe's real API returns,
  // reproduced here as a fixture so this doesn't depend on hitting a
  // live Stripe account to verify.
  // ─────────────────────────────────────────────────────────────
  describe("cancelAtPeriodEnd — real Portal-scheduled-cancellation shape", () => {
    it("is true when Stripe reports it via cancel_at (not cancel_at_period_end) on a still-active subscription — the real shape a Billing Portal cancellation produces", async () => {
      const now = Math.floor(Date.now() / 1000);
      const sub = fakeSubscription({
        status: "trialing",
        cancel_at_period_end: false,
        cancel_at: now + 10 * 24 * 60 * 60,
        canceled_at: now,
      });
      const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);
      expect(result.ok).toBe(true);

      const [row] = await db
        .select({ cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd })
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, coach.id))
        .limit(1);
      expect(row.cancelAtPeriodEnd).toBe(true);
    });

    it("is still true when the legacy cancel_at_period_end boolean is set (never regressed by the cancel_at check)", async () => {
      const sub = fakeSubscription({ status: "active", cancel_at_period_end: true, cancel_at: null });
      await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);

      const [row] = await db
        .select({ cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd })
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, coach.id))
        .limit(1);
      expect(row.cancelAtPeriodEnd).toBe(true);
    });

    it("is false for an ordinary active subscription with no scheduled cancellation", async () => {
      const sub = fakeSubscription({ status: "active", cancel_at_period_end: false, cancel_at: null });
      await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`);

      const [row] = await db
        .select({ cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd })
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, coach.id))
        .limit(1);
      expect(row.cancelAtPeriodEnd).toBe(false);
    });

    it("is false once the subscription has actually been deleted (status canceled), even though cancel_at is still populated — nothing is 'still scheduled' once it already happened", async () => {
      const now = Math.floor(Date.now() / 1000);
      const sub = fakeSubscription({
        status: "canceled",
        cancel_at_period_end: false,
        cancel_at: now - 60,
        canceled_at: now,
      });
      const result = await syncCoachSubscriptionFromStripeSubscription(sub, `evt_${randomUUID()}`, "cancelled");
      expect(result.ok).toBe(true);

      const [row] = await db
        .select({ cancelAtPeriodEnd: coachSubscriptions.cancelAtPeriodEnd, status: coachSubscriptions.status })
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, coach.id))
        .limit(1);
      expect(row.status).toBe("cancelled");
      expect(row.cancelAtPeriodEnd).toBe(false);
    });
  });
});
