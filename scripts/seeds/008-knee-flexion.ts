#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library Seed 008: Knee Flexion
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/008-knee-flexion.ts
//
// Covers:
//   Direct hamstring knee flexion — seated curl, lying curl, Nordic curl
//
// Safe to rerun: inserts use ON CONFLICT DO NOTHING.
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, seedEquipment, seedExercises, sql } from "./_shared";
import {
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  MUSCLES,
  RELATIONS,
} from "./008-knee-flexion-data";

async function main() {
  console.log("\nCatalyst OS — Exercise Library Seed 008: Knee Flexion");
  console.log("─────────────────────────────────────────────────────────\n");

  console.log("Seeding equipment catalog…");
  const equipmentMap = await seedEquipment(SHARED_EQUIPMENT);
  console.log(`  ✓ Equipment: ${equipmentMap.size} total items`);

  await seedExercises(
    EXERCISES,
    equipmentMap,
    MUSCLES,
    EXERCISE_EQUIPMENT,
    CUES,
    RELATIONS,
    "008 — Knee Flexion (3 exercises)",
  );

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 008 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
