# Coaching Application Pipeline — Design Reference

**Status:** Implemented. This document is the reference for how the
"Apply for Coaching" intake works, why it's scoped the way it is, and what
it deliberately does not do yet.

## What this is (and isn't)

The `applications` table is the authoritative record of **what a coach
applicant submitted through the public form**
(`app/(site)/apply/page.tsx`) and **where that specific submission is** in
the coach's own qualify → schedule → decide workflow:

```
new → qualified → demo_scheduled → demo_complete → accepted
  ↳ declined (reachable from any non-terminal stage)
```

**This is not a general sales CRM.** It doesn't model outbound sequences,
multi-channel lead sourcing, deal ownership across a sales team, or
touchpoints that happen outside this one form. Scope was kept narrow
deliberately — see "Future Growth CRM linkage" below for how a broader CRM
is meant to sit next to this table, not replace or absorb it.

## Source of truth

Supabase/Postgres (`applications` table, `lib/db/schema-applications.ts`)
is authoritative. The Google Sheet is a **best-effort mirror only** —
written server-side after the Supabase insert/update succeeds, using the
exact field names the sheet's existing `doPost` handler already expects.
If the Sheets write fails or times out, the application still exists and
is still fully usable in HQ; `sheetSyncedAt` stays `null` and is visible
on the HQ detail page as a visible (not silent) sync gap.

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
   person — `resubmissionCount` is surfaced on both the HQ list and detail
   views, so it's visible to the coach, never hidden.
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
on a page explicitly designed to feel low-commitment ("Submitting an
application is not a commitment"). Recommended before a real marketing
push; not required for the founding-coach pilot's expected volume.

## Secrets and response hygiene

`SHEETS_APPLICATIONS_GAS_URL` and the three `RESEND_*` variables are read
via `process.env` only inside server-only route/service files — never
sent to the browser, never interpolated into a response body. Failures in
the Sheets mirror or the admin email are logged server-side
(`console.error`/`console.warn`) only; the JSON response returned to the
applicant never contains these values or raw failure details, just
`{ ok, applicationId, resubmitted }` or a generic error string.

## Future Growth CRM linkage (not implemented)

No Growth CRM schema exists on this branch. Per the review that produced
this document, a foreign key was **deliberately not added** rather than
pointing at a table that doesn't exist yet. When a Growth CRM lead model
is built:

- Add a nullable `growth_lead_id uuid` column to `applications`,
  referencing the new table's primary key with `ON DELETE SET NULL`.
- The Growth CRM lead should **not** duplicate applicant identity
  (name/email/phone) or re-store the submitted answers — it should hold
  CRM-specific state only (deal stage, outbound touches, source
  attribution beyond this one form) and point back at this row for "what
  they actually told us when they applied."
- `applications` stays the immutable record of the submission. A Growth
  CRM lead is free to represent the same person across multiple
  touchpoints (this application, a future referral, a newsletter signup)
  without this table needing to know about any of that.

This keeps the two systems cleanly separable: applications answers "what
was submitted and is it qualified/scheduled/decided," while the Growth
CRM (once built) answers "how are we pursuing this person across every
channel." See also
`docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md` for the
adjacent multi-tenant ownership work `reviewedBy` on this table will need
once a second coach exists.

## Payment

Out of scope, unchanged. This flow has no payment step — applications are
submitted before any Stripe interaction occurs in the broader coaching
funnel.
