-- ─────────────────────────────────────────────────────────────
-- Migration 0030 — Coach Complimentary Access
--
-- Founder-granted "full Coach HQ access, no billing required"
-- entitlement. Deliberately a separate table from coach_subscriptions
-- (0018_coach_subscriptions.sql), NOT another coach_subscriptions
-- status value — see lib/db/schema-billing.ts's coachComplimentaryAccess
-- header comment for the full reasoning: coach_subscriptions is one row
-- per coach, so a status value there cannot coexist with a real Stripe
-- subscription's own state on the same coach. This table can, by
-- construction: it never reads or writes coach_subscriptions at all.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0030_coach_complimentary_access.sql
-- ─────────────────────────────────────────────────────────────

-- ── Enum ──────────────────────────────────────────────────────

CREATE TYPE "public"."coach_complimentary_access_status" AS ENUM(
  'active',
  'revoked',
  'expired'
);--> statement-breakpoint

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE "coach_complimentary_access" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id"     uuid NOT NULL,

  "status"       "coach_complimentary_access_status" NOT NULL DEFAULT 'active',

  -- Founder-facing note only ("strategic partner," "beta," etc.) —
  -- never shown to the coach.
  "reason"       text,

  "granted_by"   uuid,
  "granted_at"   timestamp with time zone NOT NULL DEFAULT now(),

  -- Null = lifetime / no expiration. Must stay a fully supported state —
  -- never backfilled with a synthetic far-future date.
  "expires_at"   timestamp with time zone,

  "revoked_by"   uuid,
  "revoked_at"   timestamp with time zone,

  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────

ALTER TABLE "coach_complimentary_access"
  ADD CONSTRAINT "coach_complimentary_access_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_complimentary_access"
  ADD CONSTRAINT "coach_complimentary_access_granted_by_fk"
  FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_complimentary_access"
  ADD CONSTRAINT "coach_complimentary_access_revoked_by_fk"
  FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ── Partial unique index ──────────────────────────────────────
-- At most one ACTIVE grant per coach at a time. Multiple historical
-- (revoked/expired) rows for the same coach are unaffected — this only
-- ever guards against two simultaneously-active rows. Same pattern as
-- client_programs' uq_client_active_program (schema-program.ts).

CREATE UNIQUE INDEX "uq_coach_complimentary_access_active_coach"
  ON "coach_complimentary_access" ("coach_id")
  WHERE "status" = 'active';--> statement-breakpoint

-- ── Query indexes ─────────────────────────────────────────────

CREATE INDEX "idx_coach_complimentary_access_coach_id"
  ON "coach_complimentary_access" ("coach_id");--> statement-breakpoint

CREATE INDEX "idx_coach_complimentary_access_status"
  ON "coach_complimentary_access" ("status");--> statement-breakpoint

-- ── Row Level Security ────────────────────────────────────────
-- No policies defined — enabling RLS with zero policies denies all
-- access via the Supabase Data API by default. Server reads/writes go
-- through Drizzle's service-role connection, which bypasses RLS
-- entirely — same posture as coach_subscriptions (0018) and every other
-- internal-only table in this schema.

ALTER TABLE public.coach_complimentary_access ENABLE ROW LEVEL SECURITY;
