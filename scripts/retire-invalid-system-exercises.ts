#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Kynovant — Retire Invalid SYSTEM Exercises
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/retire-invalid-system-exercises.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/retire-invalid-system-exercises.ts
//
// Requires DATABASE_URL_DIRECT. Archives (never deletes) the exercises
// listed in scripts/repairs/retired-system-exercises.ts — see that file
// for why archiving preserves historical programs while excluding the
// row from every new generation. Safe to re-run: already-archived rows
// no longer match.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import {
  RETIRED_SYSTEM_EXERCISES,
  countReferences,
  findRetirementTargets,
  retireSystemExercises,
} from "./repairs/retired-system-exercises";

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.DATABASE_URL_DIRECT;

if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log("\nKynovant — Retire Invalid SYSTEM Exercises");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const targets = await findRetirementTargets(sql);
  console.log(`Configured for retirement: ${RETIRED_SYSTEM_EXERCISES.length}; still not archived in this database: ${targets.length}`);
  for (const t of targets) {
    const refs = await countReferences(sql, t.id);
    console.log(
      `  - ${t.slug} (${t.name}) status=${t.status} — referenced by ${refs.templateExerciseRefs} program exercise row(s), ${refs.relationRefs} relation row(s); all preserved.`,
    );
  }

  if (dryRun) {
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }
  if (targets.length === 0) {
    console.log("\nNothing to retire. Already in sync.\n");
    await sql.end();
    return;
  }

  const result = await retireSystemExercises(sql);
  console.log(`\n✓ Archived ${result.retiredCount} exercise(s): ${result.retiredSlugs.join(", ")}\n`);
  await sql.end();
}

main().catch((err) => {
  console.error("\nRetirement failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
