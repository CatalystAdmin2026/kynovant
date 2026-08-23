// ─────────────────────────────────────────────────────────────
// summarizeWeekSoFarForPrompt — pure unit suite, no DB.
//
// P1 review finding: each day previously saw only cross-WEEK
// continuity (the same day-slot in a prior week), never what OTHER
// days already generated earlier in the SAME week. This proves the
// compact, bounded summary is null when nothing's completed yet,
// includes exercise identity per completed day, and includes an
// aggregate muscle-volume tally without dumping full JSON.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { summarizeWeekSoFarForPrompt } from "../prompt";
import type { ExerciseCandidate } from "../exercise-candidates";
import type { ModelDayDraft } from "../contracts";

function candidate(overrides: Partial<ExerciseCandidate> & { id: string }): ExerciseCandidate {
  return {
    name: `Exercise ${overrides.id}`,
    alternateNames: [],
    primaryMuscleGroup: null,
    secondaryMuscleGroups: [],
    movementPattern: "push_horizontal",
    classification: "compound",
    resistanceType: "barbell",
    difficulty: "intermediate",
    isCardio: false,
    isMobility: false,
    highJointStress: [],
    defaultPrescription: null,
    ...overrides,
  };
}

function dayWith(dayOfWeek: number, label: string, exerciseId: string, exerciseName: string, sets: number): ModelDayDraft {
  return {
    id: `day-${dayOfWeek}`,
    dayOfWeek,
    label,
    workout: {
      id: `w-${dayOfWeek}`,
      name: label,
      sections: [
        {
          id: `s-${dayOfWeek}`,
          name: "Main",
          sectionType: "main_lift",
          orderIndex: 0,
          prescriptions: [{ id: `p-${dayOfWeek}`, exerciseId, exerciseName, orderIndex: 0, isRequired: true, sets }],
        },
      ],
    },
  };
}

describe("summarizeWeekSoFarForPrompt", () => {
  it("returns null when no days are completed yet this week", () => {
    expect(summarizeWeekSoFarForPrompt(new Map(), new Map())).toBeNull();
  });

  it("includes exercise identity (name + id) for each completed day", () => {
    const bench = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest" });
    const days = new Map([[1, dayWith(1, "Push", bench.id, bench.name, 4)]]);
    const summary = summarizeWeekSoFarForPrompt(days, new Map([[bench.id, bench]]));
    expect(summary).toContain("Bench Press");
    expect(summary).toContain(bench.id);
  });

  it("includes an aggregate muscle-volume tally, not raw per-prescription detail", () => {
    const bench = candidate({ id: "bench-1", name: "Bench Press", primaryMuscleGroup: "chest" });
    const row = candidate({ id: "row-1", name: "Barbell Row", primaryMuscleGroup: "upper_back" });
    const days = new Map([
      [1, dayWith(1, "Push", bench.id, bench.name, 4)],
      [2, dayWith(3, "Pull", row.id, row.name, 3)],
    ]);
    const candidatesById = new Map([
      [bench.id, bench],
      [row.id, row],
    ]);
    const summary = summarizeWeekSoFarForPrompt(days, candidatesById);
    expect(summary).toContain("chest ~4 sets");
    expect(summary).toContain("upper back ~3 sets");
  });

  it("orders days by day index, not insertion order", () => {
    const a = candidate({ id: "a", name: "Exercise A" });
    const b = candidate({ id: "b", name: "Exercise B" });
    // Inserted out of order (day 2 first) — output must still be day 1 then day 2.
    const days = new Map([
      [2, dayWith(3, "Day 2", b.id, b.name, 3)],
      [1, dayWith(1, "Day 1", a.id, a.name, 3)],
    ]);
    const summary = summarizeWeekSoFarForPrompt(days, new Map([[a.id, a], [b.id, b]]))!;
    expect(summary.indexOf("Exercise A")).toBeLessThan(summary.indexOf("Exercise B"));
  });

  it("stays compact — bounded length even with several completed days, never a full JSON dump", () => {
    const candidatesById = new Map<string, ExerciseCandidate>();
    const days = new Map<number, ModelDayDraft>();
    for (let i = 1; i <= 6; i++) {
      const c = candidate({ id: `ex-${i}`, name: `Exercise ${i}`, primaryMuscleGroup: "chest" });
      candidatesById.set(c.id, c);
      days.set(i, dayWith(i, `Day ${i}`, c.id, c.name, 3));
    }
    const summary = summarizeWeekSoFarForPrompt(days, candidatesById)!;
    // One line per day plus one tally line — not a multi-KB JSON blob.
    expect(summary.split("\n")).toHaveLength(7);
    expect(summary.length).toBeLessThan(2000);
  });
});
