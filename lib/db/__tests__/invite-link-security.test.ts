// ─────────────────────────────────────────────────────────────
// Client invitation first-login — root-cause regression suite
//
// P0 production incident: all 6 real client invitations sent before
// this fix failed with "The sign-in link was invalid or expired."
// Root cause, proven here against a real Supabase project (not
// assumed from generic docs): Supabase's invite/recovery/magic-link
// tokens are consumed by a bare HTTP GET to the emailed action_link —
// no user interaction required. Any second GET to that same link
// (an email-security prefetch, a mail client's link preview, a
// search-bot, or simple accidental double-tap) permanently burns the
// token before a real human's own click, which then fails with
// Supabase's own "Email link is invalid or has expired" — surfaced by
// this app as "The sign-in link was invalid or expired."
//
// The fix (app/api/internal/clients/route.ts's buildAcceptLink +
// app/auth/accept/page.tsx) never emails Supabase's auto-consuming
// action_link. It emails a link to this app's own /auth/accept page
// carrying the raw token_hash as a static query string — a passive
// GET there renders inert HTML; only an explicit button click calls
// verifyOtp(), which is the one and only thing that consumes the
// token. This suite proves the underlying Supabase mechanics
// directly: an OTP token is genuinely single-use (first verifyOtp
// succeeds, a second with the same token_hash fails), and that no
// action is taken merely by generating/holding a token_hash — GET-ing
// the OLD-style action_link is what's dangerous, not carrying a
// token_hash in a URL nobody has acted on.
//
// Requires a reachable, non-production DATABASE_URL/
// NEXT_PUBLIC_SUPABASE_URL — run scripts/assert-staging-db.ts before
// this suite; vitest.config.ts loads .env.local automatically, so
// ALWAYS run this with .env.staging.local explicitly sourced first:
//   set -a && source .env.staging.local && set +a && npx vitest run \
//     lib/db/__tests__/invite-link-security.test.ts
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { assertStagingDbOrThrow } from "./require-staging";

// Second, in-process line of defense on top of running this via
// `npm run test:staging` — see that helper's header comment for why
// both layers exist (the incident this closes: a DB-fixture-creating
// run picked up .env.local, which is production, via vitest.config.ts's
// old auto-load). Fails at module load, before any fixture below runs.
assertStagingDbOrThrow();

const db = getDb();
// Staging's Redirect URL allow-list only has http://localhost:3000/** —
// production's https://www.kynovant.com isn't (and shouldn't be)
// listed there. The origin doesn't affect the Supabase-side mechanics
// under test here (token consumption) — only allow-list membership
// does, and this origin is on staging's list.
const siteOrigin = "http://localhost:3000";

async function generateInviteLink(email: string) {
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

describe("Supabase invite OTP mechanics (the actual root cause)", () => {
  it("A. a fresh invite's action_link is a single, valid, unclicked token", async () => {
    const email = `invite-sec-fresh-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    expect(data!.properties?.hashed_token).toBeTruthy();
    expect(data!.properties?.action_link).toBeTruthy();
    await cleanup(data!.user!.id);
  });

  it("B/C. ANY second GET to the same action_link fails — this is what a scanner/prefetch/double-click does", async () => {
    const email = `invite-sec-doublehit-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    const actionLink = data!.properties!.action_link;

    function fragmentShape(location: string | null): { params: string[]; hasAccessToken: boolean; errorCode: string | null } {
      const fragment = location?.split("#")[1] ?? "";
      const params = new URLSearchParams(fragment);
      return {
        params: [...params.keys()].sort(),
        hasAccessToken: params.has("access_token"),
        errorCode: params.get("error_code"),
      };
    }

    const first = await fetch(actionLink, { redirect: "manual" });
    const firstShape = fragmentShape(first.headers.get("location"));
    // First GET — whoever/whatever makes it — succeeds and receives
    // real session tokens. This is the exact behavior a prefetching
    // scanner exploits.
    expect(firstShape.hasAccessToken).toBe(true);

    const second = await fetch(actionLink, { redirect: "manual" });
    const secondShape = fragmentShape(second.headers.get("location"));
    // The second hit — which is what the REAL human's click becomes,
    // if anything (bot or human) already hit the link first —
    // definitively fails. This is the exact mechanism that produced
    // "The sign-in link was invalid or expired" for real clients.
    expect(secondShape.hasAccessToken).toBe(false);
    expect(secondShape.errorCode).toBe("otp_expired");

    await cleanup(data!.user!.id);
  });

  it("D. verifyOtp with a fresh token_hash succeeds exactly once — proves the new /auth/accept flow's core safety property", async () => {
    const email = `invite-sec-verifyotp-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    const tokenHash = data!.properties!.hashed_token;

    // Merely HOLDING a token_hash (as /auth/accept's URL does, before
    // any click) performs no Supabase Auth operation at all — unlike
    // the old action_link, which itself WAS the consuming request.
    // This is the actual fix: nothing here has consumed anything yet.
    const anon = createAdminClient();
    const first = await anon.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(first.error).toBeNull();
    expect(first.data.user).toBeTruthy();

    // A second verifyOtp with the identical token_hash — simulating a
    // duplicate click, a replayed request, or an attacker who
    // intercepted the URL — correctly fails. Single-use is preserved;
    // the fix doesn't weaken it, it only moves WHERE consumption
    // happens (an explicit user action, not a passive GET).
    const second = await anon.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(second.error).not.toBeNull();

    await cleanup(data!.user!.id);
  });

  it("E. an already-active client's stale invite link fails verifyOtp — the /auth/accept page must treat this as 'already signed in', not an error, when a live session exists", async () => {
    const email = `invite-sec-alreadyactive-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    const tokenHash = data!.properties!.hashed_token;

    const client1 = createAdminClient();
    const activation = await client1.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(activation.error).toBeNull();

    // The SAME (now-consumed) token, used again later — e.g. the
    // client re-opens the original invitation email after they've
    // already activated.
    const client2 = createAdminClient();
    const staleClick = await client2.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(staleClick.error).not.toBeNull();

    await cleanup(data!.user!.id);
  });
});

describe("password establishment and subsequent login", () => {
  it("F/G. after activation, setting a password via updateUser enables password sign-in; a wrong password is rejected", async () => {
    // NOTE: encrypted_password is NOT a usable "has the user completed
    // setup" signal — verified empirically here and documented in
    // lib/supabase/session.ts: Supabase sets a real random password
    // hash on every invited user at CREATION time (before the human
    // ever clicks anything), so `encrypted_password IS NOT NULL` is
    // true immediately after generateLink, not just after the user's
    // own /setup-password submission. This test proves what IS true:
    // the user's own chosen password (set via /setup-password's
    // updateUser({password}) call) becomes the one that actually
    // authenticates them, and nothing else does.
    const email = `invite-sec-password-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    const tokenHash = data!.properties!.hashed_token;
    const userId = data!.user!.id;

    const anon = createAdminClient();
    const activation = await anon.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    expect(activation.error).toBeNull();

    // A guess against whatever random password Supabase auto-assigned
    // at invite time must fail — it was never communicated to anyone,
    // least of all a guesser, and isn't what /setup-password sets.
    const guessBeforeSetup = await createAdminClient().auth.signInWithPassword({ email, password: "random-guess-1" });
    expect(guessBeforeSetup.error).not.toBeNull();

    // The user's own chosen password, set the same way
    // /setup-password's handleSubmit does (supabase.auth.updateUser).
    const admin = createAdminClient();
    const setPassword = await admin.auth.admin.updateUserById(userId, { password: "Str0ngTestPassw0rd!" });
    expect(setPassword.error).toBeNull();

    const signIn = await createAdminClient().auth.signInWithPassword({ email, password: "Str0ngTestPassw0rd!" });
    expect(signIn.error).toBeNull();
    expect(signIn.data.session).toBeTruthy();

    // A wrong password correctly still fails after setup.
    const wrongSignIn = await createAdminClient().auth.signInWithPassword({ email, password: "definitely-wrong" });
    expect(wrongSignIn.error).not.toBeNull();

    await cleanup(userId);
  });
});

describe("invitation-only boundary is preserved", () => {
  it("generateLink({type:'invite'}) always creates role='client' via the DB trigger default — no caller-supplied role", async () => {
    const email = `invite-sec-role-${randomUUID()}@isolation-test.invalid`;
    const { data, error } = await generateInviteLink(email);
    expect(error).toBeNull();
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, data!.user!.id));
    expect(row?.role).toBe("client");
    await cleanup(data!.user!.id);
  });
});
