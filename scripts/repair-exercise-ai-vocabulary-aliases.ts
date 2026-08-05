#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Kynovant — Reviewed Repair: Exercise AI Vocabulary Aliases
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/repair-exercise-ai-vocabulary-aliases.ts --dry-run
//   set -a && source .env.local && set +a && npx tsx scripts/repair-exercise-ai-vocabulary-aliases.ts
//
// Scope:
//   Adds only reviewed, unambiguous alternate_names entries to existing
//   canonical Exercise Library rows. Does not touch generator behavior.
//
// Safe to rerun:
//   Merges aliases in application code and writes the same JSON array only
//   when a scoped row is missing one of the reviewed aliases.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import { AI_VOCABULARY_ALIAS_REPAIRS } from "./repairs/exercise-ai-vocabulary-aliases-data";

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.DATABASE_URL_DIRECT;

if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

function mergeAliases(existing: unknown, aliases: readonly string[]) {
  const merged = new Map<string, string>();

  if (Array.isArray(existing)) {
    for (const value of existing) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) merged.set(trimmed.toLowerCase(), trimmed);
    }
  }

  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (trimmed) merged.set(trimmed.toLowerCase(), trimmed);
  }

  return [...merged.values()];
}

async function main() {
  const sql = postgres(dbUrl!, { prepare: false });

  console.log("\nKynovant — Repair: Exercise AI Vocabulary Aliases");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────\n");

  const repairSlugs = AI_VOCABULARY_ALIAS_REPAIRS.map((repair) => repair.slug);
  const rows = await sql`
    SELECT id, slug, name, alternate_names
    FROM exercises
    WHERE slug IN ${sql(repairSlugs)}
    ORDER BY slug
  `;
  const rowBySlug = new Map(rows.map((row) => [row.slug as string, row]));
  const missingSlugs = repairSlugs.filter((slug) => !rowBySlug.has(slug));

  if (missingSlugs.length > 0) {
    console.error("Missing referenced exercises:");
    for (const slug of missingSlugs) console.error(`  - ${slug}`);
    await sql.end();
    process.exit(1);
  }

  const updates = AI_VOCABULARY_ALIAS_REPAIRS.map((repair) => {
    const row = rowBySlug.get(repair.slug)!;
    const mergedAliases = mergeAliases(row.alternate_names, repair.aliases);
    const existingAliases = Array.isArray(row.alternate_names) ? row.alternate_names : [];
    const changed = JSON.stringify(existingAliases) !== JSON.stringify(mergedAliases);
    return {
      id: row.id as string,
      slug: repair.slug,
      name: row.name as string,
      aliases: mergedAliases,
      changed,
      addedAliases: repair.aliases.filter(
        (alias) => !existingAliases.some(
          (existing) => typeof existing === "string" && existing.trim().toLowerCase() === alias.toLowerCase(),
        ),
      ),
    };
  });

  for (const update of updates) {
    const status = update.changed ? "update" : "ok";
    console.log(`  - ${update.slug} (${update.name}): ${status}`);
    for (const alias of update.addedAliases) console.log(`      + ${alias}`);
  }

  if (dryRun) {
    console.log("\nDry run complete — no changes applied.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const update of updates) {
      if (!update.changed) continue;
      // update.aliases is already a real string[] (see mergeAliases above)
      // — pass it directly. The postgres package serializes a bound
      // parameter targeting a jsonb column itself; wrapping it in
      // JSON.stringify() here first (the historical bug, root-caused
      // against a live reproduction — see the PR this comment shipped
      // with) serializes it a SECOND time, storing a jsonb string
      // ("[\"...\"]") instead of a jsonb array. No ::jsonb cast is
      // needed or wanted for the same reason.
      await tx`
        UPDATE exercises
        SET alternate_names = ${sql.json(update.aliases)},
            updated_at = now()
        WHERE id = ${update.id}
      `;
    }
  });

  console.log("\nAlias repair complete. A second run should report no changes.\n");
  await sql.end();
}

main().catch((err) => {
  console.error("\nRepair failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
