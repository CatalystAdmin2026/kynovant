// ─────────────────────────────────────────────────────────────
// Documents (ADR-012) — tenant isolation integration suite
//
// Proves, against a REAL database connection (same rationale as
// coach-tenant-isolation.test.ts / messaging-tenant-isolation.test.ts
// — mocking Drizzle's query builder would only prove the mock was
// called correctly, not that the actual SQL WHERE clause filters
// correctly):
//
//   1. A coach sees/manages only documents they created.
//   2. A coach can only share a document with their OWN client, and
//      only when the document is also their own — cross-coach denial
//      in both directions.
//   3. A client sees/downloads only documents actively assigned to
//      them — never another client's, never a revoked assignment.
//   4. Revoke is coach-owned-document-scoped, not just any-coach.
//   5. Upload metadata validation (pure function, no storage I/O —
//      the "coaching-documents" bucket is a separate, not-yet-
//      provisioned piece of infrastructure; see
//      scripts/setup-documents-bucket.ts. Everything below exercises
//      only the Postgres side, which already exists and needs no
//      migration).
//   6. Delete-vs-archive policy (hard delete blocked once any
//      assignment history exists).
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads
// .env.local automatically. Fixture rows use randomUUID()-based
// emails so repeated runs never collide; every row this file creates
// is deleted in afterAll(), FK-safe (children before parents).
// Document rows are inserted directly (not via createDocumentWithUpload)
// specifically to keep this suite independent of Supabase Storage.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments } from "../schema";
import { documents, clientDocumentAssignments } from "../schema-documents";
import {
  coachOwnsDocument,
  assertCoachOwnsDocument,
  resolveTenantScope,
} from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import {
  assignDocument,
  revokeAssignment,
  updateAssignment,
  deleteDocument,
  archiveDocument,
  listCoachDocuments,
  listDocumentsWithStats,
  listDocumentAssignments,
  listClientDocuments,
  getClientAssignmentWithAuth,
  validateDocumentUpload,
  sanitizeFilename,
  MAX_DOCUMENT_SIZE_BYTES,
} from "../document-service";

const db = getDb();

function fakeDbUser(id: string, role: "coach" | "admin"): PublicUser {
  return {
    id,
    email: `${id}@isolation-test.invalid`,
    normalizedEmail: `${id}@isolation-test.invalid`,
    emailVerifiedAt: null,
    role,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as PublicUser;
}

// ── Fixture identities ────────────────────────────────────────
const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };
const clientB = { id: "" };
let docA: string; // owned by coachA
let docB: string; // owned by coachB
let docWithHistory: string; // owned by coachA, has an assignment
let assignmentDocAtoClientA: string;

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `documents-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

async function insertDocument(coachId: string, title: string) {
  const [row] = await db
    .insert(documents)
    .values({
      createdByCoachId: coachId,
      title,
      category: "training_guide",
      storageKey: `${coachId}/${randomUUID()}/fixture.pdf`,
      originalFilename: "fixture.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      status: "active",
    })
    .returning({ id: documents.id });
  return row.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id, clientB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);

  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);

  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Documents Test Client A" },
    { userId: clientB.id, fullName: "Documents Test Client B" },
  ]);

  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientB.id, coachId: coachB.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);

  docA = await insertDocument(coachA.id, "Coach A's Meal Plan");
  docB = await insertDocument(coachB.id, "Coach B's Training Guide");
  docWithHistory = await insertDocument(coachA.id, "Coach A's Doc With History");
});

afterAll(async () => {
  const docIds = [docA, docB, docWithHistory].filter(Boolean);
  const userIds = [coachA.id, coachB.id, clientA.id, clientB.id].filter(Boolean);

  if (docIds.length > 0) {
    await db.delete(clientDocumentAssignments).where(inArray(clientDocumentAssignments.documentId, docIds));
    await db.delete(documents).where(inArray(documents.id, docIds));
  }
  if (userIds.length > 0) {
    await db.delete(coachingEnrollments).where(
      inArray(coachingEnrollments.clientId, [clientA.id, clientB.id].filter(Boolean)),
    );
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, [clientA.id, clientB.id].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  if (userIds.length > 0) {
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

// ─────────────────────────────────────────────────────────────

describe("coachOwnsDocument / assertCoachOwnsDocument", () => {
  it("is true for a coach's own document", async () => {
    expect(await coachOwnsDocument(coachA.id, docA)).toBe(true);
  });

  it("is false for another coach's document", async () => {
    expect(await coachOwnsDocument(coachA.id, docB)).toBe(false);
    expect(await coachOwnsDocument(coachB.id, docA)).toBe(false);
  });

  it("assertCoachOwnsDocument denies a coach acting on another coach's document", async () => {
    const result = await assertCoachOwnsDocument(fakeDbUser(coachA.id, "coach"), docB);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not found");
  });

  it("admin bypasses the ownership check entirely", async () => {
    const result = await assertCoachOwnsDocument(fakeDbUser(coachA.id, "admin"), docB);
    expect(result.ok).toBe(true);
    expect(resolveTenantScope(fakeDbUser(coachA.id, "admin")).coachId).toBeNull();
  });
});

describe("listCoachDocuments / listDocumentsWithStats — list-level isolation", () => {
  it("scopes to the requesting coach's own documents", async () => {
    const rows = await listCoachDocuments(coachA.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(docA);
    expect(ids).not.toContain(docB);
  });

  it("admin (coachId null) sees documents across both coaches", async () => {
    const rows = await listCoachDocuments(null);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(docA);
    expect(ids).toContain(docB);
  });

  it("listDocumentsWithStats applies the same scoping", async () => {
    const rows = await listDocumentsWithStats(coachB.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(docB);
    expect(ids).not.toContain(docA);
  });
});

describe("assignDocument — cross-tenant denial in both directions", () => {
  it("succeeds when the coach owns both the document and the client", async () => {
    const assignment = await assignDocument(docA, clientA.id, coachA.id);
    expect(assignment.documentId).toBe(docA);
    expect(assignment.clientId).toBe(clientA.id);
  });

  it("refuses to share a document with another coach's client", async () => {
    // coachA owns docA, but not clientB.
    await expect(assignDocument(docA, clientB.id, coachA.id)).rejects.toThrow();
  });

  it("refuses to share a document the coach doesn't own, even with their own client", async () => {
    // coachA owns clientA, but not docB.
    await expect(assignDocument(docB, clientA.id, coachA.id)).rejects.toThrow();
  });

  it("assigns to docWithHistory for later delete/archive assertions", async () => {
    assignmentDocAtoClientA = (await assignDocument(docWithHistory, clientA.id, coachA.id)).id;
    expect(assignmentDocAtoClientA).toBeTruthy();
  });
});

describe("client visibility — listClientDocuments / getClientAssignmentWithAuth", () => {
  it("a client sees documents assigned to them", async () => {
    const rows = await listClientDocuments(clientA.id);
    const ids = rows.map((r) => r.documentId);
    expect(ids).toContain(docA);
  });

  it("a client never sees another client's assignments", async () => {
    const rows = await listClientDocuments(clientB.id);
    const ids = rows.map((r) => r.documentId);
    expect(ids).not.toContain(docA);
  });

  it("getClientAssignmentWithAuth denies a different client accessing the assignment", async () => {
    const rows = await listClientDocuments(clientA.id);
    const assignmentId = rows[0].assignmentId;
    const asOwner = await getClientAssignmentWithAuth(assignmentId, clientA.id);
    const asOther = await getClientAssignmentWithAuth(assignmentId, clientB.id);
    expect(asOwner).not.toBeNull();
    expect(asOther).toBeNull();
  });
});

describe("revokeAssignment / updateAssignment — coach-owned-document scoping", () => {
  it("refuses to revoke when the requesting coach doesn't own the assignment's document", async () => {
    const rows = await listClientDocuments(clientA.id);
    const assignmentId = rows.find((r) => r.documentId === docA)!.assignmentId;
    const revokedByWrongCoach = await revokeAssignment(assignmentId, coachB.id);
    expect(revokedByWrongCoach).toBe(false);

    // Still active afterward — the wrong-coach call above must not have
    // silently succeeded.
    const stillActive = await listClientDocuments(clientA.id);
    expect(stillActive.some((r) => r.assignmentId === assignmentId)).toBe(true);
  });

  it("refuses to update when the requesting coach doesn't own the assignment's document", async () => {
    const rows = await listClientDocuments(clientA.id);
    const assignmentId = rows.find((r) => r.documentId === docA)!.assignmentId;
    const updated = await updateAssignment(assignmentId, { required: true }, coachB.id);
    expect(updated).toBe(false);
  });

  it("allows the owning coach to revoke", async () => {
    const rows = await listClientDocuments(clientA.id);
    const assignmentId = rows.find((r) => r.documentId === docA)!.assignmentId;
    const revoked = await revokeAssignment(assignmentId, coachA.id);
    expect(revoked).toBe(true);

    const afterRevoke = await listClientDocuments(clientA.id);
    expect(afterRevoke.some((r) => r.assignmentId === assignmentId)).toBe(false);
  });

  it("listDocumentAssignments reflects the revoked assignment in history", async () => {
    const rows = await listDocumentAssignments(docA);
    const row = rows.find((r) => r.clientId === clientA.id);
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.clientName).toBeTruthy();
  });
});

describe("delete-vs-archive policy", () => {
  it("hard-deletes a document with zero assignment history", async () => {
    const freshDoc = await insertDocument(coachA.id, "Throwaway, never assigned");
    await deleteDocument(freshDoc);
    const rows = await listCoachDocuments(coachA.id);
    expect(rows.map((r) => r.id)).not.toContain(freshDoc);
  });

  it("refuses to hard-delete a document with assignment history", async () => {
    await expect(deleteDocument(docWithHistory)).rejects.toThrow();
  });

  it("archives successfully regardless of assignment history", async () => {
    await archiveDocument(docWithHistory);
    const rows = await listCoachDocuments(coachA.id);
    const row = rows.find((r) => r.id === docWithHistory);
    expect(row?.status).toBe("archived");
    expect(row?.archivedAt).not.toBeNull();
  });
});

describe("validateDocumentUpload — upload metadata validation (pure, no storage I/O)", () => {
  const base = {
    title: "Valid Title",
    category: "meal_plan",
    fileSizeBytes: 1024,
    mimeType: "application/pdf",
    filename: "plan.pdf",
  };

  it("accepts valid input", () => {
    expect(validateDocumentUpload(base).ok).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(validateDocumentUpload({ ...base, title: "   " }).ok).toBe(false);
  });

  it("rejects an invalid category", () => {
    expect(validateDocumentUpload({ ...base, category: "not_a_real_category" }).ok).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    expect(validateDocumentUpload({ ...base, fileSizeBytes: 0 }).ok).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    expect(validateDocumentUpload({ ...base, fileSizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1 }).ok).toBe(false);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validateDocumentUpload({ ...base, fileSizeBytes: MAX_DOCUMENT_SIZE_BYTES }).ok).toBe(true);
  });

  it("rejects a disallowed MIME type", () => {
    expect(validateDocumentUpload({ ...base, mimeType: "application/x-msdownload" }).ok).toBe(false);
  });

  it("rejects a missing filename", () => {
    expect(validateDocumentUpload({ ...base, filename: "" }).ok).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips unsafe characters and collapses repeats", () => {
    expect(sanitizeFilename("my plan (final)!!.pdf")).toBe("my-plan-final-.pdf");
  });

  it("falls back to a safe default for an empty/fully-stripped name", () => {
    expect(sanitizeFilename("???")).toBe("file");
  });
});
