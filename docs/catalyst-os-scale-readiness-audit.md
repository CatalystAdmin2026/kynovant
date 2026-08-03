# Kynovant — Scale Readiness Audit & Technical Debt Roadmap

10,000-coach scale review · August 2026 · Backend/architecture only, UI explicitly out of scope

---

## 0. How to read this document

This audits 11 dimensions of the backend architecture against the question "could this support 10,000 independent coaches, each managing their own client roster, as a real multi-tenant SaaS?" It is read-only research — nothing was changed. Findings are drawn from five independent, parallel deep-dives (database, service layer, API/auth, caching/jobs/events, multi-tenancy/AI), then cross-checked against each other and against two documents that already exist in this repo: `docs/founding-coach-security-audit.md` (a prior audit that reached the same top-line conclusion independently) and `docs/ai-workforce-architecture.md` (which already locks AI rollout behind the same fix this document leads with).

**The top-line finding, stated once, up front, because everything else is secondary to it:**

> **Coach-to-coach tenant isolation is not enforced at the query layer. It exists in the schema (`coachId`/`clientId` foreign keys are present everywhere they should be) but is not used as a filter in the functions that back the coach's own dashboard, client list, and client workspace. Any authenticated coach account can currently read — and in several places write — every other coach's client data.** This is not a theoretical risk requiring a chain of exploits; it's the direct, default behavior of core functions today, confirmed by four independent research passes reading the actual code, and it's already been reached independently by this team's own prior security audit (NO-GO verdict) and locked as a hard prerequisite in the AI-workforce design doc.

This is why the roadmap below is organized the way it is: almost everything in "Critical Before Launch" is either this issue directly, or something immediately adjacent to it that should be fixed in the same pass.

---

## 1. Database Architecture

**Schema:** 9 files, ~3,600 lines, 40 tables. Every table holding coach- or client-owned data carries the FK it should — `coachId`, `clientId`, or one join away via `enrollmentId`/`clientProgramId`. The schema itself is not the problem (see §9).

**RLS exists but is inert for real traffic.** 54 `ENABLE ROW LEVEL SECURITY` statements and ~13 policies exist across 7 migrations — but every policy is `client_select_own` (`auth.uid() = client_id`), read-only, and scoped to protect a client from another client via the Supabase Data API. `DATABASE_URL` connects as the table-owning `postgres` role, and Drizzle is the only thing that ever touches data server-side — Postgres RLS does not apply to a table owner without `FORCE ROW LEVEL SECURITY` (not set anywhere). One migration's own comment says this outright: *"Drizzle ORM (direct Postgres connection, postgres user) bypasses RLS entirely — all server-side reads and writes are unaffected."* There is no coach-scoped policy anywhere. **RLS provides zero coach-to-coach protection today.**

**Indexing:** generally solid (correct composites on `timeline_events`, `weekly_check_ins`, `client_notifications`, a good partial unique index on one-active-program-per-client). One real gap: `workout_sessions` — the table backing "get today's workout," queried on every portal home-page load — has only single-column indexes, no composite `(client_id, scheduled_date)`. Worth adding, not urgent.

**Migration integrity — real drift, needs reconciling.** 17 `.sql` files exist in `drizzle/`; the journal (`drizzle/meta/_journal.json`) has 6 entries. Migrations 0006–0016 were applied via a documented hand-rolled runner (`scripts/migrate.ts`, for RLS/policy SQL `drizzle-kit` doesn't handle well) that never updates the journal. This is a deliberate escape hatch, but the consequence is real: **static review cannot confirm which of 11 migrations are actually applied to production**, and a naive `drizzle-kit generate` today would diff against a schema state that's 11 migrations stale.

**Schema-merge gap, confirmed low severity.** `lib/db/client.ts` only imports `./schema` (the base file) into the typed Drizzle client, not the 8 domain schema files. Verified this has **zero functional impact today** — nothing in the codebase uses Drizzle's relational query API (`db.query.*`, the only surface that reads this object at runtime); every query uses the query-builder API, which takes table objects directly. Worth fixing for correctness before anyone adopts `db.query.*`, not urgent before then.

**No archival/retention/partitioning strategy** for unbounded append-only tables (`workout_set_logs`, `timeline_events`, `client_notifications`). Documented as a known future need (`docs/ARCHITECTURE_DECISIONS.md`), not built. Real at multi-year scale, not at initial 10k-coach onboarding.

**Soft-delete:** two conventions coexist (timestamp columns vs. status enums) but every meaningful FK uses `onDelete: "restrict"` — true data loss is structurally prevented regardless of which convention a given table uses. Cosmetic inconsistency, not a recoverability risk.

---

## 2. Service Layer & File Organization

17 files in `lib/db/*-service.ts`, flat, no domain subfolders — contrast with `lib/pil/`, which is the clean reference point in this codebase: pure computation modules with exactly one DB-touching seam (`enrichment.ts`), fully unit-tested (18 test files). Nothing else in the codebase follows that pattern; `lib/db/` mixes pure derivation logic and DB access in the same large files with no marker distinguishing which is which.

**Layering discipline is real but not total.** Server Actions/routes call services in the overwhelming majority of cases (checked 5 representative files, 4 were clean). One file, `app/hq/clients/[clientId]/actions.ts`, both runs raw Drizzle inline for goal writes (no service file exists for that sub-domain) **and** reimplements the coach-or-admin auth check from scratch instead of calling `lib/auth/guards.ts`'s canonical version — the same file carrying both deviations is not a coincidence, it's exactly the kind of file that accretes shortcuts once one exists.

**Transaction gaps — three functions that claim atomicity and aren't wrapped in one.** `program-builder-service.ts`'s `cloneProgramTemplate()`, `copyProgramWeek()`, and `importProgramSpec()` — the last of which has a comment literally reading *"Accepts a declarative program spec and atomically applies it"* — all do multi-row, multi-table writes with no `db.transaction()`. A partial failure mid-write leaves a corrupted half-imported program template. `importProgramSpec` is explicitly the seam for AI-assisted import (malformed/large payloads are a realistic trigger), which makes this the most likely of the three to actually fire in production.

**Error handling:** two conventions (`{ ok, error }` returns vs. thrown `Error`) coexist — and coexist *within the same file* in four of the audited services. Not broken today (every caller knows its callee's convention) but blocks introducing centralized error logging/telemetry without touching every call site.

**Test coverage: 18 of 19 test files in the entire repository are under `lib/pil/`.** Zero tests exist for any of the 17 `lib/db/*-service.ts` files or for `lib/auth/guards.ts` — the authorization logic itself is untested. This matters directly for how safely the Critical fixes below can be made: there is no regression harness to confirm a coach-scoping fix actually works and doesn't regress.

**Naming drift:** "Template" (DB/schema, most service function names) vs. "Blueprint" (types, some function names, route paths, file header comments) refer to the same entity throughout the codebase with no glossary reconciling them — `docs/PRODUCT_LANGUAGE.md` exists precisely to prevent this kind of drift and doesn't cover either term.

---

## 3. API Organization & Auth

47 routes under `app/api/**`. Auth-guard coverage is good almost everywhere it's supposed to be (`app/api/internal/**`, 33 routes, all correctly require `requireCoachOrAdmin`) — but four routes have **no authentication at all** and clearly should:

| Route | Exposure |
|---|---|
| `POST /api/docusign/send-agreement` | **Most severe.** Unauthenticated caller can POST arbitrary name/email/rate and the route will mint a real, signable DocuSign coaching-agreement envelope. Real external side effect, zero auth, zero rate limit. |
| `GET /api/sheets/[sheet]` | Proxies application/onboarding/Stripe-event data from Google Sheets to anyone who requests it. |
| `GET /api/calendly/events` | Proxies invitee names/emails from Calendly via a server token, no auth. |
| `GET /api/docusign/debug-template` | Self-labeled *"TEMPORARY DEBUG ROUTE — remove before production hardening."* Still there. |

**Object-level authorization (the coach-facing half of it) does not exist.** The codebase has one deliberately-built, correct example of this pattern — `lib/auth/guards.ts`'s `authorizeWorkoutSession`, which re-verifies a workout session belongs to the calling *client* and 404s (not 403s) on mismatch — but that discipline was only ever applied to the client-self-service surface. On the coach-facing surface, routes like `internal/clients`, `internal/client-programs`, and the program-assign endpoints check "is this caller a coach" and stop there; nothing checks "is this the coach who owns this specific client." Several of these already carry `TODO (multi-tenancy)` comments acknowledging exactly this gap.

**Rate limiting exists in exactly one place** (`/api/applications`, DB-backed, self-documented as non-production-grade, and fails *open* on its own DB error). Every other public/unauthenticated endpoint has none.

**Webhook signature verification is structurally correct** for both Stripe and DocuSign (raw body read before parsing, correct HMAC comparison) — but the **DocuSign webhook fails open**: if `DOCUSIGN_WEBHOOK_SECRET` is ever unset, it logs a warning and accepts the request unverified instead of rejecting.

**No CSRF token mechanism** anywhere in the repo (confirmed via grep) — state-changing routes rely entirely on whatever `SameSite` cookie default the Supabase SSR library applies. No confirmed live exploit path, but no explicit hardening decision has been made either.

**Auth architecture is otherwise sound:** role/status is re-verified against `public.users` on every guarded request (never trusted from JWT), confirmed with no exceptions found. `requireAdminPage()` (a true admin-only page guard) now exists and is wired up in the Growth CRM section — a gap flagged in earlier research is closed. Two parallel auth code paths exist (`lib/auth/guards.ts` and `lib/supabase/session.ts`), both independently correct today but a maintenance/consistency risk going forward.

---

## 4. Caching

**None exists, anywhere, at any layer.** No Redis/Upstash/KV/Edge Config, no `unstable_cache`, no in-memory cross-request cache. Every HQ and portal page (all 20+ route files checked) is `export const dynamic = "force-dynamic"` — a deliberate, blanket opt-out of any framework-level caching. Every page load, for every coach and every client, runs fresh Postgres queries.

This compounds directly with §9: the coach's own `/hq` dashboard already runs a platform-wide (not coach-scoped) aggregation across every client on the system. Zero caching means that query re-runs from scratch, at full platform width, on every single page load by every coach. **This is very likely the first thing to fail under real concurrent load — and it would fail well before 10,000 coaches, likely in the low hundreds, because the query cost scales with total platform size, not with any individual coach's roster.** Caching alone would not fix this (it would just cache the wrong, platform-wide answer) — the tenant-scoping fix in §9 has to land first; caching is the right next step *after* that.

---

## 5. Background Jobs & Queues

**None exist.** No job/queue package in `package.json`, no `vercel.json`/cron config at all (the file doesn't exist), no polling loop, nothing. This isn't a partial gap — there is no asynchronous execution model anywhere in the system; everything runs synchronously inline in request handlers.

Several already-documented features depend on this not-yet-existing infrastructure: Stripe subscription-lifecycle sync (suspend a coach's access on `subscription.deleted`/`invoice.payment_failed` — currently a no-op, explicitly TODO'd in the webhook handler), the Growth CRM's planned stale-lead detection, and the AI-workforce doc's "weekly retention scan." None of this blocks initial launch; it blocks product completeness that's already been designed and deferred.

---

## 6. Event Architecture

`timeline_events` is well-instrumented **where it's wired up** — correct transactional writes, and a genuinely good idempotency pattern (optimistic `UPDATE ... WHERE status = 'expected' RETURNING id`, skip the event insert if the row was already moved by a concurrent request). But coverage has real gaps: publishing a nutrition target and creating/archiving a client goal both change client-facing state with **no** timeline entry written — the "client activity timeline" silently has holes.

**`enrollment_events` is 100% dead code.** Its own schema comment claims it records every stage transition, pause, resume, and reassignment — but there is no code path anywhere that writes to it, and no code path that even mutates `coachingEnrollments.status` in the first place. The feature this table backs was never built. Either build it or remove the table — leaving it as-is misleads anyone who reads the schema comment and assumes the audit trail exists.

**Applications have no event log at all**, and worse: `updateApplicationStatus`/`saveApplicationNotes` overwrite `reviewedBy`/`updatedAt` on every touch with no history table underneath — once a second staff member touches an application, there's no way to reconstruct who made the original status decision or when.

**Webhook idempotency is a confirmed, self-acknowledged gap, not a theoretical one.** Neither Stripe nor DocuSign's webhook handler checks whether an event ID has already been processed before triggering side effects. Stripe's webhook handler literally has a `TODO (idempotency)` comment admitting Stripe's own retry behavior is "the primary safeguard" today — which it isn't; Stripe redelivers on any non-2xx response or timeout, as routine production behavior, not an edge case. Both handlers synchronously send transactional email (via Resend) before acknowledging — a slow response on any webhook risks a provider-initiated retry, which today means a **duplicate welcome email, duplicate admin notification, or duplicate "activate coaching" email**, with no code path preventing it.

**No shared email module.** Four near-identical Resend call sites (client welcome, admin payment notification, DocuSign activation, admin application notification), each independently instantiating a client and hand-building ~100 lines of HTML. All four calls are synchronous, awaited inside the request/webhook handler that needs to respond quickly — adding directly to the response-time budget that, if exceeded, triggers the retries described above.

**Notifications are a write-only sink.** `client_notifications` has exactly 2 writers, confirmed zero readers (no UI, no route, nothing queries it beyond its own unused service functions), and confirmed zero delivery mechanism (no email/push ever fires from it). Rows accumulate with no path to ever reaching a client.

---

## 7. Multi-Tenancy — the central finding, in full

This deserves its own section because it's the organizing issue for the whole roadmap, and because the finding is unusually well corroborated: reached independently by four separate research passes in this audit, by this team's own prior `docs/founding-coach-security-audit.md` (formal NO-GO), and locked as a hard prerequisite in `docs/ai-workforce-architecture.md`.

**Confirmed unscoped functions, by direct code read:**

- `lib/db/coach-dashboard-service.ts` `listCoachClients(_coachId?)` — parameter accepted, unused (`eslint-disable` comment on the unused-var warning), query filters only `WHERE role = 'client'`. Returns every client on the platform. Backs `/hq`, `/hq/clients`.
- `lib/db/coach-client-workspace-service.ts` `getCoachClientWorkspace()` — same `_coachId?` unused pattern, comment: *"When multi-tenancy ships, add a coachingEnrollments join to verify the requesting coach owns this client."* Returns full client workspace including sensitive health data to any coach who knows the client's UUID. Backs `/hq/clients/[clientId]`.
- `lib/db/client-program-service.ts` `listActiveClients()`, `listAllActiveAssignments()` — zero parameters, platform-wide by construction.
- `lib/db/client-program-service.ts` `assignProgram()` — a **write path**. Validates the target is a client and the program is published; never checks the calling coach is that client's coach. Any coach can assign/overwrite any other coach's client's program.
- Check-in review actions (`app/hq/check-ins/[checkInId]/actions.ts`) — `coachId` is threaded through only to *stamp* the audit trail, never as an authorization filter. A coach can respond to and mark reviewed another coach's client's check-in.

**The one place this is done right** — `authorizeWorkoutSession` in `lib/auth/guards.ts` — proves the team knows the pattern; it just was only ever built for the client-self-service side, never extended to the coach-facing side.

**The admin/coach boundary is also blurred**, which matters because it's currently the only thing standing between "any coach" and full platform visibility being *intentional* rather than *accidental*: `app/admin/layout.tsx` gates the entire `/admin/*` tree with `requireCoachOrAdminPage()` — role `coach` is explicitly admitted, not just `admin`. `requireAdmin()` (true admin-only) is used in exactly one route platform-wide. The coach-invite page itself carries an in-repo disclaimer acknowledging this: *"every invited coach can currently see every client and program on the platform... treat this invite tool as provisioning for a trusted, small Founding Coach cohort until that lands."*

**A hardcoded single-coach assumption exists in production code, not just seed scripts:** `app/api/docusign/send-agreement/route.ts` hardcodes the "Coach" signer as `name: "Jermaine Jones"`, `email: catalyst.coaching.headcoach@gmail.com` for every client agreement, regardless of which coach actually owns that client.

**No multi-seat/team model exists at the schema level** — `userRoleEnum` is a flat `client | coach | admin`, `coachProfiles.userId` is 1:1. "10,000 coaches" today necessarily means 10,000 independent single-person accounts; adding team seats under one coaching business would require new tables, not new rows.

**IDOR risk is concrete, not theoretical:** UUIDs aren't guessable, but they don't need to be — `listCoachClients()` hands every coach the full platform roster by default, so no enumeration is required at all.

---

## 8. AI Orchestration

**No live AI/LLM integration exists anywhere** — confirmed by dependency check and by grepping for every plausible call pattern (`generateText`, `streamText`, `@ai-sdk/*`, raw fetches to any model provider). The only AI-adjacent surface, the portal's narrative progress summary, is explicitly deterministic rule-based text generation, not a model call.

Two design docs exist, both explicitly marked as not-yet-implemented: `docs/AI_PRINCIPLES.md` (a 9-principle governance doctrine plus a Programming Intelligence doctrine — well-reasoned, already used to shape this document's own recommendations by analogy) and `docs/ai-workforce-architecture.md` (a 10-agent fleet design, entirely conceptual). **The second document already names tenant isolation as Locked Principle #1 and a hard prerequisite blocking any agent above Tier 0/1** — meaning this team has already, independently, reached the same sequencing conclusion this roadmap reaches: fix multi-tenancy before building anything AI-driven that acts on coach/client data.

Nothing currently depends on AI cost tracking, rate limiting, model-fallback config, or prompt/eval infrastructure — all confirmed absent, all correctly out of scope until AI features are actually being built.

---

## 9. Technical Debt Roadmap

### Critical — before onboarding coaches beyond a small, fully-trusted cohort

Everything here either **is** the tenant-isolation gap or is directly adjacent to it and should land in the same engineering pass, because the fix touches the same functions and the same test surface.

1. **Add coach-scoping to every coach-facing data-read/write function** — `listCoachClients`, `getCoachClientWorkspace`, `listActiveClients`, `listAllActiveAssignments`, `assignProgram`, check-in review actions, and any sibling function with the same `_coachId?`-unused pattern. Join through `coachingEnrollments` and filter, not just accept the parameter.
2. **Build a real object-level ownership guard for the coach→client relationship** and apply it everywhere a coach touches a specific client's resource — extend the existing `authorizeWorkoutSession` pattern to the coach side rather than inventing a new one.
3. **Gate the four unauthenticated routes**: `docusign/send-agreement` (highest severity — real external side effect), `sheets/[sheet]`, `calendly/events`, and delete-or-gate `docusign/debug-template`.
4. **Decide and enforce the actual admin/coach boundary** — audit every `requireCoachOrAdminPage`/`requireCoachOrAdmin` use and change the ones that should be Kynovant-staff-only to `requireAdmin`/`requireAdminPage`.
5. **Remove the hardcoded coach identity in `docusign/send-agreement`** — resolve the actual owning coach per client instead of always signing as one person.
6. **Add webhook idempotency** (an event-ID-processed table, checked before triggering email/side effects) for Stripe and DocuSign — this will actively cause duplicate customer-facing emails at real production traffic levels, not just in a worst case.
7. **Fix the DocuSign webhook's fail-open behavior** on a missing signing secret — must reject, not silently accept unverified requests.
8. **Reconcile the migration journal against what's actually applied in production** before making further schema changes at scale — verify migrations 0006–0016 via direct database introspection, not static file review.
9. **Wrap `cloneProgramTemplate`, `copyProgramWeek`, and `importProgramSpec` in real transactions** — cheap fix, and `importProgramSpec` already falsely claims atomicity in its own comment, which is worse than an acknowledged gap.
10. **Fix `app/hq/clients/[clientId]/actions.ts`'s duplicated auth check and inline DB writes** while doing #1/#2 in the same file anyway — no reason to leave the weaker, second implementation behind.

### Safe after launch — real, worth scheduling soon, not actively dangerous if sequenced after Critical

1. Introduce a caching layer (start with `unstable_cache`/Next's Data Cache on the highest-traffic reads) — **only after #1 above**, or it caches the wrong, platform-wide answer faster.
2. Stand up a background job/queue system (Vercel Cron is enough to start) to unblock the several already-documented, already-deferred automations (subscription-lifecycle sync, stale-lead detection).
3. Wire actual notification delivery (email at minimum) to `client_notifications` — table and writers exist, nothing delivers or reads it yet.
4. Extract a shared `lib/email.ts` to de-duplicate the four Resend call sites and make future queuing possible.
5. Close the `timeline_events` coverage gaps (nutrition target publish, goal create/archive) and add an `application_events` history table so status changes aren't lossy after a second edit.
6. Decide the fate of `enrollment_events` — build the stage-transition logic it's meant to back, or remove the table.
7. Merge the two schema files into `lib/db/client.ts`'s typed import, and add the missing `workout_sessions(client_id, scheduled_date)` composite index.
8. Add test coverage for `lib/db/*-service.ts` and `lib/auth/guards.ts` — ideally starting with tests for whatever lands from the Critical section, so the fix has a regression harness from day one.
9. Standardize on one error-handling convention (`{ ok, error }` or thrown `Error`, not both within the same file).
10. Reconcile "Template" vs. "Blueprint" naming across schema, service functions, types, and routes.
11. Merge the two parallel auth code paths (`lib/auth/guards.ts` and `lib/supabase/session.ts`) into one.
12. Add explicit CSRF protection (or a documented, deliberate decision that `SameSite` cookie defaults are sufficient) rather than leaving it implicit.

### Nice to have — real, no urgency, revisit when the product need actually arrives

1. Multi-seat/team model (more than one staff login per coaching business) — new tables, not needed for 10,000 independent single-person accounts.
2. Begin AI-workforce buildout per `docs/ai-workforce-architecture.md` — already correctly gated behind the Critical section by the team's own design doc; nothing to do now except keep that gate in place.
3. Per-tenant AI cost tracking, model-fallback config, prompt/eval infrastructure — only relevant once AI features are actually being built.
4. Archival/partitioning strategy for unbounded append-only tables — a multi-year-scale concern, not an initial-onboarding one.
5. Minor documentation/comment drift (e.g., "enrollment" vs. "engagement" in one comment).

---

## Document History

| Date | Change |
|---|---|
| 2026-08-02 | Initial scale-readiness audit and technical debt roadmap, synthesized from five parallel research passes, cross-referenced against `docs/founding-coach-security-audit.md` and `docs/ai-workforce-architecture.md`. |
