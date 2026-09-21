// ─────────────────────────────────────────────────────────────
// Explicit coach-stated finishing requirements ("finish every day with 2
// ab exercises AFTER the 6-8 primary movements") — the one general
// `finishers` mechanism: shell contract -> shell prompt -> candidate
// pool -> day prompt -> post-generation verification.
//
// Nothing here special-cases abs: the same functions handle calves and a
// pattern-only "loaded carry" requirement below.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  ProgramShellSchema,
  ProgramShellFinisherSchema,
  parseProgramGenerationBrief,
  type ModelDayDraft,
  type ProgramShell,
  type ProgramShellDay,
} from "../contracts";
import { buildDayGenerationPrompt, buildShellGenerationPrompt } from "../prompt";
import {
  narrowCandidatesForDay,
  verifyDayAgainstCandidates,
  type ExerciseCandidate,
} from "../exercise-candidates";
import { checkDayFinishers, validateDayFinishers } from "../day-requirements";
import { repairShellOutput } from "../provider";
import type { MuscleGroup, MovementPattern } from "@/lib/db/schema-exercise";

const COACH_TEXT =
  'she needs 6-8 exercises per day. monday is glutes and hamstrings, tuesday is chest shoulders and triceps, wednesday is back and biceps, thursday is quads calves and glutes, friday is upper body and arms. follow that split exactly. end ever day with 2 ab excercises AFTER the 6-8 primary muscle group movements.';

const brief = (() => {
  const parsed = parseProgramGenerationBrief({
    goal: "muscle_growth",
    weeks: 8,
    daysPerWeek: 5,
    preferredSplit: "body_part",
    experienceLevel: "intermediate",
    equipmentAccess: "commercial_gym",
    targetSessionMinutes: 75,
    freeformInstructions: COACH_TEXT,
  });
  if (!parsed.ok) throw new Error("brief invalid");
  return parsed.data;
})();

let n = 0;
function cand(primary: MuscleGroup, pattern: MovementPattern = "hip_hinge", extra: Partial<ExerciseCandidate> = {}): ExerciseCandidate {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `${primary} ex ${n}`,
    alternateNames: [],
    primaryMuscleGroup: primary,
    secondaryMuscleGroups: [],
    movementPattern: pattern,
    classification: "isolation",
    resistanceType: null,
    difficulty: "beginner",
    isCardio: false,
    isMobility: false,
    highJointStress: [],
    defaultPrescription: null,
    ...extra,
  };
}

const PRIMARY_GROUPS: MuscleGroup[] = [
  "chest", "lats", "upper_back", "front_deltoid", "lateral_deltoid", "rear_deltoid", "biceps", "triceps",
  "quadriceps", "hamstrings", "glutes", "calves",
];
// A realistic program-wide pool: 12 per primary group (so per-day narrowing
// alone always reaches its floor without any ab candidate) + 6 ab/oblique.
function pool() {
  const primary = PRIMARY_GROUPS.flatMap((g) => Array.from({ length: 12 }, () => cand(g)));
  const abs = [
    ...Array.from({ length: 4 }, () => cand("rectus_abdominis", "anti_rotation")),
    ...Array.from({ length: 2 }, () => cand("obliques", "rotation")),
  ];
  const carries = Array.from({ length: 3 }, () => cand("forearms", "carry"));
  return { candidates: [...primary, ...abs, ...carries], gaps: [] };
}

const ABS_FINISHER = {
  description: "2 ab exercises after the primary work",
  exerciseCount: 2,
  targetMuscleGroups: ["rectus_abdominis", "obliques"] as MuscleGroup[],
};

// The five-day split from the production instruction.
const DAYS: ProgramShellDay[] = [
  { dayOfWeek: 1, label: "Glutes & Hamstrings", targetMuscleGroups: ["glutes", "hamstrings"], finishers: [ABS_FINISHER] },
  { dayOfWeek: 2, label: "Chest, Shoulders & Triceps", targetMuscleGroups: ["chest", "front_deltoid", "lateral_deltoid", "triceps"], finishers: [ABS_FINISHER] },
  { dayOfWeek: 3, label: "Back & Biceps", targetMuscleGroups: ["lats", "upper_back", "rear_deltoid", "biceps"], finishers: [ABS_FINISHER] },
  { dayOfWeek: 4, label: "Quads, Calves & Glutes", targetMuscleGroups: ["quadriceps", "calves", "glutes"], finishers: [ABS_FINISHER] },
  // Broad day: hint omitted (c10122c), described by label/focus.
  { dayOfWeek: 5, label: "Upper Body & Arms", focus: "Upper body and arms", finishers: [ABS_FINISHER] },
];

const isAbs = (c: ExerciseCandidate) => c.primaryMuscleGroup === "rectus_abdominis" || c.primaryMuscleGroup === "obliques";

function shellOf(days: ProgramShellDay[]): ProgramShell {
  return {
    title: "T",
    description: "D",
    totalWeeks: 8,
    days,
    phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 8, progressionTarget: "x", isDeload: false }],
    globalConstraints: "",
  };
}

function dayDraft(sections: Array<{ type: string; order: number; ex: Array<ExerciseCandidate | null> }>): ModelDayDraft {
  return {
    id: "day-1",
    dayOfWeek: 1,
    label: "Glutes & Hamstrings",
    workout: {
      id: "w",
      name: "W",
      sections: sections.map((s, si) => ({
        id: `s${si}`,
        name: s.type,
        sectionType: s.type as never,
        orderIndex: s.order,
        prescriptions: s.ex.map((c, i) => ({
          id: `p${si}-${i}`,
          orderIndex: i,
          exerciseName: c?.name ?? "unknown",
          ...(c ? { exerciseId: c.id } : {}),
          isRequired: true,
        })),
      })),
    },
  } as ModelDayDraft;
}

describe("shell contract carries finishers", () => {
  it("accepts finishers, stays backward compatible without them, and bounds count/size", () => {
    expect(ProgramShellSchema.safeParse(shellOf(DAYS)).success).toBe(true);
    expect(ProgramShellSchema.safeParse(shellOf([{ dayOfWeek: 1, label: "A" }])).success).toBe(true);
    expect(ProgramShellFinisherSchema.safeParse({ description: "x", exerciseCount: 0 }).success).toBe(false);
    expect(ProgramShellFinisherSchema.safeParse({ description: "x", exerciseCount: 7 }).success).toBe(false);
    expect(ProgramShellSchema.safeParse(shellOf([{ dayOfWeek: 1, label: "A", finishers: Array(4).fill({ description: "x", exerciseCount: 1 }) }])).success).toBe(false);
  });

  it("the shell prompt tells the model to record explicit finishers, additive to the primary count, never invented", () => {
    const prompt = buildShellGenerationPrompt(brief, null);
    expect(prompt).toContain("finishers (optional, per day)");
    expect(prompt).toContain("IN ADDITION to the day's primary exercises");
    expect(prompt).toContain("never invent one the coach did not ask for");
    expect(prompt).toContain('"every day" means every day');
    expect(prompt).toContain("movementPattern (one of:");
    expect(prompt).toContain("do NOT count toward that day's targetMuscleGroups limit");
  });

  it("repair removes only invalid finisher HINTS and never the coach's description/count", () => {
    const notes: string[] = [];
    const out = repairShellOutput(
      shellOf([
        { dayOfWeek: 1, label: "A", finishers: [{ description: "2 ab exercises", exerciseCount: 2, targetMuscleGroups: ["core"] as never, movementPattern: "planking" as never }] },
      ]),
      notes,
    ) as ProgramShell;
    expect(out.days[0].finishers).toEqual([{ description: "2 ab exercises", exerciseCount: 2 }]);
    expect(notes.sort()).toEqual([
      "days[0].finishers[0].movementPattern:removed_invalid_value",
      "days[0].finishers[0].targetMuscleGroups:removed",
    ]);
  });
});

describe("candidate pool always covers the requested finisher", () => {
  it("2: on every requested day — narrow-hint days and the broad omitted-hint day — ab candidates are available; without the requirement the narrowed pool has none", () => {
    const p = pool();
    for (const day of DAYS) {
      const withReq = narrowCandidatesForDay(p, day, []);
      expect(withReq.filter(isAbs).length, `${day.label} ab candidates`).toBeGreaterThanOrEqual(2);
      // Sanity of the defect this fixes: same day WITHOUT the finisher gets none.
      const { finishers: _f, ...bare } = day;
      void _f;
      const without = narrowCandidatesForDay(p, bare, []);
      if (day.dayOfWeek !== 5) expect(without.filter(isAbs).length, `${day.label} pre-fix`).toBe(0);
    }
  });

  it("7: 'upper body and arms' keeps its full inferred narrowing (chest/back/delts/biceps/triceps) alongside the finisher pool", () => {
    const p = pool();
    const fri = narrowCandidatesForDay(p, DAYS[4], []);
    const groups = new Set(fri.map((c) => c.primaryMuscleGroup));
    for (const g of ["chest", "lats", "upper_back", "biceps", "triceps", "rectus_abdominis"] as MuscleGroup[]) expect(groups.has(g)).toBe(true);
    expect(groups.has("quadriceps")).toBe(false); // still narrowed, not the whole library
    expect(fri.length).toBeLessThan(p.candidates.length);
  });

  it("10: the pool only ever contains ids from the supplied (already tenant/active-filtered) candidate set", () => {
    const p = pool();
    const ids = new Set(p.candidates.map((c) => c.id));
    for (const day of DAYS) for (const c of narrowCandidatesForDay(p, day, [])) expect(ids.has(c.id)).toBe(true);
  });

  it("an unnarrowed day (already the full pool) is returned as-is", () => {
    const p = pool();
    const unclassifiable: ProgramShellDay = { dayOfWeek: 1, label: "Session", finishers: [ABS_FINISHER] };
    expect(narrowCandidatesForDay(p, unclassifiable, [])).toBe(p.candidates);
  });
});

describe("day prompt: quantity and ordering semantics", () => {
  function dayPrompt(day: ProgramShellDay) {
    const p = pool();
    return buildDayGenerationPrompt(brief, null, shellOf(DAYS), 1, day, null, null, narrowCandidatesForDay(p, day, []));
  }

  it("1/3: 6-8 primary + EXACTLY 2 additional finishing exercises, stated as additive (8-10 total)", () => {
    const prompt = dayPrompt(DAYS[0]);
    expect(prompt).toContain("## Required Finishing Work");
    expect(prompt).toContain("EXACTLY 2 exercises");
    expect(prompt).toContain("2 ab exercises after the primary work");
    expect(prompt).toContain("muscles: rectus_abdominis, obliques");
    expect(prompt).toContain('applies to the PRIMARY work only');
    expect(prompt).toContain("ADDITIONAL — 2 more exercises on top of the primary count, not part of it");
    // The coach's own words (with the 6-8 count) are still in the brief the day sees.
    expect(prompt).toContain("6-8 exercises per day");
  });

  it("4: ordering is explicit — own final finisher section, highest orderIndex, only cooldown may follow", () => {
    const prompt = dayPrompt(DAYS[0]);
    expect(prompt).toContain('sectionType "finisher"');
    expect(prompt).toContain("highest orderIndex");
    expect(prompt).toContain("Only a cooldown section may come after them");
    expect(prompt).toContain("Nothing from the primary work may come after them");
  });

  it("5: a day WITHOUT an explicit requirement gets no finishing section (abs are not automatic)", () => {
    const bare: ProgramShellDay = { dayOfWeek: 2, label: "Chest", targetMuscleGroups: ["chest"] };
    expect(dayPrompt(bare)).not.toContain("Required Finishing Work");
    const p = pool();
    expect(narrowCandidatesForDay(p, bare, []).filter(isAbs)).toHaveLength(0);
    expect(checkDayFinishers(dayDraft([{ type: "main_lift", order: 0, ex: [p.candidates[0]] }]), bare, new Map())).toEqual([]);
  });

  it("6: a different requirement uses the same mechanism (calves after lower work; a pattern-only loaded carry)", () => {
    const calves: ProgramShellDay = {
      dayOfWeek: 4, label: "Lower", targetMuscleGroups: ["quadriceps", "hamstrings"],
      finishers: [{ description: "end lower days with calves", exerciseCount: 1, targetMuscleGroups: ["calves"] }],
    };
    const carry: ProgramShellDay = {
      dayOfWeek: 6, label: "Full Body", focus: "Full body",
      finishers: [{ description: "finish each workout with loaded carries", exerciseCount: 1, movementPattern: "carry" }],
    };
    const p = pool();
    expect(narrowCandidatesForDay(p, calves, []).filter((c) => c.primaryMuscleGroup === "calves").length).toBeGreaterThanOrEqual(1);
    expect(narrowCandidatesForDay(p, { ...carry, focus: undefined, label: "Session" }, [])).toBe(p.candidates);
    const carryOnlyHint: ProgramShellDay = { ...carry, targetMuscleGroups: ["chest"] };
    expect(narrowCandidatesForDay(p, carryOnlyHint, []).some((c) => c.movementPattern === "carry")).toBe(true);
    expect(dayPrompt(carry)).toContain("movement pattern: carry");
    expect(dayPrompt(calves)).toContain("EXACTLY 1 exercise —");
  });
});

describe("verification: finishing work must actually come last", () => {
  const p = pool();
  const byId = new Map(p.candidates.map((c) => [c.id, c]));
  const primary = p.candidates.filter((c) => c.primaryMuscleGroup === "glutes").slice(0, 6);
  const abs = p.candidates.filter(isAbs).slice(0, 2);
  const day = DAYS[0];

  it("satisfied: 6 primary then 2 ab (extra cooldown afterwards is ignored) -> 8 total, no findings", () => {
    const d = dayDraft([
      { type: "main_lift", order: 0, ex: primary },
      { type: "finisher", order: 1, ex: abs },
      { type: "cooldown", order: 2, ex: [p.candidates[100]] },
    ]);
    expect(checkDayFinishers(d, day, byId)).toEqual([]);
  });

  it("8 primary + 2 ab (10 total) is also satisfied — the 6-8 primary count is not confused with the total", () => {
    const eight = p.candidates.filter((c) => c.primaryMuscleGroup === "hamstrings").slice(0, 8);
    const d = dayDraft([{ type: "main_lift", order: 0, ex: eight }, { type: "finisher", order: 1, ex: abs }]);
    expect(checkDayFinishers(d, day, byId)).toEqual([]);
  });

  it("4: abs BEFORE the primary work violates 'AFTER' (ordering comes from orderIndex, not array position)", () => {
    const d = dayDraft([
      { type: "main_lift", order: 5, ex: primary },
      { type: "finisher", order: 1, ex: abs }, // listed second-in-array logic irrelevant: orderIndex 1 < 5
    ]);
    const unmet = checkDayFinishers(d, day, byId);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].matched).toBe(0);
  });

  it("only one ab exercise, or an id outside the candidate set, is not counted", () => {
    const one = dayDraft([{ type: "main_lift", order: 0, ex: primary }, { type: "finisher", order: 1, ex: [abs[0]] }]);
    expect(checkDayFinishers(one, day, byId)[0]).toMatchObject({ expected: 2, matched: 1 });
    const unknown = dayDraft([{ type: "main_lift", order: 0, ex: primary }, { type: "finisher", order: 1, ex: [abs[0], null] }]);
    expect(checkDayFinishers(unknown, day, byId)[0]).toMatchObject({ matched: 1 });
  });

  it("8: a violating day yields a WARNING finding (never a blocker) via the existing pipeline shape", () => {
    const d = dayDraft([{ type: "main_lift", order: 0, ex: primary }]);
    const week = { id: "wk", weekNumber: 1, days: [{ ...d, dayOfWeek: 1 }] } as never;
    const findings = validateDayFinishers(week, shellOf(DAYS), byId);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "PROGRAM_GEN_DAY_FINISHER_UNMET", severity: "warning", weekId: "wk", dayId: "day-1" });
    expect(findings[0].explanation).toContain("2 ab exercises after the primary work");
    // No requirement on this shell day -> no finding.
    expect(validateDayFinishers(week, shellOf([{ dayOfWeek: 1, label: "A" }]), byId)).toEqual([]);
  });

  it("10: verification counts only ids in the supplied candidate set; off-catalog ids are stripped first by the existing verifier", () => {
    const rogue = dayDraft([{ type: "main_lift", order: 0, ex: primary }, { type: "finisher", order: 1, ex: abs }]);
    rogue.workout!.sections[1].prescriptions[0].exerciseId = "11111111-1111-4111-8111-111111111111";
    const { result, rejectedCount } = verifyDayAgainstCandidates(rogue, p.candidates);
    expect(rejectedCount).toBe(1);
    expect(result.workout!.sections[1].prescriptions[0].exerciseId).toBeUndefined();
    expect(checkDayFinishers(result, day, byId)[0]).toMatchObject({ matched: 1 });
  });
});
