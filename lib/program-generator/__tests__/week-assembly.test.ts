// ─────────────────────────────────────────────────────────────
// Regression suite — missing-day assembly escape (review finding on
// the day-level architecture v1). assembleWeekFromDays() previously
// threw before any surrounding try/catch could run; this proves the
// fixed version always returns a discriminated result instead, for
// both the missing-day case and the success case, without needing a
// database.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { alignDayToShellDay, assembleWeekFromDays } from "../staged-generation";
import type { ModelDayDraft, ProgramShellDay } from "../contracts";

function day(dayOfWeek: number, label: string, id?: string): ModelDayDraft {
  return {
    id: id ?? `day-${dayOfWeek}`,
    dayOfWeek,
    label,
    notes: `notes for ${label}`,
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

  it("reasserts shell day metadata when a model-returned day drifts", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      // Staging regression: the provider returned useful day-3 content
      // but echoed dayOfWeek 3 from the previous slot, which used to
      // fail week assembly with duplicate dayOfWeek values.
      [3, day(3, "Wrong Echoed Label")],
    ]);

    const result = assembleWeekFromDays(4, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
    expect(result.week.days.map((d) => d.label)).toEqual(["Day A", "Day B", "Day C"]);
  });

  it("alignDayToShellDay leaves workout content intact while replacing structural day metadata", () => {
    const drifted = day(4, "Wrong");
    const aligned = alignDayToShellDay(drifted, { dayOfWeek: 6, label: "Correct" });
    expect(aligned.dayOfWeek).toBe(6);
    expect(aligned.label).toBe("Correct");
    expect(aligned.workout).toBe(drifted.workout);
  });

  it("alignDayToShellDay does not touch id or notes — only dayOfWeek/label are shell-owned", () => {
    const drifted = day(4, "Wrong", "model-generated-day-id");
    const aligned = alignDayToShellDay(drifted, { dayOfWeek: 6, label: "Correct" });
    expect(aligned.id).toBe("model-generated-day-id");
    expect(aligned.notes).toBe(drifted.notes);
  });

  it("is a no-op on already-correct model metadata — the happy path changes nothing unexpected", () => {
    // Every field the model returned already matches the shell exactly
    // (the common case). Assembly must not perturb id, notes, or any
    // prescription content just by passing through alignDayToShellDay.
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      [2, day(3, "Day B")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(1, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.id)).toEqual(["day-1", "day-3", "day-5"]);
    expect(result.week.days.map((d) => d.notes)).toEqual(["notes for Day A", "notes for Day B", "notes for Day C"]);
    // Not a reference check: ModelWeekDraftSchema.safeParse() rebuilds the
    // object graph during validation (Zod's normal behavior), so content
    // equality — not Object.is identity — is the right bar for anything
    // read back through assembleWeekFromDays's schema-validated result.
    // alignDayToShellDay's OWN reference-preservation is covered directly
    // by the dedicated test above, one level below this schema reparse.
    expect(result.week.days[0].workout).toEqual(completed.get(1)!.workout);
    expect(result.week.days[0].workout?.sections[0].prescriptions).toEqual(
      completed.get(1)!.workout!.sections[0].prescriptions,
    );
  });

  it("corrects only the label when dayOfWeek is already correct but the label drifted", () => {
    const completed = new Map<number, ModelDayDraft>([
      [1, day(1, "Day A")],
      // dayOfWeek is right (3, matching SHELL_DAYS[1]); only the label drifted.
      [2, day(3, "Totally Different Label")],
      [3, day(5, "Day C")],
    ]);
    const result = assembleWeekFromDays(2, SHELL_DAYS, completed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
    expect(result.week.days[1].label).toBe("Day B");
  });
});
