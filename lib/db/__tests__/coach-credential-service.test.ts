// ─────────────────────────────────────────────────────────────
// Coach RD/RDN credentials — service-layer + tenant-isolation suite
//
// Proves, against a REAL database connection (same rationale as
// document-tenant-isolation.test.ts / nutrition-target-service.test.ts):
//
//   1. Pure validation (validateCredentialSubmission, isExpired) —
//      no DB, no I/O.
//   2. submitCredential's full state machine: new submission, blocked
//      while pending, blocked while approved-and-unexpired, allowed
//      as resubmission after rejection, allowed as renewal after
//      expiration — and that resubmission clears the prior review
//      decision.
//   3. reviewCredential sets status/reviewedBy/reviewedAt/reviewNotes
//      correctly and only from the values the caller (an already
//      admin-authorized action) explicitly passes — see
//      lib/auth/__tests__/rd-credential-gate.test.ts for the
//      source-level proof that reviewedBy can never be
//      client-supplied.
//   4. Cross-coach isolation: getMyCredential/submitCredential/
//      generateCoachCredentialProofUrl are all keyed by coachId with
//      a parameterized WHERE clause — a coachId that owns no row
//      structurally cannot observe or mutate another coach's row.
//
// uploadCredentialProof() (real Supabase Storage I/O) is NOT
// exercised here — the "coach-credentials" bucket is a separate,
// not-yet-provisioned piece of infrastructure (see
// scripts/setup-coach-credentials-bucket.ts), exactly the same
// scoping decision document-tenant-isolation.test.ts makes for
// "coaching-documents". Every test below constructs an UploadedProof
// object directly and calls submitCredential(), which is the actual
// Postgres-side contract this suite is proving.
//
// Requires a reachable DATABASE_URL. Fixture rows use randomUUID()-based
// emails so repeated runs never collide; every row this file creates
// is deleted in afterAll().
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachCredentials } from "../schema-coach-credentials";
import {
  validateCredentialSubmission,
  isExpired,
  submitCredential,
  getMyCredential,
  reviewCredential,
  getCredentialById,
  generateCoachCredentialProofUrl,
  MAX_PROOF_DOCUMENT_SIZE_BYTES,
  type UploadedProof,
} from "../coach-credential-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const admin = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: `credential-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

function fakeProof(): UploadedProof {
  return {
    storageKey: `fixture/${randomUUID()}-license.pdf`,
    filename: "license.pdf",
    mimeType: "application/pdf",
  };
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

beforeAll(async () => {
  [coachA.id, coachB.id, admin.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("admin"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "admin", status: "active" }).where(eq(users.id, admin.id)),
  ]);
});

afterAll(async () => {
  const userIds = [coachA.id, coachB.id, admin.id].filter(Boolean);
  await db.delete(coachCredentials).where(inArray(coachCredentials.coachId, [coachA.id, coachB.id].filter(Boolean)));
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const supa = createAdminClient();
    await Promise.all(userIds.map((id) => supa.auth.admin.deleteUser(id)));
  }
});

// ─────────────────────────────────────────────────────────────

describe("validateCredentialSubmission — pure, no I/O", () => {
  const validInput = {
    credentialType: "rd",
    licenseNumber: "RD123456",
    issuingState: "Texas",
    expirationDate: futureDate(365),
  };
  const validFile = { filename: "license.pdf", mimeType: "application/pdf", sizeBytes: 1024 };

  it("accepts a valid submission", () => {
    expect(validateCredentialSubmission(validInput, validFile).ok).toBe(true);
  });

  it("rejects an invalid credential type", () => {
    expect(validateCredentialSubmission({ ...validInput, credentialType: "md" }, validFile).ok).toBe(false);
  });

  it("rejects a blank license number", () => {
    expect(validateCredentialSubmission({ ...validInput, licenseNumber: "   " }, validFile).ok).toBe(false);
  });

  it("rejects a blank issuing state", () => {
    expect(validateCredentialSubmission({ ...validInput, issuingState: "" }, validFile).ok).toBe(false);
  });

  it("rejects a malformed expiration date", () => {
    expect(validateCredentialSubmission({ ...validInput, expirationDate: "not-a-date" }, validFile).ok).toBe(false);
  });

  it("rejects a missing file", () => {
    expect(validateCredentialSubmission(validInput, { ...validFile, filename: "" }).ok).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    expect(validateCredentialSubmission(validInput, { ...validFile, sizeBytes: 0 }).ok).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    expect(
      validateCredentialSubmission(validInput, { ...validFile, sizeBytes: MAX_PROOF_DOCUMENT_SIZE_BYTES + 1 }).ok,
    ).toBe(false);
  });

  it("rejects a disallowed MIME type", () => {
    expect(validateCredentialSubmission(validInput, { ...validFile, mimeType: "application/zip" }).ok).toBe(false);
  });
});

describe("isExpired — pure date comparison", () => {
  it("is false for a future date", () => {
    expect(isExpired(futureDate(30))).toBe(false);
  });

  it("is true for a past date", () => {
    expect(isExpired("2000-01-01")).toBe(true);
  });

  it("respects an injected 'asOf' date for deterministic testing", () => {
    expect(isExpired("2025-06-15", new Date("2025-06-16T00:00:00Z"))).toBe(true);
    expect(isExpired("2025-06-15", new Date("2025-06-14T00:00:00Z"))).toBe(false);
  });
});

describe("submitCredential — state machine", () => {
  it("creates a new pending row when none exists", async () => {
    const result = await submitCredential(
      coachA.id,
      { credentialType: "rd", licenseNumber: "RD-A-1", issuingState: "Texas", expirationDate: futureDate(365) },
      fakeProof(),
    );
    expect(result.ok).toBe(true);

    const mine = await getMyCredential(coachA.id);
    expect(mine?.status).toBe("pending");
    expect(mine?.resubmissionCount).toBe(0);
  });

  it("refuses a second submission while the existing one is pending", async () => {
    const result = await submitCredential(
      coachA.id,
      { credentialType: "rd", licenseNumber: "RD-A-2", issuingState: "Texas", expirationDate: futureDate(365) },
      fakeProof(),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a new submission while approved and unexpired", async () => {
    const mine = await getMyCredential(coachA.id);
    await reviewCredential(mine!.id, admin.id, "approved", "Looks good.");

    const result = await submitCredential(
      coachA.id,
      { credentialType: "rd", licenseNumber: "RD-A-3", issuingState: "Texas", expirationDate: futureDate(365) },
      fakeProof(),
    );
    expect(result.ok).toBe(false);
  });

  it("allows resubmission (updates the SAME row) after rejection, incrementing resubmissionCount and clearing the prior review", async () => {
    // Move coachA back to rejected for this test.
    const mine = await getMyCredential(coachA.id);
    await reviewCredential(mine!.id, admin.id, "rejected", "Illegible document.");

    const result = await submitCredential(
      coachA.id,
      { credentialType: "rdn", licenseNumber: "RD-A-RESUB", issuingState: "Oregon", expirationDate: futureDate(400) },
      fakeProof(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.credentialId).toBe(mine!.id); // same row, not a new one

    const updated = await getMyCredential(coachA.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.resubmissionCount).toBe(1);
    expect(updated?.licenseNumber).toBe("RD-A-RESUB");
    expect(updated?.reviewNotes).toBeNull();
    expect(updated?.reviewedBy).toBeNull();
    expect(updated?.reviewedAt).toBeNull();
  });

  it("allows renewal (same row) when the existing approved credential has expired", async () => {
    const mine = await getMyCredential(coachA.id);
    await reviewCredential(mine!.id, admin.id, "approved", null);
    // Force it into the past directly — simulates time passing without
    // waiting a real year in a test.
    await db.update(coachCredentials).set({ expirationDate: "2000-01-01" }).where(eq(coachCredentials.id, mine!.id));

    const result = await submitCredential(
      coachA.id,
      { credentialType: "rd", licenseNumber: "RD-A-RENEWED", issuingState: "Texas", expirationDate: futureDate(365) },
      fakeProof(),
    );
    expect(result.ok).toBe(true);

    const renewed = await getMyCredential(coachA.id);
    expect(renewed?.status).toBe("pending");
    expect(renewed?.resubmissionCount).toBe(2);
  });
});

describe("reviewCredential", () => {
  it("sets status, reviewedBy, reviewedAt, and reviewNotes exactly as passed", async () => {
    const submitted = await submitCredential(
      coachB.id,
      { credentialType: "rdn", licenseNumber: "RD-B-1", issuingState: "Nevada", expirationDate: futureDate(200) },
      fakeProof(),
    );
    if (!submitted.ok) throw new Error("fixture setup failed");

    const result = await reviewCredential(submitted.credentialId, admin.id, "rejected", "Number doesn't match state registry.");
    expect(result.ok).toBe(true);

    const row = await getCredentialById(submitted.credentialId);
    expect(row?.status).toBe("rejected");
    expect(row?.reviewedBy).toBe(admin.id);
    expect(row?.reviewedAt).not.toBeNull();
    expect(row?.reviewNotes).toBe("Number doesn't match state registry.");
  });

  it("returns ok:false for a nonexistent credential id", async () => {
    const result = await reviewCredential(randomUUID(), admin.id, "approved", null);
    expect(result.ok).toBe(false);
  });
});

describe("cross-coach isolation", () => {
  it("getMyCredential never returns another coach's row", async () => {
    const asA = await getMyCredential(coachA.id);
    const asB = await getMyCredential(coachB.id);
    expect(asA?.coachId).toBe(coachA.id);
    expect(asB?.coachId).toBe(coachB.id);
    expect(asA?.id).not.toBe(asB?.id);
  });

  it("generateCoachCredentialProofUrl returns null for a coachId with no credential on file — cannot be pointed at another coach's document", async () => {
    const strangerCoachId = randomUUID(); // not a real user, and definitely owns nothing
    const url = await generateCoachCredentialProofUrl(strangerCoachId);
    expect(url).toBeNull();
  });

  it("one row per coach is enforced at the database level (unique index on coach_id)", async () => {
    await expect(
      db.insert(coachCredentials).values({
        coachId: coachA.id, // already has a row from the tests above
        credentialType: "rd",
        licenseNumber: "DUPLICATE-ATTEMPT",
        issuingState: "Texas",
        expirationDate: futureDate(365),
        proofDocumentStorageKey: "fixture/duplicate.pdf",
        proofDocumentFilename: "duplicate.pdf",
        proofDocumentMimeType: "application/pdf",
      }),
    ).rejects.toThrow();
  });
});
