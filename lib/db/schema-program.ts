// ─────────────────────────────────────────────────────────────
// Catalyst OS — Program & Session Schema (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
//
// Tables in this file:
//   program_weeks         — weekly slots within a program template
//   program_week_days     — workout blueprint per day-of-week per week
//   client_programs       — program assignment to a specific client
//   workout_sessions      — completed (or in-progress) workout records
//   workout_set_logs      — set-level completion log
//
// Immutability strategy:
//   - client_programs.programTemplateId references the specific version
//     row that was active at assignment time. Editing a program creates
//     a new version (new row); old assignments are unaffected.
//   - workout_sessions.workoutSnapshot stores the full exercise structure
//     at session-creation time. Even if the blueprint is edited, the
//     historical session preserves exactly what was prescribed.
//   - workout_set_logs rows are never updated — new logs supersede old.
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  date,
  jsonb,
  boolean,
  numeric,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  users,
  coachingEnrollments,
  programTemplates,
  workoutTemplates,
} from "./schema";
import { workoutTemplateExercises } from "./schema-exercise";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const clientProgramStatusEnum = pgEnum("client_program_status", [
  "active",
  "inactive",
  "completed",
  "cancelled",
]);

export const workoutSessionStatusEnum = pgEnum("workout_session_status", [
  "in_progress",
  "completed",
  "skipped",
]);

// [Workout set draft autosave] Before this, workout_set_logs had no
// field distinguishing "the client typed something" from "the client
// tapped Log" — a row's mere existence WAS the only signal, and
// computeCompletionPercent() (lib/db/workout-session-service.ts)
// counts rows with a plain count(*), so writing autosaved draft values
// into this table unchanged would have silently inflated completion
// percentage and made hydration show an unfinished set as done. See
// the workoutSetLogs table's own comment below for how `status` and
// `draftSeq` close that gap.
export const setLogStatusEnum = pgEnum("set_log_status", ["draft", "logged"]);

// ─────────────────────────────────────────────────────────────
// TABLE 1 — program_weeks
//
// One row per week in a program template. weekNumber is 1-indexed.
// The label is optional coach copy ("Week 1: Foundation",
// "Deload Week", etc.).
//
// FK behavior:
//   programTemplateId → RESTRICT: weeks are deleted by archiving the
//     program; prevent cascade by making coaches explicitly manage.
// ─────────────────────────────────────────────────────────────

export const programWeeks = pgTable(
  "program_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programTemplateId: uuid("program_template_id")
      .notNull()
      .references(() => programTemplates.id, { onDelete: "restrict" }),
    weekNumber: integer("week_number").notNull(),
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_program_week").on(
      table.programTemplateId,
      table.weekNumber,
    ),
    index("idx_program_weeks_template_id").on(table.programTemplateId),
    check("chk_week_number_positive", sql`${table.weekNumber} >= 1`),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 2 — program_week_days
//
// One row per training day within a program week.
// dayOfWeek follows JS convention: 0=Sunday, 1=Monday … 6=Saturday.
// workoutTemplateId IS NULL means the slot is a rest day.
//
// Only days with a workout assignment get a row. Absence of a row
// for a given dayOfWeek also implies a rest day (idempotent).
//
// FK behavior:
//   programWeekId      → RESTRICT: manage via program week deletion
//   workoutTemplateId  → RESTRICT: can't delete an active blueprint
// ─────────────────────────────────────────────────────────────

export const programWeekDays = pgTable(
  "program_week_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programWeekId: uuid("program_week_id")
      .notNull()
      .references(() => programWeeks.id, { onDelete: "restrict" }),
    dayOfWeek: integer("day_of_week").notNull(),
    workoutTemplateId: uuid("workout_template_id").references(
      () => workoutTemplates.id,
      { onDelete: "restrict" },
    ),
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_program_week_day").on(
      table.programWeekId,
      table.dayOfWeek,
    ),
    index("idx_program_week_days_week_id").on(table.programWeekId),
    index("idx_program_week_days_workout_template").on(
      table.workoutTemplateId,
    ),
    check(
      "chk_day_of_week_range",
      sql`${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 3 — client_programs
//
// Assignment of a specific program template version to a client.
// Because programTemplateId points to a specific version row, the
// assignment is pinned — creating a new version for the template
// does not alter existing assignments.
//
// SINGLE-ACTIVE-PROGRAM RULE:
//   Enforced at the application layer (not DB constraint) because
//   overrideAllowMultiple is a valid escape hatch. The service
//   function checks for existing active programs before inserting.
//
// endDate is set automatically when status transitions to
// 'completed' or 'cancelled', or can be set manually by a coach.
//
// FK behavior:
//   clientId          → RESTRICT: assignment tied to client identity
//   enrollmentId      → SET NULL: assignment preserved if enrollment ends
//   programTemplateId → RESTRICT: can't delete an assigned template version
// ─────────────────────────────────────────────────────────────

export const clientPrograms = pgTable(
  "client_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    enrollmentId: uuid("enrollment_id").references(
      () => coachingEnrollments.id,
      { onDelete: "set null" },
    ),
    programTemplateId: uuid("program_template_id")
      .notNull()
      .references(() => programTemplates.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: clientProgramStatusEnum("status").notNull().default("active"),
    overrideAllowMultiple: boolean("override_allow_multiple")
      .notNull()
      .default(false),
    coachNotes: text("coach_notes"),
    // Lineage snapshot — frozen at assignment time so historical records
    // survive template renames and version increments.
    sourceTemplateName: text("source_template_name"),
    sourceTemplateVersion: integer("source_template_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Partial unique index: only one non-override active program per client
    // at the DB level. overrideAllowMultiple=true rows are excluded from the
    // index, allowing the escape hatch while still preventing concurrent
    // race conditions on normal assignments.
    uniqueIndex("uq_client_active_program")
      .on(table.clientId)
      .where(sql`${table.status} = 'active' AND ${table.overrideAllowMultiple} = false`),
    index("idx_client_programs_client_id").on(table.clientId),
    index("idx_client_programs_enrollment_id").on(table.enrollmentId),
    index("idx_client_programs_template_id").on(table.programTemplateId),
    index("idx_client_programs_status").on(table.status),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 3B — client_program_weeks
//
// Client-owned copy of the program week structure, created at
// assignment time. Independent from program_weeks — edits here
// affect only this client and never touch the template.
//
// source_week_id preserves the lineage back to the template week
// this row was copied from, enabling future "sync from template"
// diff workflows. SET NULL on deletion so template cleanup never
// breaks a client's active program.
// ─────────────────────────────────────────────────────────────

export const clientProgramWeeks = pgTable(
  "client_program_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientProgramId: uuid("client_program_id")
      .notNull()
      .references(() => clientPrograms.id, { onDelete: "restrict" }),
    sourceWeekId: uuid("source_week_id").references(
      () => programWeeks.id,
      { onDelete: "set null" },
    ),
    weekNumber: integer("week_number").notNull(),
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_client_program_week").on(
      table.clientProgramId,
      table.weekNumber,
    ),
    index("idx_client_program_weeks_program_id").on(table.clientProgramId),
    index("idx_client_program_weeks_source_week").on(table.sourceWeekId),
    check("chk_client_week_number_positive", sql`${table.weekNumber} >= 1`),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 3C — client_program_week_days
//
// Client-owned copy of the day-level scheduling, created at
// assignment time. workout_template_id continues to reference
// the shared workout_templates table — workout blueprints remain
// reusable reference data, only the scheduling layer is copied.
//
// source_day_id preserves lineage back to the template day row.
// SET NULL on deletion so coaches can clean up their template
// library without affecting active client schedules.
// ─────────────────────────────────────────────────────────────

export const clientProgramWeekDays = pgTable(
  "client_program_week_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientProgramWeekId: uuid("client_program_week_id")
      .notNull()
      .references(() => clientProgramWeeks.id, { onDelete: "restrict" }),
    sourceDayId: uuid("source_day_id").references(
      () => programWeekDays.id,
      { onDelete: "set null" },
    ),
    dayOfWeek: integer("day_of_week").notNull(),
    workoutTemplateId: uuid("workout_template_id").references(
      () => workoutTemplates.id,
      { onDelete: "restrict" },
    ),
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_client_program_week_day").on(
      table.clientProgramWeekId,
      table.dayOfWeek,
    ),
    index("idx_client_program_week_days_week_id").on(table.clientProgramWeekId),
    index("idx_client_program_week_days_workout_template").on(
      table.workoutTemplateId,
    ),
    index("idx_client_program_week_days_source_day").on(table.sourceDayId),
    check(
      "chk_client_day_of_week_range",
      sql`${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 4 — workout_sessions
//
// One row per workout a client starts or completes.
// workoutSnapshot freezes the full exercise structure (sections +
// prescriptions + exercise names) at session-creation time so
// historical records survive blueprint edits.
//
// completionPercent = (set_logs completed / sets prescribed) * 100.
// Computed and stored when the client finishes or the session expires.
//
// programWeekNumber and programDayOfWeek record which slot in the
// program this session fulfills. NULL values mean the session was
// started ad-hoc (outside a program, or program was deleted).
//
// FK behavior:
//   clientId          → RESTRICT: session tied to client identity
//   clientProgramId   → SET NULL: session preserved if program is cancelled
//   workoutTemplateId → RESTRICT: can't delete a template with sessions
// ─────────────────────────────────────────────────────────────

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientProgramId: uuid("client_program_id").references(
      () => clientPrograms.id,
      { onDelete: "set null" },
    ),
    workoutTemplateId: uuid("workout_template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    programWeekNumber: integer("program_week_number"),
    programDayOfWeek: integer("program_day_of_week"),
    scheduledDate: date("scheduled_date"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: workoutSessionStatusEnum("status")
      .notNull()
      .default("in_progress"),
    completionPercent: integer("completion_percent").notNull().default(0),
    workoutSnapshot: jsonb("workout_snapshot").notNull().default({}),
    clientNotes: text("client_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workout_sessions_client_id").on(table.clientId),
    index("idx_workout_sessions_program_id").on(table.clientProgramId),
    index("idx_workout_sessions_template_id").on(table.workoutTemplateId),
    index("idx_workout_sessions_scheduled_date").on(table.scheduledDate),
    index("idx_workout_sessions_status").on(table.status),
    check(
      "chk_session_completion_percent",
      sql`${table.completionPercent} >= 0 AND ${table.completionPercent} <= 100`,
    ),
    check(
      "chk_session_day_of_week",
      sql`${table.programDayOfWeek} IS NULL OR (${table.programDayOfWeek} >= 0 AND ${table.programDayOfWeek} <= 6)`,
    ),
    // completedAt must be set when status='completed'
    check(
      "chk_session_completed_at",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 5 — workout_set_logs
//
// One row per (session, exercise, set slot) — the SAME row represents
// either an unfinished autosaved draft or a client-confirmed logged
// set over its lifetime, distinguished by `status`, never by row
// existence alone. Unique on (sessionId, exerciseId, setNumber) so
// duplicate taps from the UI are idempotent (ON CONFLICT DO UPDATE).
//
// [Workout set draft autosave]
//   status='logged' — the client explicitly tapped Log. This is what
//     computeCompletionPercent() counts, and the only state
//     getWorkoutSession()'s hydration reports as done/restored-logged.
//   status='draft'  — the client typed values that autosaved but has
//     NOT tapped Log yet. Never counted toward completion, never
//     reported as done on hydration — restored into the editable
//     fields instead, still requiring an explicit Log tap.
//   draftSeq — a client-supplied sequence (Date.now() at the moment of
//     the edit that triggered this autosave/clear) written ONLY by the
//     draft-autosave/clear paths. The autosave upsert's own WHERE
//     clause and the clear path's own DELETE WHERE clause (see
//     saveSetDraft()/clearSetDraft() in
//     lib/db/workout-session-service.ts) both require
//     status='draft' AND draft_seq < the incoming value before
//     applying a change — so an out-of-order-arriving autosave
//     response can never overwrite a newer one's values, a second
//     tab's stale write (or stale clear) can never clobber a newer
//     one from another tab, and NO draft write/clear of any age can
//     ever touch a row that has already reached status='logged'. NULL
//     for any row that has only ever been logged directly (never
//     autosaved) — including every row that existed before this
//     column was added, which is why existing rows default to
//     status='logged' below: every row ever written before draft
//     autosave existed could only have come from an explicit Log tap.
//     [Independent review remediation] Honest limitation, not
//     resolved by this design and not claimed otherwise: Date.now() is
//     wall-clock milliseconds, not a distributed logical clock. Two
//     genuinely distinct edits (e.g. from two different tabs) that
//     land in the SAME millisecond produce an EQUAL draftSeq, and the
//     comparison above is a strict `<` — an incoming write whose
//     draftSeq merely EQUALS the stored one is treated as not-newer
//     and rejected, even though it may in fact be the more recent
//     edit. This is accepted, non-blocking MVP behavior (an
//     exceedingly rare, single-set, sub-millisecond coincidence), not
//     a mathematically total ordering across simultaneous tabs — do
//     not read "newest always wins" as an absolute guarantee at
//     millisecond granularity.
//
// actualWeightKg is optional — used for load-tracking features
// in a future sprint. NULL is the correct value for bodyweight
// and time/distance exercises.
//
// FK behavior:
//   workoutSessionId           → CASCADE: logs deleted with the session
//   workoutTemplateExerciseId  → RESTRICT: can't delete a prescribed
//     exercise that has set logs (preserves session-template link)
// ─────────────────────────────────────────────────────────────

export const workoutSetLogs = pgTable(
  "workout_set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    workoutTemplateExerciseId: uuid("workout_template_exercise_id")
      .notNull()
      .references(() => workoutTemplateExercises.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualReps: integer("actual_reps"),
    actualWeightKg: numeric("actual_weight_kg", { precision: 7, scale: 2 }),
    actualDurationSeconds: integer("actual_duration_seconds"),
    actualRpe: numeric("actual_rpe", { precision: 3, scale: 1 }),
    notes: text("notes"),
    status: setLogStatusEnum("status").notNull().default("logged"),
    draftSeq: bigint("draft_seq", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_set_log").on(
      table.workoutSessionId,
      table.workoutTemplateExerciseId,
      table.setNumber,
    ),
    index("idx_set_logs_session_id").on(table.workoutSessionId),
    index("idx_set_logs_exercise_id").on(table.workoutTemplateExerciseId),
    check("chk_set_number_positive", sql`${table.setNumber} >= 1`),
    check(
      "chk_actual_rpe",
      sql`${table.actualRpe} IS NULL OR (${table.actualRpe} >= 0 AND ${table.actualRpe} <= 10)`,
    ),
    check("chk_actual_reps_nonneg", sql`${table.actualReps} IS NULL OR ${table.actualReps} >= 0`),
    check(
      "chk_actual_weight_nonneg",
      sql`${table.actualWeightKg} IS NULL OR ${table.actualWeightKg} >= 0`,
    ),
    check(
      "chk_actual_duration_nonneg",
      sql`${table.actualDurationSeconds} IS NULL OR ${table.actualDurationSeconds} >= 0`,
    ),
    check("chk_draft_seq_nonneg", sql`${table.draftSeq} IS NULL OR ${table.draftSeq} >= 0`),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPESCRIPT TYPES
// ─────────────────────────────────────────────────────────────

export type ProgramWeek = typeof programWeeks.$inferSelect;
export type NewProgramWeek = typeof programWeeks.$inferInsert;

export type ProgramWeekDay = typeof programWeekDays.$inferSelect;
export type NewProgramWeekDay = typeof programWeekDays.$inferInsert;

export type ClientProgram = typeof clientPrograms.$inferSelect;
export type NewClientProgram = typeof clientPrograms.$inferInsert;

export type ClientProgramWeek = typeof clientProgramWeeks.$inferSelect;
export type NewClientProgramWeek = typeof clientProgramWeeks.$inferInsert;

export type ClientProgramWeekDay = typeof clientProgramWeekDays.$inferSelect;
export type NewClientProgramWeekDay = typeof clientProgramWeekDays.$inferInsert;

export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;

export type WorkoutSetLog = typeof workoutSetLogs.$inferSelect;
export type NewWorkoutSetLog = typeof workoutSetLogs.$inferInsert;

// Enum value types
export type ClientProgramStatus =
  (typeof clientProgramStatusEnum.enumValues)[number];
export type WorkoutSessionStatus =
  (typeof workoutSessionStatusEnum.enumValues)[number];
