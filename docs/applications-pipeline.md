# Kynovant Coach Application Pipeline — Design Reference

**Status:** Implemented, admin-only. This document is the reference for
how "Apply as a Coach" intake works, why it's scoped the way it is, and
what it deliberately does not do yet.

**Architecture correction (this revision):** an earlier version of this
pipeline was mistakenly wired to `/apply` — Jermaine's personal, unrelated
physique-coaching client application. That was wrong: `/apply` has been
restored to its original behavior (a direct client-side POST to its own
Google Apps Script, no Supabase involvement, no relationship to anything
below), and the `applications` table now exists **exclusively** for
`/coach-apply` — coaches applying to become Kynovant SaaS customers. If
you are looking for Jermaine's coaching-client application pipeline, this
is not it; that flow has no server-side persistence layer at all, by
design (it never has, this document doesn't change that).

## What this is (and isn't)

The `applications` table is the authoritative record of **what a coach
applicant submitted through `/coach-apply`**
(`app/(site)/coach-apply/page.tsx`) and **where that specific submission
is** in Kynovant staff's qualify → schedule → decide workflow:

```
new → qualified → demo_scheduled → demo_complete → accepted
  ↳ declined (reachable from any non-terminal stage)
```

**This is not a general sales CRM.** It doesn't model outbound sequences,
multi-channel lead sourcing, deal ownership across a sales team, or
touchpoints that happen outside this one form. A design specification for
a broader Growth CRM exists at `docs/catalyst-os-growth-crm.md` — it is
**pending review/approval, not yet built**. Its §4.2 independently
proposes the same field shape used here (`name`/`email`/`phone`/
`businessStage`/`clientCount`/`context`/`referralSource`), which is a
strong signal this table's shape is correct, but its `application_events`/
`application_notes` append-only logs, its different dedup-by-status-bucket
rule, and its `growth_leads` handoff are intentionally **not** implemented
in this revision — see "Future Growth CRM linkage" below.

## Access model — admin-only, not just hidden navigation

This is Kynovant's own pipeline for acquiring *other* coaches as
customers. An ordinary coach account using Kynovant to run their own
business must never see it — not "the nav link is hidden," but actually
inaccessible:

- **Pages:** `/admin/growth/applications` and
  `/admin/growth/applications/[id]` sit behind
  `app/admin/growth/layout.tsx`, which calls `requireAdminPage()`
  (`lib/auth/guards.ts`) — a coach who is authenticated but not `role:
  'admin'` gets redirected to `/login?error=access_denied`, the same as
  an unauthenticated visitor.
- **Server actions:** `updateApplicationStatusAction` and
  `saveApplicationNotesAction`
  (`app/admin/growth/applications/[id]/actions.ts`) independently call
  `requireAdmin()` — actions bypass layouts/middleware entirely, so this
  is not redundant, it's the actual enforcement for that call path.
- **Data queries:** every function in `lib/db/application-service.ts` is
  `server-only` and is only ever called from the two guarded surfaces
  above, or from the intentionally-public, write/count-only submission
  path in `app/api/applications/route.ts` (which never returns another
  applicant's data back to a caller).
- **Navigation:** `components/hq/HQSidebar.tsx` has no "Applications"
  entry — but this is the *last* layer, not the only one. The three
  points above are what actually stop access; removing the nav link
  alone would not have.

`components/AdminGate.tsx` (a hardcoded client-side password gate used by
some older `/admin/*` pages) is explicitly **not** the model here — it's
documented, pre-existing security debt (see its own header comment) and
was deliberately not extended to this pipeline.

## Source of truth

Supabase/Postgres (`applications` table, `lib/db/schema-applications.ts`)
is authoritative. The Google Sheet (`COACH_APPLICATIONS_GAS_URL`) is a
**best-effort mirror only** — written server-side after the Supabase
insert/update succeeds. If the Sheets write fails, times out, or the env
var is simply unset, the application still exists and is still fully
usable at `/admin/growth/applications`; `sheetSyncedAt` stays `null` and
is visible on the detail page as a visible (not silent) sync gap.

## Duplicate-submission policy

Enforced in `submitApplication()` (`lib/db/application-service.ts`), not
at the schema level:

1. **Normalize** the email (`lower + trim`) into `normalizedEmail` — same
   convention as `users.normalizedEmail` in `lib/db/schema.ts`. The raw
   `email` column preserves exactly what the applicant typed.
2. Look for an existing application from the same `normalizedEmail` whose
   status is **not terminal** (`accepted`/`declined`) — i.e. still an open
   attempt.
3. **If one exists:** update it in place with the new answers, increment
   `resubmissionCount`, and reset `sheetSyncedAt` to `null` (the mirror
   needs to re-sync the refreshed answers). Return the *original* row's
   id and `createdAt`. This is what stops an accidental double-submit or
   repeated-click abuse from silently producing unlimited rows for one
   person — `resubmissionCount` is surfaced on both the admin list and
   detail views, never hidden.
4. **If none exists** — first-ever application, or every prior application
   from this email already reached a decision — insert a brand new row.
   A declined applicant reapplying later is a genuinely new attempt and
   gets its own original answers preserved as their own record, not
   merged into the old decision.

This means `email` is intentionally **not** a unique constraint in the
database — uniqueness is enforced conditionally (only against
non-terminal rows), which a plain unique index can't express. The dedup
check runs at write time in the service layer instead.

## Rate limiting / abuse protection

`app/api/applications/route.ts` enforces a DB-backed limit: **5
submissions per IP per rolling hour**, counted directly against the
`applications` table (`submitterIp` + `createdAt`, backed by
`idx_applications_ip_created_at`). No new infrastructure was introduced —
this reuses the Postgres connection the route already has.

Also enforced:
- Required-field and email-format validation.
- Per-field length caps (`MAX_LENGTHS` in the route) — bounds storage and
  blocks trivial payload-stuffing abuse without constraining any real
  applicant's answer.
- HTML-escaping of every field before it's interpolated into the admin
  notification email, closing a stored-HTML-injection-into-email risk
  that an earlier draft of this route did not guard against.
- The rate-limit check **fails open**: if the count query itself errors
  (e.g. a transient DB issue), the submission is allowed through rather
  than blocking a legitimate applicant on an unrelated failure.

**Known gaps, intentionally not closed here:**
- No protection against a distributed or IP-rotating abuser (the limit is
  purely per-IP).
- No CAPTCHA / bot-detection layer.
- No platform-level (Vercel Firewall/WAF) rate limiting configured.

These are real gaps, not oversights — closing them means either adopting
new infrastructure (e.g. Vercel BotID, a WAF rule, Upstash-backed
distributed rate limiting) or a product decision about acceptable friction
on a page explicitly designed to feel low-commitment. Recommended before
a real marketing push; not required at current expected volume.

## Secrets and response hygiene

`COACH_APPLICATIONS_GAS_URL` and the three `RESEND_*` variables are read
via `process.env` only inside server-only route/service files — never
sent to the browser, never interpolated into a response body. Failures in
the Sheets mirror or the admin email are logged server-side
(`console.error`/`console.warn`) only; the JSON response returned to the
applicant never contains these values or raw failure details, just
`{ ok, applicationId, resubmitted }` or a generic error string.

## Endpoint history — one canonical pipeline

`app/api/coach-applications/route.ts` — an earlier, non-persisting
version of this endpoint that only forwarded to Sheets/email and never
wrote to a database — has been **removed**. `/coach-apply` now posts
directly to `POST /api/applications`, the only public endpoint for
Kynovant coach applications. There is no redirect or shim at the old
path; anything still pointing at `/api/coach-applications` will simply
404.

## Future Growth CRM linkage (not implemented)

No `growth_leads` table exists as shipped code on this branch — only as a
design spec (`docs/catalyst-os-growth-crm.md`, pending approval). A
foreign key was **deliberately not added** rather than pointing at a
table that doesn't exist yet. When `growth_leads` is built:

- Add a nullable `growth_lead_id uuid` column to `applications`,
  referencing the new table's primary key with `ON DELETE SET NULL`.
- The Growth CRM lead should **not** duplicate applicant identity or
  re-store the submitted answers — it should hold CRM-specific state only
  and point back at this row for "what they actually told us when they
  applied."
- `applications` stays the immutable record of the submission.

This keeps the two systems cleanly separable: applications answers "what
was submitted and is it qualified/scheduled/decided," while the Growth
CRM (once built) answers "how are we pursuing this person across every
channel."

## Payment

Out of scope, unchanged. This flow has no payment step — applications are
submitted before any Stripe interaction occurs.
