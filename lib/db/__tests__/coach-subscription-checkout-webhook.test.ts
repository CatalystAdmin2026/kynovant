// ─────────────────────────────────────────────────────────────
// Stripe webhook × coach-plan billing — end-to-end, price-registry-driven
//
// Same technique as the existing "Stripe webhook — duplicate delivery
// is ignored" suite in coach-entitlement.test.ts: constructs a
// signature-valid Stripe.Event locally via
// kynovantStripe().webhooks.generateTestHeaderString() and POSTs it
// straight to the real route handler. No live Stripe API call is made
// anywhere in this file — signing and signature verification are both
// local HMAC operations. Every request carries ?__brand=kynovant since
// there's no real kynovant.com hostname available in a test process —
// see app/api/stripe/webhook/route.ts's resolveWebhookBrand().
//
// Proves the price registry (lib/billing/prices.ts) actually drives
// event handling end-to-end within the Kynovant branch: a subscription
// event on the configured KYNOVANT_STRIPE_MONTHLY_PRICE_ID reaches
// coach_subscriptions; an unrelated price id does not. Also proves
// checkout.session.completed in the Kynovant branch never runs any
// Catalyst client-enrollment logic (structurally impossible now — the
// two branches are entirely separate functions — but this asserts the
// actual log output as a concrete, observable check).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachSubscriptions } from "../schema-billing";
import { kynovantStripe } from "@/lib/billing/stripe-client";
import { POST as stripeWebhookPost } from "@/app/api/stripe/webhook/route";

const db = getDb();
const coach = { id: "" };

const ENV_VAR = "KYNOVANT_STRIPE_MONTHLY_PRICE_ID";
const originalPriceId = process.env[ENV_VAR];
const TEST_PRICE_ID = `price_test_webhook_${randomUUID().slice(0, 8)}`;

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `checkout-webhook-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  process.env[ENV_VAR] = TEST_PRICE_ID;
  coach.id = await createAuthUser("coach");
  await db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coach.id));
});

afterAll(async () => {
  if (originalPriceId === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalPriceId;

  if (coach.id) {
    await db.delete(coachSubscriptions).where(eq(coachSubscriptions.coachId, coach.id));
    await db.delete(users).where(eq(users.id, coach.id));
    const supa = createAdminClient();
    await supa.auth.admin.deleteUser(coach.id);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildSignedRequest(eventId: string, type: string, dataObject: Record<string, unknown>): NextRequest {
  const secret = process.env.KYNOVANT_STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("KYNOVANT_STRIPE_WEBHOOK_SECRET must be set for this test");

  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: dataObject },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const signature = kynovantStripe().webhooks.generateTestHeaderString({ payload, secret });

  return new NextRequest("http://localhost/api/stripe/webhook?__brand=kynovant", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

describe("Stripe webhook — coach-plan events are routed by the price registry", () => {
  it("customer.subscription.created on the configured monthly Price ID syncs coach_subscriptions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const subId = `sub_test_${randomUUID()}`;

    const res = await stripeWebhookPost(
      buildSignedRequest(`evt_test_${randomUUID()}`, "customer.subscription.created", {
        id: subId,
        object: "subscription",
        customer: "cus_test_webhook",
        status: "trialing",
        metadata: { coachId: coach.id },
        items: {
          object: "list",
          data: [
            {
              price: { id: TEST_PRICE_ID },
              current_period_start: now,
              current_period_end: now + 14 * 24 * 60 * 60,
            },
          ],
        },
        cancel_at_period_end: false,
        canceled_at: null,
      }),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row.status).toBe("trialing");
    expect(row.stripeSubscriptionId).toBe(subId);
    expect(row.stripePriceId).toBe(TEST_PRICE_ID);
  });

  it("customer.subscription.deleted on the configured Price ID marks the coach cancelled", async () => {
    const subId = `sub_test_${randomUUID()}`;
    const res = await stripeWebhookPost(
      buildSignedRequest(`evt_test_${randomUUID()}`, "customer.subscription.deleted", {
        id: subId,
        object: "subscription",
        customer: "cus_test_webhook",
        status: "canceled",
        metadata: { coachId: coach.id },
        items: { object: "list", data: [{ price: { id: TEST_PRICE_ID } }] },
        cancel_at_period_end: false,
        canceled_at: Math.floor(Date.now() / 1000),
      }),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select({ status: coachSubscriptions.status })
      .from(coachSubscriptions)
      .where(eq(coachSubscriptions.coachId, coach.id))
      .limit(1);
    expect(row.status).toBe("cancelled");
  });

  it("an event on a price NOT in the registry never reaches coach_subscriptions", async () => {
    const otherCoach = await createAuthUser("unrelated");
    try {
      await db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, otherCoach));

      const res = await stripeWebhookPost(
        buildSignedRequest(`evt_test_${randomUUID()}`, "customer.subscription.created", {
          id: `sub_test_${randomUUID()}`,
          object: "subscription",
          customer: "cus_test_other",
          status: "active",
          metadata: { coachId: otherCoach },
          items: {
            object: "list",
            data: [{ price: { id: "price_catalyst_client_package_unrelated" } }],
          },
          cancel_at_period_end: false,
          canceled_at: null,
        }),
      );
      expect(res.status).toBe(200);

      const rows = await db
        .select()
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, otherCoach));
      expect(rows).toHaveLength(0);
    } finally {
      const supa = createAdminClient();
      await supa.auth.admin.deleteUser(otherCoach);
    }
  });

  it("checkout.session.completed on the Kynovant branch never runs Catalyst client-enrollment logic", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await stripeWebhookPost(
      buildSignedRequest(`evt_test_${randomUUID()}`, "checkout.session.completed", {
        id: `cs_test_${randomUUID()}`,
        object: "checkout.session",
        customer: "cus_test_webhook",
        customer_email: null,
        customer_details: null,
        subscription: `sub_test_${randomUUID()}`,
        amount_total: 9900,
        currency: "usd",
        payment_status: "paid",
        metadata: { coachId: coach.id },
      }),
    );
    expect(res.status).toBe(200);

    // The Kynovant branch logs a coach-specific confirmation and never
    // reaches handleNewEnrollment (Catalyst-only, a different function
    // entirely — this call site can't invoke it regardless, but the log
    // output is a concrete, observable proof of which branch actually ran).
    const loggedKynovantCheckout = logSpy.mock.calls.some((call) =>
      typeof call[0] === "string" && call[0].includes("Kynovant checkout completed for coach"),
    );
    expect(loggedKynovantCheckout).toBe(true);

    const loggedClientWelcome = logSpy.mock.calls.some((call) =>
      typeof call[0] === "string" && call[0].includes("Welcome email sent"),
    );
    expect(loggedClientWelcome).toBe(false);
  });
});
