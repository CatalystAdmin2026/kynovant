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
--   For each existing row, scheduled_date = week_start_date + the
--   weekday offset from the enrollment that was active for that
--   check-in (weekly_check_ins.enrollment_id when set; falls back to
--   the client's currently-active enrollment when enrollment_id is
--   NULL — e.g. an enrollment that has since ended, per its
--   ON DELETE SET NULL behavior; falls back to week_start_date itself,
--   i.e. Sunday, when no enrollment info exists at all — the same
--   ultimate default getCheckInDueDate() already applies for
--   checkInDayOfWeek IS NULL). This is not an approximation invented
--   for this migration — it is the EXACT formula
--   (lib/db/check-in-service.ts's getCheckInDueDate) the product
--   already used to decide "when is this client's check-in due" for
--   every single-day client before this pass existed. Every existing
--   historical row was created under exactly this single-day model,
--   so recomputing its due date with the same formula is recovering
--   real information, not inventing false precision.
--
-- WHY NO COLLISION IS POSSIBLE:
--   The OLD unique constraint already guaranteed at most one row per
--   (client_id, week_start_date). scheduled_date is a deterministic
--   function of week_start_date (plus a per-client offset that does
--   not vary within a single UPDATE pass), so two DIFFERENT
--   week_start_date values for the same client always produce two
--   DIFFERENT scheduled_date values (different weeks land on
--   different calendar dates even with the same weekday offset).
--   Backfill therefore cannot itself create a (client_id,
--   scheduled_date) duplicate — the new unique index is safe to add
--   immediately after backfill with no pre-cleanup step required.
-- ─────────────────────────────────────────────────────────────

-- 1. Add the column, nullable for now (populated by the backfill below).
ALTER TABLE "weekly_check_ins" ADD COLUMN "scheduled_date" date;--> statement-breakpoint

-- 2a. Backfill using the check-in's own linked enrollment, when set.
UPDATE "weekly_check_ins" wci
SET "scheduled_date" = (wci."week_start_date"::date + (COALESCE(ce."check_in_day_of_week", 0) || ' days')::interval)::date
FROM "coaching_enrollments" ce
WHERE ce."id" = wci."enrollment_id"
  AND wci."scheduled_date" IS NULL;--> statement-breakpoint

-- 2b. Fallback for rows whose enrollment_id is NULL (enrollment ended
-- and was cleared via ON DELETE SET NULL, or was never linked) — use
-- the client's currently-active enrollment, if any.
UPDATE "weekly_check_ins" wci
SET "scheduled_date" = (wci."week_start_date"::date + (COALESCE(ce."check_in_day_of_week", 0) || ' days')::interval)::date
FROM "coaching_enrollments" ce
WHERE wci."scheduled_date" IS NULL
  AND ce."client_id" = wci."client_id"
  AND ce."status" = 'active';--> statement-breakpoint

-- 2c. Final fallback for fully orphaned rows (no enrollment info at
-- all) — same ultimate default getCheckInDueDate() already applies:
-- scheduled_date = week_start_date (Sunday).
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
