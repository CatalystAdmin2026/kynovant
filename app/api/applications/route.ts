// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Application Intake
//
// Public route — applicants are not authenticated. Called by
// "Apply as a Coach" (app/(site)/coach-apply/page.tsx). This is
// Kynovant's own SaaS prospect funnel — NOT Jermaine's personal
// coaching-client application (app/(site)/apply/page.tsx), which
// submits directly to its own, unrelated Google Apps Script and
// never touches this route or the applications table.
//
// Pipeline on submit:
//   1. Validate required fields server-side (presence, email format,
//      length caps to bound storage/abuse).
//   2. DB-backed rate limit: reject (429) if this IP has already
//      submitted MAX_SUBMISSIONS_PER_IP applications within
//      RATE_LIMIT_WINDOW_MS. Uses the applications table itself —
//      no new infrastructure. Known gap: does not stop a distributed
//      or IP-rotating abuser; see the pipeline doc for what a
//      production-grade version would add (WAF/CAPTCHA/Upstash).
//   3. submitApplication() — Supabase is the source of truth and the
//      only step that can fail the request back to the applicant.
//      Duplicate-submission policy lives in lib/db/application-service.ts.
//   4. Non-fatal: mirror the same fields to the Coach Applications
//      Google Sheet (COACH_APPLICATIONS_GAS_URL) — optional; skipped
//      silently if unset, per env.local.example.
//   5. Non-fatal: email the Kynovant admin inbox so an admin knows a
//      new coach application arrived, instead of relying on someone
//      checking /admin/growth/applications or the sheet manually.
//      Sent via Kynovant's own Resend account/domain — see
//      lib/email/resend-brand-config.ts's getKynovantResendConfig().
//      Never Catalyst's.
//
// Steps 4 and 5 never block or fail the response — the applicant
// only needs step 3 to succeed. Failures are logged, not thrown.
// Secrets (COACH_APPLICATIONS_GAS_URL, KYNOVANT_RESEND_*) are read from
// process.env only, inside this server-only route file, and never
// echoed back in a response body — only server-side console logs
// reference them on failure.
//
// This is the ONLY public POST endpoint for Kynovant coach
// applications. app/api/coach-applications/route.ts (the earlier,
// non-persisting version) has been retired — see its removal in the
// same change that added this comment.
// ─────────────────────────────────────────────────────────────

import { Resend } from "resend";
import { type NextRequest, NextResponse } from "next/server";
import {
  submitApplication,
  markApplicationSheetSynced,
  countRecentApplicationsByIp,
  type NewApplicationInput,
} from "@/lib/db/application-service";
import { getKynovantResendConfig } from "@/lib/email/resend-brand-config";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// RATE LIMIT — DB-backed, no new infrastructure required.
// ─────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS_PER_IP = 5;

function getClientIp(req: NextRequest): string | null {
  // Vercel/most proxies set x-forwarded-for as "client, proxy1, proxy2".
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
//
// Field names match app/(site)/coach-apply/page.tsx's <input>/
// <select> `name` attributes exactly.
// ─────────────────────────────────────────────────────────────

interface ApplicationPayload {
  name?: string;
  email?: string;
  phone?: string;
  business_stage?: string;
  client_count?: string;
  context?: string;
  referral_source?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generous but bounded — prevents a single field from being used to
// stuff megabytes into one row (storage abuse / crude DoS), without
// constraining any legitimate applicant's answer.
const MAX_LENGTHS: Record<string, number> = {
  name: 200,
  email: 200,
  phone: 40,
  business_stage: 200,
  client_count: 200,
  context: 4000,
  referral_source: 200,
};

function validate(body: ApplicationPayload): string | null {
  if (!body.name?.trim()) return "Full name is required.";
  if (!body.email?.trim() || !EMAIL_RE.test(body.email.trim())) {
    return "A valid email address is required.";
  }
  if (!body.referral_source?.trim()) return "Referral source is required.";

  for (const [key, max] of Object.entries(MAX_LENGTHS)) {
    const value = body[key as keyof ApplicationPayload];
    if (typeof value === "string" && value.length > max) {
      return `${key.replace(/_/g, " ")} is too long.`;
    }
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────
// GOOGLE SHEETS MIRROR — non-fatal, matches the persistToGas
// pattern already used in app/api/stripe/webhook/route.ts.
// Posts JSON, matching the convention already established for
// COACH_APPLICATIONS_GAS_URL by the now-retired
// app/api/coach-applications/route.ts.
// ─────────────────────────────────────────────────────────────

async function mirrorToSheet(
  applicationId: string,
  body: ApplicationPayload,
): Promise<void> {
  const gasUrl = process.env.COACH_APPLICATIONS_GAS_URL;
  if (!gasUrl) {
    console.log("[Applications] COACH_APPLICATIONS_GAS_URL not configured — skipping Sheets mirror");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const payload = {
      name: body.name ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      business_stage: body.business_stage ?? "",
      client_count: body.client_count ?? "",
      context: body.context ?? "",
      referral_source: body.referral_source ?? "",
    };

    const res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[Applications] Sheets mirror returned HTTP ${res.status}`);
      return;
    }

    await markApplicationSheetSynced(applicationId);
    console.log("[Applications] Sheets mirror synced for", applicationId);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Applications] Sheets mirror timed out after 5s");
    } else {
      console.error("[Applications] Sheets mirror threw:", err instanceof Error ? err.message : err);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN NOTIFICATION EMAIL — non-fatal. This is a Kynovant-only send
// (Kynovant's own coach-application intake) — always goes through
// getKynovantResendConfig(), never the generic/Catalyst RESEND_* vars
// the Stripe webhook and DocuSign webhook use for Catalyst's own
// sends. See lib/email/resend-brand-config.ts.
// ─────────────────────────────────────────────────────────────

async function notifyAdmin(applicationId: string, body: ApplicationPayload): Promise<void> {
  const config = getKynovantResendConfig();

  if (!config) {
    console.warn("[Applications] KYNOVANT_RESEND_API_KEY, KYNOVANT_RESEND_FROM_EMAIL, or KYNOVANT_RESEND_ADMIN_EMAIL not configured — skipping admin notification");
    return;
  }
  const { apiKey, fromEmail, adminEmail } = config;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:11px 16px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#e5e7eb;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-word;">${escapeHtml(value || "—")}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Coach Application — Kynovant</title>
</head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:40px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr><td style="height:2px;background:#C9A24D;"></td></tr>
          <tr>
            <td style="background:#0d0e0f;padding:28px 32px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Admin Notification</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:-0.01em;line-height:1.1;">New Kynovant Coach Application</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0e0f;padding:8px 24px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${row("Name", body.name ?? "")}
                ${row("Email", body.email ?? "")}
                ${row("Phone", body.phone ?? "")}
                ${row("Business Stage", body.business_stage ?? "")}
                ${row("Client Count", body.client_count ?? "")}
                ${row("Referral Source", body.referral_source ?? "")}
                ${row("Context", body.context ?? "")}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0e0f;padding:0 32px 28px;">
              <a href="https://www.kynovant.com/admin/growth/applications/${applicationId}"
                 style="display:inline-block;background:#C9A24D;color:#000000;padding:12px 24px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">
                Review in Admin
              </a>
            </td>
          </tr>
          <tr><td style="height:1px;background:rgba(201,162,77,0.20);"></td></tr>
          <tr>
            <td style="background:#080909;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">Kynovant — Growth</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `Kynovant <${fromEmail}>`,
      to: adminEmail,
      subject: `New Kynovant Coach Application — ${body.name ?? "Unknown"}`,
      html,
    });

    if (error) {
      console.error("[Applications] Resend error sending admin notification:", error.message ?? error);
    } else {
      console.log("[Applications] Admin notification sent for", applicationId);
    }
  } catch (err) {
    console.error("[Applications] notifyAdmin threw:", err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/applications
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: ApplicationPayload;
  try {
    body = (await req.json()) as ApplicationPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const submitterIp = getClientIp(req);

  try {
    const recentCount = await countRecentApplicationsByIp(submitterIp, RATE_LIMIT_WINDOW_MS);
    if (recentCount >= MAX_SUBMISSIONS_PER_IP) {
      return NextResponse.json(
        { ok: false, error: "Too many applications submitted recently. Please try again later." },
        { status: 429 },
      );
    }
  } catch (err) {
    // Fail open on the rate-limit check itself — a DB hiccup here
    // should not block a legitimate applicant from applying.
    console.error("[Applications] rate limit check failed:", err instanceof Error ? err.message : err);
  }

  const input: NewApplicationInput = {
    name: body.name!.trim(),
    email: body.email!.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    businessStage: body.business_stage?.trim() || "Unspecified",
    clientCount: body.client_count?.trim() || "Unspecified",
    context: body.context?.trim() || null,
    referralSource: body.referral_source!.trim(),
    submitterIp,
  };

  let application: { id: string; createdAt: Date; resubmitted: boolean };
  try {
    application = await submitApplication(input);
  } catch (err) {
    console.error("[Applications] submitApplication failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to save application. Please try again." },
      { status: 500 },
    );
  }

  // Non-fatal side effects — never block or fail the response the
  // applicant sees. Errors are logged inside each helper.
  await Promise.allSettled([
    mirrorToSheet(application.id, body),
    notifyAdmin(application.id, body),
  ]);

  return NextResponse.json(
    { ok: true, applicationId: application.id, resubmitted: application.resubmitted },
    { status: application.resubmitted ? 200 : 201 },
  );
}
