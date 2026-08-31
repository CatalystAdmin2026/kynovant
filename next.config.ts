import type { NextConfig } from "next";

// Response headers for the service-worker scripts served from public/.
// Scope of this rule is deliberately just these two files — global
// security-header hardening (CSP / HSTS / frame policy / Referrer-Policy
// / Permissions-Policy) is a separate, independently reviewed slice.
//
//   Cache-Control: the worker script must always be revalidated so an
//     update — or the emergency tombstone body swap (see
//     docs/service-worker.md) — is never served stale by the browser or
//     the CDN. Browsers already cap the SW script's cache at 24h, but we
//     make it explicit and immediate.
//   Content-Type: pin the JS MIME so registration can never fail on a
//     sniffed/incorrect type.
//   Service-Worker-Allowed: "/" — not strictly required for a
//     root-level /sw.js, but future-proofs a possible move and documents
//     the intended scope.
const SW_SCRIPT_HEADERS = [
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Content-Type", value: "text/javascript; charset=utf-8" },
  { key: "Service-Worker-Allowed", value: "/" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/sw.js", headers: SW_SCRIPT_HEADERS },
      // /sw-kill.js is NOT a registered worker — it is the tombstone
      // body kept in-repo. Same safe script-serving headers so that, if
      // it is ever fetched directly, it behaves predictably.
      { source: "/sw-kill.js", headers: SW_SCRIPT_HEADERS },
    ];
  },
};

export default nextConfig;
