/* ─────────────────────────────────────────────────────────────
 * Kynovant — Service Worker (V1: INFRASTRUCTURE, NOT OFFLINE MODE)
 *
 * This worker deliberately does NOTHING to application network
 * traffic. Its only jobs are:
 *   1. establish a safe, production-grade service-worker lifecycle;
 *   2. reserve the browser infrastructure a future Web Push slice
 *      needs (Phase B — see docs/service-worker.md).
 *
 * HARD INVARIANTS (enforced by
 * lib/pwa/__tests__/service-worker-source.test.ts):
 *
 *   - NO network interception. There is no fetch-event listener, so
 *     this worker CANNOT intercept, cache, or serve stale ANY
 *     request — authenticated or not: Portal/HQ HTML, RSC/Flight
 *     payloads, Server Actions, API / Supabase / Stripe responses,
 *     messages, check-ins, workouts, programs, nutrition, progress
 *     photos, JS / CSS / fonts / images / icons / manifest. None of
 *     it is ever touched here. Even resources that would be safe to
 *     cache are intentionally left alone in V1.
 *
 *   - NO Cache Storage. NO IndexedDB. NO persistence. NO cookies. NO
 *     auth or token access.
 *
 *   - Does NOT force-activate (no waiting-phase skip) and does NOT
 *     claim uncontrolled clients. A newly installed worker waits for
 *     every client controlled by a previous worker to close before it
 *     activates. That is intentional: an update can never take over a
 *     live workout or check-in mid-session. There is no
 *     controllerchange reload and no "update available" UX.
 *
 *   - NO push or notificationclick listeners yet. Web Push is a
 *     separate, independently reviewed slice.
 *
 * VERSIONING: stable /sw.js URL + this explicit constant. Bump it
 * ONLY when the worker's behavior intentionally changes — a byte
 * change here is what makes browsers pick up a new worker. Procedure:
 * docs/service-worker.md.
 *
 * ROLLBACK: NOT "delete /sw.js" — a 404 leaves existing clients on
 * their last installed worker forever. The emergency path is the
 * tombstone in public/sw-kill.js, whose body replaces THIS file at
 * THIS same /sw.js URL. Procedure: docs/service-worker.md.
 * ───────────────────────────────────────────────────────────── */

const SW_VERSION = "1";

self.addEventListener("install", () => {
  // No event.waitUntil(): nothing to prepare. The worker enters the
  // waiting phase and activates only once all previously-controlled
  // clients have closed (browser default — deliberately not shortcut).
  console.info("[kynovant-sw] install", SW_VERSION);
});

self.addEventListener("activate", () => {
  // No client-claim: the page that registered this worker stays
  // uncontrolled until its next navigation. Harmless in V1 (nothing is
  // intercepted) and the correct default for the future push slice.
  console.info("[kynovant-sw] activate", SW_VERSION);
});
