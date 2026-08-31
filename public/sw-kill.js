/* ─────────────────────────────────────────────────────────────
 * Kynovant — Service Worker TOMBSTONE (emergency removal)
 *
 * ⚠  DO NOT REGISTER THIS FILE DIRECTLY.
 *    Nothing in the app registers /sw-kill.js, and nothing ever must.
 *    There is exactly one registered worker URL: /sw.js.
 *
 * PURPOSE: a tested, known-good body that — DURING AN INCIDENT —
 * replaces the body of public/sw.js. The browser then receives this
 * tombstone from the already-registered /sw.js URL on its next update
 * check (every navigation, or within ~24h), and it self-destructs:
 *
 *   install   -> skip the waiting phase (removal is urgent — the one
 *                place we intentionally do this, unlike the real V1
 *                worker)
 *   activate  -> delete every Cache Storage entry (defensive; V1 never
 *                created any)
 *             -> unregister this registration
 *             -> navigate each controlled window client ONCE so it
 *                sheds the now-dead controller. Bounded: one navigate
 *                per client via Promise.allSettled, no re-arm, no loop,
 *                and a single client.navigate() rejection can never
 *                become an unhandled rejection or block the others.
 *
 * Rollback is NOT "delete /sw.js": a 404 on the worker URL leaves
 * existing clients on their last successfully installed worker
 * indefinitely. Always use this same-URL body swap. Full procedure and
 * verification steps: docs/service-worker.md.
 * ───────────────────────────────────────────────────────────── */

const SW_VERSION = "kill-1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = self.caches ? await caches.keys().catch(() => []) : [];
      await Promise.all(cacheKeys.map((key) => caches.delete(key).catch(() => false)));

      await self.registration.unregister().catch(() => false);

      const windowClients = await self.clients
        .matchAll({ type: "window" })
        .catch(() => []);
      // One navigate per client — sheds the dead controller. allSettled
      // so a single client.navigate() rejection is contained locally,
      // never becomes an unhandled rejection, and never prevents the
      // other clients from being navigated. No retry, no timer, no loop.
      await Promise.allSettled(
        windowClients.map((client) => client.navigate(client.url)),
      );

      console.info("[kynovant-sw] tombstone activated", SW_VERSION);
    })(),
  );
});
