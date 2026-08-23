// ─────────────────────────────────────────────────────────────
// mapWithConcurrency — pure unit suite, no DB, no provider.
//
// Phase D (blueprint-guided canonical-week concurrency): this
// primitive is reused nearly verbatim from the earlier intra-week
// concurrency prototype (commit 0e1936f) — see staged-generation.ts's
// own comment above it for why the primitive itself was never the
// source of that prototype's quality regression. Proven directly here
// before trusting it inside the much larger orchestration function.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { mapWithConcurrency, resolveDayConcurrency, releaseQuotaOnTimeout } from "../staged-generation";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("returns results in the SAME order as the input items, regardless of completion order", async () => {
    const delays = [30, 15, 5];
    const results = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await delay(ms);
      return i;
    });
    expect(results).toEqual([0, 1, 2]);
  });

  it("never runs more than `limit` calls concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight--;
      return i;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // sanity: concurrency actually happened, not accidentally serial
  });

  it("returns an empty array for an empty input, without calling fn", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 5, async () => {
      calls++;
      return null;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("caps the worker count to the item count when limit exceeds it — no wasted/duplicate calls", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([1, 2], 10, async (n) => {
      calls++;
      return n * 2;
    });
    expect(calls).toBe(2);
    expect(results).toEqual([2, 4]);
  });

  it("processes all items exactly once even when limit is 1 (fully serial fallback)", async () => {
    const order: number[] = [];
    const results = await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(n);
      await delay(1);
      return n;
    });
    expect(order).toEqual([1, 2, 3]); // limit=1 is also strictly in-order, not just same-final-array-order
    expect(results).toEqual([1, 2, 3]);
  });

  it("a rejected item's error propagates (callers are expected to catch inside fn, not rely on this)", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("[G] concurrency=1 matches strictly serial semantics — items dispatched and completed one at a time, never overlapping", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3, 4], 1, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(5);
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBe(1);
  });

  it("[I] a discriminated-result 'failure' (not a thrown error) for one item does not prevent siblings from completing and being returned", async () => {
    // Mirrors the real usage in staged-generation.ts: generateProgramDay
    // never throws for an ordinary provider failure, it returns
    // {ok:false,...} as data — mapWithConcurrency just sees a normal
    // resolved value, and every sibling still runs to completion.
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 5, async (n) => {
      await delay(5);
      return n === 3 ? { ok: false as const, n } : { ok: true as const, n };
    });
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(results.find((r) => !r.ok)?.n).toBe(3);
  });
});

describe("resolveDayConcurrency", () => {
  const originalEnv = process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY;
    else process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY = originalEnv;
  });

  it("defaults to 5 when unset", () => {
    delete process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY;
    expect(resolveDayConcurrency()).toBe(5);
  });

  it("honors a valid override", () => {
    process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY = "3";
    expect(resolveDayConcurrency()).toBe(3);
  });

  it("[F] concurrency=1 is a valid override — forces fully serial canonical-day generation without a code change", () => {
    process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY = "1";
    expect(resolveDayConcurrency()).toBe(1);
  });

  it("falls back to the default for an invalid override (0, negative, non-numeric)", () => {
    for (const invalid of ["0", "-1", "not-a-number", ""]) {
      process.env.PROGRAM_GENERATOR_DAY_CONCURRENCY = invalid;
      expect(resolveDayConcurrency()).toBe(5);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// releaseQuotaOnTimeout — Phase D economic-semantics review finding.
// The "no refund if this invocation already made real progress" branch
// returns BEFORE ever touching the database (see its own source: the
// early-return guard short-circuits on hasMadeProgressThisInvocation
// regardless of errorCode/claimId), so it's directly testable here
// without a real DB connection — a deliberately narrow, honest test of
// exactly the new logic this Phase D pass added, not a re-test of the
// DB-backed release path itself (already covered by
// program-generation-quota.test.ts's real-DB release suite).
// ─────────────────────────────────────────────────────────────
describe("releaseQuotaOnTimeout — progress-aware refund rule", () => {
  it("never touches the database and returns false when this invocation already made progress, even for a real timeout with a real claimId", async () => {
    // fake-looking ids are safe here specifically BECAUSE this branch
    // never reaches a DB call — if it ever did, this test would fail
    // with a real connection error instead of silently passing, so a
    // regression that removed the early-return would be caught, not
    // masked.
    const released = await releaseQuotaOnTimeout("timeout", "fake-claim-id", "fake-draft-id", "fake-run-id", true);
    expect(released).toBe(false);
  });

  it("returns false immediately (no DB call) for a non-timeout errorCode, regardless of progress state", async () => {
    const released = await releaseQuotaOnTimeout("invalid_output", "fake-claim-id", "fake-draft-id", "fake-run-id", false);
    expect(released).toBe(false);
  });

  it("returns false immediately (no DB call) when there is no claimId at all, regardless of progress state", async () => {
    const released = await releaseQuotaOnTimeout("timeout", undefined, "fake-draft-id", "fake-run-id", false);
    expect(released).toBe(false);
  });
});
