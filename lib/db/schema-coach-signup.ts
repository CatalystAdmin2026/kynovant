// ─────────────────────────────────────────────────────────────
// Kynovant — Self-Service Coach Signup: Rate-Limit Ledger
//
// SERVER-ONLY — never import this file from a Client Component.
//
// Table: coach_signup_attempts — one row per POST to
// /api/coach-signup, recorded regardless of outcome (validation
// failure, duplicate email, invite success). This is the abuse
// surface for a public, unauthenticated endpoint that creates real
// Supabase Auth users and sends real email — the DB-backed rate
// limit in lib/db/coach-signup-service.ts reads this table, mirroring
// the pattern already proven by lib/db/application-service.ts's
// countRecentApplicationsByIp (same "no new infrastructure" approach).
//
// Two independent limiters read this table:
//   - by IP:    stops one source from hammering the endpoint.
//   - by email: stops an attacker from email-bombing a victim address
//     with repeated Supabase invite emails from many different IPs.
//
// Deliberately NOT a general audit log — no outcome/status column.
// If a future need arises to distinguish "invited" vs "duplicate" vs
// "rejected" attempts, add it then; this table only needs to answer
// "how many attempts recently, from this IP / for this email."
// ─────────────────────────────────────────────────────────────

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const coachSignupAttempts = pgTable(
  "coach_signup_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normalizedEmail: text("normalized_email").notNull(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_coach_signup_attempts_email_created").on(table.normalizedEmail, table.createdAt),
    index("idx_coach_signup_attempts_ip_created").on(table.ip, table.createdAt),
  ],
);

export type CoachSignupAttempt = typeof coachSignupAttempts.$inferSelect;
export type NewCoachSignupAttempt = typeof coachSignupAttempts.$inferInsert;
