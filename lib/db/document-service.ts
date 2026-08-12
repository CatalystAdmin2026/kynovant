// ─────────────────────────────────────────────────────────────
// Catalyst OS — Document Service (ADR-012)
//
// SERVER-ONLY — never import from a Client Component.
//
// Provides all document and assignment operations for both the
// coach (HQ) and client (portal) surfaces.
//
// Authorization contract:
//   Coach functions: role alone (requireCoachOrAdmin/requireCoachOrAdminPage)
//     is NOT sufficient — a document belongs to exactly the coach who
//     created it (see schema-documents.ts's ownership model), so every
//     coach-facing route must ALSO call guards.ts's
//     authorizeCoachDocumentMutation()/assertCoachOwnsDocument() before
//     reaching a function here that takes a bare documentId. The two
//     functions that cross a second tenant boundary in the same call —
//     assignDocument() (touches a client) and generateCoachDocumentUrl()
//     (returns a working file URL) — re-verify ownership themselves as
//     defense in depth; the rest trust the route-layer guard, matching
//     the existing coachOwnsProgramTemplate/authorizeCoachProgramMutation
//     precedent in guards.ts.
//   Client functions: caller has already been verified as a client
//     by requireClientUser(). Object-level auth is enforced by
//     querying only rows where client_id = the verified clientId.
//
// Signed URL strategy:
//   Clients never receive a storageKey or permanent URL.
//   generateSignedUrl() is called only after authorization is confirmed.
//   URLs expire in 1 hour (3600 seconds) by default.
//   The Supabase Storage bucket "coaching-documents" is private (no
//   public access) — see scripts/setup-documents-bucket.ts.
//
// Deletion policy:
//   - Zero assignment history → deleteDocument() performs hard delete.
//   - Any historical assignment (even revoked) → archiveDocument() only.
//     Hard delete is blocked to preserve the assignment audit trail.
//
// Versioning:
//   documentVersion on each assignment captures the source document's
//   version at assignment time. Future UIs can detect "stale" assignments
//   when documents.version > assignment.documentVersion.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { eq, and, isNull, count } from "drizzle-orm";
import { getDb } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachOwnsClient, coachOwnsDocument } from "@/lib/auth/guards";
import {
  documents,
  clientDocumentAssignments,
  documentCategoryEnum,
  type Document,
  type ClientDocumentAssignment,
  type DocumentCategory,
} from "./schema-documents";
import { users, clientProfiles, coachingEnrollments } from "./schema";

// Supabase Storage bucket for coaching documents.
// Must be created as a PRIVATE bucket — see scripts/setup-documents-bucket.ts.
const DOCUMENTS_BUCKET = "coaching-documents";

// Default signed URL TTL. 1 hour is sufficient for a portal session.
const SIGNED_URL_TTL_SECONDS = 3600;

// ─────────────────────────────────────────────────────────────
// UPLOAD VALIDATION — server-side, never trusts the client beyond
// what the browser reports (filename/MIME/size), which is itself
// re-validated against these whitelists before anything touches
// storage or the database. Sized for coaching materials (meal plans,
// training guides, technique references) — not video or CAD files.
// ─────────────────────────────────────────────────────────────

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

export interface UploadValidationInput {
  title: string;
  category: string;
  fileSizeBytes: number;
  mimeType: string;
  filename: string;
}

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; error: string };

// Pure function — no I/O — so it's directly unit-testable without a
// DB connection or a real file.
export function validateDocumentUpload(input: UploadValidationInput): UploadValidationResult {
  if (!input.title.trim()) {
    return { ok: false, error: "Title is required" };
  }
  if (input.title.length > 200) {
    return { ok: false, error: "Title must be 200 characters or fewer" };
  }
  if (!documentCategoryEnum.enumValues.includes(input.category as DocumentCategory)) {
    return { ok: false, error: `Invalid category: ${input.category}` };
  }
  if (!input.filename.trim()) {
    return { ok: false, error: "A file is required" };
  }
  if (input.fileSizeBytes <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (input.fileSizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      ok: false,
      error: `File exceeds the ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB limit`,
    };
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, error: `File type "${input.mimeType}" is not supported` };
  }
  return { ok: true };
}

// Strips anything that isn't alphanumeric/dot/dash/underscore, and
// collapses repeats — keeps storageKey paths predictable and free of
// path-traversal or URL-encoding surprises regardless of what the
// original filename contained.
export function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return sanitized.length > 0 ? sanitized : "file";
}

// ─────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────

export interface AssignedDocumentView {
  assignmentId: string;
  documentId: string;
  title: string;
  description: string | null;
  category: DocumentCategory;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number | null;
  documentVersion: number;
  required: boolean;
  dueAt: Date | null;
  viewedAt: Date | null;
  acknowledgedAt: Date | null;
  assignedAt: Date;
}

export interface DocumentWithStats {
  id: string;
  title: string;
  description: string | null;
  category: DocumentCategory;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number | null;
  version: number;
  status: Document["status"];
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  activeAssignmentCount: number;
  totalAssignmentCount: number;
}

// ─────────────────────────────────────────────────────────────
// STORAGE — UPLOAD, SIGNED URL
//
// Both operations use the service-role admin client, not the
// request-scoped one — this bucket is private with no public
// access and no storage RLS policies of its own (see
// scripts/setup-documents-bucket.ts). Authorization is enforced
// entirely in application code (the ownership/assignment checks
// below and in guards.ts) BEFORE either of these is ever called;
// they perform the mechanical storage operation only. Matches this
// codebase's existing "coach writes are server-side (service-role,
// bypasses RLS)" posture used elsewhere (e.g. weekly_check_ins).
// ─────────────────────────────────────────────────────────────

// Uploads raw file bytes to the private documents bucket. Returns
// the storageKey the caller should persist on the documents row.
// documentId is always server-generated (randomUUID(), never client-
// supplied) and coachId always comes from the verified session — see
// createDocumentWithUpload() below, the only intended caller.
export async function uploadDocumentToStorage(
  coachId: string,
  documentId: string,
  filename: string,
  fileBytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const storageKey = `${coachId}/${documentId}/${sanitizeFilename(filename)}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storageKey, fileBytes, { contentType: mimeType, upsert: false });

  if (error) {
    throw new Error(`Failed to upload document to storage: ${error.message}`);
  }

  return storageKey;
}

// Generate a short-lived signed URL for a document's storageKey.
// Call only after confirming authorization (active assignment or
// coach ownership) — this function performs no auth check itself.
export async function generateSignedUrl(
  storageKey: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to generate signed URL for ${storageKey}: ${error?.message ?? "no URL returned"}`,
    );
  }

  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────
// COACH — DOCUMENT MANAGEMENT
// ─────────────────────────────────────────────────────────────

export interface CreateDocumentParams {
  title: string;
  description?: string | null;
  category: DocumentCategory;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes?: number | null;
}

export async function createDocument(
  params: CreateDocumentParams,
  coachId: string,
): Promise<Document> {
  const db = getDb();
  const rows = await db
    .insert(documents)
    .values({
      createdByCoachId: coachId,
      title: params.title,
      description: params.description ?? null,
      category: params.category,
      storageKey: params.storageKey,
      originalFilename: params.originalFilename,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes ?? null,
      status: "draft",
      version: 1,
    })
    .returning();
  return rows[0];
}

export interface CreateDocumentWithUploadParams {
  title: string;
  description?: string | null;
  category: DocumentCategory;
  filename: string;
  mimeType: string;
  fileBytes: Uint8Array;
  /** Client ids to share with immediately — must all belong to coachId. */
  shareWithClientIds?: string[];
}

export interface CreateDocumentWithUploadResult {
  document: Document;
  sharedCount: number;
}

// Single entry point for the HQ upload flow: validates input, uploads
// to storage, creates the document row, immediately publishes it
// (this app has no draft-preview workflow — every uploaded document
// is assignable right away), and optionally shares it with one or
// more of the coach's own clients in the same call. documentId is
// generated here (server-side, never client-supplied) so the storage
// path can never be steered by request input.
export async function createDocumentWithUpload(
  params: CreateDocumentWithUploadParams,
  coachId: string,
): Promise<CreateDocumentWithUploadResult> {
  const validation = validateDocumentUpload({
    title: params.title,
    category: params.category,
    fileSizeBytes: params.fileBytes.byteLength,
    mimeType: params.mimeType,
    filename: params.filename,
  });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const documentId = randomUUID();
  const storageKey = await uploadDocumentToStorage(
    coachId,
    documentId,
    params.filename,
    params.fileBytes,
    params.mimeType,
  );

  const db = getDb();
  const [row] = await db
    .insert(documents)
    .values({
      id: documentId,
      createdByCoachId: coachId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      category: params.category,
      storageKey,
      originalFilename: params.filename,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileBytes.byteLength,
      status: "active", // auto-published — see doc comment above.
      version: 1,
    })
    .returning();

  let sharedCount = 0;
  const clientIds = [...new Set(params.shareWithClientIds ?? [])];
  for (const clientId of clientIds) {
    // assignDocument() re-verifies coachOwnsClient itself — a
    // malicious/stale clientId in the request body still can't reach
    // another coach's client, even though this document is freshly
    // created and definitely owned by coachId.
    try {
      await assignDocument(row.id, clientId, coachId);
      sharedCount += 1;
    } catch {
      // Skip clients this coach doesn't actually own rather than
      // failing the whole upload — the document itself was created
      // successfully and the coach can retry sharing from the list.
    }
  }

  return { document: row, sharedCount };
}

export interface UpdateDocumentParams {
  title?: string;
  description?: string | null;
  category?: DocumentCategory;
  status?: "draft" | "active" | "archived";
}

export async function updateDocument(
  documentId: string,
  params: UpdateDocumentParams,
): Promise<void> {
  const db = getDb();
  await db
    .update(documents)
    .set({
      ...params,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

export async function publishDocument(documentId: string): Promise<void> {
  const db = getDb();
  await db
    .update(documents)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(eq(documents.id, documentId), eq(documents.status, "draft")),
    );
}

// Archives the document. Clients currently assigned keep access until
// their assignment is also revoked. No new assignments can be created
// for an archived document.
export async function archiveDocument(documentId: string): Promise<void> {
  const db = getDb();
  await db
    .update(documents)
    .set({
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

// Hard-deletes a document. Only allowed when the document has never
// been assigned (no rows in client_document_assignments reference it).
// Throws if any assignment history exists — use archiveDocument() instead.
export async function deleteDocument(documentId: string): Promise<void> {
  const db = getDb();

  const [{ total }] = await db
    .select({ total: count() })
    .from(clientDocumentAssignments)
    .where(eq(clientDocumentAssignments.documentId, documentId));

  if (Number(total) > 0) {
    throw new Error(
      "Cannot hard-delete a document that has assignment history. Use archiveDocument() instead.",
    );
  }

  await db.delete(documents).where(eq(documents.id, documentId));
}

// Returns all documents (draft, active, archived) for display in coach
// UI. coachId === null means admin/unscoped (every document, any
// coach) — consistent with resolveTenantScope()'s coachId === null
// convention used throughout guards.ts and coach-dashboard-service.ts.
// A non-null coachId scopes strictly to documents THAT coach created —
// this is the fix for the pre-existing gap where this function (and
// listDocumentsWithStats below) returned every document platform-wide
// with no tenant filter at all.
export async function listCoachDocuments(coachId: string | null): Promise<Document[]> {
  const db = getDb();
  return db
    .select()
    .from(documents)
    .where(coachId === null ? undefined : eq(documents.createdByCoachId, coachId))
    .orderBy(documents.status, documents.createdAt);
}

// Returns a single document by ID for coach management.
// Returns null if not found.
export async function getDocument(
  documentId: string,
): Promise<Document | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  return rows[0] ?? null;
}

// Returns documents with assignment counts — useful for coach list
// views. Same coachId === null (admin/unscoped) convention as
// listCoachDocuments() above.
export async function listDocumentsWithStats(coachId: string | null): Promise<DocumentWithStats[]> {
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(coachId === null ? undefined : eq(documents.createdByCoachId, coachId))
    .orderBy(documents.createdAt);

  const result: DocumentWithStats[] = await Promise.all(
    docs.map(async (doc) => {
      const [activeRow] = await db
        .select({ total: count() })
        .from(clientDocumentAssignments)
        .where(
          and(
            eq(clientDocumentAssignments.documentId, doc.id),
            isNull(clientDocumentAssignments.revokedAt),
          ),
        );

      const [totalRow] = await db
        .select({ total: count() })
        .from(clientDocumentAssignments)
        .where(eq(clientDocumentAssignments.documentId, doc.id));

      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        version: doc.version,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        archivedAt: doc.archivedAt,
        activeAssignmentCount: Number(activeRow?.total ?? 0),
        totalAssignmentCount: Number(totalRow?.total ?? 0),
      };
    }),
  );

  return result;
}

// Lightweight client roster for the "share with" picker — id + name
// only. Deliberately not listCoachClients() from coach-dashboard-service.ts
// (heavy program/session-stat joins this picker doesn't need) and
// deliberately not shared with lib/db/messaging-service.ts's own
// near-identical listMessagingContacts() — same shape, different
// feature, kept independent so neither can accidentally couple to
// the other's schema/behavior.
export interface DocumentShareContact {
  clientId: string;
  name: string;
}

export async function listCoachClientsForSharing(coachId: string): Promise<DocumentShareContact[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({
      clientId: coachingEnrollments.clientId,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
      email: users.email,
    })
    .from(coachingEnrollments)
    .innerJoin(users, eq(users.id, coachingEnrollments.clientId))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, coachingEnrollments.clientId))
    .where(eq(coachingEnrollments.coachId, coachId))
    .orderBy(clientProfiles.fullName);

  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.preferredName || row.fullName || row.email,
  }));
}

// ─────────────────────────────────────────────────────────────
// COACH — ASSIGNMENT MANAGEMENT
// ─────────────────────────────────────────────────────────────

export interface AssignDocumentParams {
  required?: boolean;
  dueAt?: Date | null;
}

// Assigns a document to a client. Only active documents may be assigned.
// The partial unique index on (document_id, client_id) WHERE revoked_at IS NULL
// prevents duplicate active assignments — a unique constraint violation
// will surface as a thrown error from Postgres.
//
// Defense in depth: re-verifies coachId owns BOTH the document and the
// client, even though the API route layer (guards.ts's
// authorizeCoachDocumentMutation) already checked document ownership
// before reaching here. This is the one function in this file that
// touches a second tenant boundary (the client) in the same call, and
// it is the literal enforcement point for "coach cannot share a
// document with another coach's client" — worth not trusting the
// caller alone for. Throws (never silently no-ops) so callers can't
// mistake a blocked cross-tenant share for a successful one.
export async function assignDocument(
  documentId: string,
  clientId: string,
  coachId: string,
  params: AssignDocumentParams = {},
): Promise<ClientDocumentAssignment> {
  const db = getDb();

  const doc = await getDocument(documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (doc.createdByCoachId !== coachId) {
    throw new Error(`Document ${documentId} not found`); // non-disclosing
  }
  if (doc.status !== "active") {
    throw new Error(
      `Document "${doc.title}" must be active before it can be assigned (current status: ${doc.status})`,
    );
  }
  const ownsClient = await coachOwnsClient(coachId, clientId);
  if (!ownsClient) {
    throw new Error(`Client ${clientId} not found`); // non-disclosing
  }

  const rows = await db
    .insert(clientDocumentAssignments)
    .values({
      documentId,
      clientId,
      assignedByCoachId: coachId,
      documentVersion: doc.version,
      required: params.required ?? false,
      dueAt: params.dueAt ?? null,
    })
    .returning();

  return rows[0];
}

export interface UpdateAssignmentParams {
  required?: boolean;
  dueAt?: Date | null;
}

// Resolves an assignment's owning documentId, purely to support the
// ownership checks in updateAssignment/revokeAssignment below — an
// assignment carries no coachId of its own, so ownership always
// resolves one hop up via its document, same "resolve parent, then
// defer" shape as guards.ts's assertCoachOwnsProgramWeek.
async function getAssignmentDocumentId(assignmentId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ documentId: clientDocumentAssignments.documentId })
    .from(clientDocumentAssignments)
    .where(eq(clientDocumentAssignments.id, assignmentId))
    .limit(1);
  return rows[0]?.documentId ?? null;
}

// Returns true if the update applied, false if the assignment doesn't
// exist, is already revoked, or belongs to a document this coachId
// doesn't own.
export async function updateAssignment(
  assignmentId: string,
  params: UpdateAssignmentParams,
  coachId: string,
): Promise<boolean> {
  const documentId = await getAssignmentDocumentId(assignmentId);
  if (!documentId || !(await coachOwnsDocument(coachId, documentId))) return false;

  const db = getDb();
  const rows = await db
    .update(clientDocumentAssignments)
    .set(params)
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .returning({ id: clientDocumentAssignments.id });
  return rows.length > 0;
}

// Revokes an assignment. The client immediately loses portal access.
// The row is preserved for audit history (revokedAt is set, not deleted).
// The source document is not affected.
//
// Returns true if revoked, false if the assignment doesn't exist, is
// already revoked, or — the tenant-isolation-critical case — belongs
// to a document this coachId doesn't own. Non-disclosing: a coach
// probing another coach's assignment id gets the same "false" as a
// bad/already-revoked id, never a distinct error.
export async function revokeAssignment(
  assignmentId: string,
  coachId: string,
): Promise<boolean> {
  const documentId = await getAssignmentDocumentId(assignmentId);
  if (!documentId || !(await coachOwnsDocument(coachId, documentId))) return false;

  const db = getDb();
  const rows = await db
    .update(clientDocumentAssignments)
    .set({
      revokedAt: new Date(),
      revokedByCoachId: coachId,
    })
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .returning({ id: clientDocumentAssignments.id });
  return rows.length > 0;
}

// Returns all assignments (active and revoked) for a given document.
export async function listDocumentAssignments(
  documentId: string,
): Promise<
  (ClientDocumentAssignment & {
    clientEmail: string;
    clientName: string;
  })[]
> {
  const db = getDb();
  const rows = await db
    .select({
      id: clientDocumentAssignments.id,
      documentId: clientDocumentAssignments.documentId,
      clientId: clientDocumentAssignments.clientId,
      assignedByCoachId: clientDocumentAssignments.assignedByCoachId,
      documentVersion: clientDocumentAssignments.documentVersion,
      required: clientDocumentAssignments.required,
      dueAt: clientDocumentAssignments.dueAt,
      viewedAt: clientDocumentAssignments.viewedAt,
      acknowledgedAt: clientDocumentAssignments.acknowledgedAt,
      revokedAt: clientDocumentAssignments.revokedAt,
      revokedByCoachId: clientDocumentAssignments.revokedByCoachId,
      assignedAt: clientDocumentAssignments.assignedAt,
      createdAt: clientDocumentAssignments.createdAt,
      clientEmail: users.email,
      clientFullName: clientProfiles.fullName,
      clientPreferredName: clientProfiles.preferredName,
    })
    .from(clientDocumentAssignments)
    .innerJoin(users, eq(clientDocumentAssignments.clientId, users.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientDocumentAssignments.clientId))
    .where(eq(clientDocumentAssignments.documentId, documentId))
    .orderBy(clientDocumentAssignments.assignedAt);

  return rows.map(({ clientFullName, clientPreferredName, ...row }) => ({
    ...row,
    clientName: clientPreferredName || clientFullName || row.clientEmail,
  }));
}

// Returns all active assignments for a given client.
// Useful for coach workspace view of what a client has been sent.
export async function listClientActiveAssignments(
  clientId: string,
): Promise<(ClientDocumentAssignment & { document: Document })[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: clientDocumentAssignments.id,
      documentId: clientDocumentAssignments.documentId,
      clientId: clientDocumentAssignments.clientId,
      assignedByCoachId: clientDocumentAssignments.assignedByCoachId,
      documentVersion: clientDocumentAssignments.documentVersion,
      required: clientDocumentAssignments.required,
      dueAt: clientDocumentAssignments.dueAt,
      viewedAt: clientDocumentAssignments.viewedAt,
      acknowledgedAt: clientDocumentAssignments.acknowledgedAt,
      revokedAt: clientDocumentAssignments.revokedAt,
      revokedByCoachId: clientDocumentAssignments.revokedByCoachId,
      assignedAt: clientDocumentAssignments.assignedAt,
      createdAt: clientDocumentAssignments.createdAt,
      document: {
        id: documents.id,
        createdByCoachId: documents.createdByCoachId,
        title: documents.title,
        description: documents.description,
        category: documents.category,
        storageKey: documents.storageKey,
        originalFilename: documents.originalFilename,
        mimeType: documents.mimeType,
        fileSizeBytes: documents.fileSizeBytes,
        version: documents.version,
        status: documents.status,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        archivedAt: documents.archivedAt,
      },
    })
    .from(clientDocumentAssignments)
    .innerJoin(documents, eq(clientDocumentAssignments.documentId, documents.id))
    .where(
      and(
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .orderBy(clientDocumentAssignments.assignedAt);

  return rows as (ClientDocumentAssignment & { document: Document })[];
}

// ─────────────────────────────────────────────────────────────
// CLIENT (PORTAL) — DOCUMENT ACCESS
//
// These functions enforce client-level isolation. Each query
// includes clientId in the WHERE clause — a client can never
// access another client's assignments or documents.
// ─────────────────────────────────────────────────────────────

// Returns all active document assignments for a client as a view
// suitable for the portal Docs page. No storageKey is included.
export async function listClientDocuments(
  clientId: string,
): Promise<AssignedDocumentView[]> {
  const db = getDb();
  const rows = await db
    .select({
      assignmentId: clientDocumentAssignments.id,
      documentId: documents.id,
      title: documents.title,
      description: documents.description,
      category: documents.category,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      fileSizeBytes: documents.fileSizeBytes,
      documentVersion: clientDocumentAssignments.documentVersion,
      required: clientDocumentAssignments.required,
      dueAt: clientDocumentAssignments.dueAt,
      viewedAt: clientDocumentAssignments.viewedAt,
      acknowledgedAt: clientDocumentAssignments.acknowledgedAt,
      assignedAt: clientDocumentAssignments.assignedAt,
    })
    .from(clientDocumentAssignments)
    .innerJoin(documents, eq(clientDocumentAssignments.documentId, documents.id))
    .where(
      and(
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .orderBy(clientDocumentAssignments.assignedAt);

  return rows;
}

// Returns a single assignment+document view for a client after confirming
// the assignment belongs to them and is active. Returns null on any mismatch
// (non-disclosing: prevents confirming existence to unauthorized callers).
// Does NOT return storageKey — use generateClientDocumentUrl() for access.
export async function getClientAssignmentWithAuth(
  assignmentId: string,
  clientId: string,
): Promise<AssignedDocumentView | null> {
  const db = getDb();
  const rows = await db
    .select({
      assignmentId: clientDocumentAssignments.id,
      documentId: documents.id,
      title: documents.title,
      description: documents.description,
      category: documents.category,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      fileSizeBytes: documents.fileSizeBytes,
      documentVersion: clientDocumentAssignments.documentVersion,
      required: clientDocumentAssignments.required,
      dueAt: clientDocumentAssignments.dueAt,
      viewedAt: clientDocumentAssignments.viewedAt,
      acknowledgedAt: clientDocumentAssignments.acknowledgedAt,
      assignedAt: clientDocumentAssignments.assignedAt,
    })
    .from(clientDocumentAssignments)
    .innerJoin(documents, eq(clientDocumentAssignments.documentId, documents.id))
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

// Generates a signed URL for a client to access their assigned document.
// Authorization is confirmed before the storageKey is read:
//   1. Assignment must belong to this clientId
//   2. Assignment must be active (revokedAt IS NULL)
// If either check fails, throws rather than leaking the storage key.
export async function generateClientDocumentUrl(
  assignmentId: string,
  clientId: string,
): Promise<string> {
  const db = getDb();

  // Fetch assignment + storageKey together — single query, auth check inline.
  const rows = await db
    .select({
      storageKey: documents.storageKey,
    })
    .from(clientDocumentAssignments)
    .innerJoin(documents, eq(clientDocumentAssignments.documentId, documents.id))
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new Error("Assignment not found or access denied");
  }

  return generateSignedUrl(rows[0].storageKey);
}

// Generates a signed URL for a coach to access one of their own
// documents. requireCoachOrAdmin() alone is NOT sufficient authorization
// here — it only confirms the caller is *a* coach, not that they own
// this specific document. The route layer should already have called
// guards.ts's authorizeCoachDocumentMutation() before reaching this
// function; coachId is re-verified here anyway (this generates a
// working URL to the raw file — worth not trusting the caller alone
// for). Pass coachId === null for admin's unscoped bypass.
export async function generateCoachDocumentUrl(
  documentId: string,
  coachId: string | null,
): Promise<string> {
  const doc = await getDocument(documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }
  if (coachId !== null && doc.createdByCoachId !== coachId) {
    throw new Error(`Document ${documentId} not found`); // non-disclosing
  }
  return generateSignedUrl(doc.storageKey);
}

// Stamps viewedAt on first access. Idempotent — subsequent calls
// after the first view have no effect.
export async function recordDocumentView(
  assignmentId: string,
  clientId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(clientDocumentAssignments)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
        isNull(clientDocumentAssignments.viewedAt),
      ),
    );
}

// Stamps acknowledgedAt. Idempotent — subsequent calls have no effect.
export async function acknowledgeDocument(
  assignmentId: string,
  clientId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(clientDocumentAssignments)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        eq(clientDocumentAssignments.clientId, clientId),
        isNull(clientDocumentAssignments.revokedAt),
        isNull(clientDocumentAssignments.acknowledgedAt),
      ),
    );
}
