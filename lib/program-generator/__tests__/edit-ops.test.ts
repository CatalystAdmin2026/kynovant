// ─────────────────────────────────────────────────────────────
// edit-ops.ts — first direct test coverage.
//
// Focus: the day.id review finding — findSection()/moveWorkoutDay()
// used to return the FIRST match for a given id, silently editing the
// wrong day/section if two ever shared an id (plausible under day-level
// generation before staged-generation.ts started assigning a real
// crypto.randomUUID() at first persistence — see that file's comment).
// These tests prove the fail-closed ambiguity guard added alongside
// that fix, plus basic happy-path coverage for every exported op,
// which had no tests at all before this.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  updatePrescription,
  replaceExercise,
  reorderExercises,
  moveWorkoutDay,
} from "../edit-ops";
import type {
  GeneratedProgramDraft,
  GeneratedDayDraft,
  GeneratedPrescriptionDraft,
} from "../contracts";

function prescription(overrides: Partial<GeneratedPrescriptionDraft> & { id: string }): GeneratedPrescriptionDraft {
  return {
    exerciseId: "ex-1",
    exerciseName: "Back Squat",
    orderIndex: 0,
    isRequired: true,
    ...overrides,
  };
}

function day(
  id: string,
  dayOfWeek: number,
  sectionId: string,
  prescriptions: GeneratedPrescriptionDraft[],
): GeneratedDayDraft {
  return {
    id,
    dayOfWeek,
    workout: {
      id: `workout-${id}`,
      name: "Day",
      sections: [{ id: sectionId, name: "Main", sectionType: "main_lift", orderIndex: 0, prescriptions }],
    },
  };
}

function draftWithDays(...days: GeneratedDayDraft[]): GeneratedProgramDraft {
  return {
    name: "Test Program",
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 1,
    recommendedDaysPerWeek: days.length,
    weeks: [{ id: "week-1", weekNumber: 1, days }],
  };
}

describe("updatePrescription", () => {
  it("[F] preserves day/section/prescription identity — only the patched fields change", () => {
    // "Regeneration/edit behavior preserves ID where intended": an
    // ordinary coach edit (as opposed to AI day-regeneration, a
    // separate, larger-scoped flow not touched by this fix — see the
    // review report) must never perturb any id, only the content the
    // coach actually asked to change.
    const draft = draftWithDays(day("day-1", 1, "section-1", [prescription({ id: "p-1" }), prescription({ id: "p-2" })]));
    const result = updatePrescription(draft, { dayId: "day-1", sectionId: "section-1", prescriptionId: "p-1", patch: { sets: 4 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const resultDay = result.draft.weeks[0].days[0];
    expect(resultDay.id).toBe("day-1");
    expect(resultDay.workout?.sections[0].id).toBe("section-1");
    expect(resultDay.workout?.sections[0].prescriptions.map((p) => p.id)).toEqual(["p-1", "p-2"]);
    expect(resultDay.workout?.sections[0].prescriptions[1].sets).toBeUndefined();
  });

  it("updates the matching prescription (happy path)", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", [prescription({ id: "p-1" })]));
    const result = updatePrescription(draft, { dayId: "day-1", sectionId: "section-1", prescriptionId: "p-1", patch: { sets: 4 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0].days[0].workout?.sections[0].prescriptions[0].sets).toBe(4);
  });

  it("fails closed (not the first match) when two days in the draft share the same id", () => {
    const draft = draftWithDays(
      day("dup-id", 1, "section-1", [prescription({ id: "p-1" })]),
      day("dup-id", 3, "section-1", [prescription({ id: "p-1", sets: 99 })]),
    );
    const result = updatePrescription(draft, { dayId: "dup-id", sectionId: "section-1", prescriptionId: "p-1", patch: { sets: 4 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/more than one day\/section/i);
  });

  it("returns not-found (not ambiguous) when no day matches", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", [prescription({ id: "p-1" })]));
    const result = updatePrescription(draft, { dayId: "missing", sectionId: "section-1", prescriptionId: "p-1", patch: { sets: 4 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Section not found in draft.");
  });
});

describe("replaceExercise", () => {
  it("replaces the matching prescription's exercise (happy path)", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", [prescription({ id: "p-1" })]));
    const result = replaceExercise(draft, { dayId: "day-1", sectionId: "section-1", prescriptionId: "p-1", exerciseId: "ex-2", exerciseName: "Front Squat" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0].days[0].workout?.sections[0].prescriptions[0].exerciseName).toBe("Front Squat");
  });

  it("fails closed when two days share the same id", () => {
    const draft = draftWithDays(
      day("dup-id", 1, "section-1", [prescription({ id: "p-1" })]),
      day("dup-id", 3, "section-1", [prescription({ id: "p-1" })]),
    );
    const result = replaceExercise(draft, { dayId: "dup-id", sectionId: "section-1", prescriptionId: "p-1", exerciseId: "ex-2", exerciseName: "Front Squat" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/more than one day\/section/i);
  });

  // [Draft Review exercise search/replacement UX] Regression for
  // required test #13 ("no generated prescription fields other than the
  // intended exercise replacement are inadvertently changed") — the
  // single-prescription replace path replaceExerciseAction now calls
  // after a coach picks a result from the new ExercisePicker. The bulk
  // equivalent (replaceExerciseByName) already has this exact assertion
  // in lib/db/__tests__/program-generator-review-triage.test.ts; this is
  // its single-prescription counterpart, which had no coverage before.
  it("touches only exerciseId/exerciseName/exerciseResolution — every other prescribed field and its placement survive untouched", () => {
    const draft = draftWithDays(
      day("day-1", 1, "section-1", [
        prescription({
          id: "p-1",
          orderIndex: 2,
          sets: 4,
          repsMin: 8,
          repsMax: 10,
          restSeconds: 90,
          tempo: "3010",
          isRequired: true,
          exerciseResolution: { outcome: "ambiguous", candidates: [] },
        }),
      ]),
    );
    const result = replaceExercise(draft, {
      dayId: "day-1",
      sectionId: "section-1",
      prescriptionId: "p-1",
      exerciseId: "ex-2",
      exerciseName: "Front Squat",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = result.draft.weeks[0].days[0].workout!.sections[0].prescriptions[0];
    expect(after.exerciseId).toBe("ex-2");
    expect(after.exerciseName).toBe("Front Squat");
    // Stale resolution record is deliberately cleared — the coach's
    // manual pick supersedes it.
    expect(after.exerciseResolution).toBeUndefined();
    // Everything else about the prescription is untouched.
    expect(after.orderIndex).toBe(2);
    expect(after.sets).toBe(4);
    expect(after.repsMin).toBe(8);
    expect(after.repsMax).toBe(10);
    expect(after.restSeconds).toBe(90);
    expect(after.tempo).toBe("3010");
    expect(after.isRequired).toBe(true);
  });
});

describe("reorderExercises", () => {
  it("reorders prescriptions to match the given id order (happy path)", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", [prescription({ id: "p-1" }), prescription({ id: "p-2" })]));
    const result = reorderExercises(draft, { dayId: "day-1", sectionId: "section-1", orderedPrescriptionIds: ["p-2", "p-1"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.weeks[0].days[0].workout?.sections[0].prescriptions.map((p) => p.id)).toEqual(["p-2", "p-1"]);
  });

  it("fails closed when two days share the same id", () => {
    const draft = draftWithDays(
      day("dup-id", 1, "section-1", [prescription({ id: "p-1" }), prescription({ id: "p-2" })]),
      day("dup-id", 3, "section-1", [prescription({ id: "p-1" }), prescription({ id: "p-2" })]),
    );
    const result = reorderExercises(draft, { dayId: "dup-id", sectionId: "section-1", orderedPrescriptionIds: ["p-2", "p-1"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/more than one day\/section/i);
  });
});

describe("moveWorkoutDay", () => {
  it("moves a day to a new dayOfWeek, swapping with any day already there (happy path)", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", []), day("day-2", 3, "section-2", []));
    const result = moveWorkoutDay(draft, { weekId: "week-1", dayId: "day-1", newDayOfWeek: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const days = result.draft.weeks[0].days;
    expect(days.find((d) => d.id === "day-1")?.dayOfWeek).toBe(3);
    expect(days.find((d) => d.id === "day-2")?.dayOfWeek).toBe(1);
  });

  it("fails closed when two days in the SAME week share the same id", () => {
    const draft = draftWithDays(day("dup-id", 1, "section-1", []), day("dup-id", 3, "section-2", []));
    const result = moveWorkoutDay(draft, { weekId: "week-1", dayId: "dup-id", newDayOfWeek: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/more than one day\/section/i);
  });

  it("returns not-found (not ambiguous) when no day matches", () => {
    const draft = draftWithDays(day("day-1", 1, "section-1", []));
    const result = moveWorkoutDay(draft, { weekId: "week-1", dayId: "missing", newDayOfWeek: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Day not found in draft.");
  });
});
