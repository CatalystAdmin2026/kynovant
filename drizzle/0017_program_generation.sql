-- ─────────────────────────────────────────────────────────────
-- Kynovant — AI-Assisted Program Generator: Draft Storage Migration
--
-- Introduces program_generation_drafts, program_generation_runs,
-- program_generation_edit_events, and program_generation_validation_events
-- so generated draft Programs/Blueprints are stored separately from
-- program_templates/workout_templates until an explicit coach approval.
-- See lib/db/schema-program-generator.ts and
-- lib/program-generator/approval.ts.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0017_program_generation.sql
--
-- Risk profile:
--   - Purely additive: five new enums, four new tables, indexes
--   - No existing table is altered
--   - No downtime required
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."program_generation_status" AS ENUM (
  'queued',
  'running',
  'ready_for_review',
  'failed',
  'approved',
  'discarded'
);
--> statement-breakpoint

CREATE TYPE "public"."program_generation_run_status" AS ENUM (
  'queued',
  'running',
  'complete',
  'failed',
  'cancelled'
);
--> statement-breakpoint

CREATE TYPE "public"."program_generation_run_scope" AS ENUM (
  'full_draft',
  'single_day'
);
--> statement-breakpoint

CREATE TYPE "public"."program_generation_validation_status" AS ENUM (
  'ready',
  'warnings',
  'blocked',
  'failed'
);
--> statement-breakpoint

CREATE TYPE "public"."program_generation_edit_action" AS ENUM (
  'brief_updated',
  'day_regenerated',
  'exercise_replaced',
  'prescription_updated',
  'exercise_reordered',
  'day_moved',
  'progression_updated'
);
--> statement-breakpoint

CREATE TABLE "program_generation_drafts" (
  "id"                            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id"                      uuid        NOT NULL
                                     REFERENCES "users"("id") ON DELETE RESTRICT,
  "client_id"                     uuid
                                     REFERENCES "users"("id") ON DELETE SET NULL,
  "status"                        "program_generation_status" NOT NULL DEFAULT 'queued',
  "brief_json"                    jsonb       NOT NULL,
  "brief_version"                 integer     NOT NULL DEFAULT 1,
  "draft_json"                    jsonb,
  "draft_version"                 integer     NOT NULL DEFAULT 0,
  "insights_json"                 jsonb,
  "validation_status"             "program_generation_validation_status",
  "last_validated_at"             timestamptz,
  "warnings_acknowledged_at"      timestamptz,
  "failure_reason"                text,
  "approved_at"                   timestamptz,
  "approved_by"                   uuid
                                     REFERENCES "users"("id") ON DELETE SET NULL,
  "created_program_template_id"   uuid
                                     REFERENCES "program_templates"("id") ON DELETE SET NULL,
  "created_workout_template_ids"  jsonb,
  "created_at"                    timestamptz NOT NULL DEFAULT now(),
  "updated_at"                    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_drafts_coach_id"
  ON "program_generation_drafts" ("coach_id");
--> statement-breakpoint

CREATE INDEX "idx_program_generation_drafts_client_id"
  ON "program_generation_drafts" ("client_id");
--> statement-breakpoint

CREATE INDEX "idx_program_generation_drafts_status"
  ON "program_generation_drafts" ("status");
--> statement-breakpoint

CREATE INDEX "idx_program_generation_drafts_created_at"
  ON "program_generation_drafts" ("created_at");
--> statement-breakpoint

CREATE TABLE "program_generation_runs" (
  "id"                     uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id"               uuid        NOT NULL
                              REFERENCES "program_generation_drafts"("id") ON DELETE CASCADE,
  "status"                 "program_generation_run_status" NOT NULL DEFAULT 'queued',
  "scope"                  "program_generation_run_scope" NOT NULL DEFAULT 'full_draft',
  "day_ref"                text,
  "stage"                  text,
  "provider"               text,
  "model"                  text,
  "requested_by_user_id"   uuid        NOT NULL
                              REFERENCES "users"("id") ON DELETE RESTRICT,
  "started_at"             timestamptz,
  "completed_at"           timestamptz,
  "error_message"          text,
  "created_at"             timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_runs_draft_id"
  ON "program_generation_runs" ("draft_id");
--> statement-breakpoint

CREATE INDEX "idx_program_generation_runs_status"
  ON "program_generation_runs" ("status");
--> statement-breakpoint

CREATE TABLE "program_generation_edit_events" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id"         uuid        NOT NULL
                        REFERENCES "program_generation_drafts"("id") ON DELETE CASCADE,
  "actor_user_id"    uuid        NOT NULL
                        REFERENCES "users"("id") ON DELETE RESTRICT,
  "action"           "program_generation_edit_action" NOT NULL,
  "entity_type"      text        NOT NULL,
  "entity_id"        text,
  "summary"          text        NOT NULL,
  "before_json"      jsonb,
  "after_json"       jsonb,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_edit_events_draft_id"
  ON "program_generation_edit_events" ("draft_id");
--> statement-breakpoint

CREATE INDEX "idx_program_generation_edit_events_created_at"
  ON "program_generation_edit_events" ("created_at");
--> statement-breakpoint

CREATE TABLE "program_generation_validation_events" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id"         uuid        NOT NULL
                        REFERENCES "program_generation_drafts"("id") ON DELETE CASCADE,
  "status"           "program_generation_validation_status" NOT NULL,
  "blocker_count"    integer     NOT NULL DEFAULT 0,
  "warning_count"    integer     NOT NULL DEFAULT 0,
  "findings_json"    jsonb       NOT NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_validation_events_draft_id"
  ON "program_generation_validation_events" ("draft_id");
