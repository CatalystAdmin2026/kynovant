import type { MetadataRoute } from "next";

// P0 FIX: start_url used to be "/" — a real client confirmed in
// production that launching the installed Home Screen icon opened the
// public marketing homepage instead of the Client Portal. Kynovant is
// one shared app for coaches, clients, and admins, so start_url can
// never be a single hardcoded destination (e.g. "/portal" would launch
// every coach's/admin's icon into the wrong app). app/app/route.ts is
// a tiny role-agnostic delegator: it inspects the actual authenticated
// session on every cold launch and sends coaches to /hq, clients to
// /portal, admins to /admin, and signed-out launches to a clean
// /login (see that route's header comment for the full reasoning,
// including why /auth/role-redirect itself isn't reused directly).
// scope stays "/" — deliberately broad, so the whole app (HQ, Portal,
// account, everything) counts as "inside" the installed PWA rather
// than bouncing out to a normal browser tab on internal navigation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable app identity, pinned independently of start_url. Without an
    // explicit id the browser derives identity from start_url — so the
    // earlier start_url change ("/" -> "/app") already moved it once.
    // Pinning it to the current value ("/app") means any FUTURE start_url
    // change will not orphan already-installed instances. Resolved
    // relative to the manifest origin; never fetched — an identity key only.
    id: "/app",
    name: "Kynovant",
    short_name: "Kynovant",
    description:
      "Coaching operations software for managing clients, programs, check-ins, nutrition, and progress context.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#080909",
    theme_color: "#080909",
    categories: ["business", "health", "productivity"],
    icons: [
      {
        src: "/icons/kynovant-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/kynovant-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/kynovant-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
