// ─────────────────────────────────────────────────────────────
// End-to-end server-side enforcement: submitCheckIn (check-in-
// service.ts) gates on the occurrence's own HISTORICALLY-resolved
// photo policy (check-in-schedule-service.ts's getPhotoPolicyAtDate),
// never "today's" live schedule state, and never trusts the Portal
// UI. This is the exact behavioral matrix requested for this
// integration: arbitrary weekday combinations, mixed policies, and
// proof that narrowing a future policy does not rewrite a past
// occurrence's actual requirement.
//
// DB-BACKED — run via `npm run test:staging` only.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, and, isNull, inArray } from "drizzle-orm";
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

function daysBefore(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

function weekStartForDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const delta = d.getUTCDay(); // Sunday-anchored week start, matches this schema's convention
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().split("T")[0];
}

const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("submitCheckIn — server-side photo requirement enforcement (historically resolved)", () => {
  const db = getDb();
  const supabase = createAdminClient();
  let client: { id: string };
  let capturedError: unknown = null;
  const today = new Date().toISOString().split("T")[0];
  const createdCheckInIds: string[] = [];

  beforeAll(async () => {
    try {
      const { data } = await supabase.auth.admin.createUser({
        email: `photo-submit-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
        email_confirm: true,
      });
      client = { id: data!.user!.id };
      // A DB trigger (on_auth_user_created) already inserted a
      // public.users row — update to the role this fixture needs
      // rather than inserting a second row (which would violate
      // users_pkey).
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
      await db.insert(clientProfiles).values({ userId: client.id, fullName: "Photo Submit Client", timezone: "America/Chicago" });

      // Wed=3 optional, Sun=0 required[front,side,back] — arbitrary
      // combination exercising both weekdays in the same week, per
      // this integration's own test matrix.
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
      // Dependency order matters — every row referencing client.id
      // (including timeline_events, written by submitCheckIn on
      // every successful submission in this suite) must be gone
      // before users can be deleted.
      if (createdCheckInIds.length) await db.delete(checkInPhotos).where(inArray(checkInPhotos.checkInId, createdCheckInIds));
      if (createdCheckInIds.length) await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.id, createdCheckInIds));
      if (client?.id) await db.delete(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
      if (client?.id) await db.delete(timelineEvents).where(eq(timelineEvents.clientId, client.id));
      if (client?.id) await db.delete(clientProfiles).where(eq(clientProfiles.userId, client.id));
      if (client?.id) await db.delete(users).where(eq(users.id, client.id));
    } catch (err) {
      if (!firstError) firstError = err;
    }
    const results = await Promise.allSettled([
      client?.id ? supabase.auth.admin.deleteUser(client.id) : Promise.resolve(),
    ]);
    for (const r of results) {
      if (r.status === "rejected" && !firstError) firstError = r.reason;
    }
    if (firstError) throw firstError;
  });

  async function makeDraft(scheduledDate: string): Promise<string> {
    const [row] = await db
      .insert(weeklyCheckIns)
      .values({ clientId: client.id, scheduledDate, weekStartDate: weekStartForDate(scheduledDate), status: "draft" })
      .returning({ id: weeklyCheckIns.id });
    createdCheckInIds.push(row.id);
    return row.id;
  }

  // Each test needing its own Sunday occurrence uses a DIFFERENT
  // Sunday (base + N weeks) — weekly_check_ins enforces one row per
  // (client, scheduled_date), so reusing the same date across
  // independent test cases would collide.
  const baseSunday = nextOrSameWeekday(0, today);
  function nthSundayAhead(n: number): string {
    const d = new Date(`${baseSunday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n * 7);
    return d.toISOString().split("T")[0];
  }

  it("Wednesday (Optional) submits successfully with zero photos", async () => {
    const checkInId = await makeDraft(nextOrSameWeekday(3, today));
    const result = await submitCheckIn(client.id, checkInId);
    expect(result.ok).toBe(true);
  });

  it("Sunday (Required[Front,Side,Back]) rejects with only Front", async () => {
    const checkInId = await makeDraft(nthSundayAhead(1));
    await uploadCheckInPhoto(client.id, checkInId, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    const result = await submitCheckIn(client.id, checkInId);
    expect(result.ok).toBe(false);
  });

  it("Sunday (Required[Front,Side,Back]) rejects with only Front+Side", async () => {
    const checkInId = await makeDraft(nthSundayAhead(2));
    await uploadCheckInPhoto(client.id, checkInId, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, checkInId, "side", { bytes: validPng, filename: "s.png", mimeType: "image/png", sizeBytes: validPng.length });
    const result = await submitCheckIn(client.id, checkInId);
    expect(result.ok).toBe(false);
  });

  it("Sunday (Required[Front,Side,Back]) succeeds with all three", async () => {
    const checkInId = await makeDraft(nthSundayAhead(3));
    await uploadCheckInPhoto(client.id, checkInId, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, checkInId, "side", { bytes: validPng, filename: "s.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, checkInId, "back", { bytes: validPng, filename: "b.png", mimeType: "image/png", sizeBytes: validPng.length });
    const result = await submitCheckIn(client.id, checkInId);
    expect(result.ok).toBe(true);
  });

  it("HISTORICAL TRUTH: narrowing Sunday's future requirement to Front-only does not relax a PAST draft occurrence still governed by the old Front+Side+Back policy", async () => {
    // A draft occurrence dated in the past, under a schedule row that
    // has genuinely been active since before that date (beforeAll's
    // own setPhotoPolicy call opened the row as of TODAY, which would
    // NOT actually cover a date 28 days ago — backdate it here so
    // this test exercises real historical coverage, not an
    // accidentally-unconfigured gap).
    const pastSunday = daysBefore(baseSunday, 28);
    await db
      .update(clientCheckInSchedule)
      .set({ effectiveFrom: daysBefore(pastSunday, 7) })
      .where(and(eq(clientCheckInSchedule.clientId, client.id), eq(clientCheckInSchedule.weekday, 0), isNull(clientCheckInSchedule.effectiveTo)));

    const checkInId = await makeDraft(pastSunday);

    // Coach narrows TODAY's (and all future) Sunday policy to Front-only.
    const narrow = await setPhotoPolicy(client.id, 0, { requirement: "required", requireFront: true, requireSide: false, requireBack: false });
    expect(narrow.ok).toBe(true);

    // The past draft, submitted NOW, must still be evaluated against
    // the policy that was actually in force on ITS OWN scheduledDate
    // — front alone is NOT enough for it, even though front alone
    // now satisfies a brand-new Sunday occurrence.
    await uploadCheckInPhoto(client.id, checkInId, "front", { bytes: validPng, filename: "f.png", mimeType: "image/png", sizeBytes: validPng.length });
    const stillRejected = await submitCheckIn(client.id, checkInId);
    expect(stillRejected.ok).toBe(false);

    await uploadCheckInPhoto(client.id, checkInId, "side", { bytes: validPng, filename: "s.png", mimeType: "image/png", sizeBytes: validPng.length });
    await uploadCheckInPhoto(client.id, checkInId, "back", { bytes: validPng, filename: "b.png", mimeType: "image/png", sizeBytes: validPng.length });
    const nowSucceeds = await submitCheckIn(client.id, checkInId);
    expect(nowSucceeds.ok).toBe(true);

    // A FRESH Sunday occurrence, dated today (under the new, narrowed
    // policy), succeeds with Front alone.
    const freshCheckInId = await makeDraft(nextOrSameWeekday(0, today));
    await uploadCheckInPhoto(client.id, freshCheckInId, "front", { bytes: validPng, filename: "f2.png", mimeType: "image/png", sizeBytes: validPng.length });
    const freshResult = await submitCheckIn(client.id, freshCheckInId);
    expect(freshResult.ok).toBe(true);
  });

  it("cross-client photo cannot satisfy another client's requirement (no forged occurrence reuse)", async () => {
    const { data: otherAuth } = await supabase.auth.admin.createUser({
      email: `photo-submit-other-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
      email_confirm: true,
    });
    const other = { id: otherAuth!.user!.id };
    await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, other.id));
    await db.insert(clientProfiles).values({ userId: other.id, fullName: "Other Client", timezone: "America/Chicago" });

    const checkInId = await makeDraft(nthSundayAhead(4));
    // Other client attempts to upload into this client's occurrence.
    const forgedUpload = await uploadCheckInPhoto(other.id, checkInId, "front", {
      bytes: validPng,
      filename: "forged.png",
      mimeType: "image/png",
      sizeBytes: validPng.length,
    });
    expect(forgedUpload.ok).toBe(false);

    // Other client also cannot submit on this client's behalf.
    const forgedSubmit = await submitCheckIn(other.id, checkInId);
    expect(forgedSubmit.ok).toBe(false);

    await db.delete(clientProfiles).where(eq(clientProfiles.userId, other.id));
    await db.delete(users).where(eq(users.id, other.id));
    await supabase.auth.admin.deleteUser(other.id);
  });
});
