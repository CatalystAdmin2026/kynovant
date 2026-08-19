// ─────────────────────────────────────────────────────────────
// Catalyst OS — Invitation-Onboarding Activation Gate
//
// SERVER-ONLY — never import from a Client Component.
//
// Closes a real gap in the P0 client-invitation fix: /setup-password
// previously accepted ANY authenticated session — a normal client
// password login, a coach login, an admin login, or an already-active
// user who just manually typed the URL — with no check that the
// session actually arrived by way of a genuine, just-redeemed
// invitation. This module is the "is this session currently allowed
// to complete invitation onboarding" signal that was missing.
//
// Design (chosen over the alternatives considered):
//   - NOT `encrypted_password IS NOT NULL` — proven false in the
//     original P0 pass: Supabase assigns every invited user a real
//     random bcrypt hash at generateLink() time, before any human
//     interaction, so that column can never distinguish "user set
//     their own password" from "never touched setup-password."
//   - NOT email/role/generic-session-presence alone — none of those
//     say anything about *how* or *when* the session was established.
//   - NOT a permanent DB column — this is a transient, single-purpose,
//     minutes-long authorization, not a durable fact about the user;
//     a short-lived signed cookie is the right-sized mechanism and
//     avoids a migration for something that should self-expire.
//
// A short-lived (15 min), server-signed, HttpOnly cookie, minted ONLY
// by server code that just received direct, Supabase-validated proof
// of an invite-OTP redemption (verifyOtp/exchangeCodeForSession
// succeeding, or — for the still-unmigrated coach-invite path, see
// app/auth/fragment-callback/page.tsx — a freshly-issued JWT whose
// `amr` claim itself says "otp", not "password", checked server-side
// via getClaims()). Not client-forgeable: the signature uses a key
// derived from SUPABASE_SERVICE_ROLE_KEY, which never reaches the
// browser. Consumed (deleted) the instant password setup succeeds —
// see app/api/auth/complete-onboarding/route.ts.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export const ONBOARDING_COOKIE_NAME = "kv_onboarding";

// 15 minutes — long enough for a real human to read the "you're
// invited" screen and set a password, short enough that a leaked or
// abandoned cookie is worthless shortly after.
const TTL_SECONDS = 15 * 60;
const INVITE_HANDOFF_TTL_SECONDS = 60 * 60;

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "[onboarding-token] SUPABASE_SERVICE_ROLE_KEY is not configured — cannot sign onboarding tokens.",
    );
  }
  // Derive a dedicated subkey rather than using the service-role key
  // itself as the HMAC key — key separation, and this key never needs
  // to change even if we later derive other subkeys from the same secret.
  return createHmac("sha256", secret).update("kynovant-onboarding-cookie-v1").digest();
}

function b64url(input: Buffer): string {
  return input.toString("base64url");
}

function signPayload(payload: Record<string, unknown>): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", signingKey()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

function verifySignature(token: string): { payloadB64: string; payload: Record<string, unknown> } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const expectedSig = createHmac("sha256", signingKey()).update(payloadB64).digest();
    const actualSig = Buffer.from(sigB64, "base64url");
    if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return { payloadB64, payload };
  } catch {
    return null;
  }
}

// Mints a signed token authorizing `userId` to complete invitation
// onboarding (i.e. render/submit /setup-password) for the next 15
// minutes. Call this ONLY immediately after directly observing a
// successful, Supabase-validated invite-token redemption in the same
// request — never in response to an already-established session
// alone.
export function signOnboardingToken(userId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TTL_SECONDS;
  return signPayload({ uid: userId, iat, exp });
}

// Verifies a token was (a) signed by us, (b) not expired, and (c)
// issued for exactly `expectedUserId` — the currently-authenticated
// user. Returns false on any malformed/missing/mismatched/expired
// input; never throws for caller convenience (callers should redirect
// safely either way, not branch on a distinguishable error).
export function verifyOnboardingToken(
  token: string | undefined | null,
  expectedUserId: string,
): boolean {
  if (!token) return false;
  const signed = verifySignature(token);
  if (!signed) return false;
  const payload = signed.payload as { uid?: unknown; iat?: unknown; exp?: unknown };
  if (
    typeof payload.uid !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= payload.iat
  ) return false;
  if (payload.uid !== expectedUserId) return false;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return false;

  return true;
}

// Signed marker carried only by invitation redirect URLs. It binds the
// callback/fragment handoff to the invited email, so a recovery OTP cannot
// be relabeled with `type=invite` to mint onboarding permission.
export function signInviteHandoffToken(email: string): string {
  const iat = Math.floor(Date.now() / 1000);
  return signPayload({
    purpose: "invite_handoff",
    email: email.trim().toLowerCase(),
    iat,
    exp: iat + INVITE_HANDOFF_TTL_SECONDS,
  });
}

export function verifyInviteHandoffToken(token: string | undefined | null, expectedEmail: string): boolean {
  if (!token) return false;
  const signed = verifySignature(token);
  if (!signed) return false;
  const payload = signed.payload as {
    purpose?: unknown;
    email?: unknown;
    iat?: unknown;
    exp?: unknown;
  };
  if (
    payload.purpose !== "invite_handoff" ||
    typeof payload.email !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= payload.iat ||
    payload.email !== expectedEmail.trim().toLowerCase()
  ) return false;
  return Math.floor(Date.now() / 1000) < payload.exp;
}

// Shared Set-Cookie options so every call site (mint + clear) agrees.
export function onboardingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL_SECONDS,
  };
}

// Options for immediately clearing the cookie (password-set success,
// or a failed verification attempt — never leave a stale token live).
export function clearedOnboardingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
