// ─────────────────────────────────────────────────────────────
// isSerializationFailure() — pure adversarial unit tests
//
// [Independent review remediation] The single-level `.cause` check
// this function originally shipped with missed a real, empirically-
// confirmed failure mode: createWorkoutSession()'s SERIALIZABLE
// transaction can fail at COMMIT time (Postgres SQLSTATE 40001, "could
// not serialize access due to read/write dependencies among
// transactions") via a code path that bypasses drizzle-orm's own
// error-wrapping entirely — see lib/db/client.ts's own header comment
// on isSerializationFailure for the full trace through
// node_modules/drizzle-orm/postgres-js/session.js and
// node_modules/postgres/src/index.js. That failure surfaces as a RAW,
// undecorated PostgresError (SHALLOWER than the one-level-wrapped
// shape this function was originally built around), while a
// mid-transaction STATEMENT failure still surfaces via drizzle's
// "Failed query: ..." wrapper with the real PostgresError one level
// down in `.cause`. Recognition must work for either shape, and for
// any other depth a wrapper might introduce, without ever classifying
// an error that isn't actually SQLSTATE 40001 somewhere in its chain.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { isSerializationFailure } from "../client";

function postgresErrorLike(overrides: Partial<{ code: string; message: string; severity: string }> = {}) {
  const err = new Error(overrides.message ?? "could not serialize access due to read/write dependencies among transactions");
  err.name = "PostgresError";
  Object.assign(err, { code: "40001", severity: "ERROR", ...overrides });
  return err;
}

describe("isSerializationFailure", () => {
  it("recognizes a direct { code: '40001' } object with no Error wrapper at all", () => {
    expect(isSerializationFailure({ code: "40001" })).toBe(true);
  });

  it("recognizes a raw, undecorated PostgresError-shaped Error with .code directly on it (the COMMIT-time shape — no .cause)", () => {
    const raw = postgresErrorLike();
    expect(raw.cause).toBeUndefined();
    expect(isSerializationFailure(raw)).toBe(true);
  });

  it("recognizes a one-level-wrapped .cause (the drizzle 'Failed query: ...' STATEMENT-time shape)", () => {
    const wrapped = new Error("Failed query: insert into \"workout_sessions\" ...", { cause: postgresErrorLike() });
    expect(isSerializationFailure(wrapped)).toBe(true);
  });

  it("recognizes a deeper, multiply-nested .cause chain (an unknown/future wrapper depth)", () => {
    const deep = new Error("outer wrapper", {
      cause: new Error("middle wrapper", {
        cause: new Error("Failed query: ...", {
          cause: postgresErrorLike(),
        }),
      }),
    });
    expect(isSerializationFailure(deep)).toBe(true);
  });

  it("recognizes a 40001 nested inside an AggregateError's .errors", () => {
    const agg = new AggregateError([new Error("unrelated failure"), postgresErrorLike()], "multiple errors");
    expect(isSerializationFailure(agg)).toBe(true);
  });

  it("recognizes a 40001 nested inside an AggregateError wrapped in another .cause layer", () => {
    const wrapped = new Error("outer", {
      cause: new AggregateError([postgresErrorLike()], "agg"),
    });
    expect(isSerializationFailure(wrapped)).toBe(true);
  });

  it("does NOT classify an unrelated error with no 40001 anywhere in its chain", () => {
    expect(isSerializationFailure(new Error("Network error — try again"))).toBe(false);
    expect(isSerializationFailure(new Error("Failed query: ...", { cause: postgresErrorLike({ code: "23505" }) }))).toBe(false);
    expect(isSerializationFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("does NOT classify a similarly-worded message with a different SQLSTATE (e.g. 40P01 deadlock_detected)", () => {
    // Deliberately adjacent SQLSTATE — proves this depends on the
    // actual code value, not message text or proximity to "40" codes.
    expect(isSerializationFailure(postgresErrorLike({ code: "40P01", message: "deadlock detected" }))).toBe(false);
  });

  it("does NOT classify null, undefined, primitives, or a plain object with no code", () => {
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
    expect(isSerializationFailure("40001")).toBe(false);
    expect(isSerializationFailure(40001)).toBe(false);
    expect(isSerializationFailure({})).toBe(false);
    expect(isSerializationFailure({ message: "40001" })).toBe(false);
  });

  it("does not classify an unrelated error wrapped many levels deep (proves the chain walk doesn't false-positive by depth alone)", () => {
    let err: Error = new Error("innermost — genuinely unrelated");
    for (let i = 0; i < 8; i++) {
      err = new Error(`wrapper level ${i}`, { cause: err });
    }
    expect(isSerializationFailure(err)).toBe(false);
  });

  it("is bounded — an absurdly deep chain does not hang or throw, and still correctly finds a 40001 within the bound", () => {
    let err: Error = postgresErrorLike();
    for (let i = 0; i < 5; i++) {
      err = new Error(`wrapper level ${i}`, { cause: err });
    }
    expect(isSerializationFailure(err)).toBe(true);
  });
});
