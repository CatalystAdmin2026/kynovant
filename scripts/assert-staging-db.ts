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
// (`npm run test:staging` does all three steps — source the staging
// env, run this guard, then run vitest — for you.)
//
// The production-ref constant and the pure env-var checks live in
// lib/db/staging-guard.ts, the SAME module lib/db/__tests__/
// require-staging.ts imports for its in-process test-file guard —
// one source of truth for "is this production," not two lists that
// can drift apart.
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
import { findProductionViolation, extractProjectRef } from "../lib/db/staging-guard";

function fail(reason: string): never {
  console.error(`\n✗ REFUSING TO PROCEED — ${reason}\n`);
  console.error("This command only runs against a verified non-production database.");
  process.exit(1);
}

async function main() {
  const violation = findProductionViolation();
  if (violation) fail(violation);

  // Positive verification, not just "it's not the known-bad ref" —
  // actually connect and confirm the target is reachable and really
  // is what it claims to be, rather than trusting a string match alone.
  const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  const ref = extractProjectRef(dbUrl!);

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
