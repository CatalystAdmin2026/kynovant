-- ─────────────────────────────────────────────────────────────
-- Migration 0034 — Day-level AI Program Generation
--
-- P0 architecture change. Production draft
-- 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a's Week 1 generation failed
-- repeatedly — confirmed at both a 45s and a (doubled) 90s per-call
-- timeout, neither of which let the call complete. Root cause: asking
-- one model call to produce an entire multi-day week (up to 7 days, up
-- to 12 sections/day, up to 30 prescriptions/section) while
-- cross-referencing a ~150-item exercise catalog is too large/slow for
-- reliable serverless execution, independent of the timeout value.
--
-- This adds the durable, resumable unit of work for generating exactly
-- ONE training day at a time instead — see
-- lib/db/schema-program-generator.ts's program_generation_days table
-- comment for the full design, and lib/program-generator/staged-
-- generation.ts for the new shell -> week -> day -> validate -> persist
-- -> next day -> ... -> assemble week -> next week orchestration.
--
-- Also adds current_day/completed_days to program_generation_runs —
-- the same "polled by the review page while status='running'" progress
-- columns current_week/completed_weeks already provide, one level
-- finer, so the UI can show "Week N, Day M of D" during generation
-- instead of only "Week N of M".
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0034_program_generation_days.sql
--
-- Risk profile:
--   - Purely additive: one new enum, one new table, two new nullable
--     columns on program_generation_runs. No existing column altered
--     or dropped, no backfill required, no downtime.
--   - Zero impact on any existing draft: an existing draft simply has
--     no program_generation_days rows yet. staged-generation.ts's
--     resume logic treats "no day rows for this week" exactly like
--     "week not started" and begins generating from week 1 of that
--     week (or wherever its own program_generation_weeks progress left
--     off) — no special-case migration/backfill logic needed for
--     already-in-flight or already-failed drafts, including Maddie's.
--   - program_generation_weeks (0020) is completely unchanged in shape
--     and meaning — it is still written exactly once per week, now by
--     staged-generation.ts's assembly step (once every day for that
--     week is 'completed') instead of directly by a single
--     generateProgramWeek() call. Every downstream reader (final
--     assembly, exercise resolution, validation, approval) is
--     unaffected.
--   - No RLS, matching every other program_generation_* table except
--     quota_claims — server-only, never queried via PostgREST.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."program_generation_day_status" AS ENUM (
  'pending',
  'generating',
  'completed',
  'failed'
);
--> statement-breakpoint

CREATE TABLE "program_generation_days" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id"         uuid        NOT NULL
                        REFERENCES "program_generation_drafts"("id") ON DELETE CASCADE,
  "week_number"      integer     NOT NULL,
  "day_number"       integer     NOT NULL,
  "status"           "program_generation_day_status" NOT NULL,
  "day_json"         jsonb,
  "error_code"       text,
  "error_message"    text,
  "provider"         text,
  "model"            text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "idx_program_generation_days_draft_id"
  ON "program_generation_days" ("draft_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_program_generation_days_draft_week_day"
  ON "program_generation_days" ("draft_id", "week_number", "day_number");
--> statement-breakpoint

ALTER TABLE "program_generation_runs"
  ADD COLUMN "current_day" integer;
--> statement-breakpoint

ALTER TABLE "program_generation_runs"
  ADD COLUMN "completed_days" integer;
