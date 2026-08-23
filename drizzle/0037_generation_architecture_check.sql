-- ─────────────────────────────────────────────────────────────
-- Migration 0037 — CHECK constraint for generation_architecture
--
-- Review finding on Phase C candidate 5bfc4bc (P2, hardened now since
-- Phase C is already being remediated and this is cheap): drizzle/0036
-- added program_generation_drafts.generation_architecture as a plain
-- nullable text column with only application-layer validation (every
-- writer is TypeScript-typed to "block" | "legacy_day", but nothing at
-- the DB layer actually enforced that). Same "integrity constraints
-- after the fact" precedent as migration 0035 (program_generation_days/
-- weeks' own status/JSON invariants) — a separate, purely additive
-- migration, never an edit to an already-applied one (0036 stays
-- exactly as shipped).
--
-- Allowed values, unchanged from 0036's own documented semantics:
--   NULL           — decision not yet made (every pre-0036 row, and
--                    briefly every row between INSERT and its first
--                    runStagedGeneration() call).
--   'legacy_day'   — day-by-day AI generation for every week.
--   'block'        — Phase A/B block-based generation.
-- Nothing else is ever valid. Additive only: NULL and both real values
-- already in use continue to satisfy this constraint with zero
-- backfill and zero rows to fix.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "program_generation_drafts"
  ADD CONSTRAINT "chk_program_generation_drafts_generation_architecture"
  CHECK ("generation_architecture" IS NULL OR "generation_architecture" IN ('legacy_day', 'block'));
