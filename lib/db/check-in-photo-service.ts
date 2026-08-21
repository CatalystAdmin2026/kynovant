// ─────────────────────────────────────────────────────────────
// Catalyst OS — Check-In Progress Photo Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Owns upload/validation/storage/signed-URL/deletion for progress
// photos attached to a specific check-in OCCURRENCE
// (weekly_check_ins.id). Follows the SAME private-Storage +
// signed-URL pattern as document-service.ts and
// coach-credential-service.ts, but — matching this codebase's
// established convention of each storage domain owning its own copy
// of upload/validation/signing rather than sharing an abstraction
// layer — does not import from either of those files.
//
// Authorization contract:
//   Every function that touches a specific check-in or photo takes
//   the CALLER'S OWN id (clientId for Portal callers, an already
//   coach-ownership-verified checkInId for HQ callers) and re-derives
//   the occurrence's true owner from the database before doing
//   anything — never trusts a client-supplied clientId/checkInId pair
//   at face value. See each function's own comment for its exact
//   guarantee (Phase 14).
//
// Editable window: uploads and deletes are permitted only while the
// occurrence's status is 'draft' or 'submitted' — the SAME window
// editSubmittedCheckIn (check-in-service.ts) already uses for text
// fields, not full post-submission immutability. Once a coach moves
// the occurrence to 'in_review' or 'reviewed', photos are frozen
// exactly like every other field on the check-in.
//
// AI / privacy boundary: this file performs storage and viewing ONLY.
// Nothing here sends photo bytes or storage paths to an AI/vision
// provider, Overwatch, program generation, or any cross-coach
// surface. A future OPTIONAL AI physique-analysis feature (if ever
// explicitly built and consented to) would be a NEW, separate,
// explicitly-gated code path — not an extension of these functions.
//
// Requirement enforcement lives ONE layer up (see
// isPhotoRequirementSatisfied below) — this file resolves nothing
// about WHICH views are required for a given occurrence; that is
// check-in-schedule-service.ts's getPhotoPolicyAtDate, resolved
// historically at the occurrence's own scheduledDate and passed in by
// the caller (check-in-service.ts's submitCheckIn). This keeps "what
// was uploaded" (this file) cleanly separate from "what policy was in
// force" (schedule service) — the same separation the data model
// itself makes between check_in_photos and
// client_check_in_schedule.photo_requirement.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { weeklyCheckIns, type WeeklyCheckInStatus } from "./schema-check-in";
import type { PhotoViewName } from "./schema-check-in";
import {
  checkInPhotos,
  checkInPhotoCategoryEnum,
  type CheckInPhotoCategory,
} from "./schema-check-in-photos";

// Private Supabase Storage bucket for check-in progress photos.
// Must be created as a PRIVATE bucket — see
// scripts/setup-check-in-photos-bucket.ts. NOT the same bucket as
// coaching-documents/coach-credentials — progress photos are a
// distinct sensitivity class (client body photos), kept in their own
// namespace so a bucket-level policy mistake on one domain can't leak
// into another.
const CHECK_IN_PHOTOS_BUCKET = "check-in-photos";

// Default signed URL TTL. 1 hour — same as document-service.ts /
// coach-credential-service.ts.
const SIGNED_URL_TTL_SECONDS = 3600;

// Photos submitted from a phone camera can run larger than a typical
// coaching document; capped well under Supabase Storage limits.
export const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

// Images only — no PDF, no SVG (script/security surface — explicitly
// excluded even though it never appears in the allow-list below
// anyway).
export const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// The editable window — see file header. Exported so Server Actions
// can render an accurate client-side error without duplicating this
// list.
const EDITABLE_STATUSES: WeeklyCheckInStatus[] = ["draft", "submitted"];

// ─────────────────────────────────────────────────────────────
// UPLOAD VALIDATION — pure, no I/O. Mirrors
// document-service.ts's validateDocumentUpload /
// coach-credential-service.ts's validateCredentialSubmission shape.
// ─────────────────────────────────────────────────────────────

export interface PhotoUploadInput {
  category: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validatePhotoUpload(input: PhotoUploadInput): ValidationResult {
  if (!checkInPhotoCategoryEnum.enumValues.includes(input.category as CheckInPhotoCategory)) {
    return { ok: false, error: `Invalid photo category: ${input.category}` };
  }
  if (!input.filename.trim()) {
    return { ok: false, error: "A file is required." };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (input.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
    return { ok: false, error: `Photo exceeds the ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB limit.` };
  }
  if (!ALLOWED_PHOTO_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, error: "Photo must be a PNG, JPEG, or WebP image." };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// FILE SIGNATURE VALIDATION — pure, no I/O. Same technique as
// coach-credential-service.ts's validateFileSignature (own copy per
// this codebase's established per-domain-storage-service
// convention): checks real file bytes against each allowed type's
// magic number, so a mislabeled upload (arbitrary bytes claiming
// "image/png") is rejected before it ever reaches Storage, not just
// whatever Content-Type the browser happened to report.
// ─────────────────────────────────────────────────────────────

function hasBytesAt(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

const FILE_SIGNATURE_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  // PNG 8-byte magic number
  "image/png": (b) => hasBytesAt(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // JPEG SOI marker
  "image/jpeg": (b) => hasBytesAt(b, 0, [0xff, 0xd8, 0xff]),
  // RIFF....WEBP
  "image/webp": (b) => hasBytesAt(b, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(b, 8, [0x57, 0x45, 0x42, 0x50]),
};

// Call AFTER validatePhotoUpload (so an already-rejected mimeType
// never reaches this), BEFORE uploadCheckInPhotoToStorage (so a
// mismatched file never reaches Storage).
export function validatePhotoFileSignature(bytes: Uint8Array, claimedMimeType: string): ValidationResult {
  const matches = FILE_SIGNATURE_CHECKS[claimedMimeType];
  if (!matches) {
    return { ok: false, error: "Unrecognized photo type." };
  }
  if (!matches(bytes)) {
    return {
      ok: false,
      error: "The uploaded file does not match its declared type. Please re-upload the original photo.",
    };
  }
  return { ok: true };
}

// Strips anything that isn't alphanumeric/dot/dash/underscore and
// collapses repeats, exactly like document-service.ts's
// sanitizeFilename — kept as this domain's own copy per the
// established per-service convention (coach-credential-service.ts
// does the same rather than importing document-service.ts's).
function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return sanitized.length > 0 ? sanitized : "photo";
}

// originalFilename (unlike storagePath) is stored for DISPLAY only —
// deliberately NOT run through sanitizeFilename's aggressive
// dash-collapsing, so a coach/client still sees a recognizable name.
// It still needs ONE narrow defense: a NUL byte (0x00) in the raw
// filename is rejected by Postgres's UTF8 encoding at INSERT time
// (found via independent review attack-testing — a crafted upload
// bypassing the browser's own file picker could supply one), which
// would otherwise throw an uncaught error out of this function after
// the Storage object has already been written, orphaning it. Strips
// NUL and other C0 control characters only — never touches slashes,
// dots, or anything a real filename legitimately contains.
function stripControlChars(filename: string): string {
  return filename.replace(/[\x00-\x1f]/g, "");
}

// ─────────────────────────────────────────────────────────────
// OCCURRENCE LOOKUP — the single place every mutating/reading
// function below re-derives the true owner and edit-window state of
// a check-in occurrence. Never trust a caller-supplied clientId
// alongside a checkInId without this.
// ─────────────────────────────────────────────────────────────

interface OccurrenceAuth {
  id: string;
  clientId: string;
  status: WeeklyCheckInStatus;
}

async function getOccurrenceForAuth(checkInId: string): Promise<OccurrenceAuth | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: weeklyCheckIns.id, clientId: weeklyCheckIns.clientId, status: weeklyCheckIns.status })
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.id, checkInId))
    .limit(1);
  return row ?? null;
}

function isEditable(status: WeeklyCheckInStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

// ─────────────────────────────────────────────────────────────
// CLIENT — UPLOAD
//
// clientId MUST be the caller's own verified session id (Portal:
// requireClientUser().dbUser.id). Rejects if checkInId doesn't belong
// to that client, or the occurrence is outside the editable window —
// a client cannot forge photo uploads into another client's
// occurrence, and cannot attach a photo to an already-in_review or
// reviewed check-in.
// ─────────────────────────────────────────────────────────────

export interface PhotoUploadResult {
  ok: true;
  photo: { id: string; category: CheckInPhotoCategory; originalFilename: string; uploadedAt: Date };
}
export type UploadResult = PhotoUploadResult | { ok: false; error: string };

export async function uploadCheckInPhoto(
  clientId: string,
  checkInId: string,
  category: string,
  file: { bytes: Uint8Array; filename: string; mimeType: string; sizeBytes: number },
): Promise<UploadResult> {
  const validation = validatePhotoUpload({ category, filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
  if (!validation.ok) return validation;

  const signature = validatePhotoFileSignature(file.bytes, file.mimeType);
  if (!signature.ok) return signature;

  const occurrence = await getOccurrenceForAuth(checkInId);
  if (!occurrence || occurrence.clientId !== clientId) {
    return { ok: false, error: "Check-in not found." };
  }
  if (!isEditable(occurrence.status)) {
    return { ok: false, error: "This check-in is no longer editable." };
  }

  const storagePath = `${clientId}/${checkInId}/${randomUUID()}-${sanitizeFilename(file.filename)}`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(CHECK_IN_PHOTOS_BUCKET)
    .upload(storagePath, file.bytes, { contentType: file.mimeType, upsert: false });

  if (uploadError) {
    return { ok: false, error: "Failed to upload photo. Please try again." };
  }

  const db = getDb();
  const [inserted] = await db
    .insert(checkInPhotos)
    .values({
      checkInId,
      clientId,
      category: category as CheckInPhotoCategory,
      storagePath,
      originalFilename: stripControlChars(file.filename),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    })
    .returning({ id: checkInPhotos.id, category: checkInPhotos.category, originalFilename: checkInPhotos.originalFilename, uploadedAt: checkInPhotos.uploadedAt });

  // DB insert failing after a successful Storage upload orphans the
  // Storage object — the same accepted tradeoff document-service.ts's
  // createDocumentWithUpload and coach-credential-service.ts's
  // uploadCredentialProof already make (no two-phase commit between
  // Storage and Postgres exists anywhere in this codebase).
  if (!inserted) {
    return { ok: false, error: "Failed to save photo record. Please try again." };
  }

  return { ok: true, photo: inserted };
}

// ─────────────────────────────────────────────────────────────
// CLIENT — LIST (own occurrence only) — used to restore a reopened
// draft's previously uploaded photos and to render the Portal's own
// thumbnails after upload.
// ─────────────────────────────────────────────────────────────

export interface CheckInPhotoView {
  id: string;
  category: CheckInPhotoCategory;
  originalFilename: string;
  uploadedAt: Date;
  signedUrl: string;
}

export async function listCheckInPhotosForClient(
  clientId: string,
  checkInId: string,
): Promise<CheckInPhotoView[] | null> {
  const occurrence = await getOccurrenceForAuth(checkInId);
  if (!occurrence || occurrence.clientId !== clientId) return null;
  return listCheckInPhotosInternal(checkInId);
}

// ─────────────────────────────────────────────────────────────
// COACH — LIST — caller MUST have already verified coachOwnsClient
// for this occurrence's clientId (the same guard pattern
// app/hq/check-ins/[checkInId]/page.tsx already applies before
// rendering the rest of the detail page) — this function itself only
// re-confirms the checkInId is real, not coach ownership, matching
// coach-check-in-service.ts's getCoachCheckInDetail precedent (its
// own header note: "does NOT take coachId itself, relies on caller's
// own tenant check").
// ─────────────────────────────────────────────────────────────

export async function listCheckInPhotosForCoach(checkInId: string): Promise<CheckInPhotoView[] | null> {
  const occurrence = await getOccurrenceForAuth(checkInId);
  if (!occurrence) return null;
  return listCheckInPhotosInternal(checkInId);
}

async function listCheckInPhotosInternal(checkInId: string): Promise<CheckInPhotoView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: checkInPhotos.id,
      category: checkInPhotos.category,
      originalFilename: checkInPhotos.originalFilename,
      uploadedAt: checkInPhotos.uploadedAt,
      storagePath: checkInPhotos.storagePath,
    })
    .from(checkInPhotos)
    .where(and(eq(checkInPhotos.checkInId, checkInId), isNull(checkInPhotos.deletedAt)));

  const supabase = createAdminClient();
  const views = await Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.storage
        .from(CHECK_IN_PHOTOS_BUCKET)
        .createSignedUrl(row.storagePath, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        category: row.category,
        originalFilename: row.originalFilename,
        uploadedAt: row.uploadedAt,
        signedUrl: error || !data?.signedUrl ? "" : data.signedUrl,
      };
    }),
  );
  // A signing failure for one photo (rare — e.g. transient Storage
  // hiccup) drops that one thumbnail rather than failing the whole
  // list; empty signedUrl is a clear, checkable sentinel for the UI.
  return views;
}

// ─────────────────────────────────────────────────────────────
// CLIENT — DELETE (soft-delete) — same ownership + editable-window
// guarantee as upload. See schema-check-in-photos.ts's header for why
// this is a soft delete (deletedAt), not a hard delete or a
// synchronous Storage removal.
// ─────────────────────────────────────────────────────────────

export async function deleteCheckInPhoto(
  clientId: string,
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [photo] = await db
    .select({ id: checkInPhotos.id, checkInId: checkInPhotos.checkInId, clientId: checkInPhotos.clientId })
    .from(checkInPhotos)
    .where(and(eq(checkInPhotos.id, photoId), isNull(checkInPhotos.deletedAt)))
    .limit(1);

  if (!photo || photo.clientId !== clientId) {
    return { ok: false, error: "Photo not found." };
  }

  const occurrence = await getOccurrenceForAuth(photo.checkInId);
  if (!occurrence || !isEditable(occurrence.status)) {
    return { ok: false, error: "This check-in is no longer editable." };
  }

  await db.update(checkInPhotos).set({ deletedAt: new Date() }).where(eq(checkInPhotos.id, photoId));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// REQUIREMENT ENFORCEMENT — server-side gate called by
// check-in-service.ts's submitCheckIn BEFORE the occurrence is
// allowed to transition out of 'draft'. Pure read + a single
// definition of "satisfied" shared by both submitCheckIn and the
// Portal UI's own client-side check, so the two can never drift.
//
// `requiredViews` MUST be the occurrence's own historically-resolved
// set (check-in-schedule-service.ts's getPhotoPolicyAtDate, called at
// the occurrence's scheduledDate — never "today's" live schedule
// state) — this function itself has no opinion on WHICH views are
// required, only whether the ones it's told to check are satisfied.
// An empty requiredViews array is trivially satisfied (Optional/Off
// callers, or a "Required" row with no view checked — rejected
// earlier at setPhotoPolicy write time, but defensively safe here
// too). "Other" never counts toward satisfying any requirement.
// ─────────────────────────────────────────────────────────────

export async function isPhotoRequirementSatisfied(
  checkInId: string,
  requiredViews: PhotoViewName[],
): Promise<boolean> {
  if (requiredViews.length === 0) return true;

  const db = getDb();
  const rows = await db
    .select({ category: checkInPhotos.category })
    .from(checkInPhotos)
    .where(
      and(
        eq(checkInPhotos.checkInId, checkInId),
        isNull(checkInPhotos.deletedAt),
        inArray(checkInPhotos.category, requiredViews),
      ),
    );
  const present = new Set(rows.map((r) => r.category));
  return requiredViews.every((view) => present.has(view));
}
