// ─────────────────────────────────────────────────────────────
// Coach RD/RDN credentials — service-layer + tenant-isolation suite
//
// Proves, against a REAL database connection (same rationale as
// document-tenant-isolation.test.ts / nutrition-target-service.test.ts):
//
//   1. Pure validation (validateCredentialSubmission, isExpired,
//      validateFileSignature) — no DB, no I/O.
//   2. submitCredential's full state machine: new submission, blocked
//      while pending, blocked while approved-and-unexpired, allowed
//      as resubmission after rejection, allowed as renewal after
//      expiration — and that resubmission clears the prior review
//      decision FROM THE CURRENT ROW while it remains durably readable
//      via coach_credential_reviews (the append-only history table —
//      see schema-coach-credentials.ts / ADR-015 for why the split
//      exists: an earlier version of this schema had no history table
//      at all, and this exact resubmission path provably erased the
//      prior reviewer/decision/notes with no way to recover them).
//   3. reviewCredential sets status/reviewedBy/reviewedAt/reviewNotes
//      correctly and only from the values the caller (an already
//      admin-authorized action) explicitly passes — see
//      lib/auth/__tests__/rd-credential-gate.test.ts for the
//      source-level proof that reviewedBy can never be
//      client-supplied. Also proves the runtime decision guard (not
//      just a TypeScript type) rejects a decision value outside
//      {"approved","rejected"} without mutating the row — a Server
//      Action's TS parameter type is not enforced against a caller
//      invoking it directly with an arbitrary string.
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
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { coachCredentials, coachCredentialReviews } from "../schema-coach-credentials";
import {
  validateCredentialSubmission,
  validateFileSignature,
  isExpired,
  submitCredential,
  getMyCredential,
  reviewCredential,
  getCredentialById,
  getCredentialReviewHistory,
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

// ROBUSTNESS (fixed here — see the incident this replaced): every
// cleanup step below is now independently attempted, regardless of
// whether an earlier step failed. The previous version awaited the
// coachCredentialReviews/coachCredentials deletes UNWRAPPED as the
// first statements in this hook; any error there (in practice: those
// tables not existing yet, before migration 0028 was applied — but
// equally true of any future transient DB error) aborted the rest of
// the function immediately, so the `users` row and the real Supabase
// Auth user created in beforeAll were NEVER deleted. Confirmed in
// production: this exact bug left dozens of orphaned
// @isolation-test.invalid coach/admin fixtures behind across this
// suite's own repeated runs before the migration existed.
//
// Fix shape: try/catch around each phase (never letting one phase's
// exception skip a later phase), Promise.allSettled instead of
// Promise.all for the per-user Auth deletions (so one user's Auth
// failure doesn't prevent attempting the others), and a captured
// FIRST error that is deliberately rethrown only at the very end —
// after every cleanup phase has already run — so a real failure is
// never silently swallowed, but also never blocks identity cleanup
// from being attempted.
afterAll(async () => {
  const userIds = [coachA.id, coachB.id, admin.id].filter(Boolean);
  let firstError: unknown;

  try {
    // Children before parents (FK restrict): review-history events
    // before their coach_credentials row.
    await db.delete(coachCredentialReviews).where(
      inArray(coachCredentialReviews.coachId, [coachA.id, coachB.id].filter(Boolean)),
    );
    await db.delete(coachCredentials).where(
      inArray(coachCredentials.coachId, [coachA.id, coachB.id].filter(Boolean)),
    );
  } catch (err) {
    firstError = firstError ?? err;
  }

  if (userIds.length > 0) {
    try {
      await db.delete(users).where(inArray(users.id, userIds));
    } catch (err) {
      firstError = firstError ?? err;
    }

    const supa = createAdminClient();
    const results = await Promise.allSettled(userIds.map((id) => supa.auth.admin.deleteUser(id)));
    for (const result of results) {
      if (result.status === "rejected") firstError = firstError ?? result.reason;
    }
  }

  if (firstError) throw firstError;
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

describe("validateFileSignature — pure, no I/O (closes the mislabeled-upload gap)", () => {
  // validateCredentialSubmission only checks the CLAIMED mimeType; a
  // caller controls that value freely (it's the browser's File.type,
  // or whatever a raw multipart client sends). validateFileSignature
  // checks the real bytes.
  const realPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
  const realPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const realJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const realWebpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]); // "RIFF????WEBP"
  const htmlPayloadBytes = new TextEncoder().encode("<html><script>alert(1)</script></html>");

  it("accepts real PDF bytes declared as application/pdf", () => {
    expect(validateFileSignature(realPdfBytes, "application/pdf").ok).toBe(true);
  });

  it("accepts real PNG bytes declared as image/png", () => {
    expect(validateFileSignature(realPngBytes, "image/png").ok).toBe(true);
  });

  it("accepts real JPEG bytes declared as image/jpeg", () => {
    expect(validateFileSignature(realJpegBytes, "image/jpeg").ok).toBe(true);
  });

  it("accepts real WebP bytes declared as image/webp", () => {
    expect(validateFileSignature(realWebpBytes, "image/webp").ok).toBe(true);
  });

  it("rejects an HTML/script payload disguised as application/pdf", () => {
    expect(validateFileSignature(htmlPayloadBytes, "application/pdf").ok).toBe(false);
  });

  it("rejects an HTML/script payload disguised as image/png — the exact attack this check exists for: a malicious upload later served straight into an admin's browser session", () => {
    expect(validateFileSignature(htmlPayloadBytes, "image/png").ok).toBe(false);
  });

  it("rejects real PNG bytes mislabeled as application/pdf (cross-type mismatch, not just non-image content)", () => {
    expect(validateFileSignature(realPngBytes, "application/pdf").ok).toBe(false);
  });

  it("rejects a claimed MIME type outside the four allowed types, even if a check for it existed", () => {
    expect(validateFileSignature(realPdfBytes, "application/zip").ok).toBe(false);
  });

  it("rejects empty bytes for every allowed type", () => {
    const empty = new Uint8Array(0);
    for (const type of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      expect(validateFileSignature(empty, type).ok).toBe(false);
    }
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
    // Automation-readiness fields reset alongside the review decision —
    // a resubmitted credential has no current verification until
    // reviewed again.
    expect(updated?.verificationMethod).toBeNull();
    expect(updated?.lastVerifiedAt).toBeNull();

    // THE ACTUAL FIX: the prior rejection is gone from the current row
    // (asserted above) but NOT gone from the database — it survives in
    // coach_credential_reviews. This is the concrete proof for
    // ADR-015's "does the one-row-upsert design destroy evidence"
    // question: it does not, because this history exists.
    const history = await getCredentialReviewHistory(coachA.id);
    const priorRejection = history.find((h) => h.action === "rejected");
    expect(priorRejection).toBeDefined();
    expect(priorRejection?.notes).toBe("Illegible document.");
    expect(priorRejection?.performedBy).toBe(admin.id);
    expect(priorRejection?.performedByType).toBe("human");
    // And the resubmission itself is also logged.
    const submittedEvents = history.filter((h) => h.action === "submitted");
    expect(submittedEvents.length).toBeGreaterThanOrEqual(2); // original submit + this resubmit
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

  it("approval sets verificationMethod='manual_review' and lastVerifiedAt; rejection leaves both null", async () => {
    const submitted = await submitCredential(
      coachB.id,
      { credentialType: "rd", licenseNumber: "RD-B-AUTOFIELDS", issuingState: "Nevada", expirationDate: futureDate(200) },
      fakeProof(),
    );
    if (!submitted.ok) throw new Error("fixture setup failed");

    await reviewCredential(submitted.credentialId, admin.id, "approved", "Confirmed.");
    const approvedRow = await getCredentialById(submitted.credentialId);
    expect(approvedRow?.verificationMethod).toBe("manual_review");
    expect(approvedRow?.lastVerifiedAt).not.toBeNull();

    // Re-submit then reject — verificationMethod/lastVerifiedAt must
    // not carry over from the earlier approval.
    await db.update(coachCredentials).set({ expirationDate: "2000-01-01" }).where(eq(coachCredentials.id, submitted.credentialId));
    await submitCredential(
      coachB.id,
      { credentialType: "rd", licenseNumber: "RD-B-AUTOFIELDS-2", issuingState: "Nevada", expirationDate: futureDate(200) },
      fakeProof(),
    );
    await reviewCredential(submitted.credentialId, admin.id, "rejected", "Renewal illegible.");
    const rejectedRow = await getCredentialById(submitted.credentialId);
    expect(rejectedRow?.verificationMethod).toBeNull();
    expect(rejectedRow?.lastVerifiedAt).toBeNull();
  });

  it("every submission and every review decision writes a coach_credential_reviews event, correctly attributed", async () => {
    const submitted = await submitCredential(
      coachB.id,
      { credentialType: "rdn", licenseNumber: "RD-B-HIST", issuingState: "Nevada", expirationDate: futureDate(200) },
      fakeProof(),
    );
    if (!submitted.ok) throw new Error("fixture setup failed");
    await reviewCredential(submitted.credentialId, admin.id, "approved", "Looks good.");

    const history = await getCredentialReviewHistory(coachB.id);
    const submittedEvent = history.find(
      (h) => h.credentialId === submitted.credentialId && h.action === "submitted",
    );
    const approvedEvent = history.find(
      (h) => h.credentialId === submitted.credentialId && h.action === "approved",
    );
    expect(submittedEvent).toBeDefined();
    expect(submittedEvent?.performedBy).toBe(coachB.id);
    expect(submittedEvent?.performedByType).toBe("human");
    expect(approvedEvent).toBeDefined();
    expect(approvedEvent?.performedBy).toBe(admin.id);
    expect(approvedEvent?.performedByType).toBe("human");
    expect(approvedEvent?.verificationMethod).toBe("manual_review");
    expect(approvedEvent?.notes).toBe("Looks good.");
  });

  it("runtime-rejects a decision value outside {approved, rejected} — defense-in-depth beyond the TS type, since a Server Action's type is not enforced against a direct invocation with an arbitrary string", async () => {
    const submitted = await submitCredential(
      coachA.id,
      { credentialType: "rd", licenseNumber: "RD-A-DECISION-GUARD", issuingState: "Texas", expirationDate: futureDate(365) },
      fakeProof(),
    );
    // coachA may already have a row from earlier tests in this file
    // (submitCredential returns ok:false in that case) — either way,
    // resolve a real credentialId to attack.
    const target = submitted.ok ? submitted.credentialId : (await getMyCredential(coachA.id))!.id;
    const before = await getCredentialById(target);

    // Bypasses the TS union type deliberately, as a direct/tampered
    // call to the Server Action's underlying endpoint would.
    const result = await reviewCredential(
      target,
      admin.id,
      "pending" as unknown as "approved",
      "should never apply",
    );
    expect(result.ok).toBe(false);

    const after = await getCredentialById(target);
    expect(after?.status).toBe(before?.status); // unchanged — no mutation occurred
    expect(after?.reviewNotes).toBe(before?.reviewNotes);
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

  it("getCredentialReviewHistory never returns another coach's events", async () => {
    const historyA = await getCredentialReviewHistory(coachA.id);
    const historyB = await getCredentialReviewHistory(coachB.id);
    expect(historyA.every((h) => h.coachId === coachA.id)).toBe(true);
    expect(historyB.every((h) => h.coachId === coachB.id)).toBe(true);
  });

  it("coach_credential_reviews is append-only in practice — no UPDATE/DELETE path exists anywhere in coach-credential-service.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "lib/db/coach-credential-service.ts"), "utf8");
    expect(source).not.toMatch(/\.update\(coachCredentialReviews\)/);
    expect(source).not.toMatch(/\.delete\(coachCredentialReviews\)/);
  });
});

describe("coach_credentials / coach_credential_reviews — RLS policy presence (introspection; service-role connection bypasses RLS by design, same caveat as nutrition-target-service.test.ts)", () => {
  it("coach_credentials has row-level security enabled with the owner-select policy", async () => {
    const rlsRows = await db.execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'coach_credentials'`,
    );
    expect(rlsRows[0]?.relrowsecurity).toBe(true);

    const policyRows = await db.execute<{ policyname: string; cmd: string; qual: string | null }>(
      sql`select policyname, cmd, qual from pg_policies where tablename = 'coach_credentials'`,
    );
    const policy = policyRows.find((r) => r.policyname === "coach_credentials_owner_select");
    expect(policy).toBeTruthy();
    expect(policy?.cmd).toBe("SELECT");
    expect(policy?.qual).toContain("auth.uid()");
  });

  it("coach_credential_reviews has row-level security enabled with the owner-select policy", async () => {
    const rlsRows = await db.execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'coach_credential_reviews'`,
    );
    expect(rlsRows[0]?.relrowsecurity).toBe(true);

    const policyRows = await db.execute<{ policyname: string; cmd: string; qual: string | null }>(
      sql`select policyname, cmd, qual from pg_policies where tablename = 'coach_credential_reviews'`,
    );
    const policy = policyRows.find((r) => r.policyname === "coach_credential_reviews_owner_select");
    expect(policy).toBeTruthy();
    expect(policy?.cmd).toBe("SELECT");
    expect(policy?.qual).toContain("auth.uid()");
  });
});

describe("automation-readiness defaults", () => {
  it("manualReviewRequired defaults true on a fresh submission — every coach starts in the exception/manual queue until an automated verifier exists", async () => {
    const submitted = await submitCredential(
      coachB.id,
      { credentialType: "rd", licenseNumber: "RD-B-DEFAULTS", issuingState: "Nevada", expirationDate: futureDate(200) },
      fakeProof(),
    );
    // coachB may already have a row from an earlier test — either way,
    // read back whatever row is current and confirm the default.
    const mine = await getMyCredential(coachB.id);
    expect(mine?.manualReviewRequired).toBe(true);
    void submitted; // result not load-bearing for this assertion
  });
});

describe("afterAll cleanup — resilient to a failed credential-table delete (source-level, same technique as guard-shape tests elsewhere in this codebase)", () => {
  // Cannot practically re-invoke this file's own afterAll with a
  // forced-failing credential-table delete from inside a test (vitest
  // owns that hook's lifecycle) — the structural guarantee itself is
  // what's being proven, the same "read the source, assert on it"
  // technique used throughout this codebase for exactly this class of
  // guarantee (lib/auth/__tests__/coach-signup-security.test.ts,
  // rd-credential-gate.test.ts's own "gate wiring" describe block).
  it("wraps the coachCredentialReviews/coachCredentials deletes in their own try/catch, not awaited bare as the first statement", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "lib/db/__tests__/coach-credential-service.test.ts"), "utf8");

    const afterAllStart = source.indexOf("afterAll(async () => {");
    const afterAllBody = source.slice(afterAllStart);
    const tryIndex = afterAllBody.indexOf("try {");
    const deleteReviewsIndex = afterAllBody.indexOf("db.delete(coachCredentialReviews)");
    const catchIndex = afterAllBody.indexOf("} catch (err) {");

    expect(tryIndex).toBeGreaterThan(-1);
    expect(deleteReviewsIndex).toBeGreaterThan(tryIndex);
    expect(catchIndex).toBeGreaterThan(deleteReviewsIndex);
  });

  it("attempts users-row cleanup and Auth-user cleanup unconditionally — not nested inside the credential-table try block", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "lib/db/__tests__/coach-credential-service.test.ts"), "utf8");

    const afterAllStart = source.indexOf("afterAll(async () => {");
    const afterAllBody = source.slice(afterAllStart);
    const firstCatchEnd = afterAllBody.indexOf("}", afterAllBody.indexOf("firstError = firstError ?? err;")) + 1;
    const afterFirstCatch = afterAllBody.slice(firstCatchEnd);

    // users/Auth cleanup happens in code reachable after the first
    // try/catch has already run to completion (success or failure) —
    // not inside its try block, and not skipped by its catch.
    expect(afterFirstCatch).toContain("db.delete(users)");
    expect(afterFirstCatch).toContain("supa.auth.admin.deleteUser");
    expect(afterFirstCatch).toContain("Promise.allSettled");
  });

  it("rethrows any captured cleanup error only at the very end — after identity cleanup, never instead of it", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "lib/db/__tests__/coach-credential-service.test.ts"), "utf8");

    const afterAllStart = source.indexOf("afterAll(async () => {");
    const afterAllBody = source.slice(afterAllStart);
    const authDeleteIndex = afterAllBody.indexOf("supa.auth.admin.deleteUser");
    const rethrowIndex = afterAllBody.indexOf("if (firstError) throw firstError;");

    expect(rethrowIndex).toBeGreaterThan(-1);
    expect(rethrowIndex).toBeGreaterThan(authDeleteIndex);
  });
});
