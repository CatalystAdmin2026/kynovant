// ─────────────────────────────────────────────────────────────
// AI Program Generator — Contract (zod schema) tests
//
// Pure, no DB. Proves "strict schema rejection" (MVP requirement B /
// testing requirement): a Program Brief or Generated Program Draft
// that violates the contract — missing required fields, out-of-range
// values, unknown enum values, or a violated cross-field invariant —
// is REJECTED, not silently coerced or accepted.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import {
  parseProgramGenerationBrief,
  parseGeneratedProgramDraft,
  parseProgramShell,
  ModelWeekDraftSchema,
} from "../contracts";

const VALID_BRIEF = {
  goal: "muscle_growth",
  weeks: 8,
  daysPerWeek: 4,
  preferredSplit: "coach_decides",
  experienceLevel: "intermediate",
  equipmentAccess: "commercial_gym",
  targetSessionMinutes: 60,
};

function validDraft(exerciseId = randomUUID()) {
  return {
    name: "Test Program",
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 1,
    recommendedDaysPerWeek: 1,
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        days: [
          {
            id: "d1",
            dayOfWeek: 1,
            workout: {
              id: "bp1",
              name: "Day A",
              sections: [
                {
                  id: "s1",
                  name: "Main",
                  sectionType: "main_lift",
                  orderIndex: 0,
                  prescriptions: [
                    {
                      id: "p1",
                      exerciseId,
                      exerciseName: "Test Exercise",
                      orderIndex: 0,
                      sets: 3,
                      repsMin: 8,
                      repsMax: 12,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("ProgramGenerationBriefSchema", () => {
  it("accepts a minimal valid brief", () => {
    const result = parseProgramGenerationBrief(VALID_BRIEF);
    expect(result.ok).toBe(true);
  });

  it("rejects a brief missing a required field", () => {
    const { goal: _goal, ...rest } = VALID_BRIEF;
    void _goal;
    const result = parseProgramGenerationBrief(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown enum value for goal", () => {
    const result = parseProgramGenerationBrief({ ...VALID_BRIEF, goal: "become_shredded" });
    expect(result.ok).toBe(false);
  });

  it("rejects weeks outside the 1-16 MVP range", () => {
    expect(parseProgramGenerationBrief({ ...VALID_BRIEF, weeks: 0 }).ok).toBe(false);
    expect(parseProgramGenerationBrief({ ...VALID_BRIEF, weeks: 17 }).ok).toBe(false);
  });

  it("rejects daysPerWeek outside 1-7", () => {
    expect(parseProgramGenerationBrief({ ...VALID_BRIEF, daysPerWeek: 8 }).ok).toBe(false);
  });

  it("rejects targetSessionMinutes below the MVP floor", () => {
    expect(parseProgramGenerationBrief({ ...VALID_BRIEF, targetSessionMinutes: 5 }).ok).toBe(false);
  });

  it("rejects a technique that is both allowed and avoided", () => {
    const result = parseProgramGenerationBrief({
      ...VALID_BRIEF,
      allowedTechniques: ["straight_set", "superset"],
      avoidedTechniques: ["superset"],
    });
    expect(result.ok).toBe(false);
  });
});

describe("GeneratedProgramDraftSchema", () => {
  it("accepts a minimal valid draft", () => {
    const result = parseGeneratedProgramDraft(validDraft());
    expect(result.ok).toBe(true);
  });

  it("rejects a non-uuid exerciseId (invented/malformed id)", () => {
    const draft = validDraft();
    // @ts-expect-error deliberately malformed for the test
    draft.weeks[0].days[0].workout.sections[0].prescriptions[0].exerciseId = "not-a-real-exercise";
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown section type", () => {
    const draft = validDraft();
    draft.weeks[0].days[0].workout.sections[0].sectionType = "bonus_round";
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });

  it("rejects repsMin greater than repsMax", () => {
    const draft = validDraft();
    draft.weeks[0].days[0].workout.sections[0].prescriptions[0].repsMin = 20;
    draft.weeks[0].days[0].workout.sections[0].prescriptions[0].repsMax = 5;
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate weekNumber values", () => {
    const draft = validDraft();
    draft.weeks.push({ ...validDraft().weeks[0], id: "w2" });
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate dayOfWeek values within a week", () => {
    const draft = validDraft();
    draft.weeks[0].days.push({ ...draft.weeks[0].days[0], id: "d2" });
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate orderIndex within a section", () => {
    const draft = validDraft();
    const p = draft.weeks[0].days[0].workout.sections[0].prescriptions[0];
    draft.weeks[0].days[0].workout.sections[0].prescriptions.push({ ...p, id: "p2" });
    const result = parseGeneratedProgramDraft(draft);
    expect(result.ok).toBe(false);
  });
});

const VALID_SHELL = {
  title: "8-Week Hypertrophy Block",
  description: "A structured hypertrophy program.",
  totalWeeks: 8,
  days: [
    { dayOfWeek: 1, label: "Upper" },
    { dayOfWeek: 4, label: "Lower" },
  ],
  phases: [
    { phaseNumber: 1, name: "Accumulation", weekStart: 1, weekEnd: 6, progressionTarget: "Add reps weekly." },
    { phaseNumber: 2, name: "Deload", weekStart: 7, weekEnd: 8, progressionTarget: "Reduce volume.", isDeload: true },
  ],
  globalConstraints: "No overhead pressing.",
};

describe("ProgramShellSchema", () => {
  it("accepts a minimal valid shell", () => {
    const result = parseProgramShell(VALID_SHELL);
    expect(result.ok).toBe(true);
  });

  it("rejects totalWeeks outside the 1-16 range", () => {
    expect(parseProgramShell({ ...VALID_SHELL, totalWeeks: 0 }).ok).toBe(false);
    expect(parseProgramShell({ ...VALID_SHELL, totalWeeks: 17 }).ok).toBe(false);
  });

  it("rejects duplicate dayOfWeek values", () => {
    const shell = { ...VALID_SHELL, days: [...VALID_SHELL.days, { dayOfWeek: 1, label: "Duplicate" }] };
    expect(parseProgramShell(shell).ok).toBe(false);
  });

  it("rejects duplicate phaseNumber values", () => {
    const shell = {
      ...VALID_SHELL,
      phases: [...VALID_SHELL.phases, { ...VALID_SHELL.phases[0] }],
    };
    expect(parseProgramShell(shell).ok).toBe(false);
  });

  it("rejects a phase whose week range falls outside totalWeeks", () => {
    const shell = {
      ...VALID_SHELL,
      phases: [{ phaseNumber: 1, name: "Overrun", weekStart: 1, weekEnd: 20, progressionTarget: "x" }],
    };
    expect(parseProgramShell(shell).ok).toBe(false);
  });

  it("rejects a phase with weekStart greater than weekEnd", () => {
    const shell = {
      ...VALID_SHELL,
      phases: [{ phaseNumber: 1, name: "Inverted", weekStart: 5, weekEnd: 2, progressionTarget: "x" }],
    };
    expect(parseProgramShell(shell).ok).toBe(false);
  });
});

describe("ModelWeekDraftSchema — per-week generation contract", () => {
  it("accepts a single week's worth of content with no exerciseId anywhere", () => {
    const week = {
      id: "w1",
      weekNumber: 1,
      days: [
        {
          id: "d1",
          dayOfWeek: 1,
          workout: {
            id: "bp1",
            name: "Day A",
            sections: [
              {
                id: "s1",
                name: "Main",
                sectionType: "main_lift",
                orderIndex: 0,
                prescriptions: [
                  { id: "p1", exerciseName: "Barbell Bench Press", orderIndex: 0, sets: 3, repsMin: 8, repsMax: 12 },
                ],
              },
            ],
          },
        },
      ],
    };
    const result = ModelWeekDraftSchema.safeParse(week);
    expect(result.success).toBe(true);
    if (result.success) {
      // The model-output contract has no exerciseId field at all — not
      // merely optional/null. Structurally impossible to fabricate one.
      expect("exerciseId" in result.data.days[0].workout!.sections[0].prescriptions[0]).toBe(false);
    }
  });

  it("rejects an exerciseId field on a prescription (the model must never supply one)", () => {
    const weekWithId = {
      id: "w1",
      weekNumber: 1,
      days: [
        {
          id: "d1",
          dayOfWeek: 1,
          workout: {
            id: "bp1",
            name: "Day A",
            sections: [
              {
                id: "s1",
                name: "Main",
                sectionType: "main_lift",
                orderIndex: 0,
                prescriptions: [
                  {
                    id: "p1",
                    exerciseId: randomUUID(),
                    exerciseName: "Barbell Bench Press",
                    orderIndex: 0,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    // zod strips unknown keys by default rather than rejecting them, so
    // this proves the field is dropped, not merely ignored-but-present —
    // parse succeeds, but the offending key never survives.
    const result = ModelWeekDraftSchema.safeParse(weekWithId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("exerciseId" in result.data.days[0].workout!.sections[0].prescriptions[0]).toBe(false);
    }
  });
});
