# Kynovant Service Worker — V1 (Foundation)

**Status:** implemented (this slice). Not yet verified on a real browser /
preview / production — see "Acceptance plan" below.

## What this is — and is not

**V1 is INFRASTRUCTURE, not offline mode.**

The service worker (`public/sw.js`) exists only to:

1. establish a safe, production-grade service-worker **lifecycle** on the
   Kynovant production origin;
2. **reserve the browser infrastructure** a future Web Push slice (Phase B)
   needs — a stable registration at a stable URL with root scope.

It does **not**, and in V1 must **never**:

- intercept any request (there is **no `fetch` event listener**);
- read or write **Cache Storage**, IndexedDB, cookies, or any storage;
- provide offline support, an app shell, precaching, runtime caching,
  stale-while-revalidate, or a navigation fallback;
- cache **anything** — not Portal/HQ HTML, not `/account` or `/login`, not
  marketing HTML, not RSC/Flight payloads, not Server Actions, not
  API/Supabase/Stripe responses, not messages/check-ins/workouts/programs/
  nutrition/progress-photos, not JS/CSS/fonts/images/icons/manifest. Even
  resources that would be technically safe to cache are intentionally left
  alone.

Kynovant is an authenticated SaaS with dynamic, sometimes sensitive
client/coach data. A caching service worker on this origin is a liability
(stale programs, hidden program changes, cross-user cache reads on a shared
device, authenticated responses surviving logout). V1 makes those failure
modes **impossible by construction** — no `fetch` handler, no `caches`.

## Release invariant (do not break)

`public/sw.js` must remain **structurally incapable** of intercepting
requests or touching Cache Storage. Enforced by
`lib/pwa/__tests__/service-worker-source.test.ts`:

- no `self.addEventListener("fetch", …)` / `onfetch`;
- no `caches.open/match/keys/delete/has(…)`;
- no `indexedDB`;
- no `skipWaiting()` in the real worker;
- no `clients.claim()` in the real worker;
- no `push` / `notificationclick` listener (that is Phase B).

If authenticated (or any) caching is **ever** proposed later, it requires a
**separate security review** — Cache Storage is origin-scoped, is shared
across users of the same browser profile, and **survives logout**. Any such
design must at minimum: never cache a `Cookie`/`Authorization`-bearing or
`Vary: Cookie` response; purge all caches in `LogoutButton` /
`HQSignOutButton`; and consider session-partitioned cache names. **None of
that is implemented now, and V1 needs no logout integration precisely
because it stores nothing.**

## Files

| File | Role |
|---|---|
| `public/sw.js` | The real V1 worker. Stable URL `/sw.js`. `install` + `activate` listeners only. `SW_VERSION` constant. |
| `public/sw-kill.js` | **Emergency tombstone.** Never registered. Its *body* replaces `public/sw.js` during an incident (same URL). |
| `lib/pwa/service-worker-registration.ts` | Pure host/environment decision (`register` / `unregister` / `noop`) + `SW_URL`, `SW_SCOPE`, `SW_KILL`. |
| `components/pwa/ServiceWorkerBoot.tsx` | `"use client"`, mounted once in `app/layout.tsx` as a sibling of `PwaInstallBoot` (never merged). Executes the decision from an effect, best-effort. |
| `next.config.ts` | `headers()` for `/sw.js` (+ `/sw-kill.js`): `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: text/javascript; charset=utf-8`, `Service-Worker-Allowed: /`. |

The accepted install-state architecture (`lib/pwa/install-store.ts`,
`lib/pwa/use-install-state.ts`, `components/pwa/PwaInstallBoot.tsx`,
`components/pwa/InstallKynovant.tsx`) is **untouched** by this slice.

## URL and scope

- **URL: `/sw.js`** — a static file in `public/`, served by the CDN,
  bypasses `proxy.ts` (its matcher excludes `*.js`). **Never** hash or
  version the filename: a changing URL makes every deploy look like a new
  worker, and it breaks the same-URL tombstone rollback.
- **Scope: `/`** — broad **control** (needed so a future `notificationclick`
  can navigate to `/portal`, `/hq`, `/account`, `/app` from one
  registration). Broad control ≠ broad caching: V1 caches nothing.

## Registration rules

Decided by `resolveServiceWorkerRegistrationDecision(env)` (pure, unit-tested
in `lib/pwa/__tests__/service-worker-registration.test.ts`). `NODE_ENV` is
**not** consulted — Vercel Preview and Production both build with
`NODE_ENV=production`.

| Environment | Decision |
|---|---|
| Kynovant production host (`kynovant.com`, `www.kynovant.com` — per `lib/domain-routing.ts`), secure, `serviceWorker` supported, `SW_KILL=false` | **register** |
| Kept / Catalyst host (`keptperformance.com`, `catalystcoachingelite.com`, …) | **noop** — even with `?__sw=1` |
| `localhost` / `127.0.0.1` / any loopback | **noop** — **even with `?__sw=1`** |
| `*.vercel.app` Preview, no `?__sw=1` | **noop** |
| `*.vercel.app` Preview **with `?__sw=1`**, secure, supported | **register** (the only opt-in) |
| Unsupported browser (`serviceWorker` not in `navigator`) | **noop** |
| Insecure context | **noop** |
| `SW_KILL=true` | **unregister** — host-independent (cleanup must work from any origin a stale client landed on); wins over every other condition |

Registration failure is swallowed — `console.warn` in dev only. It never
throws into React, never blocks rendering, never changes the install UX.
No production telemetry is added in this slice.

## Lifecycle semantics (deliberate)

`INSTALL → WAITING → ACTIVATE → CONTROL` using **browser defaults**.

- **No `skipWaiting()`** in the real worker. A new worker enters `waiting`
  and activates only once every client controlled by the previous worker
  has closed. This is intentional: an update can **never** take over a live
  workout or check-in mid-session.
- **No `clients.claim()`**. The page that registered the worker stays
  uncontrolled until its next navigation. Harmless in V1 (nothing is
  intercepted) and the right default for Phase B.
- **No `controllerchange` reload. No "update available" toast.** There is
  nothing to update.

The **tombstone** is the one place `skipWaiting()` is used — emergency
removal is intentionally urgent.

A routine Vercel deploy does **not** trigger a worker update: `/sw.js` is
byte-identical across deploys unless we change it. The worker updates only
on a `SW_VERSION` bump or a tombstone swap.

## SW_VERSION bump procedure

`SW_VERSION` in `public/sw.js` is a plain string constant. **Bump it only
when the worker's behavior intentionally changes** (e.g. Phase B adds a
`push` handler). A byte change to `public/sw.js` is what makes browsers
fetch and evaluate the new worker (on the next navigation, or within ~24h).
There is no build-time SHA templating and no codegen — keep it that way.

## Emergency rollback — the ONLY correct procedure

> **NEVER remove a deployed service worker by deleting `/sw.js`.** A 404 on
> the worker URL is a *soft* failure: the browser keeps the client's last
> successfully installed worker **indefinitely**. Renaming or changing the
> URL is equally wrong. You must serve a real, self-destructing worker from
> the **same `/sw.js` URL**.

**Procedure:**

1. **Confirm** the SW is the cause (DevTools → Application → Service Workers
   on `www.kynovant.com`; `chrome://serviceworker-internals`).
2. **Replace the body of `public/sw.js` with the body of
   `public/sw-kill.js`.** Keep the filename. (Do not delete `public/sw.js`.)
3. **Also set `SW_KILL = true`** in `lib/pwa/service-worker-registration.ts`
   — the secondary page-JS kill path (`ServiceWorkerBoot` will call
   `getRegistrations().unregister()` + `caches.delete` on any client that
   still loads app JS).
4. Commit on a hotfix branch → PR → merge → Vercel deploys to
   `www.kynovant.com`.
5. On its next update check (every navigation, or ≤24h) each client fetches
   the tombstone from `/sw.js` and it self-destructs:
   `install` → `skipWaiting()`; `activate` → delete all Cache Storage →
   `registration.unregister()` → `clients.matchAll({type:"window"})` and
   `client.navigate(client.url)` **once** per client (bounded, no loop) so
   the dead controller is shed.
6. **Verify** on production: DevTools → Application → Service Workers shows
   the tombstone activate then go redundant; console
   `navigator.serviceWorker.getRegistrations()` → `[]` after one reload;
   `caches.keys()` → `[]`. Spot-check on a real Android device.
7. **Keep the tombstone deployed for ≥30 days** (covers the 24h update-check
   window for infrequent visitors, with margin) before considering any
   re-introduction.
8. If Phase B push had shipped: the tombstone's `unregister()` invalidates
   every push subscription; the Phase B send path must treat `410 Gone` /
   `404` as "prune this subscription".

If the tombstone deploy itself fails: use Vercel's deployment instant
rollback to re-serve the previous `/sw.js`, then retry the tombstone.

## Future Web Push hand-off (Phase B — NOT in this slice)

V1 leaves a clean path:

- **stable registration + stable `/sw.js` + scope `/`** — a push subscription
  is bound to the `ServiceWorkerRegistration` and survives ordinary
  `SW_VERSION` bumps (only `unregister()` drops it);
- **no dependency on caching** — push and fetch handling are orthogonal;
- Phase B adds `self.addEventListener("push", …)` and
  `self.addEventListener("notificationclick", …)` to `public/sw.js` (bump
  `SW_VERSION`), a permission/`pushManager.subscribe` flow, a
  subscription store tied to the authenticated user, and — importantly —
  **logout should `subscription.unsubscribe()` + delete the server row**
  so a shared device stops delivering the previous user's notifications;
- consider adding `clients.claim()` **then** (with the push handlers) so a
  freshly-registered worker can accept a subscription without a reload.
- VAPID keys, subscription tables, and delivery are **all Phase B** — not
  reserved or stubbed here.

## Acceptance plan (preview + real browser)

Node/Vitest proves the decision logic and the file structure only. The
following require an **isolated `*.vercel.app` preview with `?__sw=1`** and
real devices — do **not** register on `localhost` to shortcut them, and do
**not** deploy a preview without authorization:

1. exactly one registration; scope `/`;
2. worker reaches `installed` → `activated`;
3. **Cache Storage stays empty** while browsing every reachable route;
4. **no request is SW-intercepted** (DevTools Network — no `(ServiceWorker)`
   initiator/size);
5. PWA install flow unchanged (Android Chrome + Samsung Internet; desktop
   Chromium native prompt; iOS Safari Add-to-Home-Screen);
6. `/app` cold-launch role-redirect unchanged;
7. the **plain** preview URL (no `?__sw=1`) does **not** register;
8. **tombstone kill-switch drill**: push a second preview with the tombstone
   body + `SW_KILL=true`; confirm `getRegistrations()` → `[]` and
   `caches.keys()` → `[]` after one reload.

Only after that, and after independent acceptance, does an authorized
production rollout follow, with the same DevTools verification on
`www.kynovant.com` and 24–48h monitoring.
