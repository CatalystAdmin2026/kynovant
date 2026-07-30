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
        coalesce(
          array_to_string(
            ARRAY(SELECT jsonb_array_elements_text("alternate_names")),
            ' '
          ),
          ''
        )
      )
    ) STORED;

-- 4. Recreate the GIN index
CREATE INDEX "idx_exercises_search_vector"
  ON "exercises" USING gin("search_vector");
