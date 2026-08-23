// ─────────────────────────────────────────────────────────────
// staging-guard.ts — pure unit suite, no DB, no network.
//
// This module is the SINGLE source of truth scripts/assert-staging-db.ts
// and lib/db/__tests__/require-staging.ts both trust to decide "is this
// production?" — it has never had its own direct test coverage. These
// tests exercise findProductionViolation()/extractProjectRef() against
// every branch called out in its own comments, without needing a real
// database connection (that positive-reachability check is
// assert-staging-db.ts's job, deliberately out of scope here).
// ─────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it } from "vitest";
import { extractProjectRef, findProductionViolation, PRODUCTION_PROJECT_REF } from "../staging-guard";

const ENV_KEYS = ["DATABASE_URL", "DATABASE_URL_DIRECT", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    if (key in vars) {
      process.env[key] = vars[key];
    } else {
      delete process.env[key];
    }
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
    delete savedEnv[key];
  }
});

// A syntactically valid, non-production ref of the same 20-char shape
// as a real Supabase project ref — never a real project's identifier.
const STAGING_REF = "ualqkfeisqpmcrjxqgdr";
const OTHER_NONPROD_REF = "abcdefghijklmnopqrst";

describe("extractProjectRef", () => {
  it("extracts the ref from a pooler connection string", () => {
    const url = `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`;
    expect(extractProjectRef(url)).toBe(STAGING_REF);
  });

  it("extracts the ref from a direct connection string", () => {
    const url = `postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`;
    expect(extractProjectRef(url)).toBe(STAGING_REF);
  });

  it("returns null for a connection string with no recognizable ref", () => {
    expect(extractProjectRef("postgresql://user:pw@localhost:5432/dev")).toBeNull();
  });
});

describe("findProductionViolation", () => {
  it("flags when neither DATABASE_URL nor DATABASE_URL_DIRECT is set", () => {
    setEnv({});
    expect(findProductionViolation()).toMatch(/no DATABASE_URL/);
  });

  it("prefers DATABASE_URL_DIRECT over DATABASE_URL when both are set", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
      DATABASE_URL_DIRECT: `postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`,
    });
    // DATABASE_URL alone would fail this — proves DIRECT wins the precedence.
    expect(findProductionViolation()).toBeNull();
  });

  it("flags a DATABASE_URL (pooler form) resolving to the production ref", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
    });
    expect(findProductionViolation()).toMatch(new RegExp(PRODUCTION_PROJECT_REF));
  });

  it("flags a DATABASE_URL (direct form) resolving to the production ref", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres:pw@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    });
    expect(findProductionViolation()).toMatch(new RegExp(PRODUCTION_PROJECT_REF));
  });

  it("flags NEXT_PUBLIC_SUPABASE_URL pointing at production even if DATABASE_URL looks like staging", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    });
    expect(findProductionViolation()).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("flags a DATABASE_URL whose ref cannot be extracted, rather than assuming it's safe", () => {
    setEnv({ DATABASE_URL: "postgresql://user:pw@localhost:5432/dev" });
    expect(findProductionViolation()).toMatch(/refusing to guess/);
  });

  it("returns null for a DATABASE_URL resolving to a genuinely non-production ref", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres.${OTHER_NONPROD_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER_NONPROD_REF}.supabase.co`,
    });
    expect(findProductionViolation()).toBeNull();
  });

  it("returns null for the real documented staging ref (docs/staging-environment.md)", () => {
    setEnv({
      DATABASE_URL: `postgresql://postgres.${STAGING_REF}:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    });
    expect(findProductionViolation()).toBeNull();
  });
});
