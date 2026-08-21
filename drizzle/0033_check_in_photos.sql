-- ─────────────────────────────────────────────────────────────
-- Check-In Progress Photos (configurable required-views model)
--
-- DO NOT APPLY until explicitly approved in conversation.
-- Dry-run first: npx tsx scripts/migrate.ts drizzle/0033_check_in_photos.sql --dry-run
--
-- NUMBERING: this integration branch merges the reviewed true
-- multi-day check-in architecture (review/true-multiday-checkin-
-- current-main @ d2b68f8, migrations 0031/0032, already applied to
-- STAGING only, never production) onto current production main.
-- This migration is 0033, immediately after them, and does not
-- rewrite 0031/0032. Separately — and not addressed by this
-- migration — feature/meal-plan-access-override already has its own
-- unrelated, unapplied, unmerged 0031_coach_meal_plan_access_
-- overrides.sql on a different, still-parked branch. That is a real
-- future numbering collision (both branches independently claim
-- "0031"), flagged here for whoever integrates that branch next: it
-- must be renumbered to 0034+ at that time, not silently reused.
--
-- WHAT CHANGES:
--   1. Adds check_in_photo_requirement enum (required/optional/off)
--      and THREE columns on the EXISTING client_check_in_schedule
--      table (0031) — additive only, no column removed/renamed/
--      retyped:
--        - photo_requirement        (required/optional/off, default 'off')
--        - photo_require_front      (boolean, default true)
--        - photo_require_side       (boolean, default true)
--        - photo_require_back       (boolean, default true)
--      Backfills every existing row (including 0031's own
--      enrollment-seeded backfill rows) to photo_requirement='off' —
--      no row silently gains a requirement no coach ever configured.
--      The three boolean columns exist as a normalized, typed
--      representation of "which views are required" (front/side/back
--      independently, per Kynovant's configurable-requirement model)
--      rather than a JSON blob — deliberately avoided per this
--      migration's design review. They are inert/ignored whenever
--      photo_requirement is not 'required', but always present so a
--      later switch back to 'required' has a deterministic starting
--      point. This column set lives on the SAME effective-dated row
--      client_check_in_schedule already uses (see schema-check-in.ts's
--      column comment and check-in-schedule-service.ts's
--      setPhotoPolicy) — a policy change (including which views are
--      required) soft-closes the current row and opens a new one, so
--      a later change never rewrites what was required on a past
--      occurrence.
--   2. Adds check_in_photo_category enum (front/side/back/other) and
--      a new check_in_photos table — one row per uploaded photo,
--      belonging to a specific weekly_check_ins occurrence (never
--      merely a client/week/enrollment). Multiple photos per category
--      are allowed (no uniqueness constraint on
--      (check_in_id, category)).
--
-- NO DATA LOSS: nothing is dropped or retyped. Every existing
-- client_check_in_schedule row survives unchanged except for gaining
-- photo_requirement = 'off' and photo_require_{front,side,back} =
-- true (inert defaults, since photo_requirement is 'off' on every
-- backfilled row).
--
-- STORAGE: check_in_photos.storage_path references an object in the
-- private "check-in-photos" Supabase Storage bucket — see
-- scripts/setup-check-in-photos-bucket.ts (NOT run by this
-- migration; a separate, also-not-run setup script).
-- ─────────────────────────────────────────────────────────────

-- 1. Photo requirement enum + additive columns on client_check_in_schedule.
CREATE TYPE "check_in_photo_requirement" AS ENUM ('required', 'optional', 'off');--> statement-breakpoint
ALTER TABLE "client_check_in_schedule" ADD COLUMN "photo_requirement" "check_in_photo_requirement" NOT NULL DEFAULT 'off';--> statement-breakpoint
ALTER TABLE "client_check_in_schedule" ADD COLUMN "photo_require_front" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "client_check_in_schedule" ADD COLUMN "photo_require_side" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "client_check_in_schedule" ADD COLUMN "photo_require_back" boolean NOT NULL DEFAULT true;--> statement-breakpoint

-- 2. Photo category enum + check_in_photos table.
CREATE TYPE "check_in_photo_category" AS ENUM ('front', 'side', 'back', 'other');--> statement-breakpoint

CREATE TABLE "check_in_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"category" "check_in_photo_category" NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "check_in_photos" ADD CONSTRAINT "check_in_photos_check_in_id_weekly_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."weekly_check_ins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_photos" ADD CONSTRAINT "check_in_photos_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_check_in_photos_check_in_id" ON "check_in_photos" USING btree ("check_in_id");--> statement-breakpoint
CREATE INDEX "idx_check_in_photos_client_id" ON "check_in_photos" USING btree ("client_id");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- RLS — Row Level Security
--
-- Same deny-by-default posture as weekly_check_ins (0006) and
-- client_check_in_schedule (0031). All writes flow through Next.js
-- Server Actions (app/portal/check-ins/actions.ts,
-- app/hq/clients/[clientId]/actions.ts) using the service-role
-- connection, which bypasses RLS. RLS is defense-in-depth against
-- direct PostgREST access only.
--
-- Client policy: SELECT — own rows only (a client can see their own
-- photos; all writes go through the validated Server Action path
-- above, never direct PostgREST).
--
-- No INSERT/UPDATE/DELETE policy is granted to authenticated — any
-- direct PostgREST write attempt from a browser client is denied by
-- default, matching every other table in this domain.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "check_in_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "check_in_photos_client_select"
  ON "check_in_photos"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);
