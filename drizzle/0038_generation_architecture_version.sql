-- ─────────────────────────────────────────────────────────────
-- Migration 0038 — Generation architecture version
--
-- Programming Intelligence Phase D (blueprint-guided canonical-week
-- concurrency): a Phase C block draft already in progress when Phase D
-- ships must NEVER silently switch to blueprint+concurrent generation
-- mid-block — a later day generated WITH sibling-coordination intent
-- sitting next to an earlier day generated WITHOUT it would change
-- sibling responsibilities the coach never saw change. One additive,
-- nullable integer column, set exactly once, at the SAME moment
-- generation_architecture (migration 0036) is first decided, and only
-- when that decision is 'block':
--   1 = Phase C: canonical week generated serially, no blueprint.
--   2 = Phase D: canonical week generated via a deterministic
--       blueprint + bounded concurrent day calls.
-- Always NULL for legacy_day (there is only one legacy_day behavior)
-- and for every draft that predates this migration — zero backfill,
-- zero behavior change for any existing draft; a pre-existing block
-- draft (version NULL) is treated as version 1 (Phase C serial) by the
-- application, never reinterpreted as version 2.
--
-- Additive only, applied after 0037, never edits 0036/0037.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "program_generation_drafts"
  ADD COLUMN "generation_architecture_version" integer;
--> statement-breakpoint

ALTER TABLE "program_generation_drafts"
  ADD CONSTRAINT "chk_program_generation_drafts_generation_architecture_version"
  CHECK ("generation_architecture_version" IS NULL OR "generation_architecture_version" IN (1, 2));
--> statement-breakpoint

ALTER TABLE "program_generation_drafts"
  ADD CONSTRAINT "chk_program_generation_drafts_architecture_version_pairing"
  CHECK ("generation_architecture_version" IS NULL OR "generation_architecture" = 'block');
