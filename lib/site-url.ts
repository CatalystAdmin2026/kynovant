// ─────────────────────────────────────────────────────────────
// Kynovant — Canonical Site Origin
//
// The ONLY correct value to build a Supabase Auth redirectTo /
// emailRedirectTo from. Safe to import from both server and
// "use client" code — NEXT_PUBLIC_ vars are inlined at build time.
//
// Root cause this constant fixes (normal password-recovery bug,
// see lib/auth/__tests__/recovery-redirect.test.ts):
//   app/forgot-password/page.tsx used `window.location.origin` to
//   build resetPasswordForEmail's redirectTo. Supabase's redirect-URL
//   allow list (Authentication → URL Configuration → Redirect URLs)
//   has separate literal entries for the bare apex
//   (https://kynovant.com/auth/callback) and the www host
//   (https://www.kynovant.com/auth/callback) — empirically, the bare-
//   apex entry only matches an EXACT redirect_to with no query string,
//   while the www entry tolerates one. redirectTo here always appends
//   `?type=recovery`, so if window.location.origin ever resolved to
//   the bare apex (a stale tab from before Vercel's apex→www redirect
//   existed, a non-Vercel-fronted client, future domain-config drift,
//   etc.), Supabase would silently reject it and fall back to the
//   project's Site URL — discarding both the /auth/callback path and
//   the type=recovery marker, landing the user on the public homepage
//   with an unusable bare ?code=... Using this fixed, server-
//   controlled constant instead of the browser's current origin
//   removes that entire failure mode: the redirectTo Supabase
//   validates is always the same, always-allow-listed value,
//   regardless of which host the visitor's tab happens to be on.
//
// Falls back to the correct value (matching lib/billing/actions.ts,
// app/api/coach-signup/route.ts, app/api/admin/coaches/route.ts, and
// app/api/internal/clients/route.ts's existing identical fallback)
// when NEXT_PUBLIC_SITE_URL is unset — which, as of this fix, it is in
// Vercel Production; setting it explicitly is recommended (see the
// audit report) but not required for this fallback to be correct.
// ─────────────────────────────────────────────────────────────

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.kynovant.com";
