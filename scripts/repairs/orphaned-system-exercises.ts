// ─────────────────────────────────────────────────────────────
// Catalyst OS — Repair Logic: Orphaned "system" Exercises
//
// Pure, side-effect-free on import (no top-level connection, no CLI
// invocation) — see scripts/repair-orphaned-system-exercises.ts for the
// runnable CLI wrapper, and lib/db/__tests__/repair-orphaned-system-
// exercises.test.ts for the automated tests. Both import this module
// directly so the CLI and the tests exercise the exact same query
// logic — never a re-implementation that could silently drift from
// what actually runs against a real database.
//
// ─────────────────────────────────────────────────────────────
// THE DEFECT
// ─────────────────────────────────────────────────────────────
// exercises.scope defaults to 'coach' and exercises.created_by is
// nullable with no default (schema-exercise.ts). The bulk exercise-seed
// pipeline (scripts/seed-exercises.ts and scripts/seeds/_shared.ts,
// used by every scripts/seeds/0XX-*.ts seed file) inserted every
// canonical library row without ever setting either column, so every
// seeded row landed as scope='coach', created_by=NULL — "private to no
// one." This recurred with Seed 011 (scripts/seeds/011-reviewed-
// library-expansion.ts, 336 rows) because the defect lived in the
// SHARED helper, not any individual seed file — every new seed file
// inherited it automatically. Both scripts/seed-exercises.ts and
// scripts/seeds/_shared.ts now set scope: "system" explicitly (and
// coachCreated: false — see below), so this cannot recur for a seed
// file written after that fix landed. This repair remains necessary
// for rows seeded before it.
//
// Both the AI Program Generator's candidate-selection layer
// (lib/program-generator/exercise-candidates.ts) and its name-based
// resolver fallback (lib/program-generator/exercise-resolution.ts) treat
// a scope='coach' row as visible ONLY to the coach matching created_by.
// A row with no owner is visible to NOBODY under that rule — so a fresh
// seed run silently makes the entire canonical library invisible to
// every coach's AI generation (this is what a production-readiness audit
// found and the shared database was manually repaired for on 2026-08-05).
//
// ─────────────────────────────────────────────────────────────
// SAFETY PREDICATE
// ─────────────────────────────────────────────────────────────
//   scope = 'coach'
//   AND created_by IS NULL
//   AND slug IN <canonical seeded exercise slug set>
//
// The first two conditions alone identify "coach-scope, no owner" —
// necessary, but on their own too broad for a repair meant to run
// indefinitely into the future: if a hard-delete-account feature is
// ever added and exercises.created_by's `onDelete: "set null"` actually
// fires for the first time, a REAL coach's private exercise would also
// become scope='coach' + created_by=NULL, and this repair must never
// silently promote that to globally-visible scope='system'.
//
// The third condition is what makes this repair "repair orphaned
// canonical seed rows," not "repair every coach-scope row with a null
// owner": scope-and-null-owner alone can't tell those two cases apart,
// but slug membership in getCanonicalSeedExerciseSlugs()
// (scripts/repairs/canonical-seed-exercise-slugs.ts — read directly
// from the seed pipeline's own reviewed source, never hand-copied) can.
// A coach cannot create an exercise whose slug collides with a
// canonical seed slug through the normal product UI in a way that would
// also leave created_by null (createExercise() always requires a real
// createdBy — see below) — the only way a row can EVER match all three
// conditions at once is if the seed pipeline produced it.
//
// Why scope='coach' AND created_by IS NULL, by itself, was already
// known to be safe for the *current* defect (kept here for the full
// picture, but no longer the only gate):
//   1. createExercise() (lib/db/exercise-admin-service.ts) — the sole
//      production write path for a coach's own exercise — requires
//      `createdBy: string` at the type level (CreateExerciseInput
//      excludes it from the nullable/optional set). A real coach-
//      authored row can never be inserted with created_by null.
//   2. exercises.created_by has `onDelete: "set null"`, which WOULD
//      orphan a real private exercise if its owning user account were
//      ever hard-deleted — but no production code path in this
//      codebase deletes a users row today (verified: db.delete(users) /
//      auth.admin.deleteUser only appear in test cleanup code). The
//      slug condition above is exactly the extra safeguard that keeps
//      this repair correct even after that stops being true.
//
// exercises.coach_created (a boolean, default true) is deliberately NOT
// part of the WHERE-clause safety PREDICATE above: the buggy seed
// pipeline set coachCreated: true on every row it inserted (the same
// bug this whole repair exists for), so requiring coach_created = false
// to MATCH a row would make this repair find nothing among the exact
// rows it needs to fix. It IS corrected by the repair's UPDATE below,
// alongside scope — coach_created's name and column semantics mean
// "was this exercise authored by a coach," which is false for every
// canonical seed row (verified: the column is never read by any
// application code today — grepped the full app/ and lib/ trees — so
// this correction changes no runtime behavior; it only makes stored
// data match what scripts/seeds/_shared.ts now writes for a fresh seed,
// per that function's own header comment on why the value matters).
//
// This predicate is intentionally scope='coach' only — organization-
// scoped rows are never touched, regardless of created_by, since
// 'organization' is already a shared-visibility scope this repair has
// no reason to alter.
//
// Idempotent: the UPDATE's WHERE clause re-checks the identical
// predicate, so a second run always affects zero rows.
//
// ─────────────────────────────────────────────────────────────
// restrictToSlugs — fixture scoping for tests
// ─────────────────────────────────────────────────────────────
// Both functions below accept an optional `options.restrictToSlugs`.
// When omitted (the CLI script's normal usage — see
// scripts/repair-orphaned-system-exercises.ts), the safety predicate's
// slug condition is the FULL canonical set, exactly as documented above
// — this is the real repair, meant to run against every canonical row
// in the database.
//
// When provided, it's INTERSECTED with the canonical set (never used on
// its own) — so it can only ever narrow which rows the existing safety
// predicate can match, never widen it. This exists solely so this
// module's own test suite (lib/db/__tests__/repair-orphaned-system-
// exercises.test.ts) can call the real repair function — not a
// reimplementation of it — while being physically incapable of
// mutating any row it did not itself insert: every test passes the
// exact slug(s) of its own fixture row(s), so even if the live shared
// database happens to already contain other real orphaned canonical
// rows at test time (as Seed 011's did — see this file's own incident
// history), a test run cannot touch them. This was learned the hard way
// once already: an earlier test run against this same predicate, before
// this parameter existed, repaired 336 real ambient Seed 011 rows as an
// unintended side effect of proving idempotency, not through any
// deliberate CLI invocation.
// ─────────────────────────────────────────────────────────────

import type postgres from "postgres";
import { getCanonicalSeedExerciseSlugs } from "./canonical-seed-exercise-slugs";

export interface OrphanedExerciseRow {
  id: string;
  slug: string;
  name: string;
}

export interface RepairScopeOptions {
  /** Fixture-scoping only — see this file's "restrictToSlugs" header
   *  comment. Intersected with the canonical seed slug set, never used
   *  standalone. Omit for the real, full-database repair. */
  restrictToSlugs?: readonly string[];
}

function resolveSlugScope(options?: RepairScopeOptions): string[] {
  const canonicalSlugs = getCanonicalSeedExerciseSlugs();
  if (!options?.restrictToSlugs) return [...canonicalSlugs];
  const restrict = new Set(options.restrictToSlugs);
  return [...canonicalSlugs].filter((slug) => restrict.has(slug));
}

// Read-only — rows currently matching the safety predicate. Used for
// both the CLI's dry-run preview and this repair's test suite.
export async function findOrphanedSystemExercises(
  sql: postgres.Sql,
  options?: RepairScopeOptions,
): Promise<OrphanedExerciseRow[]> {
  const slugs = resolveSlugScope(options);
  if (slugs.length === 0) return [];

  const rows = await sql`
    SELECT id, slug, name
    FROM exercises
    WHERE scope = 'coach'
      AND created_by IS NULL
      AND slug IN ${sql(slugs)}
    ORDER BY slug
  `;
  return rows.map((r) => ({ id: r.id as string, slug: r.slug as string, name: r.name as string }));
}

export interface RepairResult {
  repairedCount: number;
  repairedIds: string[];
}

// Idempotent: re-applies the identical predicate in its WHERE clause —
// calling this a second time in a row always affects zero rows, and
// calling it once when nothing matches is a no-op that returns
// repairedCount: 0 rather than erroring.
export async function repairOrphanedSystemExercises(
  sql: postgres.Sql,
  options?: RepairScopeOptions,
): Promise<RepairResult> {
  const slugs = resolveSlugScope(options);
  if (slugs.length === 0) return { repairedCount: 0, repairedIds: [] };

  const rows = await sql`
    UPDATE exercises
    SET scope = 'system', coach_created = false, updated_at = now()
    WHERE scope = 'coach'
      AND created_by IS NULL
      AND slug IN ${sql(slugs)}
    RETURNING id
  `;
  const repairedIds = rows.map((r) => r.id as string);
  return { repairedCount: repairedIds.length, repairedIds };
}
