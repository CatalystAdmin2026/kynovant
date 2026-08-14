-- Kynovant coach acquisition funnel.
-- Durable business funnel record for /start-trial submissions.
-- This intentionally does not store IP addresses; abuse metadata stays
-- in coach_signup_attempts.

CREATE TABLE IF NOT EXISTS "coach_acquisition_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "normalized_email" text NOT NULL,
  "submitted_name" text NOT NULL,
  "source" text DEFAULT 'start_trial' NOT NULL,
  "first_signup_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_signup_at" timestamp with time zone DEFAULT now() NOT NULL,
  "invite_sent_at" timestamp with time zone,
  "invite_status" text DEFAULT 'not_sent' NOT NULL,
  "account_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "coach_acquisition_leads"
  ADD CONSTRAINT "coach_acquisition_leads_account_user_id_fk"
  FOREIGN KEY ("account_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_coach_acquisition_leads_normalized_email"
  ON "coach_acquisition_leads" ("normalized_email");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_coach_acquisition_leads_account_user_id"
  ON "coach_acquisition_leads" ("account_user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_coach_acquisition_leads_first_signup_at"
  ON "coach_acquisition_leads" ("first_signup_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_coach_acquisition_leads_invite_status"
  ON "coach_acquisition_leads" ("invite_status");
--> statement-breakpoint

ALTER TABLE public.coach_acquisition_leads ENABLE ROW LEVEL SECURITY;
