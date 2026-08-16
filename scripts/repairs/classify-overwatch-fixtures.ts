#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Overwatch V2: Fixture Account Classifier (CLI)
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repairs/classify-overwatch-fixtures.ts
//   set -a && source .env.local && set +a && npx tsx scripts/repairs/classify-overwatch-fixtures.ts --apply
//
// Requires DATABASE_URL_DIRECT.
//
// Dry run (no flag) is the default and ONLY behavior without --apply:
// it prints every matching candidate and writes nothing. --apply is
// required to actually insert internal_account_flags rows.
//
// See scripts/repairs/overwatch-fixture-classification.ts for the pure,
// tested matching/classification logic and the approved
// COACH_FIXTURE_PATTERNS / ADMIN_FIXTURE_PATTERNS lists
// (lib/db/__tests__/classify-overwatch-fixtures.test.ts) — this file is
// a thin CLI wrapper around that module's exported functions, so the
// CLI and the tests exercise the exact same query, never a
// re-implementation of it. Same split as
// scripts/repair-orphaned-system-exercises.ts /
// scripts/repairs/orphaned-system-exercises.ts.
//
// PATTERNS ARE FIXED AND REVIEWED — matching is restricted to exactly
// the explicit @isolation-test.invalid prefixes in
// overwatch-fixture-classification.ts's COACH_FIXTURE_PATTERNS
// (role='coach' only) and ADMIN_FIXTURE_PATTERNS (role='admin' only).
// Do not broaden them without a fresh manual review; a wider pattern
// here — or matching a pattern against the wrong role — would risk
// auto-classifying a real coach or admin account as a test fixture.
//
// ORIGINAL BUG (fixed here): this script used to build its query via
// drizzle-orm's `sql` tag with `unnest(${FIXTURE_PATTERNS}::text[])` —
// drizzle's tag does not serialize an interpolated JS array as a
// Postgres array literal the way postgres.js's own tag does, so that
// bound as a single parenthesized record/tuple parameter and failed
// every call with "cannot cast type record to text[]" (Postgres error
// 42846). This wrapper now uses a raw postgres.js connection (matching
// how scripts/repair-orphaned-system-exercises.ts and
// scripts/backfill-coach-ownership.ts already connect for one-off admin
// scripts), whose own tag serializes JS arrays correctly — see
// overwatch-fixture-classification.ts's header for the full
// explanation.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import {
  COACH_FIXTURE_PATTERNS,
  ADMIN_FIXTURE_PATTERNS,
  findFixtureCandidates,
  classifyFixtureCandidates,
} from "./overwatch-fixture-classification";

const apply = process.argv.includes("--apply");
const dbUrl = process.env.DATABASE_URL_DIRECT;

if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log(`Overwatch fixture classifier ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Coach patterns: ${COACH_FIXTURE_PATTERNS.join(", ")}`);
  console.log(`Admin patterns: ${ADMIN_FIXTURE_PATTERNS.join(", ")}`);

  const candidates = await findFixtureCandidates(sql);
  console.table(candidates);

  const byRole = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.role] = (acc[c.role] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`By role: ${JSON.stringify(byRole)}`);

  if (!apply) {
    console.log(
      `\n${candidates.length} candidate(s) found. No rows updated (dry run). Re-run with --apply after reviewing the matched accounts.`,
    );
    await sql.end();
    return;
  }

  const result = await classifyFixtureCandidates(sql);
  console.log(`\nClassified ${result.classifiedCount} fixture account(s).`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
