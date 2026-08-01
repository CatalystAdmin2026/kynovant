# Kynovant — Founding Coach Launch Security Audit

**Scope:** Read-only production security review ahead of onboarding the first 10 paying coaches.
**Method:** Static review of the current `audit/founding-coach-security` branch (auth guards, API routes, webhooks, schema, migrations, client bundles). No code was modified.
**Assumption stated up front:** this review treats "the first 10 paying coaches" literally — i.e. Kynovant is moving from a single-coach (Jermaine Jones) operation to a platform with multiple independent coach accounts, each with their own client roster. Several findings below (tenant isolation, admin access) are only "blocking" under that assumption. If the ten "founding coaches" are actually paying **clients** of a single coach, downgrade findings #1–#3 to informational/roadmap items and re-read the rest of this doc under a single-tenant model.

---

## Summary table

| # | Finding | Severity | Blocks paid pilot? |
|---|---|---|---|
| 1 | No coach-to-coach tenant isolation in HQ data layer | **Critical** | **Yes** |
| 2 | Hardcoded admin password shipped in client JS bundle | **High** | **Yes** |
| 3 | `admin` vs `coach` role distinction is unenforced anywhere | **High** | **Yes** |
| 4 | DocuSign webhook fails **open** (accepts unsigned requests) if secret is unset | **High** | Yes, until verified |
| 5 | Stripe webhook has no idempotency — duplicate emails/workspaces on retry | Medium | No, but fix before scale |
| 6 | No entitlement enforcement tied to Stripe billing status | Medium-High | Yes, for billing integrity |
| 7 | Drizzle migration ledger out of sync with 9 applied SQL files | Medium | Yes, verify first |
| 8 | Old-brand Calendly booking links still live | Low-Medium | No, but fix before launch |
| 9 | No error tracking/alerting — console-only logging | Medium | No |
| 10 | Non-timing-safe secret comparison on internal health route | Low | No |
| 11 | `env.local.example` missing several vars actually used in prod | Low | No, but causes #4/#6-adjacent misconfig |

---

## 1. No coach-to-coach tenant isolation (CRITICAL)

**Evidence:**
- `lib/auth/guards.ts:117-135` — `requireCoachOrAdmin()` checks only `role === "coach" || role === "admin"`. It never checks which clients or program templates the requesting coach owns.
- `lib/db/client-program-service.ts:423-445` (`listActiveClients`) — returns every user with `role = "client"` and status `invited`/`active`, platform-wide, with no `coachId` filter. Used by `app/api/internal/clients/route.ts` (the HQ "Assign" panel).
- `lib/db/client-program-service.ts:141` (`assignProgram`) and `:375` (`listAllActiveAssignments`) — no `coachId` parameter anywhere in the signature or query. Used by `app/api/internal/client-programs/route.ts`.
- `lib/db/program-builder-service.ts:105` (`listProgramTemplates`) and `:165` (`createProgramTemplate`) — same pattern, used by `app/api/internal/programs/route.ts`.
- Meanwhile the schema **does** model coach ownership: `lib/db/schema.ts:250` (`coachingEnrollments.coachId`, `onDelete: "restrict"`), so the data to scope by exists — it's just never used in the query layer above.

**Exploit / failure scenario:** Coach B logs in with a normal, legitimately-issued coach account (no privilege escalation needed). The HQ "Assign Program" panel calls `GET /api/internal/clients`, which returns every client on the platform, including Coach A's clients. Coach B can call `POST /api/internal/client-programs` with any of Coach A's `clientId`s and assign, overwrite, or clone a program onto Coach A's client. Coach B can also read and edit every program template created by every other coach via `GET/POST /api/internal/programs`. This is not an attack requiring cleverness — it is the default, intended behavior of the current queries; a curious or malicious coach discovers it by simply browsing the Assign panel.

**Fix:** Add `coachId` scoping (backed by `coachingEnrollments.coachId` or a client→coach ownership table) to every internal-API read/write that touches client or program-template data, and enforce it server-side in the service layer (not just the UI). Extend `requireCoachOrAdmin()` (or a new `requireOwnsClient(clientId)` guard, mirroring the existing `authorizeWorkoutSession` pattern in `lib/auth/guards.ts:182-202`) to reject cross-coach access with a 404, consistent with the object-level-authorization convention already used elsewhere in that file.

---

## 2. Hardcoded admin password shipped in client JS bundle (HIGH)

**Evidence:** `components/AdminGate.tsx:13-14`:
```ts
const SESSION_KEY    = "catalyst_admin_access";
const ADMIN_PASSWORD = "Catalyst2026!";
```
The file's own top-of-file comment (lines 3-9) already flags this as "security-by-obscurity only." It wraps every page under `/admin` (`app/admin/page.tsx:1825`, `app/admin/programs/page.tsx:103`, `app/admin/blueprints/page.tsx:101`, `app/admin/programs/[id]/page.tsx:55`, `app/admin/blueprints/[id]/page.tsx:47`).

**Exploit / failure scenario:** `/admin/layout.tsx` does run a real server-side check (`requireCoachOrAdminPage`) before the page renders, so an anonymous internet user cannot reach the page itself. But the password string is compiled into a **public, unauthenticated static JS chunk** under `/_next/static/chunks/*.js` — Next.js serves client-component bundles as static assets regardless of route auth. Anyone who has ever been issued a coach account (all 10 founding coaches will be) can open browser devtools, find the chunk, and read `Catalyst2026!` in cleartext. Combined with finding #3, that single shared password is effectively the master key to the full business Command Center (all leads, all coaches' pipeline, Stripe/DocuSign config panel) for every coach on the platform, and it cannot be rotated per-user or revoked for one coach without changing it for all ten.

**Fix:** Delete `AdminGate` entirely — the real access control is already `requireCoachOrAdminPage()` in `app/admin/layout.tsx`. If a second factor is genuinely wanted for `/admin`, it needs to be a server-verified check (signed cookie, TOTP, etc.), never a client-side string comparison.

---

## 3. `admin` role is never actually enforced (HIGH)

**Evidence:** `lib/auth/guards.ts:137-155` defines `requireAdmin()`, restricted to `role === "admin"`. A repo-wide search shows it is **never imported or called anywhere** outside its own definition. Every route and page that mentions authorization instead uses `requireCoachOrAdmin()` / `requireCoachOrAdminPage()`, including `app/admin/layout.tsx:4` — the layout for the business-wide Command Center — which uses `requireCoachOrAdminPage()`, not `requireAdmin()`.

**Exploit / failure scenario:** The `users.role` enum (`lib/db/schema.ts:38-42`) distinguishes `client` / `coach` / `admin`, implying `admin` is meant to be a smaller, more trusted set than `coach`. In practice, granting anyone `role = "coach"` — which is exactly what happens for each of the 10 founding coaches — gives them the same access as `admin`, including `/admin` itself (pipeline, Stripe config display, all-coach lead data per finding #1). There is no route in the app today that a plain `coach` cannot reach that an `admin` can.

**Fix:** Either (a) change `app/admin/layout.tsx` to call `requireAdmin()` so only true admins reach the Command Center, or (b) if every coach is intended to have admin-equivalent access, remove the unused `admin` role/guard to avoid the false impression of a privilege boundary that doesn't exist. Decide intentionally — right now it's an accident of an unused guard.

---

## 4. DocuSign webhook fails open when secret is unset (HIGH)

**Evidence:** `app/api/docusign/webhook/route.ts:270-309`:
```ts
const webhookSecret = process.env.DOCUSIGN_WEBHOOK_SECRET;
if (webhookSecret) {
  // ...HMAC verification...
} else {
  console.warn("[DocuSign Webhook] DocuSign webhook secret not configured — accepting unauthenticated request");
}
```
Contrast with the Stripe webhook (`app/api/stripe/webhook/route.ts:499-510`), which correctly **fails closed** (`503`) if `STRIPE_WEBHOOK_SECRET` is missing. Also note `env.local.example` (checked in this repo) does not even list `DOCUSIGN_WEBHOOK_SECRET`, so a fresh environment set up strictly from that file would silently run in this unauthenticated mode.

**Exploit / failure scenario:** If `DOCUSIGN_WEBHOOK_SECRET` is ever unset or misconfigured in the production Vercel environment (easy to miss since it's undocumented in the example file), anyone on the internet can `POST` a fabricated `envelope-completed` JSON payload to `/api/docusign/webhook` with an arbitrary client name/email/package and trigger the "Activate Coaching" email (`sendActivateCoachingEmail`, line 114) pointing at whatever enrollment URL they choose, or spoof `envelope-declined`/`envelope-voided` status that a coach may rely on for follow-up decisions.

**Fix:** Change the `else` branch to return `503`/`401` and refuse the request, matching the Stripe handler's fail-closed pattern. Before launch, explicitly verify `DOCUSIGN_WEBHOOK_SECRET` is set in the production environment (cannot be confirmed from static code review alone — the Vercel CLI is not installed in this session, so this needs a manual `vercel env ls` check or dashboard check).

---

## 5. Stripe webhook has no idempotency guard (MEDIUM)

**Evidence:** `app/api/stripe/webhook/route.ts:109-114` and `:541-543` — both are explicit `TODO` comments acknowledging the gap: "A persistent store... should gate email sends on whether this eventId has already been processed... Stripe's own deduplication... is the primary safeguard." Signature verification itself is solid (lines 512-525, correct `constructEvent` usage).

**Exploit / failure scenario:** This isn't attacker-triggered — it's a reliability gap. Stripe redelivers `checkout.session.completed` on non-2xx responses, timeouts, or manual "Resend" from the dashboard. Every redelivery re-sends the client welcome email, the admin notification email, and re-attempts Drive workspace creation (`handleNewEnrollment`, line 441). A slow GAS call or a transient 5xx from this handler after Stripe already got a "not received in time" timeout could cause a founding coach's very first client to get two "Welcome to Kynovant" emails, or two duplicate onboarding Drive folders.

**Fix:** Persist processed `event.id`s (Supabase table or reuse the GAS "Stripe Events" sheet's own duplicate flag, which is already returned in `persistToGas`'s response body at line 83 but currently only logged, never used to gate the email sends) and short-circuit `handleNewEnrollment` on a duplicate.

---

## 6. No entitlement enforcement tied to billing status (MEDIUM-HIGH)

**Evidence:** `app/api/stripe/webhook/route.ts:562-579` — `customer.subscription.deleted` and `invoice.payment_failed` handlers are stubs that only `console.log`; no database write occurs. `lib/db/schema.ts:44-49` — `userStatusEnum` only has `invited | active | suspended | archived`, with no state driven by billing. No portal route or guard (checked `lib/auth/guards.ts`, `lib/db/portal-dashboard-service.ts`) reads Stripe subscription status before serving portal content.

**Exploit / failure scenario:** A client cancels their subscription, or their card fails and Stripe marks the invoice `payment_failed`. Nothing in the codebase reacts to this. The client's `public.users.status` stays `active` indefinitely, so they retain full portal access (programs, check-ins, nutrition, progress) with no coach action required, and no automated flag surfaces the churn/non-payment to the coach in HQ. This is a direct revenue-integrity gap for a paid product, not just a UX gap — clients can churn silently and keep the service.

**Fix:** Implement the `TODO`s at lines 550-579 — at minimum, on `customer.subscription.deleted` and after N failed `invoice.payment_failed` events, flip the corresponding `users.status` (or a new billing-status field) and gate portal access on it in the proxy/guards layer.

---

## 7. Drizzle migration ledger is out of sync with applied SQL (MEDIUM — verify before launch)

**Evidence:**
- `drizzle/meta/_journal.json` lists only 6 entries (`0000`–`0005`); corresponding snapshots exist only for `0000`, `0002`–`0005` (no `0001` snapshot).
- The `drizzle/` directory contains **15** SQL files, through `0014_exercise_search_vector_alternate_names.sql` — meaning migrations `0006`–`0014` (check-ins, copy-on-assignment, milestone acknowledgements, notifications, documents, nutrition targets, exercise library) exist as files but drizzle-kit's own ledger has no record of them.
- `scripts/migrate.ts` (header comment, lines 1-24) confirms this is intentional: a hand-rolled runner is used for "migrations that include hand-written SQL... that drizzle-kit may not apply reliably," applied via `DATABASE_URL_DIRECT` outside of `drizzle-kit migrate`.
- `drizzle/0006_check_in_schema.sql:4` is explicitly annotated **"DO NOT APPLY until explicitly approved in conversation."**

**Failure scenario:** This isn't inherently a bug — it's a deliberate escape hatch — but it means static review cannot confirm which of migrations `0006`–`0014` have actually been run against the production database. Core founding-coach-facing features (weekly check-ins, nutrition targets, document delivery, the exercise library) all depend on schema introduced in this unracked range. If any one of them was applied out of order, skipped, or applied to a different database than the one Vercel points at in production, the corresponding feature will hard-fail for the first paying coach who touches it — and because the ledger doesn't track it, `drizzle-kit generate` run naively in the future could also produce an incorrect diff against schema.ts, since it believes the DB is still at `0005`.

**Fix:** Before onboarding coaches, run `checkDatabaseConnection`-style introspection (or a manual `\dt` / DocuSign-style checklist) against the **production** database to confirm all tables from `0006`–`0014` exist and match `lib/db/schema*.ts`. Then either reconcile `_journal.json`/snapshots to reflect reality, or formally commit to `scripts/migrate.ts` as the system of record and stop relying on `drizzle-kit migrate`'s ledger at all.

---

## 8. Old-brand Calendly booking links still live (LOW-MEDIUM)

**Evidence:**
- `app/(site)/thank-you/page.tsx:87` and `components/CalendlyEmbed.tsx:10`: both hardcode `https://calendly.com/catalyst-coaching-headcoach/catalyst-coaching-strategy-call`.
- Everything else in the codebase was rebranded to `kynovant.com` (`app/layout.tsx:18,30`, both webhook `SITE_ORIGIN` constants, email templates).

**Failure scenario:** If the Calendly account/event-type slug `catalyst-coaching-headcoach` was renamed or retired as part of the Kynovant rebrand, this is the strategy-call booking link shown on the highest-intent page in the funnel (post-application thank-you) — it will 404 silently, and nobody watching error logs will notice because it's a client-side link, not a server error.

**Fix:** Confirm the Calendly slug still resolves under the new brand; if not, update both references (ideally to a single shared constant instead of duplicated across two files) to the current Kynovant Calendly URL.

---

## 9. No error tracking or alerting — console-only logging (MEDIUM)

**Evidence:** `package.json` has no Sentry/Datadog/error-tracking dependency. Every failure path across the Stripe webhook, DocuSign webhook, and GAS integrations (`console.error`/`console.warn` throughout `app/api/stripe/webhook/route.ts` and `app/api/docusign/webhook/route.ts`) relies entirely on whoever happens to be tailing platform logs.

**Failure scenario:** A misconfigured `RESEND_API_KEY` or a DocuSign HMAC mismatch fails silently from the user's perspective (webhooks always ack 200/ok:true by design, which is correct for the third party but means Kynovant's own team has no push notification that something broke). For the first 10 paying coaches, a broken welcome email or a broken agreement-completion email could go unnoticed for days.

**Fix:** Wire up at minimum a lightweight alerting path (Sentry, or a simple webhook-failure → Slack/email ping) for the `console.error` branches in both webhook handlers before relying on this for paid onboarding.

---

## 10. Non-timing-safe comparison on internal health-check secret (LOW)

**Evidence:** `app/api/internal/db-health/route.ts:44`: `if (token !== secret)`. The DocuSign handler in the same codebase already demonstrates the correct pattern (`crypto.timingSafeEqual`, `app/api/docusign/webhook/route.ts:94-99`).

**Failure scenario:** Theoretical timing side-channel to brute-force `INTERNAL_API_SECRET` over the network; largely impractical given network jitter, and the route is 404-when-unset (line 35-37) and returns no sensitive data beyond `connected`/`latencyMs`. Low real-world exploitability, trivial fix.

**Fix:** Swap to `crypto.timingSafeEqual` with a length check, consistent with the pattern already used elsewhere in this codebase.

---

## 11. `env.local.example` is stale relative to what production actually reads (LOW)

**Evidence:** The checked-in `env.local.example` documents `SHEETS_APPLICATIONS_GAS_URL`, `SHEETS_ONBOARDING_GAS_URL`, `STRIPE_EVENTS_GAS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CALENDLY_PERSONAL_ACCESS_TOKEN`, `CALENDLY_USER_URI` — but the codebase also reads (and depends on) `DOCUSIGN_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ADMIN_EMAIL`, `SHEETS_DRIVE_GAS_URL`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `INTERNAL_API_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — none of which appear in the example file.

**Failure scenario:** Directly contributes to finding #4 — someone bootstrapping a new environment strictly from this file would never learn `DOCUSIGN_WEBHOOK_SECRET` needs to be set, and the DocuSign webhook would silently run unauthenticated (fails open, per finding #4).

**Fix:** Regenerate `env.local.example` to include every var actually referenced by `process.env` in `app/`/`lib/`/`scripts/`.

---

## Things that are in good shape (no action needed)

- **Stripe webhook signature verification** (`app/api/stripe/webhook/route.ts:512-525`) is correct and fails closed when misconfigured.
- **`lib/auth/guards.ts`** is a genuinely well-designed authorization layer: it re-validates JWTs via `supabase.auth.getUser()` rather than trusting cookies, reads role/status from `public.users` (never JWT claims), rejects suspended/archived users everywhere, and includes a correct object-level ownership check (`authorizeWorkoutSession`, returning 404 instead of 403 to avoid confirming existence).
- **Open-redirect protection** (`lib/auth/redirect.ts`) correctly rejects protocol-relative and absolute URLs in the post-login `next` param and enforces a per-role allowlist.
- **No secrets are committed to git** — `.env*` is gitignored, and `git log --all` confirms no `.env` file was ever added in history. No hardcoded API keys/passwords found in source beyond the one flagged in finding #2.
- **Cascade-delete posture is conservative** — the vast majority of foreign keys use `restrict` or `set null`; no destructive `cascade` behavior found on core entities (users, enrollments, programs), limiting accidental data loss from a single delete.
- **DocuSign HMAC verification**, when the secret *is* configured, correctly uses `crypto.timingSafeEqual` on the raw (pre-parse) body.

---

## GO / NO-GO Recommendation

**NO-GO** for onboarding paying coaches as a multi-tenant platform in the current state.

The blocking path is short and concrete: findings **#1–#3** together mean any of the ten founding coaches can see and modify every other coach's clients and programs, and can reach the full business Command Center, through completely ordinary use of the product — not a sophisticated attack. That is a contractual/privacy liability the moment a second coach account exists, and it is the exact scenario this launch introduces. Finding **#4** should also be confirmed closed (or fixed to fail closed) before launch since it's a one-missing-env-var away from an open webhook. Finding **#7** needs a from-database verification (not just code review) that the schema founding coaches will depend on is actually present in production.

Recommended minimum bar to flip to GO:
1. Add coach-scoped filtering to the client/program/assignment query layer (#1), or add explicit compensating access review if this is genuinely intended to be a shared single-tenant workspace.
2. Remove `AdminGate`'s hardcoded password and decide the real `admin`-vs-`coach` boundary (#2, #3).
3. Make the DocuSign webhook fail closed, and confirm `DOCUSIGN_WEBHOOK_SECRET` is actually set in production (#4).
4. Confirm (against the live database, not just this repo) that migrations `0006`–`0014` are applied (#7).

Findings #5, #6, #8–#11 are real but do not need to block go-live for a small founding cohort — they should be scheduled immediately after launch, with #6 (entitlement enforcement) prioritized first since it has direct revenue impact.
