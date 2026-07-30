// ─────────────────────────────────────────────────────────────
// Catalyst OS — Nutrition Schema (Nutrition Foundation)
//
// SERVER-ONLY — never import from a Client Component.
//
// Tables:
//   client_nutrition_targets — effective-dated coaching decisions
//
// Design:
//   Targets are append-only historical records, not mutable settings.
//   Each target record captures the full four-stage model:
//     calculator inputs → system recommendation → coach decision → publication
//   See docs/ARCHITECTURE_DECISIONS.md ADR-014 for full rationale.
//
// RLS:
//   Clients SELECT their own published targets only.
//   Coach writes are service-role (bypass RLS).
//   Draft targets and recommendation columns are never exposed client-side.
// ─────────────────────────────────────────────────────────────

import "server-only";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";
import { biologicalSexEnum } from "./schema-profile";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const nutritionTargetStatusEnum = pgEnum("nutrition_target_status", [
  "draft",
  "published",
  "archived",
]);

// Activity level for TDEE calculation.
// Maps to standard Harris-Benedict / Mifflin-St Jeor activity multipliers.
export const activityLevelEnum = pgEnum("activity_level", [
  "sedentary",          // desk job, minimal movement outside structured exercise
  "lightly_active",     // 1-3 light sessions/week
  "moderately_active",  // 3-5 moderate sessions/week
  "very_active",        // 6-7 intense sessions/week
  "extra_active",       // twice/day training or very physical occupation
]);

// ─────────────────────────────────────────────────────────────
// TABLE — client_nutrition_targets
//
// One row per coaching decision. Append-only.
// Previous targets are archived, never deleted.
//
// Partial unique index: exactly one published target per client.
//   Additional published rows are rejected at the DB level.
//
// FK behavior:
//   clientId    → RESTRICT : target tied to client identity
//   coachId     → SET NULL : target preserved if coach is removed
//   archivedBy  → SET NULL : audit reference, not load-bearing
// ─────────────────────────────────────────────────────────────

export const clientNutritionTargets = pgTable(
  "client_nutrition_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Ownership ─────────────────────────────────────────────
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    coachId: uuid("coach_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // ── Lifecycle ─────────────────────────────────────────────
    status: nutritionTargetStatusEnum("status").notNull().default("draft"),

    // The date from which this target is/was effective.
    // Defaults to today when draft is created; can be set to past or future.
    effectiveDate: date("effective_date").notNull(),

    // ── Stage 1 — Calculator inputs (stored for audit) ────────
    // All nullable: a coach may create a target without using the calculator.
    calcHeightInches: numeric("calc_height_inches"),
    calcWeightLbs: numeric("calc_weight_lbs"),
    calcAgeYears: integer("calc_age_years"),
    calcBiologicalSex: biologicalSexEnum("calc_biological_sex"),
    calcActivityLevel: activityLevelEnum("calc_activity_level"),
    calcGoalType: text("calc_goal_type"),

    // ── Stage 2 — System recommendation (calculator output) ───
    // Stored for audit trail. Never automatically published.
    recCalories: integer("rec_calories"),
    recProteinG: integer("rec_protein_g"),
    recFatG: integer("rec_fat_g"),
    recCarbG: integer("rec_carb_g"),
    recBmr: integer("rec_bmr"),
    recTdee: integer("rec_tdee"),
    recFormulaVersion: text("rec_formula_version"),

    // ── Stage 3 — Coach decision ──────────────────────────────
    // What the coach actually set. May equal recommendation or diverge.
    calorieTarget: integer("calorie_target").notNull(),
    proteinGrams: integer("protein_grams").notNull(),
    fatGrams: integer("fat_grams"),
    carbGrams: integer("carb_grams"),
    // Optional: coach records why they deviated from the recommendation.
    adjustmentReason: text("adjustment_reason"),

    // ── Stage 4 — Published client target ─────────────────────
    // coachNotes is shown to the client explaining the why.
    coachNotes: text("coach_notes"),

    // Internal notes — never shown to the client.
    internalNotes: text("internal_notes"),

    // ── Timestamps ────────────────────────────────────────────
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // ── Uniqueness: exactly one published target per client ────
    // Partial unique index enforces this at the DB level.
    // Publishing a second target requires archiving the first.
    uniqueIndex("uq_active_published_nutrition_target")
      .on(table.clientId)
      .where(sql`${table.status} = 'published'`),

    // ── Query indexes ─────────────────────────────────────────
    index("idx_nutrition_targets_client_id").on(table.clientId),
    index("idx_nutrition_targets_status").on(table.status),
    index("idx_nutrition_targets_client_effective").on(
      table.clientId,
      table.effectiveDate,
    ),

    // ── Value guards ──────────────────────────────────────────
    check(
      "chk_nutrition_calorie_target",
      sql`${table.calorieTarget} > 0`,
    ),
    check(
      "chk_nutrition_protein_g",
      sql`${table.proteinGrams} > 0`,
    ),
    check(
      "chk_nutrition_fat_g",
      sql`${table.fatGrams} IS NULL OR ${table.fatGrams} >= 0`,
    ),
    check(
      "chk_nutrition_carb_g",
      sql`${table.carbGrams} IS NULL OR ${table.carbGrams} >= 0`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPES
// ─────────────────────────────────────────────────────────────

export type ClientNutritionTarget = typeof clientNutritionTargets.$inferSelect;
export type NewClientNutritionTarget =
  typeof clientNutritionTargets.$inferInsert;
export type NutritionTargetStatus =
  (typeof nutritionTargetStatusEnum.enumValues)[number];
export type ActivityLevel = (typeof activityLevelEnum.enumValues)[number];
