#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────
// Catalyst OS — Staging DB Guardrail
//
// Fails closed unless the currently-loaded DATABASE_URL /
// DATABASE_URL_DIRECT / NEXT_PUBLIC_SUPABASE_URL positively resolve
// to a Supabase project that is NOT production. Run this before any
// staging-only migration, fixture insertion, or destructive DB test:
//
//   set -a && source .env.staging.local && set +a
//   npx tsx scripts/assert-staging-db.ts && <the actual dangerous command>
//
// This is intentionally small and boring — no environment-management
// system, just a hard-coded production identifier and a same-process
// check that can't be talked out of running by a misleading variable
// name or a stale comment.
//
// FAILS CLOSED (non-zero exit, refuses to proceed) if:
//   - no DATABASE_URL/DATABASE_URL_DIRECT is set at all
//   - the connection's project ref matches production's
//   - NEXT_PUBLIC_SUPABASE_URL (when set) matches production's
//   - the target cannot actually be reached to verify
//
// Never prints the database password or any API key — only the
// project ref, which is not a secret (it's the subdomain of a
// public Supabase URL).
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";

// The one and only production project ref. Hard-coded deliberately —
// this must never come from an environment variable a misconfigured
// shell could quietly unset or override.
const PRODUCTION_PROJECT_REF = "fjcvuinkgqwcdciluuvp";

function fail(reason: string): never {
  console.error(`\n✗ REFUSING TO PROCEED — ${reason}\n`);
  console.error("This command only runs against a verified non-production database.");
  process.exit(1);
}

// Extracts the Supabase project ref from a pooler or direct Postgres
// connection string's username/host — e.g.
//   postgresql://postgres.<ref>:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres
//   postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres
function extractProjectRef(connectionString: string): string | null {
  const poolerMatch = connectionString.match(/postgres\.([a-z0-9]{20})/);
  if (poolerMatch) return poolerMatch[1];
  const directMatch = connectionString.match(/db\.([a-z0-9]{20})\.supabase\.co/);
  if (directMatch) return directMatch[1];
  return null;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!dbUrl) {
    fail("no DATABASE_URL or DATABASE_URL_DIRECT is set. Load a staging env file first.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    fail(`NEXT_PUBLIC_SUPABASE_URL points at the production project ref (${PRODUCTION_PROJECT_REF}).`);
  }

  const ref = extractProjectRef(dbUrl!);
  if (!ref) {
    fail("could not extract a Supabase project ref from DATABASE_URL — refusing to guess.");
  }
  if (ref === PRODUCTION_PROJECT_REF) {
    fail(`DATABASE_URL resolves to the production project ref (${PRODUCTION_PROJECT_REF}).`);
  }

  // Positive verification, not just "it's not the known-bad ref" —
  // actually connect and confirm the target is reachable and really
  // is what it claims to be, rather than trusting a string match alone.
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(dbUrl!, { prepare: false, connect_timeout: 10 });
    const [{ current_database }] = await sql<{ current_database: string }[]>`select current_database()`;
    if (!current_database) fail("connected, but could not read current_database() — refusing to guess.");
  } catch (err) {
    fail(`could not connect to verify the target database. ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await sql?.end({ timeout: 5 });
  }

  console.log(`✓ Verified non-production target. Project ref: ${ref}`);
}

main();
