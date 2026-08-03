#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Reviewed Repair: Back Squat Primary Muscle
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repair-back-squat-primary.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/repair-back-squat-primary.ts
//
// Scope:
//   Back Squat only. Quadriceps becomes the single primary muscle.
//   Valid secondary/stabilizer associations are preserved.
//
// Safe to rerun: the second live run has no remaining changes.
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

  console.log("\nCatalyst OS — Repair: Back Squat Primary Muscle");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const exerciseRows = await sql`
    SELECT id, slug, primary_muscle_group
    FROM exercises
    WHERE slug = 'back-squat'
    LIMIT 1
  `;

  if (exerciseRows.length === 0) {
    console.log("Back Squat was not found. No changes applied.\n");
    await sql.end();
    return;
  }

  const backSquat = exerciseRows[0];
  const beforeMuscles = await sql`
    SELECT id, muscle_group, role
    FROM exercise_muscles
    WHERE exercise_id = ${backSquat.id}
    ORDER BY role, muscle_group, id
  `;

  console.log(`Current exercises.primary_muscle_group: ${backSquat.primary_muscle_group ?? "NULL"}`);
  console.log("Current Back Squat muscle rows:");
  for (const row of beforeMuscles) {
    console.log(`  - ${row.muscle_group}: ${row.role}`);
  }

  const primaryRows = beforeMuscles.filter((row) => row.role === "primary");
  const nonQuadPrimaryRows = primaryRows.filter((row) => row.muscle_group !== "quadriceps");
  const hasQuadricepsPrimary = primaryRows.some((row) => row.muscle_group === "quadriceps");

  console.log("\nPlanned changes:");
  if (!hasQuadricepsPrimary) {
    console.log("  - Insert quadriceps as primary");
  }
  for (const row of nonQuadPrimaryRows) {
    const hasSecondary = beforeMuscles.some(
      (candidate) => candidate.muscle_group === row.muscle_group && candidate.role === "secondary",
    );
    console.log(`  - ${hasSecondary ? "Remove duplicate" : "Convert"} ${row.muscle_group} primary${hasSecondary ? "" : " to secondary"}`);
  }
  if (backSquat.primary_muscle_group !== "quadriceps") {
    console.log("  - Set exercises.primary_muscle_group to quadriceps");
  }
  if (
    hasQuadricepsPrimary &&
    nonQuadPrimaryRows.length === 0 &&
    backSquat.primary_muscle_group === "quadriceps"
  ) {
    console.log("  - None");
  }

  if (dryRun) {
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO exercise_muscles (exercise_id, muscle_group, role)
      VALUES (${backSquat.id}, 'quadriceps', 'primary')
      ON CONFLICT DO NOTHING
    `;

    await tx`
      UPDATE exercise_muscles em
      SET role = 'secondary'
      WHERE em.exercise_id = ${backSquat.id}
        AND em.role = 'primary'
        AND em.muscle_group <> 'quadriceps'
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
      WHERE em.exercise_id = ${backSquat.id}
        AND em.role = 'primary'
        AND em.muscle_group <> 'quadriceps'
    `;

    await tx`
      UPDATE exercises
      SET primary_muscle_group = 'quadriceps', updated_at = now()
      WHERE id = ${backSquat.id}
        AND primary_muscle_group IS DISTINCT FROM 'quadriceps'
    `;
  });

  const afterMuscles = await sql`
    SELECT muscle_group, role
    FROM exercise_muscles
    WHERE exercise_id = ${backSquat.id}
    ORDER BY role, muscle_group
  `;
  const afterExercise = await sql`
    SELECT primary_muscle_group
    FROM exercises
    WHERE id = ${backSquat.id}
  `;

  console.log("\nAfter:");
  console.log(`  exercises.primary_muscle_group: ${afterExercise[0].primary_muscle_group}`);
  for (const row of afterMuscles) {
    console.log(`  - ${row.muscle_group}: ${row.role}`);
  }
  console.log("\nBack Squat repair complete.\n");

  await sql.end();
}

main().catch((err) => {
  console.error("\nRepair failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
