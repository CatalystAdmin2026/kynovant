import KynovantHomeContent from "@/components/kynovant/KynovantHomeContent";

// "/" for any host that isn't kynovant.com — the dormant Catalyst
// Coaching Elite domain (its live content lives at /about, /programs,
// /apply, /enroll/*, etc. — see proxy.ts's CATALYST_ONLY_PREFIXES and
// docs/domain-architecture.md) and any local/preview URL with no
// brand override. Renders the same KynovantHomeContent as
// app/(kynovant)/home/page.tsx (the kynovant.com "/" route) so a raw
// preview link never shows a different, lower-quality homepage.
export default function HomePage() {
  return <KynovantHomeContent />;
}
