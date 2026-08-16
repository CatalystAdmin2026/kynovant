-- AI Program Generator — per-coach generation rate-limit ledger.
-- See lib/db/schema-program-generator.ts's programGenerationQuotaClaims
-- table comment and lib/db/program-generation-service.ts's
-- claimGenerationQuota() for the full design note: why this is a
-- separate ledger from program_generation_runs, and how the atomic
-- per-coach claim (pg_advisory_xact_lock-guarded) works.
--
-- Reuses the existing program_generation_run_scope enum (0017) — no new
-- enum type needed.

CREATE TABLE IF NOT EXISTS "program_generation_quota_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id" uuid NOT NULL,
  "draft_id" uuid,
  "scope" "program_generation_run_scope" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "program_generation_quota_claims"
  ADD CONSTRAINT "program_generation_quota_claims_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "program_generation_quota_claims"
  ADD CONSTRAINT "program_generation_quota_claims_draft_id_fk"
  FOREIGN KEY ("draft_id") REFERENCES "public"."program_generation_drafts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_program_generation_quota_claims_coach_created"
  ON "program_generation_quota_claims" ("coach_id", "created_at");
--> statement-breakpoint

ALTER TABLE public.program_generation_quota_claims ENABLE ROW LEVEL SECURITY;
