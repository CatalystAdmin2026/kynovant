-- ─────────────────────────────────────────────────────────────
-- Migration 0018 — Coach Subscription Entitlements
--
-- Kynovant SaaS billing state for coaches (distinct from the existing
-- Stripe wiring, which models Catalyst Elite's own end-client coaching
-- packages — see lib/stripe.ts and app/api/stripe/webhook/route.ts).
--
-- docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md §6,
-- §9 item 4: "role='coach' alone no longer grants indefinite access;
-- billing status is checked." This table is the typed store that
-- backs that check (chosen over reusing external_identities.metadata
-- because entitlement lookups run on every /hq request — a typed
-- status column beats filtering jsonb on that hot path).
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0018_coach_subscriptions.sql
-- ─────────────────────────────────────────────────────────────

-- ── Enum ──────────────────────────────────────────────────────

CREATE TYPE "public"."coach_subscription_status" AS ENUM(
  'manually_activated',
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);--> statement-breakpoint

-- ── Table ─────────────────────────────────────────────────────

CREATE TABLE "coach_subscriptions" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_id"                 uuid NOT NULL,

  -- Null for manually-activated coaches with no real Stripe subscription.
  "stripe_customer_id"       text,
  "stripe_subscription_id"   text,
  "stripe_price_id"          text,

  "status"                   "coach_subscription_status" NOT NULL,

  "current_period_start"     timestamp with time zone,
  "current_period_end"       timestamp with time zone,

  -- Set on first transition into past_due; drives the 7-day grace window.
  "grace_period_end"         timestamp with time zone,

  "cancel_at_period_end"     boolean NOT NULL DEFAULT false,
  "cancelled_at"             timestamp with time zone,

  -- Admin who manually activated this coach; null when Stripe-driven.
  "activated_by"             uuid,

  -- Last Stripe event ID that updated this row (observability only —
  -- the duplicate-delivery guard is processed_stripe_events, not this).
  "last_processed_event_id"  text,

  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────

ALTER TABLE "coach_subscriptions"
  ADD CONSTRAINT "coach_subscriptions_coach_id_fk"
  FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "coach_subscriptions"
  ADD CONSTRAINT "coach_subscriptions_activated_by_fk"
  FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ── Unique indexes ────────────────────────────────────────────
-- One subscription row per coach. Postgres treats NULLs as distinct
-- in a unique index, so multiple manually-activated rows (null
-- stripe_subscription_id) never conflict with each other.

CREATE UNIQUE INDEX "uq_coach_subscriptions_coach_id"
  ON "coach_subscriptions" ("coach_id");--> statement-breakpoint

CREATE UNIQUE INDEX "uq_coach_subscriptions_stripe_subscription_id"
  ON "coach_subscriptions" ("stripe_subscription_id");--> statement-breakpoint

-- ── Query index ───────────────────────────────────────────────

CREATE INDEX "idx_coach_subscriptions_status"
  ON "coach_subscriptions" ("status");--> statement-breakpoint

-- ── Row Level Security ────────────────────────────────────────
-- No policies defined — enabling RLS with zero policies denies all
-- access via the Supabase Data API by default. Server reads/writes
-- go through Drizzle's service-role connection, which bypasses RLS
-- entirely (see docs/catalyst-os-authentication.md), so this is a
-- deliberate full lockout of the anon/authenticated client paths for
-- a table that should never be queried that way.

ALTER TABLE public.coach_subscriptions ENABLE ROW LEVEL SECURITY;
