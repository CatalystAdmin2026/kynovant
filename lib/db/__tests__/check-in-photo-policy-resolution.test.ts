// ─────────────────────────────────────────────────────────────
// getPhotoPolicyAtDate / setPhotoPolicy / getActivePhotoPolicies —
// historical truth (including which VIEWS were required, not just
// the required/optional/off level) and arbitrary-schedule-combination
// coverage.
//
// DB-BACKED — requires drizzle/0031_client_check_in_schedule.sql,
// drizzle/0032_check_in_occurrence_model.sql, and this pass's own
// drizzle/0033_check_in_photos.sql applied. Run via `npm run
// test:staging` (sources .env.staging.local, runs the staging guard,
// then vitest) — never against production.
//
// NO WEEKDAY IS HARDCODED IN PRODUCTION CODE — the specific weekday
// numbers used below (Sunday=0 .. Saturday=6) are TEST FIXTURE DATA
// ONLY, exercising check-in-schedule-service.ts's fully generic
// weekday-parameterized functions. See
// check-in-photo-no-hardcoded-weekday.test.ts for the source-level
// proof.
//
// Dates are computed relative to "today" (never literal past/future
// calendar strings) so this suite never goes stale or flakes based on
// which day it happens to run — nextOrSameWeekday finds the nearest
// on/after date matching a target weekday.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { clientCheckInSchedule } from "../schema-check-in";
import {
  setClientSchedule,
  setPhotoPolicy,
  getPhotoPolicyAtDate,
  getActivePhotoPolicies,
} from "../check-in-schedule-service";
import { assertStagingDbOrThrow } from "./require-staging";

assertStagingDbOrThrow();

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// Nearest date on/after `fromDate` (inclusive) whose UTC weekday
// matches `weekday` (0=Sunday..6=Saturday).
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

describe("Photo policy — historical truth (level + required views) + arbitrary schedule combinations", () => {
  const db = getDb();
  const supabase = createAdminClient();
  let client: { id: string };
  let capturedError: unknown = null;

  beforeAll(async () => {
    try {
      const { data } = await supabase.auth.admin.createUser({
        email: `photo-policy-${randomUUID().slice(0, 8)}@isolation-test.invalid`,
        email_confirm: true,
      });
      client = { id: data!.user!.id };
      // A DB trigger (on_auth_user_created) already inserted a
      // public.users row the moment createUser() ran above — update
      // it to the role this fixture needs rather than inserting a
      // second row (which would violate users_pkey).
      await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
      await db.insert(clientProfiles).values({ userId: client.id, fullName: "Photo Policy Client", timezone: "America/Chicago" });
    } catch (err) {
      capturedError = err;
    }
  });

  afterEach(async () => {
    if (!client?.id) return;
    await db.delete(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
  });

  afterAll(async () => {
    let firstError: unknown = capturedError;
    const results = await Promise.allSettled([
      client?.id ? db.delete(clientProfiles).where(eq(clientProfiles.userId, client.id)) : Promise.resolve(),
      client?.id ? db.delete(users).where(eq(users.id, client.id)) : Promise.resolve(),
      client?.id ? supabase.auth.admin.deleteUser(client.id) : Promise.resolve(),
    ]);
    for (const r of results) {
      if (r.status === "rejected" && !firstError) firstError = r.reason;
    }
    if (firstError) throw firstError;
  });

  it("a client with zero schedule rows gets 'optional' with no required views (never invent a hard requirement)", async () => {
    const policy = await getPhotoPolicyAtDate(client.id, todayIso());
    expect(policy).toEqual({ requirement: "optional", requiredViews: [] });
  });

  it("setPhotoPolicy rejects a weekday that isn't currently active", async () => {
    const result = await setPhotoPolicy(client.id, 3, {
      requirement: "required",
      requireFront: true,
      requireSide: true,
      requireBack: true,
    }); // Wednesday chosen arbitrarily — not special-cased
    expect(result.ok).toBe(false);
  });

  it("setPhotoPolicy rejects 'required' with zero views checked", async () => {
    await setClientSchedule(client.id, [0]); // Sunday chosen arbitrarily
    const result = await setPhotoPolicy(client.id, 0, {
      requirement: "required",
      requireFront: false,
      requireSide: false,
      requireBack: false,
    });
    expect(result.ok).toBe(false);
  });

  it("new weekday rows default to 'off' until explicitly configured", async () => {
    await setClientSchedule(client.id, [0]);
    const policy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(0, todayIso()));
    expect(policy).toEqual({ requirement: "off", requiredViews: [] });
  });

  it("configurable required views: Front only", async () => {
    await setClientSchedule(client.id, [5]); // Friday chosen arbitrarily
    const result = await setPhotoPolicy(client.id, 5, {
      requirement: "required",
      requireFront: true,
      requireSide: false,
      requireBack: false,
    });
    expect(result.ok).toBe(true);
    const policy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(5, todayIso()));
    expect(policy).toEqual({ requirement: "required", requiredViews: ["front"] });
  });

  it("configurable required views: Side + Back, not Front", async () => {
    await setClientSchedule(client.id, [1]); // Monday chosen arbitrarily
    await setPhotoPolicy(client.id, 1, {
      requirement: "required",
      requireFront: false,
      requireSide: true,
      requireBack: true,
    });
    const policy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(1, todayIso()));
    expect(policy).toEqual({ requirement: "required", requiredViews: ["side", "back"] });
  });

  it("HISTORICAL TRUTH: narrowing Front+Side+Back → Front-only does not retroactively rewrite a past occurrence's required views", async () => {
    // Simulate an established schedule by opening the active row in
    // the past with all three views required, then narrow it today.
    const anchor = nextOrSameWeekday(0, todayIso());
    const past = daysBefore(anchor, 60);
    await db.insert(clientCheckInSchedule).values({
      clientId: client.id,
      weekday: 0,
      effectiveFrom: past,
      photoRequirement: "required",
      photoRequireFront: true,
      photoRequireSide: true,
      photoRequireBack: true,
    });

    const priorOccurrence = daysBefore(anchor, 28); // 4 weeks back — a multiple of 7 so it's still a Sunday
    const beforeChange = await getPhotoPolicyAtDate(client.id, priorOccurrence);
    expect(beforeChange).toEqual({ requirement: "required", requiredViews: ["front", "side", "back"] });

    const narrow = await setPhotoPolicy(client.id, 0, {
      requirement: "required",
      requireFront: true,
      requireSide: false,
      requireBack: false,
    });
    expect(narrow.ok).toBe(true);

    // The PAST occurrence must still read all three required — the
    // exact guarantee this pass's data model exists to provide.
    expect(await getPhotoPolicyAtDate(client.id, priorOccurrence)).toEqual({
      requirement: "required",
      requiredViews: ["front", "side", "back"],
    });
    // A FUTURE/current occurrence resolves the new, narrower policy.
    expect(await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(0, todayIso()))).toEqual({
      requirement: "required",
      requiredViews: ["front"],
    });
  });

  it("HISTORICAL TRUTH: Required → Optional does not retroactively rewrite a past occurrence's level", async () => {
    const anchor = nextOrSameWeekday(0, todayIso());
    const past = daysBefore(anchor, 60);
    await db.insert(clientCheckInSchedule).values({
      clientId: client.id,
      weekday: 0,
      effectiveFrom: past,
      photoRequirement: "required",
      photoRequireFront: true,
      photoRequireSide: true,
      photoRequireBack: true,
    });
    const priorOccurrence = daysBefore(anchor, 28); // 4 weeks back — a multiple of 7 so it's still a Sunday
    expect((await getPhotoPolicyAtDate(client.id, priorOccurrence)).requirement).toBe("required");

    const rotate = await setPhotoPolicy(client.id, 0, {
      requirement: "optional",
      requireFront: true,
      requireSide: true,
      requireBack: true,
    });
    expect(rotate.ok).toBe(true);

    expect((await getPhotoPolicyAtDate(client.id, priorOccurrence)).requirement).toBe("required");
    expect((await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(0, todayIso()))).requirement).toBe("optional");
  });

  it("same-day rotation (added and reconfigured before any occurrence could exist) updates in place, no duplicate active row", async () => {
    await setClientSchedule(client.id, [5]); // Friday chosen arbitrarily
    const r1 = await setPhotoPolicy(client.id, 5, { requirement: "required", requireFront: true, requireSide: true, requireBack: true });
    expect(r1.ok).toBe(true);
    const r2 = await setPhotoPolicy(client.id, 5, { requirement: "optional", requireFront: true, requireSide: true, requireBack: true });
    expect(r2.ok).toBe(true);

    const active = await getActivePhotoPolicies(client.id);
    expect(active[5 as keyof typeof active]?.requirement).toBe("optional");

    const rows = await db.select().from(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
    expect(rows.filter((r) => r.effectiveTo === null).length).toBe(1);
  });

  // ── Arbitrary schedule combinations, no weekday special-cased ──

  it("Sunday-only, Front+Side+Back required", async () => {
    await setClientSchedule(client.id, [0]);
    await setPhotoPolicy(client.id, 0, { requirement: "required", requireFront: true, requireSide: true, requireBack: true });
    const policy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(0, todayIso()));
    expect(policy).toEqual({ requirement: "required", requiredViews: ["front", "side", "back"] });
  });

  it("Wed+Sun mixed: Wednesday Optional, Sunday Required[Front]", async () => {
    await setClientSchedule(client.id, [3, 0]);
    await setPhotoPolicy(client.id, 3, { requirement: "optional", requireFront: true, requireSide: true, requireBack: true });
    await setPhotoPolicy(client.id, 0, { requirement: "required", requireFront: true, requireSide: false, requireBack: false });

    const wedPolicy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(3, todayIso()));
    expect(wedPolicy.requirement).toBe("optional");
    const sunPolicy = await getPhotoPolicyAtDate(client.id, nextOrSameWeekday(0, todayIso()));
    expect(sunPolicy).toEqual({ requirement: "required", requiredViews: ["front"] });
  });

  it("Mon+Fri mixed: Monday Off, Friday Required[Front]", async () => {
    await setClientSchedule(client.id, [1, 5]);
    await setPhotoPolicy(client.id, 1, { requirement: "off", requireFront: true, requireSide: true, requireBack: true });
    await setPhotoPolicy(client.id, 5, { requirement: "required", requireFront: true, requireSide: false, requireBack: false });
    const active = await getActivePhotoPolicies(client.id);
    expect(active[1 as keyof typeof active]?.requirement).toBe("off");
    expect(active[5 as keyof typeof active]).toEqual({ requirement: "required", requiredViews: ["front"] });
  });

  it("Tue+Thu+Sat mixed (required/optional/off)", async () => {
    await setClientSchedule(client.id, [2, 4, 6]);
    await setPhotoPolicy(client.id, 2, { requirement: "required", requireFront: true, requireSide: true, requireBack: false });
    await setPhotoPolicy(client.id, 4, { requirement: "optional", requireFront: true, requireSide: true, requireBack: true });
    await setPhotoPolicy(client.id, 6, { requirement: "off", requireFront: true, requireSide: true, requireBack: true });
    const active = await getActivePhotoPolicies(client.id);
    expect(active[2 as keyof typeof active]).toEqual({ requirement: "required", requiredViews: ["front", "side"] });
    expect(active[4 as keyof typeof active]?.requirement).toBe("optional");
    expect(active[6 as keyof typeof active]?.requirement).toBe("off");
  });

  it("single-day schedule (only one weekday configured, any weekday)", async () => {
    await setClientSchedule(client.id, [4]); // Thursday chosen arbitrarily
    await setPhotoPolicy(client.id, 4, { requirement: "required", requireFront: true, requireSide: true, requireBack: true });
    const active = await getActivePhotoPolicies(client.id);
    expect(Object.keys(active).length).toBe(1);
    expect(active[4 as keyof typeof active]?.requirement).toBe("required");
  });
});
