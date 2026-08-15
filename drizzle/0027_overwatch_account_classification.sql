DO $$ BEGIN
  CREATE TYPE "public"."account_classification" AS ENUM (
    'customer',
    'internal',
    'test_fixture',
    'founder_admin',
    'demo'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "internal_account_flags" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "classification" "account_classification" NOT NULL DEFAULT 'customer',
  "reason" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_account_flags_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "internal_account_flags"
      ADD CONSTRAINT "internal_account_flags_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_account_flags_reviewed_by_users_id_fk'
  ) THEN
    ALTER TABLE "internal_account_flags"
      ADD CONSTRAINT "internal_account_flags_reviewed_by_users_id_fk"
      FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_internal_account_flags_classification"
  ON "internal_account_flags" ("classification");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "operator_profiles" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "first_name" text,
  "display_name" text,
  "timezone" text DEFAULT 'America/Chicago' NOT NULL,
  "is_founder" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operator_profiles_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "operator_profiles"
      ADD CONSTRAINT "operator_profiles_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
