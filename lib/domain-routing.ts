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
