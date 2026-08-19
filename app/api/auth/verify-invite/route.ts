import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  ONBOARDING_COOKIE_NAME,
  onboardingCookieOptions,
  signOnboardingToken,
} from "@/lib/auth/onboarding-token";

// ─────────────────────────────────────────────────────────────
// POST /api/auth/verify-invite
//
// Called by app/auth/accept/page.tsx's explicit "Accept Invitation" /
// "Continue" button click. Redeems the invite/recovery OTP token
// SERVER-SIDE (instead of the browser calling supabase.auth.verifyOtp()
// directly, as the original P0 fix did) so that, on success, this same
// response can also mint the onboarding-activation cookie — something
// only server code with cookie-write access can do. The session itself
// is established exactly as before, via the Set-Cookie headers
// @supabase/ssr's server client writes for the sb-* session cookies;
// the browser's own supabase-js client reads those same cookies on its
// next call, so nothing about the client-side session story changes.
//
// This is the ONLY place (along with app/auth/callback/route.ts's
// exchangeCodeForSession success, for the PKCE-flow case) that mints
// the onboarding cookie from direct proof of token redemption — not
// from an already-established session, which is exactly what would
// let a normal logged-in user forge their way into /setup-password.
// ─────────────────────────────────────────────────────────────

const KNOWN_TYPES: EmailOtpType[] = ["invite", "recovery", "magiclink", "signup", "email_change", "email"];

export async function POST(request: NextRequest) {
  let body: { token_hash?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const tokenHash = typeof body.token_hash === "string" ? body.token_hash : null;
  const rawType = typeof body.type === "string" ? body.type : null;
  const type = rawType && (KNOWN_TYPES as string[]).includes(rawType) ? (rawType as EmailOtpType) : null;

  if (!tokenHash || !type) {
    return NextResponse.json({ ok: false, error: "This link is missing required information." }, { status: 400 });
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

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    // Supabase's own message here is already generic ("Token has
    // expired or is invalid") — safe to pass through, doesn't leak
    // account existence.
    return NextResponse.json(
      { ok: false, error: error?.message ?? "This link is no longer valid." },
      { status: 400 },
    );
  }

  if (type === "invite") {
    cookieStore.set(ONBOARDING_COOKIE_NAME, signOnboardingToken(data.user.id), onboardingCookieOptions());
  }

  return NextResponse.json({ ok: true, type });
}
