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

describe("INDEPENDENT REVIEW — Required[Front] exact example (narrower-than-all-three at submission level)", () => {
  const db = getDb();
  const supabase = createAdminClient();
  let client: { id: string };
  let capturedError: unknown = null;
  const today = new Date().toISOString().split("T")[0];
  const checkInIds: string[] = [];

  beforeAll(async () => {
    try {
      const { data } = await supabase.auth.admin.createUser({
        email: `review-narrow-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
        email_confirm: true,
      });
      client = { id: data!.user!.id };
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
      await db.insert(clientProfiles).values({ userId: client.id, fullName: "Review Narrow Client", timezone: "America/Chicago" });
      await setClientSchedule(client.id, [0]);
      await setPhotoPolicy(client.id, 0, { requirement: "required", requireFront: true, requireSide: false, requireBack: false });
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

  const baseSunday = () => nextOrSameWeekday(0, today);

  it("Required[Front]: Side-only is rejected", async () => {
    const scheduledDate = baseSunday();
    const [row] = await db.insert(weeklyCheckIns).values({ clientId: client.id, scheduledDate, weekStartDate: weekStartForDate(scheduledDate), status: "draft" }).returning({ id: weeklyCheckIns.id });
    checkInIds.push(row.id);
    await uploadCheckInPhoto(client.id, row.id, "side", { bytes: validPng, filename: "s.png", mimeType: "image/png", sizeBytes: validPng.length });
    const result = await submitCheckIn(client.id, row.id);
    expect(result.ok).toBe(false);
  });

  it("Required[Front]: Front alone succeeds", async () => {
    const scheduledDate = nextOrSameWeekday(0, new Date(`${baseSunday()}T00:00:00Z`).toISOString().split("T")[0]);
    // 2nd Sunday to avoid colliding with the previous test's occurrence.
    const d = new Date(`${scheduledDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    const nextSunday = d.toISOString().split("T")[0];
    const [row] = await db.insert(weeklyCheckIns).values({ clientId: client.id, scheduledDate: nextSunday, weekStartDate: weekStartForDate(nextSunday), status: "draft" }).returning({ id: weeklyCheckIns.id });
    checkInIds.push(row.id);
    await uploadCheckInPhoto(client.id, row.id, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    const result = await submitCheckIn(client.id, row.id);
    expect(result.ok).toBe(true);
  });
});
