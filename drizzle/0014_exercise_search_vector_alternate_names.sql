-- ─────────────────────────────────────────────────────────────
-- Migration 0014: Expand exercise search vector to include alternate names
--
-- The original generated column indexed only `name` and `default_notes`.
-- This migration regenerates it to also index `alternate_names` (JSONB array),
-- enabling queries like "RDL", "BB Bench", and "SLDL" to return the
-- correct exercise.
--
-- Because GENERATED ALWAYS columns cannot be altered in-place, the column
-- must be dropped and re-added. Postgres will recompute the value for every
-- existing row at migration time.
--
-- NOTE: PostgreSQL generated-column expressions must be immutable and may
-- not contain subqueries — ARRAY(SELECT jsonb_array_elements_text(...))
-- is a subquery and fails with "cannot use subquery in column generation
-- expression". alternate_names is included instead via a direct ::text
-- cast; to_tsvector's parser treats the surrounding JSON punctuation
-- (brackets, quotes, commas) as token separators, so this still indexes
-- each alias as its own lexeme without needing a subquery.
-- ─────────────────────────────────────────────────────────────

-- 1. Drop the GIN index before dropping the column
DROP INDEX IF EXISTS "idx_exercises_search_vector";

-- 2. Drop the old generated column
ALTER TABLE "exercises" DROP COLUMN IF EXISTS "search_vector";

-- 3. Re-add with alternate_names included
ALTER TABLE "exercises"
  ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        "name" || ' ' ||
        coalesce("default_notes", '') || ' ' ||
        coalesce("alternate_names"::text, '')
      )
    ) STORED;

-- 4. Recreate the GIN index
CREATE INDEX "idx_exercises_search_vector"
  ON "exercises" USING gin("search_vector");
