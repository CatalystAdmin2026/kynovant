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

Verified current as of the day-level AI Program Generator review
(2026-08): all migrations through `0035` are applied, confirmed by
direct introspection (`information_schema`/`pg_constraint`), not
assumed from this doc. Apply new migrations here the same way as
always — `scripts/migrate.ts`, one file at a time, dry-run first.

Exercise library: seeded via the repo's canonical seed system
(`scripts/seeds/001-upper-push.ts` through `011-reviewed-library-
expansion.ts`, run in order) — **652 active, system-scope exercises**
covering all 26 muscle-group enum values, 37 mobility-flagged and 28
cardio-flagged exercises, 70 equipment items, 14 resistance types.
This is meant to persist as ongoing infrastructure, not a throwaway
test fixture — don't delete it when cleaning up a test run's own
synthetic coach/draft/day rows.

AI Gateway: an `AI_GATEWAY_API_KEY` (see `.env.staging.local.example`)
has been provisioned for real-provider generator work from this
environment — confirmed working against `anthropic/claude-sonnet-4`.
Production authenticates via Vercel's OIDC federation instead (works
only inside an actual Vercel runtime); a plain local process needs the
explicit key.

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
- No production secrets other than the AI Gateway key above (Stripe,
  Resend, Calendly, Sheets, DocuSign) belong in `.env.staging.local`.
  DB-backed migration/test work never needs them.

## Known operational quirk — run DB-backed suites sequentially

This project's Free/Nano compute tier's connection pooler
(Supavisor, port 6543) has been observed to return a spurious
`password authentication failed` error under concurrent connection
bursts (multiple test files opening pooled connections at once) —
confirmed NOT a credentials problem (the same connection string
succeeds every time run alone, and via a raw non-pooled query). Pass
`--no-file-parallelism` to `npm run test:staging` when running more
than one DB-backed suite together:

```bash
npm run test:staging -- --no-file-parallelism <file1> <file2> ...
```

## Fixture policy

Use `@isolation-test.invalid` (or another explicit non-resolving test
domain) for any synthetic user created in staging — this is the
existing convention used throughout this repo's real-DB test suites.
Admin-created users with `email_confirm: true` never trigger an
outbound confirmation email, so staging's default (real, rate-limited)
email sending is a non-issue for fixture-based testing — no custom
SMTP or email sandboxing was configured.
