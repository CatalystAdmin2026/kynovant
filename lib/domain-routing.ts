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
const CATALYST_HOSTS = new Set(["catalystcoachingelite.com", "www.catalystcoachingelite.com"]);

/** Classifies a request hostname. Unrecognized hosts (localhost, preview
 *  deployments) return null — callers decide their own fallback. */
export function hostBrand(hostname: string): Brand {
  const host = hostname.toLowerCase();
  if (KYNOVANT_HOSTS.has(host)) return "kynovant";
  if (CATALYST_HOSTS.has(host)) return "catalyst";
  return null;
}
