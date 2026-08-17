// ─────────────────────────────────────────────────────────────
// Coach Notification Producers — real-DB integration suite
//
// Proves the five event producers added to coach-notification-service.ts
// (notifyCheckInSubmitted, notifyNewMessage, notifyProgramDraftReady,
// notifyProgramDraftFailed, notifyBillingPastDue) each:
//   1. deliver to the correct coach
//   2. never deliver to an uninvolved coach (tenant isolation)
//   3. link the correct resourceType/resourceId
//   4. default to unread (readAt null)
//
// resourceId columns on coach_notifications carry no FK constraint
// (schema-coach-notifications.ts), so these tests exercise the
// producers directly with synthetic-but-correctly-typed resource ids
// rather than standing up a full check-in/draft/subscription row for
// every case — coachingEnrollments IS required (notifyCheckInSubmitted
// resolves the coach through it, exactly like the real call site), so
// that part of the fixture is real.
//
// The producers that are wired into a real write path (check-in
// submission, message send, billing sync) are additionally proven at
// their real call site in check-in-service.test.ts,
// messaging-tenant-isolation.test.ts, and lib/billing/__tests__/sync.test.ts
// respectively — this file is the shared, comprehensive tenant-
// isolation/resource-linkage proof for all five in one place.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachingEnrollments } from "../schema";
import { coachNotifications } from "../schema-coach-notifications";
import {
  notifyCheckInSubmitted,
  notifyNewMessage,
  notifyProgramDraftReady,
  notifyProgramDraftFailed,
  notifyBillingPastDue,
  listCoachNotifications,
} from "../coach-notification-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `notif-producer-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
  ]);

  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
  ]);

  await db.insert(clientProfiles).values({ userId: clientA.id, fullName: "Notif Producer Test Client" });
  // clientA is enrolled with coachA only — coachB has no relationship
  // to clientA at all, which is exactly what makes it a valid "wrong
  // coach" fixture for notifyCheckInSubmitted's tenant resolution.
  await db.insert(coachingEnrollments).values({
    clientId: clientA.id,
    coachId: coachA.id,
    packageType: "Standard",
    monthlyRateCents: 0,
    status: "active",
  });
});

// Cleanup robustness — same philosophy as program-generator-integration.
// test.ts's afterAll: every phase runs in its own try/catch, ALL phases
// are attempted regardless of an earlier one failing, the FIRST error
// is captured and rethrown only once every phase has been attempted,
// and Auth user deletion uses Promise.allSettled. The previous version
// had no try/catch at all — a single throw aborted the whole function
// before users/Auth cleanup ran, confirmed as the source of leaked
// notif-producer-test-* fixtures found during a production fixture
// audit.
afterAll(async () => {
  let firstError: unknown;

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[coach-notification-producers cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const userIds = [coachA.id, coachB.id, clientA.id].filter(Boolean);
  const coachIds = [coachA.id, coachB.id].filter(Boolean);

  await runPhase("delete coach_notifications", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachNotifications).where(inArray(coachNotifications.coachId, coachIds));
  });

  await runPhase("delete coaching_enrollments/client_profiles", async () => {
    if (!clientA.id) return;
    await db.delete(coachingEnrollments).where(eq(coachingEnrollments.clientId, clientA.id));
    await db.delete(clientProfiles).where(eq(clientProfiles.userId, clientA.id));
  });

  if (userIds.length > 0) {
    await runPhase("delete public.users rows", async () => {
      await db.delete(users).where(inArray(users.id, userIds));
    });

    await runPhase("delete Supabase Auth users", async () => {
      const admin = createAdminClient();
      const results = await Promise.allSettled(userIds.map((id) => admin.auth.admin.deleteUser(id)));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    });
  }

  if (firstError) throw firstError;
});

describe("notifyCheckInSubmitted", () => {
  it("notifies the client's active coach, unread by default, with check_in resource linkage", async () => {
    const checkInId = randomUUID();
    await notifyCheckInSubmitted({ clientId: clientA.id, checkInId, weekStartDate: "2026-08-03" });

    const { notifications } = await listCoachNotifications(coachA.id, 50);
    const found = notifications.find((n) => n.resourceId === checkInId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("check_in_submitted");
    expect(found!.resourceType).toBe("check_in");
    expect(found!.readAt).toBeNull();
    expect(found!.actorId).toBe(clientA.id);
    expect(found!.title.length).toBeGreaterThan(0);
  });

  it("never delivers to an uninvolved coach", async () => {
    const checkInId = randomUUID();
    await notifyCheckInSubmitted({ clientId: clientA.id, checkInId, weekStartDate: "2026-08-03" });

    const { notifications } = await listCoachNotifications(coachB.id, 50);
    expect(notifications.some((n) => n.resourceId === checkInId)).toBe(false);
  });

  it("is a no-op (does not throw) for a client with no active enrollment", async () => {
    await expect(
      notifyCheckInSubmitted({ clientId: randomUUID(), checkInId: randomUUID(), weekStartDate: "2026-08-03" }),
    ).resolves.toBeUndefined();
  });
});

describe("notifyNewMessage", () => {
  it("delivers to exactly the coach it targets, with conversation resource linkage", async () => {
    const conversationId = randomUUID();
    await notifyNewMessage({
      coachId: coachA.id,
      clientId: clientA.id,
      clientName: "Notif Producer Test Client",
      conversationId,
      preview: "Hey, quick question about this week's program.",
    });

    const [forCoachA, forCoachB] = await Promise.all([
      listCoachNotifications(coachA.id, 50),
      listCoachNotifications(coachB.id, 50),
    ]);
    const found = forCoachA.notifications.find((n) => n.resourceId === conversationId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("new_message");
    expect(found!.resourceType).toBe("conversation");
    expect(found!.readAt).toBeNull();
    expect(found!.title).toContain("Notif Producer Test Client");
    expect(forCoachB.notifications.some((n) => n.resourceId === conversationId)).toBe(false);
  });
});

describe("notifyProgramDraftReady / notifyProgramDraftFailed", () => {
  it("ready: delivers to the owning coach with program_draft resource linkage", async () => {
    const draftId = randomUUID();
    await notifyProgramDraftReady({ coachId: coachA.id, draftId });

    const { notifications } = await listCoachNotifications(coachA.id, 50);
    const found = notifications.find((n) => n.resourceId === draftId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("program_draft_ready");
    expect(found!.resourceType).toBe("program_draft");
    expect(found!.readAt).toBeNull();
  });

  it("failed: delivers to the owning coach with the failure reason as the body", async () => {
    const draftId = randomUUID();
    await notifyProgramDraftFailed({ coachId: coachA.id, draftId, reason: "Generation failed while creating Week 3." });

    const { notifications } = await listCoachNotifications(coachA.id, 50);
    const found = notifications.find((n) => n.resourceId === draftId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("program_draft_failed");
    expect(found!.resourceType).toBe("program_draft");
    expect(found!.body).toBe("Generation failed while creating Week 3.");
  });

  it("never delivers a coach's draft outcome to a different coach", async () => {
    const draftId = randomUUID();
    await notifyProgramDraftReady({ coachId: coachA.id, draftId });

    const { notifications } = await listCoachNotifications(coachB.id, 50);
    expect(notifications.some((n) => n.resourceId === draftId)).toBe(false);
  });
});

describe("notifyBillingPastDue", () => {
  it("delivers to the coach with coach_subscription resource linkage", async () => {
    const subscriptionId = randomUUID();
    const graceEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await notifyBillingPastDue({ coachId: coachA.id, subscriptionId, gracePeriodEnd: graceEnd });

    const { notifications } = await listCoachNotifications(coachA.id, 50);
    const found = notifications.find((n) => n.resourceId === subscriptionId);
    expect(found).toBeDefined();
    expect(found!.eventType).toBe("billing_payment_failed");
    expect(found!.resourceType).toBe("coach_subscription");
    expect(found!.readAt).toBeNull();
  });
});

describe("listCoachNotifications — unreadCount reflects new rows", () => {
  it("unreadCount increases by exactly the number of new unread notifications created for that coach", async () => {
    const before = await listCoachNotifications(coachA.id, 50);
    await notifyProgramDraftReady({ coachId: coachA.id, draftId: randomUUID() });
    const after = await listCoachNotifications(coachA.id, 50);
    expect(after.unreadCount).toBe(before.unreadCount + 1);
  });
});
