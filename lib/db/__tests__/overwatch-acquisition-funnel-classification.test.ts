// ─────────────────────────────────────────────────────────────
// Overwatch acquisition funnel — fixture/classification exclusion,
// real-DB test suite
//
// Exercises the REAL getOverwatchMetrics() (lib/db/overwatch-service.ts)
// against a real database connection — not a re-implementation of its
// SQL. overwatch-service-runtime.test.ts's existing "excludes unlinked
// invalid-domain fixture leads from acquisition counts" test only reads
// the source file as a string; it never executed the query, so it
// passed even while the predicate it was "guarding" was structurally
// broken. This suite proves the actual boolean behavior end-to-end.
//
// PRODUCTION INCIDENT THIS SUITE GUARDS AGAINST:
//   acquisitionLeadPredicate()'s second OR branch read
//   `coalesce(internalAccountFlags.classification, 'customer') = 'customer'`
//   with no accountUserId guard. Both joins feeding internalAccountFlags
//   are LEFT JOINs, so any lead with no linked account (accountUserId
//   IS NULL — true of every @isolation-test.invalid signup-flow
//   fixture, since those leads intentionally never complete signup)
//   produced a NULL classification, and coalesce(NULL, 'customer')
//   always evaluates to 'customer' — making the second branch
//   unconditionally true for every unlinked lead and silently
//   defeating the first branch's @isolation-test.invalid exclusion.
//   Confirmed against production before this fix: all 16 of 16 known
//   @isolation-test.invalid fixture leads were counted as real
//   acquisition funnel activity (Started Signup = 16, Invite Sent = 8,
//   with zero real leads in the table).
//
// Because getOverwatchMetrics() computes PRODUCTION-WIDE counts (no
// scoping parameter), this suite never asserts on absolute totals —
// only on the DELTA a single controlled fixture insert causes, and on
// membership of specific fixture ids in `recentLeads`. This is the same
// "safe against ambient real data" discipline as
// repair-orphaned-system-exercises.test.ts and classify-overwatch-
// fixtures.test.ts.
//
// Requires DATABASE_URL_DIRECT — vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { getDb } from "../client";
import { coachAcquisitionLeads } from "../schema-coach-acquisition";
import { internalAccountFlags } from "../schema-overwatch-ops";
import { getOverwatchMetrics } from "../overwatch-service";
import { createAdminClient } from "@/lib/supabase/admin";

const db = getDb();

const createdLeadIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdLeadIds.length > 0) {
    await db.delete(coachAcquisitionLeads).where(inArray(coachAcquisitionLeads.id, createdLeadIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(internalAccountFlags).where(inArray(internalAccountFlags.userId, createdUserIds));
    const supa = createAdminClient();
    await Promise.all(createdUserIds.map((id) => supa.auth.admin.deleteUser(id).catch(() => {})));
  }
});

async function insertLead(overrides: {
  normalizedEmail: string;
  submittedName: string;
  accountUserId?: string | null;
}) {
  const [row] = await db
    .insert(coachAcquisitionLeads)
    .values({
      normalizedEmail: overrides.normalizedEmail,
      submittedName: overrides.submittedName,
      accountUserId: overrides.accountUserId ?? null,
    })
    .returning();
  createdLeadIds.push(row.id);
  return row;
}

async function createUser(email: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${email}) — ${error?.message}`);
  }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe("acquisitionLeadPredicate (via getOverwatchMetrics) — fixture/classification exclusion", () => {
  it("an unlinked lead with a real-looking domain COUNTS toward the funnel and appears in recentLeads", async () => {
    const before = await getOverwatchMetrics();
    const lead = await insertLead({
      normalizedEmail: `real-prospect-${randomUUID()}@gmail.com`,
      submittedName: "Real Prospect",
    });

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup + 1);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(true);
  });

  it("an unlinked lead on @isolation-test.invalid is EXCLUDED from the funnel (the bug this suite guards)", async () => {
    const before = await getOverwatchMetrics();
    const lead = await insertLead({
      normalizedEmail: `predicate-regression-test-${randomUUID()}@isolation-test.invalid`,
      submittedName: "Predicate Regression Test",
    });

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(false);
  });

  it("a lead linked to an account with default (customer) classification COUNTS", async () => {
    const before = await getOverwatchMetrics();
    const userId = await createUser(`linked-customer-lead-${randomUUID()}@gmail.com`);
    const lead = await insertLead({
      normalizedEmail: `linked-customer-lead-source-${randomUUID()}@gmail.com`,
      submittedName: "Linked Customer Lead",
      accountUserId: userId,
    });

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup + 1);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(true);
  });

  it("a lead linked to an account classified test_fixture is EXCLUDED, even on a real-looking domain", async () => {
    const before = await getOverwatchMetrics();
    const userId = await createUser(`linked-fixture-account-${randomUUID()}@gmail.com`);
    await db.insert(internalAccountFlags).values({
      userId,
      classification: "test_fixture",
      reason: "test fixture for overwatch-acquisition-funnel-classification.test.ts",
    });
    const lead = await insertLead({
      normalizedEmail: `linked-fixture-lead-source-${randomUUID()}@gmail.com`,
      submittedName: "Linked Fixture Lead",
      accountUserId: userId,
    });

    const after = await getOverwatchMetrics();
    expect(after.acquisition.startedSignup).toBe(before.acquisition.startedSignup);
    expect(after.acquisition.recentLeads.some((l) => l.id === lead.id)).toBe(false);
  });
});
