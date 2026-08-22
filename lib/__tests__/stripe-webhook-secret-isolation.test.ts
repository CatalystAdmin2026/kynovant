// ─────────────────────────────────────────────────────────────
// Stripe webhook — Kept vs legacy-Catalyst signing-secret isolation
//
// Proves app/api/stripe/webhook/route.ts's handleCatalystWebhook()
// picks the correct signing secret by HOST, never falls back from one
// secret to the other, and fails closed when the expected secret for
// a recognized host is missing. Same technique as the existing
// lib/db/__tests__/coach-subscription-checkout-webhook.test.ts: signs
// a real Stripe.Event payload locally via
// catalystStripe().webhooks.generateTestHeaderString() and POSTs it
// straight to the real route handler. No live Stripe API call.
//
// Deliberately self-contained: both signing secrets used here are
// locally-generated test values (never the real
// CATALYST_STRIPE_WEBHOOK_SECRET/KEPT_STRIPE_WEBHOOK_SECRET), so this
// suite runs identically with or without .env.local loaded — this
// vitest run does not load .env.local by default, the same
// pre-existing gap affecting other DB-touching test files in this
// repo when run outside `next dev`/a real env.
//
// getDb() is mocked (not the real Postgres connection) for the two
// "signature verified successfully" cases — this suite is scoped to
// signing-secret selection, not to end-to-end persistence.
// STRIPE_EVENTS_GAS_URL is unset for the duration of this file so no
// real network call reaches the production Google Sheets script.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { catalystStripe } from "@/lib/stripe";
import { catalystStripeWebhookSecretSource } from "@/lib/domain-routing";

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [], // never a duplicate
        }),
      }),
    }),
  }),
}));

// Imported AFTER the mock above so the route module picks it up.
const { POST: stripeWebhookPost } = await import("@/app/api/stripe/webhook/route");

const ORIGINAL_CATALYST_SECRET = process.env.CATALYST_STRIPE_WEBHOOK_SECRET;
const ORIGINAL_KEPT_SECRET = process.env.KEPT_STRIPE_WEBHOOK_SECRET;
const ORIGINAL_GAS_URL = process.env.STRIPE_EVENTS_GAS_URL;
const ORIGINAL_CATALYST_API_KEY = process.env.CATALYST_STRIPE_SECRET_KEY;

const TEST_CATALYST_SECRET = `whsec_test_catalyst_${randomUUID().slice(0, 12)}`;
const TEST_KEPT_SECRET = `whsec_test_kept_${randomUUID().slice(0, 12)}`;

beforeAll(() => {
  delete process.env.STRIPE_EVENTS_GAS_URL;
  // catalystStripe() needs *an* API key string to construct a client at
  // all, even for the local-only signing/verification helpers used in
  // this file (no real Stripe API call is ever made) — this vitest run
  // doesn't load .env.local, so provide a harmless placeholder.
  if (!process.env.CATALYST_STRIPE_SECRET_KEY) {
    process.env.CATALYST_STRIPE_SECRET_KEY = "sk_test_placeholder_for_local_signing_only";
  }
});

afterAll(() => {
  if (ORIGINAL_GAS_URL === undefined) delete process.env.STRIPE_EVENTS_GAS_URL;
  else process.env.STRIPE_EVENTS_GAS_URL = ORIGINAL_GAS_URL;

  if (ORIGINAL_CATALYST_SECRET === undefined) delete process.env.CATALYST_STRIPE_WEBHOOK_SECRET;
  else process.env.CATALYST_STRIPE_WEBHOOK_SECRET = ORIGINAL_CATALYST_SECRET;

  if (ORIGINAL_KEPT_SECRET === undefined) delete process.env.KEPT_STRIPE_WEBHOOK_SECRET;
  else process.env.KEPT_STRIPE_WEBHOOK_SECRET = ORIGINAL_KEPT_SECRET;

  if (ORIGINAL_CATALYST_API_KEY === undefined) delete process.env.CATALYST_STRIPE_SECRET_KEY;
  else process.env.CATALYST_STRIPE_SECRET_KEY = ORIGINAL_CATALYST_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function signedRequest(url: string, secret: string): NextRequest {
  const payload = JSON.stringify({
    id: `evt_test_${randomUUID()}`,
    object: "event",
    api_version: "2025-12-15.clover",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.deleted",
    data: { object: { id: `sub_test_${randomUUID()}`, object: "subscription" } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const signature = catalystStripe().webhooks.generateTestHeaderString({ payload, secret });

  return new NextRequest(url, {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

describe("catalystStripeWebhookSecretSource (pure classification)", () => {
  it("classifies Kept hosts", () => {
    expect(catalystStripeWebhookSecretSource("keptperformance.com")).toBe("kept");
    expect(catalystStripeWebhookSecretSource("www.keptperformance.com:443")).toBe("kept");
  });

  it("classifies legacy Catalyst hosts", () => {
    expect(catalystStripeWebhookSecretSource("catalystcoachingelite.com")).toBe("catalyst-legacy");
    expect(catalystStripeWebhookSecretSource("www.catalystcoachingelite.com:443")).toBe("catalyst-legacy");
  });

  it("returns null for Kynovant, localhost, and unknown hosts", () => {
    expect(catalystStripeWebhookSecretSource("kynovant.com")).toBeNull();
    expect(catalystStripeWebhookSecretSource("localhost:3000")).toBeNull();
    expect(catalystStripeWebhookSecretSource("example.vercel.app")).toBeNull();
  });
});

describe("Stripe webhook — Kept vs Catalyst signing-secret selection", () => {
  it("Kept host + Kept secret verifies successfully", async () => {
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    delete process.env.CATALYST_STRIPE_WEBHOOK_SECRET;
    const req = signedRequest(
      "https://www.keptperformance.com/api/stripe/webhook",
      TEST_KEPT_SECRET,
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(200);
  });

  it("Catalyst-legacy host + Catalyst secret verifies successfully", async () => {
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    delete process.env.KEPT_STRIPE_WEBHOOK_SECRET;
    const req = signedRequest(
      "https://www.catalystcoachingelite.com/api/stripe/webhook",
      TEST_CATALYST_SECRET,
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(200);
  });

  it("a Kept-signed payload is rejected on the Catalyst-legacy host", async () => {
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    const req = signedRequest(
      "https://www.catalystcoachingelite.com/api/stripe/webhook",
      TEST_KEPT_SECRET, // signed with Kept's secret, sent to the Catalyst host
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Webhook signature invalid");
    // Neither secret value ever appears in a logged message.
    for (const call of errSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_KEPT_SECRET);
      expect(JSON.stringify(call)).not.toContain(TEST_CATALYST_SECRET);
    }
  });

  it("a Catalyst-signed payload is rejected on the Kept host", async () => {
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    const req = signedRequest(
      "https://www.keptperformance.com/api/stripe/webhook",
      TEST_CATALYST_SECRET, // signed with Catalyst's secret, sent to the Kept host
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Webhook signature invalid");
  });

  it("fails closed (503, no fallback) when KEPT_STRIPE_WEBHOOK_SECRET is missing", async () => {
    delete process.env.KEPT_STRIPE_WEBHOOK_SECRET;
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    const req = signedRequest(
      "https://www.keptperformance.com/api/stripe/webhook",
      TEST_CATALYST_SECRET, // even a validly-signed Catalyst payload must not pass
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Webhook not configured on server");
    for (const call of errSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_CATALYST_SECRET);
    }
  });

  it("fails closed (503, no fallback) when CATALYST_STRIPE_WEBHOOK_SECRET is missing", async () => {
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    delete process.env.CATALYST_STRIPE_WEBHOOK_SECRET;
    const req = signedRequest(
      "https://www.catalystcoachingelite.com/api/stripe/webhook",
      TEST_KEPT_SECRET, // even a validly-signed Kept payload must not pass
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Webhook not configured on server");
  });

  it("fails closed on a catalyst-brand request that resolves no specific host and no override", async () => {
    // ?__brand=catalyst reaches handleCatalystWebhook (mirrors real
    // preview-deployment traffic with no real DNS), but without a
    // ?__catalyst_secret override this must NOT default to either secret.
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    const req = signedRequest(
      "http://localhost/api/stripe/webhook?__brand=catalyst",
      TEST_CATALYST_SECRET,
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unrecognized webhook host");
  });

  it("the ?__catalyst_secret override still requires an exact match — no cross-secret fallback", async () => {
    process.env.KEPT_STRIPE_WEBHOOK_SECRET = TEST_KEPT_SECRET;
    process.env.CATALYST_STRIPE_WEBHOOK_SECRET = TEST_CATALYST_SECRET;
    const req = signedRequest(
      "http://localhost/api/stripe/webhook?__brand=catalyst&__catalyst_secret=kept",
      TEST_CATALYST_SECRET, // wrong secret for the overridden "kept" source
    );
    const res = await stripeWebhookPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Webhook signature invalid");
  });
});
