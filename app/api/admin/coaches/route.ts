// ─────────────────────────────────────────────────────────────
// Admin — Coach Invitations
//
// SERVER-ONLY. Admin-only (requireAdmin, not requireCoachOrAdmin) —
// this mints new paying-tier coach seats, so it must not be reachable
// by a plain coach account.
//
// POST invites a new coach via Supabase Auth Admin, then grants the
// 'coach' role and creates their coach_profiles row via
// provisionInvitedCoach() (lib/db/coach-provisioning-service.ts) — the
// role is never taken from request input or Supabase user_metadata,
// consistent with the invariant documented in lib/auth/guards.ts.
//
// provisionInvitedCoach() is shared with the self-service signup path
// (app/api/coach-signup/route.ts) — same idempotent upsert logic,
// same hardcoded role, different (admin-guarded vs. public/rate-
// limited) entry point.
//
// P0 FIX (Coach Invitation Auto-Consume): this route used to call
// admin.auth.admin.inviteUserByEmail(), which lets Supabase send its
// own default invite email embedding its own single-use action_link —
// consumed by the first bare HTTP GET to it, including an automated
// email-security scanner's prefetch, not only the real coach's own
// click. Same root cause already proven and fixed for client
// invitations (see app/api/internal/clients/route.ts's
// buildAcceptLink header comment). Now uses generateLink() + this
// app's own /auth/accept link + a Kynovant-branded email instead, the
// same shared, role-agnostic activation layer every other invite path
// in this codebase uses.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { eq, inArray, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db/client";
import { users, coachProfiles } from "@/lib/db/schema";
import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service";
import { getKynovantResendConfig } from "@/lib/email/resend-brand-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        displayName: coachProfiles.displayName,
      })
      .from(users)
      .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
      .where(inArray(users.role, ["coach", "admin"]))
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ ok: true, coaches: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

// Own local copy — same shape as every other invite route's
// buildAcceptLink, per this codebase's established per-domain-copy
// convention.
function buildAcceptLink(siteOrigin: string, hashedToken: string): string {
  const url = new URL("/auth/accept", siteOrigin);
  url.searchParams.set("type", "invite");
  url.searchParams.set("token_hash", hashedToken);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Non-fatal to account creation if it fails — the Auth user + coach
// role are already provisioned by the time this runs. Generic
// "you've been invited as a coach" copy — this route doesn't collect
// an inviter's own name the way the founder-invite path does.
async function sendAdminCoachInviteEmail(input: {
  toEmail: string;
  displayName: string;
  actionLink: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getKynovantResendConfig();
  if (!config) {
    return { ok: false, error: "Kynovant email is not configured (KYNOVANT_RESEND_* env vars missing)." };
  }
  const { apiKey, fromEmail } = config;
  const safeName = escapeHtml(input.displayName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to Kynovant</title>
</head>
<body style="margin:0;padding:0;background:#080909;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080909;padding:40px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr><td style="height:2px;background:#C9A24D;"></td></tr>
          <tr>
            <td style="background:#0d0e0f;padding:32px 32px 8px;">
              <p style="margin:0 0 18px;font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#C9A24D;font-weight:600;">Kynovant</p>
              <p style="margin:0 0 4px;font-size:15px;color:#e5e7eb;">${safeName},</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#d1d5db;">
                You've been invited to join Kynovant as a coach.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0e0f;padding:0 32px 32px;">
              <a href="${input.actionLink}"
                 style="display:inline-block;background:#C9A24D;color:#000000;padding:13px 28px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">
                Accept Invitation
              </a>
              <p style="margin:18px 0 0;font-size:11px;line-height:1.6;color:#4b5563;word-break:break-all;">
                Or paste this link into your browser: ${input.actionLink}
              </p>
            </td>
          </tr>
          <tr><td style="height:1px;background:rgba(201,162,77,0.20);"></td></tr>
          <tr>
            <td style="background:#080909;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">Kynovant</p>
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
      to: input.toEmail,
      subject: "You're invited to Kynovant",
      html,
    });
    if (error) {
      console.error("[admin/coaches] Resend error:", error.message ?? error);
      return { ok: false, error: error.message ?? "Email provider error" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[admin/coaches] sendAdminCoachInviteEmail threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { email?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();

  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "displayName is required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";

    // generateLink (not inviteUserByEmail) — creates the Supabase Auth
    // user identically, but returns a raw token_hash instead of
    // Supabase auto-sending its own generic template embedding the
    // unsafe, auto-consuming action_link — see this file's header
    // comment.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteOrigin}/auth/callback` },
    });

    if (error || !data.user || !data.properties?.hashed_token) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Invite failed" },
        { status: 422 },
      );
    }

    const newUserId = data.user.id;
    const actionLink = buildAcceptLink(siteOrigin, data.properties.hashed_token);

    // The on_auth_user_created trigger already inserted a public.users row
    // with role='client' (the trigger's hardcoded default — see
    // drizzle/0001_catalyst_auth.sql). Promote it to 'coach' here, in the
    // same server-side path that already validated the requester is an
    // admin — never via user_metadata or client input.
    await provisionInvitedCoach({ userId: newUserId, email, displayName });

    const sendResult = await sendAdminCoachInviteEmail({ toEmail: email, displayName, actionLink });
    if (!sendResult.ok) {
      // The account (Auth user + coach role) is already durably
      // provisioned — surface the email failure honestly rather than
      // claiming success for an invite the coach will never receive.
      return NextResponse.json(
        { ok: false, error: "The coach account was created, but the invitation email couldn't be sent. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, coachId: newUserId }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[admin/coaches] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Invite service is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
