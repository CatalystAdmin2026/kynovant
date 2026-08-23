// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Draft Storage Schema
//
// SERVER-ONLY — never import this file from a Client Component.
//
// Tables:
//   program_generation_drafts            — one row per Program Brief → draft
//   program_generation_runs              — one row per generation attempt
//                                           (initial generate, resume/retry,
//                                           regenerate-one-day), tracks
//                                           staged week/day-by-day progress
//   program_generation_days              — one row per (draft, week, day) —
//                                           the durable, resumable unit of
//                                           work day-level staged generation
//                                           writes to; latest attempt only
//   program_generation_weeks             — one row per week of a staged
//                                           generation, assembled from that
//                                           week's completed day rows once
//                                           all of them finish; latest
//                                           attempt only
//   program_generation_edit_events       — coach edit audit log
//   program_generation_validation_events — Kynovant Insights run audit log
//
// Staged generation (see lib/program-generator/provider.ts's
// generateProgramShell()/generateProgramWeek() and actions.ts's
// orchestration): a full-program generation is a lightweight shell call
// followed by one generateObject() call per week, never one call for the
// entire multi-week program — see docs on program_generation_weeks below
// for why. draftJson/draft_version are only ever written once, at final
// assembly, from the concatenated completed weeks — never incrementally.
//
// This is the "temporary review object, not yet a real Program" storage
// layer described in docs/ai-program-generator-ux-spec.md §16. Generated
// content lives here as JSONB — completely separate from program_templates/
// workout_templates (lib/db/schema.ts) and program_weeks/program_week_days
// (lib/db/schema-program.ts) — until an explicit coach approval creates
// real rows in those tables. See lib/program-generator/approval.ts.
//
// Every JSON field's shape is defined and validated by
// lib/program-generator/contracts.ts (zod schemas) — this file only
// defines the storage envelope, not the content contract.
//
// Tenant ownership: coachId is NOT nullable and is never null=admin here,
// unlike TenantScope elsewhere in this codebase. A draft is always
// attributable to the coach who triggered generation — see
// docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md for why
// coach-scoped ownership matters even before multi-coach launch. Admins
// reach drafts via the same requireCoachOrAdmin() guard used everywhere
// else in HQ (admin bypass happens at the query/guard layer, not by a
// null-coachId convention on this table).
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, programTemplates } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

// Draft lifecycle. "running" covers both the initial generation and any
// regenerate-all/regenerate-day attempt currently in flight — the draft
// itself has exactly one lifecycle even though program_generation_runs
// tracks each individual attempt separately.
export const programGenerationStatusEnum = pgEnum("program_generation_status", [
  "queued",
  "running",
  "ready_for_review",
  "failed",
  "approved",
  "discarded",
]);

export const programGenerationRunStatusEnum = pgEnum("program_generation_run_status", [
  "queued",
  "running",
  "complete",
  "failed",
  "cancelled",
]);

// Distinguishes a full-draft generation/regeneration from a single-day
// regenerate — see lib/program-generator's regenerateDay() vs
// generateDraft()/regenerateDraft().
export const programGenerationRunScopeEnum = pgEnum("program_generation_run_scope", [
  "full_draft",
  "single_day",
]);

export const programGenerationValidationStatusEnum = pgEnum(
  "program_generation_validation_status",
  ["ready", "warnings", "blocked", "failed"],
);

export const programGenerationEditActionEnum = pgEnum("program_generation_edit_action", [
  "brief_updated",
  "day_regenerated",
  "exercise_replaced",
  "prescription_updated",
  "exercise_reordered",
  "day_moved",
  "progression_updated",
]);

// Only terminal states are persisted — a week row is written once its
// generateProgramWeek() call has either succeeded or failed, never for
// an in-flight attempt (staged generation runs synchronously within one
// server action; "in progress" is represented by program_generation_runs.
// current_week, not by a week row).
export const programGenerationWeekStatusEnum = pgEnum("program_generation_week_status", [
  "completed",
  "failed",
]);

// Same "only terminal states are persisted" rule as weeks (above) — a
// day row is written once its generateProgramDay() call has succeeded
// or failed, never for an in-flight attempt. 'pending' and 'generating'
// are part of the enum (matching this task's requested vocabulary and
// leaving room for a future async/worker model without a schema
// change) but are not written by the current synchronous, one-Server-
// Action-per-attempt implementation — the absence of a row for a given
// (draft, week, day) already means "not yet generated," which is what
// resume logic (findFirstIncompleteDay(), staged-generation.ts) reads.
export const programGenerationDayStatusEnum = pgEnum("program_generation_day_status", [
  "pending",
  "generating",
  "completed",
  "failed",
]);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_drafts
//
// briefJson: validated ProgramGenerationBrief (contracts.ts). Set once at
//   creation; only ever replaced wholesale (brief_updated edit event),
//   never partially patched in place — matches decision #4/#8 reasoning
//   already established for the applications table (immutable-unless-
//   explicitly-versioned inputs, see lib/db/schema-applications.ts).
// draftJson: validated GeneratedProgramDraft (contracts.ts), or null
//   before the first successful generation run completes.
// insightsJson: last GeneratedDraftInsights result, or null before the
//   first validation run. Re-run after every edit that could change
//   findings (see validationQueued semantics in the service layer).
// version: bumped on every edit to draftJson (brief edits do not bump
//   this — brief and draft are versioned independently since editing the
//   brief does not retroactively change an already-generated draft).
// ─────────────────────────────────────────────────────────────

export const programGenerationDrafts = pgTable(
  "program_generation_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),

    status: programGenerationStatusEnum("status").notNull().default("queued"),

    briefJson: jsonb("brief_json").notNull(),
    briefVersion: integer("brief_version").notNull().default(1),

    // Validated ProgramShell (contracts.ts) — title/description/day
    // labels/phase-progression outline/global constraints. Generated
    // once, before any week, and held fixed across every week-generation
    // call and any later resume/retry so week N+1 is still building the
    // same program as week 1. Null until the shell call completes.
    shellJson: jsonb("shell_json"),

    // Phase C (Programming Intelligence block-based generation, drizzle/
    // 0036): set exactly once — the first time runStagedGeneration()
    // runs for this draft, while it's still genuinely fresh (no shell,
    // no completed weeks) — to "block" or "legacy_day"
    // (lib/program-generator/block-plan.ts's GenerationArchitecture).
    // Read on every later call (fresh or resume) so the routing
    // decision never has to be re-derived from existing progress, which
    // cannot reliably distinguish a block-architecture canonical week
    // from an ordinary legacy week (both are produced by the identical
    // AI day-by-day mechanism). NULL on every draft that predates this
    // migration — those fall back to the original "any existing
    // progress -> legacy_day" derivation, unconditionally and forever.
    // App-layer-validated (not a new Postgres enum) — see this
    // migration's own header for why.
    generationArchitecture: text("generation_architecture"),

    // Phase D (blueprint-guided canonical-week concurrency, drizzle/
    // 0038): set exactly once, at the SAME moment generationArchitecture
    // itself is first decided, and ONLY when that decision is "block"
    // (always NULL for legacy_day — there is only ever one legacy_day
    // behavior, so a version number would be meaningless for it).
    //   1 = Phase C: canonical week generated serially, no blueprint.
    //   2 = Phase D: canonical week generated via a deterministic
    //       blueprint (lib/program-generator/blueprint.ts) + bounded
    //       concurrent day calls.
    // Review requirement (Phase D task, "Architecture Versioning"): a
    // Phase C block draft already in progress when Phase D ships must
    // NEVER silently switch to blueprint+concurrent generation mid-
    // block — that would let a NEW day (generated with sibling-
    // coordination intent) sit next to an OLDER day generated with none,
    // changing sibling responsibilities the coach never saw change.
    // Read on every later call exactly like generationArchitecture
    // itself — never re-derived, never inferred from progress state.
    generationArchitectureVersion: integer("generation_architecture_version"),

    draftJson: jsonb("draft_json"),
    draftVersion: integer("draft_version").notNull().default(0),

    insightsJson: jsonb("insights_json"),
    validationStatus: programGenerationValidationStatusEnum("validation_status"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),

    // Locked rule #8: warnings require explicit coach acknowledgement
    // before approval. Valid only when it postdates lastValidatedAt — a
    // later validation rerun (which can surface different warnings)
    // always invalidates a prior acknowledgement. See
    // lib/program-generator/approval.ts's ownership/blocker/warning
    // checks and lib/db/program-generation-service.ts's
    // acknowledgeWarnings().
    warningsAcknowledgedAt: timestamp("warnings_acknowledged_at", { withTimezone: true }),

    // Granular acknowledgement tracking for the review triage UI —
    // stores a mix of "finding:<findingId>" (one occurrence) and
    // "group:<groupKey>" (a whole grouped issue, see
    // lib/program-generator/findings-grouping.ts) entries. Coverage of
    // every current warning's key (directly or via its group) is what
    // sets warningsAcknowledgedAt above — see acknowledgeFindingKeys()
    // in lib/db/program-generation-service.ts. Reset to [] on every
    // revalidation, same invalidation rule as warningsAcknowledgedAt
    // (finding ids are randomUUID() per run and stop meaning anything
    // once a new run has happened anyway).
    acknowledgedFindingKeys: jsonb("acknowledged_finding_keys").notNull().default([]),

    failureReason: text("failure_reason"),

    // Set only on approval — see lib/program-generator/approval.ts. Null
    // until then. createdWorkoutTemplateIds is a plain jsonb string array;
    // there's no FK array type in Postgres, and these are audit pointers,
    // not relationships the DB needs to enforce.
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdProgramTemplateId: uuid("created_program_template_id").references(
      () => programTemplates.id,
      { onDelete: "set null" },
    ),
    createdWorkoutTemplateIds: jsonb("created_workout_template_ids"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_drafts_coach_id").on(table.coachId),
    index("idx_program_generation_drafts_client_id").on(table.clientId),
    index("idx_program_generation_drafts_status").on(table.status),
    index("idx_program_generation_drafts_created_at").on(table.createdAt),
    // Mirrors drizzle/0037_generation_architecture_check.sql — kept as
    // a plain text column + CHECK (not a Postgres enum) per drizzle/
    // 0036's own header; the allowed values are block-plan.ts's
    // GENERATION_ARCHITECTURES, restated here rather than imported
    // (this schema file has no dependency on lib/program-generator/).
    check(
      "chk_program_generation_drafts_generation_architecture",
      sql`${table.generationArchitecture} IS NULL OR ${table.generationArchitecture} IN ('legacy_day', 'block')`,
    ),
    // Mirrors drizzle/0038_generation_architecture_version_check.sql.
    // Only 1 or 2 are meaningful today (Phase C serial / Phase D
    // blueprint+concurrent); NULL covers legacy_day drafts and every
    // draft that predates this column.
    check(
      "chk_program_generation_drafts_generation_architecture_version",
      sql`${table.generationArchitectureVersion} IS NULL OR ${table.generationArchitectureVersion} IN (1, 2)`,
    ),
    // A version is only ever meaningful alongside architecture='block' —
    // legacy_day never has one (see the column's own comment).
    check(
      "chk_program_generation_drafts_architecture_version_pairing",
      sql`${table.generationArchitectureVersion} IS NULL OR ${table.generationArchitecture} = 'block'`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_runs
//
// One row per generation attempt. A draft typically has one run (the
// initial generation) plus zero or more additional runs from a resume/
// retry after a failed week, "Regenerate Draft" (scope=full_draft), or
// "Regenerate Day" (scope=single_day, dayRef identifies which day
// within draftJson).
//
// total_weeks/completed_weeks/current_week track staged full_draft
// generation progress (null/unused for single_day runs). completed_weeks
// and current_week reflect the DRAFT's overall progress (how many of
// program_generation_weeks are status='completed', and which week this
// run is currently generating) — not just this one run's own share of
// the work — so a coach watching a resumed run still sees "7 of 10"
// rather than the resume's own count starting back at zero. The review
// page polls this row while status='running' for "Generating Week N of
// M" (see app/hq/programs/generate/[draftId]).
// ─────────────────────────────────────────────────────────────

export const programGenerationRuns = pgTable(
  "program_generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => programGenerationDrafts.id, { onDelete: "cascade" }),

    status: programGenerationRunStatusEnum("status").notNull().default("queued"),
    scope: programGenerationRunScopeEnum("scope").notNull().default("full_draft"),
    // Stable synthetic day id within draftJson (see contracts.ts) —
    // null for scope=full_draft.
    dayRef: text("day_ref"),

    totalWeeks: integer("total_weeks"),
    completedWeeks: integer("completed_weeks"),
    currentWeek: integer("current_week"),
    // Same progress-polling role as completedWeeks/currentWeek, one
    // level finer since the P0 day-level architecture change — see
    // program_generation_days below. Null for single_day-scope runs
    // (regenerate-day never had week-level granularity either).
    currentDay: integer("current_day"),
    completedDays: integer("completed_days"),

    stage: text("stage"),
    provider: text("provider"),
    model: text("model"),

    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_runs_draft_id").on(table.draftId),
    index("idx_program_generation_runs_status").on(table.status),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_days
//
// P0 architecture change (production draft
// 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a, "Maddie" — see docs on the
// incident this replaces): a single generateObject() call asking for an
// entire week (up to 7 days, up to 12 sections/day, up to 30
// prescriptions/section) proved too large and too slow for reliable
// serverless execution — confirmed in production at both a 45s and a
// (doubled) 90s per-call timeout, both exhausted without the call
// completing. This table is the durable, resumable unit of work for
// asking the model for exactly ONE training day at a time instead.
//
// One row per (draft, weekNumber, dayNumber), upserted — same "latest
// attempt only" rule as program_generation_weeks below, for the same
// reason (full attempt history lives in program_generation_runs'
// errorMessage instead). dayNumber is a 1-based index into
// shell.days (contracts.ts's ProgramShellDaySchema array), NOT
// dayOfWeek — shell.days is already the fixed weekly split every week
// must honor, so "day 1 of the split" is a stable identity across every
// week even though its dayOfWeek/label are shell-defined.
//
// day_json holds an unresolved ModelDayDraft (contracts.ts) — no
// exerciseId anywhere, same resolve-once-at-final-assembly rule as
// weeks. null when status='failed'.
//
// Resume reads this table to find the first (weekNumber, dayNumber) —
// in shell.days order, within the first week that isn't fully
// completed — with no row or a 'failed' row, and regenerates only that
// day onward. Once every day for a week is 'completed', staged-
// generation.ts assembles them into a ModelWeekDraft and upserts it
// into program_generation_weeks exactly as before this change — every
// downstream consumer of that table (final assembly, exercise
// resolution, validation, approval) is completely unaffected by this
// migration; only how a week's content gets produced changed, not how
// it's stored once complete.
//
// No RLS — matches every other program_generation_* table except
// quota_claims: server-only, never queried via PostgREST, only ever
// reached through requireCoachOrAdmin()-guarded Server Actions using
// the service-role connection (see this file's header comment).
// ─────────────────────────────────────────────────────────────

export const programGenerationDays = pgTable(
  "program_generation_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => programGenerationDrafts.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    dayNumber: integer("day_number").notNull(),

    status: programGenerationDayStatusEnum("status").notNull(),
    dayJson: jsonb("day_json"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    provider: text("provider"),
    model: text("model"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_days_draft_id").on(table.draftId),
    uniqueIndex("uq_program_generation_days_draft_week_day").on(
      table.draftId,
      table.weekNumber,
      table.dayNumber,
    ),
    // Mirrors drizzle/0035_program_generation_integrity_constraints.sql —
    // ranges match ProgramGenerationBriefSchema/ProgramShellSchema's own
    // validated bounds in contracts.ts, never a separately invented limit.
    check(
      "chk_program_generation_days_week_number",
      sql`${table.weekNumber} >= 1 AND ${table.weekNumber} <= 16`,
    ),
    check(
      "chk_program_generation_days_day_number",
      sql`${table.dayNumber} >= 1 AND ${table.dayNumber} <= 7`,
    ),
    check(
      "chk_program_generation_days_completed_has_json",
      sql`${table.status} <> 'completed' OR ${table.dayJson} IS NOT NULL`,
    ),
    check(
      "chk_program_generation_days_failed_has_no_json",
      sql`${table.status} <> 'failed' OR ${table.dayJson} IS NULL`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_weeks
//
// One row per (draft, weekNumber), upserted — a retry that regenerates
// a previously-failed week overwrites that week's row rather than
// appending a new one, so this table always holds exactly the LATEST
// outcome per week, never a full history of every attempt (that history
// lives in program_generation_runs' errorMessage per attempt instead).
//
// week_json holds an unresolved ModelWeekDraft (contracts.ts) — no
// exerciseId anywhere. Exercise resolution runs once, at final assembly
// (see lib/program-generator/actions.ts), not per week — so a week row
// never needs to be touched again once persisted, regardless of how
// many later weeks succeed or fail. null when status='failed'.
//
// A resume/retry queries this table for already-'completed' weeks,
// skips regenerating them, and continues from the first weekNumber
// (1..totalWeeks) with no row or a 'failed' row.
//
// Since the P0 architecture change above, a week row is written by
// staged-generation.ts's assembly step (once every day in
// program_generation_days for that week is 'completed'), not directly
// by a single generateProgramWeek() call — generateProgramWeek()/that
// call shape no longer exists in the staged path. The table's own
// shape, meaning, and every downstream reader are unchanged.
// ─────────────────────────────────────────────────────────────

export const programGenerationWeeks = pgTable(
  "program_generation_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => programGenerationDrafts.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),

    status: programGenerationWeekStatusEnum("status").notNull(),
    weekJson: jsonb("week_json"),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_weeks_draft_id").on(table.draftId),
    uniqueIndex("uq_program_generation_weeks_draft_week").on(table.draftId, table.weekNumber),
    // Mirrors drizzle/0035_program_generation_integrity_constraints.sql —
    // same week_number bound as program_generation_days, from
    // ProgramGenerationBriefSchema in contracts.ts.
    check(
      "chk_program_generation_weeks_week_number",
      sql`${table.weekNumber} >= 1 AND ${table.weekNumber} <= 16`,
    ),
    check(
      "chk_program_generation_weeks_completed_has_json",
      sql`${table.status} <> 'completed' OR ${table.weekJson} IS NOT NULL`,
    ),
    check(
      "chk_program_generation_weeks_failed_has_no_json",
      sql`${table.status} <> 'failed' OR ${table.weekJson} IS NULL`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_edit_events
//
// Append-only. Never updated or deleted — matches the enrollment_events/
// timeline_events convention already established in lib/db/schema.ts.
// ─────────────────────────────────────────────────────────────

export const programGenerationEditEvents = pgTable(
  "program_generation_edit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => programGenerationDrafts.id, { onDelete: "cascade" }),

    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    action: programGenerationEditActionEnum("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),

    // Optional before/after snapshots for the affected slice of draftJson —
    // not the whole draft, just the edited entity. Null when not captured
    // (e.g. discard has no before/after shape).
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_edit_events_draft_id").on(table.draftId),
    index("idx_program_generation_edit_events_created_at").on(table.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_validation_events
//
// One row per Kynovant Insights run against a draft. Append-only —
// draftJson.insightsJson always reflects the latest, but this table
// preserves the full history for the audit drawer (UX spec §12.2).
// ─────────────────────────────────────────────────────────────

export const programGenerationValidationEvents = pgTable(
  "program_generation_validation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => programGenerationDrafts.id, { onDelete: "cascade" }),

    status: programGenerationValidationStatusEnum("status").notNull(),
    blockerCount: integer("blocker_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),

    // Full GeneratedDraftInsights snapshot for this run.
    findingsJson: jsonb("findings_json").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_validation_events_draft_id").on(table.draftId),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — program_generation_quota_claims
//
// Per-coach AI generation rate-limit ledger. One row = one attempt that
// was actually about to invoke the model provider (generateProgramShell/
// generateProgramWeek/regenerateDayDraft) and was allowed to proceed.
// See lib/db/program-generation-service.ts's claimGenerationQuota() for
// the full design note.
//
// Deliberately a SEPARATE table from program_generation_runs rather than
// reusing that table's own rows as the quota source of truth:
// program_generation_runs is written unconditionally for bookkeeping/
// progress-tracking on code paths that do NOT always represent paid
// model spend (e.g. a resume whose shell and every week already
// completed — only finalization failed last time — makes zero provider
// calls; a candidate-exhaustion failure never reaches the model either).
// Keeping the quota ledger independent means the cost-control gate can
// sit at the exact narrow point where a paid call is about to be issued,
// without entangling it with — or risking regressing — the existing
// run-lifecycle/progress-tracking code that the review page and Overwatch
// dashboards already depend on.
//
// scope reuses programGenerationRunScopeEnum (no new enum type) — a
// claim is either behind a full_draft generation/resume or a single_day
// regenerate-day call, exactly mirroring program_generation_runs' own
// scope values.
//
// draftId is nullable and ON DELETE SET NULL: a claim still counts
// against the coach's quota even if its draft is later discarded/deleted
// — the ledger records that the model call happened, independent of
// what became of the draft it was for.
// ─────────────────────────────────────────────────────────────

export const programGenerationQuotaClaims = pgTable(
  "program_generation_quota_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => programGenerationDrafts.id, { onDelete: "set null" }),
    scope: programGenerationRunScopeEnum("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_program_generation_quota_claims_coach_created").on(table.coachId, table.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type ProgramGenerationDraft = typeof programGenerationDrafts.$inferSelect;
export type NewProgramGenerationDraft = typeof programGenerationDrafts.$inferInsert;
export type ProgramGenerationStatus = ProgramGenerationDraft["status"];

export type ProgramGenerationRun = typeof programGenerationRuns.$inferSelect;
export type NewProgramGenerationRun = typeof programGenerationRuns.$inferInsert;
export type ProgramGenerationRunStatus = ProgramGenerationRun["status"];
export type ProgramGenerationRunScope = ProgramGenerationRun["scope"];

export type ProgramGenerationDay = typeof programGenerationDays.$inferSelect;
export type NewProgramGenerationDay = typeof programGenerationDays.$inferInsert;
export type ProgramGenerationDayStatus = ProgramGenerationDay["status"];

export type ProgramGenerationWeek = typeof programGenerationWeeks.$inferSelect;
export type NewProgramGenerationWeek = typeof programGenerationWeeks.$inferInsert;
export type ProgramGenerationWeekStatus = ProgramGenerationWeek["status"];

export type ProgramGenerationEditEvent = typeof programGenerationEditEvents.$inferSelect;
export type NewProgramGenerationEditEvent = typeof programGenerationEditEvents.$inferInsert;
export type ProgramGenerationEditAction = ProgramGenerationEditEvent["action"];

export type ProgramGenerationValidationEvent =
  typeof programGenerationValidationEvents.$inferSelect;
export type NewProgramGenerationValidationEvent =
  typeof programGenerationValidationEvents.$inferInsert;
export type ProgramGenerationValidationStatus = ProgramGenerationValidationEvent["status"];

export type ProgramGenerationQuotaClaim = typeof programGenerationQuotaClaims.$inferSelect;
export type NewProgramGenerationQuotaClaim = typeof programGenerationQuotaClaims.$inferInsert;
