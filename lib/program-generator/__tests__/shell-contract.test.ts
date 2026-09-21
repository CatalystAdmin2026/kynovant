// ─────────────────────────────────────────────────────────────
// Shell contract alignment — regression coverage for production draft
// 13fb1899-fe5c-4244-857c-911a90af7038, where a coach's "Friday is upper
// body and arms" produced days[4].targetMuscleGroups with more than the
// schema's maximum (diagnosed via the PR-61fed28 validation telemetry).
//
// The prompt and ProgramShellSchema must agree; ProgramShellSchema stays
// the authoritative contract.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject, NoObjectGeneratedError, TypeValidationError } from "ai";
import {
  MuscleGroupSchema,
  ProgramShellSchema,
  SHELL_MAX_TARGET_MUSCLE_GROUPS,
  parseProgramGenerationBrief,
} from "../contracts";
import { muscleGroupEnum } from "@/lib/db/schema-exercise";
import { buildShellGenerationPrompt } from "../prompt";
import { generateProgramShell, repairShellOutput, createShellRepair } from "../provider";
import { inferMuscleGroupsFromDayText, narrowCandidatesForDay } from "../exercise-candidates";

const mockedGenerateObject = vi.mocked(generateObject);

const COACH_TEXT =
  'she needs 6-8 exercises per day. monday is glutes and hamstrings, tuesday is chest shoulders and triceps, wednesday is back and biceps, thursday is quads calves and glutes, friday is upper body and arms. follow that split exactly. end ever day with 2 ab excercises AFTER the 6-8 primary muscle group movements. also, do NOT include "bayesian lat pulldown" anywhere in the program. that is NOT a real exercise.';

function brief(overrides: Record<string, unknown> = {}) {
  const parsed = parseProgramGenerationBrief({
    goal: "muscle_growth",
    weeks: 8,
    daysPerWeek: 5,
    preferredSplit: "body_part",
    experienceLevel: "intermediate",
    equipmentAccess: "commercial_gym",
    targetSessionMinutes: 60,
    freeformInstructions: COACH_TEXT,
    ...overrides,
  });
  if (!parsed.ok) throw new Error("brief invalid: " + JSON.stringify(parsed));
  return parsed.data;
}

const ALL_GROUPS = MuscleGroupSchema.options;

function shellWith(days: unknown[]) {
  return {
    title: "T",
    description: "D",
    totalWeeks: 8,
    days,
    phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 8, progressionTarget: "x", isDeload: false }],
    globalConstraints: "",
  };
}

beforeEach(() => {
  process.env.PROGRAM_GENERATOR_MODEL = "anthropic/claude-sonnet-4";
  delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  mockedGenerateObject.mockReset();
});

describe("targetMuscleGroups maximum", () => {
  it("1: ProgramShellSchema rejects more than the authoritative maximum and accepts exactly the maximum", () => {
    const ok = ALL_GROUPS.slice(0, SHELL_MAX_TARGET_MUSCLE_GROUPS);
    const tooMany = ALL_GROUPS.slice(0, SHELL_MAX_TARGET_MUSCLE_GROUPS + 1);
    expect(SHELL_MAX_TARGET_MUSCLE_GROUPS).toBe(6);
    expect(ProgramShellSchema.safeParse(shellWith([{ dayOfWeek: 1, label: "A", targetMuscleGroups: ok }])).success).toBe(true);
    const bad = ProgramShellSchema.safeParse(shellWith([{ dayOfWeek: 1, label: "A", targetMuscleGroups: tooMany }]));
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].path).toEqual(["days", 0, "targetMuscleGroups"]);
  });

  it("2: the shell prompt communicates the maximum and the omit-when-broad rule", () => {
    const prompt = buildShellGenerationPrompt(brief(), null);
    expect(prompt).toContain(`at most ${SHELL_MAX_TARGET_MUSCLE_GROUPS} distinct values`);
    expect(prompt).toContain(`Never list more than ${SHELL_MAX_TARGET_MUSCLE_GROUPS}`);
    expect(prompt).toMatch(/upper body and arms/);
    expect(prompt).toMatch(/OMIT targetMuscleGroups/);
  });

  it("3: the vocabulary in the prompt is exactly the canonical muscle_group enum", () => {
    expect([...ALL_GROUPS]).toEqual([...muscleGroupEnum.enumValues]);
    const prompt = buildShellGenerationPrompt(brief(), null);
    expect(prompt).toContain(muscleGroupEnum.enumValues.join(", "));
  });
});

describe("dayOfWeek contract", () => {
  // The rule the prompt states: Monday-first, consecutive, wrapping 7 -> 0.
  function mondayFirst(n: number): number[] {
    return Array.from({ length: n }, (_, i) => (i + 1) % 7);
  }

  it.each([1, 2, 3, 4, 5, 6, 7])("4: daysPerWeek %i yields a schema-valid, unique dayOfWeek sequence", (n) => {
    const days = mondayFirst(n).map((d, i) => ({ dayOfWeek: d, label: `Day ${i + 1}` }));
    expect(ProgramShellSchema.safeParse(shellWith(days)).success).toBe(true);
  });

  it("5: the seven-day Monday-first sequence is exactly 1,2,3,4,5,6,0", () => {
    expect(mondayFirst(7)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const prompt = buildShellGenerationPrompt(brief({ daysPerWeek: 7, freeformInstructions: undefined }), null);
    expect(prompt).toContain("1, 2, 3, 4, 5, 6, 0");
  });

  it("6: the prompt never implies dayOfWeek 7", () => {
    const prompt = buildShellGenerationPrompt(brief({ daysPerWeek: 7, freeformInstructions: undefined }), null);
    expect(prompt).not.toMatch(/1, 2, 3, 4, 5, 6, 7/);
    expect(prompt).toContain("7 is never valid");
    expect(prompt).toContain("integer from 0 to 6");
  });
});

describe("phase / structural invariants are communicated", () => {
  it("7: unique dayOfWeek, unique phaseNumber, week bounds, ordering, coverage", () => {
    const prompt = buildShellGenerationPrompt(brief(), null);
    expect(prompt).toContain("every day must use a different dayOfWeek");
    expect(prompt).toContain("phaseNumber values must be unique");
    expect(prompt).toContain("weekStart <= weekEnd");
    expect(prompt).toContain("between 1 and totalWeeks");
    expect(prompt).toMatch(/must not overlap and together must cover every week from 1 to totalWeeks/);
    expect(prompt).toContain("at most 8 phases");
  });

  it("the coach's freeform split reaches the prompt and is to be followed exactly", () => {
    const prompt = buildShellGenerationPrompt(brief(), null);
    expect(prompt).toContain("friday is upper body and arms");
    expect(prompt).toContain("follow that split exactly");
  });
});

describe("repairShellOutput — deterministic, never slices", () => {
  const eight = ["chest", "lats", "upper_back", "front_deltoid", "lateral_deltoid", "rear_deltoid", "biceps", "triceps"];

  it("removes (does not slice) a >max list, and the field-less shell validates", () => {
    const notes: string[] = [];
    const out = repairShellOutput(shellWith([{ dayOfWeek: 5, label: "Friday", focus: "Upper body and arms", targetMuscleGroups: eight }]), notes) as ReturnType<typeof shellWith>;
    expect((out.days[0] as Record<string, unknown>).targetMuscleGroups).toBeUndefined();
    expect(notes).toEqual(["days[0].targetMuscleGroups:removed_over_max"]);
    expect(ProgramShellSchema.safeParse(out).success).toBe(true);
  });

  it("the omitted field falls back to label/focus inference that preserves the full intent", () => {
    // 'Upper body and arms' -> the existing keyword fallback covers all 8 groups.
    const inferred = inferMuscleGroupsFromDayText("Friday", "Upper body and arms");
    for (const g of eight) expect(inferred).toContain(g);
  });

  it("canonicalizes case/hyphens/dupes without dropping anything", () => {
    const notes: string[] = [];
    const out = repairShellOutput(
      shellWith([{ dayOfWeek: 1, label: "A", targetMuscleGroups: ["Glutes", "hamstrings", "GLUTES", "front-deltoid"] }]),
      notes,
    ) as ReturnType<typeof shellWith>;
    expect((out.days[0] as Record<string, unknown>).targetMuscleGroups).toEqual(["glutes", "hamstrings", "front_deltoid"]);
    expect(notes).toEqual(["days[0].targetMuscleGroups:canonicalized"]);
  });

  it("an unrecognized muscle value removes the hint rather than silently dropping just that entry", () => {
    const notes: string[] = [];
    const out = repairShellOutput(
      shellWith([{ dayOfWeek: 1, label: "A", targetMuscleGroups: ["glutes", "core"] }]),
      notes,
    ) as ReturnType<typeof shellWith>;
    expect((out.days[0] as Record<string, unknown>).targetMuscleGroups).toBeUndefined();
    expect(notes).toEqual(["days[0].targetMuscleGroups:removed_invalid_value"]);
  });

  it("wraps dayOfWeek 7 to 0 (Sunday last in a Monday-first week)", () => {
    const notes: string[] = [];
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, label: `D${d}` }));
    const out = repairShellOutput(shellWith(days), notes) as ReturnType<typeof shellWith>;
    expect(out.days.map((d) => (d as { dayOfWeek: number }).dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(ProgramShellSchema.safeParse(out).success).toBe(true);
  });

  it("leaves an already-valid shell untouched (no notes)", () => {
    const notes: string[] = [];
    const shell = shellWith([{ dayOfWeek: 1, label: "A", targetMuscleGroups: ["glutes", "hamstrings"] }]);
    expect(repairShellOutput(shell, notes)).toEqual(shell);
    expect(notes).toEqual([]);
  });

  it("repairText returns null when nothing is repairable, so the SDK still fails on the original error", async () => {
    const { repairText, notes } = createShellRepair();
    const overflowingPhase = { ...shellWith([{ dayOfWeek: 1, label: "A" }]), phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 9, progressionTarget: "x", isDeload: false }] };
    expect(await repairText({ text: JSON.stringify(overflowingPhase), error: new Error("x") })).toBeNull();
    expect(await repairText({ text: "not json", error: new Error("x") })).toBeNull();
    expect(notes).toEqual([]);
  });
});

describe("generateProgramShell end-to-end (SDK validation emulated around the real repair hook)", () => {
  // Emulates generateObject's contract: validate -> on failure call
  // repairText -> re-validate against the SAME schema -> throw a real
  // NoObjectGeneratedError if still invalid.
  function emulateSdk(rawShell: unknown) {
    mockedGenerateObject.mockImplementationOnce((async (opts: {
      schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } };
      repairText?: (o: { text: string; error: unknown }) => Promise<string | null>;
    }) => {
      const first = opts.schema.safeParse(rawShell);
      if (first.success) return { object: first.data };
      const repaired = opts.repairText ? await opts.repairText({ text: JSON.stringify(rawShell), error: first.error }) : null;
      if (repaired) {
        const second = opts.schema.safeParse(JSON.parse(repaired));
        if (second.success) return { object: second.data };
        throw new NoObjectGeneratedError({
          message: "No object generated: response did not match schema.",
          cause: new TypeValidationError({ value: JSON.parse(repaired), cause: second.error }),
          text: repaired,
          response: { id: "r", timestamp: new Date(), modelId: "m" },
          usage: {} as never,
          finishReason: "stop",
        });
      }
      throw new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        cause: new TypeValidationError({ value: rawShell, cause: first.error }),
        text: JSON.stringify(rawShell),
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: {} as never,
        finishReason: "stop",
      });
    }) as never);
  }

  const fridayEight = [
    { dayOfWeek: 1, label: "Glutes & Hamstrings", targetMuscleGroups: ["glutes", "hamstrings"] },
    { dayOfWeek: 2, label: "Chest, Shoulders & Triceps", targetMuscleGroups: ["chest", "front_deltoid", "triceps"] },
    { dayOfWeek: 3, label: "Back & Biceps", targetMuscleGroups: ["lats", "upper_back", "biceps"] },
    { dayOfWeek: 4, label: "Quads, Calves & Glutes", targetMuscleGroups: ["quadriceps", "calves", "glutes"] },
    {
      dayOfWeek: 5,
      label: "Upper Body & Arms",
      focus: "Upper body and arms",
      targetMuscleGroups: ["chest", "lats", "upper_back", "front_deltoid", "lateral_deltoid", "rear_deltoid", "biceps", "triceps"],
    },
  ];

  it("the production failure shape now succeeds, with the repair recorded and other days untouched", async () => {
    emulateSdk(shellWith(fridayEight));
    const out = await generateProgramShell(brief(), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.shell.days).toHaveLength(5);
    expect(out.shell.days[4].targetMuscleGroups).toBeUndefined();
    expect(out.shell.days[4].label).toBe("Upper Body & Arms");
    expect(out.shell.days[0].targetMuscleGroups).toEqual(["glutes", "hamstrings"]);
    expect(out.repairs).toEqual(["days[4].targetMuscleGroups:removed_over_max"]);
  });

  it("a valid shell passes through with no repairs (success behavior intact)", async () => {
    emulateSdk(shellWith(fridayEight.slice(0, 4)));
    const out = await generateProgramShell(brief({ daysPerWeek: 4 }), null);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.repairs).toEqual([]);
  });

  it("8: an unrepairable violation still fails as invalid_output with the 61fed28 diagnostics", async () => {
    emulateSdk({ ...shellWith(fridayEight.slice(0, 1)), phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 99, progressionTarget: "x", isDeload: false }] });
    const out = await generateProgramShell(brief({ daysPerWeek: 1 }), null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("invalid_output");
    expect(out.validation?.kind).toBe("schema_validation");
    expect(out.validation?.issues.map((i) => i.path)).toContain("phases");
  });
});

describe("narrowing uses the fallback when the hint is omitted", () => {
  it("narrowCandidatesForDay accepts a day with no targetMuscleGroups (infers from label/focus)", () => {
    const day = { dayOfWeek: 5, label: "Upper Body & Arms", focus: "Upper body and arms" };
    const result = narrowCandidatesForDay({ candidates: [] } as never, day, []);
    expect(Array.isArray(result)).toBe(true);
  });
});
