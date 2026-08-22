// ─────────────────────────────────────────────────────────────
// P0 regression suite — AI Program Generator week-timeout incident.
//
// Production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a ("Maddie"):
// every attempt failed at Week 1 with "Generation exceeded 45000ms
// and was aborted." Pure unit coverage for the per-call-type timeout
// resolution this fix replaced the single 45s constant with — see
// provider.ts's header comment and staged-generation.ts's
// GENERATION_TIME_BUDGET_MS comment for the full reasoning (raising
// the per-call number alone is not sufficient; that half is covered
// by the DB-backed suite in lib/db/__tests__/program-generator-
// integration.test.ts, which can exercise runStagedGeneration's
// sequential loop end to end).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import {
  resolveTimeoutMs,
  SHELL_DEFAULT_TIMEOUT_MS,
  WEEK_DEFAULT_TIMEOUT_MS,
  DAY_REGEN_DEFAULT_TIMEOUT_MS,
} from "../provider";

const ENV_KEY = "PROGRAM_GENERATOR_TIMEOUT_MS";

describe("resolveTimeoutMs — per-call-type defaults", () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("falls back to the given default when PROGRAM_GENERATOR_TIMEOUT_MS is unset", () => {
    delete process.env[ENV_KEY];
    expect(resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS)).toBe(WEEK_DEFAULT_TIMEOUT_MS);
    expect(resolveTimeoutMs(SHELL_DEFAULT_TIMEOUT_MS)).toBe(SHELL_DEFAULT_TIMEOUT_MS);
    expect(resolveTimeoutMs(DAY_REGEN_DEFAULT_TIMEOUT_MS)).toBe(DAY_REGEN_DEFAULT_TIMEOUT_MS);
  });

  it("shell/week/day-regen have distinct, independently-chosen defaults (not one blanket constant)", () => {
    expect(SHELL_DEFAULT_TIMEOUT_MS).toBeLessThan(WEEK_DEFAULT_TIMEOUT_MS);
    expect(WEEK_DEFAULT_TIMEOUT_MS).toBeLessThan(DAY_REGEN_DEFAULT_TIMEOUT_MS);
  });

  it("the week default clears the observed 45s production failure cutoff with real margin", () => {
    // The actual incident: real attempts failed at exactly 45000ms.
    // This is the specific call staged-generation.ts loops over per
    // week (the one responsible for Maddie's incident) — it must be
    // comfortably above the observed failure point.
    expect(WEEK_DEFAULT_TIMEOUT_MS).toBeGreaterThan(45_000);
  });

  it("PROGRAM_GENERATOR_TIMEOUT_MS, when set, overrides every call type uniformly (ops escape hatch)", () => {
    process.env[ENV_KEY] = "77000";
    expect(resolveTimeoutMs(SHELL_DEFAULT_TIMEOUT_MS)).toBe(77_000);
    expect(resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS)).toBe(77_000);
    expect(resolveTimeoutMs(DAY_REGEN_DEFAULT_TIMEOUT_MS)).toBe(77_000);
  });

  it("ignores a non-numeric or non-positive override and falls back to the default", () => {
    process.env[ENV_KEY] = "not-a-number";
    expect(resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS)).toBe(WEEK_DEFAULT_TIMEOUT_MS);

    process.env[ENV_KEY] = "0";
    expect(resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS)).toBe(WEEK_DEFAULT_TIMEOUT_MS);

    process.env[ENV_KEY] = "-5000";
    expect(resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS)).toBe(WEEK_DEFAULT_TIMEOUT_MS);
  });
});

describe("cumulative-duration budget vs. Vercel Hobby's fixed 300s function ceiling", () => {
  // This is the check the prior "just raise the per-call timeout"
  // fix missed. Documents the actual math driving
  // staged-generation.ts's GENERATION_TIME_BUDGET_MS default so a
  // future change to either number has to consciously re-derive it
  // rather than silently drift out of a safe relationship.
  it("a full-length (8-week) generation's worst-case per-call total does not by itself prove safety — the time-budget guard is load-bearing", () => {
    const shellAndWeekCalls = 1 + 8; // GenerateBriefForm.tsx's default weeks
    const worstCaseTotalMs = shellAndWeekCalls * WEEK_DEFAULT_TIMEOUT_MS; // upper bound using the larger of the two per-call defaults
    const HOBBY_HARD_CEILING_MS = 300_000;

    // Intentionally asserting the unsafe direction: proves a per-call
    // timeout bump alone is not sufficient, which is exactly why
    // staged-generation.ts's GENERATION_TIME_BUDGET_MS guard (tested
    // in the DB-backed integration suite) exists as a second,
    // independent safeguard rather than relying on this number
    // happening to fit.
    expect(worstCaseTotalMs).toBeGreaterThan(HOBBY_HARD_CEILING_MS);
  });
});
