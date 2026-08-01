# Founding Coach Golden Path Audit

**Scope:** Read-only walkthrough of the 11-step journey a first paying coach
customer would take through Kynovant: signup → subscription → client
onboarding → programming → client usage → coach review → billing management.

**Method:** Direct code reading across `app/`, `lib/`, `docs/`, and
`drizzle/` — no application code was modified, no database or external
dashboard was touched. Findings are anchored to specific files/lines.

**Headline finding:** Kynovant today is a **single-coach admin tool**, not a
multi-coach SaaS product. This is explicit in the code, not inferred:

```12:kynovant-rebrand-app/lib/db/coach-dashboard-service.ts
// Solo mode: Jermaine/admin sees all Catalyst Coaching clients.
// Multi-tenant seam: every public function accepts an optional
// `_coachId` parameter (unused today). When multi-tenancy ships,
// pass the authenticated coach's userId here and uncomment the
// coachingEnrollments join that filters by coachId.
```

Every step below should be read against that fact: the product was built to
run one coach's business (the Kynovant/Catalyst owner-operator), and is now
being evaluated as if it must onboard an unrelated second coach as a paying
customer. Almost every launch-blocking finding traces back to this single
gap.

---

## Legend

| Rank | Meaning |
|---|---|
| 🔴 **Launch blocker** | The first paying coach cannot complete the golden path, or their data/clients are unsafe, without this being fixed. |
| 🟠 **High priority** | The path technically works but only via manual/undocumented workarounds a real customer can't perform themselves. |
| 🟡 **Medium priority** | Works, but confusing, fragile, or a known landmine for the *next* coach. |
| ⚪ **Polish** | Cosmetic, minor ergonomics, or nice-to-have. |

---

## Step 1 — Coach signup and login

**Finding: 🔴 No coach signup exists — by design.**

The login page states this outright:

```296:app/login/page.tsx
Access is by invitation only.
No public account registration.
```

`supabase.auth.signInWithOtp` is called with `shouldCreateUser: false`
(`app/login/page.tsx:83`), and `docs/catalyst-os-authentication.md` confirms
the only way to grant `role = 'coach'` is:

```304:docs/catalyst-os-authentication.md
UPDATE public.users SET role = 'coach' WHERE email = 'coach@example.com';
```

There is no `auth.admin.inviteUserByEmail` / `auth.admin.createUser` call
anywhere in the repository (verified by grep across all `.ts`/`.tsx`
files) — the only account-creation path is a human with Supabase dashboard
access manually creating an auth user *and then hand-running SQL* to set
`role = 'coach'`.

Login itself (`app/login/page.tsx`, `app/auth/callback/route.ts`,
`app/auth/role-redirect/route.ts`, `middleware.ts`) is well-built: password
and magic-link modes, safe redirect allowlisting (`lib/auth/redirect.ts`),
generic error messages that don't leak account existence, session refresh
via cookie exchange. Once a coach account exists, logging in works cleanly
and lands them on `/hq`.

**What's missing:** any self-serve or semi-automated way for Kynovant to
turn "someone wants to pay for this" into a working coach login. Today that
requires the app's own operator to do it by hand, every time.

---

## Step 2 — Paid subscription or entitlement

**Finding: 🔴 There is no coach-level subscription, plan, or entitlement of any kind.**

Every Stripe touchpoint in the codebase — `app/api/stripe/webhook/route.ts`,
`lib/stripe.ts`, the billing tables in `app/admin/page.tsx` — models
**Kynovant's own clients** paying **Kynovant** for a coaching package
(`Standard`, `Founding Member`, `Legacy`, `Executive Performance` —
`lib/db/schema.ts` `coachingPackageEnum`). There is no code, schema table,
or Stripe Price ID anywhere that represents a *coach* paying Kynovant for
platform access.

Consequences:
- `requireCoachOrAdmin()` (`lib/auth/guards.ts:117`) only checks `role`. Once
  a user is flipped to `role = 'coach'` by SQL, they have **permanent,
  unmetered, unpaid access to all of HQ** — there is no subscription check,
  trial expiry, or seat limit anywhere in the guard chain.
- There is nothing to cancel. "Paid subscription" for a coach doesn't exist
  as a concept, so step 11 (billing/cancellation) has no coach-facing
  counterpart either — see Step 11.

**What's missing:** a product decision on how coaches actually pay (Stripe
Billing subscription tied to `role = 'coach'`? a manual invoice? seat-based?)
and the entitlement check that gates `/hq` on it.

---

## Step 3 — Coach creates or invites a client

**Finding: 🔴 There is no "add client" feature anywhere in the product.**

`app/hq/clients/page.tsx` renders `ClientsDirectory` from
`listCoachClients()` — a **read-only list**. There is no "New Client" /
"Invite Client" button, form, server action, or API route anywhere in
`app/hq/`. Confirmed by grep: `auth.admin.inviteUserByEmail` /
`admin.createUser` do not appear anywhere in the repo, and the HQ sidebar
(`components/hq/HQSidebar.tsx:26-33`) has no such nav item.

More critically, the four tables required to make a client visible and
usable in the product are **never inserted by any production code path**:

| Table | Inserted by |
|---|---|
| `coaching_enrollments` (links client → coach, `lib/db/schema.ts:250`) | Only `scripts/seed-demo-client.ts` (demo/dev fixture) |
| `client_profiles` | No production insert found anywhere |
| `coach_profiles` | No production insert found anywhere, ever |

`getCoachData()` (`lib/db/portal-dashboard-service.ts:833`) `INNER JOIN`s
`coachingEnrollments` → `coachProfiles` to show the client which coach they
have — if `coach_profiles` was never populated for the coach account (which,
per the table above, it never is by any UI), this silently returns `null`
and the client's dashboard just won't show their coach's name/avatar. No
error, no warning — it degrades quietly.

Separately, the public marketing site's signup/payment flow
(`components/OnboardingWizard.tsx:376`) posts client onboarding data to a
**Google Apps Script URL**, i.e. a Google Sheet — a completely different,
disconnected system from the Postgres/Drizzle-backed HQ/Portal product. A
client who pays through the public checkout funnel does **not** get a
`users`/`client_profiles`/`coaching_enrollments` row created. Someone has to
manually bridge the Sheet → Supabase/Postgres by hand.

**What's missing:** an actual "invite client" flow in HQ that, in one
action, creates the Supabase auth user (invite email), the `public.users`
row, `client_profiles`, and `coaching_enrollments` — and does it for the
*correct* coach.

---

## Step 4 — Coach creates a blueprint

**Finding: ✅ Works. No blocker.**

`app/hq/blueprints/page.tsx` → `POST /api/internal/workout-templates`
(`app/api/internal/workout-templates/route.ts`, guarded by
`requireCoachOrAdmin`) creates a workout template, then routes to
`app/hq/blueprints/[id]/page.tsx` for section/exercise editing via a full
sub-API (`.../[id]/sections`, `.../[id]/exercises`, `.../[id]/validate`,
etc.). This is a mature, fully-built feature.

🟡 **Medium:** Because `/hq` is solo-mode, a second coach's blueprints are
visible to and editable by every other coach (same root cause as Step 3's
multi-tenancy gap — see the cross-cutting Security section below).

---

## Step 5 — Coach creates a program

**Finding: ✅ Works. No blocker.**

`app/hq/programs/page.tsx` → `POST /api/internal/programs`
(guarded, `requireCoachOrAdmin`), with week-building, cloning
(`/[id]/clone`), and import (`/[id]/import`) sub-routes. Also mature and
fully built.

🟡 Same solo-mode visibility caveat as Step 4.

---

## Step 6 — Coach assigns the program

**Finding: ✅ Works, with an ownership gap flagged in the code itself.**

`assignProgramAction` (`app/hq/clients/[clientId]/actions.ts:60`) archives
the client's current program and creates the new assignment via
`archiveAndAssignProgram`. Functionally solid — but the code has its own
TODO admitting the gap:

```23:app/hq/clients/[clientId]/actions.ts
// TODO (multi-tenancy): assertCoachOrAdmin validates role only, not
// coach→client ownership. Once multi-tenancy ships, join
// coachingEnrollments here and confirm the acting coach is enrolled
// with the target clientId.
```

🟡 **Medium today, 🔴 launch blocker the moment a second coach exists:** any
authenticated coach can assign a program (or archive an existing one) to
*any* client in the system, not just their own. Same pattern repeats in
`saveGoalAction`, `archiveGoalAction` (same file) and the check-in review
actions (Step 10).

---

## Step 7 — Client logs in

**Finding: ✅ Works well.**

`app/setup-password/page.tsx` handles first-time password creation from an
invite link; `app/login/page.tsx` handles subsequent logins (password or
magic link); `middleware.ts` + `lib/auth/guards.ts` protect `/portal`.
Session refresh, suspended/archived account handling, and safe-redirect
logic are all solid.

The only gap is upstream: per Step 3, nothing in the product actually gets
a client to the point of having an invite link to click. Once a client
account exists (created by hand), login itself is not a blocker.

---

## Step 8 — Client views and completes a workout

**Finding: ✅ Works. No blocker.**

`app/portal/program/page.tsx` (client's active program view),
`components/portal/TodayWorkout.tsx` and `WorkoutSession.tsx` (live set
logging, rest timers, finish flow → `POST /api/portal/workout-session`),
and `WorkoutHistory.tsx` are all complete, well-built features. API routes
are correctly scoped to `guard.authUser.id` (`app/api/portal/workout-session/route.ts:28`),
so a client cannot log sets against another client's session.

---

## Step 9 — Client submits a check-in

**Finding: ✅ Works. No blocker.**

`app/portal/check-ins/actions.ts` — `saveDraftCheckInAction`,
`submitCheckInAction`, `editSubmittedCheckInAction` — all correctly call
`requireClientUser()` and scope every mutation to `dbUser.id`. Field
validation happens server-side (`lib/db/check-in-validation.ts`) before
touching the database. This is one of the most carefully built parts of the
codebase.

---

## Step 10 — Coach reviews the workout and check-in

**Finding: 🟠 Works, but the coach has to go looking for it — there is no notification.**

`app/hq/check-ins/page.tsx` and `[checkInId]/page.tsx` +
`[checkInId]/actions.ts` (`startReviewAction`, `saveDraftResponseAction`,
`markReviewedAction`, `reopenCheckInAction`) form a complete review
workflow, and `markCheckInReviewed` does call
`createNotification()` (`lib/db/coach-check-in-service.ts:432`) — but that
notification is **for the client** ("your coach responded"), not the coach.

Grep across `lib/db/*.ts` shows `createNotification` is called from exactly
one place in the entire codebase — the coach's response, not the client's
submission. There is no email, in-app badge push, or any signal that tells
a coach "a client just submitted a check-in that needs review." The coach
must manually revisit `/hq/check-ins` to find out. Resend (the transactional
email provider) is wired up only for Stripe webhook events
(`app/api/stripe/webhook/route.ts`), not for check-in activity.

Same multi-tenancy TODO as Step 6 applies here too
(`app/hq/check-ins/[checkInId]/actions.ts:16-18`): review actions validate
role, not coach→client ownership.

---

## Step 11 — Coach manages billing or cancellation

**Finding: 🔴 There is no billing management UI for coaches, and no cancellation action anywhere in the product.**

`app/admin/page.tsx` (2,021 lines) is entirely **read/display** — it shows
Stripe webhook event history and a manually-maintained lead pipeline. Grep
for `stripe.subscriptions.update`, `.cancel`, `.del`, or `refunds.create`
across the repo returns **zero results**. The only place "Cancelled" exists
in code is as a display label driven by webhook events already received —
nothing in the app *causes* a cancellation. The in-code TODOs
(`app/admin/page.tsx:944-946, 1174-1176`) explicitly describe this as
unbuilt future work ("Phase 3 — Pipeline automation").

This matches Step 2: since there's no coach-level subscription in the first
place, "coach manages their own billing" has no product surface to exist
in. What *does* exist (`/admin`) is for managing the coaching business's
own client billing (end-client packages), and even that is view-only —
any actual Stripe mutation (cancel a client's subscription, issue a refund)
has to happen directly in the Stripe Dashboard.

Separately: 🟡 a coach has **no account/settings page of their own**.
`/account` (`app/account/page.tsx`) calls `requireClientUser()`, which
checks status but not role (`lib/supabase/session.ts:82-105`) — so a coach
*can* technically load `/account` (the redirect matrix in
`lib/auth/redirect.ts` even sends them there), but the page queries
`getClientProfile(dbUser.id)` and related client-only tables, all of which
return empty for a coach. The result is a coach seeing a blank "Account"
page with dashes for every field and a functioning logout button — not
broken, but clearly not built for them.

---

## Cross-cutting: Security & permissions

🔴 **Multi-tenancy is not implemented anywhere it matters.** This is the
single biggest structural issue and touches nearly every HQ surface:

- `listCoachClients`, `getCoachMissionControl`, and every other function in
  `lib/db/coach-dashboard-service.ts` accept an unused `_coachId` parameter
  and return **every client in the database**, regardless of which coach is
  logged in (confirmed via `_coachId?: string, // reserved for future
  multi-tenant filter` at lines 196, 324, 416, 455).
- `lib/db/coach-client-workspace-service.ts:242` has the identical unused
  `_coachId` pattern.
- Every coach-facing server action that mutates client data
  (`assignProgramAction`, `saveGoalAction`, `archiveGoalAction` in
  `app/hq/clients/[clientId]/actions.ts`; `startReviewAction`,
  `saveDraftResponseAction`, `markReviewedAction`, `reopenCheckInAction` in
  `app/hq/check-ins/[checkInId]/actions.ts`) checks `role === 'coach' ||
  role === 'admin'` and stops there — it never checks that the acting coach
  is actually enrolled with that client. The code says as much in its own
  comments.

This is **safe today only because there is exactly one coach in
production.** The instant a second `role = 'coach'` account is created (the
literal subject of this audit — "the first paying coach"), that coach can
view and edit every existing client's health data, workout programs, and
check-in responses, and vice versa. This needs to be fixed *before*, not
after, a second coach is onboarded — retrofitting authorization after real
customer data exists across two tenants is much riskier than building it
now while there's only one.

🟢 Everything else audited on the security side is solid: JWT is
re-validated server-side on every guarded call (never trusted from
cookies/claims), 401 vs 403 is used correctly, suspended/archived accounts
are denied uniformly, object-level ownership checks exist and are correct
for workout sessions (`authorizeWorkoutSession`) and check-ins (all
`dbUser.id`-scoped), RLS is enabled defense-in-depth even though Drizzle
bypasses it, and login/password-reset flows never leak account existence.

---

## External dashboard configuration required

None of the following can be fixed by editing this repo — they're
operational prerequisites for the golden path to work at all, and are not
verifiable from the codebase alone:

| System | What must be configured | Why it matters to this golden path |
|---|---|---|
| **Supabase Auth** | Site URL = `https://kynovant.com`, redirect URLs include `/auth/callback` (`docs/catalyst-os-authentication.md:222-225`); email provider enabled, magic link confirm ON | Steps 1, 7 — login is broken end-to-end if this drifts |
| **Supabase Dashboard (manual)** | Every coach and client account today is created here by hand (`Authentication → Users → Add/Invite user`), then role is set via raw SQL | Steps 1, 3 — this *is* the current signup/invite mechanism, not a fallback |
| **Stripe** | Webhook endpoint registered at `https://www.kynovant.com/api/stripe/webhook`; Price IDs mapped in `packageFromPriceId` (`lib/stripe.ts`) | Step 2, and end-client payment — no coach-plan prices exist to create |
| **Google Apps Script / Sheets** | Two GAS deployments (`SHEETS_APPLICATIONS_GAS_URL`, `SHEETS_ONBOARDING_GAS_URL`) receive marketing-site signups; `STRIPE_EVENTS_GAS_URL` persists webhook events | Step 3 — the actual destination for public-site client signups, disconnected from HQ (see Step 3 finding) |
| **DocuSign** | Template + webhook secret for client agreements (`app/api/docusign/*`) | Not on the coach's own path, but blocks end-client onboarding if misconfigured |
| **Resend** | Sending domain verified for the `from` address used in Stripe webhook emails | Only wired for client payment emails today — irrelevant to coach notifications since none exist (Step 10) |

---

## Ranked issue summary

### 🔴 Launch blockers
1. No coach signup — accounts are created entirely by hand via Supabase dashboard + raw SQL (Step 1).
2. No coach-level subscription/entitlement — any `role='coach'` flip grants permanent unpaid access; nothing to cancel (Step 2).
3. No "create/invite client" feature — `coaching_enrollments`, `client_profiles`, `coach_profiles` are never inserted by any UI-driven code path (Step 3).
4. Multi-tenancy unimplemented across HQ — a second coach can view/edit every other coach's clients (Cross-cutting Security).
5. Public-site checkout/onboarding (Google Sheets) is disconnected from the Postgres-backed HQ/Portal — paying clients don't automatically become usable product records (Step 3).
6. No billing/cancellation actions anywhere in the app — `/admin` is display-only; all Stripe mutations require the Stripe Dashboard directly (Step 11).

### 🟠 High priority
- No notification to the coach when a client submits a check-in — must manually poll `/hq/check-ins` (Step 10).
- `coach_profiles` row is required for the client dashboard's "coach presence" block but is never created anywhere — silently degrades to missing name/avatar (Step 3).
- Ownership-blind server actions (`assignProgramAction`, goal actions, check-in review actions) — role-only checks, explicitly flagged as TODO in the code (Steps 6, 10).

### 🟡 Medium priority
- Coach has no functional `/account` page — loads but renders entirely empty client-shaped fields (Step 11).
- HQ nav has no "Billing," "Invite," or "Settings" entry at all (`components/hq/HQSidebar.tsx`) — reinforces that these aren't just hidden, they don't exist.
- Solo-mode data visibility for blueprints/programs (Steps 4, 5) — same root cause as the cross-cutting multi-tenancy gap, listed separately because the blast radius (templates, not client PII) is lower.

### ⚪ Polish
- `env.local.example` embeds two live, real Google Apps Script `/exec` URLs as example values — unlisted-bearer-token-style endpoints checked into a template file (pre-existing, noted in `docs/kynovant-rebrand-audit.md` §6 as well).
- No `/hq/schedule` or `/hq/documents` yet — explicitly marked `comingSoon` in the sidebar, not a surprise, just noting for completeness.

---

## Five most urgent blockers

1. **No coach-level entitlement/subscription check.** `requireCoachOrAdmin()` grants full, permanent HQ access to anyone with `role='coach'` in the database, with no concept of payment, trial, or expiry. This has to exist before "paid subscription" means anything.
2. **No way to create a coach account short of direct database/dashboard access.** Login itself works; getting *to* an account does not.
3. **No way to create or invite a client from inside the product.** The four tables needed (`users`, `client_profiles`, `coaching_enrollments`, and the coach's own `coach_profiles`) have no UI-driven insert path anywhere.
4. **No coach→client ownership enforcement.** Every HQ list and every coach-facing mutation is coach-agnostic today ("solo mode"). This is the one item that turns from "fine because there's one coach" into "customer data breach" the moment a second coach is onboarded — it should be fixed *before* that happens, not discovered after.
5. **The public marketing-site signup funnel and the Postgres-backed coaching product are two disconnected systems** (Google Sheets vs. Drizzle/Supabase). A paying client from the public site does not become a usable client record without manual intervention.

## Recommended smallest sellable pilot scope

Given the above, the fastest path to a real first paying coach is **not**
"build full multi-tenant SaaS" — it's to sell a **manually-provisioned,
single-tenant seat** while the multi-tenancy work happens in parallel:

- Kynovant (the operator) manually provisions the founding coach's account
  and their first few clients via the Supabase dashboard + direct SQL,
  exactly as is done today for the existing coach — this is a real,
  working path, just not a self-serve one.
- Bill the founding coach manually (invoice, or a single hand-created Stripe
  subscription) rather than building the coach-billing system for one
  customer.
- Before allowing a *second* coach onto the platform, the multi-tenancy gap
  (coachId scoping on every HQ list + ownership checks on every coach
  mutation) must be closed — this is the one item that is genuinely unsafe
  to skip, since it's the difference between "manual is annoying" and "one
  customer can see another customer's clients."
- Everything downstream of a provisioned account — blueprints, programs,
  assignment, client workout logging, check-ins, coach review — is already
  solid enough to run a real pilot on as-is.

This scopes the pilot to "one coach at a time, fully hand-held by
Kynovant ops," which sidesteps blockers 1–3 and 5 above (self-serve signup,
entitlement, client invite, funnel integration) as *deliberately deferred*
rather than *broken*, while treating blocker 4 (multi-tenant data isolation)
as the one item that must be fixed before a second paying coach — not
before the first.
