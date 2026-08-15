// ─────────────────────────────────────────────────────────────
// DB client connection-pool sizing — source-level regression gate.
//
// Root cause this guards against: getDb() created its postgres.js
// client with no `max` (defaults to 10 per client instance) and no
// `idle_timeout`. In production, each concurrently-warm Vercel
// function instance holds its own client (the globalThis singleton
// cache is dev-only — see getDb()'s own comment), so an unbounded
// per-instance ceiling multiplies across however many instances are
// warm at once. Confirmed in production runtime logs: multiple
// unrelated /portal queries (client_profiles, workout_sessions,
// client_programs) failed within the same few seconds with the
// Postgres pooler's own "(EMAXCONNSESSION) max clients reached in
// session mode - max clients are limited to pool_size: 15" — a pure
// connection-budget failure, unrelated to any query's actual data.
//
// Same "read the source, assert on it" style as this codebase's other
// config-shaped regression gates (resend-isolation-security.test.ts,
// recovery-redirect-source.test.ts).
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("lib/db/client.ts — bounded connection pool", () => {
  it("caps postgres.js's per-instance connection pool well below Supabase's 15-connection Session Mode budget", () => {
    const client = source("lib/db/client.ts");
    const match = client.match(/postgres\(url,\s*\{([^}]*)\}\)/);
    expect(match).not.toBeNull();
    const options = match![1];

    const maxMatch = options.match(/max:\s*(\d+)/);
    expect(maxMatch).not.toBeNull();
    const max = Number(maxMatch![1]);
    // Not unbounded (postgres.js's own default is 10), and small enough
    // that several concurrently-warm serverless instances can't
    // singlehandedly exhaust the shared 15-connection pooler.
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(5);

    expect(options).toMatch(/idle_timeout:\s*\d+/);
  });

  it("the pool-sizing options apply in every environment, not gated behind a dev-only check", () => {
    const client = source("lib/db/client.ts");
    // The 15-connection Supabase pooler constraint applies identically
    // in dev and production (both connect through the same pooler URL)
    // — unlike the globalThis HMR-survival cache a few lines above,
    // which is correctly dev-only, `max`/`idle_timeout` must not be
    // wrapped in a `NODE_ENV !== "production"` (or similar) guard.
    const poolLine = client.split("\n").find((l) => l.includes("postgres(url,"));
    expect(poolLine).toBeDefined();
    expect(poolLine).not.toMatch(/NODE_ENV/);
  });
});
