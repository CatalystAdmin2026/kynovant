// ─────────────────────────────────────────────────────────────
// Kynovant — Coach RD/RDN Credential Service
//
// SERVER-ONLY — never import from a Client Component.
//
// Authorization contract (mirrors lib/db/document-service.ts's header
// note exactly):
//   Coach-facing functions never take an arbitrary credentialId from
//   the caller — every coach-facing function here is keyed by coachId,
//   which its caller (app/hq/credentials/actions.ts) derives ONLY from
//   requireCoachOrAdmin()'s authenticated session, never from a
//   request body/param. There is structurally no "credential ID" for
//   a coach to spoof on the write path: getMyCredential/submitCredential
//   operate on "whichever row belongs to this authenticated coachId,"
//   full stop.
//   Admin-facing functions (reviewCredential, getCredentialById,
//   listCredentialsForReview, generateAdminCredentialProofUrl) are
//   keyed by credentialId because an admin must be able to select any
//   coach's row — every call site sits behind requireAdmin()/
//   requireAdminPage() (lib/auth/guards.ts), enforced by the caller,
//   same convention as lib/db/application-service.ts.
//
// Signed URL strategy: identical to document-service.ts. Nobody
// (coach or admin) ever receives a storageKey or permanent URL — only
// a signed URL generated server-side, after authorization, expiring
// in 1 hour. The Supabase Storage bucket "coach-credentials" is
// private — see scripts/setup-coach-credentials-bucket.ts (NOT yet
// provisioned against the shared project — see that script's header).
//
// This file intentionally does NOT decide who may use a future
// RD/RDN-gated feature — that's lib/auth/rd-credential.ts's
// isVerifiedRd(), which reads coach_credentials directly. Keeping
// "can a coach manage their own submission" (here) and "is a coach
// currently verified" (rd-credential.ts) as separate concerns means
// the gate has exactly one, minimal, independently-testable
// implementation.
//
// REVIEW HISTORY (see schema-coach-credentials.ts header, ADR-015):
// coachCredentials stays one row per coach (fast, unambiguous current
// state for the gate); submitCredential() and reviewCredential() ALSO
// write an immutable coachCredentialReviews event, in the same
// transaction as the coachCredentials write, so a resubmission's
// overwrite of reviewedAt/reviewedBy/reviewNotes never destroys the
// evidence of a past decision — it's preserved in the event log.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, coachProfiles } from "./schema";
import {
  coachCredentials,
  coachCredentialReviews,
  coachCredentialTypeEnum,
  type CoachCredential,
  type CoachCredentialType,
  type CoachCredentialStatus,
} from "./schema-coach-credentials";

// Private Supabase Storage bucket for credential proof documents.
// Must be created as a PRIVATE bucket — see
// scripts/setup-coach-credentials-bucket.ts.
const CREDENTIALS_BUCKET = "coach-credentials";

// Default signed URL TTL. 1 hour — same as document-service.ts.
const SIGNED_URL_TTL_SECONDS = 3600;

// Phase 1 has exactly one verification method. A future automated
// verifier sets a different value here (and on coachCredentialReviews'
// verificationMethod for the event it wrote) — see
// coach-credential-verifier.ts. Never read by isVerifiedRd(); purely
// provenance/audit metadata.
const MANUAL_REVIEW_METHOD = "manual_review";

// ─────────────────────────────────────────────────────────────
// UPLOAD VALIDATION — server-side. Sized for a license/certification
// PDF or photo, not a general document library.
// ─────────────────────────────────────────────────────────────

export const MAX_PROOF_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_PROOF_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export interface CredentialSubmissionInput {
  credentialType: string;
  licenseNumber: string;
  issuingState: string;
  expirationDate: string; // "YYYY-MM-DD"
}

export interface ProofFileInput {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

// Pure function — no I/O — directly unit-testable.
export function validateCredentialSubmission(
  input: CredentialSubmissionInput,
  file: Pick<ProofFileInput, "filename" | "mimeType" | "sizeBytes">,
): ValidationResult {
  if (!coachCredentialTypeEnum.enumValues.includes(input.credentialType as CoachCredentialType)) {
    return { ok: false, error: `Invalid credential type: ${input.credentialType}` };
  }
  if (!input.licenseNumber.trim()) {
    return { ok: false, error: "License / credential number is required." };
  }
  if (input.licenseNumber.length > 100) {
    return { ok: false, error: "License / credential number is too long." };
  }
  if (!input.issuingState.trim()) {
    return { ok: false, error: "Issuing state / jurisdiction is required." };
  }
  if (input.issuingState.length > 100) {
    return { ok: false, error: "Issuing state / jurisdiction is too long." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expirationDate)) {
    return { ok: false, error: "A valid expiration date is required." };
  }
  if (!file.filename.trim()) {
    return { ok: false, error: "Proof of credential (a document or photo) is required." };
  }
  if (file.sizeBytes <= 0) {
    return { ok: false, error: "Proof document is empty." };
  }
  if (file.sizeBytes > MAX_PROOF_DOCUMENT_SIZE_BYTES) {
    return { ok: false, error: "Proof document must be 10MB or smaller." };
  }
  if (!ALLOWED_PROOF_MIME_TYPES.has(file.mimeType)) {
    return { ok: false, error: "Proof document must be a PDF, PNG, JPEG, or WebP." };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// FILE SIGNATURE VALIDATION — pure, no I/O.
//
// validateCredentialSubmission() above only checks the CLAIMED
// mimeType (file.type from the browser's multipart part headers, or
// whatever a raw HTTP client chooses to send) against the allow-list —
// it is not proof of the file's actual content. A caller can label
// arbitrary bytes as "image/png" and pass that check. Since the
// proof document is later served back with its stored (client-
// declared) content type directly to a privileged ADMIN's browser
// (app/admin/credentials/[id]/page.tsx links straight to the signed
// URL, no download-disposition, no re-encoding), a mislabeled
// malicious upload would render in the admin's authenticated session
// exactly as claimed. This checks the first bytes against each
// allowed type's real file signature, so a mismatch is rejected
// before the file ever reaches Storage.
// ─────────────────────────────────────────────────────────────

function hasBytesAt(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

const FILE_SIGNATURE_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  // "%PDF-"
  "application/pdf": (b) => hasBytesAt(b, 0, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  // PNG 8-byte magic number
  "image/png": (b) => hasBytesAt(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // JPEG SOI marker
  "image/jpeg": (b) => hasBytesAt(b, 0, [0xff, 0xd8, 0xff]),
  // RIFF....WEBP
  "image/webp": (b) => hasBytesAt(b, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(b, 8, [0x57, 0x45, 0x42, 0x50]),
};

// Pure function — no I/O — directly unit-testable. Call AFTER
// validateCredentialSubmission (so an already-rejected mimeType never
// reaches this), BEFORE uploadCredentialProof (so a mismatched file
// never reaches Storage).
export function validateFileSignature(bytes: Uint8Array, claimedMimeType: string): ValidationResult {
  const matches = FILE_SIGNATURE_CHECKS[claimedMimeType];
  if (!matches) {
    // Not one of the four allowed types — validateCredentialSubmission
    // should already have rejected this, but fail closed regardless.
    return { ok: false, error: "Unrecognized proof document type." };
  }
  if (!matches(bytes)) {
    return {
      ok: false,
      error: "The uploaded file does not match its declared type. Please re-upload the original document.",
    };
  }
  return { ok: true };
}

// True when an approved credential's expirationDate has passed.
// Pure, string-comparable because both sides are "YYYY-MM-DD".
// Exported so the UI and the gate (lib/auth/rd-credential.ts) apply
// the exact same definition of "expired" — see schema-coach-credentials.ts
// for why this is a derived condition, not a stored status.
export function isExpired(expirationDate: string, asOf: Date = new Date()): boolean {
  const today = asOf.toISOString().split("T")[0];
  return expirationDate < today;
}

// ─────────────────────────────────────────────────────────────
// COACH — READ OWN
// ─────────────────────────────────────────────────────────────

export async function getMyCredential(coachId: string): Promise<CoachCredential | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(coachCredentials)
    .where(eq(coachCredentials.coachId, coachId))
    .limit(1);
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────
// COACH — SUBMIT / RESUBMIT
//
// One row per coach (uq_coach_credentials_coach_id). Behavior depends
// entirely on the existing row's state — see schema-coach-credentials.ts:
//   no row                        → insert, status='pending'
//   status='rejected'             → resubmission: update in place
//   status='approved', EXPIRED    → renewal: update in place
//   status='approved', not expired → reject the attempt (already valid)
//   status='pending'              → reject the attempt (already queued)
//
// Every insert/update also writes a 'submitted' coachCredentialReviews
// event in the same transaction — see this file's header.
// ─────────────────────────────────────────────────────────────

export interface UploadedProof {
  storageKey: string;
  filename: string;
  mimeType: string;
}

// Uploads the proof file to private Storage and returns its reference.
// Does not touch the database. Caller (submitCredential) is
// responsible for rolling the DB write; if that fails, the uploaded
// file is simply orphaned in Storage (same accepted tradeoff as
// document-service.ts's createDocumentWithUpload — no two-phase
// commit exists between Storage and Postgres here).
export async function uploadCredentialProof(
  coachId: string,
  file: ProofFileInput,
): Promise<UploadedProof> {
  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${coachId}/${randomUUID()}-${sanitizedFilename}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(CREDENTIALS_BUCKET)
    .upload(storageKey, file.bytes, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload proof document: ${error.message}`);
  }

  return { storageKey, filename: file.filename, mimeType: file.mimeType };
}

export async function submitCredential(
  coachId: string,
  input: CredentialSubmissionInput,
  proof: UploadedProof,
): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await getMyCredential(coachId);

    if (existing) {
      if (existing.status === "pending") {
        return { ok: false, error: "Your submission is already pending review." };
      }
      if (existing.status === "approved" && !isExpired(existing.expirationDate, now)) {
        return { ok: false, error: "You already have an approved, active credential on file." };
      }

      // Resubmission (rejected) or renewal (approved-but-expired) —
      // update the single row in place, clear the prior review
      // decision (it referred to the credential details being
      // replaced — the decision ITSELF remains readable in
      // coachCredentialReviews), and re-queue for review.
      await db.transaction(async (tx) => {
        await tx
          .update(coachCredentials)
          .set({
            credentialType: input.credentialType as CoachCredentialType,
            licenseNumber: input.licenseNumber,
            issuingState: input.issuingState,
            expirationDate: input.expirationDate,
            proofDocumentStorageKey: proof.storageKey,
            proofDocumentFilename: proof.filename,
            proofDocumentMimeType: proof.mimeType,
            status: "pending",
            submittedAt: now,
            resubmissionCount: existing.resubmissionCount + 1,
            reviewedAt: null,
            reviewedBy: null,
            reviewNotes: null,
            // Automation-readiness fields reset alongside the review
            // decision — a resubmitted credential has no current
            // verification until reviewed again.
            verificationMethod: null,
            lastVerifiedAt: null,
            manualReviewRequired: true,
            updatedAt: now,
          })
          .where(eq(coachCredentials.coachId, coachId));

        await tx.insert(coachCredentialReviews).values({
          credentialId: existing.id,
          coachId,
          action: "submitted",
          performedBy: coachId,
          performedByType: "human",
        });
      });

      return { ok: true, credentialId: existing.id };
    }

    const credentialId = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(coachCredentials)
        .values({
          coachId,
          credentialType: input.credentialType as CoachCredentialType,
          licenseNumber: input.licenseNumber,
          issuingState: input.issuingState,
          expirationDate: input.expirationDate,
          proofDocumentStorageKey: proof.storageKey,
          proofDocumentFilename: proof.filename,
          proofDocumentMimeType: proof.mimeType,
          status: "pending",
        })
        .returning({ id: coachCredentials.id });

      await tx.insert(coachCredentialReviews).values({
        credentialId: inserted.id,
        coachId,
        action: "submitted",
        performedBy: coachId,
        performedByType: "human",
      });

      return inserted.id;
    });

    return { ok: true, credentialId };
  } catch (err) {
    console.error("[coach-credential-service] submitCredential error:", err);
    return { ok: false, error: "Failed to submit credential. Please try again." };
  }
}

// Signed URL for the COACH's own proof document. Ownership is
// enforced in the WHERE clause, not just checked-then-trusted — a
// coachId that doesn't own this row simply gets null back, same
// "not found" shape the rest of this codebase uses for cross-tenant
// access (see coachOwnsDocument's callers).
export async function generateCoachCredentialProofUrl(
  coachId: string,
): Promise<string | null> {
  const credential = await getMyCredential(coachId);
  if (!credential) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(CREDENTIALS_BUCKET)
    .createSignedUrl(credential.proofDocumentStorageKey, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[coach-credential-service] signed URL error:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────
// ADMIN — REVIEW
//
// Every function below trusts its caller to have already run
// requireAdmin()/requireAdminPage() — same convention as
// lib/db/application-service.ts. No per-row ownership check applies;
// admin has blanket review access by role, matching the applications
// pipeline precedent exactly.
// ─────────────────────────────────────────────────────────────

export async function getCredentialById(credentialId: string): Promise<CoachCredential | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(coachCredentials)
    .where(eq(coachCredentials.id, credentialId))
    .limit(1);
  return row ?? null;
}

export interface CredentialListItem extends CoachCredential {
  coachEmail: string;
  coachDisplayName: string | null;
}

// All credential submissions, newest first. The admin page splits
// this into pending / reviewed buckets client-side (mirrors
// app/admin/growth/applications/page.tsx's pipeline/resolved split).
export async function listCredentialsForReview(): Promise<CredentialListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      credential: coachCredentials,
      email: users.email,
      displayName: coachProfiles.displayName,
    })
    .from(coachCredentials)
    .innerJoin(users, eq(users.id, coachCredentials.coachId))
    .leftJoin(coachProfiles, eq(coachProfiles.userId, coachCredentials.coachId))
    .orderBy(desc(coachCredentials.submittedAt));

  return rows.map((r) => ({
    ...r.credential,
    coachEmail: r.email,
    coachDisplayName: r.displayName,
  }));
}

const REVIEW_DECISIONS = new Set<CoachCredentialStatus>(["approved", "rejected"]);

export async function reviewCredential(
  credentialId: string,
  reviewerId: string,
  decision: Extract<CoachCredentialStatus, "approved" | "rejected">,
  reviewNotes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // Runtime guard, not just a TS type: decision crosses a Server
  // Action boundary (app/admin/credentials/[id]/actions.ts), where
  // TypeScript's compile-time union type is not enforced against a
  // caller invoking the action directly with an arbitrary string.
  // requireAdmin() already gates who can reach this at all — this is
  // defense-in-depth against an already-authenticated admin's request
  // being malformed or tampered with, not a privilege boundary itself.
  if (!REVIEW_DECISIONS.has(decision)) {
    return { ok: false, error: "Invalid review decision." };
  }

  const db = getDb();
  const now = new Date();

  try {
    const existing = await getCredentialById(credentialId);
    if (!existing) return { ok: false, error: "Credential submission not found." };

    await db.transaction(async (tx) => {
      await tx
        .update(coachCredentials)
        .set({
          status: decision,
          reviewedAt: now,
          reviewedBy: reviewerId,
          reviewNotes,
          // A manual approval IS a verification event; a rejection has
          // no "verified" state to record. See this file's header for
          // why lastVerifiedAt/verificationMethod are distinct from
          // reviewedAt/reviewedBy.
          verificationMethod: decision === "approved" ? MANUAL_REVIEW_METHOD : null,
          lastVerifiedAt: decision === "approved" ? now : null,
          updatedAt: now,
        })
        .where(eq(coachCredentials.id, credentialId));

      await tx.insert(coachCredentialReviews).values({
        credentialId,
        coachId: existing.coachId,
        action: decision,
        verificationMethod: MANUAL_REVIEW_METHOD,
        notes: reviewNotes,
        performedBy: reviewerId,
        performedByType: "human",
      });
    });

    return { ok: true };
  } catch (err) {
    console.error("[coach-credential-service] reviewCredential error:", err);
    return { ok: false, error: "Failed to save review. Please try again." };
  }
}

// Signed URL for the ADMIN reviewing any coach's proof document.
export async function generateAdminCredentialProofUrl(
  credentialId: string,
): Promise<string | null> {
  const credential = await getCredentialById(credentialId);
  if (!credential) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(CREDENTIALS_BUCKET)
    .createSignedUrl(credential.proofDocumentStorageKey, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[coach-credential-service] admin signed URL error:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// Full review-history event log for one coach's credential, newest
// first. Read by the admin detail page so a reviewer can see prior
// decisions even after a resubmission has overwritten the current
// row's own reviewedAt/reviewedBy/reviewNotes.
export async function getCredentialReviewHistory(coachId: string) {
  const db = getDb();
  return db
    .select()
    .from(coachCredentialReviews)
    .where(eq(coachCredentialReviews.coachId, coachId))
    .orderBy(desc(coachCredentialReviews.createdAt));
}

export async function countPendingCredentials(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachCredentials)
    .where(eq(coachCredentials.status, "pending"));
  return row?.count ?? 0;
}
