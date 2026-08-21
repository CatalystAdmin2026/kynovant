# Kynovant Staging Environment

A dedicated, isolated Supabase project for migration testing, DB-backed
automated tests, and pre-production QA — separate from the production
project that backs `www.kynovant.com`.

**No secret values live in this file.** Everything below is a public
identifier (project ref, URL, region) — the same class of information
already visible in `NEXT_PUBLIC_SUPABASE_URL` in any client bundle.

## Identifiers

| | Production | Staging |
|---|---|---|
| Project name | Kynovant | Kynovant Staging |
| Project ref | `fjcvuinkgqwcdciluuvp` | `ualqkfeisqpmcrjxqgdr` |
| Supabase URL | `https://fjcvuinkgqwcdciluuvp.supabase.co` | `https://ualqkfeisqpmcrjxqgdr.supabase.co` |
| Region | AWS us-east-2 (Ohio) | AWS us-east-2 (Ohio) |
| Compute | Nano | Nano |
| Organization | Catalyst Coaching LLC (Free plan) | same org |

Persistent Supabase branching is **not available on the current Free
plan** (confirmed in the dashboard — the Persistent Branches panel
shows an "Upgrade" gate). A separate project was created instead, per
the documented fallback order. Preview branches (short-lived,
resettable) are available on Free but were explicitly not used —
they're not suited to a durable staging environment.

## Loading staging credentials

Credentials live in `.env.staging.local` at the repo root —
**gitignored, never commit it**. Load it explicitly, never implicitly:

```bash
set -a && source .env.staging.local && set +a
```

Never `source` this file in the same shell session as `.env.local`
without restarting the shell in between — whichever is sourced last
wins, silently.

## Guardrail

Before any migration, fixture insertion, or destructive DB test
against staging, run:

```bash
npx tsx scripts/assert-staging-db.ts
```

It fails closed (non-zero exit) if `DATABASE_URL`/`DATABASE_URL_DIRECT`
is missing, resolves to the production project ref, or can't actually
be reached to verify. It never prints the database password or any
API key — only the project ref, which is not a secret.

## Baseline

Staging was brought to migrations `0000`–`0030` (current production
schema) via the existing `scripts/migrate.ts` runner, applied in
order. `0031_client_check_in_schedule.sql` and
`0032_check_in_occurrence_model.sql` are **not applied** — staging
sits deliberately one step behind production, ready for those two
migrations to be tested there before anywhere else.

## What's intentionally NOT set up yet

- No Storage buckets (staging Storage is live and independent, but
  empty — create buckets only when a feature under test actually
  needs one, with synthetic files only).
- No Vercel Preview → Staging wiring. Today, Vercel's `DATABASE_URL`
  and related vars are scoped to "Production and Preview" together —
  every Preview deployment currently talks to the **production**
  database. Splitting that (new Preview-only vars pointing at
  staging, removing the shared scope from the sensitive ones) is a
  real deployment-behavior change affecting any active preview
  branch, not a side effect of this setup — it needs its own
  deliberate pass.
- No production secrets (Stripe, Resend, AI Gateway, Calendly,
  Sheets) were copied into `.env.staging.local`. It only carries what
  DB-backed migration/test work needs.

## Fixture policy

Use `@isolation-test.invalid` (or another explicit non-resolving test
domain) for any synthetic user created in staging — this is the
existing convention used throughout this repo's real-DB test suites.
Admin-created users with `email_confirm: true` never trigger an
outbound confirmation email, so staging's default (real, rate-limited)
email sending is a non-issue for fixture-based testing — no custom
SMTP or email sandboxing was configured.
