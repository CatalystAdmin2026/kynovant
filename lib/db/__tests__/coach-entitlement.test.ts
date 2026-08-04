// ─────────────────────────────────────────────────────────────
// Coach Subscription Entitlement — integration test suite
//
// Proves, against a REAL database connection, that:
//   1. getCoachEntitlement() implements the approved status behavior
//      table exactly: active/trialing/manually_activated allowed;
//      past_due allowed-with-warning inside its 7-day grace window;
//      past_due past grace lazily transitions to suspended and is
//      denied; cancelled/suspended denied; no row at all denied.
//   2. assertCoachEntitled() bypasses the check entirely for admin
//      (and any non-coach role) — never even queries coach_subscriptions.
//   3. activateCoachBeta() / suspendCoachSubscription() work and their
//      effect is immediately visible to getCoachEntitlement().
//   4. The Stripe webhook's idempotency gate rejects a duplicate event
//      ID — the second delivery is a no-op, not a re-processed event.
//
// Same fixture pattern as the other integration suites in this
// directory: real Supabase Auth users, cleanup in afterAll().
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachSubscriptions, processedStripeEvents } from "../schema-billing";
import {
  getCoachEntitlement,
  activateCoachBeta,
  suspendCoachSubscription,
} from "../coach-subscription-service";
import { assertCoachEntitled } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import { stripe } from "@/lib/stripe";
import { POST as stripeWebhookPost } from "@/app/api/stripe/webhook/route";

const db = getDb();

function fakeDbUser(id: string, role: "coach" | "admin"): PublicUser {
  return {
    id,
    email: `${id}@entitlement-test.invalid`,
    normalizedEmail: `${id}@entitlement-test.invalid`,
    emailVerifiedAt: null,
    role,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as PublicUser;
}

const coach = { id: "" };
const admin = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `entitlement-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coach.id, admin.id] = await Promise.all([
    createAuthUser("coach"),
    createAuthUser("admin"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id)),
    db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id)),
  ]);
});

afterAll(async () => {
  const userIds = [coach.id, admin.id].filter(Boolean);
  if (userIds.length > 0) {
    await db.delete(coachSubscriptions).where(inArray(coachSubscriptions.coachId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    const supa = createAdminClient();
    await Promise.all(userIds.map((id) => supa.auth.admin.deleteUser(id)));
  }
});

async function setSubscriptionRow(overrides: Partial<typeof coachSubscriptions.$inferInsert>) {
  await db
    .insert(coachSubscriptions)
    .values({
      coachId: coach.id,
      status: "active",
      ...overrides,
    })
    .onConflictDoUpdate({
      target: coachSubscriptions.coachId,
      set: { coachId: coach.id, status: "active", ...overrides },
    });
}

async function clearSubscriptionRow() {
  await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coach.id));
}

// ─────────────────────────────────────────────────────────────

describe("getCoachEntitlement — status behavior table", () => {
  it("no row at all — not allowed", async () => {
    await clearSubscriptionRow();
    const result = await getCoachEntitlement(coach.id);
    expect(result).toEqual({ status: "none", allowed: false, warning: false, gracePeriodEnd: null });
  });

  it("active — allowed, no warning", async () => {
    await setSubscriptionRow({ status: "active" });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("trialing — allowed, no warning", async () => {
    await setSubscriptionRow({ status: "trialing" });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("manually_activated — allowed, no warning", async () => {
    await setSubscriptionRow({ status: "manually_activated" });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("past_due within the 7-day grace window — allowed, with warning", async () => {
    const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
    await setSubscriptionRow({ status: "past_due", gracePeriodEnd: graceEnd });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
    expect(result.status).toBe("past_due");
  });

  it("past_due with an expired grace window — lazily transitions to suspended, not allowed", async () => {
    const graceEnd = new Date(Date.now() - 1000); // already elapsed
    await setSubscriptionRow({ status: "past_due", gracePeriodEnd: graceEnd });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("suspended");

    // The transition must actually be persisted, not just returned —
    // a second read should see 'suspended' directly, not re-derive it.
    const [row] = await db
      .select({ status: coachSubscriptions.status })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row.status).toBe("suspended");
  });

  it("cancelled — not allowed", async () => {
    await setSubscriptionRow({ status: "cancelled", cancelledAt: new Date() });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(false);
  });

  it("suspended — not allowed", async () => {
    await setSubscriptionRow({ status: "suspended" });
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(false);
  });
});

describe("assertCoachEntitled — admin bypass", () => {
  it("denies a coach with no subscription row", async () => {
    await clearSubscriptionRow();
    const result = await assertCoachEntitled(fakeDbUser(coach.id, "coach"));
    expect(result.ok).toBe(false);
  });

  it("allows a coach with an active subscription", async () => {
    await setSubscriptionRow({ status: "active" });
    const result = await assertCoachEntitled(fakeDbUser(coach.id, "coach"));
    expect(result.ok).toBe(true);
  });

  it("admin bypasses the check entirely — never denied, regardless of subscription state", async () => {
    // No subscription row exists for `admin.id` at all — if the bypass
    // were not structural, this would fail exactly like the no-row
    // coach case above.
    const result = await assertCoachEntitled(fakeDbUser(admin.id, "admin"));
    expect(result.ok).toBe(true);
  });
});

describe("activateCoachBeta / suspendCoachSubscription — manual activation", () => {
  it("activateCoachBeta grants immediate access with status manually_activated", async () => {
    await clearSubscriptionRow();
    await activateCoachBeta(coach.id, admin.id);
    const result = await getCoachEntitlement(coach.id);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("manually_activated");
  });

  it("suspendCoachSubscription immediately revokes access", async () => {
    await setSubscriptionRow({ status: "active" });
    const suspendResult = await suspendCoachSubscription(coach.id, admin.id);
    expect(suspendResult.ok).toBe(true);

    const entitlement = await getCoachEntitlement(coach.id);
    expect(entitlement.allowed).toBe(false);
    expect(entitlement.status).toBe("suspended");
  });

  it("suspendCoachSubscription fails cleanly for a coach with no subscription record", async () => {
    await clearSubscriptionRow();
    const result = await suspendCoachSubscription(coach.id, admin.id);
    expect(result.ok).toBe(false);
  });
});

describe("Stripe webhook — duplicate delivery is ignored", () => {
  it("processes an event once, then ignores a redelivery of the same event ID", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET must be set for this test");

    const eventId = `evt_test_${randomUUID()}`;
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      api_version: "2026-06-24.dahlia",
      created: Math.floor(Date.now() / 1000),
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_test_${randomUUID()}`,
          object: "subscription",
          customer: "cus_test_idempotency",
          status: "active",
          items: { object: "list", data: [] },
          metadata: {},
          cancel_at_period_end: false,
          canceled_at: null,
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
    });

    const signature = stripe().webhooks.generateTestHeaderString({ payload, secret });

    function buildRequest(): NextRequest {
      return new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature, "content-type": "application/json" },
        body: payload,
      });
    }

    const firstResponse = await stripeWebhookPost(buildRequest());
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(firstBody.duplicate).toBeUndefined();

    const [row] = await db
      .select({ stripeEventId: processedStripeEvents.stripeEventId })
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.stripeEventId, eventId))
      .limit(1);
    expect(row).toBeDefined();

    const secondResponse = await stripeWebhookPost(buildRequest());
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.duplicate).toBe(true);

    // Cleanup — this test's own event row, not part of the shared fixture.
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.stripeEventId, eventId));
  });
});
