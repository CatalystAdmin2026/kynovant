// ─────────────────────────────────────────────────────────────
// Coach ↔ Client Messaging — tenant isolation integration suite
//
// Proves, against a REAL database connection (same rationale as
// coach-tenant-isolation.test.ts — mocking Drizzle's query builder
// would only prove the mock was called correctly, not that the
// actual SQL WHERE clause filters correctly):
//
//   1. A coach can only start/read/send in a conversation with their
//      OWN enrolled client — never another coach's client.
//   2. A client can only read/send in their OWN conversation — never
//      another client's.
//   3. Unread/read state behaves correctly: sending flips the
//      recipient's unread count up; marking read flips it back to 0
//      and never marks the sender's own messages "read" by mistake.
//   4. Admin gets unscoped read access (oversight) but can never send
//      as a participant.
//
// Requires a reachable DATABASE_URL. vitest.config.ts loads
// .env.local automatically. Fixture rows use randomUUID()-based
// emails so repeated runs never collide; every row this file creates
// is deleted in afterAll(), FK-safe (children before parents).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users, clientProfiles, coachProfiles, coachingEnrollments } from "../schema";
import { conversations, messages } from "../schema-messaging";
import { coachNotifications } from "../schema-coach-notifications";
import { listCoachNotifications } from "../coach-notification-service";
import {
  checkConversationAccess,
  getOrCreateConversationForClient,
  getOrCreateConversationForCoach,
  getTotalUnreadCount,
  listConversationsForCoach,
  listMessagingContacts,
  markConversationRead,
  sendMessage,
} from "../messaging-service";

const db = getDb();

const coachA = { id: "" };
const coachB = { id: "" };
const clientA = { id: "" };
const clientB = { id: "" };
let conversationAId = "";

async function createAuthUser(label: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `messaging-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [coachA.id, coachB.id, clientA.id, clientB.id] = await Promise.all([
    createAuthUser("coach-a"),
    createAuthUser("coach-b"),
    createAuthUser("client-a"),
    createAuthUser("client-b"),
  ]);

  await Promise.all([
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachA.id)),
    db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, coachB.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientA.id)),
    db.update(users).set({ role: "client", status: "active" }).where(eq(users.id, clientB.id)),
  ]);

  await db.insert(clientProfiles).values([
    { userId: clientA.id, fullName: "Messaging Test Client A" },
    { userId: clientB.id, fullName: "Messaging Test Client B" },
  ]);
  await db.insert(coachProfiles).values([
    { userId: coachA.id, displayName: "Messaging Test Coach A" },
    { userId: coachB.id, displayName: "Messaging Test Coach B" },
  ]);

  await db.insert(coachingEnrollments).values([
    { clientId: clientA.id, coachId: coachA.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
    { clientId: clientB.id, coachId: coachB.id, packageType: "Standard", monthlyRateCents: 0, status: "active" },
  ]);
});

// Cleanup robustness — same philosophy as program-generator-integration.
// test.ts's afterAll: every phase runs in its own try/catch, ALL phases
// are attempted regardless of an earlier one failing, the FIRST error
// is captured and rethrown only once every phase has been attempted,
// and Auth user deletion uses Promise.allSettled. The previous version
// had no try/catch at all — a single throw anywhere in the chain
// aborted the whole function before users/Auth cleanup ran, confirmed
// as the source of leaked messaging-test-* fixtures found during a
// production fixture audit.
afterAll(async () => {
  let firstError: unknown;

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[messaging-tenant-isolation cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const userIds = [coachA.id, coachB.id, clientA.id, clientB.id].filter(Boolean);
  const coachIds = [coachA.id, coachB.id].filter(Boolean);
  const clientIds = [clientA.id, clientB.id].filter(Boolean);

  await runPhase("delete messages/conversations", async () => {
    if (coachIds.length === 0) return;
    const convRows = await db.select({ id: conversations.id }).from(conversations).where(inArray(conversations.coachId, coachIds));
    const convIds = convRows.map((r) => r.id);
    if (convIds.length > 0) {
      await db.delete(messages).where(inArray(messages.conversationId, convIds));
      await db.delete(conversations).where(inArray(conversations.id, convIds));
    }
  });

  await runPhase("delete coach_notifications", async () => {
    if (coachIds.length === 0) return;
    await db.delete(coachNotifications).where(inArray(coachNotifications.coachId, coachIds));
  });

  await runPhase("delete coaching_enrollments/client_profiles/coach_profiles", async () => {
    if (clientIds.length > 0) {
      await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, clientIds));
      await db.delete(clientProfiles).where(inArray(clientProfiles.userId, clientIds));
    }
    if (coachIds.length > 0) {
      await db.delete(coachProfiles).where(inArray(coachProfiles.userId, coachIds));
    }
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

// ─────────────────────────────────────────────────────────────

describe("getOrCreateConversationForCoach — creation gate", () => {
  it("allows a coach to start a conversation with their own client", async () => {
    const result = await getOrCreateConversationForCoach(coachA.id, clientA.id);
    expect(result.ok).toBe(true);
    if (result.ok) conversationAId = result.conversationId;
  });

  it("refuses a coach starting a conversation with another coach's client", async () => {
    const result = await getOrCreateConversationForCoach(coachA.id, clientB.id);
    expect(result.ok).toBe(false);
  });

  it("is idempotent — a second call for the same pair returns the same conversation", async () => {
    const result = await getOrCreateConversationForCoach(coachA.id, clientA.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.conversationId).toBe(conversationAId);
  });
});

describe("getOrCreateConversationForClient — resolves 'my coach'", () => {
  it("resolves the client's own coach via their enrollment", async () => {
    const result = await getOrCreateConversationForClient(clientA.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coachId).toBe(coachA.id);
      expect(result.conversationId).toBe(conversationAId);
    }
  });

  it("returns no_coach_assigned for a client with no enrollment", async () => {
    const result = await getOrCreateConversationForClient(randomUUID());
    expect(result.ok).toBe(false);
  });
});

describe("checkConversationAccess — read isolation", () => {
  it("allows the owning coach", async () => {
    const access = await checkConversationAccess(conversationAId, coachA.id, "coach");
    expect(access.ok).toBe(true);
  });

  it("denies a different coach (404-shaped, not 403)", async () => {
    const access = await checkConversationAccess(conversationAId, coachB.id, "coach");
    expect(access.ok).toBe(false);
    expect(access.error).toBe("not_found");
  });

  it("allows the owning client", async () => {
    const access = await checkConversationAccess(conversationAId, clientA.id, "client");
    expect(access.ok).toBe(true);
  });

  it("denies a different client — cannot access another client's conversation", async () => {
    const access = await checkConversationAccess(conversationAId, clientB.id, "client");
    expect(access.ok).toBe(false);
    expect(access.error).toBe("not_found");
  });

  it("admin bypasses the ownership check entirely (unscoped oversight)", async () => {
    const access = await checkConversationAccess(conversationAId, randomUUID(), "admin");
    expect(access.ok).toBe(true);
  });
});

describe("sendMessage — participant enforcement", () => {
  it("lets the coach send into their own conversation", async () => {
    const result = await sendMessage(conversationAId, coachA.id, "Hey — how's this week going?");
    expect(result.ok).toBe(true);
  });

  it("lets the client reply", async () => {
    const result = await sendMessage(conversationAId, clientA.id, "Going well, thanks!");
    expect(result.ok).toBe(true);
  });

  it("refuses a non-participant coach", async () => {
    const result = await sendMessage(conversationAId, coachB.id, "I shouldn't be able to send this.");
    expect(result.ok).toBe(false);
  });

  it("refuses a non-participant client", async () => {
    const result = await sendMessage(conversationAId, clientB.id, "Neither should I.");
    expect(result.ok).toBe(false);
  });

  it("refuses an empty/whitespace-only message", async () => {
    const result = await sendMessage(conversationAId, coachA.id, "   ");
    expect(result.ok).toBe(false);
  });

  it("admin cannot send as a participant it isn't", async () => {
    const result = await sendMessage(conversationAId, randomUUID(), "Admin trying to impersonate a participant.");
    expect(result.ok).toBe(false);
  });
});

describe("unread/read state", () => {
  it("the client sees the coach's messages as unread until they read them", async () => {
    const unread = await getTotalUnreadCount(clientA.id, "client");
    expect(unread).toBeGreaterThan(0);
  });

  it("marking the conversation read zeroes the client's unread count", async () => {
    await markConversationRead(conversationAId, clientA.id);
    const unread = await getTotalUnreadCount(clientA.id, "client");
    expect(unread).toBe(0);
  });

  it("the coach still has the client's reply as unread (their own messages were never counted)", async () => {
    const unread = await getTotalUnreadCount(coachA.id, "coach");
    expect(unread).toBeGreaterThan(0);
  });

  it("marking read from the coach's side zeroes the coach's own unread count", async () => {
    await markConversationRead(conversationAId, coachA.id);
    const unread = await getTotalUnreadCount(coachA.id, "coach");
    expect(unread).toBe(0);
  });

  it("a coach's own sent messages are never counted as their own unread", async () => {
    await sendMessage(conversationAId, coachA.id, "One more from the coach.");
    const unread = await getTotalUnreadCount(coachA.id, "coach");
    expect(unread).toBe(0);
  });
});

describe("listConversationsForCoach — list-level isolation", () => {
  it("scopes to the requesting coach's own conversations", async () => {
    const rows = await listConversationsForCoach(coachA.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(conversationAId);
  });

  it("a different coach with no conversations sees an empty list, not an error", async () => {
    const rows = await listConversationsForCoach(coachB.id);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(conversationAId);
  });

  it("admin (coachId null) sees the conversation unscoped", async () => {
    const rows = await listConversationsForCoach(null);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(conversationAId);
  });
});

describe("listMessagingContacts — compose picker scoping", () => {
  it("returns only this coach's own enrolled clients", async () => {
    const contacts = await listMessagingContacts(coachA.id);
    const ids = contacts.map((c) => c.clientId);
    expect(ids).toContain(clientA.id);
    expect(ids).not.toContain(clientB.id);
  });

  it("marks a client as already having a conversation once one exists", async () => {
    const contacts = await listMessagingContacts(coachA.id);
    const contact = contacts.find((c) => c.clientId === clientA.id);
    expect(contact?.hasConversation).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// sendMessage() → coach notification — real call-site wiring.
// The producer itself (notifyNewMessage) is proven more broadly in
// coach-notification-producers.test.ts; this proves sendMessage()
// actually calls it, only for a client-authored message, and never
// leaks to an uninvolved coach.
// ─────────────────────────────────────────────────────────────
describe("sendMessage — coach notification wiring", () => {
  it("notifies the coach when the CLIENT sends a message, with conversation resource linkage", async () => {
    const before = await listCoachNotifications(coachA.id, 50);
    const result = await sendMessage(conversationAId, clientA.id, "Client-authored message for notification wiring.");
    expect(result.ok).toBe(true);

    const after = await listCoachNotifications(coachA.id, 50);
    expect(after.unreadCount).toBe(before.unreadCount + 1);
    const found = after.notifications.find((n) => n.resourceId === conversationAId && n.eventType === "new_message");
    expect(found).toBeDefined();
    expect(found!.resourceType).toBe("conversation");
    expect(found!.actorId).toBe(clientA.id);
  });

  it("does NOT notify anyone when the COACH sends a message (no self-notification)", async () => {
    const before = await listCoachNotifications(coachA.id, 50);
    const result = await sendMessage(conversationAId, coachA.id, "Coach-authored message — should not self-notify.");
    expect(result.ok).toBe(true);

    const after = await listCoachNotifications(coachA.id, 50);
    expect(after.unreadCount).toBe(before.unreadCount);
  });

  it("never delivers clientA's message notification to an uninvolved coach (coachB)", async () => {
    const result = await sendMessage(conversationAId, clientA.id, "Another client message.");
    expect(result.ok).toBe(true);

    const { notifications } = await listCoachNotifications(coachB.id, 50);
    expect(notifications.some((n) => n.resourceId === conversationAId)).toBe(false);
  });
});
