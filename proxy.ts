// ─────────────────────────────────────────────────────────────
// Catalyst OS — Proxy (Next.js 16 replacement for middleware)
//
// Two responsibilities, kept deliberately separate:
//
//   1. Domain-aware routing — kynovant.com serves only Kynovant SaaS
//      routes, catalystcoachingelite.com serves only the (dormant)
//      Catalyst Coaching Elite personal-coaching routes. Cheap
//      hostname/pathname string checks only — no Supabase call, so
//      this runs on every page view without adding latency to
//      anonymous marketing traffic. See docs/domain-architecture.md
//      for the full route ownership map and rationale.
//
//   2. Auth session refresh + protected-path enforcement (unchanged
//      from before domain routing was added) — scoped to only the
//      paths where it's relevant, not broadened just because the
//      matcher below now covers more routes for reason #1.
//
// Local dev / Vercel preview deployments (any hostname that isn't one
// of the two production domains) get NO domain gating by default —
// every route is reachable, exactly as before this file changed. Add
// ?__brand=kynovant or ?__brand=catalyst to preview either domain's
// routing behavior without needing real DNS.
//
// IMPORTANT: Do not add any logic between createServerClient and
// supabase.auth.getUser(). The cookie mutation in setAll must happen
// immediately after client creation or sessions break.
//
// Routes NOT intercepted by this proxy at all (excluded by the
// matcher below):
//   - /api/*             — webhooks and internal routes never carry a
//                           browser session and must never be
//                           domain-gated (Stripe/DocuSign/GAS post to
//                           whichever domain they're registered
//                           against, independent of a visitor's host)
//   - Static assets       — Next.js static serving
// ─────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hostBrand, type Brand } from "@/lib/domain-routing";
import { SITE_URL } from "@/lib/site-url";

// ─────────────────────────────────────────────────────────────
// DOMAIN CLASSIFICATION
//
// Hostname → brand classification itself lives in lib/domain-routing.ts
// (shared with app/api/stripe/webhook/route.ts) — this file only adds
// the page-routing-specific pieces: the ?__brand= local/preview
// override and the URL constants used for cross-brand redirects.
// ─────────────────────────────────────────────────────────────

// Was "https://kynovant.com" (bare apex, no www) — inconsistent with
// every other NEXT_PUBLIC_SITE_URL fallback in the codebase (lib/site-
// url.ts, lib/billing/actions.ts, and three app/api routes), and, since
// NEXT_PUBLIC_SITE_URL is unset in Vercel Production, this fallback was
// the live value in use. See lib/site-url.ts's header comment for the
// concrete Supabase redirect-URL allow-list bug this class of bare-
// apex-vs-www mismatch causes.
const KYNOVANT_URL = SITE_URL;
const CATALYST_URL = process.env.NEXT_PUBLIC_CATALYST_URL ?? "https://catalystcoachingelite.com";

// Kept Performance (catalystcoachingelite.com domain, unchanged until
// the keptperformance.com cutover — see docs/domain-architecture.md) —
// the personal-coaching business. "/" is intentionally NOT listed
// here — app/(site)/page.tsx already IS the correct homepage for this
// domain with no redirect needed (unlike Kynovant's "/", which still
// needs an explicit rewrite to /home for route-group reasons).
const CATALYST_ONLY_PREFIXES = [
  "/about",
  "/programs",
  "/apply",
  "/enroll",
  "/onboarding",
  "/onboarding-complete",
  "/executive-onboarding",
  "/executive-performance-confirmed",
  "/payment-confirmed",
  "/thank-you",
];

// Kynovant SaaS — software marketing, coach auth, HQ, client portal.
const KYNOVANT_ONLY_PREFIXES = [
  "/home",
  "/for-coaches",
  "/coach-apply",
  "/start-trial",
  "/features",
  "/pricing",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/setup-password",
  "/account-status",
  "/auth",
  "/hq",
  "/portal",
  "/account",
  "/admin",
  "/overwatch",
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Resolves which brand's routing rules apply. Unrecognized hosts
// (localhost, *.vercel.app previews) get no gating by default, with
// an explicit opt-in override for local/preview testing.
function resolveBrand(request: NextRequest): Brand {
  const fromHost = hostBrand(request.nextUrl.hostname);
  if (fromHost) return fromHost;

  const hostHeader = request.headers.get("host");
  const fromHostHeader = hostHeader ? hostBrand(hostHeader) : null;
  if (fromHostHeader) return fromHostHeader;

  const override = request.nextUrl.searchParams.get("__brand");
  if (override === "kynovant" || override === "catalyst") return override;

  return null;
}

// ─────────────────────────────────────────────────────────────
// AUTH — unchanged scope from before domain routing existed
// ─────────────────────────────────────────────────────────────

// /account-status added here alongside /portal, /account, /hq, /admin:
// it's an authenticated-only page (requireAuthenticatedPage() in
// lib/auth/guards.ts) that is now a core, high-traffic step in the
// self-service coach signup funnel (every new coach lands here right
// after setup-password to start their trial) — not just an edge case
// reached by admin-invited coaches. Listing it here gets it the same
// token-refresh-before-render treatment as every other protected path,
// and the pre-login redirect below, instead of relying solely on the
// page's own guard.
const PROTECTED_PATHS = ["/portal", "/account", "/account-status", "/hq", "/admin", "/overwatch"];
const AUTH_RELEVANT_PATHS = [...PROTECTED_PATHS, "/login", "/auth"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const brand = resolveBrand(request);

  // ── 1. Domain-aware routing ──
  if (brand === "kynovant") {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/home", request.url));
    }
    if (matchesPrefix(pathname, CATALYST_ONLY_PREFIXES)) {
      const target = new URL(pathname + request.nextUrl.search, CATALYST_URL);
      return NextResponse.redirect(target, 308);
    }
  } else if (brand === "catalyst") {
    // "/" is intentionally NOT redirected — app/(site)/page.tsx is now
    // a real Kept Performance homepage (see that file's header
    // comment), not a stand-in. Previously this redirected to /about
    // because "/" only ever rendered Kynovant's own homepage content
    // as a shared fallback; that's no longer true.
    if (matchesPrefix(pathname, KYNOVANT_ONLY_PREFIXES)) {
      const target = new URL(pathname + request.nextUrl.search, KYNOVANT_URL);
      return NextResponse.redirect(target, 308);
    }
  }

  // ── 2. Auth session refresh + protected-path enforcement ──
  // Only runs for paths where it's actually relevant — same scope as
  // before domain routing was added, despite the broader matcher.
  if (!matchesPrefix(pathname, AUTH_RELEVANT_PATHS)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write updated cookies back to both the request and the response.
          // Both mutations are required: request for downstream middleware,
          // response so the browser receives the refreshed token.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Validate the session JWT with Supabase Auth.
  // This also triggers cookie refresh if the access token has expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOverwatchLogin = pathname === "/overwatch/login";
  const isProtected = matchesPrefix(pathname, PROTECTED_PATHS) && !isOverwatchLogin;

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = pathname === "/overwatch" || pathname.startsWith("/overwatch/")
      ? "/overwatch/login"
      : "/login";
    // Preserve the intended destination for post-login redirect.
    // Validated against an allowlist in the auth callback.
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Always return supabaseResponse — it carries the refreshed auth cookies.
  // Returning a plain NextResponse.next() here would drop the token refresh.
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Everything except API routes, Next.js internals, and static
    // files — domain routing (cheap) needs to see every page request;
    // the auth logic inside proxy() further narrows itself to
    // AUTH_RELEVANT_PATHS so this broader match doesn't add Supabase
    // overhead to marketing pages.
    "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$).*)",
  ],
};
