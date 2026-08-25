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
//
// max/idle_timeout (both environments — this is not a dev-only
// concern): postgres.js defaults to up to 10 connections per client
// instance with no idle timeout. In production, each concurrently-
// warm Vercel function instance holds its own client (the globalThis
// cache above is dev-only, by design — see the comment on `getDb()`),
// so an unbounded per-instance ceiling multiplies across however many
// instances happen to be warm at once. A single /portal page load
// alone already fans out to a dozen-plus concurrent queries (see
// lib/db/portal-dashboard-service.ts's nested Promise.all groups), so
// even two or three concurrently-warm instances could singlehandedly
// exceed the shared 15-connection Session Mode budget — confirmed in
// production: multiple unrelated queries (client_profiles,
// workout_sessions, client_programs) failed with the Postgres pooler's
// own "(EMAXCONNSESSION) max clients reached in session mode - max
// clients are limited to pool_size: 15" within the same few seconds,
// well before any query result — data shape was never involved.
// max: 3 keeps each instance's ceiling low enough that several
// instances can be warm simultaneously without approaching the shared
// cap, while still giving a single request's Promise.all groups real
// parallelism. idle_timeout releases connections proactively instead
// of holding them until the process itself recycles.
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

  _db = drizzle(postgres(url, { prepare: false, max: 3, idle_timeout: 20 }), { schema });
  if (process.env.NODE_ENV !== "production") globalForDb._catalystDb = _db;
  return _db;
}

export type Database = DbInstance;

// [Program publish auto-dependency workflow — TOCTOU remediation]
// A handful of read-only query functions (getBlueprintEnriched,
// checkDaysPerWeek) normally call getDb() themselves and so always run
// against a fresh connection/transaction, outside of any caller's own
// transaction boundary. That's fine for their existing callers, but it
// means a caller that validates a row's content and THEN mutates that
// row inside its own transaction has no guarantee the validated state
// is the state actually being committed — a concurrent write between
// the (separate) validation read and the transactional write is
// invisible to Postgres's own conflict detection, because the two
// reads/writes never shared a transaction to detect a conflict within.
// DbOrTx lets those functions optionally accept the caller's own `tx`
// (from db.transaction(async (tx) => ...)) instead of opening a new
// connection, so their reads participate in — and are protected by —
// the caller's own transaction/isolation level. Passing nothing
// preserves the exact previous behavior (falls back to getDb()).
export type DbOrTx = DbInstance | Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

// Shared with any caller running a SERIALIZABLE transaction that needs
// to detect Postgres SQLSTATE 40001 (serialization_failure) and turn it
// into a clean "please try again" result instead of a raw exception.
// Originally written for publishProgramWithDependencies() (program-
// builder-service.ts) and factored out here once workout-session-
// service.ts needed the identical detection logic — one source of
// truth for a subtlety that already cost a real debugging cycle once:
// drizzle-orm's query layer wraps every driver error in a new
// Error("Failed query: ...") and attaches the original PostgresError
// (which actually carries `.code`) via `.cause`, so `.code` must be
// checked on both the error itself and err.cause, not just the outer
// one — confirmed empirically against a real concurrent-transaction
// conflict in staging, not assumed.
function hasSerializationFailureCode(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "40001";
}

export function isSerializationFailure(err: unknown): boolean {
  if (hasSerializationFailureCode(err)) return true;
  if (err instanceof Error && err.cause !== undefined) {
    return hasSerializationFailureCode(err.cause);
  }
  return false;
}
