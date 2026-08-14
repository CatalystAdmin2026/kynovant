// ─────────────────────────────────────────────────────────────
// Kynovant — Self-Service Coach Signup: Service Layer
//
// SERVER-ONLY — never import from a Client Component.
//
// Backs the public, unauthenticated POST /api/coach-signup route
// (app/api/coach-signup/route.ts) — the self-service replacement for
// "apply and wait for a founder to review it." Two concerns live
// here, deliberately kept separate from provisioning:
//
//   1. Rate limiting — recordSignupAttempt() / countRecent*() —
//      mirrors lib/db/application-service.ts's IP-based limiter, plus
//      a second limiter by email (an application form leaking a few
//      extra rows is low-stakes; this endpoint sends real email and
//      creates real Supabase Auth users, so it gets a second guard
//      an attacker can't route around by rotating IPs alone).
//
//   2. findExistingAccountByEmail() — the pre-flight duplicate-account
//      check. Never used to grant or change a role — only to decide
//      whether to call inviteUserByEmail at all and what message the
//      caller sees. See lib/db/coach-provisioning-service.ts for the
//      actual role-granting logic, which never reads this function's
//      result to decide what role to assign.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { users } from "./schema";
import { coachSignupAttempts } from "./schema-coach-signup";

export interface ExistingAccount {
  id: string;
  role: "client" | "coach" | "admin";
  status: "invited" | "active" | "suspended" | "archived";
}

// Looks up any pre-existing public.users row for this email, regardless
// of role or status. Read-only — callers decide what to do with the
// result; this function never mutates anything.
export async function findExistingAccountByEmail(
  normalizedEmail: string,
): Promise<ExistingAccount | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.normalizedEmail, normalizedEmail))
    .limit(1);
  return row ?? null;
}

// Records one attempt (called once per POST, after basic validation
// passes and before the rate-limit check's result is trusted for the
// rest of the request) — see the route for exact placement.
export async function recordSignupAttempt(
  normalizedEmail: string,
  ip: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(coachSignupAttempts).values({ normalizedEmail, ip });
}

// Never throws — a DB hiccup on the rate-limit read should not block a
// legitimate signup (same fail-open posture as
// application-service.ts's countRecentApplicationsByIp).
export async function countRecentAttemptsByIp(
  ip: string | null,
  sinceMs: number,
): Promise<number> {
  if (!ip) return 0;
  const db = getDb();
  const cutoff = new Date(Date.now() - sinceMs);
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coachSignupAttempts)
      .where(and(eq(coachSignupAttempts.ip, ip), gt(coachSignupAttempts.createdAt, cutoff)));
    return row?.count ?? 0;
  } catch (err) {
    console.error("[CoachSignup] countRecentAttemptsByIp failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function countRecentAttemptsByEmail(
  normalizedEmail: string,
  sinceMs: number,
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - sinceMs);
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coachSignupAttempts)
      .where(
        and(
          eq(coachSignupAttempts.normalizedEmail, normalizedEmail),
          gt(coachSignupAttempts.createdAt, cutoff),
        ),
      );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[CoachSignup] countRecentAttemptsByEmail failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
