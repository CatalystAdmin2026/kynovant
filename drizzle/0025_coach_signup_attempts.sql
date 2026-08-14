-- Self-service coach signup — rate-limit ledger.
-- See lib/db/schema-coach-signup.ts for the full design note.

CREATE TABLE IF NOT EXISTS "coach_signup_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "normalized_email" text NOT NULL,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_coach_signup_attempts_email_created"
  ON "coach_signup_attempts" ("normalized_email", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_coach_signup_attempts_ip_created"
  ON "coach_signup_attempts" ("ip", "created_at");
