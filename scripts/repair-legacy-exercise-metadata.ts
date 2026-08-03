#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Reviewed Repair: Legacy Exercise Metadata
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repair-legacy-exercise-metadata.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/repair-legacy-exercise-metadata.ts
//
// Scope:
//   - Remaining 15 legacy exercises with multiple primary muscle rows.
//   - High-risk substitute/lower-joint-stress relations from the launch audit.
//
// Safe to rerun:
//   - Primary repair inserts the reviewed primary with ON CONFLICT DO NOTHING,
//     demotes/removes only non-reviewed duplicate primary rows for scoped slugs,
//     and updates exercises.primary_muscle_group only when distinct.
//   - Relation inserts use ON CONFLICT DO NOTHING.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import {
  HIGH_RISK_RELATIONS,
  LEGACY_PRIMARY_MUSCLE_REPAIRS,
} from "./repairs/exercise-library-p0-p1-data";

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.DATABASE_URL_DIRECT;

if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log("\nCatalyst OS — Repair: Legacy Exercise Metadata");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const repairSlugs = LEGACY_PRIMARY_MUSCLE_REPAIRS.map((repair) => repair.slug);
  const relationSlugs = Array.from(new Set(HIGH_RISK_RELATIONS.flatMap((relation) => [
    relation.sourceSlug,
    relation.targetSlug,
  ])));
  const allRequiredSlugs = Array.from(new Set([...repairSlugs, ...relationSlugs]));

  const exerciseRows = await sql`
    SELECT id, slug, primary_muscle_group
    FROM exercises
    WHERE slug IN ${sql(allRequiredSlugs)}
    ORDER BY slug
  `;
  const exerciseBySlug = new Map(exerciseRows.map((row) => [row.slug as string, row]));
  const missingSlugs = allRequiredSlugs.filter((slug) => !exerciseBySlug.has(slug));

  if (missingSlugs.length > 0) {
    console.error("Missing referenced exercises:");
    for (const slug of missingSlugs) console.error(`  - ${slug}`);
    await sql.end();
    process.exit(1);
  }

  const primaryRows = await sql`
    SELECT e.slug, em.muscle_group
    FROM exercise_muscles em
    JOIN exercises e ON e.id = em.exercise_id
    WHERE e.slug IN ${sql(repairSlugs)}
      AND em.role = 'primary'
    ORDER BY e.slug, em.muscle_group
  `;

  const primaryBySlug = new Map<string, string[]>();
  for (const row of primaryRows) {
    const list = primaryBySlug.get(row.slug) ?? [];
    list.push(row.muscle_group);
    primaryBySlug.set(row.slug, list);
  }

  console.log("Reviewed primary-muscle repairs:");
  for (const repair of LEGACY_PRIMARY_MUSCLE_REPAIRS) {
    const currentPrimaries = primaryBySlug.get(repair.slug) ?? [];
    const reviewedPrimaries = new Set<string>([repair.primaryMuscle, ...repair.reviewedDuplicatePrimaries]);
    const unexpectedPrimaries = currentPrimaries.filter((muscle) => !reviewedPrimaries.has(muscle));

    if (unexpectedPrimaries.length > 0) {
      console.error(`Unexpected primary muscle rows for ${repair.slug}: ${unexpectedPrimaries.join(", ")}`);
      await sql.end();
      process.exit(1);
    }

    console.log(`  - ${repair.slug}: keep ${repair.primaryMuscle}; demote/remove ${repair.reviewedDuplicatePrimaries.join(", ")}`);
  }

  console.log(`\nHigh-risk relation rows to ensure: ${HIGH_RISK_RELATIONS.length}`);
  for (const relation of HIGH_RISK_RELATIONS) {
    console.log(`  - ${relation.sourceSlug} -> ${relation.targetSlug} (${relation.relationType})`);
  }

  if (dryRun) {
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const repair of LEGACY_PRIMARY_MUSCLE_REPAIRS) {
      const exercise = exerciseBySlug.get(repair.slug)!;

      await tx`
        INSERT INTO exercise_muscles (exercise_id, muscle_group, role)
        VALUES (${exercise.id}, ${repair.primaryMuscle}, 'primary')
        ON CONFLICT DO NOTHING
      `;

      await tx`
        UPDATE exercise_muscles em
        SET role = 'secondary'
        WHERE em.exercise_id = ${exercise.id}
          AND em.role = 'primary'
          AND em.muscle_group IN ${sql([...repair.reviewedDuplicatePrimaries])}
          AND NOT EXISTS (
            SELECT 1
            FROM exercise_muscles existing
            WHERE existing.exercise_id = em.exercise_id
              AND existing.muscle_group = em.muscle_group
              AND existing.role = 'secondary'
          )
      `;

      await tx`
        DELETE FROM exercise_muscles em
        WHERE em.exercise_id = ${exercise.id}
          AND em.role = 'primary'
          AND em.muscle_group IN ${sql([...repair.reviewedDuplicatePrimaries])}
      `;

      await tx`
        UPDATE exercises
        SET primary_muscle_group = ${repair.primaryMuscle}, updated_at = now()
        WHERE id = ${exercise.id}
          AND primary_muscle_group IS DISTINCT FROM ${repair.primaryMuscle}
      `;
    }

    const relationRows = HIGH_RISK_RELATIONS.map((relation) => ({
      source_exercise_id: exerciseBySlug.get(relation.sourceSlug)!.id,
      target_exercise_id: exerciseBySlug.get(relation.targetSlug)!.id,
      relation_type: relation.relationType,
      substitution_policy: relation.substitutionPolicy,
      suitability_score: relation.suitabilityScore,
      notes: relation.notes,
    }));

    await tx`
      INSERT INTO exercise_relations ${tx(
        relationRows,
        "source_exercise_id",
        "target_exercise_id",
        "relation_type",
        "substitution_policy",
        "suitability_score",
        "notes",
      )}
      ON CONFLICT DO NOTHING
    `;
  });

  const duplicatePrimaryRows = await sql`
    SELECT e.slug, count(*)::int AS primary_count
    FROM exercise_muscles em
    JOIN exercises e ON e.id = em.exercise_id
    WHERE e.slug IN ${sql(repairSlugs)}
      AND em.role = 'primary'
    GROUP BY e.slug
    HAVING count(*) > 1
    ORDER BY e.slug
  `;

  if (duplicatePrimaryRows.length > 0) {
    console.error("\nRepair completed but duplicate primary rows remain:");
    for (const row of duplicatePrimaryRows) {
      console.error(`  - ${row.slug}: ${row.primary_count}`);
    }
    await sql.end();
    process.exit(1);
  }

  console.log("\nRepair complete. A second run should report no remaining changes.\n");
  await sql.end();
}

main().catch((err) => {
  console.error("\nRepair failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
