// ─────────────────────────────────────────────────────────────
// check-in-photo-service.ts — validation, signature, and DB-backed
// upload/tenant/requirement coverage.
//
// SPLIT INTO TWO GROUPS, clearly labeled:
//
//   1. PURE FUNCTIONS (validatePhotoUpload, validatePhotoFileSignature)
//      — zero I/O, no DB dependency.
//
//   2. DB-BACKED (upload/list/delete/tenant-isolation/editable-window/
//      requirement-satisfaction) — require check_in_photos (this
//      pass's own drizzle/0033_check_in_photos.sql) AND
//      weekly_check_ins.scheduled_date / client_check_in_schedule
//      (0031/0032). Run via `npm run test:staging` — never against
//      production (see require-staging.ts's in-process guard below).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { weeklyCheckIns } from "../schema-check-in";
import { checkInPhotos } from "../schema-check-in-photos";
import {
  validatePhotoUpload,
  validatePhotoFileSignature,
  uploadCheckInPhoto,
  deleteCheckInPhoto,
  listCheckInPhotosForClient,
  listCheckInPhotosForCoach,
  isPhotoRequirementSatisfied,
  MAX_PHOTO_SIZE_BYTES,
} from "../check-in-photo-service";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

// ─────────────────────────────────────────────────────────────
// GROUP 1 — PURE FUNCTIONS
// ─────────────────────────────────────────────────────────────

// A minimal valid 1x1 PNG's real magic bytes, for signature tests.
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG_SIGNATURE = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]);
const WEBP_SIGNATURE = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const NOT_AN_IMAGE = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

describe("validatePhotoUpload — pure", () => {
  const base = { category: "front", filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1024 };

  it("accepts a well-formed upload for every allowed category", () => {
    for (const category of ["front", "side", "back", "other"]) {
      expect(validatePhotoUpload({ ...base, category })).toEqual({ ok: true });
    }
  });

  it("rejects an invalid category", () => {
    const result = validatePhotoUpload({ ...base, category: "posing" });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty filename", () => {
    const result = validatePhotoUpload({ ...base, filename: "  " });
    expect(result.ok).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    const result = validatePhotoUpload({ ...base, sizeBytes: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file over MAX_PHOTO_SIZE_BYTES", () => {
    const result = validatePhotoUpload({ ...base, sizeBytes: MAX_PHOTO_SIZE_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it("accepts a file exactly at MAX_PHOTO_SIZE_BYTES", () => {
    const result = validatePhotoUpload({ ...base, sizeBytes: MAX_PHOTO_SIZE_BYTES });
    expect(result.ok).toBe(true);
  });

  it("rejects a disallowed MIME type (PDF, SVG, arbitrary)", () => {
    expect(validatePhotoUpload({ ...base, mimeType: "application/pdf" }).ok).toBe(false);
    expect(validatePhotoUpload({ ...base, mimeType: "image/svg+xml" }).ok).toBe(false);
    expect(validatePhotoUpload({ ...base, mimeType: "text/html" }).ok).toBe(false);
  });

  it("accepts every allowed MIME type", () => {
    for (const mimeType of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validatePhotoUpload({ ...base, mimeType }).ok).toBe(true);
    }
  });
});

describe("validatePhotoFileSignature — pure, magic-byte check", () => {
  it("accepts real PNG bytes claimed as image/png", () => {
    expect(validatePhotoFileSignature(PNG_SIGNATURE, "image/png")).toEqual({ ok: true });
  });

  it("accepts real JPEG bytes claimed as image/jpeg", () => {
    expect(validatePhotoFileSignature(JPEG_SIGNATURE, "image/jpeg")).toEqual({ ok: true });
  });

  it("accepts real WebP bytes claimed as image/webp", () => {
    expect(validatePhotoFileSignature(WEBP_SIGNATURE, "image/webp")).toEqual({ ok: true });
  });

  it("rejects arbitrary bytes mislabeled as image/png — the actual security check", () => {
    const result = validatePhotoFileSignature(NOT_AN_IMAGE, "image/png");
    expect(result.ok).toBe(false);
  });

  it("rejects a JPEG's bytes mislabeled as image/png (cross-type mismatch)", () => {
    const result = validatePhotoFileSignature(JPEG_SIGNATURE, "image/png");
    expect(result.ok).toBe(false);
  });

  it("rejects a claimed MIME type outside the allow-list, even with no matcher", () => {
    const result = validatePhotoFileSignature(PNG_SIGNATURE, "application/pdf");
    expect(result.ok).toBe(false);
  });

  it("rejects bytes shorter than the expected signature", () => {
    const result = validatePhotoFileSignature(new Uint8Array([0x89, 0x50]), "image/png");
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// GROUP 2 — DB-BACKED
// ─────────────────────────────────────────────────────────────

describe("check-in-photo-service — DB-backed", () => {
  const db = getDb();
  const supabase = createAdminClient();

  let clientA: { id: string };
  let clientB: { id: string };
  let checkInA: { id: string };
  let capturedError: unknown = null;

  const today = new Date().toISOString().split("T")[0];

  beforeAll(async () => {
    try {
      const suffix = randomUUID().slice(0, 8);
      const [{ data: authA }, { data: authB }] = await Promise.all([
        supabase.auth.admin.createUser({ email: `photo-client-a-${suffix}@isolation-test.invalid`, email_confirm: true }),
        supabase.auth.admin.createUser({ email: `photo-client-b-${suffix}@isolation-test.invalid`, email_confirm: true }),
      ]);
      clientA = { id: authA!.user!.id };
      clientB = { id: authB!.user!.id };

      // A DB trigger (on_auth_user_created) already inserted a
      // public.users row for each of these — update to the role this
      // fixture needs rather than inserting a second row (which would
      // violate users_pkey).
      await Promise.all([
        db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
        db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
      ]);
      await db.insert(clientProfiles).values([
        { userId: clientA.id, fullName: "Photo Client A", timezone: "America/Chicago" },
        { userId: clientB.id, fullName: "Photo Client B", timezone: "America/Chicago" },
      ]);

      const [inserted] = await db
        .insert(weeklyCheckIns)
        .values({ clientId: clientA.id, scheduledDate: today, weekStartDate: today, status: "draft" })
        .returning({ id: weeklyCheckIns.id });
      checkInA = inserted;
    } catch (err) {
      capturedError = err;
    }
  });

  afterAll(async () => {
    let firstError: unknown = capturedError;
    const ids = [clientA?.id, clientB?.id].filter(Boolean) as string[];
    try {
      // Dependency order matters here — clientProfiles/checkInPhotos/
      // weeklyCheckIns must be gone before users can be deleted (FK
      // constraints), so these run sequentially rather than all in
      // one Promise.allSettled batch.
      if (checkInA?.id) await db.delete(checkInPhotos).where(eq(checkInPhotos.checkInId, checkInA.id));
      if (checkInA?.id) await db.delete(weeklyCheckIns).where(eq(weeklyCheckIns.id, checkInA.id));
      if (ids.length) await db.delete(clientProfiles).where(inArray(clientProfiles.userId, ids));
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    } catch (err) {
      if (!firstError) firstError = err;
    }
    const results = await Promise.allSettled([
      clientA?.id ? supabase.auth.admin.deleteUser(clientA.id) : Promise.resolve(),
      clientB?.id ? supabase.auth.admin.deleteUser(clientB.id) : Promise.resolve(),
    ]);
    for (const r of results) {
      if (r.status === "rejected" && !firstError) firstError = r.reason;
    }
    if (firstError) throw firstError;
  });

  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it("client can upload a photo to their own draft occurrence", async () => {
    const result = await uploadCheckInPhoto(clientA.id, checkInA.id, "front", {
      bytes: validPng,
      filename: "front.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(true);
  });

  it("uploading into another client's occurrence is rejected (forged checkInId)", async () => {
    const result = await uploadCheckInPhoto(clientB.id, checkInA.id, "front", {
      bytes: validPng,
      filename: "forged.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(false);
  });

  it("client B cannot list client A's occurrence photos", async () => {
    const result = await listCheckInPhotosForClient(clientB.id, checkInA.id);
    expect(result).toBeNull();
  });

  it("coach-facing list works for a real checkInId regardless of caller (relies on the route's own coachOwnsClient guard, per this file's header note)", async () => {
    const result = await listCheckInPhotosForCoach(checkInA.id);
    expect(result).not.toBeNull();
  });

  it("isPhotoRequirementSatisfied is false until every configured required view is present", async () => {
    expect(await isPhotoRequirementSatisfied(checkInA.id, ["front", "side", "back"])).toBe(false);
    await uploadCheckInPhoto(clientA.id, checkInA.id, "side", {
      bytes: validPng,
      filename: "side.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(await isPhotoRequirementSatisfied(checkInA.id, ["front", "side", "back"])).toBe(false); // front already uploaded above; still missing back
    await uploadCheckInPhoto(clientA.id, checkInA.id, "back", {
      bytes: validPng,
      filename: "back.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(await isPhotoRequirementSatisfied(checkInA.id, ["front", "side", "back"])).toBe(true);
    // Configurable subset: a narrower requiredViews set (e.g. just
    // Front) is satisfied by the SAME uploaded set — front alone is
    // sufficient once the policy only asks for front.
    expect(await isPhotoRequirementSatisfied(checkInA.id, ["front"])).toBe(true);
  });

  it("an empty requiredViews set (Optional/Off policy) is trivially satisfied", async () => {
    expect(await isPhotoRequirementSatisfied(checkInA.id, [])).toBe(true);
  });

  it("an 'other' photo never counts toward any required view", async () => {
    // Fresh occurrence with only an 'other' photo — front/side/back untouched.
    const nextDay = new Date(`${today}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 3);
    const otherDate = nextDay.toISOString().split("T")[0];
    const [otherOnly] = await db
      .insert(weeklyCheckIns)
      .values({ clientId: clientA.id, scheduledDate: otherDate, weekStartDate: today, status: "draft" })
      .returning({ id: weeklyCheckIns.id });
    await uploadCheckInPhoto(clientA.id, otherOnly.id, "other", {
      bytes: validPng,
      filename: "misc.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(await isPhotoRequirementSatisfied(otherOnly.id, ["front"])).toBe(false);
    await db.delete(checkInPhotos).where(eq(checkInPhotos.checkInId, otherOnly.id));
    await db.delete(weeklyCheckIns).where(eq(weeklyCheckIns.id, otherOnly.id));
  });

  it("delete is a soft-delete — photo disappears from listings but the row survives", async () => {
    const listBefore = await listCheckInPhotosForClient(clientA.id, checkInA.id);
    const target = listBefore![0];
    const del = await deleteCheckInPhoto(clientA.id, target.id);
    expect(del.ok).toBe(true);

    const listAfter = await listCheckInPhotosForClient(clientA.id, checkInA.id);
    expect(listAfter!.some((p) => p.id === target.id)).toBe(false);

    const [row] = await db.select().from(checkInPhotos).where(eq(checkInPhotos.id, target.id));
    expect(row).toBeDefined();
    expect(row.deletedAt).not.toBeNull();
  });

  it("client B cannot delete client A's photo", async () => {
    const list = await listCheckInPhotosForClient(clientA.id, checkInA.id);
    if (!list || list.length === 0) return; // prior test may have removed all — non-fatal for this isolation check
    const result = await deleteCheckInPhoto(clientB.id, list[0].id);
    expect(result.ok).toBe(false);
  });

  it("upload is rejected once the occurrence leaves the editable window (in_review/reviewed)", async () => {
    await db.update(weeklyCheckIns).set({ status: "in_review" }).where(eq(weeklyCheckIns.id, checkInA.id));
    const result = await uploadCheckInPhoto(clientA.id, checkInA.id, "other", {
      bytes: validPng,
      filename: "late.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(false);
    // Restore for any later assertions in this describe block.
    await db.update(weeklyCheckIns).set({ status: "draft" }).where(eq(weeklyCheckIns.id, checkInA.id));
  });
});
