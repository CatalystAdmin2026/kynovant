// ─────────────────────────────────────────────────────────────
// Catalyst OS — Coach Billing Schema (Kynovant SaaS entitlements)
//
// SERVER-ONLY — never import from a Client Component.
//
// Tables:
//   coach_subscriptions    — one row per coach, current billing state
//   processed_stripe_events — global webhook idempotency ledger
//
// Design (docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md
// §6, docs/catalyst-os-scale-readiness-audit.md finding #6):
//   coach_subscriptions is a typed table (not external_identities.metadata)
//   because entitlement checks run on every /hq request — a typed status
//   column beats filtering jsonb on that hot path.
//
//   processed_stripe_events is a single, generic idempotency gate shared
//   by every webhook event this app handles (both the existing client-
//   payment path and the coach-subscription path below) — Stripe
//   redelivers on any non-2xx response or timeout as routine behavior,
//   not an edge case, so this is checked before any side effect runs.
// ─────────────────────────────────────────────────────────────

import "server-only";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

// manually_activated: an admin granted access with no real Stripe
//   subscription behind it (Founding Coach comp access, beta).
// trialing / active / past_due / cancelled: mirror Stripe's own
//   subscription.status, written by the webhook handler.
// suspended: app-level only, never set directly from a Stripe event —
//   either an explicit admin override, or the lazy transition
//   getCoachEntitlement() applies once a past_due row's 7-day grace
//   period has elapsed (no background job runner exists yet to do
//   this on a schedule; entitlement checks apply it on read instead).
export const coachSubscriptionStatusEnum = pgEnum("coach_subscription_status", [
  "manually_activated",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "suspended",
]);

// ─────────────────────────────────────────────────────────────
// TABLE — coach_subscriptions
//
// One row per coach (unique coachId), upserted by the Stripe webhook
// handler or by an admin's manual activation/suspension action.
//
// FK behavior:
//   coachId     → RESTRICT : billing state tied to a real coach account
//   activatedBy → SET NULL : admin who manually activated; audit only
// ─────────────────────────────────────────────────────────────

export const coachSubscriptions = pgTable(
  "coach_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // Null for manually-activated coaches with no real Stripe subscription.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),

    status: coachSubscriptionStatusEnum("status").notNull(),

    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    // Set when a row first transitions into past_due; used by
    // getCoachEntitlement() to determine whether the 7-day grace window
    // is still open. Not refreshed on repeated past_due webhook replays
    // for the same billing failure — only on a fresh transition into it.
    gracePeriodEnd: timestamp("grace_period_end", { withTimezone: true }),

    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    // Which admin manually activated this coach — null when the row's
    // current state was last written by a real Stripe webhook event.
    activatedBy: uuid("activated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Informational — the last Stripe event ID that updated this row.
    // The actual duplicate-delivery guard is processed_stripe_events
    // below; this is per-row observability, not the dedup mechanism.
    lastProcessedEventId: text("last_processed_event_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_coach_subscriptions_coach_id").on(table.coachId),
    // Postgres treats NULLs as distinct in a unique index, so this does
    // not conflict across multiple manually-activated (null) rows.
    uniqueIndex("uq_coach_subscriptions_stripe_subscription_id").on(
      table.stripeSubscriptionId,
    ),
    index("idx_coach_subscriptions_status").on(table.status),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE — processed_stripe_events
//
// Append-only. One row per Stripe event ID ever successfully routed
// through the webhook handler. Checked via INSERT ... ON CONFLICT DO
// NOTHING before any side effect runs; zero rows returned means this
// event was already processed and the handler short-circuits.
// ─────────────────────────────────────────────────────────────

export const processedStripeEvents = pgTable("processed_stripe_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// INFERRED TYPESCRIPT TYPES
// ─────────────────────────────────────────────────────────────

export type CoachSubscription = typeof coachSubscriptions.$inferSelect;
export type NewCoachSubscription = typeof coachSubscriptions.$inferInsert;
export type CoachSubscriptionStatus =
  (typeof coachSubscriptionStatusEnum.enumValues)[number];

export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;
export type NewProcessedStripeEvent = typeof processedStripeEvents.$inferInsert;
