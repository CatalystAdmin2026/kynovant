-- AI Program Generator — per-coach generation rate-limit ledger.
-- See lib/db/schema-program-generator.ts's programGenerationQuotaClaims
-- table comment and lib/db/program-generation-service.ts's
-- claimGenerationQuota() for the full design note: why this is a
-- separate ledger from program_generation_runs, and how the atomic
-- per-coach claim (pg_advisory_xact_lock-guarded) works.
--
-- Reuses the existing program_generation_run_scope enum (0017) — no new
-- enum type needed.
--
-- Retention: append-only, no pruning built here on purpose (scope per
-- the launch review that added this note — see git history). The
-- application only ever reads rows newer than the 1-hour quota window
-- (claimGenerationQuota() in lib/db/program-generation-service.ts), so
-- everything older is permanently cold weight. At the current per-coach
-- limit (10/hour) and expected coach counts, growth is on the order of
-- low thousands of rows/month even under sustained heavy legitimate use
-- — not an urgent problem — but this table WILL need a periodic prune
-- (e.g. DELETE WHERE created_at < now() - interval '7 days', on a
-- schedule) before it grows unbounded over the long run. Deliberately
-- not built here — do not add a cron/archival system as part of this
-- migration; track it as a follow-up once real usage volume is known.

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
