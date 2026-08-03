-- ─────────────────────────────────────────────────────────────
-- Kynovant — Reconcile `applications` With the Coach-Apply Schema
--
-- Context: drizzle/0015_applications_pipeline.sql, as originally
-- committed and applied to production, modeled `applications` around
-- Jermaine's personal client-coaching application fields
-- (full_name/primary_goal/readiness/budget_range/goals_details/
-- referral_source/referral_name). That table's public intake has
-- since been corrected to be exclusively /coach-apply (Kynovant SaaS
-- coach applications) — see lib/db/schema-applications.ts and
-- docs/applications-pipeline.md. 0015 itself was NOT edited to match
-- (it must never be, once applied) — this migration brings the
-- already-live table up to the current Drizzle schema instead.
--
-- REVISION NOTE: an earlier draft of this migration renamed
-- primary_goal → business_stage and readiness → client_count
-- directly. That was wrong and has been replaced with the design
-- below — a fitness goal ("Fat loss") and a business-maturity answer
-- ("Just getting started") are not the same fact under a different
-- label; renaming would have made the one existing legacy row (a
-- personal-coaching applicant, source = 'apply_page') display as if
-- it had answered Kynovant SaaS application questions it was never
-- asked. See "Column strategy" below for the corrected approach.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0016_applications_coach_fields.sql
--
-- Column strategy:
--   - full_name → name: RENAME. "Applicant's name" means the same
--     thing regardless of which form asked for it — no semantic risk.
--   - business_stage, client_count, context: NEW, NULLABLE columns —
--     not renames of primary_goal/readiness/goals_details. A row's
--     `source` is the only trustworthy signal of which world it came
--     from, so these are backfilled from the old columns ONLY where
--     source = 'coach_apply' (i.e. only if a row genuinely could have
--     been asked the coach-apply questions under the old column
--     names — a defensive case this dataset doesn't currently
--     contain, since the one existing row has source = 'apply_page').
--     For every row where that condition doesn't hold, these three
--     columns are left NULL — an honest "not asked this," never a
--     guessed or relabeled answer.
--   - primary_goal, readiness, goals_details, budget_range,
--     referral_name: archived verbatim into the new legacy_fields
--     jsonb column, then dropped. None of the five is assumed to map
--     onto any new column — this is pure preservation, not judgment
--     about validity.
--   - referral_source, email, normalized_email, phone, status,
--     reviewed_by, review_notes, sheet_synced_at, resubmission_count,
--     submitter_ip, created_at, updated_at, id: unchanged. Not
--     referenced by any statement below.
--   - source: DEFAULT changes from 'apply_page' to 'coach_apply' for
--     FUTURE inserts only. No existing row's stored `source` value is
--     ever rewritten — that would falsify what's actually true about
--     its history, which is exactly the failure mode this revision
--     exists to avoid repeating.
--
-- Treatment of the one known existing row (source = 'apply_page'):
--   name          ← renamed from full_name, preserved
--   business_stage, client_count, context  → NULL (correctly — this
--     applicant was never asked these questions; nothing is guessed)
--   legacy_fields → { primaryGoal, readiness, goalsDetails,
--     budgetRange, referralName } — everything it originally
--     submitted, preserved verbatim
--   source        → stays 'apply_page', not rewritten
--   Every other column: untouched.
--
-- Idempotency: every statement is guarded (information_schema
-- existence checks for the rename, IF NOT EXISTS / IF EXISTS for
-- add/drop, `legacy_fields IS NULL` for the archival UPDATE,
-- COALESCE for the conditional backfill UPDATE) so re-running this
-- file after a partial or full previous run is a safe no-op.
--
-- Scope: touches only the `applications` table.
--
-- Risk profile:
--   - Rename + additive nullable columns: no data loss, no risk.
--   - Two UPDATEs before the DROPs: read the old columns, write only
--     to legacy_fields/business_stage/client_count/context — never
--     touch primary_goal/readiness/goals_details/budget_range/
--     referral_name themselves, so nothing is lost before the DROP
--     that follows in the same run.
--   - DROP COLUMN on the five legacy-only columns: irreversible for
--     those specific typed columns, but every value was archived into
--     legacy_fields immediately before, in the same run.
-- ─────────────────────────────────────────────────────────────

-- 1. full_name → name (safe rename — see "Column strategy" above)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'full_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'name'
  ) THEN
    ALTER TABLE "applications" RENAME COLUMN "full_name" TO "name";
  END IF;
END $$;
--> statement-breakpoint

-- 2. New, nullable SaaS-application columns — NOT renamed from the
-- old client-coaching columns. Null is the correct default; it means
-- "not a coach-apply row," not "data missing."
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "business_stage" text;
--> statement-breakpoint

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "client_count" text;
--> statement-breakpoint

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "context" text;
--> statement-breakpoint

-- 3. Archive column for every legacy field with no coach-apply
-- equivalent.
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "legacy_fields" jsonb;
--> statement-breakpoint

-- 4. Archive the legacy client-coaching values (unconditional — every
-- row's original answers are preserved regardless of source), then
-- backfill the new SaaS columns ONLY where source proves coach-apply
-- provenance. Both statements are no-ops on rerun: the first via the
-- legacy_fields IS NULL guard, the second via COALESCE.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'primary_goal'
  ) THEN
    UPDATE "applications"
    SET "legacy_fields" = jsonb_strip_nulls(
      jsonb_build_object(
        'primaryGoal',   "primary_goal",
        'readiness',     "readiness",
        'goalsDetails',  "goals_details",
        'budgetRange',   "budget_range",
        'referralName',  "referral_name"
      )
    )
    WHERE "legacy_fields" IS NULL;

    UPDATE "applications"
    SET
      "business_stage" = COALESCE("business_stage", "primary_goal"),
      "client_count"   = COALESCE("client_count", "readiness"),
      "context"        = COALESCE("context", "goals_details")
    WHERE "source" = 'coach_apply';
  END IF;
END $$;
--> statement-breakpoint

-- 5. Drop the now-archived legacy-only columns. Every value that was
-- ever in these five columns is preserved in legacy_fields (step 4).
ALTER TABLE "applications" DROP COLUMN IF EXISTS "primary_goal";
--> statement-breakpoint

ALTER TABLE "applications" DROP COLUMN IF EXISTS "readiness";
--> statement-breakpoint

ALTER TABLE "applications" DROP COLUMN IF EXISTS "goals_details";
--> statement-breakpoint

ALTER TABLE "applications" DROP COLUMN IF EXISTS "budget_range";
--> statement-breakpoint

ALTER TABLE "applications" DROP COLUMN IF EXISTS "referral_name";
--> statement-breakpoint

-- 6. Update the default for future inserts only — does not rewrite
-- any existing row's stored `source` value.
ALTER TABLE "applications" ALTER COLUMN "source" SET DEFAULT 'coach_apply';
