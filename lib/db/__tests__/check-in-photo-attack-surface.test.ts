import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { weeklyCheckIns } from "../schema-check-in";
import { checkInPhotos } from "../schema-check-in-photos";
import {
  uploadCheckInPhoto,
  deleteCheckInPhoto,
  listCheckInPhotosForClient,
} from "../check-in-photo-service";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("INDEPENDENT REVIEW — attack surface", () => {
  const db = getDb();
  const supabase = createAdminClient();
  let client: { id: string };
  let checkInId: string;
  let capturedError: unknown = null;
  const today = new Date().toISOString().split("T")[0];

  beforeAll(async () => {
    try {
      const { data } = await supabase.auth.admin.createUser({
        email: `review-attack-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
        email_confirm: true,
      });
      client = { id: data!.user!.id };
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
      await db.insert(clientProfiles).values({ userId: client.id, fullName: "Review Attack Client", timezone: "America/Chicago" });
      const [row] = await db
        .insert(weeklyCheckIns)
        .values({ clientId: client.id, scheduledDate: today, weekStartDate: today, status: "draft" })
        .returning({ id: weeklyCheckIns.id });
      checkInId = row.id;
    } catch (err) {
      capturedError = err;
    }
  });

  afterAll(async () => {
    let firstError: unknown = capturedError;
    try {
      if (checkInId) await db.delete(checkInPhotos).where(eq(checkInPhotos.checkInId, checkInId));
      if (checkInId) await db.delete(weeklyCheckIns).where(eq(weeklyCheckIns.id, checkInId));
      if (client?.id) await db.delete(clientProfiles).where(eq(clientProfiles.userId, client.id));
      if (client?.id) await db.delete(users).where(eq(users.id, client.id));
    } catch (err) {
      if (!firstError) firstError = err;
    }
    if (client?.id) await supabase.auth.admin.deleteUser(client.id);
    if (firstError) throw firstError;
  });

  it("ATTACK: path-traversal filename is sanitized out of the storage path", async () => {
    const result = await uploadCheckInPhoto(client.id, checkInId, "front", {
      bytes: validPng,
      filename: "../../../../etc/passwd.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select({ storagePath: checkInPhotos.storagePath }).from(checkInPhotos).where(eq(checkInPhotos.id, result.photo.id));
    // The REAL security property: no "/" survives sanitization (only
    // "-" does), so "../../.." can appear as a literal, inert
    // substring but can never be interpreted as a directory-traversal
    // segment — there's no slash left to bound it. The full path must
    // still be scoped under this client's own id.
    expect(row.storagePath).not.toContain("/etc/");
    expect((row.storagePath.match(/\//g) ?? []).length).toBe(2); // exactly clientId/checkInId/filename — no extra segments
    expect(row.storagePath.startsWith(`${client.id}/${checkInId}/`)).toBe(true);
  });

  it("ATTACK: null-byte / directory-separator filename is sanitized", async () => {
    const result = await uploadCheckInPhoto(client.id, checkInId, "side", {
      bytes: validPng,
      filename: "evil/../../name\0.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db
      .select({ storagePath: checkInPhotos.storagePath, originalFilename: checkInPhotos.originalFilename })
      .from(checkInPhotos)
      .where(eq(checkInPhotos.id, result.photo.id));
    expect(row.storagePath).not.toContain("\0");
    expect(row.originalFilename).not.toContain("\0"); // fixed during this review — see check-in-photo-service.ts's stripControlChars
    expect((row.storagePath.match(/\//g) ?? []).length).toBe(2);
  });

  it("ATTACK: deleted photo is excluded from the client's own listing (soft-delete honored)", async () => {
    const upload = await uploadCheckInPhoto(client.id, checkInId, "back", {
      bytes: validPng,
      filename: "back.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    const del = await deleteCheckInPhoto(client.id, upload.photo.id);
    expect(del.ok).toBe(true);

    const listing = await listCheckInPhotosForClient(client.id, checkInId);
    expect(listing!.some((p) => p.id === upload.photo.id)).toBe(false);

    // Attempting to delete the ALREADY-deleted photo again must not
    // succeed (it's no longer a live, active row).
    const redelete = await deleteCheckInPhoto(client.id, upload.photo.id);
    expect(redelete.ok).toBe(false);
  });

  it("ATTACK: mismatched MIME/extension (JPEG bytes claiming .png) still passes filename sanitization but is caught by signature check upstream", async () => {
    // JPEG magic bytes claimed as image/png — validatePhotoFileSignature
    // (called inside uploadCheckInPhoto before Storage/DB writes) must
    // reject this regardless of the filename's own extension.
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0]);
    const result = await uploadCheckInPhoto(client.id, checkInId, "other", {
      bytes: jpegBytes,
      filename: "fake.png",
      mimeType: "image/png",
      sizeBytes: jpegBytes.length,
    });
    expect(result.ok).toBe(false);
  });

  it("ATTACK: empty-string category is rejected, not silently coerced", async () => {
    const result = await uploadCheckInPhoto(client.id, checkInId, "", {
      bytes: validPng,
      filename: "x.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(result.ok).toBe(false);
  });
});
