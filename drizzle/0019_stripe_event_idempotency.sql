-- ─────────────────────────────────────────────────────────────
-- Migration 0019 — Stripe Webhook Idempotency
--
-- docs/catalyst-os-scale-readiness-audit.md finding #6: neither the
-- Stripe nor DocuSign webhook handler checks whether an event ID has
-- already been processed before triggering side effects. Stripe
-- redelivers on any non-2xx response or timeout as routine production
-- behavior, not an edge case — today that means a duplicate welcome
-- email, admin notification, or (once wired) a duplicate coach
-- subscription status flip, with nothing preventing it.
--
-- This table is a single, generic gate checked at the top of the
-- Stripe webhook handler (INSERT ... ON CONFLICT DO NOTHING) before
-- any event-type handling runs — it benefits the existing client-
-- payment path and the new coach-subscription path identically.
--
-- Run:
--   node_modules/.bin/tsx --env-file=.env.local scripts/migrate.ts \
--     drizzle/0019_stripe_event_idempotency.sql
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "processed_stripe_events" (
  "stripe_event_id"  text PRIMARY KEY NOT NULL,
  "event_type"        text NOT NULL,
  "processed_at"       timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- ── Row Level Security ────────────────────────────────────────
-- Same reasoning as coach_subscriptions — no policies, full lockout
-- via the Data API. Only the webhook route (service-role) touches this.

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
