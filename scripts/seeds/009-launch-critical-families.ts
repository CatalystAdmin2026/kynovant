#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 009: Launch Families
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/009-launch-critical-families.ts
//
// Covers:
//   Calves, basic cardio, and essential high-frequency mobility
//
// Safe to rerun: inserts use ON CONFLICT DO NOTHING.
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, seedEquipment, seedExercises, sql } from "./_shared";
import {
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  LOCAL_EQUIPMENT,
  MUSCLES,
  RELATIONS,
} from "./009-launch-critical-families-data";

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 009: Launch Families");
  console.log("─────────────────────────────────────────────────────────\n");

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
    "009 — Launch Families (22 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 009 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
