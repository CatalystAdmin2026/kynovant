// ─────────────────────────────────────────────────────────────
// Catalyst OS — Domain / Brand Classification
//
// Pure hostname → brand classification, extracted from proxy.ts so it
// can be reused anywhere a route needs to know which business a
// request belongs to before doing anything business-specific — most
// importantly app/api/stripe/webhook/route.ts, which proxy.ts's own
// matcher deliberately excludes (see proxy.ts's header comment: /api/*
// routes carry no browser session and must self-classify, since a
// webhook POST is never gated the way a page view is).
//
// See docs/domain-architecture.md for the full route-ownership map.
// ─────────────────────────────────────────────────────────────

export type Brand = "kynovant" | "catalyst" | null;

const KYNOVANT_HOSTS = new Set(["kynovant.com", "www.kynovant.com"]);

// "catalyst" is the internal/routing name for the Kept Performance
// public coaching business (unchanged — renaming this internal brand
// key would touch every call site for zero public benefit; see
// docs/domain-architecture.md). catalystcoachingelite.com remains the
// live, attached-in-Vercel domain today. keptperformance.com/www are
// added here in advance so the code classifies that domain correctly
// the moment it's actually attached to this Vercel project — adding
// the hostname here does NOT attach the domain or touch DNS itself
// (that's a manual Vercel/DNS step, deliberately not done by this
// change — see docs/domain-architecture.md's cutover sequence).
const CATALYST_HOSTS = new Set([
  "catalystcoachingelite.com",
  "www.catalystcoachingelite.com",
  "keptperformance.com",
  "www.keptperformance.com",
]);

/** Classifies a request hostname. Unrecognized hosts (localhost, preview
 *  deployments) return null — callers decide their own fallback. */
export function hostBrand(hostname: string): Brand {
  const host = hostname.toLowerCase().split(":")[0];
  if (KYNOVANT_HOSTS.has(host)) return "kynovant";
  if (CATALYST_HOSTS.has(host)) return "catalyst";
  return null;
}

// ─────────────────────────────────────────────────────────────
// STRIPE WEBHOOK SIGNING-SECRET SELECTION — Kept vs legacy Catalyst
//
// Both keptperformance.com and catalystcoachingelite.com classify as
// the single "catalyst" brand above (same business, same page-routing
// rules, same Stripe API key/account) — that's correct and unchanged
// for everything except one thing: Stripe generates a SEPARATE
// signing secret per registered webhook endpoint, and both domains
// now have their own endpoint registered (Kept/Catalyst Stripe
// parallel-verification pass — see docs/domain-architecture.md).
// app/api/stripe/webhook/route.ts needs this finer split ONLY to pick
// the correct signing secret. Nothing else (page routing, redirects,
// brand dispatch) should ever use this — use hostBrand() above for
// everything else.
// ─────────────────────────────────────────────────────────────

export type CatalystStripeWebhookSecretSource = "kept" | "catalyst-legacy" | null;

const KEPT_STRIPE_WEBHOOK_HOSTS = new Set(["keptperformance.com", "www.keptperformance.com"]);
const CATALYST_LEGACY_STRIPE_WEBHOOK_HOSTS = new Set([
  "catalystcoachingelite.com",
  "www.catalystcoachingelite.com",
]);

/** Classifies a request hostname for Stripe webhook SIGNING SECRET
 *  selection only. Returns null for anything that isn't exactly one
 *  of the four known Catalyst-brand hostnames (including localhost/
 *  preview) — callers MUST fail closed on null, never guess or fall
 *  back to the other secret. */
export function catalystStripeWebhookSecretSource(
  hostname: string,
): CatalystStripeWebhookSecretSource {
  const host = hostname.toLowerCase().split(":")[0];
  if (KEPT_STRIPE_WEBHOOK_HOSTS.has(host)) return "kept";
  if (CATALYST_LEGACY_STRIPE_WEBHOOK_HOSTS.has(host)) return "catalyst-legacy";
  return null;
}
