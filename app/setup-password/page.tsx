// ─────────────────────────────────────────────────────────────
// Catalyst OS — /setup-password Server Guard
//
// Before this fix: this route was a pure Client Component with no
// server-side check at all — ANY authenticated session (a normal
// client's password login, a coach, an admin, or an already-active
// user typing the URL by hand) could load the form. The actual
// password-set network call (supabase.auth.updateUser()) worked for
// any of them too, since Supabase itself has no concept of "is this
// user currently mid-invitation-onboarding."
//
// This Server Component runs BEFORE any HTML for the form is ever
// sent to the browser. It requires BOTH:
//   1. a valid, currently-authenticated Supabase session
//   2. a valid, unexpired onboarding-activation cookie (see
//      lib/auth/onboarding-token.ts) whose signed uid matches that
//      session's user — minted ONLY by server code that just
//      observed a genuine invite-token redemption (see
//      app/api/auth/verify-invite, app/auth/callback,
//      app/api/auth/confirm-invite-session)
//
// If either is missing, the form is never rendered. An unauthenticated
// visitor goes to /login. An authenticated visitor without a valid
// onboarding cookie (a normal client/coach/admin login, or a stale
// reopen after their own setup already completed) is sent to their
// real destination via /auth/role-redirect — not an error page, and
// not /login (which would look like they got signed out). This
// doesn't leak account existence either way: the response is
// identical whether or not the account exists, since it never gets
// past "no session" before that would matter.
//
// The password-update operation itself is independently re-guarded in
// app/api/auth/complete-onboarding/route.ts — this page guard alone
// is not the enforcement boundary, only the UX one.
// ─────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_COOKIE_NAME, verifyOnboardingToken } from "@/lib/auth/onboarding-token";
import SetupPasswordClient from "./SetupPasswordClient";

export default async function SetupPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const onboardingToken = cookieStore.get(ONBOARDING_COOKIE_NAME)?.value;

  if (!verifyOnboardingToken(onboardingToken, user.id)) {
    redirect("/auth/role-redirect");
  }

  return <SetupPasswordClient />;
}
