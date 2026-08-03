// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Application Pipeline Schema
//
// SERVER-ONLY — never import this file from a Client Component.
//
// Tables:
//   applications — one row per Kynovant coach-application attempt
//
// ARCHITECTURE CORRECTION (this revision): this table's public
// intake was previously wired to /apply (Jermaine's personal
// physique-coaching application) by mistake. It is now, exclusively,
// the backing store for /coach-apply — coaches applying to become
// Kynovant SaaS customers. /apply has been restored to its original,
// unrelated GAS-direct submission and never touches this table.
//
// Access model: admin-only. Ordinary coach accounts must never see
// this data — this is Kynovant's own prospect pipeline for acquiring
// *other* coaches, not something a coach using the platform to run
// their own business has any reason to access. Every page, server
// action, and query against this table sits behind requireAdmin()/
// requireAdminPage() (lib/auth/guards.ts), not just nav visibility.
//
// Status lifecycle (staff-driven, /admin/growth/applications):
//   new → qualified → demo_scheduled → demo_complete → accepted
//   any non-terminal status → declined (available at every stage)
//
// This table is the authoritative record of what a coach applicant
// submitted through the public form — not a general sales CRM. A
// design spec for a broader Growth CRM exists at
// docs/catalyst-os-growth-crm.md (pending review/approval, not yet
// built) — its §4.2 independently proposes the same field names used
// here (name/email/phone/businessStage/clientCount/context/
// referralSource), which is a strong signal this shape is correct,
// but its event-log tables, dedup-by-status-bucket rules, and
// growth_leads handoff are intentionally NOT implemented in this
// revision. See "Future Growth CRM linkage" below.
//
// The Google Sheet remains a secondary, best-effort mirror written
// by the API route after the Supabase insert/update succeeds — see
// app/api/applications/route.ts.
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUM
// ─────────────────────────────────────────────────────────────

export const applicationStatusEnum = pgEnum("application_status", [
  "new",
  "qualified",
  "demo_scheduled",
  "demo_complete",
  "accepted",
  "declined",
]);

// ─────────────────────────────────────────────────────────────
// TABLE — applications
//
// DUPLICATE SUBMISSION POLICY (enforced in lib/db/application-service.ts,
// not at the schema level — see submitApplication()):
//   - email is intentionally NOT unique at the database level. A
//     person whose prior application reached a terminal status
//     (accepted/declined) is a legitimate new applicant if they
//     apply again — that deserves its own row with its own
//     original answers, not a merge into the old one.
//   - A resubmission from the same normalizedEmail WHILE an existing
//     application is still non-terminal (new/qualified/demo_scheduled/
//     demo_complete) is treated as the same attempt: the existing row
//     is updated in place (answers refreshed, resubmissionCount++),
//     not duplicated. This is what actually prevents "submit twice
//     by accident" or repeated-click abuse from silently producing
//     unlimited rows for one person, while still letting genuine
//     re-applicants start fresh after a decision.
//   - normalizedEmail (lower+trim, same convention as users.normalizedEmail
//     in schema.ts) is what dedup lookups key off — email preserves
//     exactly what the applicant typed.
//
// reviewedBy tracks which Kynovant admin/staff member is working the
// application. Unlike every coach-scoped table elsewhere in this
// schema, this is not a multi-tenancy concern — the audience with
// requireAdmin() access is small by design, not "every coach."
//
// sheetSyncedAt is set only after the best-effort Google Sheets
// mirror succeeds — null means "not yet synced or last sync
// failed," visible to staff in the admin detail view so a silent
// Sheets outage is never truly silent.
//
// submitterIp backs the API route's DB-based rate limiting (see
// app/api/applications/route.ts) and doubles as an abuse-investigation
// field — nullable because IP is best-effort (may be absent behind
// some proxies) and never required for the record to be valid.
//
// FUTURE GROWTH CRM LINKAGE (not implemented — no growth_leads table
// exists as code on this branch; docs/catalyst-os-growth-crm.md §5.1
// specifies its intended shape but is an unapproved design spec, not
// shipped code):
//   When growth_leads exists, add a nullable growth_lead_id uuid
//   column here, referencing that table's PK with ON DELETE SET NULL.
//   Do NOT have the Growth CRM duplicate applicant identity or the
//   submitted answers — it should hold only CRM-specific state and
//   point back at this row. This table stays the immutable record of
//   the submission. Adding the FK now, before that schema exists,
//   would be a foreign key with nothing to reference — deferred
//   intentionally, not an oversight.
//
// businessStage/clientCount/context are NULLABLE — not a relaxation,
// a correctness requirement. drizzle/0016_applications_coach_fields.sql
// added these as new columns rather than renaming the original
// client-coaching columns (primary_goal/readiness/goals_details) into
// them, specifically because a fitness goal and a business-maturity
// answer are not the same fact wearing a different label — renaming
// would have made pre-correction rows display as if they contained
// real SaaS-application answers they never gave. A row's source
// column is the ground truth for which world it came from:
//   source = 'coach_apply' → these three should be populated (the
//     application service always sets them together, see
//     lib/db/application-service.ts:submitApplication).
//   any other source (e.g. the legacy 'apply_page') → these are
//     legitimately null. Not "missing data to backfill" — there is
//     no SaaS answer to recover, because the applicant was never
//     asked these questions. See legacyFields below for what that
//     applicant actually submitted instead.
//
// legacyFields (added by drizzle/0016_applications_coach_fields.sql,
// not by 0015): archival jsonb preserving every column that existed
// under the original (pre-correction) client-coaching-shaped table
// and has no coach-apply equivalent — fullName is not included here
// (it became `name` via a same-meaning rename, not an archive) but
// primaryGoal, readiness, goalsDetails, budgetRange, and referralName
// all are, for any row that predates this migration. Null for every
// row created after 0016, since nothing writes to it going forward.
// Displayed under "Archived Original Answers" on the admin detail
// page for any row where it's non-null — see
// app/admin/growth/applications/[id]/page.tsx.
//
// FK behavior:
//   reviewedBy → SET NULL: application record survives staff-account archival
// ─────────────────────────────────────────────────────────────

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: text("name").notNull(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    phone: text("phone"),

    // What the /coach-apply form actually asks — see
    // app/(site)/coach-apply/page.tsx for the exact option sets.
    // Nullable: see the "businessStage/clientCount/context are
    // NULLABLE" note above — null means "not a coach-apply row,"
    // not "data entry incomplete."
    businessStage: text("business_stage"),
    clientCount: text("client_count"),
    context: text("context"),
    referralSource: text("referral_source").notNull(),

    status: applicationStatusEnum("status").notNull().default("new"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNotes: text("review_notes"),

    source: text("source").notNull().default("coach_apply"),
    sheetSyncedAt: timestamp("sheet_synced_at", { withTimezone: true }),

    // Duplicate-submission handling (see policy note above).
    resubmissionCount: integer("resubmission_count").notNull().default(0),
    submitterIp: text("submitter_ip"),

    // Archive for columns dropped in 0016 with no coach-apply
    // equivalent. See "legacyFields" note above.
    legacyFields: jsonb("legacy_fields"),

    // Reserved for a future Growth CRM lead reference — intentionally
    // not a column yet. See "FUTURE GROWTH CRM LINKAGE" note above.

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_applications_status").on(table.status),
    index("idx_applications_normalized_email").on(table.normalizedEmail),
    index("idx_applications_created_at").on(table.createdAt),
    index("idx_applications_ip_created_at").on(table.submitterIp, table.createdAt),
  ],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationStatus = Application["status"];
