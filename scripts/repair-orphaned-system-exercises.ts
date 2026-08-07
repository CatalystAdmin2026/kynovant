#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — One-Time Repair: Orphaned "system" Exercises
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repair-orphaned-system-exercises.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/repair-orphaned-system-exercises.ts
//
// Requires DATABASE_URL_DIRECT in the environment.
//
// See scripts/repairs/orphaned-system-exercises.ts for the defect
// explanation, the exact safety predicate, and why it's safe — this
// file is a thin CLI wrapper around that module's pure, tested logic
// (lib/db/__tests__/repair-orphaned-system-exercises.test.ts).
//
// NOTE: the shared database has already been repaired manually
// (2026-08-05, as part of the AI Program Generator production-readiness
// audit). This script exists so the SAME defect can be repaired
// identically and idempotently on a fresh database, a preview
// environment, a restore, or after a future seed run recreates it —
// there is no need to run it against the already-repaired shared
// database again, and doing so is safe regardless (it will report zero
// rows to repair).
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import {
  findOrphanedSystemExercises,
  repairOrphanedSystemExercises,
} from "./repairs/orphaned-system-exercises";

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.DATABASE_URL_DIRECT;

if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log('\nCatalyst OS — Repair: Orphaned "system" Exercises');
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const affected = await findOrphanedSystemExercises(sql);
  console.log(`Rows matching scope='coach' AND created_by IS NULL AND slug IN <canonical seed set>: ${affected.length}`);
  if (affected.length > 0) {
    const preview = affected.slice(0, 15);
    for (const r of preview) {
      console.log(`  - ${r.slug} (${r.name})`);
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

  const result = await repairOrphanedSystemExercises(sql);
  console.log(`\n✓ Repaired ${result.repairedCount} row(s) — reclassified to scope='system'.\n`);

  await sql.end();
}

main().catch((err) => {
  console.error("\nRepair failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
