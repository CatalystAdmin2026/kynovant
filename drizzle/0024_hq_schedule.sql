-- Kynovant native Coach HQ scheduling.
-- No external calendar sync is introduced here.

CREATE TYPE "public"."coach_appointment_status" AS ENUM (
  'scheduled',
  'completed',
  'cancelled'
);

CREATE TYPE "public"."coach_appointment_category" AS ENUM (
  'consultation',
  'check_in',
  'training',
  'nutrition',
  'admin',
  'personal',
  'other'
);

CREATE TABLE "coach_appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "title" text,
  "category" "coach_appointment_category" NOT NULL DEFAULT 'consultation',
  "status" "coach_appointment_status" NOT NULL DEFAULT 'scheduled',
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "private_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_coach_appointment_time_order" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "idx_coach_appointments_coach_start"
  ON "coach_appointments" ("coach_id", "starts_at");

CREATE INDEX "idx_coach_appointments_coach_status"
  ON "coach_appointments" ("coach_id", "status");

CREATE INDEX "idx_coach_appointments_client_id"
  ON "coach_appointments" ("client_id");
