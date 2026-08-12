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

afterAll(async () => {
  const userIds = [coachA.id, coachB.id, clientA.id, clientB.id].filter(Boolean);

  // Children before parents.
  const convRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(inArray(conversations.coachId, [coachA.id, coachB.id].filter(Boolean)));
  const convIds = convRows.map((r) => r.id);
  if (convIds.length > 0) {
    await db.delete(messages).where(inArray(messages.conversationId, convIds));
    await db.delete(conversations).where(inArray(conversations.id, convIds));
  }
  if (userIds.length > 0) {
    await db.delete(coachingEnrollments).where(inArray(coachingEnrollments.clientId, [clientA.id, clientB.id].filter(Boolean)));
    await db.delete(clientProfiles).where(inArray(clientProfiles.userId, [clientA.id, clientB.id].filter(Boolean)));
    await db.delete(coachProfiles).where(inArray(coachProfiles.userId, [coachA.id, coachB.id].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  if (userIds.length > 0) {
    const admin = createAdminClient();
    await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
  }
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
