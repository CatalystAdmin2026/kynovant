import { defineConfig } from "vitest/config";
import { resolve } from "path";

// ─────────────────────────────────────────────────────────────
// DELIBERATELY does NOT auto-load .env.local.
//
// This file used to call process.loadEnvFile(".env.local") here so
// DB-backed suites (e.g. coach-tenant-isolation.test.ts) "just
// worked" locally without sourcing anything by hand. That convenience
// is exactly what caused a real incident: a DB-fixture-creating test
// run picked up .env.local's DATABASE_URL/NEXT_PUBLIC_SUPABASE_URL —
// which in THIS repo is PRODUCTION, not a shared dev DB — and created
// throwaway Auth users and rows there before anyone noticed.
//
// Removing the auto-load means any DB-backed test run without an
// explicit env source now has NO DATABASE_URL at all, so getDb()/
// createAdminClient() throw immediately and fail closed — no writes,
// anywhere, ever, by accident. It never touches CI (CI has no
// .env.local file; it injects DATABASE_URL directly, same as before).
//
// To actually run DB/Auth-backed suites locally, use:
//   npm run test:staging               # all DB-backed suites
//   npm run test:staging -- <path>      # a single file
// which explicitly sources .env.staging.local, runs
// scripts/assert-staging-db.ts to positively verify the target is NOT
// production, and only then launches vitest. Mutation-heavy suites
// additionally call lib/db/__tests__/require-staging.ts's
// assertStagingDbOrThrow() at module load time as a second,
// in-process line of defense — see that file's header comment.
//
// Pure unit tests are entirely unaffected either way: they never read
// DATABASE_URL and don't need staging to run via plain `npm test`.
// ─────────────────────────────────────────────────────────────

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/pil/__tests__/setup.ts"],
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
