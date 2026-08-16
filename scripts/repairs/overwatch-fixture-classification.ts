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
// TWO ROLE-SCOPED PATTERN LISTS, NOT ONE (added when the classifier
// was extended to also cover role='admin' fixtures — the original
// version only ever queried role='coach', which is why a whole family
// of admin-role @isolation-test.invalid fixtures accumulated
// unclassified even after the coach-role ones were caught):
// COACH_FIXTURE_PATTERNS only ever matches a role='coach' row;
// ADMIN_FIXTURE_PATTERNS only ever matches a role='admin' row. A
// coach-shaped pattern can never accidentally match an admin row (or
// vice versa) — the role check and the pattern list are bound together
// in the query itself (see buildMatchQuery below), not just
// coincidentally true because of how the patterns happen to be named.
//
// SECURITY: both pattern lists are the full, reviewed, approved set of
// test-fixture email prefixes for their role. Neither is parameterized
// from any external input anywhere in this module or its CLI wrapper —
// widening either (or accepting caller-supplied patterns outside these
// sets) would risk auto-classifying a real coach or admin account as a
// test fixture. The only way any caller (including this module's own
// tests) can narrow what a query matches is via `restrictToPatterns`,
// which is ALWAYS intersected against EACH role's own approved list
// independently below — it can only shrink the matched set, and a
// restriction value can never leak a coach-approved pattern into
// matching against admin rows (or the reverse), since
// resolveCoachPatterns/resolveAdminPatterns each only ever draw from
// their own constant. Same "intersect, never union" shape as
// orphaned-system-exercises.ts's `restrictToSlugs`, and for the same
// reason: a test run must be physically incapable of matching (or, for
// classifyFixtureCandidates, mutating) any row outside what it
// explicitly names.
// ─────────────────────────────────────────────────────────────

import type postgres from "postgres";

export const COACH_FIXTURE_PATTERNS = [
  "program-gen-test-coach-%@isolation-test.invalid",
  "messaging-test-coach-%@isolation-test.invalid",
  "isolation-test-coach-%@isolation-test.invalid",
  "review-triage-test-coach-%@isolation-test.invalid",
  "candidate-test-coach-%@isolation-test.invalid",
  "credential-test-coach-%@isolation-test.invalid",
  "rd-gate-test-coach-%@isolation-test.invalid",
] as const;

export const ADMIN_FIXTURE_PATTERNS = [
  "credential-test-admin-%@isolation-test.invalid",
  "rd-gate-test-admin-%@isolation-test.invalid",
  "program-gen-test-admin-%@isolation-test.invalid",
] as const;

// Every approved pattern across both roles — display/logging only
// (e.g. the CLI's "Patterns: ..." banner). Never used to build a query
// itself; findFixtureCandidates/classifyFixtureCandidates always keep
// the two lists role-bound (see buildMatchQuery).
export const ALL_FIXTURE_PATTERNS = [...COACH_FIXTURE_PATTERNS, ...ADMIN_FIXTURE_PATTERNS] as const;

export interface FixtureCandidateRow {
  id: string;
  email: string;
  normalizedEmail: string;
  matchedPattern: string;
  role: "coach" | "admin";
}

export interface FixtureScopeOptions {
  /** Fixture-scoping only — for this module's own test suite. Always
   *  intersected against EACH role's own approved list independently
   *  (see this file's header), never used standalone, so it can only
   *  narrow which approved patterns a call matches against — never
   *  widen it, and never move a pattern from one role's list to the
   *  other. Omit for the real CLI run, which always uses the full
   *  approved set for both roles. */
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

function resolveCoachPatterns(options?: FixtureScopeOptions): string[] {
  if (!options?.restrictToPatterns) return [...COACH_FIXTURE_PATTERNS];
  const approved = new Set<string>(COACH_FIXTURE_PATTERNS);
  return options.restrictToPatterns.filter((p) => approved.has(p));
}

function resolveAdminPatterns(options?: FixtureScopeOptions): string[] {
  if (!options?.restrictToPatterns) return [...ADMIN_FIXTURE_PATTERNS];
  const approved = new Set<string>(ADMIN_FIXTURE_PATTERNS);
  return options.restrictToPatterns.filter((p) => approved.has(p));
}

// Empty fragment (no-op) when unset — see restrictToUserIds's own doc
// comment above. `= any(...)` is safe here because it's the raw
// postgres.js connection's own tag, not drizzle-orm's.
function buildUserIdFilter(sql: postgres.Sql, options?: FixtureScopeOptions) {
  if (!options?.restrictToUserIds || options.restrictToUserIds.length === 0) {
    return sql``;
  }
  return sql`and id = any(${[...options.restrictToUserIds]}::uuid[])`;
}

// The role-bound "currently matches an approved pattern" subquery,
// shared textually (not just conceptually) by both the read-only
// preview and the mutating apply's INSERT...SELECT — a UNION ALL of
// two branches (coach patterns can only ever match role='coach';
// admin patterns can only ever match role='admin'). `unnest('{}'::text[])`
// on an empty pattern array (e.g. a test restricting to only the other
// role's patterns) contributes zero rows from that branch, which is
// the correct behavior, not an error.
function buildMatchedSubquery(sql: postgres.Sql, coachPatterns: string[], adminPatterns: string[]) {
  return sql`(
    select u.id, u.email, u.normalized_email, pattern.pattern as matched_pattern, u.role
    from users u
    cross join unnest(${coachPatterns}::text[]) as pattern(pattern)
    where u.role = 'coach'
      and u.normalized_email like pattern.pattern

    union all

    select u.id, u.email, u.normalized_email, pattern.pattern as matched_pattern, u.role
    from users u
    cross join unnest(${adminPatterns}::text[]) as pattern(pattern)
    where u.role = 'admin'
      and u.normalized_email like pattern.pattern
  ) matched`;
}

// Read-only — coach/admin accounts currently matching one of their
// role's approved fixture patterns that do NOT already have an
// internal_account_flags row. Used for both the CLI's dry-run preview
// and this module's test suite.
export async function findFixtureCandidates(
  sql: postgres.Sql,
  options?: FixtureScopeOptions,
): Promise<FixtureCandidateRow[]> {
  const coachPatterns = resolveCoachPatterns(options);
  const adminPatterns = resolveAdminPatterns(options);
  if (coachPatterns.length === 0 && adminPatterns.length === 0) return [];
  const userIdFilter = buildUserIdFilter(sql, options);
  const matched = buildMatchedSubquery(sql, coachPatterns, adminPatterns);

  const rows = await sql`
    select id, email, normalized_email, matched_pattern, role
    from ${matched}
    left join internal_account_flags f on f.user_id = matched.id
    where f.user_id is null
      ${userIdFilter}
    order by normalized_email
  `;

  return rows.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    normalizedEmail: r.normalized_email as string,
    matchedPattern: r.matched_pattern as string,
    role: r.role as "coach" | "admin",
  }));
}

export interface ClassifyResult {
  classifiedCount: number;
  classifiedUserIds: string[];
}

// Mutating — classifies every current match as classification =
// 'test_fixture'. A single INSERT...SELECT statement, same as the
// original single-role version — atomic, no separate read-then-write
// race window. Idempotent: the SELECT's own WHERE clause re-applies
// the identical predicate (role-bound pattern match AND no existing
// flag), and internal_account_flags.user_id is that table's primary
// key, so an account classified by a previous run can never be matched
// (and therefore never re-inserted) again — a second run against the
// same data always reports classifiedCount: 0.
export async function classifyFixtureCandidates(
  sql: postgres.Sql,
  options?: FixtureScopeOptions,
): Promise<ClassifyResult> {
  const coachPatterns = resolveCoachPatterns(options);
  const adminPatterns = resolveAdminPatterns(options);
  if (coachPatterns.length === 0 && adminPatterns.length === 0) {
    return { classifiedCount: 0, classifiedUserIds: [] };
  }
  const userIdFilter = buildUserIdFilter(sql, options);
  const matched = buildMatchedSubquery(sql, coachPatterns, adminPatterns);

  const rows = await sql`
    insert into internal_account_flags (user_id, classification, reason, reviewed_at)
    select distinct
      id,
      'test_fixture'::account_classification,
      'Reviewed legacy Overwatch fixture backfill: normalized_email matched explicit test-coach/test-admin pattern.',
      now()
    from ${matched}
    left join internal_account_flags f on f.user_id = matched.id
    where f.user_id is null
      ${userIdFilter}
    returning user_id
  `;

  const classifiedUserIds = rows.map((r) => r.user_id as string);
  return { classifiedCount: classifiedUserIds.length, classifiedUserIds };
}
