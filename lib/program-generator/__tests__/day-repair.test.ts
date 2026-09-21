// ─────────────────────────────────────────────────────────────
// Malformed model-supplied exerciseId repair (production draft
// 94c89802..., Week 1 Day 1: two `exerciseId: Invalid UUID` issues
// rejected an entire otherwise-recoverable day).
//
// Safety invariant under test: removing a malformed id must NOT let an
// invented/off-catalog exercise in — the prescription keeps only its
// name and continues down the existing path (candidate verification ->
// canonical name resolution -> unresolved findings block approval).
// generateObject is mocked around the REAL repairText hook, and
// validation uses the REAL, unchanged ModelDayDraftSchema.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject, NoObjectGeneratedError, TypeValidationError } from "ai";
import { generateProgramDay, repairDayOutput, classifyMalformedId } from "../provider";
import { ModelDayDraftSchema, isValidUuid, parseProgramGenerationBrief, type ProgramShell } from "../contracts";
import { verifyDayAgainstCandidates, type ExerciseCandidate } from "../exercise-candidates";
import { buildDayGenerationPrompt, DAY_CATALOG_CLARIFICATION, SESSION_COMPOSITION_GUIDANCE } from "../prompt";
import { logGenerationFailure, logProviderSuccess } from "../observability";

const mockedGenerateObject = vi.mocked(generateObject);

const ID_A = "3f2a1b7c-9d4e-4a11-8b22-0123456789ab"; // valid RFC v4
const ID_B = "4a2b1c7d-8e5f-4b22-9c33-123456789abc";
const OFF_CATALOG = "5b3c2d8e-9f60-4c33-8d44-23456789abcd"; // valid UUID, not offered
const RFC_INVALID = "11111111-1111-1111-1111-111111111111"; // UUID-shaped, fails version/variant
const RAW_SECRET = "SECRET-RAW-ID-do-not-log";

function cand(id: string, name: string): ExerciseCandidate {
  return {
    id, name, alternateNames: [], primaryMuscleGroup: "glutes", secondaryMuscleGroups: [], movementPattern: "hip_hinge",
    classification: "compound", resistanceType: null, difficulty: "beginner", isCardio: false, isMobility: false,
    highJointStress: [], defaultPrescription: null,
  };
}
const CANDIDATES = [cand(ID_A, "Glute Bridge"), cand(ID_B, "Romanian Deadlift")];

const brief = (() => {
  const r = parseProgramGenerationBrief({ goal: "muscle_growth", weeks: 6, daysPerWeek: 1, preferredSplit: "body_part", experienceLevel: "intermediate", equipmentAccess: "commercial_gym", targetSessionMinutes: 60 });
  if (!r.ok) throw new Error("brief");
  return r.data;
})();
const shellDay = { dayOfWeek: 1, label: "Glutes and Hamstrings" };
const shell: ProgramShell = { title: "T", description: "D", totalWeeks: 6, days: [shellDay], phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 6, progressionTarget: "x", isDeload: false }], globalConstraints: "" };

type P = Record<string, unknown>;
const rx = (i: number, extra: P): P => ({ id: `p${i}`, orderIndex: i, isRequired: true, sets: 3, ...extra });
function dayWith(sections: Array<{ type: string; items: P[] }>) {
  return {
    id: "day-1", dayOfWeek: 1, label: "Glutes and Hamstrings",
    workout: { id: "w", name: "W", sections: sections.map((s, i) => ({ id: `s${i}`, name: s.type, sectionType: s.type, orderIndex: i, prescriptions: s.items })) },
  };
}

// Emulates generateObject's contract around the real hook and real schema.
function emulateSdk(raw: unknown) {
  mockedGenerateObject.mockImplementationOnce((async (opts: {
    schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } };
    repairText?: (o: { text: string; error: unknown }) => Promise<string | null>;
  }) => {
    const fail = (value: unknown, error: unknown, text: string) =>
      new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        cause: new TypeValidationError({ value, cause: error }),
        text,
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: {} as never,
        finishReason: "stop",
      });
    const first = opts.schema.safeParse(raw);
    if (first.success) return { object: first.data };
    const repaired = opts.repairText ? await opts.repairText({ text: JSON.stringify(raw), error: first.error }) : null;
    if (repaired) {
      const second = opts.schema.safeParse(JSON.parse(repaired));
      if (second.success) return { object: second.data };
      throw fail(JSON.parse(repaired), second.error, repaired);
    }
    throw fail(raw, first.error, JSON.stringify(raw));
  }) as never);
}

const run = () => generateProgramDay({ brief, clientContext: null, shell, weekNumber: 1, dayIndex: 1, shellDay, priorSameDaySummary: null, weekSoFarSummary: null, candidates: CANDIDATES });

beforeEach(() => {
  process.env.PROGRAM_GENERATOR_MODEL = "anthropic/claude-sonnet-4";
  delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  mockedGenerateObject.mockReset();
});

describe("malformed exerciseId repair", () => {
  it("A: malformed id + exact allowed candidate name -> id omitted, name kept, ready for the existing resolver", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: "glute-bridge", exerciseName: "Glute Bridge" })] }]));
    const out = await run();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const p = out.day.workout!.sections[0].prescriptions[0];
    expect(p.exerciseId).toBeUndefined();
    expect(p.exerciseName).toBe("Glute Bridge");
    // Exactly the id-less shape the existing name resolver already handles (case E).
    const { result, rejectedCount } = verifyDayAgainstCandidates(out.day, CANDIDATES);
    expect(rejectedCount).toBe(0);
    expect(result.workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
    expect(out.repairs).toHaveLength(1);
  });

  it("B: malformed id + invented name -> sanitization confers no standing: no id, name untouched, nothing canonical substituted", async () => {
    emulateSdk(dayWith([{ type: "warmup", items: [rx(0, { exerciseId: "banded-glute-activation-drill", exerciseName: "Banded Glute Activation Drill" })] }]));
    const out = await run();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { result } = verifyDayAgainstCandidates(out.day, CANDIDATES);
    const p = result.workout!.sections[0].prescriptions[0];
    expect(p.exerciseId).toBeUndefined();
    expect(p.exerciseName).toBe("Banded Glute Activation Drill"); // not renamed to a candidate
    expect(JSON.stringify(result)).not.toContain(ID_A);
    expect(JSON.stringify(result)).not.toContain(ID_B);
    // It still has no resolved identity: persistence requires the existing
    // resolver, and approval refuses any prescription without a resolved id.
    const staged = readFileSync(resolve(process.cwd(), "lib/program-generator/staged-generation.ts"), "utf8");
    expect(staged).toContain("resolveProgramDraftExercises(assembledModelDraft");
    expect(readFileSync(resolve(process.cwd(), "lib/program-generator/approval.ts"), "utf8")).toContain("has no resolved exerciseId");
  });

  it("C: a valid UUID for a valid candidate is untouched (no repair, canonicalized by the existing verifier)", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: ID_A, exerciseName: "Glute Bridge" })] }]));
    const out = await run();
    if (!out.ok) throw new Error("expected ok");
    expect(out.repairs).toEqual([]);
    expect(out.day.workout!.sections[0].prescriptions[0].exerciseId).toBe(ID_A);
    expect(verifyDayAgainstCandidates(out.day, CANDIDATES).rejectedCount).toBe(0);
  });

  it("D: a valid but off-catalog UUID is not repaired here; the existing verifier still strips it", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: OFF_CATALOG, exerciseName: "Invented Lift" })] }]));
    const out = await run();
    if (!out.ok) throw new Error("expected ok");
    expect(out.repairs).toEqual([]);
    expect(out.day.workout!.sections[0].prescriptions[0].exerciseId).toBe(OFF_CATALOG);
    const { result, rejectedCount } = verifyDayAgainstCandidates(out.day, CANDIDATES);
    expect(rejectedCount).toBe(1);
    expect(result.workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
  });

  it("E: an absent exerciseId behaves exactly as before", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseName: "Romanian Deadlift" })] }]));
    const out = await run();
    if (!out.ok) throw new Error("expected ok");
    expect(out.repairs).toEqual([]);
    expect(out.day.workout!.sections[0].prescriptions[0].exerciseId).toBeUndefined();
  });

  it("F: two malformed ids are both removed without altering any other field", async () => {
    const items = [rx(0, { exerciseId: "not-a-uuid", exerciseName: "Glute Bridge", sets: 2, coachNotes: "n0" }), rx(1, { exerciseId: "", exerciseName: "Cat-Cow", sets: 4 }), rx(2, { exerciseId: ID_B, exerciseName: "Romanian Deadlift" })];
    emulateSdk(dayWith([{ type: "warmup", items }]));
    const out = await run();
    if (!out.ok) throw new Error("expected ok");
    const ps = out.day.workout!.sections[0].prescriptions;
    expect(ps[0]).toMatchObject({ id: "p0", exerciseName: "Glute Bridge", sets: 2, coachNotes: "n0", orderIndex: 0 });
    expect(ps[1]).toMatchObject({ id: "p1", exerciseName: "Cat-Cow", sets: 4, orderIndex: 1 });
    expect("exerciseId" in ps[0]).toBe(false);
    expect("exerciseId" in ps[1]).toBe(false);
    expect(ps[2].exerciseId).toBe(ID_B); // valid one untouched
    expect(out.repairs).toHaveLength(2);
  });

  it("G: an unrelated schema violation is NOT hidden by the repair — the day still fails as invalid_output", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: "bad", exerciseName: "Glute Bridge" }), rx(1, { exerciseName: "Romanian Deadlift", sets: 0 })] }]));
    const out = await run();
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("invalid_output");
    const paths = out.validation!.issues.map((i) => i.path);
    expect(paths.some((p) => p.endsWith("sets"))).toBe(true);
    expect(paths.some((p) => p.endsWith("exerciseId"))).toBe(false); // the bad id was repaired; the real violation remains
    expect(out.repairs).toHaveLength(1); // repair activity still reported on failure
  });

  it("a non-string exerciseId is not this repair's business and still fails", async () => {
    emulateSdk(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: 12345, exerciseName: "Glute Bridge" })] }]));
    const out = await run();
    expect(out.ok).toBe(false);
  });
});

describe("one UUID predicate for schema and repair", () => {
  it("isValidUuid agrees with the model schema, including a UUID-shaped string that fails RFC version/variant", () => {
    const check = (id: string) => ModelDayDraftSchema.safeParse(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: id, exerciseName: "X" })] }])).success;
    for (const id of [ID_A, ID_B, OFF_CATALOG]) { expect(isValidUuid(id)).toBe(true); expect(check(id)).toBe(true); }
    for (const id of [RFC_INVALID, "not-a-uuid", "", "3f2a1b7c-9d4e-4a11-8b22-0123456789"]) { expect(isValidUuid(id)).toBe(false); expect(check(id)).toBe(false); }
    // Repair treats the UUID-shaped-but-invalid value as malformed (the schema would reject it immediately after).
    const notes: string[] = [];
    repairDayOutput(dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: RFC_INVALID, exerciseName: "X" })] }]), notes);
    expect(notes[0]).toContain("shape=uuid_like_invalid");
  });

  it("repair never touches a value the schema accepts", () => {
    const notes: string[] = [];
    const raw = dayWith([{ type: "main_lift", items: [rx(0, { exerciseId: ID_A, exerciseName: "X" })] }]);
    expect(repairDayOutput(raw, notes)).toEqual(raw);
    expect(notes).toEqual([]);
  });
});

describe("sanitized diagnostics", () => {
  it("records structure only — section type, indices, length, hyphens, shape — never the value", () => {
    const notes: string[] = [];
    repairDayOutput(dayWith([{ type: "warmup", items: [rx(0, { exerciseId: RAW_SECRET, exerciseName: "X" }), rx(1, { exerciseId: "banded-glute-bridge", exerciseName: "Y" })] }]), notes);
    expect(notes).toEqual([
      `sections[0].prescriptions[0].exerciseId:removed_malformed(section=warmup,len=${RAW_SECRET.length},hyphens=true,shape=slug_like)`,
      "sections[0].prescriptions[1].exerciseId:removed_malformed(section=warmup,len=19,hyphens=true,shape=slug_like)",
    ]);
    expect(notes.join("")).not.toContain("SECRET");
    expect(notes.join("")).not.toContain("banded");
  });

  it("an unknown section type is reported as 'unknown', never echoed", () => {
    const notes: string[] = [];
    repairDayOutput(dayWith([{ type: "totally-invented-section", items: [rx(0, { exerciseId: "x", exerciseName: "X" })] }]), notes);
    expect(notes[0]).toContain("section=unknown");
    expect(notes[0]).not.toContain("invented");
  });

  it("coarse shape classes", () => {
    expect(classifyMalformedId("")).toBe("empty");
    expect(classifyMalformedId("  ")).toBe("empty");
    expect(classifyMalformedId(RFC_INVALID)).toBe("uuid_like_invalid");
    expect(classifyMalformedId("3f2a1b7c-9d4e")).toBe("hex_fragment");
    expect(classifyMalformedId("glute-bridge")).toBe("slug_like");
    expect(classifyMalformedId("Glute Bridge!")).toBe("other");
  });

  it("repairs reach PROGRAM_GENERATOR_PROVIDER_OK and PROGRAM_GENERATOR_FAILURE without any raw value", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const note = `sections[0].prescriptions[0].exerciseId:removed_malformed(section=warmup,len=12,hyphens=false,shape=other)`;
    logProviderSuccess({ draftId: "d", stage: "day", weekNumber: 1, dayNumber: 1, provider: "p", model: "m", elapsedMs: 1, repairs: [note] });
    logGenerationFailure({ draftId: "d", stage: "day", errorCode: "invalid_output", errorMessage: "m", provider: "p", model: "m", isRetryOrResume: false, repairs: [note] });
    expect(JSON.parse((logSpy.mock.calls[0] as [string, string])[1]).repairs).toEqual([note]);
    expect(JSON.parse((errorSpy.mock.calls[0] as [string, string])[1]).repairs).toEqual([note]);
    vi.restoreAllMocks();
  });
});

describe("prompt clarification and completedDays logging", () => {
  it("the day prompt states the catalog rule for warmup/activation and the omit-instead-of-invent rule, alongside the unchanged composition guidance", () => {
    const p = buildDayGenerationPrompt(brief, null, shell, 1, shellDay, null, null, CANDIDATES);
    expect(p).toContain(DAY_CATALOG_CLARIFICATION);
    expect(DAY_CATALOG_CLARIFICATION).toContain("including warmup and activation");
    expect(DAY_CATALOG_CLARIFICATION).toContain("copy its exact id and name");
    expect(DAY_CATALOG_CLARIFICATION).toContain("omit that item");
    expect(DAY_CATALOG_CLARIFICATION).toContain("rather than inventing an exercise or an id");
    expect(p).toContain(SESSION_COMPOSITION_GUIDANCE.join("\n"));
    expect(DAY_CATALOG_CLARIFICATION.length).toBeLessThan(420);
  });

  it("the concurrent-batch failure event counts siblings that succeed later in the same batch", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/program-generator/staged-generation.ts"), "utf8");
    expect(src).toContain("completedDays: completedDaysThisWeek.size + batchSuccessCount");
    expect(src).toContain("const batchSuccessCount = batchResults.filter((r) => r.dayOutcome.ok).length;");
  });
});
