// ─────────────────────────────────────────────────────────────
// Multi-occurrence check-in architecture — real-DB integration
//
// Covers the core Phase 19 scenarios for the occurrence model
// (weekly_check_ins keyed on (client_id, scheduled_date) instead of
// (client_id, week_start_date)):
//   STORAGE — Wed+Sun coexist in one week; duplicate occurrence is
//             impossible; Sunday never overwrites Wednesday.
//   FLOW    — independent draft/submit per occurrence; repeat-open of
//             the same occurrence never duplicates it; a race to
//             create the same occurrence resolves to one row.
//   SCHEDULE — getCurrentCheckInWindows reflects Sunday-only, Wed+Sun,
//              and no-schedule clients correctly.
//   COMPLIANCE — getClientCheckInSummary's current-week compliance:
//                2/2, 1/2, and "no schedule -> no fake 0%".
//   SECURITY — a client cannot submit against another client's
//              occurrence or forge an arbitrary scheduledDate to
//              manufacture compliance.
//
// NOTE ON EXECUTION: this suite requires drizzle/0031 and 0032 to be
// APPLIED to the target database (scheduled_date column, the new
// uq_client_scheduled_check_in constraint, and client_check_in_schedule
// with effective_from/effective_to). Per this pass's standing
// constraint, NEITHER migration has been applied — this file is
// reviewed and typechecked but will fail with "column/relation does
// not exist" against the current database until those migrations run.
// That failure mode is expected, not a defect in this suite or the
// application code.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments, timelineEvents } from "../schema";
import { weeklyCheckIns, clientCheckInSchedule } from "../schema-check-in";
import { coachNotifications } from "../schema-coach-notifications";
import {
  getCurrentCheckInWindows,
  createOrUpdateDraftCheckIn,
  submitCheckIn,
  listClientCheckIns,
} from "../check-in-service";
import { setClientSchedule } from "../check-in-schedule-service";
import { getClientCheckInSummary } from "../coach-check-in-service";

const db = getDb();
const TZ = "America/Chicago";

const coachA = { id: "" };
const clientA = { id: "" };
const clientB = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `checkin-occurrence-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, clientA.id, clientB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Occurrence Test Client A", timezone: TZ },
    { userId: clientB.id, fullName: "Occurrence Test Client B", timezone: TZ },
  ]);
  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientB.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);
});

afterAll(async () => {
  const clientIds = [clientA.id, clientB.id].filter(Boolean);
  const userIds = [coachA.id, ...clientIds].filter(Boolean);
  await db.delete(coachNotifications).where(inArray(coachNotifications.coachId, [coachA.id].filter(Boolean)));
  await db.delete(timelineEvents).where(inArray(timelineEvents.clientId, clientIds));
  await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.clientId, clientIds));
  await db.delete(clientCheckInSchedule).where(inArray(clientCheckInSchedule.clientId, clientIds));
  await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
  await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

beforeEach(async () => {
  await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.clientId, [clientA.id, clientB.id]));
  await db.delete(clientCheckInSchedule).where(inArray(clientCheckInSchedule.clientId, [clientA.id, clientB.id]));
  await db.insert(clientCheckInSchedule).values([
    { clientId: clientA.id, weekday: 0, effectiveFrom: "2026-08-01" },
    { clientId: clientA.id, weekday: 3, effectiveFrom: "2026-08-01" },
  ]);
});

// A Wednesday + Sunday pair inside a single, fixed, known-past week —
// far enough in the past that "today" in the test environment is
// always after it, so isOverdue/isToday assertions on THESE specific
// dates aren't used; getCurrentCheckInWindows itself always computes
// against the real current week, tested separately below.
const WED = "2026-08-12";
const SUN = "2026-08-09"; // the Sunday that starts that same week
const FUTURE_WED = "2026-08-19";

describe("STORAGE — two occurrences in one week coexist", () => {
  it("a Wednesday and a Sunday draft for the same client in the same week both persist as separate rows", async () => {
    const wed = await createOrUpdateDraftCheckIn(clientA.id, WED, { wins: "wed" });
    const sun = await createOrUpdateDraftCheckIn(clientA.id, SUN, { wins: "sun" });
    expect(wed.ok).toBe(true);
    expect(sun.ok).toBe(true);
    if (!wed.ok || !sun.ok) return;
    expect(wed.checkInId).not.toBe(sun.checkInId);

    const rows = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.clientId, clientA.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.weekStartDate === SUN)).toBe(true); // same week grouping
    expect(new Set(rows.map((r) => r.scheduledDate))).toEqual(new Set([WED, SUN]));
  });

  it("creating a draft twice for the SAME scheduled_date is impossible — the DB enforces one row per occurrence", async () => {
    const first = await createOrUpdateDraftCheckIn(clientA.id, WED, { wins: "first" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Second call to the same occurrence updates the SAME row (upsert),
    // not a duplicate.
    const second = await createOrUpdateDraftCheckIn(clientA.id, WED, { wins: "updated" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.checkInId).toBe(first.checkInId);

    const rows = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.clientId, clientA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe("updated");
  });

  it("a Sunday draft never overwrites a Wednesday draft's content", async () => {
    await createOrUpdateDraftCheckIn(clientA.id, WED, { wins: "wed-wins", bodyWeightLbs: "180.0" });
    await createOrUpdateDraftCheckIn(clientA.id, SUN, { wins: "sun-wins", bodyWeightLbs: "179.0" });

    const rows = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.clientId, clientA.id));
    const wedRow = rows.find((r) => r.scheduledDate === WED);
    const sunRow = rows.find((r) => r.scheduledDate === SUN);
    expect(wedRow?.wins).toBe("wed-wins");
    expect(wedRow?.bodyWeightLbs).toBe("180.0");
    expect(sunRow?.wins).toBe("sun-wins");
    expect(sunRow?.bodyWeightLbs).toBe("179.0");
  });
});

describe("FLOW — independent draft/submit per occurrence", () => {
  it("submitting Wednesday does not affect Sunday's draft status", async () => {
    const wed = await createOrUpdateDraftCheckIn(clientA.id, WED, {});
    await createOrUpdateDraftCheckIn(clientA.id, SUN, {});
    if (!wed.ok) throw new Error("setup failed");

    const submitResult = await submitCheckIn(clientA.id, wed.checkInId);
    expect(submitResult.ok).toBe(true);

    const rows = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.clientId, clientA.id));
    const wedRow = rows.find((r) => r.scheduledDate === WED);
    const sunRow = rows.find((r) => r.scheduledDate === SUN);
    expect(wedRow?.status).toBe("submitted");
    expect(sunRow?.status).toBe("draft"); // untouched
  });

  it("a concurrent double-create of the same occurrence (two-tab race) resolves to exactly one row", async () => {
    const [first, second] = await Promise.all([
      createOrUpdateDraftCheckIn(clientB.id, WED, { wins: "tab-1" }),
      createOrUpdateDraftCheckIn(clientB.id, WED, { wins: "tab-2" }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.checkInId).toBe(second.checkInId);

    const rows = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.clientId, clientB.id));
    expect(rows).toHaveLength(1);
  });

  it("a submitted occurrence's draft-save is rejected, not silently resurrected to draft", async () => {
    const draft = await createOrUpdateDraftCheckIn(clientA.id, WED, {});
    if (!draft.ok) throw new Error("setup failed");
    await submitCheckIn(clientA.id, draft.checkInId);

    const retry = await createOrUpdateDraftCheckIn(clientA.id, WED, { wins: "too late" });
    expect(retry.ok).toBe(false);

    const [row] = await db
      .select()
      .from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.id, draft.checkInId));
    expect(row.status).toBe("submitted");
    expect(row.wins).not.toBe("too late");
  });

  it("listClientCheckIns returns both occurrences from a Wed+Sun week as distinct entries", async () => {
    const wed = await createOrUpdateDraftCheckIn(clientA.id, WED, {});
    const sun = await createOrUpdateDraftCheckIn(clientA.id, SUN, {});
    if (!wed.ok || !sun.ok) throw new Error("setup failed");
    await submitCheckIn(clientA.id, wed.checkInId);
    await submitCheckIn(clientA.id, sun.checkInId);

    const list = await listClientCheckIns(clientA.id);
    const thisWeek = list.filter((c) => c.weekStartDate === SUN);
    expect(thisWeek).toHaveLength(2);
    expect(new Set(thisWeek.map((c) => c.scheduledDate))).toEqual(new Set([WED, SUN]));
  });
});

describe("SCHEDULE — getCurrentCheckInWindows reflects the client's actual configuration", () => {
  it("a Wed+Sun schedule yields exactly two windows for the current week", async () => {
    await setClientSchedule(clientA.id, [0, 3]); // Sunday + Wednesday
    const windows = await getCurrentCheckInWindows(clientA.id, TZ);
    expect(windows).toHaveLength(2);
    expect(new Set(windows.map((w) => w.weekday))).toEqual(new Set([0, 3]));
  });

  it("a Sunday-only schedule yields exactly one window", async () => {
    await setClientSchedule(clientA.id, [0]);
    const windows = await getCurrentCheckInWindows(clientA.id, TZ);
    expect(windows).toHaveLength(1);
    expect(windows[0].weekday).toBe(0);
  });

  it("an explicitly-empty schedule yields zero windows — no fake due-state", async () => {
    await setClientSchedule(clientA.id, []);
    const windows = await getCurrentCheckInWindows(clientA.id, TZ);
    expect(windows).toEqual([]);
  });

  it("a never-configured client (zero schedule rows) falls back to the enrollment's legacy checkInDayOfWeek", async () => {
    // clientB has no client_check_in_schedule rows at all in this test
    // (beforeEach clears them) and its enrollment has no
    // checkInDayOfWeek set — should fall back to Sunday (0), matching
    // pre-multi-day behavior byte-for-byte.
    const windows = await getCurrentCheckInWindows(clientB.id, TZ);
    expect(windows).toHaveLength(1);
    expect(windows[0].weekday).toBe(0);
  });
});

describe("COMPLIANCE — getClientCheckInSummary wires getRequiredDayStates into a real aggregate", () => {
  it("no schedule configured -> currentWeekCompliance is null, not a fake 0%", async () => {
    const summary = await getClientCheckInSummary(clientB.id);
    expect(summary.currentWeekCompliance).toBeNull();
  });

  it("Wed+Sun, neither submitted this week -> 0/2, not fully compliant", async () => {
    await setClientSchedule(clientA.id, [0, 3]);
    const summary = await getClientCheckInSummary(clientA.id);
    expect(summary.currentWeekCompliance).not.toBeNull();
    expect(summary.currentWeekCompliance!.requiredCount).toBe(2);
    expect(summary.currentWeekCompliance!.satisfiedCount).toBe(0);
    expect(summary.currentWeekCompliance!.fullyCompliant).toBe(false);
  });

  it("Wed+Sun, only Wednesday submitted this week -> 1/2, not fully compliant", async () => {
    await setClientSchedule(clientA.id, [0, 3]);
    const windows = await getCurrentCheckInWindows(clientA.id, TZ);
    const wedWindow = windows.find((w) => w.weekday === 3)!;
    const draft = await createOrUpdateDraftCheckIn(clientA.id, wedWindow.scheduledDate, {});
    if (!draft.ok) throw new Error("setup failed");
    await submitCheckIn(clientA.id, draft.checkInId);

    const summary = await getClientCheckInSummary(clientA.id);
    expect(summary.currentWeekCompliance!.satisfiedCount).toBe(1);
    expect(summary.currentWeekCompliance!.fullyCompliant).toBe(false);
    const missing = summary.currentWeekCompliance!.days.filter((d) => !d.satisfied);
    expect(missing.map((d) => d.weekday)).toEqual([0]); // Sunday still due
  });

  it("Wed+Sun, both submitted this week -> 2/2, fully compliant", async () => {
    await setClientSchedule(clientA.id, [0, 3]);
    const windows = await getCurrentCheckInWindows(clientA.id, TZ);
    for (const w of windows) {
      const draft = await createOrUpdateDraftCheckIn(clientA.id, w.scheduledDate, {});
      if (!draft.ok) throw new Error("setup failed");
      await submitCheckIn(clientA.id, draft.checkInId);
    }

    const summary = await getClientCheckInSummary(clientA.id);
    expect(summary.currentWeekCompliance!.satisfiedCount).toBe(2);
    expect(summary.currentWeekCompliance!.fullyCompliant).toBe(true);
  });
});

describe("SECURITY — occurrence writes stay scoped to the owning client", () => {
  it("rejects an unscheduled and future occurrence date", async () => {
    const unscheduled = await createOrUpdateDraftCheckIn(clientA.id, "2026-08-10", {});
    expect(unscheduled.ok).toBe(false);
    const future = await createOrUpdateDraftCheckIn(clientA.id, FUTURE_WED, {});
    expect(future.ok).toBe(false);
  });

  it("submitCheckIn rejects a checkInId that belongs to a different client", async () => {
    const draft = await createOrUpdateDraftCheckIn(clientA.id, WED, {});
    if (!draft.ok) throw new Error("setup failed");

    // clientB attempts to submit clientA's draft by id.
    const result = await submitCheckIn(clientB.id, draft.checkInId);
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(weeklyCheckIns).where(eq(weeklyCheckIns.id, draft.checkInId));
    expect(row.status).toBe("draft"); // untouched by the cross-client attempt
  });

  it("two different clients scheduling the same calendar date do not collide (unique index is per-client)", async () => {
    const a = await createOrUpdateDraftCheckIn(clientA.id, WED, {});
    await setClientSchedule(clientB.id, [3]);
    const b = await createOrUpdateDraftCheckIn(clientB.id, WED, {});
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.checkInId).not.toBe(b.checkInId);
  });
});
