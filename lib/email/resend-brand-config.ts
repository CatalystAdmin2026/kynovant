// ─────────────────────────────────────────────────────────────
// Resend — Brand-Scoped Configuration
//
// SERVER-ONLY — never import from a Client Component.
//
// Catalyst Coaching Elite and Kynovant are two separate businesses
// with two separate Resend accounts, two separate verified sending
// domains, and two separate API keys. Every Resend send in this repo
// must go through exactly one of the two functions below — never read
// process.env.*RESEND* directly at a call site.
//
// HARD SEPARATION, not just convention:
//   - getKynovantResendConfig() reads ONLY the KYNOVANT_RESEND_* env
//     vars. It has no parameter, no hostname/brand switch, and no
//     fallback to any other name — there is no code path by which it
//     can return a Catalyst value.
//   - getCatalystResendConfig() reads ONLY the existing generic
//     RESEND_* env vars (kept as-is — see the note on that function).
//     It has no code path by which it can return a Kynovant value.
//   - Both fail CLOSED: if any of the three required vars for that
//     brand is missing, the function returns null. A caller with a
//     half-configured brand never falls back to guessing, borrowing
//     the other brand's value, or sending from an unverified address —
//     it just doesn't send, exactly like the pre-existing
//     "not configured — skipping" behavior at every call site.
//
// See lib/email/__tests__/resend-brand-config.test.ts for the
// regression tests proving both directions of cross-brand isolation.
// ─────────────────────────────────────────────────────────────

import "server-only";

export interface ResendBrandConfig {
  apiKey: string;
  fromEmail: string;
  adminEmail: string;
}

/**
 * Kynovant's own Resend credential — separate account, separate
 * verified domain (kynovant.com), separate API key. Used by Kynovant's
 * own SaaS-side application-level sends (currently: the coach
 * application admin-notification email in app/api/applications/route.ts).
 *
 * Does NOT back Supabase Auth SMTP — that is configured directly in
 * the Supabase dashboard (Authentication → Emails → SMTP Settings),
 * not through this app's environment variables, and is intentionally
 * left untouched by this module.
 */
export function getKynovantResendConfig(): ResendBrandConfig | null {
  const apiKey = process.env.KYNOVANT_RESEND_API_KEY;
  const fromEmail = process.env.KYNOVANT_RESEND_FROM_EMAIL;
  const adminEmail = process.env.KYNOVANT_RESEND_ADMIN_EMAIL;

  if (!apiKey || !fromEmail || !adminEmail) return null;
  return { apiKey, fromEmail, adminEmail };
}

/**
 * Catalyst Coaching Elite's Resend credential. Deliberately kept on
 * the original generic RESEND_API_KEY / RESEND_FROM_EMAIL /
 * RESEND_ADMIN_EMAIL env var names rather than being renamed to
 * CATALYST_RESEND_* — those names are already live in Vercel
 * Production, already point at Catalyst's own Resend account and
 * verified domain, and Catalyst's send paths (Stripe webhook welcome/
 * admin emails, DocuSign activate-coaching email) already worked
 * correctly before this module existed. Renaming them would be a
 * needless migration for a system that isn't broken — the smallest
 * change that achieves hard separation is adding Kynovant's own names
 * and leaving Catalyst's alone.
 */
export function getCatalystResendConfig(): ResendBrandConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.RESEND_ADMIN_EMAIL;

  if (!apiKey || !fromEmail || !adminEmail) return null;
  return { apiKey, fromEmail, adminEmail };
}
