-- ─────────────────────────────────────────────────────────────
-- Kynovant — Coach Application Pipeline Migration
--
-- Introduces the applications table so "Apply as a Coach"
-- submissions (app/(site)/coach-apply/page.tsx, via /api/applications)
-- are persisted in Supabase as the source of truth, with the Google
-- Sheet (COACH_APPLICATIONS_GAS_URL) demoted to a best-effort mirror.
--
-- Admin-only: this is Kynovant's own coach-acquisition pipeline, not
-- data any ordinary coach account should ever reach. See
-- app/admin/growth/layout.tsx (requireAdminPage) and
-- app/api/applications/route.ts.
--
-- Note: this file replaces an earlier draft of the same migration
-- (never applied to any database) that mistakenly modeled this table
-- around Jermaine's personal client-coaching application fields
-- (primary_goal/readiness/budget_range) instead of the actual
-- Kynovant coach-application fields. Corrected before first run.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0015_applications_pipeline.sql
--
-- Risk profile:
--   - Purely additive: one new enum, one new table, four indexes
--   - No existing rows modified
--   - No downtime required
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."application_status" AS ENUM (
  'new',
  'qualified',
  'demo_scheduled',
  'demo_complete',
  'accepted',
  'declined'
);
--> statement-breakpoint

CREATE TABLE "applications" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"                text        NOT NULL,
  "email"               text        NOT NULL,
  "normalized_email"    text        NOT NULL,
  "phone"               text,
  "business_stage"      text        NOT NULL,
  "client_count"        text        NOT NULL,
  "context"             text,
  "referral_source"     text        NOT NULL,
  "status"              "application_status" NOT NULL DEFAULT 'new',
  "reviewed_by"         uuid
                          REFERENCES "users"("id") ON DELETE SET NULL,
  "review_notes"        text,
  "source"              text        NOT NULL DEFAULT 'coach_apply',
  "sheet_synced_at"     timestamptz,
  "resubmission_count"  integer     NOT NULL DEFAULT 0,
  "submitter_ip"        text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_applications_status"
  ON "applications" ("status");
--> statement-breakpoint

CREATE INDEX "idx_applications_normalized_email"
  ON "applications" ("normalized_email");
--> statement-breakpoint

CREATE INDEX "idx_applications_created_at"
  ON "applications" ("created_at");
--> statement-breakpoint

CREATE INDEX "idx_applications_ip_created_at"
  ON "applications" ("submitter_ip", "created_at");
