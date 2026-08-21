import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  ONBOARDING_COOKIE_NAME,
  onboardingCookieOptions,
  signOnboardingToken,
} from "@/lib/auth/onboarding-token";
import { isFreshOtpAmr } from "@/lib/auth/session-claims";
import { verifyInviteHandoffToken } from "@/lib/auth/onboarding-token";

// ─────────────────────────────────────────────────────────────
// POST /api/auth/confirm-invite-session
//
// Companion to app/api/auth/verify-invite/route.ts for the ONE
// remaining legacy path that can't call verifyOtp() itself:
// implicit-flow invite links whose tokens arrive in the URL FRAGMENT
// (never sent to the server) rather than a token_hash query param.
// Current Kynovant invite paths use /auth/accept + token_hash; this
// endpoint remains as a defense-in-depth guard for any older
// fragment-callback handoff that may still exist in a user's inbox.
// By the time app/auth/fragment-callback/page.tsx calls this route,
// supabase.auth.setSession() has already redeemed those fragment
// tokens and established the session; there is no token_hash left to
// re-verify here.
//
// Trust model — this endpoint does NOT trust "an authenticated
// session exists" alone (that's precisely what would let a normal
// client/coach password-login session forge its way into
// /setup-password). It requires BOTH, checked against the caller's
// own JWT via getClaims() (cryptographically validated, not merely
// read from a mutable client-side object):
//   1. amr contains an entry with method "otp" — proven empirically
//      against staging to be exactly how Supabase marks a session
//      established via verifyOtp/magic-link/invite/recovery, and
//      distinctly NOT what a password login produces (method:
//      "password"). Confirmed, not assumed from docs.
//   2. that amr entry's timestamp is within the last 2 minutes —
//      so an old, long-lived OTP-established session can't be
//      replayed against this endpoint indefinitely; only a JUST-NOW
//      redemption qualifies.
// An attacker satisfying both would need a session freshly created,
// within the last two minutes, via SOME real one-time link Supabase
// itself issued to them — i.e. they'd already need a genuine invite
// or recovery link of their own. That's not a privilege escalation,
// it's the same access the legitimate flow already grants.
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: { handoff?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invitation handoff is required." }, { status: 400 });
  }
  const handoff = typeof body.handoff === "string" ? body.handoff : null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ ok: false, error: "No active session." }, { status: 401 });
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(session.access_token);
  if (claimsError || !claimsData?.claims) {
    return NextResponse.json({ ok: false, error: "Could not validate session." }, { status: 401 });
  }

  const claims = claimsData.claims;

  if (!isFreshOtpAmr(claims.amr)) {
    return NextResponse.json({ ok: false, error: "This session was not just established by an invitation link." }, { status: 403 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !verifyInviteHandoffToken(handoff, user.email)) {
    return NextResponse.json({ ok: false, error: "This session was not established by a valid invitation." }, { status: 403 });
  }

  cookieStore.set(ONBOARDING_COOKIE_NAME, signOnboardingToken(claims.sub as string), onboardingCookieOptions());
  return NextResponse.json({ ok: true });
}
