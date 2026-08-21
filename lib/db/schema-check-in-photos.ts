// ─────────────────────────────────────────────────────────────
// Catalyst OS — Check-In Progress Photos Schema
//
// SERVER-ONLY — never import from a Client Component.
//
// One row per uploaded photo. Photos belong to a specific check-in
// OCCURRENCE (weekly_check_ins.id — a single scheduled_date), never
// merely to a client/week/enrollment — a Wednesday occurrence and a
// Sunday occurrence in the same week have entirely separate photo
// sets by construction, since each has its own weekly_check_ins row.
//
// Multiple photos per category are explicitly allowed (a posing shot
// alongside a plain front shot, an injury/reference photo, etc.) —
// there is no uniqueness constraint on (checkInId, category).
//
// Which categories are actually REQUIRED for a given occurrence is
// NOT decided here — see schema-check-in.ts's clientCheckInSchedule
// (photoRequirement + photoRequireFront/Side/Back) and
// check-in-schedule-service.ts's getPhotoPolicyAtDate. This table is
// purely "what was uploaded," independent of policy.
//
// Storage: storagePath is a key within the private "check-in-photos"
// Supabase Storage bucket (see scripts/setup-check-in-photos-bucket.ts).
// Never stored or exposed as a public URL — always a short-lived
// signed URL generated server-side after authorization, exactly like
// document-service.ts / coach-credential-service.ts.
//
// Deletion: soft-delete only (deletedAt). A client/coach removing a
// photo during the editable window (draft/submitted — see
// check-in-photo-service.ts) sets deletedAt rather than hard-deleting
// the row or the Storage object. This preserves an audit trail and
// avoids a synchronous Storage-delete failure mode; the underlying
// Storage object becoming a permanent orphan is the SAME accepted
// tradeoff document-service.ts's deleteDocument already makes (no
// Storage cleanup on delete there either) — a future background sweep
// of deletedAt-not-null rows is the natural place to reclaim Storage,
// not built here (see check-in-photo-service.ts's header comment).
//
// FK behavior:
//   checkInId → CASCADE: a photo has no meaning without its
//     occurrence. (weekly_check_ins rows are never hard-deleted by any
//     existing code path today, so this is a safety net, not an
//     active behavior.)
//   clientId  → RESTRICT: denormalized alongside checkInId so
//     tenant-scoped queries/auth checks (Phase 14) don't require a
//     join through weekly_check_ins for the common case — same
//     denormalization schema-documents.ts uses for
//     clientDocumentAssignments.clientId.
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
import { weeklyCheckIns } from "./schema-check-in";

export const checkInPhotoCategoryEnum = pgEnum("check_in_photo_category", [
  "front",
  "side",
  "back",
  "other",
]);

export const checkInPhotos = pgTable(
  "check_in_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    checkInId: uuid("check_in_id")
      .notNull()
      .references(() => weeklyCheckIns.id, { onDelete: "cascade" }),

    // Denormalized from weeklyCheckIns.clientId — see FK comment above.
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    category: checkInPhotoCategoryEnum("category").notNull(),

    // Key within the private "check-in-photos" bucket. Format:
    // {clientId}/{checkInId}/{randomUUID}-{sanitizedFilename} — see
    // check-in-photo-service.ts's uploadCheckInPhoto. Never exposed
    // directly; always wrapped in a signed URL.
    storagePath: text("storage_path").notNull(),

    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),

    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // NULL = active. Set = soft-deleted (see table comment above).
    // Every read path filters deletedAt IS NULL.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_check_in_photos_check_in_id").on(table.checkInId),
    index("idx_check_in_photos_client_id").on(table.clientId),
  ],
);

export type CheckInPhotoRow = typeof checkInPhotos.$inferSelect;
export type NewCheckInPhoto = typeof checkInPhotos.$inferInsert;
export type CheckInPhotoCategory = (typeof checkInPhotoCategoryEnum.enumValues)[number];
