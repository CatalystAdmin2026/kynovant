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
 *                per client, no re-arm, no loop.
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
      for (const client of windowClients) {
        // One navigate per client — sheds the dead controller. No loop.
        client.navigate(client.url);
      }

      console.info("[kynovant-sw] tombstone activated", SW_VERSION);
    })(),
  );
});
