// ─────────────────────────────────────────────────────────────
// /auth/accept — Accept Invitation button unresponsive — regression suite
//
// P0 production incident: a real client (Fiona Walczynski) reported
// the invite email link worked, /auth/accept loaded, "You're invited
// to Kynovant" / "Accept Invitation" rendered — but tapping the
// button did nothing.
//
// Root cause, proven live in Chrome against staging (not assumed):
// the URL-scrub effect (added to keep token_hash out of the Referer
// header on any later same-origin navigation — a real, separate,
// legitimate concern) calls window.history.replaceState() to strip
// token_hash from the visible URL. Next.js's App Router patches
// history.pushState/replaceState to keep its own router state in
// sync, and that patched call was observed to trigger a re-render of
// this component via useSearchParams() reading the NEW, now-
// token_hash-less URL — nulling the `tokenHash` value the button's
// `disabled={... || !tokenHash || !type}` condition depends on.
// Confirmed via direct DOM inspection: seconds after mount, the
// rendered button carried disabled="". Not Safari-specific — it
// reproduced identically in Chrome; it was simply never exercised by
// the pre-deploy smoke test, which only tested the already-
// authenticated "already-active" branch (never reaches this button).
//
// Fix: capture type/token_hash/overwatch/next from useSearchParams()
// exactly ONCE, via a useState lazy initializer evaluated on this
// component's first render only — still SSR/hydration-safe (unlike
// reading window.location.search directly, which would disagree with
// the server-rendered pass and cause a real hydration mismatch), but
// permanently immune to whatever the router does on later re-renders,
// since React never re-invokes a useState initializer after mount.
//
// This is a source-inspection suite (same style as
// lib/auth/__tests__/onboarding-gate-architecture.test.ts) — the
// actual React hydration/re-render behavior this pins down can't be
// exercised by a Node-based unit test; the live Chrome-against-
// staging reproduction (before) and verification (after) live in this
// task's report, not in an automated suite. What IS exercised here:
// the source no longer contains the pattern that broke, and DOES
// contain the pattern that fixes it, so a future edit that
// reintroduces "read tokenHash from a live/reactive searchParams
// value used after the scrub effect" fails this suite immediately.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const ACCEPT = source("app/auth/accept/page.tsx");

describe("app/auth/accept/page.tsx — token/type/overwatch/next captured once, not read reactively", () => {
  it("captures params via a useState lazy initializer, not as a plain const derived from searchParams.get() on every render", () => {
    // The broken pattern this must NOT contain: `const tokenHash =
    // searchParams.get("token_hash");` as a bare render-time const —
    // that re-derives on every render, including the one triggered by
    // the URL-scrub effect's replaceState call.
    expect(ACCEPT).not.toMatch(/const tokenHash = searchParams\.get\("token_hash"\);/);
    expect(ACCEPT).not.toMatch(/const rawType = searchParams\.get\("type"\);\s*\n\s*const type:/);

    // The fix this MUST contain: a useState initializer that reads
    // searchParams exactly once and destructures the captured value.
    expect(ACCEPT).toMatch(/const \[\{ type, tokenHash, overwatch, next \}\] = useState<AcceptParams>\(\(\) => \{/);
  });

  it("the lazy initializer is the ONLY place searchParams.get(...) is called — never called again after mount", () => {
    const getCalls = ACCEPT.match(/searchParams\.get\(/g) ?? [];
    // Exactly 4: type, token_hash, overwatch, next — all inside the
    // single useState initializer.
    expect(getCalls.length).toBe(4);

    const initializerStart = ACCEPT.indexOf("useState<AcceptParams>(() => {");
    const initializerEnd = ACCEPT.indexOf("});", initializerStart);
    expect(initializerStart).toBeGreaterThan(-1);
    expect(initializerEnd).toBeGreaterThan(initializerStart);

    // Every searchParams.get(...) call site must fall inside that
    // initializer's byte range.
    let searchIndex = 0;
    let count = 0;
    for (;;) {
      const idx = ACCEPT.indexOf("searchParams.get(", searchIndex);
      if (idx === -1) break;
      expect(idx).toBeGreaterThan(initializerStart);
      expect(idx).toBeLessThan(initializerEnd);
      count += 1;
      searchIndex = idx + 1;
    }
    expect(count).toBe(4);
  });

  it("the URL-scrub effect (token_hash leak-prevention) is preserved unchanged — this fix must not remove it", () => {
    expect(ACCEPT).toContain('window.history.replaceState(null, document.title, cleanUrl.toString());');
    expect(ACCEPT).toContain('cleanUrl.searchParams.delete("token_hash");');
  });

  it("the button's disabled condition still gates on tokenHash/type/verifying state — the fix didn't weaken the passive-GET-safe explicit-interaction requirement", () => {
    expect(ACCEPT).toContain('disabled={state === "verifying" || !tokenHash || !type}');
  });

  it("the OTP redemption still only happens inside the click handler, never in a useEffect on mount — no automatic verification", () => {
    // The only call to /api/auth/verify-invite must be inside
    // handleAccept, not inside any useEffect.
    const handleAcceptIndex = ACCEPT.indexOf("async function handleAccept()");
    const fetchIndex = ACCEPT.indexOf('fetch("/api/auth/verify-invite"');
    expect(handleAcceptIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeGreaterThan(handleAcceptIndex);

    // No useEffect in the file calls verify-invite directly.
    const effectBlocks = ACCEPT.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    for (const block of effectBlocks) {
      expect(block).not.toContain("verify-invite");
    }
  });

  it("does not read window.location.search directly for these params — would reintroduce an SSR/hydration mismatch", () => {
    // Real usage only — not the explanatory comment mentioning why not.
    expect(ACCEPT).not.toContain("new URLSearchParams(window.location.search)");
  });
});
