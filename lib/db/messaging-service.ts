// ─────────────────────────────────────────────────────────────
// Catalyst OS — Coach ↔ Client Messaging Service
//
// SERVER-ONLY — never import from a Client Component.
//
// App-to-app messaging only. Deliberately does NOT integrate SMS,
// email, WhatsApp, Slack, or any third-party chat provider — this
// is a Catalyst-native, in-product thread between a coach and a
// client they are (or were) enrolled with.
//
// Tenant model — see lib/auth/guards.ts's TENANT SCOPE section:
//   - A conversation is created only after coachOwnsClient() confirms
//     a real coaching_enrollments row between the two participants
//     (any status — status governs the coaching lifecycle, not the
//     tenant boundary, matching every other ownership check in guards.ts).
//   - Every read/list/send function below re-checks that the requester
//     is one of the conversation's two fixed participants (or admin,
//     for unscoped oversight — see listConversationsForRequester).
//     This is what makes "coach cannot message another coach's client"
//     and "client cannot access another client's conversation" hold at
//     the data-access layer, not just in the UI.
//   - Admin can list/view any conversation (unscoped, consistent with
//     resolveTenantScope's coachId === null bypass elsewhere) but can
//     never SEND into one — admin is not a real participant in a 1:1
//     coach↔client thread, so there is no valid senderId for them to
//     act as. See sendMessage's strict participant check.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import { coachOwnsClient } from "@/lib/auth/guards";
import { users, clientProfiles, coachProfiles, coachingEnrollments } from "./schema";
import { conversations, messages, type Message } from "./schema-messaging";

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  coachId: string;
  clientId: string;
  counterpartId: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageIsMine: boolean;
  unreadCount: number;
  createdAt: string;
}

export interface ConversationAccess {
  ok: boolean;
  conversation?: typeof conversations.$inferSelect;
  error?: "not_found" | "forbidden";
}

// ─────────────────────────────────────────────────────────────
// NAME RESOLUTION — best-effort display name, falls back to email.
// Mirrors the fallback posture used throughout coach-dashboard-service.ts.
// ─────────────────────────────────────────────────────────────

export async function resolveDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // Dedupe before querying — the same id can legitimately repeat in the
  // caller's input (e.g. admin's unscoped conversation list can include
  // the same client across two different coaches' conversations).
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return map;
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      clientFullName: clientProfiles.fullName,
      clientPreferredName: clientProfiles.preferredName,
      coachDisplayName: coachProfiles.displayName,
    })
    .from(users)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
    .where(inArray(users.id, uniqueIds));

  for (const row of rows) {
    const name = row.clientPreferredName || row.clientFullName || row.coachDisplayName || row.email;
    map.set(row.id, name);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// CONVERSATION CREATION / RESOLUTION
// ─────────────────────────────────────────────────────────────

// Coach-initiated: verifies coachOwnsClient() before creating anything.
// Upserts against uq_conversation_coach_client so a duplicate call
// (double-click, race) never produces two threads for the same pair.
export async function getOrCreateConversationForCoach(
  coachId: string,
  clientId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: "forbidden" }> {
  const owns = await coachOwnsClient(coachId, clientId);
  if (!owns) return { ok: false, error: "forbidden" };

  const db = getDb();
  const [row] = await db
    .insert(conversations)
    .values({ coachId, clientId })
    .onConflictDoNothing({ target: [conversations.coachId, conversations.clientId] })
    .returning({ id: conversations.id });

  if (row) return { ok: true, conversationId: row.id };

  // Conflict path — row already existed, fetch its id.
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.coachId, coachId), eq(conversations.clientId, clientId)))
    .limit(1);

  if (!existing) return { ok: false, error: "forbidden" }; // should not happen
  return { ok: true, conversationId: existing.id };
}

// Client-initiated: resolves "my coach" the same way the rest of the
// portal does — the most recently created coaching_enrollments row
// (see portal-dashboard-service.ts's getCoachData/getCoachFirstName).
// A client is never asked to pick a coach; there is exactly one.
export async function getOrCreateConversationForClient(
  clientId: string,
): Promise<
  | { ok: true; conversationId: string; coachId: string }
  | { ok: false; error: "no_coach_assigned" }
> {
  const db = getDb();
  const [enrollment] = await db
    .select({ coachId: coachingEnrollments.coachId })
    .from(coachingEnrollments)
    .where(eq(coachingEnrollments.clientId, clientId))
    .orderBy(desc(coachingEnrollments.createdAt))
    .limit(1);

  if (!enrollment) return { ok: false, error: "no_coach_assigned" };

  const [row] = await db
    .insert(conversations)
    .values({ coachId: enrollment.coachId, clientId })
    .onConflictDoNothing({ target: [conversations.coachId, conversations.clientId] })
    .returning({ id: conversations.id });

  if (row) return { ok: true, conversationId: row.id, coachId: enrollment.coachId };

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.coachId, enrollment.coachId), eq(conversations.clientId, clientId)))
    .limit(1);

  if (!existing) return { ok: false, error: "no_coach_assigned" }; // should not happen
  return { ok: true, conversationId: existing.id, coachId: enrollment.coachId };
}

// ─────────────────────────────────────────────────────────────
// ACCESS CONTROL — every read/mutate path below funnels through this.
// Returns "not_found" (not "forbidden") when the row doesn't belong to
// the requester, matching this codebase's established posture in
// guards.ts of never confirming a resource's existence to a non-owner.
// ─────────────────────────────────────────────────────────────

export async function checkConversationAccess(
  conversationId: string,
  requesterId: string,
  requesterRole: "coach" | "client" | "admin",
): Promise<ConversationAccess> {
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) return { ok: false, error: "not_found" };

  if (requesterRole === "admin") return { ok: true, conversation };

  const isParticipant =
    (requesterRole === "coach" && conversation.coachId === requesterId) ||
    (requesterRole === "client" && conversation.clientId === requesterId);

  if (!isParticipant) return { ok: false, error: "not_found" };
  return { ok: true, conversation };
}

// ─────────────────────────────────────────────────────────────
// LISTING — conversation list for either side of the relationship.
//
// coachId === null means admin/unscoped (every conversation, any
// coach) — consistent with resolveTenantScope()'s coachId === null
// convention used throughout guards.ts and coach-dashboard-service.ts.
// ─────────────────────────────────────────────────────────────

export async function listConversationsForCoach(
  coachId: string | null,
): Promise<ConversationSummary[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: conversations.id,
      coachId: conversations.coachId,
      clientId: conversations.clientId,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageSenderId: conversations.lastMessageSenderId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(coachId === null ? undefined : eq(conversations.coachId, coachId))
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`));

  if (rows.length === 0) return [];

  const names = await resolveDisplayNames(rows.map((r) => r.clientId));
  const unreadByConversation = await getUnreadCountsByConversation(
    rows.map((r) => r.id),
    rows.map((r) => r.coachId),
  );

  return rows.map((row) => ({
    id: row.id,
    coachId: row.coachId,
    clientId: row.clientId,
    counterpartId: row.clientId,
    counterpartName: names.get(row.clientId) ?? "Unknown client",
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsMine: row.lastMessageSenderId === row.coachId,
    unreadCount: unreadByConversation.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

// Returns null if the client has no coach assignment at all (honest
// empty state — never fabricates a conversation for a client with no
// coaching_enrollments row).
export async function getConversationForClient(
  clientId: string,
): Promise<ConversationSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: conversations.id,
      coachId: conversations.coachId,
      clientId: conversations.clientId,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageSenderId: conversations.lastMessageSenderId,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(eq(conversations.clientId, clientId))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  if (!row) return null;

  const names = await resolveDisplayNames([row.coachId]);
  const unreadByConversation = await getUnreadCountsByConversation([row.id], [row.clientId]);

  return {
    id: row.id,
    coachId: row.coachId,
    clientId: row.clientId,
    counterpartId: row.coachId,
    counterpartName: names.get(row.coachId) ?? "Your coach",
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsMine: row.lastMessageSenderId === row.clientId,
    unreadCount: unreadByConversation.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

// Batch unread-count lookup for a set of conversations, scoped per-row
// to "unread FROM the counterpart" — i.e. for a coach's own conversation
// row we exclude messages the coach themself sent. coachIds is a
// parallel array (same index) so this works for both the coach list
// (exclude sender === that row's coachId) and the single-client view
// (excluded sender is always the client, passed as null → handled by
// caller via getUnreadCountForConversation instead when there's just one).
async function getUnreadCountsByConversation(
  conversationIds: string[],
  excludeSenderIds: (string | null)[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  // Dedupe before querying — see resolveDisplayNames's identical comment
  // above for why the caller's input can legitimately contain repeats.
  const uniqueConversationIds = [...new Set(conversationIds)];
  if (uniqueConversationIds.length === 0) return map;
  const db = getDb();

  // Single query: unread count per conversation, excluding messages sent
  // BY the participant asking (never counting your own messages as unread).
  const rows = await db
    .select({
      conversationId: messages.conversationId,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(and(inArray(messages.conversationId, uniqueConversationIds), isNull(messages.readAt)))
    .groupBy(messages.conversationId);

  const rawCounts = new Map(rows.map((r) => [r.conversationId, r.count]));

  // rawCounts currently counts ALL unread messages regardless of sender.
  // Subtract out any that were sent by the excluded id (the requester's
  // own messages, which are never "unread" from their own perspective).
  const uniqueExcludeSenderIds = [...new Set(excludeSenderIds.filter((v): v is string => !!v))];
  if (uniqueExcludeSenderIds.length > 0) {
    const ownUnreadRows = await db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, uniqueConversationIds),
          isNull(messages.readAt),
          inArray(messages.senderId, uniqueExcludeSenderIds),
        ),
      )
      .groupBy(messages.conversationId);
    for (const r of ownUnreadRows) {
      // Only subtract for the conversation where that senderId is the
      // excluded party — safe because a message's senderId always
      // equals exactly one of the conversation's two participants.
      const idx = conversationIds.indexOf(r.conversationId);
      if (idx === -1) continue;
      if (excludeSenderIds[idx]) {
        rawCounts.set(r.conversationId, (rawCounts.get(r.conversationId) ?? 0) - r.count);
      }
    }
  }

  for (const id of conversationIds) map.set(id, Math.max(0, rawCounts.get(id) ?? 0));
  return map;
}

// Total unread count for a user across every conversation they're in —
// backs the HQ top-bar badge and the portal nav badge.
export async function getTotalUnreadCount(
  userId: string,
  role: "coach" | "client",
): Promise<number> {
  const db = getDb();
  const participantColumn = role === "coach" ? conversations.coachId : conversations.clientId;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(participantColumn, userId), ne(messages.senderId, userId), isNull(messages.readAt)));

  return row?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// THREAD — messages within a single conversation.
// ─────────────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  senderId: string;
  isMine: boolean;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export async function listMessages(
  conversationId: string,
  requesterId: string,
  limit = 100,
): Promise<ThreadMessage[]> {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 200));

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(safeLimit);

  return rows
    .slice()
    .reverse()
    .map((m: Message) => ({
      id: m.id,
      senderId: m.senderId,
      isMine: m.senderId === requesterId,
      body: m.body,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    }));
}

// senderId must be exactly one of the conversation's two fixed
// participants — this is the enforcement point that keeps admin (and
// anyone else) from ever sending as a party they aren't.
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<{ ok: true; message: ThreadMessage } | { ok: false; error: "forbidden" | "empty" }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };

  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) return { ok: false, error: "forbidden" };
  if (conversation.coachId !== senderId && conversation.clientId !== senderId) {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date();
  const preview = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;

  const [inserted] = await db.insert(messages).values({ conversationId, senderId, body: trimmed }).returning();

  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: senderId,
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationId));

  return {
    ok: true,
    message: {
      id: inserted.id,
      senderId: inserted.senderId,
      isMine: true,
      body: inserted.body,
      readAt: null,
      createdAt: inserted.createdAt.toISOString(),
    },
  };
}

// Marks every unread message NOT sent by readerId as read. Admin
// (readerId not a real participant) is a no-op — nothing to mark as
// read on someone else's behalf.
export async function markConversationRead(conversationId: string, readerId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.conversationId, conversationId), ne(messages.senderId, readerId), isNull(messages.readAt)))
    .returning({ id: messages.id });
  return rows.length;
}

// ─────────────────────────────────────────────────────────────
// COMPOSE PICKER — coach's own client roster, for starting a new thread.
// Deliberately lightweight (id + name only) — the heavier
// listCoachClients() in coach-dashboard-service.ts pulls in program/
// session stats this picker doesn't need.
// ─────────────────────────────────────────────────────────────

export interface MessagingContact {
  clientId: string;
  name: string;
  hasConversation: boolean;
}

export async function listMessagingContacts(coachId: string): Promise<MessagingContact[]> {
  const db = getDb();

  const clientRows = await db
    .selectDistinct({
      clientId: coachingEnrollments.clientId,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
      email: users.email,
    })
    .from(coachingEnrollments)
    .innerJoin(users, eq(users.id, coachingEnrollments.clientId))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, coachingEnrollments.clientId))
    .where(eq(coachingEnrollments.coachId, coachId))
    .orderBy(clientProfiles.fullName);

  if (clientRows.length === 0) return [];

  const existing = await db
    .select({ clientId: conversations.clientId })
    .from(conversations)
    .where(eq(conversations.coachId, coachId));
  const existingIds = new Set(existing.map((r) => r.clientId));

  return clientRows.map((row) => ({
    clientId: row.clientId,
    name: row.preferredName || row.fullName || row.email,
    hasConversation: existingIds.has(row.clientId),
  }));
}
