// ─────────────────────────────────────────────────────────────
// [Monday-first scheduling remediation] Deterministic-guard coverage
// for provider.ts's normalizeAmbiguousShellSchedule() — the
// application-layer backstop half of the hybrid fix (prompt.ts's own
// instruction is the "hint" half, covered in prompt.test.ts).
//
// Root cause under test: a real production draft ("Maddie") was
// generated with dayOfWeek values [0,1,2,3,4] for a 5-day split — the
// model's naive 0-indexed default, which the app's persisted schema/UI
// (documented 0=Sunday convention) rendered as Sunday-first instead of
// the intended Monday-first. This function targets ONLY that exact,
// narrow ambiguous-default shape; every other schedule (explicit
// named days, weekends, a single day) must pass through byte-for-byte
// unchanged — explicit scheduling intent always wins.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeAmbiguousShellSchedule } from "../provider";
import type { ProgramShellDay } from "../contracts";

function day(dayOfWeek: number, label = `Day ${dayOfWeek}`): ProgramShellDay {
  return { dayOfWeek, label, focus: "Full Body" };
}

describe("normalizeAmbiguousShellSchedule — ambiguous-default detection and correction", () => {
  it("the exact reported bug: 5-day ambiguous [0,1,2,3,4] becomes Monday-first [1,2,3,4,5]", () => {
    const input = [0, 1, 2, 3, 4].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([2, 3, 4, 6])("ambiguous default for daysPerWeek=%i shifts {0..n-1} to {1..n}, staying within 0-6", (n) => {
    const input = Array.from({ length: n }, (_, i) => day(i));
    const result = normalizeAmbiguousShellSchedule(input);
    const values = result.map((d) => d.dayOfWeek);
    expect(values).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(new Set(values).size).toBe(n); // still unique
    expect(values.every((v) => v >= 0 && v <= 6)).toBe(true); // still in valid range
  });

  it("daysPerWeek=7 is a no-op — every day is used regardless of start day, nothing to normalize", () => {
    const input = [0, 1, 2, 3, 4, 5, 6].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
  });

  it("daysPerWeek=1 is deliberately excluded — a single day preserves whatever was chosen, including Sunday", () => {
    const input = [day(0, "Sunday Session")];
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
    expect(result[0].dayOfWeek).toBe(0);
  });

  it("explicit Tue/Thu/Sat intent [2,4,6] passes through completely unchanged", () => {
    const input = [2, 4, 6].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
    expect(result.map((d) => d.dayOfWeek)).toEqual([2, 4, 6]);
  });

  it("explicit weekends [0,6] (Sunday-containing, non-default) pass through unchanged — Sunday is preserved", () => {
    const input = [0, 6].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 6]);
  });

  it("an explicit Sunday-anchored non-consecutive split [0,2,4] passes through unchanged", () => {
    const input = [0, 2, 4].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
  });

  it("preserves array order, label, focus, and targetMuscleGroups — only dayOfWeek changes when normalized", () => {
    const input: ProgramShellDay[] = [
      { dayOfWeek: 0, label: "Upper Push", focus: "Chest/Shoulders/Triceps", targetMuscleGroups: ["chest"] },
      { dayOfWeek: 1, label: "Lower Body", focus: "Quads/Hamstrings" },
    ];
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result.map((d) => d.label)).toEqual(["Upper Push", "Lower Body"]);
    expect(result[0].focus).toBe("Chest/Shoulders/Triceps");
    expect(result[0].targetMuscleGroups).toEqual(["chest"]);
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2]);
  });

  it("a non-ambiguous set that happens to share SOME values with {0..n-1} but not all of them passes through unchanged", () => {
    // e.g. 3-day split the model chose as [0, 1, 5] — not the exact
    // ambiguous {0,1,2} shape, so presumed intentional.
    const input = [0, 1, 5].map((n) => day(n));
    const result = normalizeAmbiguousShellSchedule(input);
    expect(result).toEqual(input);
  });

  it("input array is not mutated in place", () => {
    const input = [0, 1, 2].map((n) => day(n));
    const snapshot = input.map((d) => ({ ...d }));
    normalizeAmbiguousShellSchedule(input);
    expect(input).toEqual(snapshot);
  });
});
