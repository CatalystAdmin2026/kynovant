-- ─────────────────────────────────────────────────────────────
-- Migration 0021 — AI Program Generator Review Triage: Acknowledgement
--
-- Adds granular findings acknowledgement tracking to
-- program_generation_drafts, backing the coach-facing grouped review
-- experience (see lib/program-generator/findings-grouping.ts). Coaches
-- can now acknowledge a single occurrence, a whole grouped issue, or
-- every currently-visible warning — this column is where that state
-- persists. Full coverage of every current warning still drives the
-- existing warnings_acknowledged_at gate approval.ts already checks,
-- so approval.ts itself needs no change.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0021_review_triage_acknowledgement.sql
--
-- Risk profile:
--   - Purely additive: one new nullable-safe (NOT NULL DEFAULT) jsonb
--     column on an existing table
--   - No existing column altered or dropped
--   - No downtime required
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "program_generation_drafts"
  ADD COLUMN "acknowledged_finding_keys" jsonb NOT NULL DEFAULT '[]';
