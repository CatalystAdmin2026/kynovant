// ─────────────────────────────────────────────────────────────
// Catalyst OS — Document Schema (ADR-012)
//
// SERVER-ONLY — never import from a Client Component.
//
// Two tables:
//   documents                   — source documents owned by the coaching org
//   client_document_assignments — assignment lifecycle per client
//
// Ownership model:
//   A document belongs to the coach/org that created it.
//   Clients never own the source document.
//   Client access is always derived from an active assignment.
//   Revoking an assignment removes access; the source document is unaffected.
//
// Storage:
//   storageKey is the path within the "coaching-documents" Supabase
//   Storage bucket. Never stored as a public URL — clients receive
//   short-lived signed URLs generated server-side after auth check.
//
// Versioning:
//   A `version` integer is incremented when a document is updated in-place.
//   `documentVersion` on assignments captures the version at assignment time,
//   enabling future version-pinning or latest-version-follow behavior.
//   No complex version-management UI is built here.
//
// Deletion policy:
//   - Zero assignment history → hard delete permitted
//   - Any historical assignment (even revoked) → archive only; hard delete blocked
//   - Archiving does not revoke active assignments (handled separately)
//   Enforced in the service layer, not by DB constraints.
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export const documentCategoryEnum = pgEnum("document_category", [
  "meal_plan",
  "training_guide",
  "technique_reference",
  "posing_material",
  "progress_report",
  "educational",
  "agreement",
  "other",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "draft",    // created; not yet shared with any client
  "active",   // available for assignment
  "archived", // no longer assignable; historical assignments preserved
]);

// ─────────────────────────────────────────────────────────────
// TABLE 1 — documents
//
// Source document record owned by the coaching organization.
// One row per distinct document (not per client).
//
// storageKey: path within "coaching-documents" Supabase Storage bucket.
//   Format: {coachId}/{documentId}/{sanitized-filename}
//   Never exposed directly to clients — always wrapped in a signed URL.
//
// FK behavior:
//   createdByCoachId → SET NULL: document survives coach account changes.
//     The document belongs to the org; the creator is attribution only.
// ─────────────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdByCoachId: uuid("created_by_coach_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    category: documentCategoryEnum("category").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    version: integer("version").notNull().default(1),
    status: documentStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_documents_coach_id").on(table.createdByCoachId),
    index("idx_documents_status").on(table.status),
    index("idx_documents_category").on(table.category),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 2 — client_document_assignments
//
// One row per (document, client) assignment event.
// Multiple historical rows are allowed for the same document+client
// pair (assign → revoke → re-assign), but only one may be active
// at a time. The partial unique index below enforces this.
//
// Lifecycle:
//   assign      → insert row (revokedAt IS NULL)
//   revoke      → set revokedAt + revokedByCoachId
//   re-assign   → new row (previous row keeps revokedAt)
//   view        → stamp viewedAt on first read (idempotent)
//   acknowledge → stamp acknowledgedAt (idempotent)
//
// documentVersion: snapshot of documents.version at assignment time.
//   Supports future version-pinning: the UI can detect when
//   documents.version > documentVersion and offer "update assignment."
//
// FK behavior:
//   documentId       → RESTRICT: cannot delete document with assignments.
//     Use archiveDocument() instead.
//   clientId         → RESTRICT: assignment record tied to client identity.
//   assignedByCoachId → SET NULL: record preserved if coach leaves.
//   revokedByCoachId  → SET NULL: record preserved if coach leaves.
// ─────────────────────────────────────────────────────────────

export const clientDocumentAssignments = pgTable(
  "client_document_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedByCoachId: uuid("assigned_by_coach_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    documentVersion: integer("document_version").notNull(),
    required: boolean("required").notNull().default(false),
    dueAt: timestamp("due_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByCoachId: uuid("revoked_by_coach_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Only one active (non-revoked) assignment per document+client pair.
    // Multiple revoked rows are allowed for the same pair (assign → revoke → re-assign).
    // Postgres treats each NULL as distinct in a regular unique index, so this
    // partial index is the correct mechanism.
    uniqueIndex("uq_active_document_assignment")
      .on(table.documentId, table.clientId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("idx_doc_assignments_client_id").on(table.clientId),
    index("idx_doc_assignments_document_id").on(table.documentId),
    index("idx_doc_assignments_active").on(table.clientId, table.revokedAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPESCRIPT TYPES
// ─────────────────────────────────────────────────────────────

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type ClientDocumentAssignment =
  typeof clientDocumentAssignments.$inferSelect;
export type NewClientDocumentAssignment =
  typeof clientDocumentAssignments.$inferInsert;

// Enum value types
export type DocumentCategory =
  (typeof documentCategoryEnum.enumValues)[number];
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];
