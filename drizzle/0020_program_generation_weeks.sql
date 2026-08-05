-- ─────────────────────────────────────────────────────────────
-- Migration 0020 — Staged, week-by-week AI Program Generation
--
-- Replaces the single giant generateObject() call (one program_templates-
-- shaped payload per Program) with a lightweight program-shell generation
-- followed by one generateObject() call per week — see
-- lib/program-generator/provider.ts and lib/db/schema-program-generator.ts.
--
-- Adds:
--   - program_generation_drafts.shell_json — the generated ProgramShell
--     (title/description/day labels/phase outline/global constraints),
--     held fixed across every week call and any resume/retry.
--   - program_generation_runs.total_weeks / completed_weeks / current_week
--     — staged-generation progress, polled by the review page for
--     "Generating Week N of M".
--   - program_generation_weeks (new table) — one row per (draft, week),
--     upserted on retry so a resume never regenerates an already-
--     completed week.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0020_program_generation_weeks.sql
--
-- Risk profile:
--   - Purely additive: one new enum, one new table, three new nullable
--     columns on existing tables. No existing column altered or dropped,
--     no backfill required, no downtime.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."program_generation_week_status" AS ENUM (
  'completed',
  'failed'
);
--> statement-breakpoint

ALTER TABLE "program_generation_drafts"
  ADD COLUMN "shell_json" jsonb;
--> statement-breakpoint

ALTER TABLE "program_generation_runs"
  ADD COLUMN "total_weeks" integer;
--> statement-breakpoint

ALTER TABLE "program_generation_runs"
  ADD COLUMN "completed_weeks" integer;
--> statement-breakpoint

ALTER TABLE "program_generation_runs"
  ADD COLUMN "current_week" integer;
--> statement-breakpoint

CREATE TABLE "program_generation_weeks" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id"         uuid        NOT NULL
                        REFERENCES "program_generation_drafts"("id") ON DELETE CASCADE,
  "week_number"      integer     NOT NULL,
  "status"           "program_generation_week_status" NOT NULL,
  "week_json"        jsonb,
  "error_message"    text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_weeks_draft_id"
  ON "program_generation_weeks" ("draft_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_program_generation_weeks_draft_week"
  ON "program_generation_weeks" ("draft_id", "week_number");
