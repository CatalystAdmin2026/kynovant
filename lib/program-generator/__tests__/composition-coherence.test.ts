// ─────────────────────────────────────────────────────────────
// Program composition coherence — DIFFERENT EXERCISE ID != MEANINGFULLY
// DIFFERENT STIMULUS, but REPETITION != AUTOMATICALLY BAD.
//
// Covers: contextual concentration severity (PIL M07), cross-day finisher
// repetition and concentration/coverage warnings, muscle-aware pattern
// emphasis, pattern-balanced candidate caps, per-day finisher rotation,
// and the light day-prompt composition guidance. Fixtures use TEST
// metadata (never the production "Narrow-Grip Pull-Up" row).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { makeBlueprint, makeExercise, makePrescription } from "@/lib/pil/__tests__/helpers";
import { analyzeRedundancy, classifyConcentration } from "@/lib/pil/modules/redundancy";
import { orchestrateBlueprint } from "@/lib/pil/blueprint-audit";
import { validateWeekCrossDay } from "../week-cross-day-validation";
import { deriveCanonicalWeekBlueprint } from "../blueprint";
import { deriveBlockPlans } from "../block-plan";
import {
  narrowCandidatesForDay,
  patternAffinityForDay,
  rotateForDay,
  selectCandidatesFromPool,
  selectPatternBalanced,
  verifyDayAgainstCandidates,
  type ExerciseCandidate,
} from "../exercise-candidates";
import { buildDayGenerationPrompt, SESSION_COMPOSITION_GUIDANCE } from "../prompt";
import { checkDayFinishers } from "../day-requirements";
import { parseProgramGenerationBrief, type ProgramShell, type ProgramShellDay } from "../contracts";
import type { MuscleGroup, MovementPattern } from "@/lib/db/schema-exercise";

// ── fixtures ────────────────────────────────────────────────

let n = 0;
function cand(primary: MuscleGroup, pattern: MovementPattern, extra: Partial<ExerciseCandidate> = {}): ExerciseCandidate {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: extra.name ?? `${pattern} ${primary} ${n}`,
    alternateNames: [],
    primaryMuscleGroup: primary,
    secondaryMuscleGroups: [],
    movementPattern: pattern,
    classification: "compound",
    resistanceType: null,
    difficulty: "beginner",
    isCardio: false,
    isMobility: false,
    highJointStress: [],
    defaultPrescription: null,
    ...extra,
  };
}

function briefWith(overrides: Record<string, unknown> = {}) {
  const parsed = parseProgramGenerationBrief({
    goal: "muscle_growth",
    weeks: 6,
    daysPerWeek: 5,
    preferredSplit: "body_part",
    experienceLevel: "intermediate",
    equipmentAccess: "commercial_gym",
    targetSessionMinutes: 75,
    ...overrides,
  });
  if (!parsed.ok) throw new Error("brief invalid");
  return parsed.data;
}

// PIL fixture: prescriptions from (name, pattern, muscle, sectionType).
function pilSession(items: Array<[string, MovementPattern, MuscleGroup, string?]>) {
  return makeBlueprint({
    prescriptions: items.map(([name, pattern, muscle, section], i) =>
      makePrescription({
        id: `p${i}`,
        exerciseId: `ex-${i}-${name}`,
        orderIndex: i,
        sectionType: (section ?? "main_lift") as never,
        exercise: makeExercise({ id: `ex-${i}-${name}`, name, movementPattern: pattern, primaryMuscleGroup: muscle }),
      }),
    ),
  });
}
const redundancyOf = (r: ReturnType<typeof analyzeRedundancy>) => r.findings.filter((f) => f.code === "REDUNDANCY_PATTERN_MUSCLE");

// Week fixture for cross-day checks.
function weekWith(days: Array<{ id: string; dow: number; label: string; sections: Array<{ type: string; ex: ExerciseCandidate[] }> }>) {
  return {
    id: "wk-1",
    weekNumber: 1,
    days: days.map((d) => ({
      id: d.id,
      dayOfWeek: d.dow,
      label: d.label,
      workout: {
        id: `w-${d.id}`,
        name: d.label,
        sections: d.sections.map((s, si) => ({
          id: `${d.id}-s${si}`,
          name: s.type,
          sectionType: s.type,
          orderIndex: si,
          prescriptions: s.ex.map((c, i) => ({ id: `${d.id}-s${si}-p${i}`, orderIndex: i, exerciseId: c.id, exerciseName: c.name, isRequired: true })),
        })),
      },
    })),
  } as never;
}
const byId = (cs: ExerciseCandidate[]) => new Map(cs.map((c) => [c.id, c]));
function shellOf(days: ProgramShellDay[]): ProgramShell {
  return { title: "T", description: "D", totalWeeks: 6, days, phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 6, progressionTarget: "x", isDeload: false }], globalConstraints: "" };
}

// ── 1 & 2: concentration magnitude and context ──────────────

describe("PIL M07 — concentration magnitude and context", () => {
  const verticalPulls = pilSession([
    ["Pull-Up (test)", "pull_vertical", "lats"],
    ["Wide-Grip Pull-Up (test)", "pull_vertical", "lats"],
    ["Narrow-Grip Pull-Up (test)", "pull_vertical", "lats"],
    ["Lat Pulldown (test)", "pull_vertical", "lats"],
  ]);
  const backContext = { dayTargetMuscles: ["lats", "upper_back", "rear_deltoid", "biceps"] as MuscleGroup[] };

  it("1: 4 of 4 primary exercises in one stimulus key on a multi-muscle back day is a high-concentration WARNING", () => {
    expect(classifyConcentration(4, 4)).toBe("high");
    const [f] = redundancyOf(analyzeRedundancy(verticalPulls, backContext));
    expect(f.severity).toBe("warning");
    expect(f.confidence).toBe("heuristic");
    expect(f.title).toContain("4 of 4 primary exercises");
    expect(f.explanation).toContain("coarse overlap signal");
    expect(f.explanation).not.toContain("are identical");
    expect(f.affectedEntities).toHaveLength(4);
    // It flows through the real orchestration path as a finding too.
    const audit = orchestrateBlueprint(verticalPulls, { redundancyContext: backContext });
    expect(audit.allFindings.some((x) => x.code === "REDUNDANCY_PATTERN_MUSCLE" && x.severity === "warning")).toBe(true);
    expect(audit.qualitySummary.dimensionStatus.redundancy).toBe("detected");
  });

  it("2: the same session under explicit specialization is NOT escalated the same way", () => {
    const prioritized = redundancyOf(analyzeRedundancy(verticalPulls, { ...backContext, specializedMuscles: ["lats"] }))[0];
    expect(prioritized.severity).toBe("caution");
    expect(prioritized.explanation).toContain("prioritized or the day is built around it");
    const narrowDay = redundancyOf(analyzeRedundancy(verticalPulls, { dayTargetMuscles: ["lats"] }))[0];
    expect(narrowDay.severity).toBe("caution");
    // Magnitude alone (no context) is still a warning.
    expect(redundancyOf(analyzeRedundancy(verticalPulls))[0].severity).toBe("warning");
  });

  it("6: RDL + B-Stance RDL among ordinary primary work stays low (info), never structural, and does not light the dimension", () => {
    const session = pilSession([
      ["Barbell RDL", "hip_hinge", "hamstrings"],
      ["B-Stance RDL", "hip_hinge", "hamstrings"],
      ["Hip Thrust", "hip_extension", "glutes"],
      ["Leg Curl", "knee_flexion", "hamstrings"],
      ["Back Extension", "hip_extension", "spinal_erectors"],
      ["Cable Kickback", "hip_extension", "glutes"],
      ["Abduction", "shoulder_abduction", "glutes"],
    ]);
    const [f] = redundancyOf(analyzeRedundancy(session, { dayTargetMuscles: ["glutes", "hamstrings"] }));
    expect(f.severity).toBe("info");
    expect(orchestrateBlueprint(session).qualitySummary.dimensionStatus.redundancy).toBe("ok");
    for (const x of orchestrateBlueprint(session).allFindings) expect(x.severity).not.toBe("error");
  });

  it("magnitude tiers: 2 of 8 is far less notable than 4 of 4; findings never reach 'error'", () => {
    expect(classifyConcentration(2, 8)).toBe("low");
    expect(classifyConcentration(3, 7)).toBe("moderate");
    expect(classifyConcentration(3, 5)).toBe("high");
    expect(classifyConcentration(2, 3)).toBe("moderate");
  });

  it("only primary work counts: warmup/finisher/cooldown exercises sharing a key are ignored", () => {
    const session = pilSession([
      ["A", "hip_flexion", "rectus_abdominis", "finisher"],
      ["B", "hip_flexion", "rectus_abdominis", "finisher"],
      ["Squat", "squat_bilateral", "quadriceps"],
    ]);
    expect(redundancyOf(analyzeRedundancy(session))).toHaveLength(0);
  });

  it("exact duplicates in primary work are reported as certain", () => {
    const dup = makeBlueprint({
      prescriptions: [0, 1].map((i) =>
        makePrescription({ id: `p${i}`, exerciseId: "ex-same", orderIndex: i, exercise: makeExercise({ id: "ex-same", name: "Same", movementPattern: "squat_bilateral", primaryMuscleGroup: "quadriceps" }) }),
      ),
    });
    const f = analyzeRedundancy(dup).findings.find((x) => x.code === "REDUNDANCY_EXACT_DUPLICATE");
    expect(f?.confidence).toBe("certain");
  });
});

// ── cross-day: concentration coverage, finishers, compounds ─

describe("week cross-day checks", () => {
  const brief = briefWith();
  const pulls = [0, 1, 2, 3].map((i) => cand("lats", "pull_vertical", { name: `Vertical Pull ${i}` }));
  const rows = [cand("upper_back", "pull_horizontal"), cand("rear_deltoid", "pull_horizontal"), cand("biceps", "elbow_flexion")];
  const all = [...pulls, ...rows];

  it("1b: a concentrated back day that leaves targeted muscles uncovered (with alternatives available) is escalated", () => {
    const week = weekWith([{ id: "d1", dow: 3, label: "Back & Biceps", sections: [{ type: "main_lift", ex: pulls }] }]);
    const shell = shellOf([{ dayOfWeek: 3, label: "Back & Biceps", targetMuscleGroups: ["lats", "upper_back", "rear_deltoid", "biceps"] }]);
    const f = validateWeekCrossDay(week, brief, byId(all), shell).find((x) => x.code === "PROGRAM_GEN_DAY_CONCENTRATION_COVERAGE");
    expect(f?.severity).toBe("warning");
    expect(f?.explanation).toContain("upper back");
    expect(f?.explanation).toContain("heuristic overlap signal");
  });

  it("2b: an explicitly prioritized muscle exempts the coverage escalation", () => {
    const week = weekWith([{ id: "d1", dow: 3, label: "Back & Biceps", sections: [{ type: "main_lift", ex: pulls }] }]);
    const shell = shellOf([{ dayOfWeek: 3, label: "Back & Biceps", targetMuscleGroups: ["lats", "upper_back", "rear_deltoid", "biceps"] }]);
    const specialized = briefWith({ musclePriorities: ["lats"] });
    expect(validateWeekCrossDay(week, specialized, byId(all), shell).some((x) => x.code === "PROGRAM_GEN_DAY_CONCENTRATION_COVERAGE")).toBe(false);
  });

  it("a balanced back day produces no coverage finding", () => {
    const balanced = [pulls[0], pulls[1], rows[0], rows[1], rows[2]];
    const week = weekWith([{ id: "d1", dow: 3, label: "Back & Biceps", sections: [{ type: "main_lift", ex: balanced }] }]);
    const shell = shellOf([{ dayOfWeek: 3, label: "Back & Biceps", targetMuscleGroups: ["lats", "upper_back", "rear_deltoid", "biceps"] }]);
    expect(validateWeekCrossDay(week, brief, byId(all), shell)).toEqual([]);
  });

  // Finishers
  const plank = cand("rectus_abdominis", "iso_hold", { name: "Plank (test)", classification: "isolation" });
  const vUp = cand("rectus_abdominis", "hip_flexion", { name: "V-Up (test)", classification: "isolation" });
  const other = [1, 2, 3].map((i) => cand("obliques", "rotation", { name: `Other Ab ${i}`, classification: "isolation" }));
  const main = cand("glutes", "hip_extension", { name: "Main Lift X" });
  const dayWith = (i: number, fin: ExerciseCandidate[]) => ({ id: `d${i}`, dow: i, label: `Day ${i}`, sections: [{ type: "main_lift", ex: [main] }, { type: "finisher", ex: fin }] });
  const finisherPool = [main, plank, vUp, ...other];
  const finFinding = (w: never, b = brief) => validateWeekCrossDay(w, b, byId(finisherPool)).find((x) => x.code === "PROGRAM_GEN_WEEK_FINISHER_REPETITIVE");

  it("3: Plank + V-Up on all five training days produces one repetition warning", () => {
    const week = weekWith([1, 2, 3, 4, 5].map((i) => dayWith(i, [plank, vUp])));
    const f = finFinding(week);
    expect(f?.severity).toBe("warning");
    expect(f?.title).toContain("Plank (test)");
    expect(f?.title).toContain("V-Up (test)");
    expect(f?.title).toContain("5 of 5 days");
  });

  it("4: occasional reuse is not five-day repetition (2 of 5: nothing; 3 of 5: info only)", () => {
    // Every finisher appears on at most 2 of the 5 days.
    const two = weekWith([dayWith(1, [plank, other[0]]), dayWith(2, [plank, other[1]]), dayWith(3, [other[2], vUp]), dayWith(4, [other[0], other[2]]), dayWith(5, [other[1], vUp])]);
    expect(finFinding(two)).toBeUndefined();
    const three = weekWith([dayWith(1, [plank, other[0]]), dayWith(2, [plank, other[1]]), dayWith(3, [plank, other[2]]), dayWith(4, [other[1], other[2]]), dayWith(5, [other[0], other[1]])]);
    const f = finFinding(three);
    expect(f?.severity).toBe("info"); // shown, never gating
  });

  it("explicit coach direction exempts a named finisher from the diversity preference", () => {
    const week = weekWith([1, 2, 3, 4, 5].map((i) => dayWith(i, [plank, vUp])));
    const named = briefWith({ freeformInstructions: "always finish with plank (test) and v-up (test)" });
    expect(finFinding(week, named)).toBeUndefined();
  });

  it("5: an intentional repeated compound keeps the existing accepted behavior", () => {
    const squat = cand("quadriceps", "squat_bilateral", { name: "Back Squat (test)" });
    const week = weekWith([
      { id: "a", dow: 1, label: "Lower A", sections: [{ type: "main_lift", ex: [squat] }] },
      { id: "b", dow: 4, label: "Lower B", sections: [{ type: "main_lift", ex: [squat] }] },
    ]);
    const pool = byId([squat]);
    // body_part split: existing PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT warning, unchanged.
    expect(validateWeekCrossDay(week, brief, pool).some((x) => x.code === "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT")).toBe(true);
    // full_body split: repetition is inherent — still skipped.
    expect(validateWeekCrossDay(week, briefWith({ preferredSplit: "full_body" }), pool).some((x) => x.code === "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT")).toBe(false);
  });

  it("10: identical (deterministically expanded) weeks never accumulate cross-week findings — each week is judged alone", () => {
    const mk = (weekNumber: number) => ({ ...(weekWith([1, 2, 3].map((i) => dayWith(i, [[plank, vUp], [other[0], other[1]], [other[2], vUp]][i - 1])))  as unknown as object), weekNumber, id: `wk-${weekNumber}` }) as never;
    const perWeek = [1, 2, 3, 4, 5, 6].map((w) => validateWeekCrossDay(mk(w), brief, byId(finisherPool)).map((f) => f.code));
    for (const codes of perWeek) expect(codes).toEqual(perWeek[0]);
    expect(perWeek[0]).not.toContain("PROGRAM_GEN_WEEK_FINISHER_REPETITIVE");
  });
});

// ── 7: muscle-aware pattern emphasis ────────────────────────

describe("blueprint: muscle-aware primaryPatternEmphasis", () => {
  const block = (() => {
    const r = deriveBlockPlans("muscle_growth", "intermediate", 6);
    if (!r.ok) throw new Error("fixture");
    return r.blocks[0];
  })();
  const days = [
    { dayOfWeek: 1, label: "Glutes & Hamstrings", targetMuscleGroups: ["glutes", "hamstrings"] },
    { dayOfWeek: 4, label: "Quads, Calves & Glutes", targetMuscleGroups: ["quadriceps", "calves", "glutes"] },
  ];
  const affinity = new Map<number, Map<string, number>>([
    [1, new Map([["hip_hinge", 8], ["squat_bilateral", 1]])],
    [4, new Map([["squat_bilateral", 6], ["hip_hinge", 3], ["lunge", 2]])],
  ]);

  it("7: emphasis follows each day's muscles and available patterns, not day order", () => {
    const bp = deriveCanonicalWeekBlueprint(block, days, "intermediate", affinity);
    const emphasis = Object.fromEntries(bp.days.map((d) => [d.dayOfWeek, d.primaryPatternEmphasis]));
    expect(emphasis).toEqual({ 1: "hip_hinge", 4: "squat_bilateral" });
    // Never a pattern the day has no candidate support for.
    for (const d of bp.days) expect((affinity.get(d.dayOfWeek)!.get(d.primaryPatternEmphasis!) ?? 0) > 0).toBe(true);
  });

  it("sibling days still get DIFFERENT patterns when both would prefer the same one; a day with no free supported pattern gets none", () => {
    const both = new Map<number, Map<string, number>>([
      [1, new Map([["hip_hinge", 5]])],
      [4, new Map([["hip_hinge", 4]])],
    ]);
    const bp = deriveCanonicalWeekBlueprint(block, days, "intermediate", both);
    const e = bp.days.map((d) => d.primaryPatternEmphasis);
    expect(e).toEqual(["hip_hinge", null]);
  });

  it("a day with no identifiable candidate support gets no emphasis, and the legacy path is unchanged without affinity", () => {
    const bp = deriveCanonicalWeekBlueprint(block, days, "intermediate", new Map([[1, new Map([["hip_hinge", 3]])]]));
    expect(bp.days.find((d) => d.dayOfWeek === 4)!.primaryPatternEmphasis).toBeNull();
    const legacy = deriveCanonicalWeekBlueprint(block, days, "intermediate");
    expect(legacy.days.map((d) => d.primaryPatternEmphasis)).toEqual(["squat_bilateral", "hip_hinge"]);
  });

  it("patternAffinityForDay counts only the day's own compound candidates by pattern", () => {
    const pool = [cand("glutes", "hip_hinge"), cand("hamstrings", "hip_hinge"), cand("quadriceps", "squat_bilateral"), cand("glutes", "hip_extension", { classification: "isolation" }), cand("chest", "push_horizontal")];
    const a = patternAffinityForDay(pool, days[0] as ProgramShellDay);
    expect(Object.fromEntries(a)).toEqual({ hip_hinge: 2 });
    expect(patternAffinityForDay(pool, { dayOfWeek: 1, label: "Session" }).size).toBe(0);
  });
});

// ── 8: candidate interleaving ───────────────────────────────

describe("candidate pattern representation under caps", () => {
  it("8: a capped bucket keeps other patterns instead of being filled by one alphabetically early pattern", () => {
    const vertical = Array.from({ length: 14 }, (_, i) => cand("lats", "pull_vertical", { name: `A Vertical ${String(i).padStart(2, "0")}` }));
    const horizontal = [cand("lats", "pull_horizontal", { name: "Z Row 1" }), cand("lats", "pull_horizontal", { name: "Z Row 2" })];
    const sorted = [...vertical, ...horizontal]; // alphabetical: verticals first
    // Old behavior: first 10 = all vertical.
    expect(sorted.slice(0, 10).every((c) => c.movementPattern === "pull_vertical")).toBe(true);
    const balanced = selectPatternBalanced(sorted, 10);
    expect(balanced).toHaveLength(10);
    expect(balanced.filter((c) => c.movementPattern === "pull_horizontal")).toHaveLength(2);
    // Not a one-per-pattern rule: the rest of the cap still goes to the majority pattern.
    expect(balanced.filter((c) => c.movementPattern === "pull_vertical")).toHaveLength(8);
  });

  it("under the cap nothing changes", () => {
    const list = [cand("lats", "pull_vertical"), cand("lats", "pull_horizontal")];
    expect(selectPatternBalanced(list, 12)).toEqual(list);
  });

  it("the program-wide pool applies it per muscle bucket and only ever returns pool members", () => {
    const vertical = Array.from({ length: 14 }, (_, i) => cand("lats", "pull_vertical", { name: `A ${String(i).padStart(2, "0")}` }));
    const rows = [cand("lats", "pull_horizontal", { name: "Z Row" })];
    const pool = [...vertical, ...rows];
    const { candidates } = selectCandidatesFromPool(pool, []);
    expect(candidates.some((c) => c.movementPattern === "pull_horizontal")).toBe(true);
    const ids = new Set(pool.map((c) => c.id));
    for (const c of candidates) expect(ids.has(c.id)).toBe(true);
    expect(candidates.filter((c) => c.movementPattern === "pull_vertical").length).toBeGreaterThan(1); // no one-per-pattern cap
  });

  it("12: an excluded/absent exercise can never be introduced by balancing, narrowing, or finisher unions", () => {
    const pool = { candidates: [...Array.from({ length: 6 }, () => cand("glutes", "hip_hinge")), ...Array.from({ length: 6 }, () => cand("rectus_abdominis", "iso_hold"))], gaps: [] };
    const excludedId = "99999999-9999-4999-8999-999999999999"; // not in the (already exclusion-filtered) set
    const day: ProgramShellDay = { dayOfWeek: 1, label: "Glutes", targetMuscleGroups: ["glutes", "hamstrings"], finishers: [{ description: "2 ab", exerciseCount: 2, targetMuscleGroups: ["rectus_abdominis"] }] };
    const ids = new Set(pool.candidates.map((c) => c.id));
    const narrowed = narrowCandidatesForDay(pool, day, []);
    expect(narrowed.some((c) => c.id === excludedId)).toBe(false);
    for (const c of narrowed) expect(ids.has(c.id)).toBe(true);
  });
});

// ── 9: finisher rotation ────────────────────────────────────

describe("finisher candidate rotation", () => {
  const abs = Array.from({ length: 16 }, (_, i) => cand(i % 2 ? "obliques" : "rectus_abdominis", (["iso_hold", "hip_flexion", "rotation", "anti_rotation"] as MovementPattern[])[i % 4], { name: `Ab ${String(i).padStart(2, "0")}`, classification: "isolation" }));
  const glutes = Array.from({ length: 14 }, () => cand("glutes", "hip_hinge"));
  const pool = { candidates: [...glutes, ...abs], gaps: [] };
  const finisher = { description: "2 ab exercises after the primary work", exerciseCount: 2, targetMuscleGroups: ["rectus_abdominis", "obliques"] as MuscleGroup[] };
  const dayFor = (dow: number): ProgramShellDay => ({ dayOfWeek: dow, label: "Glutes & Hamstrings", targetMuscleGroups: ["glutes", "hamstrings"], finishers: [finisher] });
  const absInOrder = (dow: number) => narrowCandidatesForDay(pool, dayFor(dow), []).filter((c) => c.primaryMuscleGroup === "rectus_abdominis" || c.primaryMuscleGroup === "obliques");

  it("9: concurrent days lead with different finisher options while every day keeps the same broad set", () => {
    const leads = [1, 2, 3, 4, 5].map((d) => absInOrder(d)[0].id);
    expect(new Set(leads).size).toBeGreaterThanOrEqual(3);
    const sets = [1, 2, 3, 4, 5].map((d) => new Set(absInOrder(d).map((c) => c.id)));
    for (const s of sets) expect(s.size).toBe(sets[0].size);
    expect(sets[0].size).toBeGreaterThanOrEqual(12); // breadth retained, nothing hidden to manufacture novelty
  });

  it("is deterministic (no randomness): the same day input always yields the identical list", () => {
    expect(narrowCandidatesForDay(pool, dayFor(3), []).map((c) => c.id)).toEqual(narrowCandidatesForDay(pool, dayFor(3), []).map((c) => c.id));
    expect(rotateForDay([1, 2, 3, 4, 5, 6, 7, 8], 3, 0)).toEqual(rotateForDay([1, 2, 3, 4, 5, 6, 7, 8], 3, 0));
  });

  it("the day prompt names rotated soft starting points that differ by day, without restricting choice", () => {
    const brief = briefWith();
    const promptFor = (dow: number) => {
      const d = dayFor(dow);
      return buildDayGenerationPrompt(brief, null, shellOf([d]), 1, d, null, null, narrowCandidatesForDay(pool, d, []));
    };
    const line = (p: string) => p.split("\n").find((l) => l.includes("Suggested starting points"))!;
    expect(line(promptFor(1))).toContain("a preference, not a restriction");
    expect(new Set([1, 2, 3, 4, 5].map((d) => line(promptFor(d)))).size).toBeGreaterThanOrEqual(3);
  });

  it("11: the d57c47f finisher contract still holds on a rotated pool (exactly N after primary work, before cooldown)", () => {
    const day = dayFor(2);
    const narrowed = narrowCandidatesForDay(pool, day, []);
    const primary = narrowed.filter((c) => c.primaryMuscleGroup === "glutes").slice(0, 6);
    const finishers = narrowed.filter((c) => c.primaryMuscleGroup === "obliques" || c.primaryMuscleGroup === "rectus_abdominis").slice(0, 2);
    const draft = {
      id: "d", dayOfWeek: 2, label: "L",
      workout: { id: "w", name: "W", sections: [
        { id: "s0", name: "main", sectionType: "main_lift", orderIndex: 0, prescriptions: primary.map((c, i) => ({ id: `a${i}`, orderIndex: i, exerciseId: c.id, exerciseName: c.name, isRequired: true })) },
        { id: "s1", name: "fin", sectionType: "finisher", orderIndex: 1, prescriptions: finishers.map((c, i) => ({ id: `b${i}`, orderIndex: i, exerciseId: c.id, exerciseName: c.name, isRequired: true })) },
        { id: "s2", name: "cd", sectionType: "cooldown", orderIndex: 2, prescriptions: [{ id: "c0", orderIndex: 0, exerciseId: primary[0].id, exerciseName: primary[0].name, isRequired: true }] },
      ] },
    } as never;
    expect(checkDayFinishers(draft, day, byId(narrowed))).toEqual([]);
    const { rejectedCount } = verifyDayAgainstCandidates(draft, narrowed);
    expect(rejectedCount).toBe(0);
  });
});

// ── prompt guidance ─────────────────────────────────────────

describe("day prompt composition guidance", () => {
  it("is light, general, never names an exercise, and never overrides explicit instructions", () => {
    const text = SESSION_COMPOSITION_GUIDANCE.join("\n");
    expect(text).toMatch(/coherent session/);
    expect(text).toMatch(/distinct movement patterns/);
    expect(text).toMatch(/specialization/);
    expect(text).toMatch(/Explicit coach instructions always take precedence/);
    expect(text).not.toMatch(/pull-up|plank|v-up|pulldown|deadlift|squat|bench/i);
    expect(SESSION_COMPOSITION_GUIDANCE.length).toBeLessThan(10);
  });

  it("appears in every day prompt alongside (not instead of) the catalog, exclusions and finisher rules", () => {
    const d: ProgramShellDay = { dayOfWeek: 1, label: "Session", finishers: [{ description: "2 ab", exerciseCount: 2 }] };
    const p = buildDayGenerationPrompt(briefWith(), null, shellOf([d]), 1, d, null, null, [cand("glutes", "hip_hinge")]);
    expect(p).toContain("## Session Composition");
    expect(p).toContain("Exercise Catalog (SELECT ONLY FROM THIS LIST)");
    expect(p).toContain("## Required Finishing Work");
    expect(p).toContain("excluded exercises have already been removed from the catalog");
  });
});
