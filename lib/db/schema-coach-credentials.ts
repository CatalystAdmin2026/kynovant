// ─────────────────────────────────────────────────────────────
// Kynovant — Coach RD/RDN Credential Schema
//
// SERVER-ONLY — never import from a Client Component.
//
// Purpose: establish whether a coach is verified as a Registered
// Dietitian / Registered Dietitian Nutritionist, ahead of any
// RD/RDN-restricted feature (e.g. a future AI meal-plan generator).
// This table and its gate (lib/auth/rd-credential.ts) are built and
// proven BEFORE that feature exists — see docs/ARCHITECTURE_DECISIONS.md
// ADR-015.
//
// Product boundary this table exists to enforce (do not blur it):
//   - Ordinary calorie/protein/carb/fat targets (client_nutrition_targets,
//     schema-nutrition.ts) require NO credential. Every coach can use
//     that system today, unaffected by anything in this file.
//   - A future RD/RDN-gated feature (not built yet) will require a row
//     here with status = 'approved' and an unexpired expirationDate.
//
// TWO TABLES, DELIBERATELY SPLIT (see ADR-015 for the full rationale):
//
//   coachCredentials — CURRENT STATE, one row per coach
//     (uq_coach_credentials_coach_id). A coach's relationship to their
//     own credential is 1:1 — this is what isVerifiedRd() reads, and
//     it needs exactly one unambiguous row to answer "is this coach
//     verified right now" in a single indexed lookup. Resubmission
//     (after rejection, or renewing an expired credential) updates
//     this row in place and increments resubmissionCount.
//     reviewedBy/reviewedAt/reviewNotes reflect the MOST RECENT review
//     decision only — older decisions are not readable from this row
//     after a resubmission overwrites them.
//
//   coachCredentialReviews — APPEND-ONLY EVENT HISTORY
//     Every submission and every review decision is logged here as an
//     immutable event BEFORE coachCredentials is upserted, specifically
//     so a resubmission's overwrite of the current row does not destroy
//     the evidence of what was reviewed, by whom, and why. This is
//     the fix for a real gap: an earlier version of this schema had
//     only the current-state row, which meant every rejection's
//     reviewer/notes were provably unrecoverable the moment a coach
//     resubmitted (proven by this codebase's own test suite asserting
//     reviewedBy/reviewedAt/reviewNotes become null on resubmission).
//     For a licensure-adjacent compliance record, that is not
//     acceptable — this codebase's own established convention for
//     compliance-sensitive history (see ADR-014's "append-only:
//     previous targets are never overwritten" principle for
//     client_nutrition_targets) applies here too. The fix keeps
//     coachCredentials as a fast, unambiguous current-state row (no
//     change to the gate, no change to lookup performance) and adds
//     this table purely for history — never read by the gate, never
//     read by anything performance-sensitive.
//
// Status lifecycle — deliberately 3 values, not 4:
//   pending  → coach has submitted, awaiting review
//   approved → verified (by manual review today; see automation-
//              readiness columns below for how this generalizes)
//   rejected → declined; coach may resubmit (pending again)
//
// "Expired" is intentionally NOT a stored status. Storing it would
// require a background job to transition approved -> expired at the
// right moment, and the status would silently drift stale (still
// reading "approved" in the DB well past expirationDate) between job
// runs — a real correctness risk for a security gate. Instead,
// expiration is a derived condition every reader (including the gate
// itself) computes the same way: status = 'approved' AND
// expirationDate >= current_date. See lib/auth/rd-credential.ts. This
// can never drift, because there is nothing to keep in sync.
//
// AUTOMATION-READINESS (see ADR-015, coach-credential-verifier.ts):
// The authorization boundary (isVerifiedRd) reads ONLY status +
// expirationDate, today and after automation lands — it is
// deterministic and never reads verificationMethod, an LLM confidence
// score, or anything automation-shaped. The columns below exist so
// that WHO/WHAT most recently established the current status is
// knowable, without requiring a schema change when a real verifier is
// integrated:
//   verificationMethod      — how the current status was set.
//                              'manual_review' for every row today.
//   lastVerifiedAt           — distinct from reviewedAt: "positively
//                              confirmed," not just "an admin looked."
//   manualReviewRequired     — the exception-queue flag. Always true
//                              today (no automated path exists to set
//                              it false). This is the column a future
//                              admin/K-OS exception queue filters on.
//   nextReverificationAt     — unused today; present so periodic
//                              reverification can be scheduled later
//                              without a migration.
// Deliberately NOT stored on this row: verificationSource,
// externalReference, reasonCode, raw provider payloads — those are
// per-EVENT properties of coachCredentialReviews, not properties of
// "the coach's current state." Keeping them off this row keeps every
// resubmission/review write here small and keeps this table exactly
// what the gate needs, nothing more.
//
// Proof document storage mirrors schema-documents.ts exactly: a
// storage key into a PRIVATE Supabase Storage bucket
// ("coach-credentials"), never a public URL. Clients (in the generic
// sense — here, the coach's own browser) receive only short-lived
// signed URLs, generated server-side after an ownership/authorization
// check. See lib/db/coach-credential-service.ts.
// ─────────────────────────────────────────────────────────────

import "server-only";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

// Only the two credentials that ever unlock the future RD/RDN-gated
// feature. Not a generic "coach specialization" list — coachProfiles.
// specializations (schema.ts) already covers free-text, unverified
// self-reported specialties; this table is deliberately narrower and
// verified.
export const coachCredentialTypeEnum = pgEnum("coach_credential_type", [
  "rd",  // Registered Dietitian
  "rdn", // Registered Dietitian Nutritionist
]);

export const coachCredentialStatusEnum = pgEnum("coach_credential_status", [
  "pending",
  "approved",
  "rejected",
]);

// Who/what performed a coachCredentialReviews event. 'human' for
// every event in Phase 1 — see coach-credential-verifier.ts for the
// future interface an 'automated' event would come from.
export const coachCredentialReviewActorTypeEnum = pgEnum(
  "coach_credential_review_actor_type",
  ["human", "automated"],
);

// ─────────────────────────────────────────────────────────────
// TABLE — coach_credentials (current state)
//
// FK behavior:
//   coachId    → RESTRICT : a coach's credential record (including its
//     review history) is compliance-adjacent and must survive
//     independently of any future coach-account lifecycle change —
//     same reasoning as nutrition_targets.clientId.
//   reviewedBy → SET NULL : audit reference only, not load-bearing —
//     same reasoning as nutrition_targets.archivedBy.
// ─────────────────────────────────────────────────────────────

export const coachCredentials = pgTable(
  "coach_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // ── Submitted credential details ──────────────────────────
    credentialType: coachCredentialTypeEnum("credential_type").notNull(),
    licenseNumber: text("license_number").notNull(),
    // Free text, not an enum: issuing jurisdictions include US states,
    // territories, and non-US registration bodies. The app does not
    // validate or interpret this value — see the product-boundary note
    // in lib/auth/rd-credential.ts.
    issuingState: text("issuing_state").notNull(),
    expirationDate: date("expiration_date").notNull(),

    // ── Proof document (private Storage; see lib/db/coach-credential-service.ts) ──
    proofDocumentStorageKey: text("proof_document_storage_key").notNull(),
    proofDocumentFilename: text("proof_document_filename").notNull(),
    proofDocumentMimeType: text("proof_document_mime_type").notNull(),

    // ── Lifecycle ──────────────────────────────────────────────
    status: coachCredentialStatusEnum("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Incremented on every resubmission after a rejection (or when
    // renewing after expiration). Mirrors applications.resubmissionCount.
    resubmissionCount: integer("resubmission_count").notNull().default(0),

    // ── Most recent review decision (history in coachCredentialReviews) ──
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNotes: text("review_notes"),

    // ── Automation-readiness — see this file's header ──────────
    verificationMethod: text("verification_method"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    manualReviewRequired: boolean("manual_review_required").notNull().default(true),
    nextReverificationAt: date("next_reverification_at"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One CURRENT credential record per coach — see header comment.
    uniqueIndex("uq_coach_credentials_coach_id").on(table.coachId),

    index("idx_coach_credentials_status").on(table.status),
    index("idx_coach_credentials_expiration").on(table.expirationDate),

    check(
      "chk_coach_credentials_license_number_not_blank",
      sql`length(trim(${table.licenseNumber})) > 0`,
    ),
    check(
      "chk_coach_credentials_issuing_state_not_blank",
      sql`length(trim(${table.issuingState})) > 0`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — coach_credential_reviews (append-only event history)
//
// See this file's header for why this table exists. Never read by
// isVerifiedRd() or any authorization path — purely an audit trail
// for admin/future-K-OS exception review and compliance.
//
// FK behavior: credentialId/coachId → RESTRICT, same reasoning as
// coachCredentials.coachId — a review event is compliance-adjacent
// evidence and must not be deletable by a cascading account change.
// performedBy → SET NULL, audit reference only (mirrors reviewedBy).
// ─────────────────────────────────────────────────────────────

export const coachCredentialReviews = pgTable(
  "coach_credential_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    credentialId: uuid("credential_id")
      .notNull()
      .references(() => coachCredentials.id, { onDelete: "restrict" }),
    // Denormalized alongside credentialId (not just derivable via a
    // join) so this table's own RLS owner-select policy can filter
    // directly on coach_id, matching coachCredentials' policy shape,
    // and so a coach's full review history is queryable without a
    // join even if their current coachCredentials row is ever
    // replaced.
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // 'submitted' | 'approved' | 'rejected' — see the CHECK constraint
    // in the migration. Text, not reusing coachCredentialStatusEnum:
    // 'submitted' has no equivalent in that enum ('pending' is a
    // status, not an action), and a text action column can grow to
    // accommodate future automated-verification outcomes
    // (coach-credential-verifier.ts) without a migration.
    action: text("action").notNull(),

    // How/where this event's result was established. Both nullable —
    // a 'submitted' event has neither; a manual 'approved'/'rejected'
    // event sets verificationMethod ('manual_review') but not
    // verificationSource (there is no external source consulted
    // today). Never a raw provider response — see
    // coach-credential-verifier.ts for what a future automated event
    // may store here.
    verificationMethod: text("verification_method"),
    verificationSource: text("verification_source"),
    externalReference: text("external_reference"),
    reasonCode: text("reason_code"),
    notes: text("notes"),

    // Null for a fully automated event (no human in the loop for that
    // specific decision) — never null for 'submitted' (the submitting
    // coach) or a manual review (the reviewing admin).
    performedBy: uuid("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    performedByType: coachCredentialReviewActorTypeEnum("performed_by_type")
      .notNull()
      .default("human"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_coach_credential_reviews_credential_id").on(table.credentialId),
    index("idx_coach_credential_reviews_coach_id").on(table.coachId),

    check(
      "chk_coach_credential_reviews_action_known",
      sql`${table.action} in ('submitted', 'approved', 'rejected')`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPES
// ─────────────────────────────────────────────────────────────

export type CoachCredential = typeof coachCredentials.$inferSelect;
export type NewCoachCredential = typeof coachCredentials.$inferInsert;
export type CoachCredentialType =
  (typeof coachCredentialTypeEnum.enumValues)[number];
export type CoachCredentialStatus =
  (typeof coachCredentialStatusEnum.enumValues)[number];

export type CoachCredentialReview = typeof coachCredentialReviews.$inferSelect;
export type NewCoachCredentialReview = typeof coachCredentialReviews.$inferInsert;
export type CoachCredentialReviewActorType =
  (typeof coachCredentialReviewActorTypeEnum.enumValues)[number];
export type CoachCredentialReviewAction = "submitted" | "approved" | "rejected";
