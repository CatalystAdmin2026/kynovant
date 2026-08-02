#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Drizzle Migration Runner
//
// Usage:
//   npx tsx scripts/migrate.ts drizzle/0002_tidy_vision.sql
//   npx tsx scripts/migrate.ts drizzle/0002_tidy_vision.sql --dry-run
//
// Requires DATABASE_URL_DIRECT in the environment.
// Load from .env.local before calling:
//   set -a && source .env.local && set +a && npx tsx scripts/migrate.ts <file>
//
// When to use this script vs. drizzle-kit migrate:
//   - drizzle-kit migrate is preferred for standard Drizzle-generated
//     migrations. Run it as: DATABASE_URL=<direct_url> npx drizzle-kit migrate
//   - Use this script for migrations that include hand-written SQL
//     (RLS, policies, triggers, cross-schema FKs) that drizzle-kit may
//     not apply reliably, or when drizzle-kit fails due to pooler/URL issues.
//
// Statement parsing:
//   Drizzle migrations use "--> statement-breakpoint" as a statement
//   delimiter. Each chunk between delimiters may begin with SQL comment
//   lines (--) followed by the actual SQL. The parser strips comment-only
//   lines from the start of each chunk before deciding whether to execute
//   it. This preserves SQL that follows inline comments.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── CLI args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("Usage: npx tsx scripts/migrate.ts <migration-file> [--dry-run]");
  process.exit(1);
}

// ── Environment ───────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL_DIRECT;
if (!dbUrl) {
  console.error("DATABASE_URL_DIRECT is not set.");
  console.error("Load your .env.local before running this script.");
  process.exit(1);
}

// ── Parser ────────────────────────────────────────────────────

// Splits a Drizzle migration file into executable SQL statements.
//
// Drizzle uses "--> statement-breakpoint" as the statement boundary.
// Splitting on this delimiter produces chunks; each chunk may begin with
// one or more SQL comment lines (--) that document the statement below.
//
// Wrong approach (original bug):
//   .filter(chunk => !chunk.trimStart().startsWith("--"))
//   → drops any chunk whose first non-whitespace character is "--",
//     discarding the SQL that follows the comment.
//
// Correct approach:
//   Strip comment-only lines from each chunk first, then check if
//   the remaining content is non-empty SQL.
function parseDrizzleMigration(content: string): string[] {
  return content
    .split("--> statement-breakpoint")
    .flatMap((chunk) => {
      const sql = chunk
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim();
      return sql.length > 0 ? [sql] : [];
    });
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  // filePath and dbUrl are guaranteed non-null by the guards above;
  // TypeScript doesn't narrow them through closures, so we assert here.
  const absolutePath = resolve(filePath!);
  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch {
    console.error(`Cannot read migration file: ${absolutePath}`);
    process.exit(1);
  }

  const statements = parseDrizzleMigration(content);

  console.log(`\nMigration: ${absolutePath}`);
  console.log(`Mode:      ${dryRun ? "DRY RUN (no changes applied)" : "LIVE"}`);
  console.log(`Statements detected: ${statements.length}\n`);

  if (dryRun) {
    for (let i = 0; i < statements.length; i++) {
      const preview = statements[i].slice(0, 100).replace(/\n/g, " ").trim();
      console.log(`  [${String(i + 1).padStart(2, "0")}/${statements.length}] ${preview}…`);
    }
    console.log(`\n✓ Dry run complete — ${statements.length} statement(s) would be executed.\n`);
    return;
  }

  const sql = postgres(dbUrl!, { prepare: false });

  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.slice(0, 100).replace(/\n/g, " ").trim();
      try {
        await sql.unsafe(stmt);
        console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}…`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ [${i + 1}/${statements.length}] ${preview}…`);
        console.error(`    ERROR: ${msg}`);
        throw err;
      }
    }
    console.log(`\n✓ Migration applied — ${statements.length} statement(s) executed.\n`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
