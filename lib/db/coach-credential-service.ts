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
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, coachProfiles } from "./schema";
import {
  coachCredentials,
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
      // replaced), and re-queue for review.
      await db
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
          updatedAt: now,
        })
        .where(eq(coachCredentials.coachId, coachId));

      return { ok: true, credentialId: existing.id };
    }

    const [inserted] = await db
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

    return { ok: true, credentialId: inserted.id };
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

export async function reviewCredential(
  credentialId: string,
  reviewerId: string,
  decision: Extract<CoachCredentialStatus, "approved" | "rejected">,
  reviewNotes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await getCredentialById(credentialId);
    if (!existing) return { ok: false, error: "Credential submission not found." };

    await db
      .update(coachCredentials)
      .set({
        status: decision,
        reviewedAt: now,
        reviewedBy: reviewerId,
        reviewNotes,
        updatedAt: now,
      })
      .where(eq(coachCredentials.id, credentialId));

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

export async function countPendingCredentials(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coachCredentials)
    .where(eq(coachCredentials.status, "pending"));
  return row?.count ?? 0;
}
