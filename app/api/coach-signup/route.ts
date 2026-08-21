// ─────────────────────────────────────────────────────────────
// Kynovant — Self-Service Coach Signup
//
// Public route — the visitor is not authenticated. This is the real
// entry point for "Start 14-Day Free Trial" (app/(kynovant)/start-trial/
// page.tsx): no application, no waiting on a founder, no demo call.
//
// Deliberately reuses the exact same Supabase Auth Admin invite flow
// as the founder-driven path (app/api/admin/coaches/route.ts) instead
// of accepting a password over this public endpoint:
//   1. admin.auth.admin.generateLink({ type: "invite" }) creates the
//      Supabase Auth user; this route emails its own Kynovant-branded
//      link (see buildAcceptLink/sendCoachSignupEmail below) rather
//      than letting Supabase auto-send its own template.
//   2. That link lands on this app's own /auth/accept page, whose
//      explicit "Accept Invitation" click redeems the token via
//      /api/auth/verify-invite, then redirects to /setup-password —
//      the coach proves control of the inbox AND sets their password
//      there, in one already-hardened flow.
//   3. From there: /auth/role-redirect → role=coach, entitlement=none
//      → /account-status → "Start 14-Day Free Trial" → Stripe
//      Checkout (lib/billing/actions.ts) → HQ.
// No password is ever handled by this route, and no Stripe Checkout
// Session or Customer is created here — Checkout only ever starts
// from an authenticated, verified coach explicitly clicking to start
// it (see the "IMPORTANT BILLING RULE" — a self-service form must
// never itself trigger a charge or a trial before the visitor is
// signed in and has read what starting a subscription means).
//
// P0 FIX (Coach Invitation Auto-Consume): this route used to call
// admin.auth.admin.inviteUserByEmail(), which lets Supabase send its
// own default "You have been invited" email embedding its own
// single-use action_link — a link that's CONSUMED by the first bare
// HTTP GET to it, including an automated email-security scanner's
// prefetch, not only the real visitor's own click. That's the exact
// root cause already proven and fixed for client invitations (see
// app/api/internal/clients/route.ts's buildAcceptLink header comment).
// This route now uses generateLink() + its own /auth/accept link
// instead, the same shared, role-agnostic activation layer.
//
// SECURITY — this is the one deliberate, reviewed exception to the
// "createAdminClient() call sites must sit behind requireAdmin/
// requireCoachOrAdmin" note in lib/supabase/admin.ts:
//   - role is ALWAYS the hardcoded literal "coach", set server-side by
//     provisionInvitedCoach() (lib/db/coach-provisioning-service.ts) —
//     never taken from the request body, a query param, or Supabase
//     user_metadata. A visitor cannot request "admin" or any other
//     role; the field doesn't exist in this route's input shape.
//   - Duplicate accounts: findExistingAccountByEmail() checks
//     public.users BEFORE calling Supabase. An email already
//     registered as coach/admin never gets a second invite (avoids
//     duplicate coach_profiles / duplicate Stripe customers down the
//     line — Stripe customer identity is separately deduplicated in
//     lib/billing/actions.ts's lookupStripeCustomerId). An email
//     already registered as a CLIENT is rejected outright — this
//     route never promotes an existing client account to coach; that
//     would be a privilege-escalation path disguised as a signup form.
//   - Replay/idempotency: inviteUserByEmail() itself errors for an
//     email Supabase already knows about, so a retried/duplicated
//     request can't mint a second Auth user for the same address —
//     the pre-check above just turns that into a friendly response
//     instead of a raw Supabase error.
//   - Abuse/rate limiting: DB-backed, by IP and by email independently
//     (lib/db/coach-signup-service.ts) — same "no new infrastructure"
//     approach already used by app/api/applications/route.ts, sized
//     for an endpoint that sends real email and creates real accounts
//     rather than just writing a row.
// ─────────────────────────────────────────────────────────────

import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service";
import { getKynovantResendConfig } from "@/lib/email/resend-brand-config";
import {
  findExistingAccountByEmail,
  recordSignupAttempt,
  countRecentAttemptsByIp,
  countRecentAttemptsByEmail,
} from "@/lib/db/coach-signup-service";
import {
  markAcquisitionInviteStatus,
  recordAcquisitionSignup,
} from "@/lib/db/coach-acquisition-service";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// RATE LIMIT — DB-backed, no new infrastructure required. See
// lib/db/schema-coach-signup.ts for why two independent limiters.
// ─────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_IP = 8;
const MAX_ATTEMPTS_PER_EMAIL = 3;

function getClientIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

interface SignupPayload {
  name?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 200;

function validate(body: SignupPayload): string | null {
  if (!body.name?.trim()) return "Your name is required.";
  if (body.name.trim().length > MAX_NAME_LENGTH) return "Name is too long.";
  if (!body.email?.trim() || !EMAIL_RE.test(body.email.trim())) {
    return "A valid email address is required.";
  }
  if (body.email.trim().length > MAX_EMAIL_LENGTH) return "Email is too long.";
  return null;
}

// ─────────────────────────────────────────────────────────────
// ACCEPT LINK + BRANDED EMAIL — own local copy, same shape as
// app/api/internal/clients/route.ts's / app/api/internal/overwatch/
// invite-coach/route.ts's buildAcceptLink, per this codebase's
// established per-domain-copy convention for these small,
// security-sensitive link builders.
// ─────────────────────────────────────────────────────────────

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
// role are already provisioned by the time this runs, so a Resend
// outage never blocks the account from existing, only this email's
// delivery (same posture as sendClientInviteEmail/
// sendFounderInviteEmail elsewhere in this codebase). Self-service
// copy — no "X invited you" personalization, since there's no
// inviter here.
async function sendCoachSignupEmail(input: {
  toEmail: string;
  firstName: string;
  actionLink: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getKynovantResendConfig();
  if (!config) {
    return { ok: false, error: "Kynovant email is not configured (KYNOVANT_RESEND_* env vars missing)." };
  }
  const { apiKey, fromEmail } = config;
  const safeFirstName = escapeHtml(input.firstName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirm your Kynovant account</title>
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
                Confirm your email to finish setting up your Kynovant coach account and start your 14-day free trial.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0e0f;padding:0 32px 32px;">
              <a href="${input.actionLink}"
                 style="display:inline-block;background:#C9A24D;color:#000000;padding:13px 28px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">
                Confirm &amp; Continue
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
      subject: "Confirm your Kynovant account",
      html,
    });
    if (error) {
      console.error("[CoachSignup] Resend error:", error.message ?? error);
      return { ok: false, error: error.message ?? "Email provider error" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[CoachSignup] sendCoachSignupEmail threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/coach-signup
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SignupPayload;
  try {
    body = (await req.json()) as SignupPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  const name = body.name!.trim();
  const email = body.email!.trim();
  const normalizedEmail = email.toLowerCase();
  const ip = getClientIp(req);

  // Rate limit check BEFORE recording this attempt (so the check
  // itself never counts against the limit it enforces).
  try {
    const [byIp, byEmail] = await Promise.all([
      countRecentAttemptsByIp(ip, RATE_LIMIT_WINDOW_MS),
      countRecentAttemptsByEmail(normalizedEmail, RATE_LIMIT_WINDOW_MS),
    ]);
    if (byIp >= MAX_ATTEMPTS_PER_IP || byEmail >= MAX_ATTEMPTS_PER_EMAIL) {
      await markAcquisitionInviteStatus({
        normalizedEmail,
        status: "rate_limited",
      }).catch((err) => {
        console.error("[CoachSignup] mark rate_limited failed:", err instanceof Error ? err.message : err);
      });
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
  } catch (err) {
    // Fail open on the rate-limit check itself — a DB hiccup here
    // should not block a legitimate signup.
    console.error("[CoachSignup] rate limit check failed:", err instanceof Error ? err.message : err);
  }

  try {
    await recordAcquisitionSignup({
      normalizedEmail,
      submittedName: name,
      source: "start_trial",
    });
  } catch (err) {
    console.error("[CoachSignup] recordAcquisitionSignup failed:", err instanceof Error ? err.message : err);
  }

  // Record the attempt regardless of outcome — bounds abuse even when
  // the rest of this handler fails or short-circuits below.
  try {
    await recordSignupAttempt(normalizedEmail, ip);
  } catch (err) {
    console.error("[CoachSignup] recordSignupAttempt failed:", err instanceof Error ? err.message : err);
  }

  // Duplicate-account pre-check. Never used to change an existing
  // user's role — see the header comment above.
  try {
    const existing = await findExistingAccountByEmail(normalizedEmail);
    if (existing) {
      if (existing.role === "client") {
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "client_conflict",
          accountUserId: existing.id,
        }).catch((err) => {
          console.error("[CoachSignup] mark client_conflict failed:", err instanceof Error ? err.message : err);
        });
        return NextResponse.json(
          {
            ok: false,
            error:
              "This email is already registered as a client account. Contact Kynovant to convert it to a coach account.",
          },
          { status: 409 },
        );
      }
      // Already a coach/admin who finished setup — no second invite,
      // nothing to resend. status === "invited" (never confirmed) is
      // handled below: it deliberately falls through to the same
      // inviteUserByEmail() call as a brand-new signup, which Supabase
      // treats as a safe resend for an unconfirmed user.
      if (existing.status !== "invited") {
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "already_active",
          accountUserId: existing.id,
        }).catch((err) => {
          console.error("[CoachSignup] mark already_active failed:", err instanceof Error ? err.message : err);
        });
        return NextResponse.json({ ok: true, status: "already_active" });
      }
    }
  } catch (err) {
    console.error("[CoachSignup] findExistingAccountByEmail failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";

    // generateLink (not inviteUserByEmail) — creates the Supabase Auth
    // user identically, but returns a raw token_hash instead of
    // Supabase auto-sending its own generic template embedding the
    // unsafe, auto-consuming action_link — see this file's header
    // comment. redirectTo matches every other invite path in this
    // codebase; it's functionally unused by the /auth/accept flow but
    // kept for consistency and as a required field.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteOrigin}/auth/callback` },
    });

    if (error || !data.user || !data.properties?.hashed_token) {
      // Supabase itself rejects an email it already knows about (e.g. a
      // race with another request that passed the pre-check first) —
      // treat that the same as the pre-check's "already exists" path
      // rather than surfacing a raw provider error to the visitor.
      const message = error?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("registered")) {
        await markAcquisitionInviteStatus({
          normalizedEmail,
          status: "already_invited",
          accountUserId: data?.user?.id ?? null,
        }).catch((err) => {
          console.error("[CoachSignup] mark already_invited failed:", err instanceof Error ? err.message : err);
        });
        return NextResponse.json({ ok: true, status: "already_invited" });
      }
      await markAcquisitionInviteStatus({
        normalizedEmail,
        status: "failed",
      }).catch((err) => {
        console.error("[CoachSignup] mark failed invite failed:", err instanceof Error ? err.message : err);
      });
      console.error("[CoachSignup] generateLink failed:", error?.message);
      return NextResponse.json(
        { ok: false, error: "We couldn't start your trial signup. Please try again shortly." },
        { status: 422 },
      );
    }

    const newUserId = data.user.id;
    const actionLink = buildAcceptLink(siteOrigin, data.properties.hashed_token);

    await provisionInvitedCoach({ userId: newUserId, email, displayName: name });

    const sendResult = await sendCoachSignupEmail({ toEmail: email, firstName: name.split(/\s+/)[0] || name, actionLink });
    if (!sendResult.ok) {
      // The account already exists (status stays whatever
      // provisionInvitedCoach left it as) — retain it so a retry lands
      // in the pending-invite ("status !== invited" pre-check above
      // falls through to this same generateLink call) resend path
      // instead of erroring on "already registered."
      await markAcquisitionInviteStatus({
        normalizedEmail,
        status: "failed",
        accountUserId: newUserId,
      }).catch((err) => {
        console.error("[CoachSignup] mark failed invite failed:", err instanceof Error ? err.message : err);
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Your account was created, but the confirmation email couldn't be sent. Please try again.",
        },
        { status: 502 },
      );
    }

    await markAcquisitionInviteStatus({
      normalizedEmail,
      status: "sent",
      accountUserId: newUserId,
      inviteSentAt: new Date(),
    }).catch((err) => {
      console.error("[CoachSignup] mark sent invite failed:", err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ ok: true, status: "invited" }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[CoachSignup] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Signup is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    console.error("[CoachSignup] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
