// ─────────────────────────────────────────────────────────────
// [Expanded-week labeling remediation] Reproduces and fixes a real
// production defect surfaced by Maddie's fresh 8-week block/v2
// generation (canonical weeks 1, 4, 6):
//
//   A. Outer Draft Review heading showed "WEEK 2 — WEEK 1" — the
//      canonical week's OWN redundant default label ("Week 1", set by
//      assembleWeekFromDays) survived, unchanged, into every week
//      expandCanonicalWeek() derived from it, even though weekNumber
//      itself was correctly updated to 2.
//   B. A workout inside that same expanded week showed
//      "Glutes & Lower Body - Week 1" — the model occasionally embeds
//      a week-number reference into the workout's OWN name (nothing in
//      the app ever asked it to), which survives the same copy-through
//      for the same reason.
//
// Both are proven here via the REAL assembleWeekFromDays/
// alignDayToShellDay (staged-generation.ts) and the REAL, UNCHANGED
// expandCanonicalWeek (progression.ts) — not a reimplementation — so
// this is a true end-to-end reproduction of the reported symptom, not
// just a test of an isolated helper.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { assembleWeekFromDays, alignDayToShellDay, sanitizeGeneratedWorkoutName } from "../staged-generation";
import { expandCanonicalWeek } from "../progression";
import type { ModelDayDraft, ProgramShellDay } from "../contracts";

function shellDay(overrides: Partial<ProgramShellDay> = {}): ProgramShellDay {
  return { dayOfWeek: 1, label: "Lower Body", ...overrides };
}

function modelDay(workoutName: string, overrides: Partial<ModelDayDraft> = {}): ModelDayDraft {
  return {
    id: "day-raw",
    dayOfWeek: 1,
    workout: {
      id: "blueprint-raw",
      name: workoutName,
      sections: [
        {
          id: "section-1",
          name: "Main Lifts",
          sectionType: "main_lift",
          orderIndex: 0,
          prescriptions: [
            {
              id: "presc-1",
              exerciseId: randomUUID(),
              exerciseName: "Barbell Back Squat",
              orderIndex: 0,
              sets: 3,
              repsMin: 8,
              repsMax: 12,
              restSeconds: 120,
              isRequired: true,
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe("sanitizeGeneratedWorkoutName — narrow trailing week-reference stripping", () => {
  it.each([
    ["Glutes & Lower Body - Week 1", "Glutes & Lower Body"],
    ["Glutes & Lower Body – Week 1", "Glutes & Lower Body"], // en-dash
    ["Glutes & Lower Body — Week 1", "Glutes & Lower Body"], // em-dash
    ["Glutes & Lower Body: Week 1", "Glutes & Lower Body"],
    ["Glutes & Lower Body (Week 1)", "Glutes & Lower Body"],
    ["Upper Push - Week 12", "Upper Push"], // multi-digit week number
    ["Upper Push - WEEK 4", "Upper Push"], // case-insensitive
  ])("strips the trailing week reference from %j -> %j", (input, expected) => {
    expect(sanitizeGeneratedWorkoutName(input)).toBe(expected);
  });

  it.each([
    ["Lower Body Strength"],
    ["Glutes & Lower Body"],
    ["Deload"],
    ["Upper Push (Superset Focus)"], // parenthetical WITHOUT a week number must survive
  ])("leaves a legitimately-named workout %j completely unchanged", (name) => {
    expect(sanitizeGeneratedWorkoutName(name)).toBe(name);
  });

  it("falls back to the original name if stripping would leave nothing", () => {
    expect(sanitizeGeneratedWorkoutName("Week 1")).toBe("Week 1");
    expect(sanitizeGeneratedWorkoutName("(Week 1)")).toBe("(Week 1)");
  });
});

describe("alignDayToShellDay — applies the sanitizer to workout.name, touches nothing else", () => {
  it("strips a stale week suffix from the workout name", () => {
    const result = alignDayToShellDay(modelDay("Glutes & Lower Body - Week 1"), shellDay());
    expect(result.workout?.name).toBe("Glutes & Lower Body");
  });

  it("preserves a legitimate workout name untouched", () => {
    const result = alignDayToShellDay(modelDay("Lower Body Strength"), shellDay());
    expect(result.workout?.name).toBe("Lower Body Strength");
  });

  it("does not mutate/corrupt exercise prescriptions", () => {
    const input = modelDay("Glutes & Lower Body - Week 1");
    const result = alignDayToShellDay(input, shellDay());
    expect(result.workout?.sections).toEqual(input.workout?.sections);
  });

  it("handles a rest day (workout: null) without error", () => {
    const result = alignDayToShellDay(modelDay("irrelevant", { workout: null }), shellDay());
    expect(result.workout).toBeNull();
  });

  it("still aligns dayOfWeek/label to the shell day exactly as before (regression guard)", () => {
    const result = alignDayToShellDay(modelDay("X"), shellDay({ dayOfWeek: 3, label: "Upper Push" }));
    expect(result.dayOfWeek).toBe(3);
    expect(result.label).toBe("Upper Push");
  });
});

describe("assembleWeekFromDays — no redundant default label", () => {
  it("does not set label at all — 'Week N' would be pure redundancy the outer UI already renders from weekNumber", () => {
    const completedDays = new Map([[1, modelDay("Lower Body")]]);
    const result = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.label).toBeUndefined();
  });

  it("also sanitizes each day's workout name during assembly (canonical week itself never shows the stale suffix either)", () => {
    const completedDays = new Map([[1, modelDay("Glutes & Lower Body - Week 1")]]);
    const result = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.week.days[0].workout?.name).toBe("Glutes & Lower Body");
  });
});

describe("End-to-end reproduction: canonical week 1 -> expanded week 2 (the exact reported production symptom)", () => {
  it("A: the expanded week's weekNumber is correctly 2, and it carries NO stale label — 'WEEK 2 — WEEK 1' can no longer occur", () => {
    const completedDays = new Map([[1, modelDay("Glutes & Lower Body - Week 1")]]);
    const canonical = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const expansion = expandCanonicalWeek({
      canonicalWeek: canonical.week,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;

    expect(expansion.week.weekNumber).toBe(2); // actual week identity is correct
    expect(expansion.week.label).toBeUndefined(); // no stale "Week 1" to display
  });

  it("B: the expanded week's workout name has no stale week suffix — content is correct for week 2, not mislabeled as week 1", () => {
    const completedDays = new Map([[1, modelDay("Glutes & Lower Body - Week 1")]]);
    const canonical = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const expansion = expandCanonicalWeek({
      canonicalWeek: canonical.week,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;

    expect(expansion.week.days[0].workout?.name).toBe("Glutes & Lower Body");
  });

  it("C: the same protection holds expanding a canonical WEEK 4 into a later actual week (matches the real controlled-test canonical weeks 1/4/6)", () => {
    const completedDays = new Map([[1, modelDay("Upper Push - Week 4")]]);
    const canonical = assembleWeekFromDays(4, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const expansion = expandCanonicalWeek({
      canonicalWeek: canonical.week,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2, // block-relative index -> actual week 5
      blockLength: 2,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;

    expect(expansion.week.weekNumber).toBe(5);
    expect(expansion.week.label).toBeUndefined();
    expect(expansion.week.days[0].workout?.name).toBe("Upper Push");
  });

  it("D: a legitimate custom week title (not the redundant default) survives expansion untouched", () => {
    const completedDays = new Map([[1, modelDay("Lower Body Strength")]]);
    const canonical = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    const withCustomTitle = { ...canonical.week, label: "Accumulation" };

    const expansion = expandCanonicalWeek({
      canonicalWeek: withCustomTitle,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;
    expect(expansion.week.label).toBe("Accumulation"); // meaningful titles are NOT stripped
  });

  it("E: a legitimate workout/day title survives assembly + expansion untouched", () => {
    const completedDays = new Map([[1, modelDay("Deload")]]);
    const canonical = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const expansion = expandCanonicalWeek({
      canonicalWeek: canonical.week,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;
    expect(expansion.week.days[0].workout?.name).toBe("Deload");
  });

  it("F: canonical/source week identity remains available internally — weekNumber on the ORIGINAL canonical object is untouched by this fix", () => {
    const completedDays = new Map([[1, modelDay("X")]]);
    const canonical = assembleWeekFromDays(4, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    expect(canonical.week.weekNumber).toBe(4); // the canonical week's own identity is never altered
  });

  it("G: no mutation/corruption of exercise prescriptions through assembly + expansion", () => {
    const completedDays = new Map([[1, modelDay("Glutes & Lower Body - Week 1")]]);
    const canonical = assembleWeekFromDays(1, [shellDay()], completedDays);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;

    const expansion = expandCanonicalWeek({
      canonicalWeek: canonical.week,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;

    const originalPrescription = canonical.week.days[0].workout?.sections[0].prescriptions[0];
    const expandedPrescription = expansion.week.days[0].workout?.sections[0].prescriptions[0];
    expect(expandedPrescription?.exerciseId).toBe(originalPrescription?.exerciseId);
    expect(expandedPrescription?.exerciseName).toBe(originalPrescription?.exerciseName);
    expect(expandedPrescription?.sets).toBe(originalPrescription?.sets);
  });
});

describe("Backward compatibility: an already-persisted (pre-fix) stale canonical week is never silently rewritten", () => {
  it("a canonical week carrying the OLD buggy label/name (as pre-fix code would have persisted) still propagates unchanged through the UNMODIFIED expandCanonicalWeek — this fix does not retroactively touch existing content", () => {
    // Simulates exactly what a draft generated BEFORE this remediation
    // has sitting in the database: assembleWeekFromDays/alignDayToShellDay
    // are NOT involved here — this is deliberately constructed to look
    // like already-persisted, unfixed content read back on a resume.
    const staleCanonical = {
      id: "week-1-old",
      weekNumber: 1,
      label: "Week 1", // the old, now-removed default
      days: [
        {
          id: "day-1-old",
          dayOfWeek: 1,
          workout: {
            id: "bp-old",
            name: "Glutes & Lower Body - Week 1", // never sanitized, because it predates this fix
            sections: [
              {
                id: "s1",
                name: "Main",
                sectionType: "main_lift" as const,
                orderIndex: 0,
                prescriptions: [
                  { id: "p1", exerciseId: "ex-1", exerciseName: "Barbell Back Squat", orderIndex: 0, sets: 3, repsMin: 8, repsMax: 12, restSeconds: 120, isRequired: true },
                ],
              },
            ],
          },
        },
      ],
    };

    const expansion = expandCanonicalWeek({
      canonicalWeek: staleCanonical,
      progressionStrategy: "double",
      phaseType: "accumulation",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 4,
    });
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) return;

    // Documents, deliberately, that this fix is forward-only: it never
    // rewrites already-persisted canonical week content. A resume that
    // expands an OLD stale canonical week will still show the old
    // symptom until that specific canonical week is itself regenerated
    // from scratch under the fixed code.
    expect(expansion.week.weekNumber).toBe(2);
    expect(expansion.week.label).toBe("Week 1");
    expect(expansion.week.days[0].workout?.name).toBe("Glutes & Lower Body - Week 1");
  });
});
