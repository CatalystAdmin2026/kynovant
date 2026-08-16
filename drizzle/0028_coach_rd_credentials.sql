-- ─────────────────────────────────────────────────────────────
-- Migration 0028 — Coach RD/RDN Credential Gate
--
-- Purely additive. Creates coach_credentials, coach_credential_reviews,
-- and three enums. Touches no existing table, column, index, or
-- constraint.
--
-- See lib/db/schema-coach-credentials.ts for the full design note
-- (why status has 3 values not 4, why coach_credentials is one row
-- per coach while coach_credential_reviews is append-only, why
-- issuing_state is text not an enum, and the automation-readiness
-- columns' rationale) — also docs/ARCHITECTURE_DECISIONS.md ADR-015.
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

-- Who/what performed a review-history event. 'human' for every event
-- today (Phase 1 has no automated verifier) — see ADR-015. Not the
-- same as coach_credential_status: an event's action (below) is the
-- decision; performed_by_type is who/what made it.
CREATE TYPE "public"."coach_credential_review_actor_type" AS ENUM(
  'human',
  'automated'
);--> statement-breakpoint

-- ── Table: coach_credentials (current state, one row per coach) ─

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

  -- ── Automation-readiness (Phase 1: populated by manual review only;
  -- see ADR-015 and coach-credential-verifier.ts for the future
  -- automated-verification interface these exist to support without a
  -- later rewrite) ──
  --
  -- verification_method: how the CURRENT status was established.
  -- Text, not an enum — same reasoning as issuing_state: the set of
  -- verification methods is open-ended and will grow as verification
  -- providers are added, and the app does not branch logic on this
  -- value today. 'manual_review' for every row in Phase 1.
  "verification_method"         text,
  -- last_verified_at: distinct from reviewed_at. reviewed_at means "an
  -- admin looked at this submission"; last_verified_at means "the
  -- current status was last positively established as correct" —
  -- today those happen at the same instant (a human reviewer's
  -- approval IS the verification), but they are different concepts so
  -- a future automated verifier can set this without going through
  -- the admin review action.
  "last_verified_at"            timestamp with time zone,
  -- manual_review_required: the exception-queue flag. Always true in
  -- Phase 1 (no automated path exists to ever set it false). A future
  -- automated verifier sets this false only for a high-confidence,
  -- authoritative match; ambiguous/unavailable/mismatched results
  -- leave it true, routing the submission to the same admin review
  -- queue that handles 100% of submissions today.
  "manual_review_required"      boolean NOT NULL DEFAULT true,
  -- next_reverification_at: unused in Phase 1 (no reverification job
  -- exists yet) — present so periodic-reverification scheduling can
  -- be added additively later without a schema change.
  "next_reverification_at"      date,

  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "chk_coach_credentials_license_number_not_blank" CHECK (length(trim("license_number")) > 0),
  CONSTRAINT "chk_coach_credentials_issuing_state_not_blank"  CHECK (length(trim("issuing_state")) > 0)
);--> statement-breakpoint

-- ── Table: coach_credential_reviews (append-only event history) ─
--
-- Every submission and every review decision is logged here as an
-- immutable event, keyed to the coach_credentials row it concerned at
-- the time. coach_credentials itself stays one-row-per-coach (upsert
-- in place on resubmission — required for isVerifiedRd()'s O(1) gate
-- lookup and for "current status" to have one unambiguous answer);
-- this table is what makes that upsert non-destructive: the reviewer,
-- decision, method, and notes of every past review survive a
-- resubmission even though the parent row's own reviewed_at/
-- reviewed_by/review_notes get overwritten. See ADR-015 for why this
-- split (current-state row + append-only event log), not a single
-- versioned/append-only coach_credentials table, is the smallest
-- durable model for this domain.
--
-- Does NOT snapshot the submitted license_number/proof_document
-- fields at event time — only the decision metadata (who/what,
-- when, what method, what result, what notes). If a future compliance
-- need requires point-in-time field snapshots too, add them as new
-- nullable columns here additively; do not widen coach_credentials
-- itself for that.
CREATE TABLE "coach_credential_reviews" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credential_id"         uuid NOT NULL,
  "coach_id"              uuid NOT NULL,

  -- 'submitted' | 'approved' | 'rejected' — deliberately the same
  -- vocabulary as coach_credential_status's non-default values, plus
  -- 'submitted' for the event a review status enum has no room for.
  -- Kept as text (not a 4th enum) since this must also accommodate
  -- future automated-verification outcomes without a migration —
  -- see coach-credential-verifier.ts.
  "action"                text NOT NULL,

  "verification_method"   text,
  "verification_source"   text,
  "external_reference"    text,
  "reason_code"           text,
  "notes"                 text,

  "performed_by"          uuid,
  "performed_by_type"     "coach_credential_review_actor_type" NOT NULL DEFAULT 'human',

  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "chk_coach_credential_reviews_action_known" CHECK (
    "action" IN ('submitted', 'approved', 'rejected')
  )
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────

ALTER TABLE "coach_credentials"
  ADD CONSTRAINT "coach_credentials_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_credentials"
  ADD CONSTRAINT "coach_credentials_reviewed_by_fk"
  FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_credential_reviews"
  ADD CONSTRAINT "coach_credential_reviews_credential_id_fk"
  FOREIGN KEY ("credential_id") REFERENCES "public"."coach_credentials"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_credential_reviews"
  ADD CONSTRAINT "coach_credential_reviews_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_credential_reviews"
  ADD CONSTRAINT "coach_credential_reviews_performed_by_fk"
  FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ── Uniqueness: one CURRENT credential record per coach ──────────

CREATE UNIQUE INDEX "uq_coach_credentials_coach_id"
  ON "coach_credentials" ("coach_id");--> statement-breakpoint

-- ── Query indexes ─────────────────────────────────────────────

CREATE INDEX "idx_coach_credentials_status"
  ON "coach_credentials" ("status");--> statement-breakpoint

CREATE INDEX "idx_coach_credentials_expiration"
  ON "coach_credentials" ("expiration_date");--> statement-breakpoint

CREATE INDEX "idx_coach_credentials_manual_review_required"
  ON "coach_credentials" ("manual_review_required")
  WHERE "manual_review_required" = true;--> statement-breakpoint

CREATE INDEX "idx_coach_credential_reviews_credential_id"
  ON "coach_credential_reviews" ("credential_id");--> statement-breakpoint

CREATE INDEX "idx_coach_credential_reviews_coach_id"
  ON "coach_credential_reviews" ("coach_id");--> statement-breakpoint

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
  USING (auth.uid() = coach_id);--> statement-breakpoint

ALTER TABLE public.coach_credential_reviews ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "coach_credential_reviews_owner_select"
  ON public.coach_credential_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_id);
