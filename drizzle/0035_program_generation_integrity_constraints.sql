-- ─────────────────────────────────────────────────────────────
-- Migration 0035 — Integrity constraints for staged generation tables
--
-- Independent-review finding on 0034 (day-level AI program generation):
-- program_generation_days lacked DB-level range/invariant enforcement,
-- relying entirely on application code to keep week_number/day_number
-- in range and to never persist a 'completed' row without content or a
-- 'failed' row WITH content. Same gap existed on program_generation_weeks
-- since its introduction (0020) — closed here too for consistency, in
-- the same migration since both are the same class of fix.
--
-- Deliberately a SEPARATE migration from 0034, not an edit to it — 0034
-- may already be applied in environments this change wasn't written
-- against; a new, purely additive ALTER TABLE is the safe way to add
-- constraints after the fact, never by rewriting an already-shipped
-- migration file.
--
-- Ranges chosen from this feature's own existing schema-level caps —
-- never invented, never a new, tighter product limit:
--   - week_number: 1-16, matching ProgramGenerationBriefSchema's
--     `weeks: z.number().int().min(1).max(16)` (contracts.ts).
--   - day_number: 1-7, matching ProgramShellSchema's
--     `days: z.array(ProgramShellDaySchema).min(1).max(7)` (contracts.ts)
--     — day_number is a 1-based index into that array, never dayOfWeek.
-- Raising either application-level cap in the future requires raising
-- these CHECK bounds in a follow-up migration at the same time — a
-- deliberate coupling, not an oversight, so the two can never silently
-- drift apart.
--
-- Status-vs-JSON invariants:
--   - status='completed' requires real content (day_json/week_json
--     NOT NULL) — the row this feature's own review/assembly/approval
--     pipeline trusts as "safe to read content from."
--   - status='failed' requires NO content (day_json/week_json IS NULL)
--     — prevents a failed row ever being misread as having usable
--     generated content by any current or future query that checks
--     "IS NOT NULL" instead of the status column.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0035_program_generation_integrity_constraints.sql
--
-- Risk profile:
--   - Purely additive CHECK constraints — no column added/altered/
--     dropped, no data rewritten, no downtime.
--   - Safe to run against existing data: every row this application has
--     ever written already satisfies these invariants (they describe
--     what the application code has always done, just not previously
--     enforced at the DB layer) — verify on staging first regardless,
--     per standard migration practice, before applying to production.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "program_generation_days"
  ADD CONSTRAINT "chk_program_generation_days_week_number"
  CHECK ("week_number" >= 1 AND "week_number" <= 16);
--> statement-breakpoint

ALTER TABLE "program_generation_days"
  ADD CONSTRAINT "chk_program_generation_days_day_number"
  CHECK ("day_number" >= 1 AND "day_number" <= 7);
--> statement-breakpoint

ALTER TABLE "program_generation_days"
  ADD CONSTRAINT "chk_program_generation_days_completed_has_json"
  CHECK ("status" <> 'completed' OR "day_json" IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "program_generation_days"
  ADD CONSTRAINT "chk_program_generation_days_failed_has_no_json"
  CHECK ("status" <> 'failed' OR "day_json" IS NULL);
--> statement-breakpoint

ALTER TABLE "program_generation_weeks"
  ADD CONSTRAINT "chk_program_generation_weeks_week_number"
  CHECK ("week_number" >= 1 AND "week_number" <= 16);
--> statement-breakpoint

ALTER TABLE "program_generation_weeks"
  ADD CONSTRAINT "chk_program_generation_weeks_completed_has_json"
  CHECK ("status" <> 'completed' OR "week_json" IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "program_generation_weeks"
  ADD CONSTRAINT "chk_program_generation_weeks_failed_has_no_json"
  CHECK ("status" <> 'failed' OR "week_json" IS NULL);
