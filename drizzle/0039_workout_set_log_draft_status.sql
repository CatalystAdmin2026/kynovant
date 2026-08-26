-- ─────────────────────────────────────────────────────────────
-- Migration 0039 — Workout set log draft status
--
-- Workout set draft autosave: before this migration, a workout_set_logs
-- row's mere existence WAS the only signal that a set had been logged —
-- there was no way to persist what a client had typed (weight/reps/
-- duration/RPE) before they tapped Log without that row being
-- indistinguishable from a completed set. computeCompletionPercent()
-- counts rows with a plain count(*), and hydration treated every
-- returned row as done — so writing draft values into this table
-- unchanged would have silently inflated completion percentage and
-- shown an unfinished set as logged.
--
-- Two additive, nullable-safe columns close that gap:
--   status ('draft' | 'logged') — defaults to 'logged' so every
--     pre-existing row (which could only ever have come from an
--     explicit Log tap) remains correctly self-describing with zero
--     backfill. Only newly-inserted autosave drafts will ever be
--     'draft'.
--   draft_seq — a client-supplied monotonic sequence (captured at edit
--     time, not request-send time) used by the autosave write path's
--     conditional upsert to guarantee the newest input always wins,
--     regardless of network reordering or multiple tabs, and to make
--     it structurally impossible for a stale/out-of-order autosave to
--     downgrade an already-logged row. NULL for any row that has only
--     ever been logged directly (logSet does not use draft_seq).
--
-- Additive only, applied after 0038, never edits 0036/0037/0038.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "public"."set_log_status" AS ENUM('draft', 'logged');
--> statement-breakpoint

ALTER TABLE "workout_set_logs"
  ADD COLUMN "status" "public"."set_log_status" DEFAULT 'logged' NOT NULL;
--> statement-breakpoint

ALTER TABLE "workout_set_logs"
  ADD COLUMN "draft_seq" bigint;
--> statement-breakpoint

ALTER TABLE "workout_set_logs"
  ADD CONSTRAINT "chk_draft_seq_nonneg"
  CHECK ("draft_seq" IS NULL OR "draft_seq" >= 0);
