// ─────────────────────────────────────────────────────────────
// submitCheckIn() → coach notification — real call-site integration
//
// Proves the actual wiring in check-in-service.ts's submitCheckIn(),
// not just the notifyCheckInSubmitted() producer in isolation (see
// coach-notification-producers.test.ts for the broader tenant-
// isolation/resource-linkage suite covering all five producers).
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments, timelineEvents } from "../schema";
import { weeklyCheckIns } from "../schema-check-in";
import { coachNotifications } from "../schema-coach-notifications";
import { createOrUpdateDraftCheckIn, submitCheckIn } from "../check-in-service";
import { listCoachNotifications } from "../coach-notification-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };
// A second client for the concurrency test — createOrUpdateDraftCheckIn
// keys a draft by (clientId, current calendar week), so reusing clientA
// for a second submitted check-in in the same test run would collide
// with the first test's already-submitted row for that same week.
const clientA2 = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `checkin-notif-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id, clientA2.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
    createAuthUser("client-a2"),
  ]);
  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA2.id)),
  ]);
  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Checkin Notif Test Client" },
    { userId: clientA2.id, fullName: "Checkin Notif Test Client 2" },
  ]);
  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientA2.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);
});

afterAll(async () => {
  const clientIds = [clientA.id, clientA2.id].filter(Boolean);
  const userIds = [coachA.id, coachB.id, ...clientIds].filter(Boolean);
  await db.delete(coachNotifications).where(inArray(coachNotifications.coachId, [coachA.id, coachB.id].filter(Boolean)));
  await db.delete(timelineEvents).where(inArray(timelineEvents.clientId, clientIds));
  await db.delete(weeklyCheckIns).where(inArray(weeklyCheckIns.clientId, clientIds));
  await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
  await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
});

describe("submitCheckIn — real call site notifies the correct coach", () => {
  it("notifies clientA's coach (coachA), never coachB, when a check-in is submitted", async () => {
    const draft = await createOrUpdateDraftCheckIn(clientA.id, {});
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const result = await submitCheckIn(clientA.id, draft.checkInId);
    expect(result.ok).toBe(true);

    const [forCoachA, forCoachB] = await Promise.all([
      listCoachNotifications(coachA.id, 50),
      listCoachNotifications(coachB.id, 50),
    ]);
    const found = forCoachA.notifications.find((n) => n.resourceId === draft.checkInId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("check_in_submitted");
    expect(found!.resourceType).toBe("check_in");
    expect(found!.readAt).toBeNull();
    expect(forCoachB.notifications.some((n) => n.resourceId === draft.checkInId)).toBe(false);
  });

  it("a concurrent double-submit of the same check-in creates only one notification (mirrors the existing timeline-event dedup guard)", async () => {
    const draft = await createOrUpdateDraftCheckIn(clientA2.id, {});
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const [first, second] = await Promise.all([
      submitCheckIn(clientA2.id, draft.checkInId),
      submitCheckIn(clientA2.id, draft.checkInId),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const { notifications } = await listCoachNotifications(coachA.id, 50);
    const matches = notifications.filter((n) => n.resourceId === draft.checkInId);
    expect(matches).toHaveLength(1);
  });
});
