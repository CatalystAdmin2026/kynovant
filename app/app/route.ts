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
//
// P0 FIX (real production incident — Monica, Jenny, and Maddie each
// received a raw Next.js server-exception page, digest 877070528,
// immediately on tapping their installed Home Screen icon): proven via
// Vercel production runtime logs, not assumed. The exact failure:
// getPublicUser()'s query throws with Postgres error XX000
// (EMAXCONNSESSION — "max clients reached in session mode... limited
// to pool_size: 15") whenever Supabase's Session Mode connection pool
// is transiently exhausted by concurrent app-wide load. This has
// nothing to do with these three clients' own account state — the
// SAME failure hit /auth/role-redirect and (for other users) /portal
// in the identical time window, confirming it is a shared, load-
// dependent, transient condition, not a per-account bug. The reason
// it crashes HERE specifically, as a raw 500, while /portal (a page
// Server Component rendered under Suspense) instead returns 200 for
// the exact same underlying query failure: a Route Handler's GET
// function has no built-in per-component error boundary the way a
// streamed page does — any uncaught throw fails the entire response.
// Fiona's installed icon worked and Monica/Jenny/Maddie's didn't for
// the same reason two people load the same page a few seconds apart
// and get different results during a transient outage: pure timing,
// not any difference in their accounts (verified read-only against
// production — see this task's report).
//
// Fix: this route must never let an unexpected exception escape as a
// raw response. A failed public.users lookup on an otherwise-valid
// session is treated exactly like the pre-existing "no row yet" case
// already handled below (role defaults to "client") — never a crash,
// and never more privileged than the least-trusted role, so this
// cannot grant access it shouldn't. Anything else unanticipated falls
// back to a plain /login, matching the "auth failed to resolve, ask
// them to sign in" behavior this route already used for a genuinely
// missing session.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicUser } from "@/lib/auth/sync";
import { resolvePostLoginRedirect } from "@/lib/auth/redirect";

function workspaceUnavailableResponse(): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Kynovant is reconnecting</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #080909; color: #f0efeb; font-family: system-ui, -apple-system, sans-serif; text-align: center; }
      main { width: min(100%, 360px); }
      .mark { color: #c9a24d; font-size: 11px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; }
      h1 { margin: 22px 0 10px; font-size: 20px; font-weight: 650; }
      p { margin: 0; color: rgba(240,239,235,.55); font-size: 13px; line-height: 1.7; }
      a { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; margin-top: 28px; padding: 0 22px; background: #c9a24d; color: #080909; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-decoration: none; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">Kynovant</div>
      <h1>Kynovant is reconnecting.</h1>
      <p>We couldn't load your workspace just yet.</p>
      <a href="/app">Try Again</a>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  try {
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

    // No session — the ordinary, expected state on a fresh install or
    // a standalone iOS launch before the first sign-in inside the
    // installed app (iOS gives an installed Home Screen web app its
    // own, separate storage from Safari — see this task's report for
    // the full standalone-session verdict). A plain, unadorned
    // /login: no error banner, nothing alarming, just "sign in." Also
    // reached if getUser() itself couldn't resolve a session (stale,
    // expired, or malformed cookies) — same safe destination either
    // way, since we genuinely don't know who this is.
    if (!authUser) {
      return NextResponse.redirect(`${origin}/login`);
    }

    // A real, valid Supabase session exists past this point. A thrown
    // public.users query means the database could not answer; it is not
    // evidence that this user has no row. Never guess a role on that path.
    let dbUser: Awaited<ReturnType<typeof getPublicUser>> | null;
    try {
      dbUser = await getPublicUser(authUser.id);
    } catch {
      return workspaceUnavailableResponse();
    }

    if (dbUser?.status === "suspended" || dbUser?.status === "archived") {
      try {
        await supabase.auth.signOut();
      } catch {
        // Best-effort cleanup — the redirect below is what actually
        // matters; every privileged page independently re-verifies
        // status on its own, so a failed signOut here isn't a gap.
      }
      return NextResponse.redirect(`${origin}/login?error=access_denied`);
    }

    const role = dbUser?.role ?? "client";
    const redirectPath = resolvePostLoginRedirect(null, role);
    return NextResponse.redirect(`${origin}${redirectPath}`);
  } catch {
  // Anything else unanticipated — cookie parsing, session
  // resolution, or a failure mode not enumerated above. A cold
  // launch must never expose a raw server exception; fail to a
  // plain sign-in screen instead because no valid session was
  // established at this boundary.
    return NextResponse.redirect(`${origin}/login`);
  }
}
