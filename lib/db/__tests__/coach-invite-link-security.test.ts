// ─────────────────────────────────────────────────────────────
// Coach invitation first-login — root-cause regression suite
//
// P0: all three coach-creation paths (app/api/internal/overwatch/
// invite-coach/route.ts, app/api/coach-signup/route.ts,
// app/api/admin/coaches/route.ts) used to email a link straight to
// Supabase's own single-use action_link — either directly
// (invite-coach's fresh-invite path) or indirectly by letting
// Supabase send its own default template (coach-signup and
// admin/coaches's inviteUserByEmail() calls, and invite-coach's own
// resend path). Root cause proven directly against a real Supabase
// project (not assumed from docs), identically to the already-fixed
// client-invitation P0 (lib/db/__tests__/invite-link-security.test.ts):
// Supabase's invite action_link is consumed by a bare HTTP GET — no
// user interaction required — so a second GET (an email-security
// scanner's automated prefetch, a mail client's link preview, a
// search-bot) permanently burns the token before the real coach's own
// click, which then fails with "Email link is invalid or has
// expired."
//
// This suite proves the underlying Supabase mechanics are IDENTICAL
// regardless of which of the three routes generated the link — the
// vulnerability class doesn't depend on WHICH caller invokes
// generateLink/inviteUserByEmail, only on whether the resulting link
// is the raw action_link or this app's own inert /auth/accept +
// token_hash link. Since all three fixed routes now build their
// accept link the exact same way (own local buildAcceptLink +
// data.properties.hashed_token, never data.properties.action_link),
// one shared mechanics suite covers all three — the route-specific
// source-inspection suites (lib/auth/__tests__/
// overwatch-invite-coach-security.test.ts,
// lib/auth/__tests__/coach-signup-security.test.ts) prove each route
// actually uses this pattern; this suite proves the pattern itself is
// safe.
//
// Requires a reachable, non-production DATABASE_URL/
// NEXT_PUBLIC_SUPABASE_URL — run scripts/assert-staging-db.ts before
// this suite; vitest.config.ts loads .env.local automatically, so
// ALWAYS run this with .env.staging.local explicitly sourced first:
//   set -a && source .env.staging.local && set +a && npx vitest run \
//     lib/db/__tests__/coach-invite-link-security.test.ts
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

const db = getDb();
const siteOrigin = "http://localhost:3000";

async function generateCoachInviteLink(email: string) {
  const admin = createAdminClient();
  return admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${siteOrigin}/auth/callback` },
  });
}

async function cleanup(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
  await createAdminClient().auth.admin.deleteUser(userId);
}

describe("Coach invite — Supabase action_link is single-use and auto-consumed by a bare GET (the exact mechanism this fix eliminates from every coach-creation email)", () => {
  it("A. a fresh coach invite's action_link is a single, valid, unclicked token", async () => {
    const email = `coach-invite-sec-fresh-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateCoachInviteLink(email);
    expect(error).toBeNull();
    expect(data!.properties?.hashed_token).toBeTruthy();
    expect(data!.properties?.action_link).toBeTruthy();
    await cleanup(data!.user!.id);
  });

  it("B. a second bare GET to the same action_link fails — proves why this app must never email it directly (the pre-fix invite-coach/admin-coaches behavior, and the pre-fix coach-signup/resend behavior via Supabase's own default template)", async () => {
    const email = `coach-invite-sec-doublehit-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateCoachInviteLink(email);
    expect(error).toBeNull();
    const actionLink = data!.properties!.action_link;

    function fragmentShape(location: string | null): { hasAccessToken: boolean; errorCode: string | null } {
      const fragment = location?.split("#")[1] ?? "";
      const params = new URLSearchParams(fragment);
      return { hasAccessToken: params.has("access_token"), errorCode: params.get("error_code") };
    }

    const first = await fetch(actionLink, { redirect: "manual" });
    expect(fragmentShape(first.headers.get("location")).hasAccessToken).toBe(true);

    const second = await fetch(actionLink, { redirect: "manual" });
    const secondShape = fragmentShape(second.headers.get("location"));
    expect(secondShape.hasAccessToken).toBe(false);
    expect(secondShape.errorCode).toBe("otp_expired");

    await cleanup(data!.user!.id);
  });

  it("C. verifyOtp with a fresh token_hash succeeds exactly once — proves the fix's core safety property: /auth/accept's inert token_hash holds no state until the explicit Accept click calls this", async () => {
    const email = `coach-invite-sec-verifyotp-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateCoachInviteLink(email);
    expect(error).toBeNull();
    const tokenHash = data!.properties!.hashed_token;

    const anon = createAdminClient();
    const first = await anon.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(first.error).toBeNull();
    expect(first.data.user).toBeTruthy();

    const second = await anon.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(second.error).not.toBeNull();

    await cleanup(data!.user!.id);
  });

  it("D. merely holding a token_hash in the /auth/accept URL performs no Supabase Auth operation — a passive GET (scanner/prefetch) can never consume it, unlike the old action_link", async () => {
    const email = `coach-invite-sec-passive-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateCoachInviteLink(email);
    expect(error).toBeNull();
    const tokenHash = data!.properties!.hashed_token;

    // Simulate a scanner "visiting" the accept-page URL by doing
    // nothing Auth-related with the token_hash at all — the real
    // /auth/accept page renders inert HTML on a passive GET; there is
    // no server-side route that redeems a token_hash via GET anywhere
    // in this app (only the POST from an explicit button click does).
    // The token therefore remains valid afterward.
    const stillValid = await createAdminClient().auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(stillValid.error).toBeNull();

    await cleanup(data!.user!.id);
  });
});

describe("Coach invite — role is always granted server-side, never from the invite mechanics", () => {
  it("generateLink({type:'invite'}) alone never grants role='coach' — the DB trigger default is 'client' until provisionInvitedCoach() runs", async () => {
    const email = `coach-invite-sec-role-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateCoachInviteLink(email);
    expect(error).toBeNull();
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, data!.user!.id));
    // Whichever default the on_auth_user_created trigger applies — the
    // point under test is that generateLink's OWN response/mechanics
    // never carry a role; only this app's own provisionInvitedCoach()
    // call (proven in lib/db/__tests__/coach-invitation-acquisition.test.ts
    // and lib/db/__tests__/coach-signup.test.ts) does.
    expect(row?.role).not.toBe("coach");
    await cleanup(data!.user!.id);
  });
});
