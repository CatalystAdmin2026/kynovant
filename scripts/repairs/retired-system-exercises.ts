// ─────────────────────────────────────────────────────────────
// Kynovant — Retired (invalid) SYSTEM Exercises
//
// Canonical Exercise Library rows that were confirmed NOT to be real
// exercises and must never again be offered to the program generator.
//
// Mechanism: status = 'archived' — the library's existing retirement
// state (lib/db/exercise-admin-service.ts's archiveExercise()). It is
// deliberately NOT a delete:
//   - Every candidate/resolution/substitution/search query that feeds
//     the generator filters `status = 'active'`
//     (exercise-candidates.ts, exercise-resolution.ts, pil/substitution.ts,
//     hq-search-service.ts), so an archived row can never be selected for
//     a NEW program.
//   - workout_template_exercises.exercise_id (and every other reference)
//     is a RESTRICT foreign key, and program/session readers join on the
//     id without a status filter, so programs already built or assigned
//     keep resolving the row. Deleting it would be blocked by the FK for
//     any referenced row — and would erase the audit trail even where it
//     is not.
//
// Adding a slug here does not change the database by itself; a human runs
// scripts/retire-invalid-system-exercises.ts (dry-run first) against the
// target environment.
// ─────────────────────────────────────────────────────────────

import type postgres from "postgres";

export type RetiredSystemExercise = {
  slug: string;
  reason: string;
};

export const RETIRED_SYSTEM_EXERCISES: readonly RetiredSystemExercise[] = [
  {
    slug: "bayesian-lat-pulldown",
    reason:
      "Not a real exercise. Introduced by Seed 011 (commit 7ae5fe7) as a recombination of the legitimate 'Bayesian' cable-curl/fly terminology with a lat pulldown; the coach confirmed by external investigation that it does not exist, after clients asked what it was.",
  },
];

export type RetirementTarget = { id: string; slug: string; name: string; status: string; scope: string };
export type ReferenceCounts = { templateExerciseRefs: number; relationRefs: number };

// Only rows the pipeline owns (scope = 'system') and that are not
// already retired are targets — a coach's private exercise that happens
// to share a slug can never match.
export async function findRetirementTargets(
  sql: postgres.Sql,
  slugs: readonly string[] = RETIRED_SYSTEM_EXERCISES.map((e) => e.slug),
): Promise<RetirementTarget[]> {
  if (slugs.length === 0) return [];
  const rows = await sql<RetirementTarget[]>`
    SELECT id, slug, name, status, scope
    FROM exercises
    WHERE slug IN ${sql(slugs as string[])}
      AND scope = 'system'
      AND status <> 'archived'
    ORDER BY slug
  `;
  return [...rows];
}

// Read-only: how much existing data still points at this row (all of it
// is preserved by archiving).
export async function countReferences(sql: postgres.Sql, exerciseId: string): Promise<ReferenceCounts> {
  const [tmpl] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM workout_template_exercises WHERE exercise_id = ${exerciseId}
  `;
  const [rel] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM exercise_relations
    WHERE source_exercise_id = ${exerciseId} OR target_exercise_id = ${exerciseId}
  `;
  return { templateExerciseRefs: tmpl.n, relationRefs: rel.n };
}

export async function retireSystemExercises(
  sql: postgres.Sql,
  slugs: readonly string[] = RETIRED_SYSTEM_EXERCISES.map((e) => e.slug),
): Promise<{ retiredCount: number; retiredSlugs: string[] }> {
  if (slugs.length === 0) return { retiredCount: 0, retiredSlugs: [] };
  const rows = await sql<{ slug: string }[]>`
    UPDATE exercises
    SET status = 'archived', updated_at = now()
    WHERE slug IN ${sql(slugs as string[])}
      AND scope = 'system'
      AND status <> 'archived'
    RETURNING slug
  `;
  return { retiredCount: rows.length, retiredSlugs: rows.map((r) => r.slug) };
}
