// ─────────────────────────────────────────────────────────────
// Findings Grouping — pure unit tests
//
// No DB required — groupDraftFindings() is a deterministic in-memory
// transform. Fixtures are hand-built DraftValidationResult/
// GeneratedProgramDraft objects, matching the exact shapes
// validation.ts/contracts.ts produce.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { groupDraftFindings, groupKeyForFinding } from "../findings-grouping";
import type { DraftValidationResult, ValidationFinding } from "../validation";
import type { GeneratedProgramDraft } from "../contracts";

function buildDraftWithThreeWeeks(): {
  draft: GeneratedProgramDraft;
  week1DayId: string;
  week2DayId: string;
  week3DayId: string;
  p1: string;
  p2: string;
  p3: string;
} {
  const week1DayId = randomUUID();
  const week2DayId = randomUUID();
  const week3DayId = randomUUID();
  const p1 = randomUUID();
  const p2 = randomUUID();
  const p3 = randomUUID();

  function makeWeek(weekNumber: number, dayId: string, prescriptionId: string, exerciseName: string) {
    return {
      id: randomUUID(),
      weekNumber,
      days: [
        {
          id: dayId,
          dayOfWeek: 1,
          workout: {
            id: randomUUID(),
            name: "Back & Biceps",
            sections: [
              {
                id: randomUUID(),
                name: "Main Work",
                sectionType: "main_lift" as const,
                orderIndex: 0,
                prescriptions: [
                  {
                    id: prescriptionId,
                    exerciseId: null,
                    exerciseName,
                    orderIndex: 0,
                    sets: 3,
                    repsMin: 8,
                    repsMax: 12,
                    isRequired: true,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  const draft: GeneratedProgramDraft = {
    name: "Grouping Test Program",
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 3,
    recommendedDaysPerWeek: 1,
    weeks: [
      makeWeek(1, week1DayId, p1, "Cable Seated Row"),
      makeWeek(2, week2DayId, p2, "Cable Seated Row"),
      makeWeek(3, week3DayId, p3, "Arm Circles"),
    ],
  };

  return { draft, week1DayId, week2DayId, week3DayId, p1, p2, p3 };
}

describe("groupKeyForFinding", () => {
  it("groups the same unresolved exercise name under one key, case/whitespace-insensitively", () => {
    const a: ValidationFinding = {
      id: randomUUID(),
      code: "PROGRAM_GEN_EXERCISE_UNRESOLVED",
      severity: "blocker",
      title: "x",
      explanation: "x",
      exerciseName: "Arm Circles",
    };
    const b: ValidationFinding = { ...a, id: randomUUID(), exerciseName: "  arm   circles " };
    expect(groupKeyForFinding(a)).toBe(groupKeyForFinding(b));
  });

  it("does not merge findings of the same PIL code affecting different joints", () => {
    const shoulder: ValidationFinding = {
      id: randomUUID(),
      code: "JOINT_STRESS_HIGH",
      severity: "warning",
      title: "High cumulative shoulder load",
      explanation: "x",
      affectedEntities: [{ type: "joint", id: "shoulder", name: "Shoulder" }],
    };
    const knee: ValidationFinding = {
      ...shoulder,
      id: randomUUID(),
      title: "High cumulative knee load",
      affectedEntities: [{ type: "joint", id: "knee", name: "Knee" }],
    };
    expect(groupKeyForFinding(shoulder)).not.toBe(groupKeyForFinding(knee));
  });

  it("merges the same PIL code+joint across different weeks/days (locational entities excluded from the key)", () => {
    const week1: ValidationFinding = {
      id: randomUUID(),
      code: "JOINT_STRESS_HIGH",
      severity: "warning",
      title: "High cumulative shoulder load",
      explanation: "x",
      weekId: "week-1",
      dayId: "day-1",
      affectedEntities: [
        { type: "joint", id: "shoulder", name: "Shoulder" },
        { type: "week", id: "week-1", name: "Week 1" },
      ],
    };
    const week2: ValidationFinding = {
      ...week1,
      id: randomUUID(),
      weekId: "week-2",
      dayId: "day-2",
      affectedEntities: [
        { type: "joint", id: "shoulder", name: "Shoulder" },
        { type: "week", id: "week-2", name: "Week 2" },
      ],
    };
    expect(groupKeyForFinding(week1)).toBe(groupKeyForFinding(week2));
  });
});

describe("groupDraftFindings — repeated unresolved/ambiguous names", () => {
  it("groups the same ambiguous name repeated across weeks into a single group", () => {
    const { draft, week1DayId, week2DayId, p1, p2 } = buildDraftWithThreeWeeks();
    const candidates = [
      { id: randomUUID(), name: "Close-Grip Seated Cable Row" },
      { id: randomUUID(), name: "Wide-Grip Seated Cable Row" },
    ];

    const insights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
          severity: "blocker",
          title: "Exercise name matched more than one library exercise",
          explanation: '"Cable Seated Row" matched multiple library exercises.',
          dayId: week1DayId,
          prescriptionId: p1,
          exerciseName: "Cable Seated Row",
          candidates,
        },
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
          severity: "blocker",
          title: "Exercise name matched more than one library exercise",
          explanation: '"Cable Seated Row" matched multiple library exercises.',
          dayId: week2DayId,
          prescriptionId: p2,
          exerciseName: "Cable Seated Row",
          candidates,
        },
      ],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };

    const result = groupDraftFindings(insights, draft);

    // Instead of displaying the same issue twice, exactly one group.
    expect(result.hierarchy.blockers).toHaveLength(1);
    const group = result.hierarchy.blockers[0];
    expect(group.exerciseName).toBe("Cable Seated Row");
    expect(group.occurrenceCount).toBe(2);
    expect(group.candidates.map((c) => c.name).sort()).toEqual(
      ["Close-Grip Seated Cable Row", "Wide-Grip Seated Cable Row"].sort(),
    );
  });

  it("preserves every occurrence's week/day/prescription location", () => {
    const { draft, week1DayId, week2DayId, p1, p2 } = buildDraftWithThreeWeeks();
    const insights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
          severity: "blocker",
          title: "t",
          explanation: "e",
          dayId: week1DayId,
          prescriptionId: p1,
          exerciseName: "Cable Seated Row",
          candidates: [],
        },
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
          severity: "blocker",
          title: "t",
          explanation: "e",
          dayId: week2DayId,
          prescriptionId: p2,
          exerciseName: "Cable Seated Row",
          candidates: [],
        },
      ],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };

    const result = groupDraftFindings(insights, draft);
    const group = result.hierarchy.blockers[0];
    expect(group.occurrences).toHaveLength(2);

    const weekNumbers = group.occurrences.map((o) => o.weekNumber).sort();
    expect(weekNumbers).toEqual([1, 2]);
    const dayLabels = group.occurrences.map((o) => o.dayLabel);
    expect(dayLabels.every((l) => l === "Back & Biceps")).toBe(true);
    const prescriptionIds = group.occurrences.map((o) => o.prescriptionId).sort();
    expect(prescriptionIds).toEqual([p1, p2].sort());
  });

  it("keeps a differently-named unresolved exercise as a separate group", () => {
    const { draft, week1DayId, week3DayId, p1, p3 } = buildDraftWithThreeWeeks();
    const insights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
          severity: "blocker",
          title: "t",
          explanation: "e",
          dayId: week1DayId,
          prescriptionId: p1,
          exerciseName: "Cable Seated Row",
          candidates: [],
        },
        {
          id: randomUUID(),
          code: "PROGRAM_GEN_EXERCISE_UNRESOLVED",
          severity: "blocker",
          title: "t",
          explanation: "e",
          dayId: week3DayId,
          prescriptionId: p3,
          exerciseName: "Arm Circles",
        },
      ],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };

    const result = groupDraftFindings(insights, draft);
    expect(result.hierarchy.blockers).toHaveLength(2);
    const names = result.hierarchy.blockers.map((g) => g.exerciseName).sort();
    expect(names).toEqual(["Arm Circles", "Cable Seated Row"]);
  });
});

describe("groupDraftFindings — grouped count matches raw findings", () => {
  it("the sum of occurrenceCount across every group equals the raw finding count, per severity bucket", () => {
    const { draft, week1DayId, week2DayId, week3DayId, p1, p2, p3 } = buildDraftWithThreeWeeks();
    const insights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS", severity: "blocker", title: "t", explanation: "e", dayId: week1DayId, prescriptionId: p1, exerciseName: "Cable Seated Row", candidates: [] },
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS", severity: "blocker", title: "t", explanation: "e", dayId: week2DayId, prescriptionId: p2, exerciseName: "Cable Seated Row", candidates: [] },
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_UNRESOLVED", severity: "blocker", title: "t", explanation: "e", dayId: week3DayId, prescriptionId: p3, exerciseName: "Arm Circles" },
      ],
      warnings: [
        { id: randomUUID(), code: "PROGRAM_GEN_EQUIPMENT_MISMATCH", severity: "warning", title: "t", explanation: "e", dayId: week1DayId, prescriptionId: p1, exerciseId: randomUUID(), exerciseName: "Standing Calf Raise" },
      ],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };

    const result = groupDraftFindings(insights, draft);
    const totalBlockerOccurrences = result.hierarchy.blockers.reduce((sum, g) => sum + g.occurrenceCount, 0);
    const totalWarningOccurrences = result.hierarchy.warnings.reduce((sum, g) => sum + g.occurrenceCount, 0);

    expect(totalBlockerOccurrences).toBe(insights.blockers.length);
    expect(totalWarningOccurrences).toBe(insights.warnings.length);
  });
});

describe("groupDraftFindings — review summary", () => {
  it("reports unique unresolved/ambiguous name counts, affected prescriptions, and approval possibility", () => {
    const { draft, week1DayId, week2DayId, week3DayId, p1, p2, p3 } = buildDraftWithThreeWeeks();
    const insights: DraftValidationResult = {
      status: "blocked",
      blockers: [
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS", severity: "blocker", title: "t", explanation: "e", dayId: week1DayId, prescriptionId: p1, exerciseName: "Cable Seated Row", candidates: [] },
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS", severity: "blocker", title: "t", explanation: "e", dayId: week2DayId, prescriptionId: p2, exerciseName: "Cable Seated Row", candidates: [] },
        { id: randomUUID(), code: "PROGRAM_GEN_EXERCISE_UNRESOLVED", severity: "blocker", title: "t", explanation: "e", dayId: week3DayId, prescriptionId: p3, exerciseName: "Arm Circles" },
      ],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };

    const result = groupDraftFindings(insights, draft);
    expect(result.summary.ambiguousExerciseNameCount).toBe(1); // "Cable Seated Row" only
    expect(result.summary.unresolvedExerciseNameCount).toBe(1); // "Arm Circles" only
    expect(result.summary.totalAffectedPrescriptions).toBe(3); // p1, p2, p3
    expect(result.summary.approvalPossible).toBe(false);
  });

  it("approval becomes possible once there are zero blockers", () => {
    const { draft } = buildDraftWithThreeWeeks();
    const insights: DraftValidationResult = {
      status: "ready",
      blockers: [],
      warnings: [],
      info: [],
      blueprintAudits: [],
      unresolvedExerciseIds: [],
    };
    const result = groupDraftFindings(insights, draft);
    expect(result.summary.approvalPossible).toBe(true);
  });

  it("returns a safe empty result when insights is null", () => {
    const result = groupDraftFindings(null, null);
    expect(result.hierarchy.blockers).toEqual([]);
    expect(result.summary.approvalPossible).toBe(false);
  });
});
