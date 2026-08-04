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
import { parseProgramGenerationBrief, parseGeneratedProgramDraft } from "../contracts";

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
