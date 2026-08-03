import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { existsSync } from "fs";

// Load .env.local into process.env for tests that need a real DATABASE_URL
// (e.g. lib/db/__tests__/coach-tenant-isolation.test.ts). Safe no-op when
// .env.local doesn't exist (CI, where DATABASE_URL is injected directly) —
// matches the existing `set -a && source .env.local && set +a` convention
// already used by scripts/migrate.ts, just applied automatically here
// instead of requiring it to be sourced by hand before every test run.
if (existsSync(resolve(__dirname, ".env.local"))) {
  process.loadEnvFile(resolve(__dirname, ".env.local"));
}

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
