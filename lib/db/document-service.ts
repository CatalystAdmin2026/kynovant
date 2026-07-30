// ─────────────────────────────────────────────────────────────
// Catalyst OS — Document Service (ADR-012)
//
// SERVER-ONLY — never import from a Client Component.
//
// Provides all document and assignment operations for both the
// coach (HQ) and client (portal) surfaces.
//
// Authorization contract:
//   Coach functions: caller has already been verified as coach/admin
//     by requireCoachOrAdmin() or requireCoachOrAdminPage().
//   Client functions: caller has already been verified as a client
//     by requireClientUser(). Object-level auth is enforced by
//     querying only rows where client_id = the verified clientId.
//
// Signed URL strategy:
//   Clients never receive a storageKey or permanent URL.
//   generateSignedUrl() is called only after authorization is confirmed.
//   URLs expire in 1 hour (3600 seconds) by default.
//   The Supabase Storage bucket "coaching-documents" must be set to
//   private (no public access) in the Supabase dashboard.
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
import { eq, and, isNull, isNotNull, count } from "drizzle-orm";
import { getDb } from "./client";
import { createClient } from "@/lib/supabase/server";
import {
  documents,
  clientDocumentAssignments,
  type Document,
  type ClientDocumentAssignment,
  type DocumentCategory,
} from "./schema-documents";
import { users } from "./schema";

// Supabase Storage bucket for coaching documents.
// Must be created as a PRIVATE bucket in the Supabase dashboard.
const DOCUMENTS_BUCKET = "coaching-documents";

// Default signed URL TTL. 1 hour is sufficient for a portal session.
const SIGNED_URL_TTL_SECONDS = 3600;

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
// STORAGE — SIGNED URL
//
// Generate a short-lived signed URL for a document's storageKey.
// Call only after confirming authorization (active assignment or coach).
// ─────────────────────────────────────────────────────────────

export async function generateSignedUrl(
  storageKey: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const supabase = await createClient();
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

// Returns all documents (draft, active, archived) for display in coach UI.
export async function listCoachDocuments(): Promise<Document[]> {
  const db = getDb();
  return db
    .select()
    .from(documents)
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

// Returns documents with assignment counts — useful for coach list views.
export async function listDocumentsWithStats(): Promise<DocumentWithStats[]> {
  const db = getDb();
  const docs = await db.select().from(documents).orderBy(documents.createdAt);

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
  if (doc.status !== "active") {
    throw new Error(
      `Document "${doc.title}" must be active before it can be assigned (current status: ${doc.status})`,
    );
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

export async function updateAssignment(
  assignmentId: string,
  params: UpdateAssignmentParams,
): Promise<void> {
  const db = getDb();
  await db
    .update(clientDocumentAssignments)
    .set(params)
    .where(
      and(
        eq(clientDocumentAssignments.id, assignmentId),
        isNull(clientDocumentAssignments.revokedAt),
      ),
    );
}

// Revokes an assignment. The client immediately loses portal access.
// The row is preserved for audit history (revokedAt is set, not deleted).
// The source document is not affected.
export async function revokeAssignment(
  assignmentId: string,
  coachId: string,
): Promise<void> {
  const db = getDb();
  await db
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
    );
}

// Returns all assignments (active and revoked) for a given document.
export async function listDocumentAssignments(
  documentId: string,
): Promise<
  (ClientDocumentAssignment & {
    clientEmail: string;
    clientName: string | null;
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
      clientName: users.email,
    })
    .from(clientDocumentAssignments)
    .innerJoin(users, eq(clientDocumentAssignments.clientId, users.id))
    .where(eq(clientDocumentAssignments.documentId, documentId))
    .orderBy(clientDocumentAssignments.assignedAt);

  return rows;
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

// Generates a signed URL for a coach to access any document by ID.
// Caller must already be authorized via requireCoachOrAdmin().
export async function generateCoachDocumentUrl(
  documentId: string,
): Promise<string> {
  const doc = await getDocument(documentId);
  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
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
