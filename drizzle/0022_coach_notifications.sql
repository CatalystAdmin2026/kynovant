-- Coach-facing HQ notifications.
-- Separate from client_notifications, which powers the client portal.

CREATE TABLE IF NOT EXISTS "coach_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "resource_type" text,
  "resource_id" uuid,
  "title" text NOT NULL,
  "body" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_coach_notifications_coach_created"
  ON "coach_notifications" ("coach_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_coach_notifications_unread"
  ON "coach_notifications" ("coach_id", "read_at");

CREATE INDEX IF NOT EXISTS "idx_coach_notifications_event_type"
  ON "coach_notifications" ("event_type");
