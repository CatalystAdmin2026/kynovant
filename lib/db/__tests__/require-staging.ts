// ─────────────────────────────────────────────────────────────
// Catalyst OS — In-Process Staging Guard for DB/Auth Integration Tests
//
// NOT a *.test.ts file itself (vitest's `include` glob only matches
// lib/**/__tests__/**/*.test.ts, so this file is never collected or
// run as a suite on its own) — it's a helper every mutation-heavy
// DB/Auth-backed test file imports and calls.
//
// Why this exists: vitest.config.ts used to auto-load .env.local for
// every test run so DB-backed suites "just worked" locally — but in
// this repo .env.local IS PRODUCTION. That auto-load has been
// removed (see vitest.config.ts's comment) specifically because of
// an incident where DB-fixture-creating tests were accidentally run
// against production through exactly that mechanism. Removing the
// auto-load alone already fails DB-backed tests closed (no
// DATABASE_URL → getDb()/createAdminClient() throw immediately, no
// writes of any kind) for every existing suite, without editing each
// one — but this helper adds an explicit, readable, SPECIFIC guard
// for suites that actually create Auth users / DB rows, so a
// misconfigured or half-sourced shell fails with a clear message
// pointing at `npm run test:staging` instead of an opaque connection
// error deep inside postgres.js.
//
// Usage — call at the TOP LEVEL of the test file (not inside a
// describe/it/beforeAll), so it throws during test collection/import,
// before any fixture-creating code in the file has a chance to run:
//
//   import { assertStagingDbOrThrow } from "./require-staging";
//   assertStagingDbOrThrow();
//
//   describe("...", () => { ... });
//
// Reuses the SAME production-ref constant and checks as
// scripts/assert-staging-db.ts (both import from
// lib/db/staging-guard.ts) — one source of truth, not two lists that
// can drift apart.
// ─────────────────────────────────────────────────────────────

import { findProductionViolation } from "@/lib/db/staging-guard";

export function assertStagingDbOrThrow(): void {
  const violation = findProductionViolation();
  if (violation) {
    throw new Error(
      `[require-staging] Refusing to run — ${violation} ` +
        "This test file creates real Auth users / DB rows and must only run " +
        "against staging. Run it via `npm run test:staging` (or `npm run " +
        "test:staging -- <path>` to scope it), which sources " +
        ".env.staging.local and verifies the target before vitest starts.",
    );
  }
}
