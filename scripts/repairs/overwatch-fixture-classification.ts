// ─────────────────────────────────────────────────────────────
// Catalyst OS — Overwatch V2: Fixture Account Classification (pure logic)
//
// Pure, side-effect-free on import (no top-level connection, no CLI
// invocation) — see scripts/repairs/classify-overwatch-fixtures.ts for
// the runnable CLI wrapper, and lib/db/__tests__/classify-overwatch-
// fixtures.test.ts for the automated tests. Both import this module
// directly so the CLI and the tests exercise the exact same query
// logic — never a re-implementation that could silently drift from
// what actually runs against a real database. Same split as
// scripts/repairs/orphaned-system-exercises.ts / scripts/repair-
// orphaned-system-exercises.ts.
//
// Takes a raw `postgres.Sql` connection rather than drizzle's query
// builder or drizzle-orm's `sql` tag: this module matches an account's
// normalized_email against several LIKE patterns via
// `unnest(<patterns>::text[])`, and postgres.js's own tagged-template
// serializes an interpolated JS array as a genuine Postgres array
// literal — which is what makes that cast safe. drizzle-orm's `sql` tag
// does NOT do this (it binds an interpolated JS array as a single
// parenthesized record/tuple parameter instead), which is exactly the
// bug this module replaces: the original version of this script used
// drizzle-orm's `sql` tag for this same query and failed on every call
// with "cannot cast type record to text[]" (Postgres error 42846). The
// same pitfall is already documented and fixed elsewhere in this
// codebase — see the muscleGroups filter comment in
// lib/db/exercise-service.ts and the alternate-name IN-list comment in
// lib/program-generator/exercise-resolution.ts — and scripts/repair-
// orphaned-system-exercises.ts / scripts/backfill-coach-ownership.ts
// both already use a raw postgres connection for exactly this reason.
//
// SECURITY: FIXTURE_PATTERNS is the full, reviewed, approved set of
// test-fixture email prefixes. It is intentionally NOT parameterized
// from any external input anywhere in this module or its CLI wrapper —
// widening it (or accepting caller-supplied patterns outside this set)
// would risk auto-classifying a real coach account as a test fixture.
// The only way any caller (including this module's own tests) can
// narrow what a query matches is via `restrictToPatterns`, which is
// ALWAYS intersected with FIXTURE_PATTERNS below — it can only shrink
// the matched set, never add a pattern outside the approved list. Same
// "intersect, never union" shape as orphaned-system-exercises.ts's
// `restrictToSlugs`, and for the same reason: a test run must be
// physically incapable of matching (or, for classifyFixtureCandidates,
// mutating) any row outside what it explicitly names.
// ─────────────────────────────────────────────────────────────

import type postgres from "postgres";

export const FIXTURE_PATTERNS = [
  "program-gen-test-coach-%@isolation-test.invalid",
  "messaging-test-coach-%@isolation-test.invalid",
  "isolation-test-coach-%@isolation-test.invalid",
  "review-triage-test-coach-%@isolation-test.invalid",
  "candidate-test-coach-%@isolation-test.invalid",
] as const;

export interface FixtureCandidateRow {
  id: string;
  email: string;
  normalizedEmail: string;
  matchedPattern: string;
}

export interface FixtureScopeOptions {
  /** Fixture-scoping only — for this module's own test suite. Always
   *  intersected with FIXTURE_PATTERNS (see this file's header), never
   *  used standalone, so it can only narrow which of the five approved
   *  patterns a call matches against — never widen it. Omit for the
   *  real CLI run, which always uses the full approved set. */
  restrictToPatterns?: readonly string[];
  /** Fixture-scoping only — for this module's own test suite. Unlike
   *  restrictToPatterns, a pattern match alone does not identify a
   *  single row (many real accounts across the shared database can
   *  legitimately match the same approved prefix — e.g. other test
   *  suites' own @isolation-test.invalid fixtures left unclassified).
   *  ANDed into the query when provided, so a call can only ever
   *  match/classify rows whose id is explicitly named here — never any
   *  other real ambient row that happens to match a pattern. Omit for
   *  the real CLI run, which always operates over every matching row. */
  restrictToUserIds?: readonly string[];
}

function resolvePatterns(options?: FixtureScopeOptions): string[] {
  if (!options?.restrictToPatterns) return [...FIXTURE_PATTERNS];
  const approved = new Set<string>(FIXTURE_PATTERNS);
  return options.restrictToPatterns.filter((p) => approved.has(p));
}

// Empty fragment (no-op) when unset — see restrictToUserIds's own doc
// comment above. `= any(...)` is safe here because it's the raw
// postgres.js connection's own tag, not drizzle-orm's.
function buildUserIdFilter(sql: postgres.Sql, options?: FixtureScopeOptions) {
  if (!options?.restrictToUserIds || options.restrictToUserIds.length === 0) {
    return sql``;
  }
  return sql`and u.id = any(${[...options.restrictToUserIds]}::uuid[])`;
}

// Read-only — coach accounts currently matching one of the approved
// fixture patterns that do NOT already have an internal_account_flags
// row (the LEFT JOIN ... IS NULL guard). Used for both the CLI's
// dry-run preview and this module's test suite.
export async function findFixtureCandidates(
  sql: postgres.Sql,
  options?: FixtureScopeOptions,
): Promise<FixtureCandidateRow[]> {
  const patterns = resolvePatterns(options);
  if (patterns.length === 0) return [];
  const userIdFilter = buildUserIdFilter(sql, options);

  const rows = await sql`
    select
      u.id,
      u.email,
      u.normalized_email,
      pattern.pattern as matched_pattern
    from users u
    cross join unnest(${patterns}::text[]) as pattern(pattern)
    left join internal_account_flags f on f.user_id = u.id
    where u.role = 'coach'
      and f.user_id is null
      and u.normalized_email like pattern.pattern
      ${userIdFilter}
    order by u.normalized_email
  `;

  return rows.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    normalizedEmail: r.normalized_email as string,
    matchedPattern: r.matched_pattern as string,
  }));
}

export interface ClassifyResult {
  classifiedCount: number;
  classifiedUserIds: string[];
}

// Mutating — classifies every current match as classification =
// 'test_fixture'. Idempotent: the INSERT's own WHERE clause re-applies
// the identical predicate (role='coach' AND no existing flag AND
// pattern match), and internal_account_flags.user_id is that table's
// primary key, so an account classified by a previous run can never be
// matched (and therefore never re-inserted) again — a second run
// against the same data always reports classifiedCount: 0.
export async function classifyFixtureCandidates(
  sql: postgres.Sql,
  options?: FixtureScopeOptions,
): Promise<ClassifyResult> {
  const patterns = resolvePatterns(options);
  if (patterns.length === 0) return { classifiedCount: 0, classifiedUserIds: [] };
  const userIdFilter = buildUserIdFilter(sql, options);

  const rows = await sql`
    insert into internal_account_flags (user_id, classification, reason, reviewed_at)
    select distinct
      u.id,
      'test_fixture'::account_classification,
      'Reviewed legacy Overwatch fixture backfill: normalized_email matched explicit test-coach pattern.',
      now()
    from users u
    cross join unnest(${patterns}::text[]) as pattern(pattern)
    left join internal_account_flags f on f.user_id = u.id
    where u.role = 'coach'
      and f.user_id is null
      and u.normalized_email like pattern.pattern
      ${userIdFilter}
    returning user_id
  `;

  const classifiedUserIds = rows.map((r) => r.user_id as string);
  return { classifiedCount: classifiedUserIds.length, classifiedUserIds };
}
