-- ─────────────────────────────────────────────────────────────
-- Kynovant — Coaching Application Pipeline Migration
--
-- Introduces the applications table so "Apply for Coaching"
-- submissions (app/(site)/apply/page.tsx) are persisted in
-- Supabase as the source of truth, with the existing Google
-- Sheet demoted to a best-effort mirror.
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
  "full_name"           text        NOT NULL,
  "email"               text        NOT NULL,
  "normalized_email"    text        NOT NULL,
  "phone"               text,
  "primary_goal"        text        NOT NULL,
  "readiness"           text        NOT NULL,
  "budget_range"        text        NOT NULL,
  "goals_details"       text,
  "referral_source"     text        NOT NULL,
  "referral_name"       text,
  "status"              "application_status" NOT NULL DEFAULT 'new',
  "reviewed_by"         uuid
                          REFERENCES "users"("id") ON DELETE SET NULL,
  "review_notes"        text,
  "source"              text        NOT NULL DEFAULT 'apply_page',
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
