// ─────────────────────────────────────────────────────────────
// Kynovant — Coaching Application Pipeline Schema
//
// SERVER-ONLY — never import this file from a Client Component.
//
// Tables:
//   applications — one row per distinct "Apply for Coaching" attempt
//
// Status lifecycle (coach-driven, HQ Applications dashboard):
//   new → qualified → demo_scheduled → demo_complete → accepted
//   any non-terminal status → declined (available at every stage)
//
// This table is the authoritative record of what a coach submitted
// through the public application form — not a general sales CRM.
// It stores exactly what was submitted and where it is in the
// coach's own qualify/schedule/decide workflow. Anything broader
// (multi-channel lead sourcing, outbound sequences, deal stages
// beyond this one form) belongs in a future Growth CRM, not here —
// see the "Future Growth CRM linkage" note below.
//
// The Google Sheet remains a secondary, best-effort mirror written
// by the API route after the Supabase insert succeeds — see
// app/api/applications/route.ts.
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
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
// reviewedBy is nullable and unscoped today (solo-mode, matching
// the rest of HQ) — it records which coach is working the
// application, not an ownership boundary. See
// docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md
// for the multi-tenant plan this will need to join into later.
//
// sheetSyncedAt is set only after the best-effort Google Sheets
// mirror succeeds — null means "not yet synced or last sync
// failed," visible to the coach in the HQ detail view so a silent
// Sheets outage is never truly silent.
//
// submitterIp backs the API route's DB-based rate limiting (see
// app/api/applications/route.ts) and doubles as an abuse-investigation
// field — nullable because IP is best-effort (may be absent behind
// some proxies) and never required for the record to be valid.
//
// FUTURE GROWTH CRM LINKAGE (not implemented — no Growth CRM schema
// exists on this branch as of this migration):
//   When a Growth CRM lead model exists, add a nullable
//   growth_lead_id uuid column here, referencing that table's PK
//   with ON DELETE SET NULL. Do NOT have the Growth CRM duplicate
//   applicant identity (name/email/phone) or the submitted answers —
//   it should hold only CRM-specific state (deal stage, outbound
//   touches, source attribution beyond this form) and point back at
//   this row for "what they actually told us when they applied."
//   This table stays the immutable record of the submission; the
//   Growth CRM lead is free to represent the same person across
//   multiple touchpoints (this application, a future referral, a
//   newsletter signup) without this table needing to know about any
//   of that. Adding the FK now, before that schema exists, would be
//   a foreign key with nothing to reference — deferred intentionally,
//   not an oversight.
//
// FK behavior:
//   reviewedBy → SET NULL: application record survives coach archival
// ─────────────────────────────────────────────────────────────

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    phone: text("phone"),

    primaryGoal: text("primary_goal").notNull(),
    readiness: text("readiness").notNull(),
    budgetRange: text("budget_range").notNull(),
    goalsDetails: text("goals_details"),
    referralSource: text("referral_source").notNull(),
    referralName: text("referral_name"),

    status: applicationStatusEnum("status").notNull().default("new"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNotes: text("review_notes"),

    source: text("source").notNull().default("apply_page"),
    sheetSyncedAt: timestamp("sheet_synced_at", { withTimezone: true }),

    // Duplicate-submission handling (see policy note above).
    resubmissionCount: integer("resubmission_count").notNull().default(0),
    submitterIp: text("submitter_ip"),

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
