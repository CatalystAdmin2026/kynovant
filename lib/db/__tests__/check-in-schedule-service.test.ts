// ─────────────────────────────────────────────────────────────
// client_check_in_schedule — effective-dated CRUD, real-DB
//
// Covers: current vs historical schedule queries, add/remove
// diffing, idempotency, and the same-day add-then-remove edge case
// (a same-day removal must preserve today's obligation while removing
// the row from the active set).
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles } from "../schema";
import { clientCheckInSchedule } from "../schema-check-in";
import {
  getClientSchedule,
  getClientScheduleAtDate,
  setClientSchedule,
} from "../check-in-schedule-service";

const db = getDb();
const client = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `checkin-schedule-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  client.id = await createAuthUser("client");
  await db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, client.id));
  await db.insert(clientProfiles).values({ userId: client.id, fullName: "Schedule Test Client" });
});

afterAll(async () => {
  await db.delete(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
  await db.delete(clientProfiles).where(eq(clientProfiles.userId, client.id));
  await db.delete(users).where(inArray(users.id, [client.id].filter(Boolean)));
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(client.id);
});

// Reset schedule state between tests so each test starts from "no
// schedule configured" — avoids test-order coupling.
beforeEach(async () => {
  await db.delete(clientCheckInSchedule).where(eq(clientCheckInSchedule.clientId, client.id));
});

describe("getClientSchedule / setClientSchedule — current state", () => {
  it("returns [] for a never-configured client", async () => {
    expect(await getClientSchedule(client.id)).toEqual([]);
  });

  it("setting [3, 0] (Wed + Sun) is readable back, normalized and sorted", async () => {
    const result = await setClientSchedule(client.id, [3, 0]);
    expect(result.ok).toBe(true);
    expect(await getClientSchedule(client.id)).toEqual([0, 3]);
  });

  it("is idempotent — setting the same set twice creates no duplicate active rows", async () => {
    await setClientSchedule(client.id, [0, 3]);
    await setClientSchedule(client.id, [0, 3]);
    const activeRows = await db
      .select()
      .from(clientCheckInSchedule)
      .where(and_(client.id));
    expect(activeRows.filter((r) => r.effectiveTo === null)).toHaveLength(2);
  });

  it("setting [] closes every active row — 'no schedule' is an explicit, settable state", async () => {
    await setClientSchedule(client.id, [0, 3]);
    await setClientSchedule(client.id, []);
    expect(await getClientSchedule(client.id)).toEqual([]);
  });
});

describe("getClientScheduleAtDate — historical truth is preserved across schedule changes", () => {
  it("a day removed today is still 'required' for every date before the removal", async () => {
    // Simulate: Sunday-only was required starting a month ago.
    const monthAgo = isoDaysAgo(30);
    await db.insert(clientCheckInSchedule).values({
      clientId: client.id,
      weekday: 0,
      effectiveFrom: monthAgo,
    });

    // Coach removes Sunday today, adds Wednesday instead.
    await setClientSchedule(client.id, [3]);

    // Today/going forward: Wednesday only.
    expect(await getClientSchedule(client.id)).toEqual([3]);

    // A date from two weeks ago (while Sunday was still active) must
    // still show Sunday as required — the schedule change today must
    // NOT retroactively rewrite that.
    const twoWeeksAgo = isoDaysAgo(14);
    expect(await getClientScheduleAtDate(client.id, twoWeeksAgo)).toEqual([0]);
  });

  it("a day added today is NOT required for dates before it existed", async () => {
    await setClientSchedule(client.id, [3]); // Wednesday, effective today

    const lastWeek = isoDaysAgo(7);
    expect(await getClientScheduleAtDate(client.id, lastWeek)).toEqual([]);

    const today = isoDaysAgo(0);
    expect(await getClientScheduleAtDate(client.id, today)).toEqual([3]);
  });

  it("mid-week addition: adding Sunday today makes it required from today forward, not retroactively", async () => {
    const monthAgo = isoDaysAgo(30);
    await db.insert(clientCheckInSchedule).values({
      clientId: client.id,
      weekday: 0,
      effectiveFrom: monthAgo,
    });
    // Coach adds Wednesday too, today.
    await setClientSchedule(client.id, [0, 3]);

    expect(await getClientSchedule(client.id)).toEqual([0, 3]);
    // Yesterday, only Sunday was required.
    const yesterday = isoDaysAgo(1);
    expect(await getClientScheduleAtDate(client.id, yesterday)).toEqual([0]);
  });
});

describe("same-day add-then-remove — chk_check_in_schedule_effective_order edge case", () => {
  it("adding a day and removing it again the same day preserves today's obligation", async () => {
    const first = await setClientSchedule(client.id, [3]); // add Wednesday
    expect(first.ok).toBe(true);

    // Same-day undo, in a separate call — this previously risked a
    // check-constraint violation if the removal path tried to
    // soft-close (effectiveTo = today) a row whose effectiveFrom is
    // also today (today > today is false).
    const second = await setClientSchedule(client.id, []);
    expect(second.ok).toBe(true);

    expect(await getClientSchedule(client.id)).toEqual([]);

    // The row is closed after today, so today's historical lookup
    // remains truthful while the day is no longer active.
    const rows = await db
      .select()
      .from(clientCheckInSchedule)
      .where(and_(client.id));
    const wednesday = rows.find((r) => r.weekday === 3);
    expect(wednesday).toBeDefined();
    expect(wednesday!.effectiveTo).not.toBeNull();
    expect(await getClientScheduleAtDate(client.id, isoDaysAgo(0))).toContain(3);
  });

  it("same-day add-then-remove of one day while another day stays active only touches the removed day", async () => {
    const monthAgo = isoDaysAgo(30);
    await db.insert(clientCheckInSchedule).values({
      clientId: client.id,
      weekday: 0, // Sunday, long-standing
      effectiveFrom: monthAgo,
    });

    await setClientSchedule(client.id, [0, 3]); // add Wednesday today
    const result = await setClientSchedule(client.id, [0]); // remove Wednesday, same day
    expect(result.ok).toBe(true);

    expect(await getClientSchedule(client.id)).toEqual([0]);

    const rows = await db
      .select()
      .from(clientCheckInSchedule)
      .where(and_(client.id));
    expect(rows.filter((r) => r.weekday === 3)).toHaveLength(1); // Wednesday history preserved
    const sundayRow = rows.find((r) => r.weekday === 0);
    expect(sundayRow).toBeDefined();
    expect(sundayRow!.effectiveTo).toBeNull(); // Sunday's long history is untouched
  });
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function and_(clientId: string) {
  return eq(clientCheckInSchedule.clientId, clientId);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}
