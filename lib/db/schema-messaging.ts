// ─────────────────────────────────────────────────────────────
// Catalyst OS — Coach ↔ Client Messaging Schema
//
// SERVER-ONLY — never import from a Client Component.
//
// App-to-app messaging only. No SMS/email/WhatsApp/Slack/third-party
// chat — see docs comment in lib/db/messaging-service.ts.
//
// Tables:
//   conversations — exactly one row per (coach_id, client_id) pair.
//   messages      — one row per message, FK'd to its conversation.
//
// Tenant model: Kynovant is coach-as-tenant, strictly 1:1 threads
// (see lib/auth/guards.ts's TENANT SCOPE section). A conversation's
// coach_id/client_id are fixed at creation time, gated by
// coachOwnsClient() — see messaging-service.ts's findOrCreateConversation.
// Because a thread only ever has these two participants, per-message
// read_at (set when the *other* party reads it) is sufficient to
// track read state — no separate read-receipts table is needed. This
// mirrors coach_notifications.read_at (schema-coach-notifications.ts).
//
// last_message_at / last_message_preview / last_message_sender_id are
// denormalized onto conversations so the conversation list can sort
// and render previews with a single indexed query instead of a
// per-conversation subquery against messages.
// ─────────────────────────────────────────────────────────────

import { pgTable, uuid, text, timestamp, unique, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

// ─────────────────────────────────────────────────────────────
// TABLE — conversations
//
// One row per coach↔client pair. uq_conversation_coach_client
// enforces at most one conversation per pair — findOrCreateConversation()
// in messaging-service.ts is the only writer and always upserts
// against this constraint rather than risking a duplicate thread.
//
// FK behavior:
//   coachId, clientId → RESTRICT: a conversation must not silently
//   lose its participants; deleting a user account is a separate,
//   explicit operation this schema does not need to anticipate yet.
// ─────────────────────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastMessageSenderId: uuid("last_message_sender_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_conversation_coach_client").on(table.coachId, table.clientId),
    index("idx_conversations_coach_last_message").on(table.coachId, table.lastMessageAt),
    index("idx_conversations_client_last_message").on(table.clientId, table.lastMessageAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — messages
//
// One row per message. read_at is set when the *recipient* (the
// conversation participant who is not senderId) reads it — valid
// because a conversation has exactly two participants.
//
// FK behavior:
//   conversationId → CASCADE: a message cannot outlive its thread.
//   senderId        → RESTRICT: preserves attribution; matches
//   conversations' own RESTRICT posture on coachId/clientId.
// ─────────────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
    index("idx_messages_conversation_unread").on(table.conversationId, table.senderId, table.readAt),
    check("chk_message_body_not_blank", sql`length(btrim(${table.body})) > 0`),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
