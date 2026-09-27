-- Migration 0040 — Assignment-scoped workout release policy
--
-- Additive only. Existing and new assignments default to `daily`, preserving
-- the exact pre-migration client behavior. Visibility is derived at read/start
-- time; no workout rows are rewritten and no unlock cron is required.

CREATE TYPE "public"."workout_release_policy" AS ENUM('daily', 'weekly');
--> statement-breakpoint

ALTER TABLE "client_programs"
  ADD COLUMN "workout_release_policy" "public"."workout_release_policy" DEFAULT 'daily' NOT NULL;
