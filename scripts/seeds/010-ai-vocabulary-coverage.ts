#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Kynovant — Exercise Library Seed 010: AI Vocabulary Coverage
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/010-ai-vocabulary-coverage.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/seeds/010-ai-vocabulary-coverage.ts
//
// Covers:
//   Common AI-generated coaching vocabulary that represents genuinely
//   missing canonical Exercise Library rows.
//
// Safe to rerun: inserts use ON CONFLICT DO NOTHING.
// Spec: docs/exercise-intelligence-spec.md
// ─────────────────────────────────────────────────────────────

import { SHARED_EQUIPMENT, seedEquipment, seedExercises, sql } from "./_shared";
import {
  CROSS_FILE_RELATIONS,
  CUES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  findMissingRelationReferenceSlugs,
  INTRA_FILE_RELATIONS,
  MUSCLES,
} from "./010-ai-vocabulary-coverage-data";

const dryRun = process.argv.includes("--dry-run");
const seedPayloadSlugs = new Set<string>(EXERCISES.map((exercise) => exercise.slug));

async function ensureCrossFileRelations() {
  const relationSlugs = Array.from(new Set(CROSS_FILE_RELATIONS.flatMap((relation) => [
    relation.sourceSlug,
    relation.targetSlug,
  ])));
  const externalRelationSlugs = relationSlugs.filter((slug) => !seedPayloadSlugs.has(slug));

  const exerciseRows = await sql`
    SELECT id, slug
    FROM exercises
    WHERE slug IN ${sql(dryRun ? externalRelationSlugs : relationSlugs)}
  `;
  const exerciseBySlug = new Map(exerciseRows.map((row) => [row.slug as string, row]));
  const missingSlugs = findMissingRelationReferenceSlugs(
    CROSS_FILE_RELATIONS,
    new Set(exerciseRows.map((row) => row.slug as string)),
    seedPayloadSlugs,
  );

  if (missingSlugs.length > 0) {
    throw new Error(`Missing referenced relation exercise(s): ${missingSlugs.join(", ")}`);
  }

  if (dryRun) {
    console.log(`  Dry run: validated ${CROSS_FILE_RELATIONS.length} cross-file relations`);
    console.log(`  Dry run: ${EXERCISES.length} same-batch exercise slugs are available for relation validation`);
    return;
  }

  const relationRows = CROSS_FILE_RELATIONS.map((relation) => ({
    source_exercise_id: exerciseBySlug.get(relation.sourceSlug)!.id,
    target_exercise_id: exerciseBySlug.get(relation.targetSlug)!.id,
    relation_type: relation.relationType,
    substitution_policy: relation.substitutionPolicy,
    suitability_score: relation.suitabilityScore,
    notes: relation.notes,
  }));

  await sql`
    INSERT INTO exercise_relations ${sql(
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
  console.log(`  ✓ Cross-file relations: ${relationRows.length}`);
}

async function main() {
  console.log("\nKynovant — Exercise Library Seed 010: AI Vocabulary Coverage");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  if (dryRun) {
    console.log(`Would seed ${EXERCISES.length} exercises:`);
    for (const exercise of EXERCISES) console.log(`  - ${exercise.slug}`);
    await ensureCrossFileRelations();
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  console.log("Seeding equipment catalog…");
  const equipmentMap = await seedEquipment(SHARED_EQUIPMENT);
  console.log(`  ✓ Equipment: ${equipmentMap.size} total items`);

  await seedExercises(
    EXERCISES,
    equipmentMap,
    MUSCLES,
    EXERCISE_EQUIPMENT,
    CUES,
    INTRA_FILE_RELATIONS,
    "010 — AI Vocabulary Coverage (11 exercises)",
  );

  await ensureCrossFileRelations();

  console.log("─────────────────────────────────────────────────────────");
  console.log("Seed 010 complete.\n");
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
