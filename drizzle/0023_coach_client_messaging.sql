-- ─────────────────────────────────────────────────────────────
-- Migration 0023 — Coach ↔ Client Messaging
--
-- App-to-app messaging only (no SMS/email/WhatsApp/Slack/third-party
-- chat). Adds two tables:
--   conversations — one row per (coach_id, client_id) pair.
--   messages      — one row per message, FK'd to its conversation.
--
-- See lib/db/schema-messaging.ts for full column/index rationale.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0023_coach_client_messaging.sql
--
-- Risk profile: purely additive — two new tables, zero changes to
-- existing tables. Safe to apply without downtime.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "conversations" (
  "id"                     uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id"               uuid        NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "client_id"              uuid        NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "last_message_at"        timestamptz,
  "last_message_preview"   text,
  "last_message_sender_id" uuid        REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_conversation_coach_client" UNIQUE ("coach_id", "client_id")
);
--> statement-breakpoint

CREATE INDEX "idx_conversations_coach_last_message"
  ON "conversations" ("coach_id", "last_message_at");
--> statement-breakpoint

CREATE INDEX "idx_conversations_client_last_message"
  ON "conversations" ("client_id", "last_message_at");
--> statement-breakpoint

CREATE TABLE "messages" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid        NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id"       uuid        NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "body"            text        NOT NULL,
  "read_at"         timestamptz,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_message_body_not_blank" CHECK (length(btrim("body")) > 0)
);
--> statement-breakpoint

CREATE INDEX "idx_messages_conversation_created"
  ON "messages" ("conversation_id", "created_at");
--> statement-breakpoint

CREATE INDEX "idx_messages_conversation_unread"
  ON "messages" ("conversation_id", "sender_id", "read_at");
