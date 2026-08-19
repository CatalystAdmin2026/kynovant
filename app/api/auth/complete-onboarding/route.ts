import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  ONBOARDING_COOKIE_NAME,
  clearedOnboardingCookieOptions,
  verifyOnboardingToken,
} from "@/lib/auth/onboarding-token";

// ─────────────────────────────────────────────────────────────
// POST /api/auth/complete-onboarding
//
// The actual password-set operation for /setup-password. Deliberately
// NOT just "call supabase.auth.updateUser() from the browser" (what
// the page did before this fix) — that call succeeds for ANY
// authenticated session regardless of how it was established, which
// is exactly the gap this whole task closes. The page-level guard in
// app/setup-password/page.tsx keeps the FORM from rendering for an
// unauthorized session, but a forged/direct POST to the underlying
// operation must be denied independently — a client-side-only guard
// is not a guard.
//
// Requires BOTH, re-verified here (not trusted from the page render):
//   1. a valid authenticated session (supabase.auth.getUser())
//   2. a valid, unexpired onboarding-activation cookie whose signed
//      uid matches that session's user
//
// On success: sets the new password via the user's own session (a
// user may always change their own password given a valid session —
// this endpoint's job is gating WHEN that's allowed to happen via
// this specific first-time-setup path, not re-implementing password
// changes), then immediately deletes the onboarding cookie so it
// cannot be replayed — closes the multi-tab race: whichever tab's
// request reaches the server first consumes the cookie; any other
// tab's subsequent submit finds it already gone and is denied.
// ─────────────────────────────────────────────────────────────

const REQUIREMENTS: Array<(p: string) => boolean> = [
  (p) => p.length >= 8,
  (p) => /[A-Z]/.test(p),
  (p) => /[a-z]/.test(p),
  (p) => /[0-9]/.test(p),
];

function meetsRequirements(password: string): boolean {
  return REQUIREMENTS.every((test) => test(password));
}

export async function POST(request: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!meetsRequirements(password)) {
    return NextResponse.json({ ok: false, error: "Password does not meet requirements." }, { status: 400 });
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const onboardingToken = cookieStore.get(ONBOARDING_COOKIE_NAME)?.value;
  if (!verifyOnboardingToken(onboardingToken, user.id)) {
    // Always clear whatever's there — a stale/expired/mismatched
    // cookie should never be left sitting around for a retry.
    cookieStore.set(ONBOARDING_COOKIE_NAME, "", clearedOnboardingCookieOptions());
    return NextResponse.json(
      {
        ok: false,
        error:
          "This activation session has ended. If you already set your password, sign in below. Otherwise, ask your coach for a new invitation.",
      },
      { status: 403 },
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return NextResponse.json({ ok: false, error: "Unable to set password. Please try again." }, { status: 400 });
  }

  // Consume the authorization the instant it's used — single-purpose,
  // not reusable.
  cookieStore.set(ONBOARDING_COOKIE_NAME, "", clearedOnboardingCookieOptions());

  return NextResponse.json({ ok: true });
}
