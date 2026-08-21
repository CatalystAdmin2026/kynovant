import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, timelineEvents } from "../schema";
import { weeklyCheckIns, clientCheckInSchedule } from "../schema-check-in";
import { checkInPhotos } from "../schema-check-in-photos";
import { setClientSchedule, setPhotoPolicy } from "../check-in-schedule-service";
import { uploadCheckInPhoto } from "../check-in-photo-service";
import { submitCheckIn } from "../check-in-service";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

function nextOrSameWeekday(weekday: number, fromDate: string): string {
  const d = new Date(`${fromDate}T00:00:00Z`);
  const delta = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}
function weekStartForDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split("T")[0];
}

const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("INDEPENDENT REVIEW — a photo uploaded to one occurrence can never satisfy a DIFFERENT occurrence's requirement", () => {
  const db = getDb();
  const supabase = createAdminClient();
  let client: { id: string };
  let capturedError: unknown = null;
  const today = new Date().toISOString().split("T")[0];
  const checkInIds: string[] = [];

  beforeAll(async () => {
    try {
      const { data } = await supabase.auth.admin.createUser({
        email: `review-crossocc-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
        email_confirm: true,
      });
      client = { id: data!.user!.id };
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
      await db.insert(clientProfiles).values({ userId: client.id, fullName: "Review CrossOcc Client", timezone: "America/Chicago" });
      // Wed=3 Optional, Sun=0 Required[Front,Side,Back]
      await setClientSchedule(client.id, [3, 0]);
      await setPhotoPolicy(client.id, 3, { requirement: "optional", requireFront: true, requireSide: true, requireBack: true });
      await setPhotoPolicy(client.id, 0, { requirement: "required", requireFront: true, requireSide: true, requireBack: true });
    } catch (err) {
      capturedError = err;
    }
  });

  afterAll(async () => {
    let firstError: unknown = capturedError;
    try {
      if (checkInIds.length) await db.delete(checkInPhotos).where(inArray(checkInPhotos.checkInId, checkInIds));
      if (checkInIds.length) await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.id, checkInIds));
      if (client?.id) await db.delete(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
      if (client?.id) await db.delete(timelineEvents).where(eq(timelineEvents.clientId, client.id));
      if (client?.id) await db.delete(clientProfiles).where(eq(clientProfiles.userId, client.id));
      if (client?.id) await db.delete(users).where(eq(users.id, client.id));
    } catch (err) {
      if (!firstError) firstError = err;
    }
    if (client?.id) await supabase.auth.admin.deleteUser(client.id);
    if (firstError) throw firstError;
  });

  it("uploading Front+Side+Back to a Wednesday occurrence does NOT satisfy a same-week Sunday occurrence's requirement", async () => {
    const wed = nextOrSameWeekday(3, today);
    const sun = nextOrSameWeekday(0, today);

    const [wedRow] = await db.insert(weeklyCheckIns).values({ clientId: client.id, scheduledDate: wed, weekStartDate: weekStartForDate(wed), status: "draft" }).returning({ id: weeklyCheckIns.id });
    const [sunRow] = await db.insert(weeklyCheckIns).values({ clientId: client.id, scheduledDate: sun, weekStartDate: weekStartForDate(sun), status: "draft" }).returning({ id: weeklyCheckIns.id });
    checkInIds.push(wedRow.id, sunRow.id);

    // Upload the FULL required set to Wednesday's occurrence (which
    // only requires Optional — these uploads are legitimate but not
    // load-bearing for Wednesday's own submission).
    await uploadCheckInPhoto(client.id, wedRow.id, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, wedRow.id, "side", { bytes: validPng, filename: "s.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, wedRow.id, "back", { bytes: validPng, filename: "b.png", mimeType: "image/png", sizeBytes: validPng.length });

    // Sunday's occurrence has ZERO photos of its own — submitting it
    // must fail, even though the client's ACCOUNT has a full
    // front+side+back set sitting on a different occurrence this same
    // week.
    const sunResult = await submitCheckIn(client.id, sunRow.id);
    expect(sunResult.ok).toBe(false);

    // Wednesday's own submission (Optional, no photos required) still
    // succeeds independently.
    const wedResult = await submitCheckIn(client.id, wedRow.id);
    expect(wedResult.ok).toBe(true);
  });
});
