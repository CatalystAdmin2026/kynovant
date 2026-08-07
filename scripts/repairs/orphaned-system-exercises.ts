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
// pipeline (scripts/seed-exercises.ts, scripts/seeds/001-*.ts through
// 010-*.ts, via scripts/seeds/_shared.ts) inserts every canonical
// library row without ever setting either column, so every seeded row
// lands as scope='coach', created_by=NULL — "private to no one."
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
// exercises.coach_created (a boolean, default true) was deliberately
// NOT added to this predicate: the very seed pipeline that causes this
// defect explicitly sets coachCreated: true on every row it inserts
// (scripts/seed-exercises.ts:500, scripts/seeds/_shared.ts:195) — it is
// not a real provenance signal for this data, and requiring
// coach_created = false would make this repair match nothing on a
// fresh run of the exact defect it exists to fix.
//
// This predicate is intentionally scope='coach' only — organization-
// scoped rows are never touched, regardless of created_by, since
// 'organization' is already a shared-visibility scope this repair has
// no reason to alter.
//
// Idempotent: the UPDATE's WHERE clause re-checks the identical
// predicate, so a second run always affects zero rows.
// ─────────────────────────────────────────────────────────────

import type postgres from "postgres";
import { getCanonicalSeedExerciseSlugs } from "./canonical-seed-exercise-slugs";

export interface OrphanedExerciseRow {
  id: string;
  slug: string;
  name: string;
}

// Read-only — rows currently matching the safety predicate. Used for
// both the CLI's dry-run preview and this repair's test suite.
export async function findOrphanedSystemExercises(
  sql: postgres.Sql,
): Promise<OrphanedExerciseRow[]> {
  const canonicalSlugs = [...getCanonicalSeedExerciseSlugs()];
  if (canonicalSlugs.length === 0) return [];

  const rows = await sql`
    SELECT id, slug, name
    FROM exercises
    WHERE scope = 'coach'
      AND created_by IS NULL
      AND slug IN ${sql(canonicalSlugs)}
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
): Promise<RepairResult> {
  const canonicalSlugs = [...getCanonicalSeedExerciseSlugs()];
  if (canonicalSlugs.length === 0) return { repairedCount: 0, repairedIds: [] };

  const rows = await sql`
    UPDATE exercises
    SET scope = 'system', updated_at = now()
    WHERE scope = 'coach'
      AND created_by IS NULL
      AND slug IN ${sql(canonicalSlugs)}
    RETURNING id
  `;
  const repairedIds = rows.map((r) => r.id as string);
  return { repairedCount: repairedIds.length, repairedIds };
}
