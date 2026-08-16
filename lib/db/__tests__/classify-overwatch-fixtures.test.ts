// ─────────────────────────────────────────────────────────────
// Overwatch V2 fixture classifier — real-DB test suite
//
// Exercises scripts/repairs/overwatch-fixture-classification.ts's
// exported functions directly — the same module the CLI script
// (scripts/repairs/classify-overwatch-fixtures.ts) imports — so these
// tests verify the actual matching/classification query, never a
// re-implementation of it. Uses a raw `postgres` connection
// (DATABASE_URL_DIRECT), matching how the CLI script itself connects,
// rather than drizzle's pooled client — the module's functions are
// typed against postgres.Sql, not drizzle's query builder. Same shape
// as lib/db/__tests__/repair-orphaned-system-exercises.test.ts.
//
// PRODUCTION INCIDENT THIS SUITE GUARDS AGAINST:
//   The original script built its query with drizzle-orm's `sql` tag
//   using `unnest(${FIXTURE_PATTERNS}::text[])`. Drizzle's tag binds an
//   interpolated JS array as a single parenthesized record/tuple
//   parameter rather than a Postgres array literal, so every call
//   failed with "cannot cast type record to text[]" (42846) before it
//   could return a single row — dry-run mode was completely non-
//   functional. Fixed by moving to a raw postgres.js connection (whose
//   own tag serializes JS arrays correctly) — see overwatch-fixture-
//   classification.ts's header for the full explanation.
//
// SAFETY: every test below passes `restrictToUserIds`, naming exactly
// the fixture user id(s) it just created. Unlike orphaned-system-
// exercises.ts's slug-based restriction, a pattern match here does NOT
// identify a single row — other test suites across this codebase
// create their own real, legitimately-unclassified
// @isolation-test.invalid coach fixtures matching these same five
// patterns (e.g. program-generator-integration.test.ts), and this
// suite must never match, let alone classify, any of them. See
// overwatch-fixture-classification.ts's FixtureScopeOptions header for
// why restrictToUserIds exists.
//
// Requires DATABASE_URL_DIRECT — vitest.config.ts loads .env.local
// automatically.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../client";
import { users } from "../schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIXTURE_PATTERNS,
  findFixtureCandidates,
  classifyFixtureCandidates,
} from "../../../scripts/repairs/overwatch-fixture-classification";

const db = getDb();

const dbUrl = process.env.DATABASE_URL_DIRECT;
if (!dbUrl) {
  throw new Error("DATABASE_URL_DIRECT is not set — required for this suite.");
}
const sql = postgres(dbUrl, { prepare: false });

const createdUserIds: string[] = [];

// Creates a real Supabase Auth user (public.users row + normalized_email
// populated by the sync trigger — see drizzle/0001_catalyst_auth.sql —
// as lower(trim(email)), never set by hand here), then promotes it to
// role='coach' the same way every other real-DB suite in this codebase
// does (e.g. portal-dashboard-connection-resilience.test.ts).
async function createCoach(email: string): Promise<string> {
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${email}) — ${error?.message}`);
  }
  const id = data.user.id;
  createdUserIds.push(id);
  await db.update(users).set({ role: "coach" }).where(eq(users.id, id));
  return id;
}

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // internal_account_flags rows cascade via user_id -> users(id) ON
    // DELETE RESTRICT (migration 0027) -- must be deleted first, or the
    // subsequent Auth user deletion (which also removes public.users)
    // would be blocked.
    await sql`delete from internal_account_flags where user_id = any(${createdUserIds}::uuid[])`;
    const supa = createAdminClient();
    await Promise.all(createdUserIds.map((id) => supa.auth.admin.deleteUser(id).catch(() => {})));
  }
  await sql.end();
});

describe("FIXTURE_PATTERNS — the approved, fixed set", () => {
  it("is exactly the five reviewed @isolation-test.invalid test-coach prefixes, unchanged", () => {
    expect(FIXTURE_PATTERNS).toEqual([
      "program-gen-test-coach-%@isolation-test.invalid",
      "messaging-test-coach-%@isolation-test.invalid",
      "isolation-test-coach-%@isolation-test.invalid",
      "review-triage-test-coach-%@isolation-test.invalid",
      "candidate-test-coach-%@isolation-test.invalid",
    ]);
  });
});

describe("findFixtureCandidates — the dry-run query executes and matches correctly", () => {
  it("matches a coach whose normalized_email fits an approved pattern, and reports the exact pattern it matched", async () => {
    const email = `program-gen-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);
    expect(found[0].normalizedEmail).toBe(email.toLowerCase());
    expect(found[0].matchedPattern).toBe("program-gen-test-coach-%@isolation-test.invalid");
  });

  it("does NOT match an ordinary real-looking customer email", async () => {
    const email = `jane.doe.${randomUUID()}@gmail.com`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("does NOT match a prefix-only similarity on a non-fixture domain — the exact @isolation-test.invalid suffix is required, not just the prefix text", async () => {
    // Same literal prefix as an approved pattern, but a real-looking
    // domain instead of isolation-test.invalid.
    const email = `program-gen-test-coach-${randomUUID()}@gmail.com`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("does NOT match an @isolation-test.invalid address with an unapproved prefix", async () => {
    const email = `some-other-fixture-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("running the dry-run query never writes anything — internal_account_flags stays empty for the matched account", async () => {
    const email = `messaging-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);

    const flagRows = await sql`select 1 from internal_account_flags where user_id = ${id}`;
    expect(flagRows).toHaveLength(0);
  });
});

describe("classifyFixtureCandidates — --apply's mutation path, and idempotency", () => {
  it("classifies exactly the matched account as test_fixture, and a second run reports zero further changes", async () => {
    const email = `isolation-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const firstRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(firstRun.classifiedCount).toBe(1);
    expect(firstRun.classifiedUserIds).toContain(id);

    const [flag] = await sql`select classification, reason from internal_account_flags where user_id = ${id}`;
    expect(flag.classification).toBe("test_fixture");
    expect(flag.reason).toMatch(/isolation-test-coach-%@isolation-test\.invalid|test-coach pattern/i);

    // Idempotency: the account is already classified, so it no longer
    // matches the "no existing flag" predicate — a second run must
    // affect zero rows, not error and not insert a duplicate.
    const secondRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(secondRun.classifiedCount).toBe(0);
    expect(secondRun.classifiedUserIds).toEqual([]);

    const stillOneFlag = await sql`select 1 from internal_account_flags where user_id = ${id}`;
    expect(stillOneFlag).toHaveLength(1);
  });

  it("does not classify a non-matching account even when it shares the coach role", async () => {
    const email = `real-coach-${randomUUID()}@gmail.com`;
    const id = await createCoach(email);

    const result = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(result.classifiedCount).toBe(0);

    const flagRows = await sql`select 1 from internal_account_flags where user_id = ${id}`;
    expect(flagRows).toHaveLength(0);
  });

  it("an already-classified account is excluded from findFixtureCandidates going forward", async () => {
    const email = `review-triage-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });
});

describe("CLI wrapper — --apply is opt-in, source-level gate", () => {
  it("the mutation path (classifyFixtureCandidates) is only reachable when --apply is explicitly on argv", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(process.cwd(), "scripts/repairs/classify-overwatch-fixtures.ts"),
      "utf8",
    );
    expect(source).toMatch(/const apply = process\.argv\.includes\(["']--apply["']\)/);
    // The dry-run branch returns before classifyFixtureCandidates is
    // ever called -- i.e. the mutating call is textually gated behind
    // `if (!apply) { ... return; }`.
    expect(source).toMatch(/if \(!apply\) \{[\s\S]*?return;[\s\S]*?\}/);
    const applyCallIndex = source.indexOf("classifyFixtureCandidates(sql)");
    const guardIndex = source.indexOf("if (!apply)");
    expect(applyCallIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(applyCallIndex).toBeGreaterThan(guardIndex);
  });
});
