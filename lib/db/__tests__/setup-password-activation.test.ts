// ─────────────────────────────────────────────────────────────
// /setup-password activation gate — staging-backed lifecycle proof
//
// Proves the real Supabase mechanics the activation gate depends on,
// against a REAL Supabase project (not mocks, not assumed from docs):
//
//   1. A genuine invite-OTP redemption yields a real user id that the
//      onboarding-token module will mint a valid, uid-scoped
//      activation token for.
//   2. The amr claim on a REAL invite-OTP session says "otp"; the amr
//      claim on a REAL password-login session for the SAME user says
//      "password" — the exact distinction
//      app/api/auth/confirm-invite-session/route.ts relies on to
//      avoid trusting "a session exists" alone. (Complements the pure
//      logic test in lib/auth/__tests__/session-claims.test.ts, which
//      proves the predicate is correct in isolation; this proves real
//      Supabase output actually looks the way that predicate expects.)
//   3. A recovery-OTP session's amr ALSO says "otp" — documented
//      explicitly so this known limitation (amr alone can't
//      distinguish invite from recovery; routing still relies on the
//      `type` value carried through the fragment/callback) never
//      silently regresses unnoticed.
//   4. A consumed/expired invite token cannot redeem a session at
//      all, so by construction no onboarding cookie can ever be
//      minted from it — no new attack surface introduced by this
//      gate on top of the already-proven single-use-token behavior
//      (see lib/db/__tests__/invite-link-security.test.ts).
//
// Requires a reachable, non-production DATABASE_URL/
// NEXT_PUBLIC_SUPABASE_URL. assertStagingDbOrThrow() below refuses to
// run this file at all against production — but ALWAYS run it via:
//   npm run test:staging -- lib/db/__tests__/setup-password-activation.test.ts
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { assertStagingDbOrThrow } from "./require-staging";
import { signOnboardingToken, verifyOnboardingToken } from "@/lib/auth/onboarding-token";
import { isFreshOtpAmr } from "@/lib/auth/session-claims";

assertStagingDbOrThrow();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const createdUserIds: string[] = [];

describe("setup-password activation gate — real Supabase mechanics", () => {
  const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  it("a real invite-OTP redemption yields a uid that mints and verifies a valid onboarding token", async () => {
    const email = `activation-gate-${randomUUID()}@isolation-test.invalid`;
    const { data: genData, error: genErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: "https://example.invalid/auth/accept" },
    });
    expect(genErr).toBeNull();
    const userId = genData!.user!.id;
    createdUserIds.push(userId);

    const anon = createAdminClient(SUPABASE_URL, ANON_KEY);
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      type: "invite",
      token_hash: genData!.properties!.hashed_token,
    });
    expect(verifyErr).toBeNull();
    expect(verifyData!.user!.id).toBe(userId);

    // This is exactly what app/api/auth/verify-invite/route.ts does on
    // a successful verifyOtp for type=invite.
    const token = signOnboardingToken(userId);
    expect(verifyOnboardingToken(token, userId)).toBe(true);

    // And exactly what the gate must reject: this uid's token used
    // for a DIFFERENT uid (no cross-account reuse).
    expect(verifyOnboardingToken(token, randomUUID())).toBe(false);
  }, 20000);

  it("a real invite-OTP session's amr says otp; a real password-login session's amr for the SAME user says password", async () => {
    const email = `activation-gate-amr-${randomUUID()}@isolation-test.invalid`;
    const password = `P${randomUUID()}!aA1`;

    const { data: genData, error: genErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: "https://example.invalid/auth/accept" },
    });
    expect(genErr).toBeNull();
    const userId = genData!.user!.id;
    createdUserIds.push(userId);

    const anon1 = createAdminClient(SUPABASE_URL, ANON_KEY);
    const { data: inviteVerify, error: inviteErr } = await anon1.auth.verifyOtp({
      type: "invite",
      token_hash: genData!.properties!.hashed_token,
    });
    expect(inviteErr).toBeNull();
    const inviteClaims = decodeJwt(inviteVerify!.session!.access_token);
    // This is exactly the check confirm-invite-session/route.ts runs
    // via supabase.auth.getClaims() against the caller's own JWT.
    expect(isFreshOtpAmr(inviteClaims.amr)).toBe(true);

    // Mirrors /setup-password's own updateUser() call, then a normal
    // subsequent password sign-in — the case the gate must DENY entry
    // to /setup-password for.
    await admin.auth.admin.updateUserById(userId, { password });
    const anon2 = createAdminClient(SUPABASE_URL, ANON_KEY);
    const { data: pwData, error: pwErr } = await anon2.auth.signInWithPassword({ email, password });
    expect(pwErr).toBeNull();
    const pwClaims = decodeJwt(pwData!.session!.access_token);
    expect(isFreshOtpAmr(pwClaims.amr)).toBe(false);
  }, 20000);

  it("KNOWN LIMITATION, documented on purpose: a recovery-OTP session's amr also says otp — routing still depends on `type`, not amr alone, to tell invite from recovery", async () => {
    const email = `activation-gate-recovery-${randomUUID()}@isolation-test.invalid`;
    const { data: inviteGen } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: "https://example.invalid/auth/accept" },
    });
    const userId = inviteGen!.user!.id;
    createdUserIds.push(userId);

    const { data: recGen, error: recGenErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://example.invalid/auth/accept" },
    });
    expect(recGenErr).toBeNull();

    const anon = createAdminClient(SUPABASE_URL, ANON_KEY);
    const { data: recVerify, error: recErr } = await anon.auth.verifyOtp({
      type: "recovery",
      token_hash: recGen!.properties!.hashed_token,
    });
    expect(recErr).toBeNull();
    const recClaims = decodeJwt(recVerify!.session!.access_token);
    expect(isFreshOtpAmr(recClaims.amr)).toBe(true); // same as invite — amr can't distinguish these two
  }, 20000);

  it("a consumed invite token cannot redeem a session — no onboarding cookie can ever be minted from it", async () => {
    const email = `activation-gate-consumed-${randomUUID()}@isolation-test.invalid`;
    const { data: genData, error: genErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: "https://example.invalid/auth/accept" },
    });
    expect(genErr).toBeNull();
    createdUserIds.push(genData!.user!.id);

    const anon1 = createAdminClient(SUPABASE_URL, ANON_KEY);
    const first = await anon1.auth.verifyOtp({ type: "invite", token_hash: genData!.properties!.hashed_token });
    expect(first.error).toBeNull();

    const anon2 = createAdminClient(SUPABASE_URL, ANON_KEY);
    const second = await anon2.auth.verifyOtp({ type: "invite", token_hash: genData!.properties!.hashed_token });
    expect(second.error).not.toBeNull();
    expect(second.data.session).toBeNull();
    // No session → app/api/auth/verify-invite/route.ts's `!data.user`
    // check fails closed → no cookie minted. Nothing further to gate.
  }, 20000);

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });
});
