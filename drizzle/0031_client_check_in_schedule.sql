-- ─────────────────────────────────────────────────────────────
-- Client Biometrics + Flexible Check-In Schedule
--
-- DO NOT APPLY until explicitly approved in conversation.
-- Dry-run first: npx tsx scripts/migrate.ts drizzle/0031_client_check_in_schedule.sql --dry-run
--
-- REGENERATED for the true multi-day check-in architecture pass —
-- this file originally shipped a plain (client_id, weekday) unique
-- table with no history. That was revisited (Phase 13/14 of the
-- multi-day architecture pass) BEFORE this migration was ever
-- applied anywhere: a schedule change must never silently rewrite
-- what was required in the past, which a plain "current state" table
-- cannot represent. This version adds EFFECTIVE-DATING
-- (effective_from / effective_to) — see schema-check-in.ts's
-- clientCheckInSchedule table comment for the full reasoning. No
-- prior version of this migration was ever applied to any database,
-- so this is a straight replacement, not a follow-up ALTER.
--
-- Adds client_check_in_schedule — the normalized, effective-dated,
-- one-row-per-required-weekday-ERA table that replaces the implicit
-- "Sunday" default everywhere in the product with an explicit,
-- coach-editable, per-client set of required check-in days (zero,
-- one, or many), with history preserved across changes.
--
-- coachingEnrollments.checkInDayOfWeek is UNCHANGED and NOT dropped —
-- the legacy single-window fallback path in
-- lib/db/check-in-service.ts's getCurrentCheckInWindows still reads
-- it for a client with zero rows in this table (never configured).
-- See 0032's header comment for the full legacy-field strategy.
--
-- BACKFILL POLICY:
--   Existing clients with an active coaching enrollment are seeded
--   with one ACTIVE (effective_to = NULL) row for their enrollment's
--   current effective day (check_in_day_of_week, defaulting to
--   0/Sunday when NULL — the exact same fallback
--   lib/db/check-in-service.ts's getCheckInDueDate() already applies
--   today), so their observed behavior does not silently change the
--   moment this table exists.
--
--   effective_from is CURRENT_DATE. The old single-day field is not
--   effective-dated, so a migration cannot prove which weekday was
--   required on every historical date if that field was edited. The
--   new schedule history starts at this migration boundary rather
--   than inventing retrospective weekday precision.
--
--   New clients (no active enrollment at migration time, or created
--   afterward) intentionally get ZERO rows — "no required schedule
--   configured yet" — rather than being auto-defaulted to Sunday
--   forever. A coach must make an explicit choice for each new
--   client (Coach HQ's Check-In Schedule section makes this a
--   two-click action).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "client_check_in_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_check_in_schedule_weekday_range" CHECK ("client_check_in_schedule"."weekday" >= 0 AND "client_check_in_schedule"."weekday" <= 6),
	CONSTRAINT "chk_check_in_schedule_effective_order" CHECK ("client_check_in_schedule"."effective_to" IS NULL OR "client_check_in_schedule"."effective_to" > "client_check_in_schedule"."effective_from")
);--> statement-breakpoint
ALTER TABLE "client_check_in_schedule" ADD CONSTRAINT "client_check_in_schedule_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Partial unique index — at most ONE currently-active row per
-- (client, weekday). Historical (closed, effective_to IS NOT NULL)
-- rows for the same weekday are NOT constrained by this, since a day
-- can be added, removed, and re-added over time. Same pattern already
-- used by schema-nutrition.ts's uq_active_published_nutrition_target.
CREATE UNIQUE INDEX "uq_client_check_in_schedule_active_day" ON "client_check_in_schedule" USING btree ("client_id","weekday") WHERE "effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_check_in_schedule_client_id" ON "client_check_in_schedule" USING btree ("client_id");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- RLS — Row Level Security
--
-- Same deny-by-default posture as weekly_check_ins (0006). All
-- writes flow through Next.js server actions (setCheckInScheduleAction
-- in app/hq/clients/[clientId]/actions.ts) using the service-role
-- connection, which bypasses RLS. RLS is defense-in-depth against
-- direct PostgREST access only.
--
-- Client policy:
--   SELECT — own rows only (a client can see, but never write, their
--   own required schedule — it is coach-controlled).
--
-- No INSERT/UPDATE/DELETE policy is granted to authenticated — any
-- direct PostgREST write attempt from a browser client is denied by
-- default.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "client_check_in_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "check_in_schedule_client_select"
  ON "client_check_in_schedule"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────
-- BACKFILL — existing clients preserve their current effective day
-- from the migration boundary forward. No retrospective schedule
-- history is invented.
--
-- The ON CONFLICT target names the partial unique index's columns AND
-- its WHERE predicate — required for Postgres to accept it as the
-- arbiter for a partial unique index.
-- ─────────────────────────────────────────────────────────────
INSERT INTO "client_check_in_schedule" ("client_id", "weekday", "effective_from")
SELECT DISTINCT ON (ce."client_id")
  ce."client_id",
  COALESCE(ce."check_in_day_of_week", 0),
  CURRENT_DATE
FROM "coaching_enrollments" ce
WHERE ce."status" = 'active'
ORDER BY ce."client_id", ce."created_at" DESC
ON CONFLICT ("client_id", "weekday") WHERE "effective_to" IS NULL DO NOTHING;
