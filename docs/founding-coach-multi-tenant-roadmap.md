# Multi-Tenant Roadmap: From Single-Coach Tool to Production SaaS

**Follows:** `docs/founding-coach-golden-path-audit.md` — read that first. This
document turns its findings into a sequenced build plan.

**Scope:** Planning only. No application code was written or modified to
produce this document — it is a read-only continuation of the audit.

**Complexity scale** (rough solo/small-team effort, not calendar deadlines):

| Size | Meaning |
|---|---|
| **S** | Days. Localized change, low risk, no schema migration. |
| **M** | ~1–2 weeks. Touches several files/routes, may need a small migration. |
| **L** | 2–4 weeks. Cross-cutting change, real migration, needs careful testing. |
| **XL** | 4+ weeks or needs a design spike before sizing is even reliable. |

Grounding note: the schema is in better shape for this than a green-field
rebuild would suggest. `coaching_enrollments.coachId` already exists,
`program_templates`/`workout_templates` already have `createdBy`, and
`external_identities` already has the provider/metadata shape needed for
Stripe mappings beyond client billing. Several items below are "wire up
what's stubbed," not "build from nothing" — called out per item.

---

## Phase 1 — Immediate blockers before the first paid coach

Goal: get one real, paying coach onto the platform safely, without
pretending the product is self-serve yet. Everything here is deliberately
interim — Phase 5 replaces most of it with real product surfaces.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 1.1 | Write a documented provisioning runbook (or a single ops script) that creates a coach account correctly in one pass: Supabase auth user → `users.role='coach'` → `coach_profiles` row. Today only step one of three is ever done reliably (per audit Step 3 finding — `coach_profiles` is never inserted anywhere). | **S** | Prevents the silent "coach presence" degradation already found in `getCoachData()`. |
| 1.2 | Same runbook, client side: auth user → `client_profiles` → `coaching_enrollments` scoped to the founding coach. Bypass the Google Sheets funnel entirely for this pilot rather than trying to bridge it. | **S** | Formalizes the workaround the audit already identified as the only thing that currently works. |
| 1.3 | Manual billing for the founding coach — a hand-created Stripe subscription or a simple invoice, tracked outside the app. No code. | **S** | Defer real entitlement logic to Phase 3; don't build it for a single customer. |
| 1.4 | Ops process for suspending the coach if payment lapses: set `users.status='suspended'`. The mechanism already exists and is already enforced by every guard (`resolveSession()` in `lib/auth/guards.ts`) — this is a runbook, not new code. | **S** | Confirm this in a real dry run before relying on it. |
| 1.5 | Coach-facing check-in notification (email via Resend, or an in-app unread badge) so the founding coach isn't manually polling `/hq/check-ins`. Extends the existing `createNotification()` pattern in `lib/db/coach-check-in-service.ts`, which today only fires toward the client. | **M** | Not launch-blocking in the security sense, but the pilot is not usable day-to-day without it. |
| 1.6 | Fix the `/account` page for a coach identity: either redirect coaches to a coach-appropriate page, or add a minimal branch. Today `requireClientUser()` doesn't check role, so a coach silently gets an empty client-shaped page. | **S** | Low risk, easy win, avoids a confusing first impression for the founding coach. |

**Nothing in Phase 1 requires a schema migration.** It's process plus small,
low-risk code additions. This phase can ship in parallel with the start of
Phase 2.

---

## Phase 2 — Required architecture changes

Goal: build the scaffolding that Phases 3–5 all depend on. This is the
highest-leverage phase — get it wrong and Phase 4/5 require a re-migration
later.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 2.0 | **Decide the tenancy boundary now, before writing any scoping code.** Two real options: (a) *coach-as-tenant* — each coach is their own isolated tenant, matches the schema's existing `coachingEnrollments.coachId` today; (b) *organization-as-tenant* — a coach belongs to an org, and the org is the real boundary (needed for Phase 4 gyms/teams). Recommendation: model the abstraction as a generic `tenantId` resolver from day one (resolves to `coachId` today, could resolve to `organizationId` later) so Phase 4 doesn't force a second migration of every scoped query. | **Decision, not code** | This single decision determines whether Phase 4 is a schema addition (cheap) or a schema rewrite (expensive). Make it explicitly, don't let it default. |
| 2.1 | Wire the already-stubbed `_coachId` parameters into real filters. `lib/db/coach-dashboard-service.ts` and `lib/db/coach-client-workspace-service.ts` already accept `_coachId?: string, // reserved for future multi-tenant filter` on every relevant function — the join through `coachingEnrollments` just needs to be uncommented/written and the underscore dropped. | **M** | Genuinely smaller than a green-field build because the seam already exists everywhere it's needed. |
| 2.2 | Add coach→client ownership checks to every mutating server action that currently checks role only: `assignProgramAction`, `saveGoalAction`, `archiveGoalAction` (`app/hq/clients/[clientId]/actions.ts`), and `startReviewAction`, `saveDraftResponseAction`, `markReviewedAction`, `reopenCheckInAction` (`app/hq/check-ins/[checkInId]/actions.ts`). All six already have the exact TODO comment describing what's needed. | **M** | This is the fix for the audit's top cross-cutting security finding. Straightforward once 2.0/2.1 are settled — it's the same join, applied at the mutation boundary instead of the read boundary. |
| 2.3 | Centralize the duplicated inline `assertCoachOrAdmin()` helper (currently hand-copied in two different `actions.ts` files instead of importing the one in `lib/auth/guards.ts`) into a single ownership-aware guard, e.g. `assertCoachOwnsClient(coachId, clientId)`. | **S** | Cleanup that directly de-risks 2.2 — one implementation to get right instead of three. |
| 2.4 | Decide the ownership/visibility model for `program_templates` and `workout_templates` (blueprints and programs). They already have `createdBy` (references `users.id`) — the schema question is whether that becomes the enforcement field (coach-private library) or stays informational (shared platform library coaches can all use/clone). | **Decision + M** | No new column needed either way — `createdBy` already exists. The complexity is in the query/visibility logic and the UX decision (private library vs. shared-with-clone), not in a migration. |
| 2.5 | *(Optional hardening, not on the critical path)* Extend RLS policies to the newly coach-scoped tables for defense-in-depth. Today RLS only covers `users`, `client_profiles`, `coaching_enrollments`, and Drizzle's direct Postgres connection bypasses RLS entirely for all real app traffic — so this doesn't change actual enforcement, only adds a second independent layer. | **S** | Nice-to-have; do it opportunistically, don't let it block 2.1–2.3. |

**Gate:** Phase 2 must be fully complete and verified (see Phase 5's isolation
testing item) before a second coach account is ever created in production —
this is the audit's "fix before, not after" finding.

---

## Phase 3 — Subscription and entitlement model

Goal: make "paid subscription" a real thing for coaches, not just for
Kynovant's own end clients.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 3.1 | Product decision: coach pricing model (flat monthly platform fee, per-seat, usage/client-count-based, etc.) and how it maps to Stripe Products/Prices. | **Decision, not code** | Blocks everything else in this phase — do this before touching Stripe. |
| 3.2 | Create the coach-plan Stripe Product/Price(s) in the Stripe Dashboard, distinct from the existing end-client coaching-package prices (`Standard`/`Founding Member`/`Legacy`/`Executive Performance`). | **External config** | No code; a Stripe Dashboard task, same category as the other external-dashboard items already flagged in the audit. |
| 3.3 | Extend the webhook's event normalization (`lib/stripe.ts` — `normalizeStripeEvent`, `packageFromPriceId`) to distinguish "this Price ID is a coach platform seat" from "this Price ID is a client coaching package," and route coach-plan events to a new handler path. | **M** | The webhook already has a clean, extensible normalization layer to build on — this is additive, not a rewrite. |
| 3.4 | Persist coach billing state. Two viable approaches: **(a)** reuse `external_identities` (`userId` = coach id, `provider = 'stripe_subscription'`, status/period stored in the existing `metadata` jsonb column) — zero migration, less queryable; **(b)** add a small typed `coach_subscriptions` table (coachId, stripeCustomerId, stripeSubscriptionId, status, currentPeriodEnd) — one migration, cleaner for entitlement checks and reporting. | **S (a) / M (b)** | Recommend (b) — entitlement checks run on every `/hq` request-ish path (see 3.5), and querying a typed status column beats filtering jsonb metadata on a hot path. |
| 3.5 | Add entitlement enforcement to the coach guard path. Extend `requireCoachOrAdmin()`/`requireCoachOrAdminPage()` (`lib/auth/guards.ts`) to check active billing status, not just role. Decide grace-period behavior (e.g., `past_due` gets read-only access for N days before `suspended`). | **M** | This is the fix for the audit's #1 launch blocker ("any `role='coach'` flip grants permanent unpaid access"). |
| 3.6 | Webhook-driven status sync: `customer.subscription.deleted`/`past_due` → set coach entitlement state; `customer.subscription.updated` (active) → restore it. Mirrors the client-side pipeline automation the webhook already documents as planned-but-unbuilt (`app/admin/page.tsx` TODO comments). | **M** | Same pattern as existing TODOs, just implemented for coach subscriptions instead of client ones. |
| 3.7 | Coach self-service billing management: point coaches at the **Stripe Customer Portal** (hosted by Stripe) rather than building custom cancel/upgrade UI. Needs one route to create a portal session + a link in the coach's account page. | **S–M** | Much cheaper than building Stripe mutation UI from scratch — reuses Stripe's own hosted flow, which also reduces PCI/compliance surface. |
| 3.8 | Billing event emails to the coach (payment failed, upcoming renewal, subscription cancelled) via Resend, following the existing email-sending pattern in the Stripe webhook handler. | **S** | Same helper pattern already used for client welcome emails. |

---

## Phase 4 — Organization ownership

Goal: support a paying entity (a gym, a coaching team) that owns multiple
coach seats and/or a shared client roster — distinct from one individual
coach being the tenant.

**Recommendation: treat this phase as deferred, not blocking.** Nothing in
the golden path or the first several paying coaches requires it. Build it
only when a real customer needs it — the cost of guessing wrong on org
shape now is higher than the cost of waiting. The only thing Phase 4 truly
demands *in advance* is the `tenantId`-abstraction decision already called
out in 2.0.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 4.1 | Schema: new `organizations` table (id, name, billing-owner userId, stripeCustomerId) and `organization_members` (orgId, userId, org-scoped role: owner / coach / assistant). | **L** | Real migration; also needs a decision on whether `coaching_enrollments.coachId` becomes `organizationId`-aware or clients stay assigned to an individual coach *within* an org. |
| 4.2 | Org-scoped role model, separate from the global `users.role` enum (`client`/`coach`/`admin`). An org "assistant coach" likely needs a different permission set than a full coach. | **M–L** | Don't overload the existing flat role enum — this wants its own table (`organization_members.role`), consistent with how Postgres/Drizzle already models roles elsewhere in this schema. |
| 4.3 | Billing consolidation: one subscription per org, covering N coach seats, with seat count reconciled against Stripe subscription quantity. | **L** | Builds on Phase 3's entitlement plumbing rather than replacing it. |
| 4.4 | Data visibility rules inside an org: do all coaches in an org see every org client, or only their own assignments? This determines whether the Phase 2 per-coach scoping needs an "org-wide" override mode. | **Decision + M** | Needs a real customer conversation before building — this is exactly the kind of assumption that's expensive to guess at. |

---

## Phase 5 — Multi-coach support

Goal: actually turn on independent, self-serve coach #2 (and beyond).
This is where Phases 2 and 3 become a real, live product rather than
scaffolding.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 5.1 | Coach self-service signup: public signup page → Stripe Checkout for the coach plan → webhook-driven account provisioning (create the Supabase auth user via the service role, create `coach_profiles`, set `role='coach'` once payment is confirmed). The rough shape of this is already sketched (and marked "not implemented") in `docs/catalyst-os-authentication.md`, under "Future: Onboarding-to-Auth Invitation Automation." | **L** | Needs careful handling of edge cases: abandoned checkout after account creation, duplicate email signup attempts, payment failing after provisioning. |
| 5.2 | Coach-driven client invite flow inside HQ — the actual UI/action the audit found completely missing: a form that calls `auth.admin.inviteUserByEmail` (service role) and creates `client_profiles` + `coaching_enrollments` scoped to the inviting coach in one transaction. | **M** | This is the audit's #3 launch blocker, finally getting a real UI instead of manual SQL. |
| 5.3 | Flip every `_coachId` seam from Phase 2 to the real authenticated coach id everywhere it's still using a placeholder/default. | **S** | Should be small *if* Phase 2 was done correctly — mostly deleting underscores and passing real values, verified by the isolation tests in 5.6. |
| 5.4 | Resolve the blueprint/program visibility decision from 2.4 in the UI: either a private-by-coach library, or a "clone shared template into your library" action if templates stay platform-shared. | **M–L** | Depends entirely on which direction 2.4 went. |
| 5.5 | Admin bypass: confirm the platform `admin` role can still see across all coaches/tenants for support and operations, even after coach-level scoping goes live everywhere. | **S–M** | Easy to break by accident when wiring 2.1/5.3 — needs an explicit test, not just an assumption. |
| 5.6 | **Tenant isolation test suite** (automated, or at minimum a documented, repeatable manual QA script): prove Coach A cannot view or mutate Coach B's clients, programs, blueprints, or check-ins through any page, API route, or server action. | **M** | This is the hard gate — see below. Don't allow coach #2 into production without this passing. |
| 5.7 | Abuse/fraud guardrails on public self-serve signup: rate limiting, basic fraud signals on checkout, protection against spam account creation now that signup is public rather than invite-only. | **M** | New risk surface that doesn't exist today because signup isn't public yet. |
| 5.8 | Per-tenant observability for Kynovant ops: coach health/usage/churn visibility, distinguishable from any individual coach's own `/hq` view. Likely extends the existing `admin` role rather than inventing a new one. | **S–M** | Mostly a query/dashboard concern once 5.5's admin bypass exists. |

---

## What must be done before public launch

"Public launch" here means opening self-serve coach signup (Phase 5.1) to
anyone, not just the hand-held founding coach from Phase 1. Before that
point:

**Non-negotiable:**
- **All of Phase 2** — tenant scoping (2.1) and ownership enforcement (2.2)
  must be live and correct. This is the one item where shipping without it
  means real customer data exposure between coaches, not just a rough edge.
- **Phase 3.5 and 3.6** — entitlement enforcement and webhook-driven
  suspend/reactivate. Public signup without automated entitlement checks
  means anyone can get permanent free access the moment they're marked
  `role='coach'`.
- **Phase 5.6, the isolation test suite** — this is the gate that actually
  proves 2.1/2.2 work, not just that they were written. Treat it as a
  release blocker for turning on coach #2, the same way the audit treated
  it as the top cross-cutting risk.
- **Phase 5.1 and 5.2 together** — there's no point opening signup (5.1)
  without the client invite flow (5.2); a coach who signs up and pays but
  still can't add a client has just paid for a demo.

**Should happen before launch but is lower-risk if sequenced right after:**
- Phase 3.7/3.8 (self-service billing portal, billing emails) — coaches can
  function without these for a short window, but it's a poor first
  impression and generates support load fast.
- Phase 5.7 (signup abuse guardrails) — low risk at very low signup volume,
  but should land before any real marketing push.

**Explicitly fine to defer past launch:**
- **All of Phase 4 (organizations).** Nothing about a working multi-coach
  SaaS requires org support on day one — only build it when a real
  multi-coach customer (a gym, a team) is in hand. The only thing Phase 4
  needs *in advance* is the tenancy-abstraction decision in 2.0, so that
  adding orgs later is additive rather than a second migration.
- Phase 1's manual runbooks — these are meant to be replaced by Phase 5,
  not maintained alongside it. Once 5.1/5.2 ship, retire them rather than
  running both paths in parallel indefinitely.
