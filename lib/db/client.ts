// ─────────────────────────────────────────────────────────────
// Catalyst OS — Database Client
//
// SERVER-ONLY — never import this file from a client component.
// Provides a lazily-initialized Drizzle singleton.
//
// Uses postgres.js (PgBouncer compatible) as the driver.
// prepare: false is required for serverless environments where
// named prepared statements are not supported across connections.
//
// DATABASE_URL must be a Supabase Session Mode pooler URL for
// runtime queries. Use the direct connection URL for migrations.
//
// Lazy initialization: the connection is created on the first
// call to getDb(), not at module evaluation time. This prevents
// Next.js build-time failures when DATABASE_URL is not set in
// the build environment.
//
// HMR-safe in dev: `next dev` (Turbopack) re-evaluates this module
// on every edit to any file that transitively imports it, which
// would otherwise re-run `postgres(url)` and open a brand new
// connection pool each time — without ever closing the old one —
// until Supabase's session-mode pooler (15 connections) is
// exhausted and every route starts failing. Caching the instance
// on `globalThis` (dev only) survives module re-evaluation across
// hot reloads, matching the connection lifetime to the actual
// server process instead of the module instance.
// ─────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { _catalystDb?: DbInstance };

let _db: DbInstance | undefined = globalForDb._catalystDb;

export function getDb(): DbInstance {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "Add it to .env.local (development) or your Vercel project settings (production). " +
        "See .env.local.example for setup instructions.",
    );
  }

  _db = drizzle(postgres(url, { prepare: false }), { schema });
  if (process.env.NODE_ENV !== "production") globalForDb._catalystDb = _db;
  return _db;
}

export type Database = DbInstance;
