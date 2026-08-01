# Kynovant SaaS Evolution Roadmap

**Status: Canonical.** This document is the durable architectural reference
for how Kynovant evolves from a single-coach admin tool into a
production-ready, multi-tenant coaching SaaS platform. It supersedes the
narrative form of `docs/founding-coach-golden-path-audit.md` and
`docs/founding-coach-multi-tenant-roadmap.md` as the source of truth going
forward; those two documents remain as the point-in-time investigation this
roadmap was built from, and are referenced throughout rather than repeated
in full.

**Scope of this document:** architecture and sequencing decisions only.
No application code was written or modified to produce it.

### Status-tag legend

Every item below is tagged with one or more of these, so "what exists" vs.
"what's decided but unbuilt" vs. "what's a hard gate" is never ambiguous:

| Tag | Meaning |
|---|---|
| `[EXISTS]` | Already implemented in the current schema or codebase. |
| `[STUBBED]` | A seam/placeholder already exists (an unused parameter, a TODO comment) but is not wired to real behavior. |
| `[MIGRATION]` | Requires a database schema change. |
| `[APP-LAYER]` | Requires application/query/route logic, no schema change. |
| `[DECISION]` | A product/architecture decision, not an implementation task. |
| `[BLOCKS COACH #1]` | Must be resolved before the founding coach can go live. |
| `[BLOCKS COACH #2]` | Safe with exactly one coach; unsafe or non-functional the moment a second coach is onboarded. |
| `[CAN WAIT]` | Deferrable past initial multi-tenant launch without risk. |

### Complexity scale

| Size | Meaning |
|---|---|
| **S** | Days. Localized, low risk, no migration. |
| **M** | ~1–2 weeks. Touches several files/routes, may need a small migration. |
| **L** | 2–4 weeks. Cross-cutting, real migration, needs careful testing. |
| **XL** | 4+ weeks or needs a design spike before sizing is reliable. |

---

## 1. Executive Summary

Kynovant's coaching product — authentication, HQ (coach workspace), the
client portal, blueprints, programs, workout logging, and check-ins — is
architecturally solid and already load-bearing. What it is **not** yet is a
SaaS product: it was built, and today still operates, as a single coach's
internal admin tool ("solo mode," acknowledged directly in code comments),
with every multi-coach concern — signup, entitlement, data isolation,
client invitation — either entirely unbuilt or explicitly stubbed for later.

This roadmap locks in the following architectural decision and sequences
the work required to execute it safely:

> **Coach is the tenant.** Each independent coach owns and can access only
> their own clients, programs, blueprints, assignments, check-ins,
> nutrition data, and related records. Organization-level tenancy (gyms,
> franchises, coaching teams) is explicitly deferred until a real
> multi-coach customer requires it — the initial launch is not designed
> around that case, but the architecture preserves a clean, additive path
> to it later.

The roadmap is organized around two hard milestones:

1. **First paid coach** — achievable now, largely through disciplined
   manual process rather than new product surface (Phase 1).
2. **Second paid coach** — requires real architectural work
   (Phases 2–3 core) to be safe, not just functional. This is the
   non-negotiable gate; see §9.

Self-serve signup, billing self-service, and organizations are all real,
planned work — but they are scale and go-to-market concerns that come
*after* the tenancy and entitlement foundation is correct, not before.

---

## 2. Current State

Grounded in `docs/founding-coach-golden-path-audit.md`. Summary:

**Solid and production-ready as-is:**
- Auth: magic link + password login, session refresh, safe post-login
  redirect allowlisting (`lib/auth/redirect.ts`), role/status resolved
  server-side and never trusted from JWT claims or user input
  (`lib/auth/guards.ts`).
- Blueprint (workout template) authoring — full CRUD + sub-resource APIs
  under `app/api/internal/workout-templates/`.
- Program authoring — full CRUD, week-building, cloning, import under
  `app/api/internal/programs/`.
- Program assignment to a client (`assignProgramAction`,
  `app/hq/clients/[clientId]/actions.ts`).
- Client workout logging — `components/portal/TodayWorkout.tsx`,
  `WorkoutSession.tsx`, correctly scoped to the authenticated user's own id.
- Check-in submission and coach review — `app/portal/check-ins/actions.ts`
  and `app/hq/check-ins/[checkInId]/actions.ts`, both server-side validated
  and correctly ownership-scoped on the client side.
- Object-level authorization for workout sessions
  (`authorizeWorkoutSession` in `lib/auth/guards.ts`) — returns 404 rather
  than 403 to avoid confirming existence to a non-owner.

**Missing or explicitly unbuilt:**
- No coach self-signup. `app/login/page.tsx` states "Access is by
  invitation only. No public account registration," and
  `supabase.auth.signInWithOtp` is called with `shouldCreateUser: false`.
  The only path to `role='coach'` is a hand-run SQL statement
  (`docs/catalyst-os-authentication.md:304`).
- No coach-level subscription/entitlement of any kind. All Stripe logic
  (`app/api/stripe/webhook/route.ts`, `lib/stripe.ts`) models Kynovant's
  own end clients paying for coaching packages — never a coach paying for
  platform access.
- No "create/invite client" feature anywhere in HQ. `coaching_enrollments`,
  `client_profiles`, and `coach_profiles` are inserted by exactly one code
  path in the whole repository — `scripts/seed-demo-client.ts`, a dev
  fixture, not production code.
- No multi-tenancy. Every coach-facing list and dashboard query returns
  every client in the database, regardless of who is logged in — this is
  explicit in code comments, not inferred (see §3 and §5).
- No billing management or cancellation actions anywhere in the app.
  `app/admin/page.tsx` is read/display only; no
  `stripe.subscriptions.update/cancel/del` call exists in the codebase.

---

## 3. Core Tenancy Decision

### Locked decision

**The coach is the tenant.** This is now the architectural baseline for
all subsequent phases:

- Each coach's clients, programs, blueprints, program assignments,
  check-ins, and nutrition data are visible and mutable only by that coach
  (and by the platform `admin` role, which retains cross-tenant visibility
  for operations).
- No organization, team, or franchise concept exists in the initial
  multi-tenant model. **The initial launch is not designed around gyms,
  franchises, or enterprise organizations**, and no phase before Phase 4
  should be built in a way that assumes one is coming imminently.
- Organization-level tenancy (§7) is deferred until a real paying
  multi-coach customer needs it — not built speculatively ahead of demand.

### Why this is the right initial boundary

- It matches the schema that already exists: `coaching_enrollments.coachId`
  (`lib/db/schema.ts:250`) already models a direct coach→client
  relationship. No new foreign key is needed to express "coach is the
  tenant" — only the query and enforcement layers need to catch up to a
  relationship the schema already encodes.
- It matches the actual go-to-market shape: the audit found zero evidence
  anywhere in the product, docs, or Stripe configuration of a gym/team/org
  billing concept. Building for organizations now would be speculative
  architecture for a customer that doesn't exist yet.
- It's the narrowest correct boundary. An org-first design would force
  every early feature (billing, roles, client visibility) to carry
  organization complexity that a single independent coach doesn't need and
  wouldn't be charged for.

### The one thing this decision requires in advance `[DECISION]`

To keep the path to organizations clean and additive rather than a rewrite,
every tenant-scoping query and guard built in Phase 2 should be written
against a **tenant resolver abstraction** — conceptually `tenantId`, which
resolves to `coachId` today — rather than hardcoding `coachId` as a
first-class concept threaded through every function signature. This is a
naming/interface discipline, not extra schema or extra work: it costs
nothing now and avoids a second migration and a second pass through every
scoped query when Phase 4 eventually happens.

**Unresolved as of this document:** the exact shape of that resolver
(a shared helper function vs. a request-scoped context value) is an
implementation detail left to Phase 2, not locked here.

---

## 4. Phase 1 — Founding Coach Launch

**Goal:** get one real, paying coach onto the platform safely, without
building self-serve product surface for a single customer. Everything here
is intentionally interim scaffolding that Phase 5 replaces.

| Item | Tags | Complexity | Notes |
|---|---|---|---|
| Documented provisioning runbook: Supabase auth user → `users.role='coach'` → `coach_profiles` row, in one disciplined pass | `[BLOCKS COACH #1]` `[APP-LAYER]` (process, near-zero code) | **S** | Today only step one of three happens reliably; `coach_profiles` is never inserted by any code path, which silently breaks the client dashboard's coach-presence block via the `INNER JOIN` in `getCoachData()` (`lib/db/portal-dashboard-service.ts:833`). |
| Same runbook, client side: auth user → `client_profiles` → `coaching_enrollments` scoped to the founding coach; bypass the Google Sheets marketing funnel entirely for this pilot | `[BLOCKS COACH #1]` | **S** | Formalizes the only path that currently works end-to-end. |
| Manual billing for the founding coach (hand-created Stripe subscription or invoice), tracked outside the app | `[BLOCKS COACH #1]` `[CAN WAIT]` re: automation | **S** | Do not build entitlement automation for one customer — that's Phase 3. |
| Ops process for suspending the coach on non-payment: set `users.status='suspended'` | `[EXISTS]` (mechanism), `[APP-LAYER]` (runbook only) | **S** | Already enforced by every guard via `resolveSession()` (`lib/auth/guards.ts`) — this is process documentation, not new code. |
| Coach-facing check-in notification (email or in-app badge) so the founding coach isn't manually polling `/hq/check-ins` | `[BLOCKS COACH #1]` (usability, not security) `[APP-LAYER]` | **M** | Extends `createNotification()` (`lib/db/coach-check-in-service.ts:432`), which today only fires toward the client. |
| Fix `/account` for a coach identity (redirect, or a minimal coach branch) instead of silently rendering an empty client-shaped page | `[APP-LAYER]` `[CAN WAIT]` | **S** | `requireClientUser()` (`lib/supabase/session.ts:82`) checks status but not role — low risk, easy win. |

**No schema migration is required for Phase 1.** This phase can run fully
in parallel with the start of Phase 2 — the founding coach does not need to
wait on any of the multi-tenancy work below.

---

## 5. Phase 2 — Independent Coach Multi-Tenancy

**Goal:** make it architecturally safe and operationally real for a second
coach to exist — including that coach being able to operate independently
(add their own clients) rather than depending on ops to hand-provision
every record. This is the highest-leverage, non-deferrable phase.

| Item | Tags | Complexity | Notes |
|---|---|---|---|
| Adopt the `tenantId`-resolving-to-`coachId` abstraction from §3 before writing scoping code | `[DECISION]` | — | Prerequisite for everything else in this phase. |
| Wire the already-stubbed `_coachId` parameters into real filters | `[STUBBED]` → `[APP-LAYER]` `[BLOCKS COACH #2]` | **M** | `lib/db/coach-dashboard-service.ts` and `lib/db/coach-client-workspace-service.ts` already accept `_coachId?: string, // reserved for future multi-tenant filter` on every relevant function (`coach-dashboard-service.ts:196,324,416,455`; `coach-client-workspace-service.ts:242`). The join through `coachingEnrollments` is described in the code's own comments, not invented here — this is "uncomment and wire," not a green-field build. |
| Add coach→client ownership checks to every mutating server action that currently checks role only | `[STUBBED]` → `[APP-LAYER]` `[BLOCKS COACH #2]` | **M** | `assignProgramAction`, `saveGoalAction`, `archiveGoalAction` (`app/hq/clients/[clientId]/actions.ts`) and `startReviewAction`, `saveDraftResponseAction`, `markReviewedAction`, `reopenCheckInAction` (`app/hq/check-ins/[checkInId]/actions.ts`) all carry the identical TODO: *"validates role only, not coach→client ownership... join coachingEnrollments here and confirm the acting coach is enrolled with the target clientId."* This is the fix for the audit's top cross-cutting security finding. |
| Centralize the duplicated inline `assertCoachOrAdmin()` helper (hand-copied in two separate `actions.ts` files instead of importing `lib/auth/guards.ts`) into one ownership-aware guard, e.g. `assertCoachOwnsClient(coachId, clientId)` | `[APP-LAYER]` | **S** | De-risks the item above — one implementation to get right instead of three independently-maintained copies. |
| Decide and implement the visibility model for `program_templates` and `workout_templates` (coach-private library vs. shared platform library with clone-to-mine) | `[EXISTS]` (field) + `[DECISION]` + `[APP-LAYER]` | **M** | No new column is needed either way — both tables already have `createdBy: uuid("created_by").references(() => users.id, ...)` (`lib/db/schema.ts:522`). The remaining work is query/visibility logic and UX, not a migration. |
| Coach-driven client invite flow: a real "Invite Client" action in HQ that calls `auth.admin.inviteUserByEmail` (service role) and creates `client_profiles` + `coaching_enrollments` scoped to the inviting coach, in one transaction | `[BLOCKS COACH #2]` `[APP-LAYER]` | **M** | This closes the audit's #3 launch-blocker finding. Without it, a second coach is technically isolated but still operationally dependent on ops to add every client — which defeats the point of "independent" multi-tenancy. |
| *(Optional hardening, not on the critical path)* Extend RLS policies to newly coach-scoped tables for defense-in-depth | `[CAN WAIT]` `[MIGRATION]` (policy only) | **S** | Doesn't change real enforcement — Drizzle's direct Postgres connection bypasses RLS entirely for all app traffic today (`docs/catalyst-os-authentication.md:183`). Nice-to-have, not a gate. |
| Tenant isolation test suite proving the above actually works | `[BLOCKS COACH #2]` | **M** | Specified in full in §11. This is the verification gate for this entire phase — see §9. |

**No new tables are required for the core of Phase 2.** The `coachId` and
`createdBy` columns this phase depends on already exist; the work is
wiring and enforcement, not schema design.

---

## 6. Phase 3 — Subscription and Entitlement Enforcement

**Goal:** make "paid subscription" a real, enforced concept for coaches —
today it does not exist at all; any user flipped to `role='coach'` has
permanent, unmetered access.

| Item | Tags | Complexity | Notes |
|---|---|---|---|
| Coach pricing model decision (flat fee, per-seat, usage-based) | `[DECISION]` | — | Blocks everything else in this phase. |
| Create coach-plan Stripe Product/Price(s), distinct from existing end-client coaching-package prices (`Standard`/`Founding Member`/`Legacy`/`Executive Performance`) | External Stripe Dashboard config | — | Same category as other external-dashboard items already flagged in the audit; no code. |
| Extend webhook event normalization to distinguish a coach-platform-seat Price ID from a client-coaching-package Price ID, and route coach-plan events to a new handler path | `[APP-LAYER]` | **M** | `lib/stripe.ts` (`normalizeStripeEvent`, `packageFromPriceId`) already has a clean, extensible normalization layer — additive, not a rewrite. |
| Persist coach billing state | `[EXISTS]` (option a) / `[MIGRATION]` (option b) | **S (a) / M (b)** | Two viable approaches: **(a)** reuse `external_identities` — it already has the exact shape needed (`userId` FK to `users.id`, `provider: externalProviderEnum` already includes `"stripe_subscription"`, plus a `metadata` jsonb column for status/period) — zero migration, but status lives in untyped JSON. **(b)** add a small typed `coach_subscriptions` table (`coachId`, `stripeCustomerId`, `stripeSubscriptionId`, `status`, `currentPeriodEnd`) — one migration, but a typed status column beats filtering jsonb on the entitlement check's hot path. **Recommendation: (b).** Entitlement checks run on every `/hq` request path; a typed column is worth the one-time migration cost. |
| Entitlement enforcement on the coach guard path — extend `requireCoachOrAdmin()`/`requireCoachOrAdminPage()` (`lib/auth/guards.ts`) to check active billing status, not just role; define grace-period behavior for `past_due` | `[BLOCKS COACH #2]` `[DECISION]` (grace period) + `[APP-LAYER]` | **M** | This is the direct fix for the audit's #1 launch blocker: *"any `role='coach'` flip grants permanent unpaid access."* |
| Webhook-driven status sync: `customer.subscription.deleted`/`past_due` → suspend coach entitlement; reactivation → restore it | `[BLOCKS COACH #2]` `[APP-LAYER]` | **M** | Mirrors the client-side pipeline automation the webhook already documents as planned-but-unbuilt (`app/admin/page.tsx` TODO comments) — same pattern, applied to coach subscriptions. |
| Coach self-service billing via the **Stripe Customer Portal** (hosted by Stripe) rather than custom cancel/upgrade UI | `[CAN WAIT]` (past coach #2, before public launch) | **S–M** | One route to create a portal session plus a link — far cheaper than building Stripe mutation UI, and reduces PCI/compliance surface. |
| Billing event emails to the coach (payment failed, renewal, cancellation) via Resend | `[CAN WAIT]` | **S** | Reuses the existing email-sending pattern in the Stripe webhook handler. |

---

## 7. Phase 4 — Organizations and Multi-Coach Teams

**Goal:** support a paying entity (a gym, a coaching team) that owns
multiple coach seats and/or a shared client roster, distinct from a single
independent coach being the tenant.

**This entire phase is deferred by design.** Per the locked decision in
§3, nothing about launching or scaling with independent coaches requires
it, and building it speculatively risks guessing wrong about a shape no
real customer has validated yet. It is documented here so the eventual
work is scoped, not so it gets pulled forward.

| Item | Tags | Complexity | Notes |
|---|---|---|---|
| `organizations` table (id, name, billing-owner userId, stripeCustomerId) and `organization_members` (orgId, userId, org-scoped role) | `[CAN WAIT]` `[MIGRATION]` | **L** | Real migration; also requires deciding whether `coaching_enrollments.coachId` becomes org-aware or clients stay assigned to an individual coach *within* an org. |
| Org-scoped role model, separate from the global `users.role` enum (`client`/`coach`/`admin`) | `[CAN WAIT]` `[MIGRATION]` + `[DECISION]` | **M–L** | Don't overload the existing flat role enum with org-internal roles (e.g. "assistant coach") — model it in `organization_members.role` instead. |
| Billing consolidation: one subscription per org covering N coach seats, reconciled against Stripe subscription quantity | `[CAN WAIT]` `[APP-LAYER]` | **L** | Builds on Phase 3's entitlement plumbing rather than replacing it. |
| Intra-org data visibility rules: do all coaches in an org see every org client, or only their own assignments? | `[CAN WAIT]` `[DECISION]` | **M** | Determines whether Phase 2's per-coach scoping needs an org-wide override mode. Needs a real customer conversation — this is exactly the kind of assumption that's expensive to guess at without one. |

---

## 8. Phase 5 — Self-Serve Scale

**Goal:** remove Kynovant operations from the coach onboarding loop
entirely — public signup, automated provisioning, and the guardrails that
only matter once signup is public rather than invite-only.

Note the sequencing implication made explicit in §12: **coach #2 does not
require this phase.** A second coach can be safely onboarded via the same
ops-run provisioning process from Phase 1, once Phases 2–3's core items are
live and verified. Phase 5 is what turns that into a product anyone can
sign up for without Kynovant's involvement — a scale milestone, not a
safety one.

| Item | Tags | Complexity | Notes |
|---|---|---|---|
| Coach self-service signup: public signup page → Stripe Checkout for the coach plan → webhook-driven account provisioning (create the Supabase auth user via service role, create `coach_profiles`, set `role='coach'` on confirmed payment) | `[APP-LAYER]` | **L** | The rough shape is already sketched — and marked not implemented — in `docs/catalyst-os-authentication.md` under "Future: Onboarding-to-Auth Invitation Automation." Needs careful handling of abandoned checkouts, duplicate signups, and payment failing post-provisioning. |
| Flip every remaining `_coachId` placeholder to the real authenticated coach id everywhere it might still default | `[APP-LAYER]` | **S** | Should be small if Phase 2 was done correctly; verified by the isolation suite from §11, not assumed. |
| Admin bypass confirmation: the platform `admin` role must still see across all coaches for support/ops after coach-level scoping is live everywhere | `[APP-LAYER]` | **S–M** | Easy to break by accident while wiring §5's scoping — needs an explicit test, not an assumption. |
| Abuse/fraud guardrails on public signup: rate limiting, basic checkout fraud signals, spam-account prevention | `[CAN WAIT]` (low risk at low volume, but land before any real marketing push) | **M** | New risk surface that doesn't exist today because signup isn't public. |
| Per-tenant observability for Kynovant ops: coach health/usage/churn, distinguishable from any individual coach's own `/hq` view | `[CAN WAIT]` | **S–M** | Mostly a query/dashboard concern once the admin bypass above exists. |
| Retire the Phase 1 manual runbooks once self-serve signup + client invite are both live | `[CAN WAIT]` | — | Don't maintain both paths indefinitely. |

---

## 9. Non-Negotiables Before Coach #2

This is the hard gate. Onboarding a second coach — even manually, even
before Phase 5 exists — is unsafe until every item below is true. These are
drawn directly from the audit's top finding: multi-tenancy is unbuilt, and
it is safe today *only* because there is exactly one coach in production.

1. **Tenant scoping is wired, not stubbed.** Every `_coachId` seam in
   `lib/db/coach-dashboard-service.ts` and
   `lib/db/coach-client-workspace-service.ts` filters by the real
   authenticated coach — no function silently returns all clients
   regardless of caller. *(Phase 2)*
2. **Ownership enforcement is live on every mutation.** `assignProgramAction`,
   the goal actions, and all four check-in review actions verify the
   acting coach is actually enrolled with the target client before
   allowing any write — not just that the caller has `role='coach'`.
   *(Phase 2)*
3. **A second coach can operate independently.** The client invite flow
   exists and works — a new coach is not dependent on ops hand-running SQL
   to add their first client. *(Phase 2)*
4. **Entitlement is enforced, not assumed.** `role='coach'` alone no longer
   grants indefinite access; billing status is checked, and the
   webhook-driven suspend/reactivate loop is live. *(Phase 3, core items
   only — the Stripe Customer Portal and billing emails are not required
   for this gate.)*
5. **The tenant isolation test suite passes.** Documented and executed
   per §11 — proof, not assertion, that Coach A cannot see or mutate Coach
   B's clients, programs, blueprints, or check-ins through any page, API
   route, or server action. **This is the actual gate; items 1–4 are
   necessary but not sufficient without this verification step.**

None of these five require Phase 5 (self-serve signup) or Phase 4
(organizations). Coach #2 can be onboarded the same hand-run way the
founding coach was, the moment these five are true.

---

## 10. Deferred Work

Explicitly safe to postpone past the coach #2 milestone, and in most cases
past public self-serve launch as well:

- **All of Phase 4 (organizations, teams, gyms, franchises).** No
  evidence of demand exists yet; build only against a real customer
  requirement. The only prerequisite carried forward from earlier is the
  `tenantId`-abstraction discipline from §3, which costs nothing to
  maintain in the meantime.
- **RLS hardening on newly coach-scoped tables** (§5) — doesn't change
  real enforcement today since Drizzle bypasses RLS entirely; pure
  defense-in-depth, do opportunistically.
- **Stripe Customer Portal integration and coach billing emails** (§6) —
  coaches can function without self-service billing for a short window;
  land before a real marketing push, not before coach #2.
- **Signup abuse/fraud guardrails** (§8) — low risk at low signup volume;
  required before scaling marketing spend, not before the feature exists.
- **Per-tenant observability/admin dashboards** (§8) — an operations
  nice-to-have, not a launch dependency.
- **Phase 1's manual runbooks** — intentionally temporary; retire once
  Phase 5's self-serve signup and client-invite flow are both live rather
  than maintaining both paths in parallel.

---

## 11. Migration and Testing Strategy

### What requires a database migration

| Change | Phase | Required or optional |
|---|---|---|
| `coach_subscriptions` table (typed billing status) | 3 | Recommended over reusing `external_identities.metadata`; optional in the strict sense (reuse is viable), required for the recommended approach |
| RLS policy additions on coach-scoped tables | 2 | Optional hardening, not gating |
| `organizations` / `organization_members` tables | 4 | Deferred; not needed before coach #2 or public launch |
| **Not required:** any change to `coaching_enrollments`, `program_templates`, `workout_templates`, or `users` for Phases 1–3 core | — | The `coachId` and `createdBy` columns needed already exist |

### What is pure application-layer work (no migration)

- Wiring `_coachId` parameters to real values (Phase 2)
- Ownership checks on mutating server actions (Phase 2)
- Client invite flow (Phase 2)
- Entitlement guard extension (Phase 3)
- Webhook event routing for coach-plan events (Phase 3)
- Self-serve signup provisioning flow (Phase 5)

This split matters for sequencing risk: the Phase 2 work that gates coach
#2 is almost entirely query and route logic against an existing schema —
it does not carry migration risk, and can be developed and tested
incrementally without a cutover event.

### Tenant isolation test suite — required scope

This is the verification artifact for §9's gate. The project already has
`vitest` configured with existing test coverage under `lib/pil/__tests__`,
so this should follow the same pattern rather than introducing new tooling.
At minimum, the suite must prove, using two seeded coach accounts (Coach A,
Coach B) each with their own client:

1. **Every coach-facing read** (client list, mission control dashboard,
   individual client detail, program list, blueprint list, check-in queue)
   returns only the calling coach's own data — Coach A's queries never
   return Coach B's clients, programs, blueprints, or check-ins, and vice
   versa.
2. **Every coach-facing mutation** (`assignProgramAction`,
   `saveGoalAction`, `archiveGoalAction`, all four check-in review actions,
   and the new client invite action) rejects an attempt by Coach A to act
   on Coach B's client — this must be tested as an explicit negative case,
   not inferred from the read tests.
3. **The `admin` role bypass still works** after the above is enforced —
   admin queries and mutations are unaffected by coach-level scoping.
4. **Entitlement suspension is enforced independently of role** — a coach
   with `status='suspended'` or a lapsed subscription cannot access `/hq`
   regardless of role, matching the existing pattern already proven for
   `suspended`/`archived` client accounts.

This suite should run in CI on every change touching `lib/db/coach-*` or
`app/hq/**/actions.ts`, and should block merge on failure once it exists —
it is the regression guard against the exact bug class this whole roadmap
exists to close.

---

## 12. Final Recommended Sequence

1. **Phase 1** — founding coach ops runbook, manual billing, coach-facing
   check-in notification. *(No migration; can start immediately.)*
2. **Phase 2** — tenancy resolver decision, wire `_coachId` scoping,
   ownership enforcement on mutations, client invite flow, blueprint/program
   visibility decision, isolation test suite written and passing.
3. **Phase 3 core** (in parallel with the tail of Phase 2) — pricing
   decision, `coach_subscriptions` table, entitlement guard extension,
   webhook-driven suspend/reactivate sync.
4. **Onboard coach #2** — ops-assisted, using the same manual provisioning
   process as the founding coach. This is the real "coach #2" milestone,
   and it does **not** require Phase 5. Gate it strictly on §9 passing.
5. **Phase 5** — self-serve signup, abuse guardrails, Stripe Customer
   Portal, billing emails, per-tenant observability. This is public launch.
6. **Phase 4** — organizations. Only after a real multi-coach customer
   (a gym, a team) is in hand — not before, and not speculatively alongside
   Phase 5.

The throughline: **the first paid coach is a process problem, solvable
now; the second paid coach is an architecture problem, and must not be
solved by process** — that is the line this roadmap is built to hold.
