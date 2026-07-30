-- ─────────────────────────────────────────────────────────────
-- Migration 0012 — Nutrition Foundation
--
-- Creates the client_nutrition_targets table and supporting types.
-- Implements the four-stage Nutrition model defined in ADR-014.
--
-- 1. Two new enums: nutrition_target_status, activity_level
-- 2. client_nutrition_targets table (append-only target records)
-- 3. Partial unique index: one published target per client
-- 4. Query indexes for efficient lookup
-- 5. Value constraints
-- 6. RLS policies: clients SELECT own published targets only
-- ─────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────

CREATE TYPE "public"."nutrition_target_status" AS ENUM(
  'draft',
  'published',
  'archived'
);--> statement-breakpoint

CREATE TYPE "public"."activity_level" AS ENUM(
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active'
);--> statement-breakpoint

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE "client_nutrition_targets" (
  -- Identity
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id"             uuid NOT NULL,
  "coach_id"              uuid,

  -- Lifecycle
  "status"                "nutrition_target_status" NOT NULL DEFAULT 'draft',
  "effective_date"        date NOT NULL,

  -- Stage 1: Calculator inputs (audit record; all nullable)
  "calc_height_inches"    numeric,
  "calc_weight_lbs"       numeric,
  "calc_age_years"        integer,
  "calc_biological_sex"   "biological_sex",
  "calc_activity_level"   "activity_level",
  "calc_goal_type"        text,

  -- Stage 2: System recommendation (calculator output; never auto-published)
  "rec_calories"          integer,
  "rec_protein_g"         integer,
  "rec_fat_g"             integer,
  "rec_carb_g"            integer,
  "rec_bmr"               integer,
  "rec_tdee"              integer,
  "rec_formula_version"   text,

  -- Stage 3: Coach decision (may equal recommendation or override)
  "calorie_target"        integer NOT NULL,
  "protein_grams"         integer NOT NULL,
  "fat_grams"             integer,
  "carb_grams"            integer,
  "adjustment_reason"     text,

  -- Stage 4: Published client target (coaching context)
  "coach_notes"           text,
  "internal_notes"        text,

  -- Timestamps
  "published_at"          timestamp with time zone,
  "archived_at"           timestamp with time zone,
  "archived_by"           uuid,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),

  -- Value constraints
  CONSTRAINT "chk_nutrition_calorie_target" CHECK ("calorie_target" > 0),
  CONSTRAINT "chk_nutrition_protein_g"      CHECK ("protein_grams" > 0),
  CONSTRAINT "chk_nutrition_fat_g"          CHECK ("fat_grams" IS NULL OR "fat_grams" >= 0),
  CONSTRAINT "chk_nutrition_carb_g"         CHECK ("carb_grams" IS NULL OR "carb_grams" >= 0)
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────

ALTER TABLE "client_nutrition_targets"
  ADD CONSTRAINT "nutrition_targets_client_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "client_nutrition_targets"
  ADD CONSTRAINT "nutrition_targets_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "client_nutrition_targets"
  ADD CONSTRAINT "nutrition_targets_archived_by_fk"
  FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ── Partial unique index ───────────────────────────────────────
-- Enforces exactly one published target per client at any time.
-- Publishing a second target requires archiving the first.
-- The DB constraint prevents race conditions in the service layer.

CREATE UNIQUE INDEX "uq_active_published_nutrition_target"
  ON "client_nutrition_targets" ("client_id")
  WHERE "status" = 'published';--> statement-breakpoint

-- ── Query indexes ─────────────────────────────────────────────

CREATE INDEX "idx_nutrition_targets_client_id"
  ON "client_nutrition_targets" ("client_id");--> statement-breakpoint

CREATE INDEX "idx_nutrition_targets_status"
  ON "client_nutrition_targets" ("status");--> statement-breakpoint

CREATE INDEX "idx_nutrition_targets_client_effective"
  ON "client_nutrition_targets" ("client_id", "effective_date");--> statement-breakpoint

-- ── Row Level Security ────────────────────────────────────────
-- Server writes use service-role (bypass RLS).
-- Clients may SELECT only their own published targets.
-- Draft targets, recommendation columns, and internal notes
-- are never exposed via RLS — they live in server-only service code.

ALTER TABLE public.client_nutrition_targets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Clients see only their own published target.
-- Draft, archived, internal_notes, adjustment_reason are withheld.
CREATE POLICY "nutrition_targets_client_select_published"
  ON public.client_nutrition_targets
  FOR SELECT TO authenticated
  USING (auth.uid() = client_id AND status = 'published');
