// ─────────────────────────────────────────────────────────────
// SERVER-ONLY — never import this file from a client component.
// It initializes the Stripe SDK for the Catalyst Coaching Elite Stripe
// account (client coaching-package payments) with CATALYST_STRIPE_SECRET_KEY,
// which must never reach the browser bundle.
//
// This is a DIFFERENT Stripe account from Kynovant's coach-platform
// billing — see lib/billing/stripe-client.ts's kynovantStripe() for
// that one. Catalyst and Kynovant are separate businesses with
// separate Stripe accounts; never pass a value read from one business's
// env vars to the other's client, and never use catalystStripe() for
// anything under lib/billing/ (Kynovant's domain).
// ─────────────────────────────────────────────────────────────

import Stripe from "stripe";

// Lazily accessed so Next.js build doesn't fail when
// CATALYST_STRIPE_SECRET_KEY is absent — it will fail at runtime
// (server-side only) if missing.
function getCatalystStripe(): Stripe {
  const key = process.env.CATALYST_STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "CATALYST_STRIPE_SECRET_KEY is not set. Add it to .env.local — see env.local.example.",
    );
  }
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

// Singleton — module-level cache safe in server context
let _catalystStripe: Stripe | null = null;
export function catalystStripe(): Stripe {
  if (!_catalystStripe) _catalystStripe = getCatalystStripe();
  return _catalystStripe;
}

// ─────────────────────────────────────────────────────────────
// NORMALIZED EVENT
// A flat, human-readable representation of any Stripe event we
// handle. Keeps webhook logic and persistence logic decoupled.
//
// TODO (Phase 3): Persist NormalizedStripeEvent rows to a store
// (Supabase / Upstash / JSON file) so the admin dashboard can
// display real payment history without re-fetching from Stripe.
// ─────────────────────────────────────────────────────────────

export interface NormalizedStripeEvent {
  eventId: string;
  eventType: string;
  createdAt: Date;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  checkoutSessionId: string | null;
  invoiceId: string | null;
  priceId: string | null;
  productId: string | null;
  /** Amount in cents */
  amountCents: number | null;
  currency: string | null;
  paymentStatus: string | null;
}

// ─────────────────────────────────────────────────────────────
// NORMALIZER
// Extracts the fields we care about from any supported event type.
// Safe to call with unknown event types — returns nulls for fields
// that don't exist on that event.
// ─────────────────────────────────────────────────────────────

// Double-cast helper: Stripe's event.data.object is a huge union type.
// We narrow it per event.type; the double-cast (→ unknown → T) is the
// correct TypeScript pattern when the union doesn't overlap.
function castAs<T>(v: unknown): T {
  return v as unknown as T;
}

// Safely resolve a Stripe expandable field (string id or expanded
// object). Exported — lib/billing/sync.ts and app/api/stripe/webhook/
// route.ts both need this exact same coercion and previously each kept
// their own private copy.
export function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (v !== null && typeof v === "object" && "id" in v) {
    return (v as { id: string }).id ?? null;
  }
  return null;
}

export function normalizeStripeEvent(event: Stripe.Event): NormalizedStripeEvent {
  const base: NormalizedStripeEvent = {
    eventId:            event.id,
    eventType:          event.type,
    createdAt:          new Date(event.created * 1000),
    customerId:         null,
    customerEmail:      null,
    customerName:       null,
    subscriptionId:     null,
    subscriptionStatus: null,
    checkoutSessionId:  null,
    invoiceId:          null,
    priceId:            null,
    productId:          null,
    amountCents:        null,
    currency:           null,
    paymentStatus:      null,
  };

  switch (event.type) {

    case "checkout.session.completed": {
      const s = castAs<Stripe.Checkout.Session>(event.data.object);
      base.checkoutSessionId  = s.id;
      base.customerId         = strOrNull(s.customer);
      base.customerEmail      = s.customer_email ?? s.customer_details?.email ?? null;
      base.customerName       = s.customer_details?.name ?? null;
      base.subscriptionId     = strOrNull(s.subscription);
      base.amountCents        = s.amount_total;
      base.currency           = s.currency;
      base.paymentStatus      = s.payment_status;
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const s = castAs<Stripe.Subscription>(event.data.object);
      base.customerId         = strOrNull(s.customer);
      base.subscriptionId     = s.id;
      base.subscriptionStatus = s.status;
      const item              = s.items?.data?.[0];
      base.priceId            = item?.price?.id ?? null;
      base.productId          = strOrNull(item?.price?.product) ?? null;
      base.amountCents        = item?.price?.unit_amount ?? null;
      base.currency           = item?.price?.currency ?? null;
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = castAs<Stripe.Invoice>(event.data.object);
      base.customerId    = strOrNull(inv.customer);
      base.customerEmail = inv.customer_email ?? null;
      base.customerName  = inv.customer_name ?? null;
      // subscription is a top-level expandable field on Invoice
      base.subscriptionId = strOrNull((inv as unknown as Record<string, unknown>)["subscription"]);
      base.invoiceId     = inv.id ?? null;
      base.amountCents   = ("amount_paid" in inv ? (inv as { amount_paid: number }).amount_paid : null)
                           ?? inv.amount_due
                           ?? null;
      base.currency      = inv.currency;
      base.paymentStatus = inv.status ?? null;
      break;
    }

    default: {
      // Non-critical event — extract customer id if present
      const raw = event.data.object as unknown as Record<string, unknown>;
      if ("customer" in raw) base.customerId = strOrNull(raw["customer"]);
      break;
    }
  }

  return base;
}

// ─────────────────────────────────────────────────────────────
// PACKAGE MAPPING
// Maps Stripe Price IDs → Catalyst package display names.
//
// How to populate:
//   1. Go to Stripe Dashboard → Products
//   2. Open each product and copy the Price ID (price_...)
//   3. Fill in below — use the EXACT display name from CoachingPackage
//      in lib/workflow.ts: "Standard" | "Founding Member" | "Legacy"
//                        | "Executive Performance"
//
// Note: checkout.session.completed events do NOT include priceId in the
// webhook payload by default (line_items must be expanded via an extra
// Stripe API call). package detection on checkout events will return ""
// until either:
//   a) Line items are expanded in the normalizer, or
//   b) packageName is derived from subscription.created (which does carry priceId).
// ─────────────────────────────────────────────────────────────

export const PRICE_ID_TO_PACKAGE: Record<string, string> = {
  // "price_...": "Standard",
  // "price_...": "Founding Member",
  // "price_...": "Legacy",
  // "price_...": "Executive Performance",
};

/** Returns the package name for a Stripe Price ID, or "" if unknown/unmapped. */
export function packageFromPriceId(priceId: string | null): string {
  if (!priceId) return "";
  return PRICE_ID_TO_PACKAGE[priceId] ?? "";
}

// Coach-plan price classification (distinguishing a Kynovant coach-
// platform-seat Price ID from a Catalyst Elite end-client coaching-
// package Price ID) has moved to lib/billing/prices.ts's
// isCoachPlanPrice() — that module is this app's single Price ID
// registry (Stripe Product → Price → Price ID → env var → app), and
// duplicating a second price-classification mechanism here would
// undermine that. Import isCoachPlanPrice from "@/lib/billing/prices".

// ─────────────────────────────────────────────────────────────
// GAS PAYLOAD
// Flat object sent to the Stripe Events GAS script (doPost).
// Matches the column schema in scripts/stripe-events-backend.gs.
// ─────────────────────────────────────────────────────────────

export interface GasStripePayload {
  eventType:          string;
  customerEmail:      string;
  customerName:       string;
  customerId:         string;
  subscriptionId:     string;
  paymentStatus:      string;
  subscriptionStatus: string;
  amountCents:        number | null;
  currency:           string;
  productId:          string;
  priceId:            string;
  packageName:        string;
  rawEventId:         string;
}

export function toGasPayload(
  event: NormalizedStripeEvent,
): GasStripePayload {
  return {
    eventType:          event.eventType,
    customerEmail:      event.customerEmail      ?? "",
    customerName:       event.customerName       ?? "",
    customerId:         event.customerId         ?? "",
    subscriptionId:     event.subscriptionId     ?? "",
    paymentStatus:      event.paymentStatus      ?? "",
    subscriptionStatus: event.subscriptionStatus ?? "",
    amountCents:        event.amountCents,
    currency:           event.currency           ?? "",
    productId:          event.productId          ?? "",
    priceId:            event.priceId            ?? "",
    packageName:        packageFromPriceId(event.priceId),
    rawEventId:         event.eventId,
  };
}

// ─────────────────────────────────────────────────────────────
// WEBHOOK EVENTS WE HANDLE
// Single source of truth used by both the webhook route and the
// admin dashboard's Stripe Events tab.
// ─────────────────────────────────────────────────────────────

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type HandledEventType = (typeof HANDLED_EVENTS)[number];

export const EVENT_DESCRIPTIONS: Record<HandledEventType, string> = {
  "checkout.session.completed":     "Customer completed checkout — maps to a new enrollment",
  "customer.subscription.created":  "Stripe subscription created — mark lead as Active Client",
  "customer.subscription.updated":  "Subscription changed — sync status and price changes",
  "customer.subscription.deleted":  "Subscription cancelled — update to Cancelled pipeline stage",
  "invoice.paid":                   "Monthly invoice succeeded — confirm MRR for billing period",
  "invoice.payment_failed":         "Payment failed — flag as past_due, create urgent task",
};
