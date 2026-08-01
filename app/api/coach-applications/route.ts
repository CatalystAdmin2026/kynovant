// ─────────────────────────────────────────────────────────────
// Coach Application Intake — server-only
//
// Public, unauthenticated endpoint backing /coach-apply. Mirrors the
// existing client /apply → GAS pattern, but routes through a Next.js
// API route instead of posting straight to a Google Apps Script URL
// from the browser, so a missing/misconfigured GAS endpoint fails
// gracefully instead of surfacing a broken external fetch to the
// applicant.
//
// COACH_APPLICATIONS_GAS_URL is optional — if unset, the application
// is still recorded (server log) and the admin notification email
// still sends; only the Google Sheets copy is skipped. See
// env.local.example.
// ─────────────────────────────────────────────────────────────

import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function forwardToGas(payload: Record<string, string>): Promise<void> {
  const gasUrl = process.env.COACH_APPLICATIONS_GAS_URL;
  if (!gasUrl) {
    console.log("[Coach Application] COACH_APPLICATIONS_GAS_URL not set — skipping sheet sync");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[Coach Application] GAS forward failed:", err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
}

async function notifyAdmin(payload: Record<string, string>): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.RESEND_ADMIN_EMAIL;

  if (!apiKey || !fromEmail || !adminEmail) {
    console.warn("[Coach Application] Resend env vars not configured — skipping admin notification");
    return;
  }

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 16px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap;width:34%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 16px;font-size:13px;color:#e5e7eb;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-word;">${escapeHtml(value || "—")}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:40px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="height:2px;background:#C9A24D;"></td></tr>
        <tr><td style="background:#0d0e0f;padding:28px 32px 20px;">
          <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#C9A24D;font-weight:600;">New Founding Coach Application</p>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;text-transform:uppercase;">${escapeHtml(payload.name || "Unknown")}</h1>
        </td></tr>
        <tr><td style="background:#0d0e0f;padding:16px 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.06);">
            ${row("Name", payload.name)}
            ${row("Email", payload.email)}
            ${row("Phone", payload.phone)}
            ${row("Business Stage", payload.business_stage)}
            ${row("Client Count", payload.client_count)}
            ${row("Referral Source", payload.referral_source)}
            ${row("Context", payload.context)}
          </table>
        </td></tr>
        <tr><td style="height:1px;background:rgba(201,162,77,0.18);"></td></tr>
        <tr><td style="background:#080909;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#374151;">Kynovant — Founding Coach Intake</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `Kynovant <${fromEmail}>`,
    to: adminEmail,
    subject: `New Founding Coach Application — ${payload.name || "Unknown"}`,
    html,
  });

  if (error) {
    console.error("[Coach Application] Resend error:", error.message ?? error);
  }
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form submission" }, { status: 400 });
  }

  const payload = {
    name: field(form, "name"),
    email: field(form, "email"),
    phone: field(form, "phone"),
    business_stage: field(form, "business_stage"),
    client_count: field(form, "client_count"),
    context: field(form, "context"),
    referral_source: field(form, "referral_source"),
  };

  if (!payload.name || !payload.email) {
    return NextResponse.json(
      { ok: false, error: "Name and email are required" },
      { status: 400 },
    );
  }

  console.log("[Coach Application] Received:", { name: payload.name, email: payload.email });

  // Both are best-effort — a slow/misconfigured GAS endpoint or Resend
  // outage should never block the applicant from seeing a success state.
  await Promise.allSettled([forwardToGas(payload), notifyAdmin(payload)]);

  return NextResponse.json({ ok: true });
}
