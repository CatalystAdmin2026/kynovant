// ─────────────────────────────────────────────────────────────
// Stripe Webhook Handler — server-only
//
// Catalyst Coaching Elite and Kynovant are two separate businesses
// with two separate Stripe accounts (separate secret keys, separate
// webhook signing secrets, separate registered endpoints). This ONE
// route file serves BOTH of their webhook URLs — Next.js's own
// domain-based rewriting maps each hostname's /api/stripe/webhook path
// here (see proxy.ts; API routes are deliberately excluded from that
// proxy's page-routing logic, so this file does its own classification):
//   https://www.catalystcoachingelite.com/api/stripe/webhook
//   https://www.kynovant.com/api/stripe/webhook
//
// POST() below resolves which business a request belongs to from its
// HOSTNAME FIRST — before reading any Stripe secret or running any
// business-specific logic — then dispatches to handleCatalystWebhook()
// or handleKynovantWebhook(), two fully independent functions that each
// use only their own business's env vars (CATALYST_STRIPE_* /
// KYNOVANT_STRIPE_*) and only their own business's data (Catalyst:
// client coaching-package payments, emails, Drive workspace, Sheets
// logging. Kynovant: coach_subscriptions). Neither function calls the
// other, imports the other's Stripe client, or touches the other's
// side effects.
//
// Local testing (no real DNS, so hostname alone can't classify):
//   stripe listen --forward-to "localhost:3000/api/stripe/webhook?__brand=kynovant"
//   stripe listen --forward-to "localhost:3000/api/stripe/webhook?__brand=catalyst"
//   (requires Stripe CLI — brew install stripe/stripe-cli/stripe; the
//   ?__brand= override mirrors proxy.ts's own local/preview convention)
//
// ── Catalyst-specific behavior (unchanged from before this split) ──
// Persistence (Phase 2B): the normalized payload is POSTed to the
//   Stripe Events GAS script (STRIPE_EVENTS_GAS_URL — a Catalyst-only
//   Sheets integration, not a Stripe credential, so not renamed).
//   Missing/unavailable GAS URL is non-fatal.
// Sprint 3B.1: checkout.session.completed → sendClientWelcomeEmail +
//   sendAdminNotificationEmail. Non-fatal.
// Sprint 3B.2: checkout.session.completed → createClientWorkspace via
//   GAS. Non-fatal.
// TODO (Phase 3): Map NormalizedStripeEvent fields to Lead pipeline
//   updates in app/admin/page.tsx.
//
// ── Kynovant-specific behavior ──
// customer.subscription.* / invoice.* → lib/billing/sync.ts, gated by
//   isCoachPlanPrice() (lib/billing/prices.ts) as defense-in-depth
//   within this already-Kynovant-only branch (is this specific price
//   one of Kynovant's own registered plans). checkout.session.completed
//   only logs — account activation happens via
//   customer.subscription.created plus the synchronous fast path in
//   app/account-status/page.tsx.
// ─────────────────────────────────────────────────────────────

import { Resend } from "resend";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  catalystStripe,
  normalizeStripeEvent,
  toGasPayload,
  packageFromPriceId,
  strOrNull,
  HANDLED_EVENTS,
} from "@/lib/stripe";
import type { GasStripePayload, NormalizedStripeEvent } from "@/lib/stripe";
import { kynovantStripe } from "@/lib/billing/stripe-client";
import { hostBrand, type Brand } from "@/lib/domain-routing";
import { getCatalystResendConfig } from "@/lib/email/resend-brand-config";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { processedStripeEvents, coachSubscriptions } from "@/lib/db/schema-billing";
import { upsertCoachSubscriptionFromStripe } from "@/lib/db/coach-subscription-service";
import { isCoachPlanPrice } from "@/lib/billing/prices";
import { syncCoachSubscriptionFromStripeSubscription } from "@/lib/billing/sync";

// ─────────────────────────────────────────────────────────────
// COACH SUBSCRIPTION EVENT HANDLING
//
// Distinct from the client-payment path above this file's original
// handleNewEnrollment — this branch only fires for events on a
// coach-plan Price ID (isCoachPlanPrice(), lib/billing/prices.ts —
// derived from that registry's configured env vars; unconfigured means
// this branch never fires).
//
// coachId is resolved from the Stripe object's metadata.coachId, set
// at Checkout Session creation (lib/billing/checkout.ts) or, for a
// manually-created Dashboard subscription (e.g. Founding Coach comp
// access), by an admin setting it by hand — same mechanism either way.
//
// The actual status-mapping and upsert logic lives in
// lib/billing/sync.ts, shared with the checkout-return fast path in
// app/account-status/page.tsx so both call sites stay identical.
// ─────────────────────────────────────────────────────────────

async function handleCoachSubscriptionUpsert(
  sub: Stripe.Subscription,
  eventId: string,
  forceStatus?: "cancelled",
): Promise<void> {
  const result = await syncCoachSubscriptionFromStripeSubscription(sub, eventId, forceStatus);
  if (!result.ok) {
    console.log(`[Stripe Webhook] ${result.detail} — skipping`);
    return;
  }
  console.log(`[Stripe Webhook] Synced coach_subscriptions for coach ${result.coachId}: ${result.status}`);
}

// invoice.paid / invoice.payment_failed don't reliably carry the same
// metadata.coachId as the subscription itself, so these resolve coachId
// by looking up the existing row via stripeSubscriptionId instead — the
// row must already exist from a prior subscription.created event.
async function handleCoachInvoiceEvent(
  inv: Stripe.Invoice,
  eventId: string,
  outcome: "paid" | "payment_failed",
): Promise<void> {
  const subscriptionId = strOrNull(
    (inv as unknown as Record<string, unknown>)["subscription"],
  );
  if (!subscriptionId) return;

  const db = getDb();
  const [existing] = await db
    .select({
      coachId: coachSubscriptions.coachId,
      stripeCustomerId: coachSubscriptions.stripeCustomerId,
      stripePriceId: coachSubscriptions.stripePriceId,
    })
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!existing) {
    console.log(`[Stripe Webhook] Invoice event for unknown coach subscription ${subscriptionId} — skipping`);
    return;
  }

  await upsertCoachSubscriptionFromStripe({
    coachId: existing.coachId,
    stripeCustomerId: existing.stripeCustomerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: existing.stripePriceId,
    status: outcome === "paid" ? "active" : "past_due",
    eventId,
  });

  console.log(
    `[Stripe Webhook] Coach ${existing.coachId} invoice ${outcome} — status now ${outcome === "paid" ? "active" : "past_due"}`,
  );
}

// ─────────────────────────────────────────────────────────────
// GAS PERSISTENCE HELPER
// Posts the normalized event to the Stripe Events GAS script.
// Enforces a 3-second timeout so a slow/down GAS endpoint never
// delays the 200 response back to Stripe. All errors are logged
// and swallowed — Stripe must not retry because of GAS issues.
// ─────────────────────────────────────────────────────────────

async function persistToGas(gasUrl: string, payload: GasStripePayload): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(gasUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[Stripe Webhook] GAS write HTTP ${res.status} — event not persisted`);
      return;
    }

    const body = await res.json().catch(() => ({})) as {
      ok?: boolean;
      duplicate?: boolean;
      error?: string;
      eventId?: string;
    };

    if (body.duplicate) {
      console.log(`[Stripe Webhook] Duplicate event ignored by GAS: ${payload.rawEventId}`);
    } else if (body.ok) {
      console.log(`[Stripe Webhook] GAS persisted event: ${payload.rawEventId}`);
    } else {
      console.error("[Stripe Webhook] GAS write returned ok:false —", body.error);
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Stripe Webhook] GAS write timed out after 3s — skipping persistence");
    } else {
      console.error(
        "[Stripe Webhook] GAS write threw:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EMAIL HELPERS — Sprint 3B.1
//
// Both helpers are non-fatal: they log errors and return without
// throwing. The Stripe webhook ack (200) is never blocked by email.
//
// TODO (idempotency): A persistent store (Upstash KV, Supabase, or the
// GAS "Stripe Events" sheet duplicate check) should gate email sends on
// whether this eventId has already been processed. Until that is in place,
// Stripe's own deduplication (it rarely re-delivers verified events) is
// the primary safeguard. Each email send is also wrapped individually so
// one failure does not prevent the other.
// ─────────────────────────────────────────────────────────────

// Catalyst Coaching Elite domain — this webhook only ever builds links
// to Catalyst pages (/onboarding, /executive-onboarding), never
// Kynovant SaaS pages. See docs/domain-architecture.md.
const SITE_ORIGIN = process.env.NEXT_PUBLIC_CATALYST_URL ?? "https://www.catalystcoachingelite.com";

/** Returns the correct onboarding URL for a given package name. */
function onboardingUrlForPackage(packageName: string): string {
  if (packageName === "Executive Performance") {
    return `${SITE_ORIGIN}/executive-onboarding`;
  }
  // Standard, Legacy, Founding Member, and unknown all route to /onboarding
  return `${SITE_ORIGIN}/onboarding`;
}

/**
 * Sends the branded welcome email to the new client. Catalyst-only —
 * only ever called from handleNewEnrollment(), which is only ever
 * called from handleCatalystWebhook(). Always goes through
 * getCatalystResendConfig(), never Kynovant's. See
 * lib/email/resend-brand-config.ts.
 */
async function sendClientWelcomeEmail(
  clientName: string,
  clientEmail: string,
  packageName: string,
): Promise<void> {
  const config = getCatalystResendConfig();

  if (!config) {
    console.warn("[Stripe Webhook] RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping welcome email");
    return;
  }
  const { apiKey, fromEmail } = config;

  const firstName    = clientName.split(" ")[0] || clientName;
  const onboardingUrl = onboardingUrlForPackage(packageName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Catalyst Coaching Elite</title>
</head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Gold top rule -->
          <tr>
            <td style="height:2px;background:#C9A24D;"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:#0d0e0f;padding:36px 40px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.45em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Catalyst Coaching Elite</p>
              <h1 style="margin:0;font-size:32px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;text-transform:uppercase;line-height:1.1;">Welcome.</h1>
            </td>
          </tr>

          <!-- Thin gold rule under header -->
          <tr>
            <td style="background:#0d0e0f;padding:0 40px;">
              <div style="height:1px;background:rgba(201,162,77,0.20);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0d0e0f;padding:28px 40px 36px;">
              <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
                Welcome to Catalyst Coaching Elite — your membership is active.
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#d1d5db;line-height:1.75;">
                Your next step is completing your onboarding questionnaire so I can build your training and nutrition plan around your goals, schedule, preferences, and limitations.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 36px;">
                <tr>
                  <td style="background:#C9A24D;">
                    <a href="${onboardingUrl}"
                       style="display:inline-block;padding:14px 36px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#000000;text-decoration:none;">
                      Complete Onboarding
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:28px;"></div>

              <!-- Signoff -->
              <p style="margin:0 0 3px;font-size:14px;color:#ffffff;font-weight:600;">Jermaine Jones</p>
              <p style="margin:0 0 3px;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#C9A24D;">Founder &amp; Head Coach</p>
              <p style="margin:0;font-size:11px;color:#6b7280;">Catalyst Coaching Elite</p>
            </td>
          </tr>

          <!-- Bottom rule -->
          <tr>
            <td style="height:1px;background:rgba(201,162,77,0.20);"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#080909;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">Catalyst Coaching Elite</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from:    `Catalyst Coaching Elite <${fromEmail}>`,
    to:      clientEmail,
    subject: "Welcome to Catalyst Coaching Elite",
    html,
  });

  if (error) {
    console.error("[Stripe Webhook] Resend error sending welcome email:", error.message ?? error);
  } else {
    console.log("[Stripe Webhook] Welcome email sent to:", clientEmail);
  }
}

/**
 * Sends an admin notification email with enrollment details.
 * Catalyst-only — see sendClientWelcomeEmail's header comment for why.
 * Always goes through getCatalystResendConfig(), never Kynovant's.
 */
async function sendAdminNotificationEmail(
  clientName: string,
  clientEmail: string,
  packageName: string,
  amountCents: number | null,
  currency: string | null,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<void> {
  const config = getCatalystResendConfig();

  if (!config) {
    console.warn("[Stripe Webhook] RESEND_API_KEY, RESEND_FROM_EMAIL, or RESEND_ADMIN_EMAIL not configured — skipping admin notification");
    return;
  }
  const { apiKey, fromEmail, adminEmail } = config;

  const amountStr = amountCents !== null
    ? `$${(amountCents / 100).toFixed(2)} ${(currency ?? "usd").toUpperCase()}`
    : "Unknown";

  const packageDisplay = packageName || "Unknown — populate PRICE_ID_TO_PACKAGE in lib/stripe.ts";

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:11px 16px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap;width:38%;vertical-align:top;">${label}</td>
      <td style="padding:11px 16px;font-size:13px;color:#e5e7eb;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-all;">${value}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Client Payment — Catalyst Coaching Elite</title>
</head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:40px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Gold top rule -->
          <tr>
            <td style="height:2px;background:#C9A24D;"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:#0d0e0f;padding:28px 32px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Admin Notification</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:-0.01em;line-height:1.1;">New Client Payment Received</h1>
            </td>
          </tr>

          <!-- Thin rule -->
          <tr>
            <td style="background:#0d0e0f;padding:0 32px;">
              <div style="height:1px;background:rgba(201,162,77,0.18);"></div>
            </td>
          </tr>

          <!-- Detail table -->
          <tr>
            <td style="background:#0d0e0f;padding:24px 32px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.06);">
                ${row("Client Name",          clientName)}
                ${row("Client Email",         clientEmail)}
                ${row("Package",              packageDisplay)}
                ${row("Amount Paid",          amountStr)}
                ${row("Stripe Customer ID",   customerId   ?? "—")}
                ${row("Stripe Subscription",  subscriptionId ?? "—")}
              </table>
            </td>
          </tr>

          <!-- Next action callout -->
          <tr>
            <td style="background:#0d0e0f;padding:16px 32px 32px;">
              <div style="border-left:2px solid #C9A24D;padding:12px 18px;background:rgba(201,162,77,0.04);">
                <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Next Action</p>
                <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.6;">Confirm onboarding completion and build client workspace.</p>
              </div>
            </td>
          </tr>

          <!-- Bottom rule -->
          <tr>
            <td style="height:1px;background:rgba(201,162,77,0.18);"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#080909;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">Catalyst Coaching Elite — Admin Notification</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from:    `Catalyst Coaching Elite <${fromEmail}>`,
    to:      adminEmail,
    subject: "New Catalyst Coaching Elite Client Payment Received",
    html,
  });

  if (error) {
    console.error("[Stripe Webhook] Resend error sending admin notification:", error.message ?? error);
  } else {
    console.log("[Stripe Webhook] Admin notification sent for client:", clientEmail);
  }
}

// ─────────────────────────────────────────────────────────────
// DRIVE WORKSPACE HELPER — Sprint 3B.2
//
// Calls the GAS Drive workspace script (drive-workspace-backend.gs)
// to find or create a structured Google Drive folder for the client.
// Enforces a 10-second timeout — GAS folder creation is typically
// 1–3 seconds but may be slower on cold starts.
// Non-fatal: errors are logged and never block the webhook ack.
// ─────────────────────────────────────────────────────────────

async function createClientWorkspace(
  clientName: string,
  clientEmail: string,
  packageType: string,
): Promise<void> {
  const gasUrl = process.env.SHEETS_DRIVE_GAS_URL;

  if (!gasUrl) {
    console.warn("[Stripe Webhook] SHEETS_DRIVE_GAS_URL not configured — skipping Drive workspace creation");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(gasUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ clientName, clientEmail, packageType }),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[Stripe Webhook] Drive GAS HTTP ${res.status} — workspace not created`);
      return;
    }

    const body = await res.json().catch(() => ({})) as {
      ok?:             boolean;
      folderId?:       string;
      folderUrl?:      string;
      createdOrReused?: string;
      error?:          string;
    };

    if (body.ok) {
      console.log(
        "[Drive Workspace]" +
        `\n  Client:         ${clientName}` +
        `\n  Email:          ${clientEmail}` +
        `\n  Package:        ${packageType || "Unknown"}` +
        `\n  Created/Reused: ${body.createdOrReused ?? "N/A"}` +
        `\n  Folder ID:      ${body.folderId  ?? "N/A"}` +
        `\n  Folder URL:     ${body.folderUrl ?? "N/A"}`,
      );
    } else {
      console.error("[Stripe Webhook] Drive GAS returned ok:false —", body.error);
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Stripe Webhook] Drive GAS timed out after 10s — skipping workspace creation");
    } else {
      console.error(
        "[Stripe Webhook] Drive GAS threw:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/** Called once on checkout.session.completed. Fires welcome + admin emails + Drive workspace. */
async function handleNewEnrollment(normalized: NormalizedStripeEvent): Promise<void> {
  const { customerEmail, customerName, priceId, amountCents, currency, customerId, subscriptionId } = normalized;

  if (!customerEmail) {
    console.warn("[Stripe Webhook] checkout.session.completed has no customerEmail — skipping enrollment actions");
    return;
  }

  // priceId is null for checkout.session.completed unless line_items are
  // expanded via a separate Stripe API call. Populate PRICE_ID_TO_PACKAGE in
  // lib/stripe.ts to enable package-aware onboarding URL routing.
  const packageName = packageFromPriceId(priceId);
  const displayName = customerName ?? customerEmail;

  try {
    await sendClientWelcomeEmail(displayName, customerEmail, packageName);
  } catch (err) {
    console.error("[Stripe Webhook] sendClientWelcomeEmail threw:", err instanceof Error ? err.message : err);
  }

  try {
    await sendAdminNotificationEmail(
      displayName,
      customerEmail,
      packageName,
      amountCents,
      currency,
      customerId,
      subscriptionId,
    );
  } catch (err) {
    console.error("[Stripe Webhook] sendAdminNotificationEmail threw:", err instanceof Error ? err.message : err);
  }

  try {
    await createClientWorkspace(displayName, customerEmail, packageName);
  } catch (err) {
    console.error("[Stripe Webhook] createClientWorkspace threw:", err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────
// IDEMPOTENCY — shared table, checked before ANY side effect in either
// branch. Stripe redelivers on any non-2xx response or timeout as
// routine production behavior, not an edge case (see
// docs/catalyst-os-scale-readiness-audit.md finding #6, which flagged
// this exact gap). Stripe event IDs are globally unique (not merely
// per-account), so one shared table is safe to reuse across both
// Stripe accounts — this is purely a dedup ledger, not a place either
// business's data lives, so sharing it does not violate the "never
// activate/modify the other business's records" requirement.
// ─────────────────────────────────────────────────────────────

async function recordProcessedEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .insert(processedStripeEvents)
    .values({ stripeEventId: eventId, eventType })
    .onConflictDoNothing({ target: processedStripeEvents.stripeEventId })
    .returning({ stripeEventId: processedStripeEvents.stripeEventId });
  return result.length === 0; // true = already processed
}

// ─────────────────────────────────────────────────────────────
// BRAND RESOLUTION — see this file's header comment. Runs before any
// Stripe secret is read.
// ─────────────────────────────────────────────────────────────

function resolveWebhookBrand(req: NextRequest): Brand {
  const fromHost = hostBrand(req.nextUrl.hostname);
  if (fromHost) return fromHost;

  const hostHeader = req.headers.get("host");
  const fromHostHeader = hostHeader ? hostBrand(hostHeader) : null;
  if (fromHostHeader) return fromHostHeader;

  // No real DNS in local dev / preview deployments — mirrors proxy.ts's
  // own ?__brand= override for the identical problem on page routes.
  const override = req.nextUrl.searchParams.get("__brand");
  if (override === "kynovant" || override === "catalyst") return override;

  return null;
}

// ─────────────────────────────────────────────────────────────
// CATALYST HANDLER — client coaching-package payments. Uses only
// CATALYST_STRIPE_* env vars and catalystStripe(). Never reads a
// KYNOVANT_STRIPE_* var, never touches coach_subscriptions.
// ─────────────────────────────────────────────────────────────

async function handleCatalystWebhook(rawBody: string, sigHeader: string): Promise<NextResponse> {
  const webhookSecret = process.env.CATALYST_STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "[Stripe Webhook] CATALYST_STRIPE_WEBHOOK_SECRET not set — " +
      "add it to .env.local and see env.local.example.",
    );
    return NextResponse.json({ error: "Webhook not configured on server" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = catalystStripe().webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
  } catch (err) {
    console.error(
      "[Stripe Webhook] Catalyst signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

  if (await recordProcessedEvent(event.id, event.type)) {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id} (${event.type})`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const normalized = normalizeStripeEvent(event);
  console.log(
    `[Stripe Webhook] (Catalyst) ${event.type} — eventId: ${event.id}`,
    "\n  normalized:", JSON.stringify(normalized, null, 2),
  );

  switch (event.type as (typeof HANDLED_EVENTS)[number] | string) {
    case "checkout.session.completed":
      // Sprint 3B.1: Send welcome email to client + admin notification.
      // Both sends are non-fatal — the webhook ack is never blocked by email.
      //
      // TODO (Phase 3): Look up lead by customerEmail, advance pipeline
      // stage to "Paid", create a "Send Onboarding Link" task.
      await handleNewEnrollment(normalized);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      // TODO (Phase 3): Set Lead.stripeStatus = "active", set nextBilling
      // from current_period_end, set enrolledDate.
      console.log(`[Stripe Webhook] ${event.type} — TODO: sync client lead`);
      break;

    case "customer.subscription.deleted":
      // TODO (Phase 3): Set Lead.stripeStatus = "cancelled",
      // advance pipeline to "Cancelled", create a win-back task.
      console.log("[Stripe Webhook] subscription.deleted — TODO: mark client lead cancelled");
      break;

    case "invoice.paid":
      // TODO (Phase 3): Confirm MRR for this billing period.
      // Clear any "past_due" flag. Log payment timestamp.
      console.log("[Stripe Webhook] invoice.paid — TODO: confirm client MRR");
      break;

    case "invoice.payment_failed":
      // TODO (Phase 3): Set Lead.stripeStatus = "past_due".
      // Create an urgent "Payment Issue" task in the admin dashboard.
      // Consider: trigger retry-payment email via Stripe's Smart Retries.
      console.log("[Stripe Webhook] invoice.payment_failed — TODO: flag client lead past_due");
      break;

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type} — ignoring`);
      break;
  }

  // Persist to Google Sheets via GAS (non-blocking, non-fatal). Catalyst-
  // only — Kynovant has no equivalent Sheets integration.
  const gasUrl = process.env.STRIPE_EVENTS_GAS_URL;
  if (gasUrl) {
    await persistToGas(gasUrl, toGasPayload(normalized));
  } else {
    console.log(
      "[Stripe Webhook] STRIPE_EVENTS_GAS_URL not set — " +
      "event logged to console only. See env.local.example.",
    );
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────
// KYNOVANT HANDLER — coach-platform SaaS billing. Uses only
// KYNOVANT_STRIPE_* env vars and kynovantStripe(). Never reads a
// CATALYST_STRIPE_* var, never sends a client email, never posts to
// the Catalyst Sheets/Drive GAS integrations.
// ─────────────────────────────────────────────────────────────

async function handleKynovantWebhook(rawBody: string, sigHeader: string): Promise<NextResponse> {
  const webhookSecret = process.env.KYNOVANT_STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "[Stripe Webhook] KYNOVANT_STRIPE_WEBHOOK_SECRET not set — " +
      "add it to .env.local and see env.local.example.",
    );
    return NextResponse.json({ error: "Webhook not configured on server" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = kynovantStripe().webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
  } catch (err) {
    console.error(
      "[Stripe Webhook] Kynovant signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

  if (await recordProcessedEvent(event.id, event.type)) {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id} (${event.type})`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  console.log(`[Stripe Webhook] (Kynovant) ${event.type} — eventId: ${event.id}`);

  switch (event.type) {
    case "checkout.session.completed": {
      // Every Kynovant Checkout Session sets metadata.coachId
      // (lib/billing/checkout.ts) — account activation itself happens
      // via customer.subscription.created below (and the synchronous
      // fast path in app/account-status/page.tsx), so this event is
      // log-only.
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.coachId) {
        console.log(
          `[Stripe Webhook] Kynovant checkout.session.completed ${session.id} has no metadata.coachId — unexpected, skipping.`,
        );
        break;
      }
      console.log(`[Stripe Webhook] Kynovant checkout completed for coach ${session.metadata.coachId}`);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      if (!isCoachPlanPrice(priceId)) {
        console.log(`[Stripe Webhook] Kynovant ${event.type} on unrecognized price ${priceId ?? "(none)"} — skipping.`);
        break;
      }
      await handleCoachSubscriptionUpsert(sub, event.id);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      if (!isCoachPlanPrice(priceId)) {
        console.log(`[Stripe Webhook] Kynovant ${event.type} on unrecognized price ${priceId ?? "(none)"} — skipping.`);
        break;
      }
      await handleCoachSubscriptionUpsert(sub, event.id, "cancelled");
      break;
    }

    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const priceId = strOrNull(inv.lines?.data?.[0]?.pricing?.price_details?.price);
      if (!isCoachPlanPrice(priceId)) {
        console.log(`[Stripe Webhook] Kynovant invoice.paid on unrecognized price ${priceId ?? "(none)"} — skipping.`);
        break;
      }
      await handleCoachInvoiceEvent(inv, event.id, "paid");
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const priceId = strOrNull(inv.lines?.data?.[0]?.pricing?.price_details?.price);
      if (!isCoachPlanPrice(priceId)) {
        console.log(`[Stripe Webhook] Kynovant invoice.payment_failed on unrecognized price ${priceId ?? "(none)"} — skipping.`);
        break;
      }
      await handleCoachInvoiceEvent(inv, event.id, "payment_failed");
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled Kynovant event type: ${event.type} — ignoring`);
      break;
  }

  return NextResponse.json({ received: true });
}

// Never cache — every webhook POST must be processed fresh
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    console.warn("[Stripe Webhook] Request missing stripe-signature header");
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Brand resolution FIRST — before either business's Stripe secret is
  // read and before any business-specific logic runs. See this file's
  // header comment for the full rationale.
  const brand = resolveWebhookBrand(req);
  if (!brand) {
    console.error(
      `[Stripe Webhook] Could not classify host "${req.nextUrl.hostname}" as catalyst or kynovant, ` +
      "and no ?__brand override was supplied — refusing to process.",
    );
    return NextResponse.json({ error: "Unrecognized webhook host" }, { status: 400 });
  }

  if (brand === "catalyst") {
    return handleCatalystWebhook(rawBody, sigHeader);
  }
  return handleKynovantWebhook(rawBody, sigHeader);
}
