// ─────────────────────────────────────────────────────────────
// Stripe Webhook Handler — server-only
//
// Registered in Stripe Dashboard under:
//   Developers → Webhooks → Add endpoint
//   URL: https://www.kynovant.com/api/stripe/webhook
//   Events: checkout.session.completed, customer.subscription.*,
//           invoice.paid, invoice.payment_failed
//
// Local testing:
//   stripe listen --forward-to localhost:3000/api/stripe/webhook
//   (requires Stripe CLI — brew install stripe/stripe-cli/stripe)
//
// Persistence (Phase 2B — active):
//   After verifying the Stripe signature and normalizing the event,
//   the normalized payload is POSTed to the Stripe Events GAS script
//   (STRIPE_EVENTS_GAS_URL). The GAS script writes the event to the
//   "Stripe Events" sheet tab. Missing or unavailable GAS URL is
//   non-fatal — the webhook always returns 200 to Stripe.
//
// Sprint 3B.1 — Welcome Email + Admin Notification (active):
//   checkout.session.completed → sendClientWelcomeEmail + sendAdminNotificationEmail
//   Both emails are non-fatal: failures are logged but never block the 200 ack.
//
// Sprint 3B.2 — Google Drive Client Workspace (active):
//   checkout.session.completed → createClientWorkspace via GAS (drive-workspace-backend.gs)
//   Non-fatal: failures are logged but never block the 200 ack.
//
// TODO (Phase 3 — Pipeline automation):
//   Map NormalizedStripeEvent fields to Lead pipeline updates in
//   app/admin/page.tsx after persistence is confirmed working:
//     checkout.session.completed  → advance Lead to "Paid" stage
//     subscription.created        → set Lead.stripeStatus = "active"
//     subscription.deleted        → set Lead.stripeStatus = "cancelled"
//     invoice.payment_failed      → set Lead.stripeStatus = "past_due"
// ─────────────────────────────────────────────────────────────

import { Resend } from "resend";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  stripe,
  normalizeStripeEvent,
  toGasPayload,
  packageFromPriceId,
  HANDLED_EVENTS,
} from "@/lib/stripe";
import type { GasStripePayload, NormalizedStripeEvent } from "@/lib/stripe";

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

const SITE_ORIGIN = "https://www.kynovant.com";

/** Returns the correct onboarding URL for a given package name. */
function onboardingUrlForPackage(packageName: string): string {
  if (packageName === "Executive Performance") {
    return `${SITE_ORIGIN}/executive-onboarding`;
  }
  // Standard, Legacy, Founding Member, and unknown all route to /onboarding
  return `${SITE_ORIGIN}/onboarding`;
}

/** Sends the branded welcome email to the new client. */
async function sendClientWelcomeEmail(
  clientName: string,
  clientEmail: string,
  packageName: string,
): Promise<void> {
  const apiKey    = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn("[Stripe Webhook] RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping welcome email");
    return;
  }

  const firstName    = clientName.split(" ")[0] || clientName;
  const onboardingUrl = onboardingUrlForPackage(packageName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Kynovant</title>
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
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.45em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Kynovant</p>
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
                Welcome to Kynovant — your membership is active.
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
              <p style="margin:0;font-size:11px;color:#6b7280;">Kynovant</p>
            </td>
          </tr>

          <!-- Bottom rule -->
          <tr>
            <td style="height:1px;background:rgba(201,162,77,0.20);"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#080909;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">Kynovant Elite</p>
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
    from:    `Kynovant <${fromEmail}>`,
    to:      clientEmail,
    subject: "Welcome to Kynovant",
    html,
  });

  if (error) {
    console.error("[Stripe Webhook] Resend error sending welcome email:", error.message ?? error);
  } else {
    console.log("[Stripe Webhook] Welcome email sent to:", clientEmail);
  }
}

/** Sends an admin notification email to RESEND_ADMIN_EMAIL with enrollment details. */
async function sendAdminNotificationEmail(
  clientName: string,
  clientEmail: string,
  packageName: string,
  amountCents: number | null,
  currency: string | null,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<void> {
  const apiKey      = process.env.RESEND_API_KEY;
  const fromEmail   = process.env.RESEND_FROM_EMAIL;
  const adminEmail  = process.env.RESEND_ADMIN_EMAIL;

  if (!apiKey || !fromEmail || !adminEmail) {
    console.warn("[Stripe Webhook] RESEND_API_KEY, RESEND_FROM_EMAIL, or RESEND_ADMIN_EMAIL not configured — skipping admin notification");
    return;
  }

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
  <title>New Client Payment — Kynovant</title>
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
              <p style="margin:0;font-size:11px;color:#374151;">Kynovant — Admin Notification</p>
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
    from:    `Kynovant <${fromEmail}>`,
    to:      adminEmail,
    subject: "New Kynovant Client Payment Received",
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

// Never cache — every webhook POST must be processed fresh
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Read raw body — must be the unmodified bytes Stripe signed
  const rawBody = await req.text();

  // 2. Validate signature header
  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    console.warn("[Stripe Webhook] Request missing stripe-signature header");
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  // 3. Validate env config
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — " +
      "add it to .env.local and see env.local.example.",
    );
    return NextResponse.json(
      { error: "Webhook not configured on server" },
      { status: 503 },
    );
  }

  // 4. Verify Stripe signature (prevents spoofed events)
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
  } catch (err) {
    console.error(
      "[Stripe Webhook] Signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Webhook signature invalid" },
      { status: 400 },
    );
  }

  // 5. Normalize and log
  const normalized = normalizeStripeEvent(event);
  console.log(
    `[Stripe Webhook] ${event.type} — eventId: ${event.id}`,
    "\n  normalized:", JSON.stringify(normalized, null, 2),
  );

  // 6. Handle each event type
  switch (event.type as (typeof HANDLED_EVENTS)[number] | string) {

    case "checkout.session.completed":
      // Sprint 3B.1: Send welcome email to client + admin notification.
      // Both sends are non-fatal — the webhook ack is never blocked by email.
      //
      // TODO (idempotency): Gate on GAS duplicate check (body.duplicate from
      // persistToGas) or a persistent eventId store before re-queuing emails.
      // For now, Stripe's own retry deduplication is the primary safeguard.
      //
      // TODO (Phase 3): Look up lead by customerEmail, advance pipeline
      // stage to "Paid", create a "Send Onboarding Link" task.
      await handleNewEnrollment(normalized);
      break;

    case "customer.subscription.created":
      // TODO (Phase 3): Set Lead.stripeStatus = "active", set nextBilling
      // from current_period_end, set enrolledDate.
      console.log("[Stripe Webhook] subscription.created — TODO: activate lead");
      break;

    case "customer.subscription.updated":
      // TODO (Phase 3): Sync status, plan, and billing date changes.
      // Handle cancellation_at_period_end → warn but don't cancel yet.
      console.log("[Stripe Webhook] subscription.updated — TODO: sync changes");
      break;

    case "customer.subscription.deleted":
      // TODO (Phase 3): Set Lead.stripeStatus = "cancelled",
      // advance pipeline to "Cancelled", create a win-back task.
      console.log("[Stripe Webhook] subscription.deleted — TODO: mark cancelled");
      break;

    case "invoice.paid":
      // TODO (Phase 3): Confirm MRR for this billing period.
      // Clear any "past_due" flag. Log payment timestamp.
      console.log("[Stripe Webhook] invoice.paid — TODO: confirm MRR");
      break;

    case "invoice.payment_failed":
      // TODO (Phase 3): Set Lead.stripeStatus = "past_due".
      // Create an urgent "Payment Issue" task in the admin dashboard.
      // Consider: trigger retry-payment email via Stripe's Smart Retries.
      console.log("[Stripe Webhook] invoice.payment_failed — TODO: flag past_due");
      break;

    default:
      // Log non-handled events without error — Stripe sends many event types
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type} — ignoring`);
      break;
  }

  // 7. Persist to Google Sheets via GAS (non-blocking, non-fatal)
  const gasUrl = process.env.STRIPE_EVENTS_GAS_URL;
  if (gasUrl) {
    await persistToGas(gasUrl, toGasPayload(normalized));
  } else {
    console.log(
      "[Stripe Webhook] STRIPE_EVENTS_GAS_URL not set — " +
      "event logged to console only. See env.local.example.",
    );
  }

  // Always return 200 so Stripe doesn't retry
  return NextResponse.json({ received: true });
}
