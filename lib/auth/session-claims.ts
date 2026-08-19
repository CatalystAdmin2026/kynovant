// ─────────────────────────────────────────────────────────────
// Catalyst OS — JWT Claim Predicates
//
// Pure, side-effect-free checks over an already-validated JWT claims
// object (supabase.auth.getClaims() cryptographically verifies the
// JWT before returning claims — this module never re-derives trust,
// it only interprets an already-trusted payload).
//
// Extracted from app/api/auth/confirm-invite-session/route.ts so the
// predicate itself can be exercised directly in tests against REAL
// Supabase-issued claims (see lib/db/__tests__/setup-password-
// activation.test.ts), rather than only indirectly through an HTTP
// round-trip to a running server.
// ─────────────────────────────────────────────────────────────

interface AmrEntry {
  method?: string;
  timestamp?: number;
}

const DEFAULT_FRESHNESS_WINDOW_SECONDS = 120;

// True only if `amr` contains a detailed-format entry (method +
// timestamp — the RFC-8176 bare-string form carries no timestamp and
// can never prove freshness) with method "otp" issued within the last
// `windowSeconds`. Confirmed empirically against a real Supabase
// project (not assumed from docs): invite and recovery OTP redemption
// both report method "otp"; a password login reports method
// "password" — see this repo's P0 activation-gate report for the
// probe that established this.
export function isFreshOtpAmr(
  amr: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  windowSeconds: number = DEFAULT_FRESHNESS_WINDOW_SECONDS,
): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: unknown) => {
    if (typeof entry === "string") return false;
    const e = entry as AmrEntry;
    if (e?.method !== "otp") return false;
    if (typeof e.timestamp !== "number") return false;
    return nowSeconds - e.timestamp <= windowSeconds && nowSeconds - e.timestamp >= 0;
  });
}
