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
// PRODUCTION INCIDENT #1 THIS SUITE GUARDS AGAINST:
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
// PRODUCTION INCIDENT #2 THIS SUITE GUARDS AGAINST:
//   The original classifier only ever queried role='coach'. A whole
//   family of role='admin' @isolation-test.invalid fixtures (from the
//   RD/RDN credential test suites) accumulated unclassified because
//   nothing ever looked for them — confirmed live: 20 unclassified
//   admin-role fixtures found in production before this fix. Fixed by
//   adding a second, role-bound ADMIN_FIXTURE_PATTERNS list — see this
//   file's "cross-role" describe block below for the tests proving a
//   coach-approved pattern can never match an admin row and vice versa.
//
// SAFETY: every test below passes `restrictToUserIds`, naming exactly
// the fixture user id(s) it just created. Unlike orphaned-system-
// exercises.ts's slug-based restriction, a pattern match here does NOT
// identify a single row — other test suites across this codebase
// create their own real, legitimately-unclassified
// @isolation-test.invalid coach/admin fixtures matching these same
// patterns (e.g. program-generator-integration.test.ts,
// coach-credential-service.test.ts, rd-credential-gate.test.ts), and
// this suite must never match, let alone classify, any of them. See
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
  COACH_FIXTURE_PATTERNS,
  ADMIN_FIXTURE_PATTERNS,
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
// the given role the same way every other real-DB suite in this
// codebase does (e.g. portal-dashboard-connection-resilience.test.ts).
async function createUser(email: string, role: "coach" | "admin"): Promise<string> {
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
  await db.update(users).set({ role }).where(eq(users.id, id));
  return id;
}

const createCoach = (email: string) => createUser(email, "coach");
const createAdmin = (email: string) => createUser(email, "admin");

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

describe("COACH_FIXTURE_PATTERNS / ADMIN_FIXTURE_PATTERNS — the approved, fixed sets", () => {
  it("COACH_FIXTURE_PATTERNS is exactly the reviewed @isolation-test.invalid coach prefixes, unchanged plus the two newly-approved families", () => {
    expect(COACH_FIXTURE_PATTERNS).toEqual([
      "program-gen-test-coach-%@isolation-test.invalid",
      "messaging-test-coach-%@isolation-test.invalid",
      "isolation-test-coach-%@isolation-test.invalid",
      "review-triage-test-coach-%@isolation-test.invalid",
      "candidate-test-coach-%@isolation-test.invalid",
      "credential-test-coach-%@isolation-test.invalid",
      "rd-gate-test-coach-%@isolation-test.invalid",
    ]);
  });

  it("ADMIN_FIXTURE_PATTERNS is exactly the three reviewed @isolation-test.invalid admin prefixes", () => {
    expect(ADMIN_FIXTURE_PATTERNS).toEqual([
      "credential-test-admin-%@isolation-test.invalid",
      "rd-gate-test-admin-%@isolation-test.invalid",
      "program-gen-test-admin-%@isolation-test.invalid",
    ]);
  });
});

describe("findFixtureCandidates — coach patterns", () => {
  it("matches a coach whose normalized_email fits an approved (original) pattern, and reports the exact pattern it matched", async () => {
    const email = `program-gen-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);
    expect(found[0].role).toBe("coach");
    expect(found[0].normalizedEmail).toBe(email.toLowerCase());
    expect(found[0].matchedPattern).toBe("program-gen-test-coach-%@isolation-test.invalid");
  });

  it("matches a coach whose normalized_email fits the newly-approved credential-test-coach- pattern", async () => {
    const email = `credential-test-coach-a-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe("coach");
    expect(found[0].matchedPattern).toBe("credential-test-coach-%@isolation-test.invalid");
  });

  it("matches a coach whose normalized_email fits the newly-approved rd-gate-test-coach- pattern", async () => {
    const email = `rd-gate-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe("coach");
    expect(found[0].matchedPattern).toBe("rd-gate-test-coach-%@isolation-test.invalid");
  });

  it("does NOT match an ordinary real-looking customer email", async () => {
    const email = `jane.doe.${randomUUID()}@gmail.com`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("does NOT match a prefix-only similarity on a non-fixture domain — the exact @isolation-test.invalid suffix is required, not just the prefix text", async () => {
    const email = `credential-test-coach-a-${randomUUID()}@gmail.com`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("does NOT match an @isolation-test.invalid address with an unapproved prefix (no generic 'test'/'coach' matching)", async () => {
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

describe("findFixtureCandidates — admin patterns", () => {
  it("matches an admin whose normalized_email fits the newly-approved credential-test-admin- pattern", async () => {
    const email = `credential-test-admin-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe("admin");
    expect(found[0].matchedPattern).toBe("credential-test-admin-%@isolation-test.invalid");
  });

  it("matches an admin whose normalized_email fits the newly-approved rd-gate-test-admin- pattern", async () => {
    const email = `rd-gate-test-admin-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe("admin");
    expect(found[0].matchedPattern).toBe("rd-gate-test-admin-%@isolation-test.invalid");
  });

  it("matches an admin whose normalized_email fits the newly-approved program-gen-test-admin- pattern", async () => {
    const email = `program-gen-test-admin-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe("admin");
    expect(found[0].matchedPattern).toBe("program-gen-test-admin-%@isolation-test.invalid");
  });

  it("does NOT match an ordinary real-looking admin email", async () => {
    const email = `sarah.ops.${randomUUID()}@gmail.com`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("does NOT match a prefix-only similarity on a non-fixture domain for an admin account", async () => {
    const email = `rd-gate-test-admin-${randomUUID()}@gmail.com`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });
});

describe("cross-role isolation — a pattern approved for one role can NEVER match the other role", () => {
  it("a COACH-approved pattern does NOT match an ADMIN-role account with that exact email", async () => {
    // Same literal email shape as an approved coach pattern, but the
    // account itself is role='admin' — must not match, proving the
    // role check is bound into the pattern branch, not just implied by
    // the pattern's own naming.
    const email = `program-gen-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });

  it("an ADMIN-approved pattern does NOT match a COACH-role account with that exact email", async () => {
    const email = `credential-test-admin-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const found = await findFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(found).toHaveLength(0);
  });
});

describe("classifyFixtureCandidates — --apply's mutation path, and idempotency", () => {
  it("classifies exactly the matched coach account as test_fixture, and a second run reports zero further changes", async () => {
    const email = `isolation-test-coach-${randomUUID()}@isolation-test.invalid`;
    const id = await createCoach(email);

    const firstRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(firstRun.classifiedCount).toBe(1);
    expect(firstRun.classifiedUserIds).toContain(id);

    const [flag] = await sql`select classification, reason from internal_account_flags where user_id = ${id}`;
    expect(flag.classification).toBe("test_fixture");

    // Idempotency: the account is already classified, so it no longer
    // matches the "no existing flag" predicate — a second run must
    // affect zero rows, not error and not insert a duplicate.
    const secondRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(secondRun.classifiedCount).toBe(0);
    expect(secondRun.classifiedUserIds).toEqual([]);

    const stillOneFlag = await sql`select 1 from internal_account_flags where user_id = ${id}`;
    expect(stillOneFlag).toHaveLength(1);
  });

  it("classifies exactly the matched admin account as test_fixture, and a second run reports zero further changes", async () => {
    const email = `rd-gate-test-admin-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

    const firstRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(firstRun.classifiedCount).toBe(1);
    expect(firstRun.classifiedUserIds).toContain(id);

    const [flag] = await sql`select classification from internal_account_flags where user_id = ${id}`;
    expect(flag.classification).toBe("test_fixture");

    const secondRun = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(secondRun.classifiedCount).toBe(0);

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

  it("does not classify a non-matching account even when it shares the admin role", async () => {
    const email = `real-admin-${randomUUID()}@gmail.com`;
    const id = await createAdmin(email);

    const result = await classifyFixtureCandidates(sql, { restrictToUserIds: [id] });
    expect(result.classifiedCount).toBe(0);

    const flagRows = await sql`select 1 from internal_account_flags where user_id = ${id}`;
    expect(flagRows).toHaveLength(0);
  });

  it("a COACH-approved pattern on an ADMIN-role account is never classified, even via --apply", async () => {
    const email = `credential-test-coach-b-${randomUUID()}@isolation-test.invalid`;
    const id = await createAdmin(email);

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
