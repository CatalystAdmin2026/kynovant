// ─────────────────────────────────────────────────────────────
// Catalyst OS — Shared Production-Ref Guard
//
// SINGLE source of truth for "is this environment production?",
// shared by scripts/assert-staging-db.ts (the CLI guard run before
// any staging migration/fixture command) and
// lib/db/__tests__/require-staging.ts (the in-process guard every
// mutation-heavy DB/Auth test file calls at module load time).
//
// Deliberately just a hard-coded ref + two pure string checks — no
// environment-management system, nothing that could be talked out
// of running by a misleading variable name or a stale comment.
// ─────────────────────────────────────────────────────────────

// The one and only production project ref. Hard-coded deliberately —
// this must never come from an environment variable a misconfigured
// shell could quietly unset or override.
export const PRODUCTION_PROJECT_REF = "fjcvuinkgqwcdciluuvp";

// Extracts the Supabase project ref from a pooler or direct Postgres
// connection string's username/host — e.g.
//   postgresql://postgres.<ref>:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres
//   postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres
export function extractProjectRef(connectionString: string): string | null {
  const poolerMatch = connectionString.match(/postgres\.([a-z0-9]{20})/);
  if (poolerMatch) return poolerMatch[1];
  const directMatch = connectionString.match(/db\.([a-z0-9]{20})\.supabase\.co/);
  if (directMatch) return directMatch[1];
  return null;
}

// Pure, synchronous, no-network-call check of the currently-loaded env
// vars. Returns a human-readable reason string if they indicate
// production (or are unusable), or null if they look like a safe,
// non-production target. Does NOT positively verify reachability —
// that's what scripts/assert-staging-db.ts's network check is for.
// Callers that can't afford a network round-trip (e.g. this runs once
// per test FILE at import time) use this synchronous check instead.
export function findProductionViolation(): string | null {
  const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!dbUrl) {
    return "no DATABASE_URL or DATABASE_URL_DIRECT is set. Load a staging env file first (npm run test:staging).";
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    return `NEXT_PUBLIC_SUPABASE_URL points at the production project ref (${PRODUCTION_PROJECT_REF}).`;
  }

  const ref = extractProjectRef(dbUrl);
  if (!ref) {
    return "could not extract a Supabase project ref from DATABASE_URL — refusing to guess.";
  }
  if (ref === PRODUCTION_PROJECT_REF) {
    return `DATABASE_URL resolves to the production project ref (${PRODUCTION_PROJECT_REF}).`;
  }

  return null;
}
