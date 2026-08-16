// ─────────────────────────────────────────────────────────────
// Kynovant Overwatch — Founder "Invite Coach"
//
// SERVER-ONLY. Founder/operator-only (requireOverwatchAdmin — the
// same "authenticated + status='active' + role='admin'" check
// Overwatch's own dashboard page enforces, never a hidden button,
// never a client-supplied role/inviter id).
//
// Reuses the EXISTING coach acquisition/signup pipeline end to end —
// this route does not create a second onboarding path:
//   - findExistingAccountByEmail / recordAcquisitionSignup /
//     markAcquisitionInviteStatus (lib/db/coach-signup-service.ts,
//     lib/db/coach-acquisition-service.ts) — the exact functions
//     app/api/coach-signup/route.ts already uses.
//   - provisionInvitedCoach (lib/db/coach-provisioning-service.ts) —
//     the single canonical place a public.users row is granted the
//     'coach' role, shared with both the self-service and the
//     existing app/api/admin/coaches/route.ts admin-invite paths.
//   - The invited user lands on the exact same /auth/callback →
//     /setup-password → /auth/role-redirect → /hq → /account-status →
//     "Start 14-Day Free Trial" path every other coach goes through.
//     No new Auth flow, no new provisioning logic, no new trial/
//     billing logic exists in this file.
//
// The ONE genuine difference from app/api/admin/coaches/route.ts (the
// existing plain admin-invite endpoint): this route sends its OWN
// Kynovant-branded email via Resend (lib/email/resend-brand-config.ts's
// getKynovantResendConfig() — the same isolated Kynovant account/
// domain app/api/applications/route.ts already uses) instead of
// Supabase Auth's own generic invite template, so the founder's
// invitation reads as a personal outreach ("Jermaine invited you...")
// rather than a generic system email. To do that without duplicating
// account creation, it uses admin.auth.admin.generateLink({ type:
// "invite" }) instead of inviteUserByEmail() — generateLink performs
// the IDENTICAL Auth-user-creation side effect but returns the action
// link instead of auto-sending Supabase's own template, which is
// exactly the same technique already used elsewhere in this project's
// own operational history for magic-link/recovery links (never sends
// an email itself). The returned link still resolves through
// /auth/callback exactly like every other invite in this codebase.
//
// A still-pending invite is safely resendable through the existing
// inviteUserByEmail path. This is the same behavior already used by
// app/api/coach-signup/route.ts for unconfirmed users. It intentionally
// uses Supabase's established invite email on retry rather than relying
// on unverified generateLink behavior for an existing Auth user.
// ─────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireOverwatchAdmin } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service";
import { findExistingAccountByEmail } from "@/lib/db/coach-signup-service";
import {
  markAcquisitionInviteStatus,
  recordAcquisitionSignup,
} from "@/lib/db/coach-acquisition-service";
import { getKynovantResendConfig } from "@/lib/email/resend-brand-config";
import { getOverwatchFounderProfile } from "@/lib/db/overwatch-service";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// VALIDATION — same shape as app/api/coach-signup/route.ts's `validate`.
// Only first name + email are collected: provisionInvitedCoach() takes
// a single displayName string, and the existing self-service flow
// never asks for a last name either — no new field is "genuinely
// required" by the existing signup architecture.
// ─────────────────────────────────────────────────────────────

interface InviteCoachPayload {
  firstName?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 200;

async function resendPendingInvite(email: string): Promise<{ ok: true; userId: string } | { ok: false }> {
  const admin = createAdminClient();
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteOrigin}/auth/callback`,
  });
  if (error || !data.user) return { ok: false };
  return { ok: true, userId: data.user.id };
}

function validate(body: InviteCoachPayload): string | null {
  if (!body.firstName?.trim()) return "First name is required.";
  if (body.firstName.trim().length > MAX_NAME_LENGTH) return "First name is too long.";
  if (!body.email?.trim() || !EMAIL_RE.test(body.email.trim())) {
    return "A valid email address is required.";
  }
  if (body.email.trim().length > MAX_EMAIL_LENGTH) return "Email is too long.";
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
// BRANDED INVITE EMAIL — non-fatal to the request if it fails; the
// Auth user + coach role are already provisioned by the time this
// runs, so a Resend outage never blocks account creation, only email
// delivery (see this file's header + Phase 6 handling below).
// Same visual language as app/api/applications/route.ts's admin-
// notification email (dark background, gold accent bar, gold CTA) —
// deliberately Kynovant-only, no Catalyst Coaching mention anywhere.
// ─────────────────────────────────────────────────────────────

async function sendFounderInviteEmail(input: {
  toEmail: string;
  firstName: string;
  founderFirstName: string | null;
  actionLink: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getKynovantResendConfig();
  if (!config) {
    return { ok: false, error: "Kynovant email is not configured (KYNOVANT_RESEND_* env vars missing)." };
  }
  const { apiKey, fromEmail } = config;

  const founderName = input.founderFirstName ?? "The Kynovant team";
  const safeFirstName = escapeHtml(input.firstName);
  const safeFounderName = escapeHtml(founderName);

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
              <p style="margin:0 0 4px;font-size:15px;color:#e5e7eb;">${safeFirstName},</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#d1d5db;">
                ${safeFounderName} invited you to join Kynovant — the coaching platform built for trainers and coaches who want a better way to manage clients, programming, communication, and growth.
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
      subject: `${founderName} invited you to Kynovant`,
      html,
    });
    if (error) {
      console.error("[InviteCoach] Resend error:", error.message ?? error);
      return { ok: false, error: error.message ?? "Email provider error" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[InviteCoach] sendFounderInviteEmail threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/internal/overwatch/invite-coach
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireOverwatchAdmin();
  if (!guard.ok) return guard.response;

  let body: InviteCoachPayload;
  try {
    body = (await req.json()) as InviteCoachPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const firstName = body.firstName!.trim();
  const email = body.email!.trim();
  const normalizedEmail = email.toLowerCase();

  // Durable acquisition-lead record FIRST — required for
  // markAcquisitionInviteStatus() below to have a row to update (it's
  // a plain UPDATE keyed by normalizedEmail; it silently no-ops
  // against a row that doesn't exist yet). source="founder_invite" is
  // coach_acquisition_leads.source's existing free-text column — no
  // schema change; this is the same mechanism app/api/coach-signup/
  // route.ts already uses with source="start_trial". A repeat
  // touch on an email that already has a lead (any source) overwrites
  // source the same way a repeat self-service attempt already does —
  // existing, not new, last-touch-wins attribution behavior.
  try {
    await recordAcquisitionSignup({
      normalizedEmail,
      submittedName: firstName,
      source: "founder_invite",
    });
  } catch (err) {
    console.error("[InviteCoach] recordAcquisitionSignup failed:", err instanceof Error ? err.message : err);
  }

  // Duplicate/collision pre-check — identical decision shape to
  // app/api/coach-signup/route.ts. Never used to change an existing
  // user's role.
  try {
    const existing = await findExistingAccountByEmail(normalizedEmail);
    if (existing) {
      if (existing.role === "client") {
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "client_conflict",
          accountUserId: existing.id,
        }).catch(() => {});
        return NextResponse.json(
          {
            ok: false,
            error: "This email is already registered as a client account and can't be invited as a coach.",
          },
          { status: 409 },
        );
      }
      if (existing.status === "invited") {
        // A prior Resend outage may have left the Auth user pending.
        // Reuse the existing, proven-safe resend behavior instead of
        // permanently treating that account as blocked.
        try {
          const resend = await resendPendingInvite(email);
          if (resend.ok) {
            await markAcquisitionInviteStatus({
              normalizedEmail,
              status: "sent",
              accountUserId: resend.userId,
              inviteSentAt: new Date(),
            }).catch(() => {});
            return NextResponse.json({ ok: true, status: "sent" });
          }
        } catch (err) {
          if (err instanceof AdminClientConfigError) {
            console.error("[InviteCoach] " + err.message);
            return NextResponse.json(
              { ok: false, error: "Invite service is temporarily unavailable. Please try again shortly." },
              { status: 503 },
            );
          }
          console.error("[InviteCoach] pending invite resend failed:", err instanceof Error ? err.message : err);
        }
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "failed",
          accountUserId: existing.id,
        }).catch(() => {});
        return NextResponse.json(
          { ok: false, status: "email_failed", error: "The pending invitation could not be resent. Please try again." },
          { status: 502 },
        );
      }
      // Existing coach/admin account already active/suspended/archived.
      await markAcquisitionInviteStatus({
        normalizedEmail,
        status: "already_active",
        accountUserId: existing.id,
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: "already_active" });
    }
  } catch (err) {
    console.error("[InviteCoach] findExistingAccountByEmail failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";

    // generateLink (not inviteUserByEmail) — creates the Supabase Auth
    // user identically, but returns the action link instead of
    // Supabase auto-sending its own generic template. Same redirectTo
    // as every other invite path in this codebase; Supabase itself
    // appends type=invite to the eventual /auth/callback redirect.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteOrigin}/auth/callback` },
    });

    if (error || !data.user || !data.properties?.action_link) {
      const message = error?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("registered")) {
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "already_invited",
          accountUserId: data?.user?.id ?? null,
        }).catch(() => {});
        return NextResponse.json({ ok: true, status: "already_invited" });
      }
      await markAcquisitionInviteStatus({ normalizedEmail, status: "failed" }).catch(() => {});
      console.error("[InviteCoach] generateLink failed:", error?.message);
      return NextResponse.json(
        { ok: false, error: "We couldn't create that invitation. Please try again shortly." },
        { status: 422 },
      );
    }

    const newUserId = data.user.id;
    const actionLink = data.properties.action_link;

    // Same canonical role-grant path as every other coach-creation
    // entry point — role is never taken from request input.
    await provisionInvitedCoach({ userId: newUserId, email, displayName: firstName });

    const founderProfile = await getOverwatchFounderProfile(guard.dbUser.id);
    const sendResult = await sendFounderInviteEmail({
      toEmail: email,
      firstName,
      founderFirstName: founderProfile.firstName,
      actionLink,
    });

    if (!sendResult.ok) {
      // The account already exists (status='invited') — retain it so
      // the founder can retry through the pending-invite resend path
      // above. Do not expose the raw action token in the response.
      await markAcquisitionInviteStatus({
        normalizedEmail,
        status: "failed",
        accountUserId: newUserId,
      }).catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          status: "email_failed",
          error: "The invitation was created, but the email couldn't be sent. Please retry the invitation.",
        },
        { status: 502 },
      );
    }

    // "Invite sent" is recorded ONLY after the email provider
    // confirmed delivery — not merely after the DB/Auth writes
    // succeeded — so Overwatch's acquisition funnel reflects a real,
    // persisted fact (Phase 7: "Invite sent → only after an
    // invitation was actually accepted by the email provider").
    await markAcquisitionInviteStatus({
      normalizedEmail,
      status: "sent",
      accountUserId: newUserId,
      inviteSentAt: new Date(),
    }).catch((err) => {
      console.error("[InviteCoach] mark sent invite failed:", err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ ok: true, status: "sent" }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[InviteCoach] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Invite service is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    console.error("[InviteCoach] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
