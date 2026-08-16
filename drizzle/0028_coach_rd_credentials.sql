-- ─────────────────────────────────────────────────────────────
-- Migration 0028 — Coach RD/RDN Credential Gate
--
-- Purely additive. Creates coach_credentials and its two enums.
-- Touches no existing table, column, index, or constraint.
--
-- See lib/db/schema-coach-credentials.ts for the full design note
-- (why status has 3 values not 4, why one row per coach, why
-- issuing_state is text not an enum).
-- ─────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────

CREATE TYPE "public"."coach_credential_type" AS ENUM(
  'rd',
  'rdn'
);--> statement-breakpoint

CREATE TYPE "public"."coach_credential_status" AS ENUM(
  'pending',
  'approved',
  'rejected'
);--> statement-breakpoint

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE "coach_credentials" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id"                    uuid NOT NULL,

  "credential_type"             "coach_credential_type" NOT NULL,
  "license_number"              text NOT NULL,
  "issuing_state"                text NOT NULL,
  "expiration_date"             date NOT NULL,

  "proof_document_storage_key"  text NOT NULL,
  "proof_document_filename"     text NOT NULL,
  "proof_document_mime_type"    text NOT NULL,

  "status"                      "coach_credential_status" NOT NULL DEFAULT 'pending',
  "submitted_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "resubmission_count"          integer NOT NULL DEFAULT 0,

  "reviewed_at"                 timestamp with time zone,
  "reviewed_by"                 uuid,
  "review_notes"                text,

  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "chk_coach_credentials_license_number_not_blank" CHECK (length(trim("license_number")) > 0),
  CONSTRAINT "chk_coach_credentials_issuing_state_not_blank"  CHECK (length(trim("issuing_state")) > 0)
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────

ALTER TABLE "coach_credentials"
  ADD CONSTRAINT "coach_credentials_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_credentials"
  ADD CONSTRAINT "coach_credentials_reviewed_by_fk"
  FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ── Uniqueness: one credential record per coach ─────────────────

CREATE UNIQUE INDEX "uq_coach_credentials_coach_id"
  ON "coach_credentials" ("coach_id");--> statement-breakpoint

-- ── Query indexes ─────────────────────────────────────────────

CREATE INDEX "idx_coach_credentials_status"
  ON "coach_credentials" ("status");--> statement-breakpoint

CREATE INDEX "idx_coach_credentials_expiration"
  ON "coach_credentials" ("expiration_date");--> statement-breakpoint

-- ── Row Level Security ────────────────────────────────────────
-- All application writes/reads use the service-role connection
-- (bypasses RLS) — this is defense-in-depth for any future direct
-- PostgREST/Supabase-JS access, mirroring client_nutrition_targets'
-- policy shape exactly: the row's owner may SELECT their own record,
-- nothing else is exposed at this layer. Review fields (reviewNotes,
-- reviewedBy) are still visible to the coach who owns the row — a
-- coach seeing why their own submission was rejected is intended
-- (the coach HQ submission UI reads this), unlike nutrition_targets'
-- internalNotes, which are coach-facing FOR A CLIENT and must never
-- reach that client.

ALTER TABLE public.coach_credentials ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "coach_credentials_owner_select"
  ON public.coach_credentials
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_id);
