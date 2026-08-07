#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Kynovant — Exercise Library Seed 011: Reviewed Library Expansion
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/011-reviewed-library-expansion.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/011-reviewed-library-expansion.ts
//
// Safe to rerun: inserts use ON CONFLICT DO NOTHING.
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, seedEquipment, seedExercises, sql } from "./_shared";
import {
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  EXPANSION_FAMILY_COUNTS,
  LOCAL_EQUIPMENT,
  MUSCLES,
  RELATIONS,
} from "./011-reviewed-library-expansion-data";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("\nKynovant — Exercise Library Seed 011: Reviewed Library Expansion");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  if (dryRun) {
    console.log(`Would seed ${EXERCISES.length} reviewed exercises across ${Object.keys(EXPANSION_FAMILY_COUNTS).length} families:`);
    for (const [family, count] of Object.entries(EXPANSION_FAMILY_COUNTS)) {
      console.log(`  - ${family}: ${count}`);
    }
    console.log(`Would add ${MUSCLES.length} muscle associations`);
    console.log(`Would add ${EXERCISE_EQUIPMENT.length} equipment associations`);
    console.log(`Would add ${CUES.length} coaching cues`);
    console.log(`Would add ${RELATIONS.length} intra-seed progression/regression/same-pattern relations`);
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  console.log("Seeding equipment catalog…");
  const equipmentMap = await seedEquipment([...SHARED_EQUIPMENT, ...LOCAL_EQUIPMENT]);
  console.log(`  ✓ Equipment: ${equipmentMap.size} total items`);

  await seedExercises(
    EXERCISES,
    equipmentMap,
    MUSCLES,
    EXERCISE_EQUIPMENT,
    CUES,
    RELATIONS,
    `011 — Reviewed Library Expansion (${EXERCISES.length} exercises)`,
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 011 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
