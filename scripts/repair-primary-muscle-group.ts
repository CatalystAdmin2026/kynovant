#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — One-Time Repair: exercises.primary_muscle_group
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repair-primary-muscle-group.ts
//   set -a && source .env.local && set +a && npx tsx scripts/repair-primary-muscle-group.ts --dry-run
//
// Requires DATABASE_URL_DIRECT in the environment.
//
// Why this exists:
//   exercise_muscles is the single source of truth for which muscle an
//   exercise trains. exercises.primary_muscle_group is a denormalized
//   cache of that data (used for list-view display and the primary-muscle
//   filter) that must stay in sync with the primary-role exercise_muscles
//   row for each exercise. The bulk seed pipeline
//   (scripts/seeds/_shared.ts) previously inserted exercises without
//   setting this column at all — it's now fixed to derive it at seed
//   time from the muscles array — but that fix does not retroactively
//   repair rows already inserted before the fix landed.
//
// What this script does:
//   Re-derives primary_muscle_group for every exercise from its
//   exercise_muscles rows where role = 'primary', using the same
//   tie-break rule as exercise-admin-service.ts's
//   refreshPrimaryMuscleGroup(): highest emphasis_percent wins, ties
//   broken by lowest exercise_muscles.id (earliest inserted). This
//   fixes both NULL columns and any stale/incorrect existing values.
//
// Safety:
//   - Never writes to exercise_muscles — read-only against that table.
//     No muscle associations are duplicated or altered.
//   - Idempotent: only touches rows where the derived value actually
//     differs from the current column value (IS DISTINCT FROM), so a
//     second run reports zero rows changed.
//   - --dry-run prints exactly which rows would change without writing.
//   - Single UPDATE...FROM statement — no N+1, no per-row round trips.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";

const dryRun = process.argv.includes("--dry-run");

const dbUrl = process.env.DATABASE_URL_DIRECT;
if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log("\nCatalyst OS — Repair: exercises.primary_muscle_group");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const before = await sql`
    select
      count(*) filter (where primary_muscle_group is null)::int as null_count,
      count(*)::int as total
    from exercises
    where status = 'active'
  `;
  console.log(`Before: ${before[0].null_count} of ${before[0].total} active exercises have a NULL primary_muscle_group.`);

  // The derived value per exercise, matching refreshPrimaryMuscleGroup()'s
  // tie-break: highest emphasis_percent, then lowest id.
  const derived = sql`
    SELECT DISTINCT ON (exercise_id)
      exercise_id,
      muscle_group
    FROM exercise_muscles
    WHERE role = 'primary'
    ORDER BY exercise_id, COALESCE(emphasis_percent, 0) DESC, id ASC
  `;

  const affected = await sql`
    SELECT e.id, e.slug, e.primary_muscle_group AS current_value, d.muscle_group AS derived_value
    FROM exercises e
    JOIN (${derived}) d ON d.exercise_id = e.id
    WHERE e.primary_muscle_group IS DISTINCT FROM d.muscle_group
    ORDER BY e.slug
  `;

  console.log(`\nRows needing repair: ${affected.length}`);
  if (affected.length > 0) {
    const preview = affected.slice(0, 15);
    for (const r of preview) {
      console.log(`  - ${r.slug}: ${r.current_value ?? "NULL"} → ${r.derived_value}`);
    }
    if (affected.length > preview.length) {
      console.log(`  … and ${affected.length - preview.length} more`);
    }
  }

  if (dryRun) {
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  if (affected.length === 0) {
    console.log("\nNothing to repair. Already in sync.\n");
    await sql.end();
    return;
  }

  const result = await sql`
    UPDATE exercises e
    SET primary_muscle_group = d.muscle_group, updated_at = now()
    FROM (${derived}) d
    WHERE e.id = d.exercise_id
      AND e.primary_muscle_group IS DISTINCT FROM d.muscle_group
  `;
  console.log(`\n✓ Repaired ${result.count} row(s).`);

  const after = await sql`
    select
      count(*) filter (where primary_muscle_group is null)::int as null_count,
      count(*)::int as total
    from exercises
    where status = 'active'
  `;
  console.log(`After: ${after[0].null_count} of ${after[0].total} active exercises have a NULL primary_muscle_group.\n`);

  await sql.end();
}

main().catch((err) => {
  console.error("\nRepair failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
