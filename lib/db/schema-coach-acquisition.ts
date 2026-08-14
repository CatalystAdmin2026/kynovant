// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Acquisition Leads
//
// Durable business funnel record for prospective coach/trainer SaaS
// accounts. This is intentionally separate from coach_signup_attempts:
// attempts are an abuse/rate-limit ledger, while this table records the
// commercial acquisition lifecycle at account level.
//
// Mutable account/billing truth is NOT duplicated here. Activation is
// derived from public.users, and trial/paid/churn state is derived from
// coach_subscriptions. This table only stores first-party acquisition
// facts that would otherwise be lost before an account exists.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const coachAcquisitionLeads = pgTable(
  "coach_acquisition_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normalizedEmail: text("normalized_email").notNull(),
    submittedName: text("submitted_name").notNull(),
    source: text("source").notNull().default("start_trial"),
    firstSignupAt: timestamp("first_signup_at", { withTimezone: true }).notNull().defaultNow(),
    lastSignupAt: timestamp("last_signup_at", { withTimezone: true }).notNull().defaultNow(),
    inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
    inviteStatus: text("invite_status").notNull().default("not_sent"),
    accountUserId: uuid("account_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_coach_acquisition_leads_normalized_email").on(table.normalizedEmail),
    uniqueIndex("uq_coach_acquisition_leads_account_user_id").on(table.accountUserId),
    index("idx_coach_acquisition_leads_first_signup_at").on(table.firstSignupAt),
    index("idx_coach_acquisition_leads_invite_status").on(table.inviteStatus),
  ],
);

export type CoachAcquisitionLead = typeof coachAcquisitionLeads.$inferSelect;
export type NewCoachAcquisitionLead = typeof coachAcquisitionLeads.$inferInsert;
