// ─────────────────────────────────────────────────────────────
// Catalyst OS — Auth Callback Route
//
// Handles the magic-link redirect from Supabase Auth.
// Exchanges the auth code for a session, syncs the user into
// public.users, then redirects based on role and next param.
//
// Security:
//   - Only accepts safe internal relative paths in `next`
//   - Protocol-relative and absolute URLs are rejected
//   - `next` must be authorized for the authenticated user's role
//   - Falls back to role default if next is absent or unauthorized
//   - Suspended/archived users are rejected after sync
//   - Auth codes are single-use (Supabase enforces this)
//   - No auth tokens or codes are logged
//
// Role fallbacks:
//   admin  → /admin
//   coach  → /hq
//   client → /portal
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncUserToPublic, getPublicUser } from "@/lib/auth/sync";
import { resolvePostLoginRedirect } from "@/lib/auth/redirect";
import { ONBOARDING_COOKIE_NAME, onboardingCookieOptions, signOnboardingToken } from "@/lib/auth/onboarding-token";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const type = url.searchParams.get("type"); // "recovery" | "invite" | "email" | null
  const overwatch = url.searchParams.get("overwatch");
  const origin = url.origin;

  if (!code) {
    // Supabase can issue either PKCE links (?code=...) or implicit links
    // (#access_token=...). URL fragments are never sent to the server, so
    // hand the browser to a client callback that can consume the fragment.
    return NextResponse.redirect(
      `${origin}/auth/fragment-callback${url.search}`,
    );
  }

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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    // Expired, already used, or invalid code.
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed`,
    );
  }

  // Get the validated user from the auth server (not just the local cookie).
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed`,
    );
  }

  // Sync auth.users → public.users: updates email, status, emailVerifiedAt.
  // The database trigger handles the initial row creation; this handles
  // lifecycle updates on subsequent logins.
  await syncUserToPublic(authUser);

  // Reject suspended or archived accounts after sync.
  const dbUser = await getPublicUser(authUser.id);
  if (
    dbUser?.status === "suspended" ||
    dbUser?.status === "archived"
  ) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=access_denied`);
  }

  // Special auth types take precedence over role-based redirect.
  // recovery → password reset screen (session is established, user sets new password)
  // invite   → first-time password setup screen
  if (type === "recovery") {
    const destination = overwatch === "1"
      ? `/reset-password?overwatch=1&next=${encodeURIComponent(next ?? "/overwatch")}`
      : "/reset-password";
    return NextResponse.redirect(`${origin}${destination}`);
  }
  if (type === "invite") {
    // Direct, server-observed proof of invite-token redemption in
    // THIS request (exchangeCodeForSession just succeeded above) —
    // exactly the trust level the activation gate requires. Mints the
    // same short-lived cookie app/api/auth/verify-invite/route.ts
    // mints for the (currently primary) /auth/accept path, so
    // /setup-password's gate works identically regardless of which
    // entry point got the user here — including the still-unmigrated
    // coach-invite pipeline, if it or Supabase's project settings
    // ever produce a PKCE-style `?code=` link instead of the implicit-
    // flow fragment tokens app/auth/fragment-callback/page.tsx handles
    // today.
    cookieStore.set(ONBOARDING_COOKIE_NAME, signOnboardingToken(authUser.id), onboardingCookieOptions());

    const destination = overwatch === "1"
      ? `/setup-password?overwatch=1&next=${encodeURIComponent(next ?? "/overwatch")}`
      : "/setup-password";
    return NextResponse.redirect(`${origin}${destination}`);
  }
  if (overwatch === "1") {
    const destination = next ?? "/overwatch";
    return NextResponse.redirect(
      `${origin}/auth/overwatch-redirect?next=${encodeURIComponent(destination)}`,
    );
  }

  const role = dbUser?.role ?? "client";
  const redirectPath = resolvePostLoginRedirect(next, role);
  return NextResponse.redirect(`${origin}${redirectPath}`);
}
