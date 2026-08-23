// ─────────────────────────────────────────────────────────────
// Regression suite — missing-day assembly escape (review finding on
// the day-level architecture v1). assembleWeekFromDays() previously
// threw before any surrounding try/catch could run; this proves the
// fixed version always returns a discriminated result instead, for
// both the missing-day case and the success case, without needing a
// database.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { assembleWeekFromDays } from "../staged-generation";
import type { ModelDayDraft, ProgramShellDay } from "../contracts";

function day(dayOfWeek: number, label: string): ModelDayDraft {
  return {
    id: `day-${dayOfWeek}`,
    dayOfWeek,
    label,
    workout: {
      id: `workout-${dayOfWeek}`,
      name: label,
      sections: [
        {
          id: `section-${dayOfWeek}`,
          name: "Main",
          sectionType: "main_lift",
          orderIndex: 0,
          prescriptions: [{ id: `p-${dayOfWeek}`, exerciseName: "Back Squat", orderIndex: 0, isRequired: true }],
        },
      ],
    },
  };
}

const SHELL_DAYS: ProgramShellDay[] = [
  { dayOfWeek: 1, label: "Day A" },
  { dayOfWeek: 3, label: "Day B" },
  { dayOfWeek: 5, label: "Day C" },
];

describe("assembleWeekFromDays — never throws, always a discriminated result", () => {
  it("succeeds when every shell day has a completed row", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(1, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days).toHaveLength(3);
    expect(result.week.weekNumber).toBe(1);
  });

  it("returns ok:false (never throws) when a day is missing — the exact review finding", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      // day 2 missing
      [3, day(5, "Day C")],
    ]);
    expect(() => assembleWeekFromDays(2, SHELL_DAYS, completed)).not.toThrow();
    const result = assembleWeekFromDays(2, SHELL_DAYS, completed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("week 2 day 2");
  });

  it("returns ok:false for an empty completed-days map (nothing generated yet)", () => {
    const result = assembleWeekFromDays(1, SHELL_DAYS, new Map());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("day 1");
  });
});
