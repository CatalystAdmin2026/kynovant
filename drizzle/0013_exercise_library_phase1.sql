-- ─────────────────────────────────────────────────────────────
-- Migration 0013 — Exercise Library Phase 1
--
-- Adds:
--   • exercise_scope enum + scope column on exercises
--   • primaryMuscleGroup denormalized column (backfilled from exercise_muscles)
--   • tags JSONB column
--   • defaultPrescription JSONB column
--   • searchVector tsvector generated column + GIN index
--   • exercise_favorites table (coach × exercise star system)
--   • exercise_coach_overrides table (per-coach defaultPrescription + privateNotes)
-- ─────────────────────────────────────────────────────────────

-- 1. Scope enum
CREATE TYPE "public"."exercise_scope" AS ENUM('system', 'organization', 'coach');

-- 2. New columns on exercises
ALTER TABLE "exercises"
  ADD COLUMN "scope" "exercise_scope" NOT NULL DEFAULT 'coach',
  ADD COLUMN "primary_muscle_group" "muscle_group",
  ADD COLUMN "tags" jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN "default_prescription" jsonb,
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('english', "name" || ' ' || coalesce("default_notes", ''))
  ) STORED;

-- 3. Indexes on new exercises columns
CREATE INDEX "idx_exercises_scope"
  ON "exercises" ("scope");

CREATE INDEX "idx_exercises_primary_muscle_group"
  ON "exercises" ("primary_muscle_group")
  WHERE "primary_muscle_group" IS NOT NULL;

CREATE INDEX "idx_exercises_tags"
  ON "exercises" USING gin("tags");

CREATE INDEX "idx_exercises_search_vector"
  ON "exercises" USING gin("search_vector");

-- 4. Backfill scope — all existing exercises are Catalyst system exercises
UPDATE "exercises" SET "scope" = 'system';

-- 5. Backfill primaryMuscleGroup from exercise_muscles
--    Ties broken by emphasis_percent DESC then earliest insertion order
UPDATE "exercises" e
SET "primary_muscle_group" = (
  SELECT em.muscle_group
  FROM exercise_muscles em
  WHERE em.exercise_id = e.id
    AND em.role = 'primary'
  ORDER BY em.emphasis_percent DESC NULLS LAST, em.id ASC
  LIMIT 1
)
WHERE e.primary_muscle_group IS NULL;

-- 6. exercise_favorites — coach star system
CREATE TABLE "exercise_favorites" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id" uuid NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "coach_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_exercise_favorite" UNIQUE ("exercise_id", "coach_id")
);

CREATE INDEX "idx_exercise_favorites_coach_id"    ON "exercise_favorites" ("coach_id");
CREATE INDEX "idx_exercise_favorites_exercise_id" ON "exercise_favorites" ("exercise_id");

-- 7. exercise_coach_overrides — per-coach prescription + private notes on system exercises
CREATE TABLE "exercise_coach_overrides" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id"          uuid NOT NULL REFERENCES "exercises"("id") ON DELETE CASCADE,
  "coach_id"             uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "default_prescription" jsonb,
  "private_notes"        text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_exercise_coach_override" UNIQUE ("exercise_id", "coach_id")
);

CREATE INDEX "idx_exercise_coach_overrides_coach_id"    ON "exercise_coach_overrides" ("coach_id");
CREATE INDEX "idx_exercise_coach_overrides_exercise_id" ON "exercise_coach_overrides" ("exercise_id");
