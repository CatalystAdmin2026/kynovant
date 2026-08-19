import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { listActiveClients } from "@/lib/db/client-program-service";
import { requireCoachOrAdmin, resolveTenantScope } from "@/lib/auth/guards";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { findExistingAccountByEmail } from "@/lib/db/coach-signup-service";
import { getKynovantResendConfig } from "@/lib/email/resend-brand-config";
import { getDb } from "@/lib/db/client";
import { clientProfiles, coachingEnrollments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 200;

// GET /api/internal/clients
// Returns active/invited clients for the program Assign panel, scoped
// to the requesting coach's own coaching_enrollments (admin: all).
// Deliberately minimal — id + display name only.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { coachId } = resolveTenantScope(guard.dbUser);
    const clients = await listActiveClients(coachId);
    return NextResponse.json({ ok: true, clients });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/internal/clients — invite email
//
// P0 FIX (production incident, all 6 real client invitations sent
// before this fix failed): the emailed link used to be Supabase's own
// `action_link` (admin.auth.admin.generateLink's `data.properties
// .action_link`), which points directly at Supabase's
// `/auth/v1/verify` endpoint — a GET request that CONSUMES the
// one-time invite token immediately, no user interaction required.
// Proven on staging with a controlled repro (see
// lib/db/__tests__/invite-link-security.test.ts): a second bare HTTP
// GET to that same link — indistinguishable from what email security
// gateways (Microsoft Defender for Office 365 Safe Links, Google
// Workspace link scanning, etc.) routinely do to every link in an
// incoming email to scan its destination — permanently invalidates
// it. The real human's own, genuinely-first click then fails with
// Supabase's own "Email link is invalid or has expired", surfaced by
// this app as "The sign-in link was invalid or expired."
//
// Fix: never email a link that auto-consumes on GET. buildAcceptLink
// constructs a link to THIS APP's own /auth/accept page instead,
// carrying the raw token_hash (generateLink's data.properties
// .hashed_token) as a normal, static query string. A passive GET —
// scanner, mail-client preview, search-bot — only renders inert HTML;
// nothing is verified until the human performs a real interaction (a
// button click there, which calls supabase.auth.verifyOtp()).
// Scanners don't click buttons.
//
// Uses admin.auth.admin.generateLink({ type: "invite" }) — creates the
// Supabase Auth user, same as before — for a BRAND-NEW client. A
// still-pending invite (coach re-submits the same email, or a prior
// Resend outage left it unsent) now ALSO uses generateLink (not
// inviteUserByEmail, which only offers Supabase's own generic
// template embedding the same unsafe auto-consuming action_link) —
// same safe accept-link, same custom email, for both paths.
// ─────────────────────────────────────────────────────────────

// The one and only place this app constructs an invite/accept link.
// See the file header above for why this must never be Supabase's own
// action_link.
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

// Non-fatal to account creation if it fails — the Auth user + client
// profile are already provisioned by the time this runs, so a Resend
// outage never blocks the account from existing, only this particular
// email's delivery (same posture as sendFounderInviteEmail in
// invite-coach/route.ts). Same visual language (dark background, gold
// accent bar, gold CTA) — deliberately Kynovant-only, no Catalyst
// Coaching mention anywhere. The PWA line is a single, de-emphasized
// sentence AFTER the primary "Accept Invitation" CTA — never the
// email's focus (Phase 2 of the launch brief). Factually accurate per
// the current PWA architecture (app/manifest.ts, no service worker):
// Home Screen installation only, no App Store, no offline claim.
async function sendClientInviteEmail(input: {
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
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
                You've been invited to Kynovant — set up your account to get started with your coach.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0e0f;padding:0 32px 28px;">
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
            <td style="background:#0d0e0f;padding:20px 32px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#8b8d91;">
                After setup, Kynovant can be added to your Home Screen so it works like an app on your phone — no App Store download needed. We'll show you how.
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
      console.error("[internal/clients] Resend error:", error.message ?? error);
      return { ok: false, error: error.message ?? "Email provider error" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[internal/clients] sendClientInviteEmail threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

async function upsertClientRecords(params: {
  userId: string;
  fullName: string;
  isCoach: boolean;
  coachId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(clientProfiles)
    .values({ userId: params.userId, fullName: params.fullName })
    .onConflictDoUpdate({
      target: clientProfiles.userId,
      set: { fullName: params.fullName },
    });

  // Establish the tenant link. Without this, coach-scoped reads
  // (lib/db/coach-dashboard-service.ts etc.) would never see a client
  // this coach just invited — coaching_enrollments is the sole source
  // of truth for "does this coach own this client." Admin-initiated
  // invites skip this: admin bypasses tenant scoping entirely and
  // isn't itself a coach-tenant, so there's no enrollment to create.
  //
  // packageType/monthlyRateCents are placeholders here — those columns
  // predate the coach-as-SaaS-tenant model (they describe Kynovant's
  // own consumer physique-coaching packages) and have no defined
  // meaning yet for an independent coach's own client roster. This is
  // a known open question, not a considered design decision — see the
  // coach-plan/pricing work in Phase 3 of
  // docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md.
  if (params.isCoach) {
    // No unique constraint exists on (client_id, coach_id) — a plain
    // insert would happily create a second enrollment row if this ever
    // runs twice for the same pair. That's now a real (if narrow)
    // possibility this route didn't have before: the pending-invite
    // resend branch above can call this a second time for the same
    // client if a coach retries after an earlier email-send failure.
    // Guard explicitly rather than relying on a DB constraint that
    // isn't there.
    const [existingEnrollment] = await db
      .select({ id: coachingEnrollments.id })
      .from(coachingEnrollments)
      .where(
        and(
          eq(coachingEnrollments.clientId, params.userId),
          eq(coachingEnrollments.coachId, params.coachId),
        ),
      )
      .limit(1);
    if (!existingEnrollment) {
      await db.insert(coachingEnrollments).values({
        clientId: params.userId,
        coachId: params.coachId,
        packageType: "Standard",
        monthlyRateCents: 0,
        status: "active",
      });
    }
  }
}

// Coach-initiated client creation — used by the HQ onboarding wizard's
// "first client" step and by AddClientModal ("+ Add Client"), the
// single canonical client-invitation surface in HQ. Creates the Auth
// user + client_profiles row; the new user gets role='client' from the
// on_auth_user_created trigger's default — no promotion needed.
export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  let body: { fullName?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!fullName) {
    return NextResponse.json({ ok: false, error: "fullName is required" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email address is required" }, { status: 400 });
  }
  const firstName = fullName.split(/\s+/)[0] || fullName;

  try {
    const admin = createAdminClient();
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";
    const isCoach = guard.dbUser.role === "coach";

    // A still-pending invite (repeat submission, or a prior email
    // failure) — resend via a FRESH generateLink call (not
    // inviteUserByEmail's own auto-consuming action_link + generic
    // template — see buildAcceptLink's header comment for why),
    // through the same safe accept-link + custom email as a brand-new
    // invite. Any OTHER existing account (active/suspended/archived,
    // or a different role) is rejected — never silently reused or
    // promoted.
    const existing = await findExistingAccountByEmail(email);
    if (existing) {
      // An invited coach/admin is still a different account type. Never
      // attach client profile or enrollment records to it merely because
      // its status is pending; only a pending client can be resent here.
      if (existing.role !== "client") {
        return NextResponse.json(
          { ok: false, error: "An account with this email already exists." },
          { status: 409 },
        );
      }
      if (existing.status !== "invited") {
        return NextResponse.json(
          { ok: false, error: "An account with this email already exists." },
          { status: 409 },
        );
      }
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${siteOrigin}/auth/callback` },
      });
      if (error || !data.user || !data.properties?.hashed_token) {
        return NextResponse.json(
          { ok: false, error: "The client invitation could not be sent. Please try again." },
          { status: 422 },
        );
      }
      await upsertClientRecords({ userId: data.user.id, fullName, isCoach, coachId: guard.dbUser.id });
      const resendResult = await sendClientInviteEmail({
        toEmail: email,
        firstName,
        actionLink: buildAcceptLink(siteOrigin, data.properties.hashed_token),
      });
      if (!resendResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "The invitation was created, but the email couldn't be sent. Please try inviting them again.",
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { ok: true, client: { id: data.user.id, name: fullName, email } },
        { status: 201 },
      );
    }

    // generateLink creates the Supabase Auth user and returns a
    // one-time OTP (hashed_token) instead of Supabase auto-sending its
    // own generic template. Critically, the EMAILED link points at
    // THIS app's own /auth/accept page — never at Supabase's own
    // auto-consuming action_link — see buildAcceptLink's header
    // comment for the full reasoning (proven root cause of the P0
    // invitation failure: any GET to Supabase's action_link, including
    // an automated email-security prefetch, permanently burns the
    // token before the real human ever clicks).
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteOrigin}/auth/callback` },
    });

    if (error || !data.user || !data.properties?.hashed_token) {
      return NextResponse.json(
        { ok: false, error: "The client invitation could not be created. Please try again." },
        { status: 422 },
      );
    }

    const newUserId = data.user.id;
    const actionLink = buildAcceptLink(siteOrigin, data.properties.hashed_token);

    await upsertClientRecords({ userId: newUserId, fullName, isCoach, coachId: guard.dbUser.id });

    const sendResult = await sendClientInviteEmail({ toEmail: email, firstName, actionLink });
    if (!sendResult.ok) {
      // The account already exists (status='invited') — a coach retry
      // for the same email lands in the pending-invite resend branch
      // above rather than erroring on "already registered."
      return NextResponse.json(
        {
          ok: false,
          error: "The invitation was created, but the email couldn't be sent. Please try inviting them again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { ok: true, client: { id: newUserId, name: fullName, email } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AdminClientConfigError) {
      console.error("[internal/clients] " + err.message);
      return NextResponse.json(
        { ok: false, error: "Client invite service is temporarily unavailable. Please try again shortly or contact support." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "The client invitation could not be completed. Please try again." },
      { status: 500 },
    );
  }
}
