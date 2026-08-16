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
// ADR-016.
//
// Product boundary this table exists to enforce (do not blur it):
//   - Ordinary calorie/protein/carb/fat targets (client_nutrition_targets,
//     schema-nutrition.ts) require NO credential. Every coach can use
//     that system today, unaffected by anything in this file.
//   - A future RD/RDN-gated feature (not built yet) will require a row
//     here with status = 'approved' and an unexpired expirationDate.
//
// One row per coach — a coach's relationship to their own credential
// is 1:1 (uq_coach_credentials_coach_id below). Resubmission (e.g.
// after rejection, or renewing an expired credential) updates this
// same row in place and increments resubmissionCount, mirroring
// schema-applications.ts's resubmission convention — NOT
// schema-nutrition.ts's append-only-history convention. A credential
// is "is this specific coach currently RD/RDN-verified," not a log of
// coaching decisions worth preserving in full; the smallest durable
// model for that question is one authoritative row per coach, not a
// version history. reviewedBy/reviewedAt/reviewNotes reflect the most
// recent review decision only.
//
// Status lifecycle — deliberately 3 values, not 4:
//   pending  → coach has submitted, awaiting admin review
//   approved → admin verified the credential
//   rejected → admin declined; coach may resubmit (pending again)
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

// ─────────────────────────────────────────────────────────────
// TABLE — coach_credentials
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

    // ── Most recent review decision ───────────────────────────
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNotes: text("review_notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One credential record per coach — see header comment.
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
// INFERRED TYPES
// ─────────────────────────────────────────────────────────────

export type CoachCredential = typeof coachCredentials.$inferSelect;
export type NewCoachCredential = typeof coachCredentials.$inferInsert;
export type CoachCredentialType =
  (typeof coachCredentialTypeEnum.enumValues)[number];
export type CoachCredentialStatus =
  (typeof coachCredentialStatusEnum.enumValues)[number];
