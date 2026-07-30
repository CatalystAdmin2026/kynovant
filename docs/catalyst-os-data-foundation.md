# Kynovant — Data Foundation

Sprint 5B.1 · Established 2026-07-11

---

## Overview

This document describes the database foundation established in Sprint 5B.1. It covers identity strategy, the Sprint 5B.1 tables, migration strategy, operational responsibilities across systems, and the sprint roadmap for future schema additions.

---

## Canonical Identity Strategy

Every person in Kynovant — client, coach, or admin — receives a UUID at first contact. That UUID is the canonical identity anchor and never changes, regardless of email changes, re-enrollment, or account status changes.

### Why UUID over email as PK

Email changes. Clients move, rebrand, or share family addresses across life events. A UUID issued at first contact survives these changes and enables the system to link historical records (Stripe events, DocuSign envelopes, Drive folders, check-ins) to the correct person across any number of operational identity changes.

### Normalized email

`users.normalizedEmail` stores a lowercased, trimmed version of the email for deduplication lookups. The raw `email` field stores the version the client provided. Uniqueness is enforced on `normalizedEmail`. Two family members sharing an email address cannot both be clients — each client requires a distinct deliverable email.

### External identity mapping

Vendor IDs (Stripe customer, DocuSign envelope, Calendly event, Drive folder) are stored in `external_identities`, keyed by `userId` or `enrollmentId`. This allows:

- One client to have multiple Stripe subscriptions across enrollments
- DocuSign envelopes linked directly to the enrollment they cover
- Calendly event records linked to the client and enrollment
- Drive workspace folder IDs linked and queryable

**Security note:** `external_identities.metadata` stores context at time of creation (e.g. Stripe event type, Drive folder name). Never store secrets, tokens, API keys, or credentials in metadata. Those belong in environment variables.

---

## Sprint 5B.1 Tables

Ten tables were created in this sprint. Each is described below with its purpose and key design decisions.

### `users`

Permanent identity record. One row per person. Role (client, coach, admin) is stored here. Status tracks the lifecycle of the account (invited → active → suspended → archived). Soft deletion via `deletedAt` — rows are never hard-deleted. All foreign keys from other tables pointing to `users` use RESTRICT, preventing deletion of a user with dependent records.

### `client_profiles`

Demographic and contact information collected during onboarding. `userId` is both PK and FK — one profile per user. Timezone defaults to `America/Chicago` (coach's home timezone) and should be updated during onboarding to the client's actual IANA timezone for accurate mission scheduling.

### `coach_profiles`

Professional metadata for coaches. `specializations` is a JSONB array of strings. `maxClientCapacity` is nullable — not all coaches have an enforced cap.

### `coaching_enrollments`

One row per client-coach engagement. Historical enrollments are preserved — a client who upgrades gets a new enrollment row; the old row status is set to `"upgraded"`. `checkInDayOfWeek` stores 0–6 (Sunday–Saturday) and is enforced in range by a check constraint. `pipelineStage` mirrors the `LifecycleStage` union type in `lib/workflow.ts` and is stored as `text` to avoid coupling the DB enum to the application enum definition.

### `external_identities`

Vendor ID registry. Maps Kynovant UUIDs to Stripe, DocuSign, Calendly, and Drive identifiers. `provider + externalId` is unique across the table. At least one of `userId` or `enrollmentId` must be non-null (enforced by check constraint). FKs use SET NULL — external records survive user archival or enrollment completion.

### `enrollment_events`

Append-only enrollment history. Records every status transition, package change, pause, resume, coach reassignment, and rate adjustment. Never update or delete rows — only insert. `occurredAt` allows events to be recorded with an explicit timestamp when processing out-of-order (e.g., a Stripe event received with a delayed webhook).

### `timeline_events`

Append-only client activity timeline for the coach dashboard. Records significant lifecycle moments: agreement sent, payment received, onboarding submitted, program built, check-in submitted, streak milestones. `actorRole` (client, coach, admin, system) distinguishes whether an event was client-initiated or coach/system-initiated.

### `drive_workspaces`

Structured record of the Google Drive workspace created by `scripts/drive-workspace-backend.gs`. The GAS script continues to log to the Google Sheet as before — this table is an additional structured record. `subfolderIds` is a JSONB object mapping subfolder names to Drive folder IDs. `enrollmentId` has a unique index (one active workspace per enrollment).

### `program_templates`

Reusable coaching program blueprints authored by coaches. Versioned using the separate-rows strategy (see Versioning section below). `slug` is globally unique. Category and experience level use native Postgres enums. Exercise prescription tables are added in Sprint 5B.3.

### `workout_templates`

Reusable workout-day templates. Same versioning strategy as `program_templates`. Captures workout identity and metadata — not exercise-by-exercise prescription. `recommendedEquipment` is a JSONB array of strings. Exercise prescription tables are added in Sprint 5B.3.

---

## Template Versioning Strategy

Program and workout templates use the separate-rows versioning approach:

**How it works:**

1. Each version is a new row with an incremented `version` integer.
2. `parentTemplateId` points to the immediately preceding version row.
3. Only one row per logical template family should have `status = "active"` at any time. Older versions are set to `"archived"`.
4. `archivedAt` timestamp is set when a row is archived.

**Why separate rows (not in-place updates):**

- A client program assigned to version 3 of a template continues to reference the exact row that was active when the program was built. Version 4 does not retroactively change what the client was assigned.
- Full lineage is traversable via the `parentTemplateId` chain.
- Rollback is possible: archive the current version and set the previous row back to `"active"`.
- Audit trail is inherent — the old row is never mutated.

**Slug uniqueness:**

`slug` is globally unique across all rows. When creating a new version, either append a version suffix (e.g. `"fat-loss-fundamentals-v2"`) or archive the old row before reusing the same slug. Application logic enforces the one-active-per-slug invariant; the database enforces global uniqueness.

---

## Deletion Policy

Kynovant favors data preservation and soft deletion:

| Table | Delete behavior |
|-------|----------------|
| `users` | Soft delete (`deletedAt`); never hard-delete |
| `client_profiles` | RESTRICT FK from `users`; follows user lifecycle |
| `coach_profiles` | RESTRICT FK from `users`; follows user lifecycle |
| `coaching_enrollments` | No delete; status set to `"cancelled"` or `"completed"` |
| `external_identities` | SET NULL on user/enrollment FK; record preserved |
| `enrollment_events` | Append-only; never delete |
| `timeline_events` | Append-only; never delete |
| `drive_workspaces` | SET NULL on enrollment FK; record preserved |
| `program_templates` | `archivedAt` set; status → `"archived"` |
| `workout_templates` | `archivedAt` set; status → `"archived"` |

CASCADE DELETE is not used anywhere in the Sprint 5B.1 schema. If a referenced record cannot be safely deleted, a RESTRICT FK will raise an error rather than silently cascading a deletion.

---

## System Responsibilities

Kynovant uses three distinct storage systems. Each has a defined role.

### Supabase Postgres (primary persistence)

- Source of truth for client identity, enrollment state, and coaching history
- Template library (program and workout blueprints)
- Event history (enrollment events, timeline events)
- External identity registry (Stripe, DocuSign, Calendly, Drive IDs)
- Future: missions, promises, nutrition targets, check-ins, block assignments

### Google Sheets (operational audit log)

- Application submissions (`applications` tab) — from `app/apply/page.tsx`
- Onboarding form submissions (`standard-onboarding`, `executive-onboarding`) — from GAS
- Stripe payment events (`stripe-events`) — from GAS
- Drive workspace creation log (`Client Workspaces`) — from GAS

**Google Sheets are not the source of truth.** They are an operational layer for coach visibility during the pre-database phase and a permanent audit trail. Once the admin CRM is migrated (Sprint 5B.2), Sheets become a secondary log.

### Google Drive (file organization)

- Structured folder hierarchy per client: `Catalyst Clients / [Year] / [Package] / [ClientName]`
- Coach-facing files: programs, assessments, progress photos, check-in documents
- Managed by `scripts/drive-workspace-backend.gs`; folder IDs recorded in `drive_workspaces` table

---

## Connection URL Strategy

Two DATABASE_URL values are required:

| Variable | Use | Connection type |
|----------|-----|----------------|
| `DATABASE_URL` | App runtime queries | Supabase Session Mode pooler (PgBouncer) |
| `DATABASE_URL_DIRECT` | drizzle-kit migrations | Direct connection (non-pooled) |

`prepare: false` is set in `lib/db/client.ts` because PgBouncer does not support named prepared statements across connections. The direct URL bypasses PgBouncer and should only be used by `drizzle-kit` on the developer machine or in a CI migration step — never at runtime.

---

## Migration Workflow

Migrations are generated locally using drizzle-kit and applied manually after review.

**Generate a migration (no database connection required):**

```bash
npx drizzle-kit generate
```

This reads `lib/db/schema.ts` and writes SQL into `./drizzle/`. Review the generated SQL before applying.

**Apply a migration to the database:**

```bash
DATABASE_URL=$DATABASE_URL_DIRECT npx drizzle-kit migrate
```

Or use `drizzle-kit push` for development convenience (no migration files generated):

```bash
DATABASE_URL=$DATABASE_URL_DIRECT npx drizzle-kit push
```

**DO NOT** run migrations against the production database until they have been reviewed and the Supabase project URL is confirmed. The constraint from Sprint 5B.1: "Do not push migrations to a remote database until configuration is confirmed."

---

## Privacy Classifications

| Field | Classification | Notes |
|-------|---------------|-------|
| `users.email` | PII | Encrypted in transit; restrict read access |
| `users.normalizedEmail` | PII | Same as email |
| `client_profiles.dateOfBirth` | Sensitive PII | Health-adjacent; restrict to coach + admin |
| `client_profiles.phone` | PII | Restrict to coach + admin |
| `client_profiles.address` | PII | Restrict to admin |
| `client_profiles.emergencyContact` | PII | Restrict to coach + admin |
| `coaching_enrollments.monthlyRateCents` | Financial | Restrict to admin |
| `external_identities.externalId` | Vendor ID | Not personally identifying alone |
| `external_identities.metadata` | Varies | Never store secrets here |
| Timeline and event content | Operational | Coach-visible; restrict from client read in Sprint 5D |

Row-level security (RLS) will be configured in Supabase in Sprint 5D when authentication is introduced.

---

## Sprint Roadmap

### Sprint 5B.1 — Foundation (this sprint)

Tables: users, client_profiles, coach_profiles, coaching_enrollments, external_identities, enrollment_events, timeline_events, drive_workspaces, program_templates, workout_templates

### Sprint 5B.2 — Admin CRM Migration

- Migrate the hardcoded LEADS array in `app/admin/page.tsx` to real database rows
- Reconcile existing Stripe customer emails with `users` + `external_identities`
- Populate `client_profiles` and `coaching_enrollments` from the admin page's reconcile logic
- Admin dashboard reads from DB; Google Sheets retained as audit log

### Sprint 5B.3 — Exercise Library and Program Builder

Tables: muscle_groups, exercises, block_templates, block_workout_assignments, exercise_prescriptions
- Coach-facing template authoring UI (block-based program builder)
- Exercise prescription schema (sets, reps, rest, tempo, RPE, load scheme)

### Sprint 5B.4 — Nutrition Protocol

Tables: nutrition_protocols, nutrition_targets, meal_log_entries
- Per-client macro targets set by coach
- Client meal logging foundation

### Sprint 5B.5 — Promise System and Mission Engine

Tables: daily_missions, daily_promises, promise_streaks, mission_types
- Replaces mock data in `lib/portal/mockData.ts`
- Daily mission generation logic (workout, nutrition, water, steps, sleep, check-in)
- Streak calculation and lifetime promise count

### Sprint 5B.6 — Check-In System

Tables: check_ins, check_in_responses, body_measurements, progress_photos
- Weekly check-in submission and coach review flow
- Body measurement tracking over time
- Progress photo management (Drive-linked)

### Sprint 5B.7 — Block Assignment and Client Programs

Tables: client_programs, client_blocks, client_daily_assignments
- Assigns a program template to a specific client enrollment
- Tracks which block the client is currently in
- Links daily missions to specific workouts in the assigned program

### Sprint 5C — AI Integration

- AI-generated mission briefings (replaces `lib/portal/briefingData.ts` mock)
- Coaching insight generation from check-in data
- Program personalization suggestions
- AI calls use Anthropic Claude API; structured outputs map to existing schema types

### Sprint 5D — Authentication

- Supabase Auth for client portal login (email OTP or magic link)
- Coach and admin login
- Row-level security policies in Supabase for all Sprint 5B tables
- `users.emailVerifiedAt` populated on first successful auth

---

## Files Created in Sprint 5B.1

| File | Purpose |
|------|---------|
| `lib/db/schema.ts` | Drizzle schema — 10 tables, enums, indexes, check constraints, inferred types |
| `lib/db/client.ts` | Drizzle singleton client — reads `DATABASE_URL`, `prepare: false` |
| `lib/db/health.ts` | `checkDatabaseConnection()` — lightweight connectivity check |
| `drizzle.config.ts` | drizzle-kit configuration |
| `app/api/internal/db-health/route.ts` | Protected health check API route |
| `.env.local.example` | Updated with `DATABASE_URL`, `DATABASE_URL_DIRECT`, `INTERNAL_API_SECRET` |
| `docs/catalyst-os-data-foundation.md` | This document |
| `drizzle/` | Generated SQL migration files (from `npx drizzle-kit generate`) |

---

## Packages Added in Sprint 5B.1

| Package | Version | Role |
|---------|---------|------|
| `drizzle-orm` | ^0.45.2 | ORM — query builder, schema definition, inferred types |
| `postgres` | ^3.4.9 | Postgres.js driver — PgBouncer-compatible |
| `drizzle-kit` | ^0.31.10 | Dev dependency — migration generation |
