// ─────────────────────────────────────────────────────────────
// Catalyst OS — PWA Cold-Launch Entry Point
//
// This is the manifest's start_url (see app/manifest.ts). Tapping the
// installed Home Screen icon always opens here first — never directly
// at a role's destination page, and never at the marketing homepage.
//
// P0 FIX: app/manifest.ts's start_url used to be "/" — a real client
// (Fiona Walczynski) confirmed this in production: launching the
// installed PWA from her Home Screen icon opened the public marketing
// landing page instead of her Client Portal. Kynovant is ONE shared
// app for coaches, clients, and admins — start_url can never be a
// single hardcoded destination (setting it to "/portal" would launch
// every coach's and admin's installed icon into the wrong app
// entirely). This route is the fix: a tiny, role-agnostic delegator
// that inspects the actual authenticated session on every launch and
// sends it to the correct place.
//
// Deliberately NOT app/auth/role-redirect/route.ts reused directly as
// start_url, even though the underlying role-resolution logic (below)
// is the exact same canonical primitive that route also uses — two
// real differences matter for a cold-launch entry point:
//   1. role-redirect's unauthenticated fallback redirects to
//      /login?error=auth_callback_failed, which renders "The sign-in
//      link was invalid or expired" on /login (see app/login/page.tsx)
//      — correct wording for a failed magic-link/password exchange,
//      completely wrong and alarming for "you simply haven't signed
//      in yet on this launch" — the ordinary, expected state for a
//      freshly-installed icon's first tap.
//   2. role-redirect's own header comment scopes it to "after a
//      successful signInWithPassword on the client" — a one-time
//      post-login step, not a routing table meant to be hit on every
//      single app open. syncUserToPublic() (which it calls
//      unconditionally) is meant for post-auth-event syncing; calling
//      it on every ordinary relaunch would be unnecessary write load
//      for no benefit here.
// This route reuses resolvePostLoginRedirect() and getPublicUser() —
// the same underlying canonical primitives — rather than inventing a
// second role-resolution system, while getting the launch-appropriate
// unauthenticated behavior right.
//
// No redirect loops: every destination below (/login, /admin, /hq,
// /portal) is a dead end relative to this route — none of them ever
// redirect back to /app.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicUser } from "@/lib/auth/sync";
import { resolvePostLoginRedirect } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
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
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // No session — the ordinary, expected state on a fresh install or a
  // standalone iOS launch before the first sign-in inside the
  // installed app (iOS gives an installed Home Screen web app its own,
  // separate storage from Safari — see this task's report for the
  // full standalone-session verdict). A plain, unadorned /login: no
  // error banner, nothing alarming, just "sign in."
  if (!authUser) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const dbUser = await getPublicUser(authUser.id);
  if (dbUser?.status === "suspended" || dbUser?.status === "archived") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=access_denied`);
  }

  const role = dbUser?.role ?? "client";
  const redirectPath = resolvePostLoginRedirect(null, role);
  return NextResponse.redirect(`${origin}${redirectPath}`);
}
