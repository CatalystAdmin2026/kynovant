// ─────────────────────────────────────────────────────────────
// Catalyst OS — Weekly Check-In Schema (Sprint 6.3B; multi-occurrence
// model added in the Client Biometrics + Flexible Check-In Schedule
// pass)
//
// SERVER-ONLY — never import from a Client Component.
//
// Tables:
//   weekly_check_ins       — one row per client per SCHEDULED
//                             OCCURRENCE (a specific calendar date),
//                             not per week — see scheduledDate below.
//   client_check_in_schedule — effective-dated required weekdays.
//
// Status lifecycle:
//   draft → submitted → in_review → reviewed
//   reviewed → in_review (explicit reopen only)
//
// RLS: clients SELECT/INSERT/UPDATE their own draft/submitted rows.
// Coach writes are server-side (service-role, bypasses RLS).
// ─────────────────────────────────────────────────────────────

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
import { users, coachingEnrollments } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUM
// ─────────────────────────────────────────────────────────────

export const weeklyCheckInStatusEnum = pgEnum("weekly_check_in_status", [
  "draft",
  "submitted",
  "in_review",
  "reviewed",
]);

// ─────────────────────────────────────────────────────────────
// TABLE — weekly_check_ins
//
// One row per (client, scheduled_date) — the unique index
// uq_client_scheduled_check_in enforces this at the DB level.
// scheduled_date is the EXACT calendar date (in the client's own
// timezone, clientProfiles.timezone) this occurrence is required
// for — the true occurrence identity. This replaces the old
// (client, week_start_date) uniqueness, which allowed only one
// check-in per client per week and could not represent a schedule
// like "Wednesday + Sunday" (two occurrences, same week).
//
// week_start_date is RETAINED — still the Sunday of the calendar
// week scheduled_date falls in — for grouping/display and backward
// compatibility with existing queries/UI that group by week. It is
// always derived consistently from scheduled_date at write time
// (lib/db/check-in-service.ts's getScheduledDate/getWeekStartDate),
// never set independently.
//
// For a client with only one required day (or no configured
// schedule at all — the legacy/fallback case), scheduled_date for
// any given week equals exactly what week_start_date already meant
// before this change (weekStartDate + the client's single
// checkInDayOfWeek, defaulting to Sunday) — so a single-day client's
// observed behavior, and their EXISTING historical rows (backfilled
// by drizzle/0032_check_in_occurrence_model.sql using this exact
// same formula), are unchanged.
//
// coach_response is visible to the client only after status
// transitions to 'reviewed'. The service layer enforces this;
// RLS does not distinguish fields within a policy.
//
// FK behavior:
//   client_id    → RESTRICT: check-in tied to client identity
//   enrollment_id → SET NULL: check-in preserved if enrollment ends
//   reviewed_by  → SET NULL: check-in preserved if coach archived
// ─────────────────────────────────────────────────────────────

export const weeklyCheckIns = pgTable(
  "weekly_check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    enrollmentId: uuid("enrollment_id").references(
      () => coachingEnrollments.id,
      { onDelete: "set null" },
    ),

    // The exact calendar date this occurrence is required for — the
    // true occurrence identity (see table comment above).
    scheduledDate: date("scheduled_date").notNull(),

    // The Sunday of the week scheduledDate falls in — retained for
    // grouping/display/backward compatibility only (see table comment).
    weekStartDate: date("week_start_date").notNull(),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    status: weeklyCheckInStatusEnum("status").notNull().default("draft"),

    // ── Body ─────────────────────────────────────────────────
    bodyWeightLbs: numeric("body_weight_lbs", { precision: 6, scale: 1 }),
    waistInches: numeric("waist_inches", { precision: 5, scale: 1 }),

    // ── Recovery ─────────────────────────────────────────────
    averageSleepHours: numeric("average_sleep_hours", { precision: 4, scale: 1 }),
    averageStress: integer("average_stress"),   // 1–10
    averageEnergy: integer("average_energy"),   // 1–10
    averageHunger: integer("average_hunger"),   // 1–10
    digestionRating: integer("digestion_rating"), // 1–10

    // ── Habits ───────────────────────────────────────────────
    averageWaterOunces: integer("average_water_ounces"),
    averageSteps: integer("average_steps"),
    workoutCompliancePct: integer("workout_compliance_pct"),  // 0–100
    nutritionCompliancePct: integer("nutrition_compliance_pct"), // 0–100

    // ── Reflection ───────────────────────────────────────────
    wins: text("wins"),
    challenges: text("challenges"),
    questions: text("questions"),
    clientNotes: text("client_notes"),

    // ── Coach response (coach-only writes; visible after reviewed) ──
    coachResponse: text("coach_response"),
    coachReviewedAt: timestamp("coach_reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Set only when the client edits the record after it was submitted.
    // Null means it was never edited post-submission. Coach draft saves
    // do NOT update this field, keeping client-edit provenance clean.
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Prevent duplicate check-ins for the same client/occurrence.
    // Replaces the old uq_client_week_check_in(client_id,
    // week_start_date) — that constraint is exactly what made two
    // occurrences in one week impossible; this is the actual fix.
    uniqueIndex("uq_client_scheduled_check_in").on(table.clientId, table.scheduledDate),

    index("idx_check_ins_client_id").on(table.clientId),
    index("idx_check_ins_status").on(table.status),
    index("idx_check_ins_submitted_at").on(table.submittedAt),
    index("idx_check_ins_reviewed_by").on(table.reviewedBy),
    index("idx_check_ins_enrollment_id").on(table.enrollmentId),
    index("idx_check_ins_week_start_date").on(table.weekStartDate),

    // Rating range checks (1–10)
    check(
      "chk_check_in_stress",
      sql`${table.averageStress} IS NULL OR (${table.averageStress} >= 1 AND ${table.averageStress} <= 10)`,
    ),
    check(
      "chk_check_in_energy",
      sql`${table.averageEnergy} IS NULL OR (${table.averageEnergy} >= 1 AND ${table.averageEnergy} <= 10)`,
    ),
    check(
      "chk_check_in_hunger",
      sql`${table.averageHunger} IS NULL OR (${table.averageHunger} >= 1 AND ${table.averageHunger} <= 10)`,
    ),
    check(
      "chk_check_in_digestion",
      sql`${table.digestionRating} IS NULL OR (${table.digestionRating} >= 1 AND ${table.digestionRating} <= 10)`,
    ),

    // Compliance 0–100
    check(
      "chk_check_in_workout_compliance",
      sql`${table.workoutCompliancePct} IS NULL OR (${table.workoutCompliancePct} >= 0 AND ${table.workoutCompliancePct} <= 100)`,
    ),
    check(
      "chk_check_in_nutrition_compliance",
      sql`${table.nutritionCompliancePct} IS NULL OR (${table.nutritionCompliancePct} >= 0 AND ${table.nutritionCompliancePct} <= 100)`,
    ),

    // Non-negative continuous values
    check(
      "chk_check_in_sleep",
      sql`${table.averageSleepHours} IS NULL OR ${table.averageSleepHours} >= 0`,
    ),
    check(
      "chk_check_in_water",
      sql`${table.averageWaterOunces} IS NULL OR ${table.averageWaterOunces} >= 0`,
    ),
    check(
      "chk_check_in_steps",
      sql`${table.averageSteps} IS NULL OR ${table.averageSteps} >= 0`,
    ),

    // Positive-only when present
    check(
      "chk_check_in_weight",
      sql`${table.bodyWeightLbs} IS NULL OR ${table.bodyWeightLbs} > 0`,
    ),
    check(
      "chk_check_in_waist",
      sql`${table.waistInches} IS NULL OR ${table.waistInches} > 0`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPESCRIPT TYPES
// ─────────────────────────────────────────────────────────────

export type WeeklyCheckIn = typeof weeklyCheckIns.$inferSelect;
export type NewWeeklyCheckIn = typeof weeklyCheckIns.$inferInsert;

export type WeeklyCheckInStatus =
  (typeof weeklyCheckInStatusEnum.enumValues)[number];

// ─────────────────────────────────────────────────────────────
// TABLE — client_check_in_schedule
//
// Per-client configurable required check-in weekdays. Replaces the
// single-day-only coachingEnrollments.checkInDayOfWeek as the source
// of truth going forward — that column is left in place (still read
// as the legacy fallback in check-in-service.ts for a client with
// zero schedule rows) but is no longer written to by new code.
//
// EFFECTIVE-DATED, not just "currently required": each row records
// effectiveFrom (when this weekday became required) and effectiveTo
// (nullable — when it stopped being required; NULL = still active).
// This is the smallest durable answer to "did a later schedule change
// silently rewrite past compliance" (it must not): a query for what
// was required on a PAST date filters
// effectiveFrom <= date AND (effectiveTo IS NULL OR effectiveTo > date)
// — see getClientScheduleAtDate in check-in-schedule-service.ts —
// while "what's required now" (getClientSchedule) filters
// effectiveTo IS NULL. Removing a day soft-closes its row
// (effectiveTo = today) rather than deleting it, so the historical
// record that it WAS required through that date is preserved
// forever. Re-adding a previously-removed day opens a NEW row rather
// than reusing the old one, for the same reason.
//
// This is deliberately NOT full occurrence materialization (Option B
// in the design discussion) — proactively creating a
// weekly_check_ins row for every future required date would be
// overengineering. Effective-dating the SCHEDULE rows is enough:
// "was Wednesday required on Aug 19" is answerable from this table
// alone, and whether it was actually submitted is answered by
// whether a weekly_check_ins row with that scheduled_date exists —
// no need to materialize a placeholder for a missed day.
//
// weekday: 0=Sunday, 1=Monday, ..., 6=Saturday — identical convention
// to coachingEnrollments.checkInDayOfWeek, so a migration reading one
// to seed the other needs no remapping.
//
// FK behavior:
//   clientId → RESTRICT: schedule tied to client identity, same as
//   every other per-client fact table in this schema.
// ─────────────────────────────────────────────────────────────

export const clientCheckInSchedule = pgTable(
  "client_check_in_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    weekday: integer("weekday").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    // NULL = still active/required today.
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // At most ONE currently-active row per (client, weekday) — a
    // partial unique index (WHERE effective_to IS NULL), the exact
    // pattern already used for "exactly one published target per
    // client" in schema-nutrition.ts's
    // uq_active_published_nutrition_target. Historical (closed) rows
    // for the same weekday are NOT constrained by this — a day can be
    // added, removed, and re-added over time, each as its own row.
    uniqueIndex("uq_client_check_in_schedule_active_day")
      .on(table.clientId, table.weekday)
      .where(sql`${table.effectiveTo} IS NULL`),
    index("idx_check_in_schedule_client_id").on(table.clientId),
    check(
      "chk_check_in_schedule_weekday_range",
      sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`,
    ),
    check(
      "chk_check_in_schedule_effective_order",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
  ],
);

export type ClientCheckInScheduleRow = typeof clientCheckInSchedule.$inferSelect;
export type NewClientCheckInScheduleRow = typeof clientCheckInSchedule.$inferInsert;
