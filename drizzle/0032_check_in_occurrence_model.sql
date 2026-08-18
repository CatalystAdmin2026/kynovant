-- ─────────────────────────────────────────────────────────────
-- Check-In Occurrence Model — the structural fix enabling true
-- multi-day check-in support (Wednesday + Sunday, etc.)
--
-- DO NOT APPLY until explicitly approved in conversation.
-- Dry-run first: npx tsx scripts/migrate.ts drizzle/0032_check_in_occurrence_model.sql --dry-run
--
-- MUST be applied AFTER 0031 (client_check_in_schedule) — this
-- migration's own scheduled_date backfill does not depend on 0031's
-- table, but the two features are shipped together and 0031's
-- numbering precedes this one.
--
-- PROBLEM THIS FIXES:
--   weekly_check_ins previously had UNIQUE (client_id, week_start_date)
--   — at most ONE check-in per client per week, no matter how many
--   days a client's schedule requires. A client configured for
--   Wednesday + Sunday could never have both occurrences coexist;
--   the second submission in a week would collide with the first at
--   the database level. This migration is the actual structural fix.
--
-- WHAT CHANGES:
--   1. Adds scheduled_date — the exact calendar date (in the client's
--      own timezone, clientProfiles.timezone) a specific occurrence is
--      required for. This is the TRUE occurrence identity going
--      forward. week_start_date is RETAINED (unchanged, still the
--      Sunday of that week) purely for grouping/display/backward
--      compatibility — always derived consistently from scheduled_date
--      at write time by the application (never set independently).
--   2. Backfills scheduled_date for every existing row (see BACKFILL
--      POLICY below) and sets it NOT NULL.
--   3. Drops the old UNIQUE (client_id, week_start_date) constraint
--      (uq_client_week_check_in, from 0006) and replaces it with
--      UNIQUE (client_id, scheduled_date) (uq_client_scheduled_check_in)
--      — the constraint that actually allows 2+ occurrences per week.
--   4. Adds an index on week_start_date alone, since it's no longer
--      covered by a unique index but is still queried for
--      week-grouping display.
--
-- NO DATA LOSS: every existing row is preserved exactly as-is; only
-- scheduled_date is added. No row is deleted, no client is
-- reassigned, no body/response content is touched.
--
-- BACKFILL POLICY (Phase 2 — "safest documented rule, no invented
-- precision"):
--   Existing rows predate occurrence dates. Their old schema proves
--   only the Sunday week bucket, not the required weekday on that
--   historical date; enrollment.check_in_day_of_week was mutable and
--   was not history-tracked. Therefore scheduled_date is anchored to
--   week_start_date for every legacy row. New rows written after this
--   migration receive the exact required occurrence date from the
--   effective-dated schedule. This preserves every legacy row without
--   making a false weekday claim.
--
-- WHY NO COLLISION IS POSSIBLE:
--   The old unique constraint already guaranteed at most one row per
--   (client_id, week_start_date), and the backfill copies that unique
--   week anchor directly.
-- ─────────────────────────────────────────────────────────────

-- 1. Add the column, nullable for now (populated by the backfill below).
ALTER TABLE "weekly_check_ins" ADD COLUMN "scheduled_date" date;--> statement-breakpoint

-- 2a. Use the legacy week bucket as a neutral occurrence anchor.
UPDATE "weekly_check_ins"
SET "scheduled_date" = "week_start_date"
WHERE "scheduled_date" IS NULL;--> statement-breakpoint

-- 3. Now that every row has a value, enforce NOT NULL going forward.
ALTER TABLE "weekly_check_ins" ALTER COLUMN "scheduled_date" SET NOT NULL;--> statement-breakpoint

-- 4. Replace the old one-per-week constraint with the true occurrence
-- constraint. DROP then CREATE (not a rename) so the old and new
-- constraint names both stay self-documenting in migration history.
DROP INDEX "uq_client_week_check_in";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_scheduled_check_in" ON "weekly_check_ins" USING btree ("client_id","scheduled_date");--> statement-breakpoint

-- 5. week_start_date is no longer covered by a unique index but is
-- still queried directly for week-grouping display — keep it indexed.
CREATE INDEX "idx_check_ins_week_start_date" ON "weekly_check_ins" USING btree ("week_start_date");
