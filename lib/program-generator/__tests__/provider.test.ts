// ─────────────────────────────────────────────────────────────
// [Monday-first scheduling remediation] Deterministic-guard coverage
// for provider.ts's hasExplicitWeekdayIntent() and
// normalizeAmbiguousShellSchedule() — the application-layer backstop
// half of the hybrid fix (prompt.ts's own instruction is the "hint"
// half, covered in prompt.test.ts).
//
// Root cause under test: a real production draft ("Maddie") was
// generated with dayOfWeek values [0,1,2,3,4] for a 5-day split — the
// model's naive 0-indexed default, which the app's persisted schema/UI
// (documented 0=Sunday convention) rendered as Sunday-first instead of
// the intended Monday-first.
//
// [Independent review remediation, candidate 637b665] Codex found two
// real defects in the first pass, both covered explicitly below:
//   P1 — explicit free-text scheduling ("Train Sunday through
//        Thursday") could legitimately produce [0,1,2,3,4], but the
//        original normalizer had no access to freeformInstructions at
//        all and silently overrode it to [1,2,3,4,5].
//   P2 — the original check used SET equality, so a permutation like
//        [2,0,1] (not the naive ascending sequence) also qualified as
//        "the ambiguous default."
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeAmbiguousShellSchedule, hasExplicitWeekdayIntent } from "../provider";
import type { ProgramShellDay } from "../contracts";

function day(dayOfWeek: number, label = `Day ${dayOfWeek}`): ProgramShellDay {
  return { dayOfWeek, label, focus: "Full Body" };
}

function days(dows: number[]): ProgramShellDay[] {
  return dows.map((n) => day(n));
}

describe("hasExplicitWeekdayIntent — narrow weekday-token detector", () => {
  it.each([
    ["Train Sunday through Thursday"],
    ["Sunday, Monday, Wednesday, Friday"],
    ["Tue Thu Sat"],
    ["Tuesdays and Saturdays"],
    ["Weekends only"],
    ["Saturday/Sunday"],
    ["Monday through Friday"],
    ["Mon-Fri"],
  ])("recognizes explicit intent in %j", (text) => {
    expect(hasExplicitWeekdayIntent(text)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasExplicitWeekdayIntent("TRAIN SUN WED FRI")).toBe(true);
    expect(hasExplicitWeekdayIntent("train sun wed fri")).toBe(true);
  });

  it.each([
    ["Focus on glute development and recovery"],
    ["Prefer three training sessions with adequate rest"],
    ["Keep workouts under 60 minutes"],
    ["train early in the week"],
    ["weekdays preferred"],
  ])("does NOT flag ordinary coaching notes with no named weekday: %j", (text) => {
    expect(hasExplicitWeekdayIntent(text)).toBe(false);
  });

  it("returns false for null/undefined/empty input", () => {
    expect(hasExplicitWeekdayIntent(null)).toBe(false);
    expect(hasExplicitWeekdayIntent(undefined)).toBe(false);
    expect(hasExplicitWeekdayIntent("")).toBe(false);
  });
});

describe("normalizeAmbiguousShellSchedule — P1: explicit weekday intent suppresses normalization", () => {
  it("A: 'Train Sunday through Thursday' + [0,1,2,3,4] stays [0,1,2,3,4]", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 2, 3, 4]), "Train Sunday through Thursday");
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4]);
  });

  it("B: 'Tue Thu Sat' + [2,4,6] stays [2,4,6]", () => {
    const result = normalizeAmbiguousShellSchedule(days([2, 4, 6]), "Tue Thu Sat");
    expect(result.map((d) => d.dayOfWeek)).toEqual([2, 4, 6]);
  });

  it("C: 'Monday through Friday' + [1,2,3,4,5] stays [1,2,3,4,5]", () => {
    const result = normalizeAmbiguousShellSchedule(days([1, 2, 3, 4, 5]), "Monday through Friday");
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
  });

  it("D: 'Weekends: Saturday and Sunday' + [6,0] stays [6,0]", () => {
    const result = normalizeAmbiguousShellSchedule(days([6, 0]), "Weekends: Saturday and Sunday");
    expect(result.map((d) => d.dayOfWeek)).toEqual([6, 0]);
  });

  it("E: 'Sunday, Tuesday, Thursday' + [0,2,4] stays [0,2,4]", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 2, 4]), "Sunday, Tuesday, Thursday");
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 2, 4]);
  });

  it("F: case-insensitive 'TRAIN SUN WED FRI' + [0,3,5] stays [0,3,5]", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 3, 5]), "TRAIN SUN WED FRI");
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 3, 5]);
  });

  it("explicit intent suppresses normalization even when the resulting days ALSO happen to be the ambiguous ascending shape", () => {
    // The exact scenario the P1 finding warned about: explicit text
    // requesting Sun-Thu produces the same [0,1,2,3,4] shape the
    // ambiguous default would — intent must win regardless.
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 2, 3, 4]), "I want Sunday through Thursday specifically, not Monday start");
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("normalizeAmbiguousShellSchedule — no false positives from vague/ordinary notes", () => {
  it.each([
    ["Focus on glute development and recovery"],
    ["Prefer three training sessions with adequate rest"],
    ["Keep workouts under 60 minutes"],
  ])("ordinary note %j does not suppress the default normalizer", (text) => {
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 2]), text);
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2, 3]);
  });

  it("undefined/null/empty freeformInstructions still normalizes the ambiguous default", () => {
    expect(normalizeAmbiguousShellSchedule(days([0, 1, 2]), undefined).map((d) => d.dayOfWeek)).toEqual([1, 2, 3]);
    expect(normalizeAmbiguousShellSchedule(days([0, 1, 2]), null).map((d) => d.dayOfWeek)).toEqual([1, 2, 3]);
    expect(normalizeAmbiguousShellSchedule(days([0, 1, 2]), "").map((d) => d.dayOfWeek)).toEqual([1, 2, 3]);
  });
});

describe("normalizeAmbiguousShellSchedule — P2: exact ascending order required, not set membership", () => {
  it("[0,1,2] (exact ascending) normalizes to [1,2,3]", () => {
    expect(normalizeAmbiguousShellSchedule(days([0, 1, 2])).map((d) => d.dayOfWeek)).toEqual([1, 2, 3]);
  });

  it.each([
    [[2, 0, 1]],
    [[1, 0, 2]],
    [[0, 2, 1]],
  ])("permutation %j is NOT the naive ascending sequence — left unchanged", (perm) => {
    const result = normalizeAmbiguousShellSchedule(days(perm));
    expect(result.map((d) => d.dayOfWeek)).toEqual(perm);
  });

  it("the exact reported bug: 5-day ambiguous [0,1,2,3,4] becomes Monday-first [1,2,3,4,5]", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 2, 3, 4]));
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
  });

  it("a set that shares every VALUE with {0,1,2} but in a different order does not normalize (set-equality would have wrongly allowed this)", () => {
    const result = normalizeAmbiguousShellSchedule(days([1, 2, 0]));
    expect(result.map((d) => d.dayOfWeek)).toEqual([1, 2, 0]);
  });

  it("a non-ambiguous set that shares SOME but not all values with {0..n-1} passes through unchanged", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 5]));
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 1, 5]);
  });
});

describe("normalizeAmbiguousShellSchedule — 1 through 7 days", () => {
  it("1 day: unchanged (deliberately excluded, including bare Sunday)", () => {
    const result = normalizeAmbiguousShellSchedule(days([0]));
    expect(result.map((d) => d.dayOfWeek)).toEqual([0]);
  });

  it.each([
    [2, [0, 1], [1, 2]],
    [3, [0, 1, 2], [1, 2, 3]],
    [4, [0, 1, 2, 3], [1, 2, 3, 4]],
    [5, [0, 1, 2, 3, 4], [1, 2, 3, 4, 5]],
    [6, [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]],
  ])("%i days: exact ascending default %j normalizes to %j", (_n, input, expected) => {
    const result = normalizeAmbiguousShellSchedule(days(input));
    const values = result.map((d) => d.dayOfWeek);
    expect(values).toEqual(expected);
    expect(new Set(values).size).toBe(values.length); // unique
    expect(values.every((v) => v >= 0 && v <= 6)).toBe(true); // valid range
  });

  it("7 days: full week [0..6] is unchanged — no distinct Monday-first variant exists", () => {
    const result = normalizeAmbiguousShellSchedule(days([0, 1, 2, 3, 4, 5, 6]));
    expect(result.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("normalizeAmbiguousShellSchedule — downstream metadata preservation", () => {
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

  it("does not mutate the input array in place", () => {
    const input = days([0, 1, 2]);
    const snapshot = input.map((d) => ({ ...d }));
    normalizeAmbiguousShellSchedule(input);
    expect(input).toEqual(snapshot);
  });
});
