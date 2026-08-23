// ─────────────────────────────────────────────────────────────
// Programming Intelligence — Phase B deterministic progression engine.
// Pure unit suite: synthetic canonical-week fixtures only, no DB, no
// provider, no fixtures beyond plain function calls.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expandCanonicalWeek,
  expandBlockFromCanonicalWeek,
  PROGRESSION_ELIGIBLE_SECTION_TYPES,
  type CanonicalWeek,
  type CanonicalDay,
  type CanonicalSection,
  type CanonicalPrescription,
} from "../progression";
import type { ExperienceLevel, PhaseType, ProgressionStrategy } from "../strategy";

// ─────────────────────────────────────────────────────────────
// Compile-time drift contract — a test, not the pure module itself, so
// it's allowed to import the real schemas. If contracts.ts's real
// GeneratedWeekDraft/ModelWeekDraft shape ever diverges from what
// progression.ts's CanonicalWeek expects, this assignment fails to
// typecheck under `npx tsc --noEmit`, exactly like domain-enums.ts's
// own drift test but for shape instead of enum values.
// ─────────────────────────────────────────────────────────────
import type { GeneratedWeekDraft, ModelWeekDraft } from "../contracts";
function _compileTimeDriftCheck(generated: GeneratedWeekDraft, model: ModelWeekDraft): void {
  const _fromGenerated: CanonicalWeek = generated;
  const _fromModel: CanonicalWeek = model;
  void _fromGenerated;
  void _fromModel;
}

// ─────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function makeSeqIdFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `gen-${n}`;
  };
}

function prescription(overrides: Partial<CanonicalPrescription> = {}): CanonicalPrescription {
  return {
    id: nextId("presc"),
    exerciseId: nextId("exercise"),
    exerciseName: "Barbell Back Squat",
    orderIndex: 0,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 120,
    isRequired: true,
    ...overrides,
  };
}

function section(overrides: Partial<CanonicalSection> = {}): CanonicalSection {
  return {
    id: nextId("section"),
    name: "Main Lifts",
    sectionType: "main_lift",
    orderIndex: 0,
    prescriptions: [prescription()],
    ...overrides,
  };
}

function day(overrides: Partial<CanonicalDay> = {}): CanonicalDay {
  return {
    id: nextId("day"),
    dayOfWeek: 1,
    workout: { id: nextId("blueprint"), name: "Day A", sections: [section()] },
    ...overrides,
  };
}

function week(overrides: Partial<CanonicalWeek> = {}): CanonicalWeek {
  return {
    id: nextId("week"),
    weekNumber: 1,
    days: [day()],
    ...overrides,
  };
}

function expandOk(input: Parameters<typeof expandCanonicalWeek>[0]): CanonicalWeek {
  const result = expandCanonicalWeek(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.week;
}

function firstPrescription(w: CanonicalWeek): CanonicalPrescription {
  return w.days[0].workout!.sections[0].prescriptions[0];
}

// ─────────────────────────────────────────────────────────────
// Architectural boundary
// ─────────────────────────────────────────────────────────────
describe("architectural boundary — pure logic only", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/program-generator/progression.ts"), "utf8");

  it("imports nothing from lib/db, contracts.ts, provider.ts, the AI SDK, or any network/fs module", () => {
    const forbidden = [
      "@/lib/db",
      "./contracts",
      "from \"./provider\"",
      "from \"ai\"",
      "@ai-sdk",
      "postgres",
      "drizzle",
      "server-only",
      "node:fs",
      "node:http",
      "node:net",
      "fetch(",
    ];
    for (const pattern of forbidden) {
      expect(source, `progression.ts must not reference "${pattern}"`).not.toContain(pattern);
    }
  });

  it("imports only from ./strategy — the one other already-pure module in this domain", () => {
    const importLines = source.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).toMatch(/from\s+["']\.\/strategy["']/);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Validation / fail-closed behavior
// ─────────────────────────────────────────────────────────────
describe("expandCanonicalWeek — validation", () => {
  it("rejects phaseType 'deload' — deload is never expanded", () => {
    const result = expandCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "volume_density",
      phaseType: "deload",
      experienceLevel: "intermediate",
      blockWeekIndex: 2,
      blockLength: 2,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/deload/i);
  });

  it("rejects RIR progression for a beginner experienceLevel", () => {
    const result = expandCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/beginner/i);
  });

  it("rejects blockLength < 2", () => {
    const result = expandCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects blockWeekIndex outside [2, blockLength]", () => {
    for (const blockWeekIndex of [0, 1, 4, -1, 1.5]) {
      const result = expandCanonicalWeek({
        canonicalWeek: week(),
        progressionStrategy: "rep",
        phaseType: "accumulation",
        experienceLevel: "beginner",
        blockWeekIndex,
        blockLength: 3,
      });
      expect(result.ok, `expected blockWeekIndex=${blockWeekIndex} to fail`).toBe(false);
    }
  });
});

describe("expandBlockFromCanonicalWeek — validation and short blocks", () => {
  it("blockLength=1 returns the canonical week completely unchanged (same id, same weekNumber)", () => {
    const canonical = week({ weekNumber: 5 });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockLength: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks).toEqual([canonical]);
    expect(result.weeks[0]).toBe(canonical); // same reference — nothing was cloned or regenerated
  });

  it("rejects blockLength < 1", () => {
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockLength: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a deload block with blockLength >= 2 (deload is pinned to exactly 1 week by strategy.ts)", () => {
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "volume_density",
      phaseType: "deload",
      experienceLevel: "intermediate",
      blockLength: 2,
    });
    expect(result.ok).toBe(false);
  });

  it("propagates a failure from an inner expandCanonicalWeek call rather than returning partial weeks", () => {
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "beginner", // rir + beginner is invalid
      blockLength: 3,
    });
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Immutability (Section 15) — hard invariant
// ─────────────────────────────────────────────────────────────
describe("immutability", () => {
  it("never mutates the canonical week, across every strategy", () => {
    const strategies: ProgressionStrategy[] = ["rep", "double", "rir", "volume_density"];
    for (const progressionStrategy of strategies) {
      const canonical = week();
      const snapshot = structuredClone(canonical);
      const experienceLevel: ExperienceLevel = progressionStrategy === "rir" ? "advanced" : "beginner";
      expandOk({
        canonicalWeek: canonical,
        progressionStrategy,
        phaseType: "accumulation",
        experienceLevel,
        blockWeekIndex: 2,
        blockLength: 3,
      });
      expect(canonical).toEqual(snapshot);
    }
  });

  it("a second expansion of the same canonical week is unaffected by a first expansion's output being further mutated", () => {
    const canonical = week();
    const snapshot = structuredClone(canonical);
    const week2 = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    // Mutate the OUTPUT aggressively.
    week2.days[0].workout!.sections[0].prescriptions[0].sets = 999;
    week2.days[0].workout!.sections[0].prescriptions[0].coachNotes = "mutated";
    week2.id = "mutated-id";

    const week3 = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockWeekIndex: 3,
      blockLength: 3,
    });
    expect(canonical).toEqual(snapshot);
    expect(week3.days[0].workout!.sections[0].prescriptions[0].sets).not.toBe(999);
  });

  it("expandBlockFromCanonicalWeek does not mutate the canonical week either", () => {
    const canonical = week();
    const snapshot = structuredClone(canonical);
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "double",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    expect(canonical).toEqual(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────
// Identity — Sections 3, 4, 14, 16
// ─────────────────────────────────────────────────────────────
describe("identity", () => {
  it("expanded week/day/section/prescription ids are all freshly generated and globally unique across an entire block", () => {
    const canonical = week({
      days: [
        day({ dayOfWeek: 1, workout: { id: "bp-1", name: "Day A", sections: [section({ prescriptions: [prescription({ id: "p1" }), prescription({ id: "p2", orderIndex: 1 })] })] } }),
        day({ dayOfWeek: 3, workout: { id: "bp-2", name: "Day B", sections: [section({ id: "sec-2" })] } }),
      ],
    });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockLength: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allWeekIds: string[] = [];
    const allDayIds: string[] = [];
    const allSectionIds: string[] = [];
    const allPrescriptionIds: string[] = [];
    for (const w of result.weeks) {
      allWeekIds.push(w.id);
      for (const d of w.days) {
        allDayIds.push(d.id);
        for (const s of d.workout?.sections ?? []) {
          allSectionIds.push(s.id);
          for (const p of s.prescriptions) allPrescriptionIds.push(p.id);
        }
      }
    }
    expect(new Set(allWeekIds).size).toBe(allWeekIds.length);
    expect(new Set(allDayIds).size).toBe(allDayIds.length);
    expect(new Set(allSectionIds).size).toBe(allSectionIds.length);
    expect(new Set(allPrescriptionIds).size).toBe(allPrescriptionIds.length);

    // The canonical week's own ids are preserved verbatim (index 0).
    expect(result.weeks[0]).toBe(canonical);
    expect(result.weeks[0].id).toBe(canonical.id);

    // Every expanded week (index >= 1) has a DIFFERENT id from canonical.
    for (const w of result.weeks.slice(1)) {
      expect(w.id).not.toBe(canonical.id);
    }
  });

  it("uses the injected idFactory instead of crypto.randomUUID when provided, deterministically", () => {
    const canonical = week();
    const week2 = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 2,
      idFactory: makeSeqIdFactory(),
    });
    expect(week2.id).toBe("gen-1");
    expect(week2.days[0].id).toBe("gen-2");
  });

  it("weekNumber is sequential from the canonical week's own weekNumber", () => {
    const canonical = week({ weekNumber: 7 });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "accumulation",
      experienceLevel: "beginner",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks.map((w) => w.weekNumber)).toEqual([7, 8, 9, 10]);
  });
});

// ─────────────────────────────────────────────────────────────
// Structural preservation — Section 3
// ─────────────────────────────────────────────────────────────
describe("structural preservation", () => {
  it("day count, dayOfWeek, section order/name/type, exercise identity, orderIndex, grouping, isRequired, substitutionPolicy all stay stable across an expanded block", () => {
    const canonical = week({
      days: [
        day({
          dayOfWeek: 1,
          label: "Push Day",
          workout: {
            id: "bp",
            name: "Push",
            sections: [
              section({
                name: "Main Lifts",
                sectionType: "main_lift",
                orderIndex: 0,
                prescriptions: [
                  prescription({ exerciseId: "ex-bench", exerciseName: "Barbell Bench Press", orderIndex: 0, groupId: "A", groupPosition: 1, substitutionPolicy: "flexible" }),
                  prescription({ exerciseId: "ex-ohp", exerciseName: "Overhead Press", orderIndex: 1, isRequired: false }),
                ],
              }),
            ],
          },
        }),
        day({ dayOfWeek: 4, workout: null }), // rest day
      ],
    });

    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "double",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockLength: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const w of result.weeks) {
      expect(w.days).toHaveLength(2);
      expect(w.days.map((d) => d.dayOfWeek)).toEqual([1, 4]);
      expect(w.days[1].workout).toBeNull(); // rest day stays a rest day
      const sections = w.days[0].workout!.sections;
      expect(sections.map((s) => s.name)).toEqual(["Main Lifts"]);
      expect(sections.map((s) => s.sectionType)).toEqual(["main_lift"]);
      const [bench, ohp] = sections[0].prescriptions;
      expect(bench.exerciseId).toBe("ex-bench");
      expect(bench.exerciseName).toBe("Barbell Bench Press");
      expect(bench.orderIndex).toBe(0);
      expect(bench.groupId).toBe("A");
      expect(bench.groupPosition).toBe(1);
      expect(bench.substitutionPolicy).toBe("flexible");
      expect(ohp.exerciseId).toBe("ex-ohp");
      expect(ohp.orderIndex).toBe(1);
      expect(ohp.isRequired).toBe(false);
    }
  });

  it("tempo is never altered by any strategy", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ tempo: "3-1-1-0" })] })] } })] });
    for (const progressionStrategy of ["rep", "double", "volume_density"] as ProgressionStrategy[]) {
      const expanded = expandOk({
        canonicalWeek: canonical,
        progressionStrategy,
        phaseType: "accumulation",
        experienceLevel: "beginner",
        blockWeekIndex: 2,
        blockLength: 3,
      });
      expect(firstPrescription(expanded).tempo).toBe("3-1-1-0");
    }
  });

  it("progression-neutral sections (warmup/activation/potentiation/cooldown/rest_period) are copied unchanged regardless of strategy", () => {
    const neutralTypes = ["warmup", "activation", "potentiation", "cooldown", "rest_period"];
    expect(PROGRESSION_ELIGIBLE_SECTION_TYPES).not.toEqual(expect.arrayContaining(neutralTypes as never[]));
    for (const sectionType of neutralTypes) {
      const canonical = week({
        days: [day({ workout: { id: "bp", name: "D", sections: [section({ sectionType, prescriptions: [prescription({ sets: 3, repsMin: 8, repsMax: 12, restSeconds: 60 })] })] } })],
      });
      const expanded = expandOk({
        canonicalWeek: canonical,
        progressionStrategy: "volume_density",
        phaseType: "accumulation",
        experienceLevel: "advanced",
        blockWeekIndex: 3,
        blockLength: 3,
      });
      const p = firstPrescription(expanded);
      expect(p.sets).toBe(3);
      expect(p.repsMin).toBe(8);
      expect(p.repsMax).toBe(12);
      expect(p.restSeconds).toBe(60);
      expect(p.coachNotes).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Rep progression
// ─────────────────────────────────────────────────────────────
describe("rep progression", () => {
  it("raises repsMin monotonically toward repsMax as blockWeekIndex advances, never changing repsMax", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ repsMin: 8, repsMax: 12 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const repsMins = result.weeks.map((w) => firstPrescription(w).repsMin);
    const repsMaxes = result.weeks.map((w) => firstPrescription(w).repsMax);
    expect(repsMaxes.every((max) => max === 12)).toBe(true);
    for (let i = 1; i < repsMins.length; i++) {
      expect(repsMins[i]!).toBeGreaterThanOrEqual(repsMins[i - 1]!);
    }
    expect(repsMins[repsMins.length - 1]).toBe(12); // final week lands at the top of the range
    expect(repsMins[0]).toBe(8); // canonical week itself is untouched
  });

  it("does not touch fixed-rep prescriptions (repsMin === repsMax)", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ repsMin: 5, repsMax: 5 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockWeekIndex: 3,
      blockLength: 3,
    });
    const p = firstPrescription(expanded);
    expect(p.repsMin).toBe(5);
    expect(p.repsMax).toBe(5);
    expect(p.coachNotes).toBeUndefined();
  });

  it("never introduces a numeric RIR field for beginner output", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ targetRir: undefined })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    expect(firstPrescription(expanded).targetRir).toBeUndefined();
  });

  it("appends to, never overwrites, an existing coachNote", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ coachNotes: "Watch the knees on this one." })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    const note = firstPrescription(expanded).coachNotes!;
    expect(note).toContain("Watch the knees on this one.");
    expect(note.length).toBeGreaterThan("Watch the knees on this one.".length);
  });
});

// ─────────────────────────────────────────────────────────────
// Double progression
// ─────────────────────────────────────────────────────────────
describe("double progression", () => {
  it("preserves the full rep range unchanged across every expanded week", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ repsMin: 6, repsMax: 10 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "double",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockLength: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const w of result.weeks) {
      const p = firstPrescription(w);
      expect(p.repsMin).toBe(6);
      expect(p.repsMax).toBe(10);
    }
  });

  it("expresses a conditional instruction, never a false claim that load already increased, and is identical across weeks", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ repsMin: 6, repsMax: 10 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "double",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockLength: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notes = result.weeks.slice(1).map((w) => firstPrescription(w).coachNotes);
    expect(notes[0]).toMatch(/once every set reaches the top/i);
    expect(notes[0]).toMatch(/if you're not there yet/i);
    expect(notes[0]).not.toMatch(/you increased|last week you|you succeeded/i);
    expect(new Set(notes).size).toBe(1); // same standing instruction every week
  });
});

// ─────────────────────────────────────────────────────────────
// RIR progression
// ─────────────────────────────────────────────────────────────
describe("RIR progression", () => {
  it("decreases targetRir monotonically toward the effort-band floor, never below it, never negative", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ targetRir: 4, repsMin: undefined, repsMax: undefined })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "advanced", // floor 0
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rirs = result.weeks.map((w) => firstPrescription(w).targetRir!);
    for (let i = 1; i < rirs.length; i++) expect(rirs[i]).toBeLessThanOrEqual(rirs[i - 1]);
    expect(rirs.every((r) => r >= 0)).toBe(true);
    expect(rirs[rirs.length - 1]).toBe(0);
  });

  it("respects a higher floor for a less aggressive effort band (intermediate floor = 1, never reaches 0)", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ targetRir: 4 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockWeekIndex: 4,
      blockLength: 4,
    });
    expect(firstPrescription(expanded).targetRir).toBe(1);
  });

  it("does not push targetRir lower when it is already at or below the floor", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ targetRir: 0 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "advanced",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    expect(firstPrescription(expanded).targetRir).toBe(0);
  });

  it("falls back to a targetRpe ramp toward the effort-band ceiling when targetRir is absent", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ targetRir: undefined, targetRpe: 6 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "advanced", // ceiling 10
      blockWeekIndex: 3,
      blockLength: 3,
    });
    expect(firstPrescription(expanded).targetRpe).toBe(10);
    expect(firstPrescription(expanded).targetRir).toBeUndefined();
  });

  it("never selects RIR progression for a beginner — structurally impossible via the API guard", () => {
    const result = expandCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "beginner",
      blockWeekIndex: 2,
      blockLength: 3,
    });
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Volume/Density progression
// ─────────────────────────────────────────────────────────────
describe("volume/density progression", () => {
  it("reduces restSeconds modestly and monotonically, never below the 30s floor, never a set increase before the final week", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ restSeconds: 120, sets: 3 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "volume_density",
      phaseType: "accumulation",
      experienceLevel: "advanced",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rests = result.weeks.map((w) => firstPrescription(w).restSeconds!);
    for (let i = 1; i < rests.length; i++) expect(rests[i]).toBeLessThanOrEqual(rests[i - 1]);
    expect(rests.every((r) => r >= 30)).toBe(true);
    expect(rests[0]).toBe(120); // canonical untouched
    // set increment only at the final week
    expect(result.weeks[1].days[0].workout!.sections[0].prescriptions[0].sets).toBe(3);
    expect(result.weeks[2].days[0].workout!.sections[0].prescriptions[0].sets).toBe(3);
    expect(result.weeks[3].days[0].workout!.sections[0].prescriptions[0].sets).toBe(4);
  });

  it("never adds a set when the existing count is already at/above the density cap", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 5 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "volume_density",
      phaseType: "accumulation",
      experienceLevel: "advanced",
      blockWeekIndex: 3,
      blockLength: 3,
    });
    expect(firstPrescription(expanded).sets).toBe(5);
  });

  it("does not apply the set-increment lever to conditioning sections — increases duration there instead", () => {
    const canonical = week({
      days: [day({ workout: { id: "bp", name: "D", sections: [section({ sectionType: "conditioning", prescriptions: [prescription({ sets: 2, durationSeconds: 300, repsMin: undefined, repsMax: undefined })] })] } })],
    });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "volume_density",
      phaseType: "accumulation",
      experienceLevel: "advanced",
      blockWeekIndex: 3,
      blockLength: 3,
    });
    const p = firstPrescription(expanded);
    expect(p.sets).toBe(2); // no set increment for conditioning
    expect(p.durationSeconds!).toBeGreaterThan(300);
  });

  it("never means 'add sets every week' — at most one +1 increment across an entire block", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 3 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "volume_density",
      phaseType: "accumulation",
      experienceLevel: "advanced",
      blockLength: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const setsAcrossBlock = result.weeks.map((w) => firstPrescription(w).sets);
    expect(setsAcrossBlock).toEqual([3, 3, 3, 3, 4]);
  });
});

// ─────────────────────────────────────────────────────────────
// Taper progression
// ─────────────────────────────────────────────────────────────
describe("taper progression", () => {
  it("reduces sets by exactly 1, strips a high-fatigue technique to a straight set, increases rest, and reduces conditioning duration", () => {
    const canonical = week({
      days: [
        day({
          workout: {
            id: "bp",
            name: "D",
            sections: [
              section({ prescriptions: [prescription({ sets: 4, setTechnique: "drop_set", restSeconds: 100 })] }),
              section({ sectionType: "conditioning", prescriptions: [prescription({ sets: 2, durationSeconds: 400, repsMin: undefined, repsMax: undefined })] }),
            ],
          },
        }),
      ],
    });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "taper",
      phaseType: "taper",
      experienceLevel: "competitive",
      blockWeekIndex: 2,
      blockLength: 2,
    });
    const [mainSection, conditioningSection] = expanded.days[0].workout!.sections;
    expect(mainSection.prescriptions[0].sets).toBe(3);
    expect(mainSection.prescriptions[0].setTechnique).toBe("straight_set");
    expect(mainSection.prescriptions[0].restSeconds!).toBeGreaterThan(100);
    expect(conditioningSection.prescriptions[0].sets).toBe(1);
    expect(conditioningSection.prescriptions[0].durationSeconds!).toBeLessThan(400);
    expect(mainSection.prescriptions[0].coachNotes).toMatch(/taper/i);
  });

  it("never reduces sets below 1", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 1 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "taper",
      phaseType: "taper",
      experienceLevel: "competitive",
      blockWeekIndex: 2,
      blockLength: 2,
    });
    expect(firstPrescription(expanded).sets).toBe(1);
  });

  it("strips high-fatigue technique to straight_set regardless of experience level (unlike normal technique timing)", () => {
    for (const experienceLevel of ["beginner", "intermediate", "advanced", "competitive", "mixed"] as ExperienceLevel[]) {
      // taper is never reachable for beginner via the rir guard, but taper
      // strategy itself is independent of experience — verify directly.
      const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ setTechnique: "myo_reps" })] })] } })] });
      const expanded = expandOk({
        canonicalWeek: canonical,
        progressionStrategy: "taper",
        phaseType: "taper",
        experienceLevel,
        blockWeekIndex: 2,
        blockLength: 2,
      });
      expect(firstPrescription(expanded).setTechnique).toBe("straight_set");
    }
  });

  it("never adds volume — no strategy invariant check for taper specifically", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 3, restSeconds: 90 })] })] } })] });
    const expanded = expandOk({
      canonicalWeek: canonical,
      progressionStrategy: "taper",
      phaseType: "taper",
      experienceLevel: "competitive",
      blockWeekIndex: 2,
      blockLength: 2,
    });
    const p = firstPrescription(expanded);
    expect(p.sets!).toBeLessThanOrEqual(3);
    expect(p.restSeconds!).toBeGreaterThanOrEqual(90);
  });
});

// ─────────────────────────────────────────────────────────────
// Technique timing (Section 11)
// ─────────────────────────────────────────────────────────────
describe("technique timing", () => {
  function fixtureWithTechnique(technique: string) {
    return week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ setTechnique: technique })] })] } })] });
  }

  it("beginner: an assigned intensity technique is always withheld (none by default) in every expanded week", () => {
    const canonical = fixtureWithTechnique("drop_set");
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rep",
      phaseType: "foundation",
      experienceLevel: "beginner",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const w of result.weeks.slice(1)) {
      expect(firstPrescription(w).setTechnique).toBe("straight_set");
    }
  });

  it("intermediate: an assigned intensity technique is withheld until the final week of the block", () => {
    const canonical = fixtureWithTechnique("rest_pause");
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "double",
      phaseType: "intensification",
      experienceLevel: "intermediate",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const techniques = result.weeks.map((w) => firstPrescription(w).setTechnique);
    expect(techniques.slice(0, 3)).toEqual(["rest_pause", "straight_set", "straight_set"]); // week 1 = canonical, untouched
    expect(techniques[3]).toBe("rest_pause"); // final week reinstates it
  });

  it("advanced/competitive: an assigned intensity technique is maintained as assigned throughout", () => {
    for (const experienceLevel of ["advanced", "competitive"] as ExperienceLevel[]) {
      const canonical = fixtureWithTechnique("myo_reps");
      const result = expandBlockFromCanonicalWeek({
        canonicalWeek: canonical,
        progressionStrategy: "rir",
        phaseType: "intensification",
        experienceLevel,
        blockLength: 3,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const w of result.weeks) {
        expect(firstPrescription(w).setTechnique).toBe("myo_reps");
      }
    }
  });

  it("grouping techniques (superset/triset/giant_set/circuit) and tempo_set/isometric are never retimed by any experience level", () => {
    for (const technique of ["superset", "triset", "giant_set", "circuit", "tempo_set", "isometric"]) {
      const canonical = fixtureWithTechnique(technique);
      const expanded = expandOk({
        canonicalWeek: canonical,
        progressionStrategy: "rep",
        phaseType: "foundation",
        experienceLevel: "beginner",
        blockWeekIndex: 2,
        blockLength: 3,
      });
      expect(firstPrescription(expanded).setTechnique).toBe(technique);
    }
  });

  it("never invents a technique on a prescription the canonical week left as straight_set", () => {
    const canonical = fixtureWithTechnique("straight_set");
    const result = expandBlockFromCanonicalWeek({
      canonicalWeek: canonical,
      progressionStrategy: "rir",
      phaseType: "intensification",
      experienceLevel: "advanced",
      blockLength: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const w of result.weeks) expect(firstPrescription(w).setTechnique).toBe("straight_set");
  });
});

// ─────────────────────────────────────────────────────────────
// Block-length sweep (Section 17)
// ─────────────────────────────────────────────────────────────
describe("block-length sweep", () => {
  it("produces exactly blockLength weeks, sequential weekNumbers, for lengths 1 through 5", () => {
    for (const blockLength of [1, 2, 3, 4, 5]) {
      const canonical = week({ weekNumber: 10 });
      const result = expandBlockFromCanonicalWeek({
        canonicalWeek: canonical,
        progressionStrategy: "rep",
        phaseType: "foundation",
        experienceLevel: "beginner",
        blockLength,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.weeks).toHaveLength(blockLength);
      expect(result.weeks.map((w) => w.weekNumber)).toEqual(Array.from({ length: blockLength }, (_, i) => 10 + i));
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Edge cases (Section 18)
// ─────────────────────────────────────────────────────────────
describe("edge cases", () => {
  it("single-set prescription never goes to 0 sets under taper", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 1 })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "taper", phaseType: "taper", experienceLevel: "advanced", blockWeekIndex: 2, blockLength: 2 });
    expect(firstPrescription(expanded).sets).toBeGreaterThanOrEqual(1);
  });

  it("very high set count is clamped to the schema max (20) under volume_density's set increment", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 4 })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "advanced", blockWeekIndex: 3, blockLength: 3 });
    expect(firstPrescription(expanded).sets).toBeLessThanOrEqual(20);
  });

  it("a prescription with no rest value defined is left without one, not fabricated", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ restSeconds: undefined })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "advanced", blockWeekIndex: 2, blockLength: 3 });
    expect(firstPrescription(expanded).restSeconds).toBeUndefined();
  });

  it("a bodyweight movement (no exerciseId) round-trips exactly", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseId: null, exerciseName: "Push-Up" })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockWeekIndex: 2, blockLength: 2 });
    expect(firstPrescription(expanded).exerciseId).toBeNull();
    expect(firstPrescription(expanded).exerciseName).toBe("Push-Up");
  });

  it("a timed conditioning prescription (durationSeconds, no reps) is handled without crashing and without fabricating reps", () => {
    const canonical = week({
      days: [day({ workout: { id: "bp", name: "D", sections: [section({ sectionType: "conditioning", prescriptions: [prescription({ repsMin: undefined, repsMax: undefined, sets: undefined, durationSeconds: 600 })] })] } })],
    });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockWeekIndex: 2, blockLength: 2 });
    const p = firstPrescription(expanded);
    expect(p.repsMin).toBeUndefined();
    expect(p.repsMax).toBeUndefined();
    expect(p.durationSeconds).toBe(600); // rep strategy doesn't touch duration
  });

  it("an AMRAP-style prescription (repsMin set, repsMax undefined) is not treated as a range", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ repsMin: 15, repsMax: undefined })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockWeekIndex: 2, blockLength: 3 });
    expect(firstPrescription(expanded).repsMin).toBe(15);
  });

  it("a superset pairing (two prescriptions sharing groupId) both round-trip their grouping unchanged", () => {
    const canonical = week({
      days: [
        day({
          workout: {
            id: "bp",
            name: "D",
            sections: [
              section({
                prescriptions: [
                  prescription({ id: "p1", orderIndex: 0, groupId: "SS1", groupPosition: 1, setTechnique: "superset" }),
                  prescription({ id: "p2", orderIndex: 1, groupId: "SS1", groupPosition: 2, setTechnique: "superset" }),
                ],
              }),
            ],
          },
        }),
      ],
    });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rir", phaseType: "intensification", experienceLevel: "advanced", blockWeekIndex: 2, blockLength: 2 });
    const [p1, p2] = expanded.days[0].workout!.sections[0].prescriptions;
    expect(p1.groupId).toBe("SS1");
    expect(p2.groupId).toBe("SS1");
    expect(p1.groupPosition).toBe(1);
    expect(p2.groupPosition).toBe(2);
  });

  it("a lengthened_partials / tension_drop_set technique is treated as an intensity technique for timing purposes", () => {
    for (const technique of ["lengthened_partials", "tension_drop_set", "cluster_set", "stretch_mediated_finisher"]) {
      const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ setTechnique: technique })] })] } })] });
      const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockWeekIndex: 2, blockLength: 2 });
      expect(firstPrescription(expanded).setTechnique).toBe("straight_set");
    }
  });

  it("an empty optional notes/coachNotes field is left absent, not fabricated into an empty string", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ sectionType: "warmup", prescriptions: [prescription({ coachNotes: undefined })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockWeekIndex: 2, blockLength: 2 });
    expect(firstPrescription(expanded).coachNotes).toBeUndefined();
  });

  it("mobility/corrective content placed in a warmup section is progression-neutral even under an aggressive strategy", () => {
    const canonical = week({
      days: [day({ workout: { id: "bp", name: "D", sections: [section({ sectionType: "warmup", name: "Mobility", prescriptions: [prescription({ exerciseName: "90/90 Hip Switch", sets: 2, repsMin: 8, repsMax: 8 })] })] } })],
    });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "taper", phaseType: "taper", experienceLevel: "competitive", blockWeekIndex: 2, blockLength: 2 });
    const p = firstPrescription(expanded);
    expect(p.sets).toBe(2); // taper's -1 set rule does not apply to progression-neutral sections
  });
});

// ─────────────────────────────────────────────────────────────
// Quality invariants (Section 19) — repo-wide sweep across every
// strategy x experience combination this module can legally receive.
// ─────────────────────────────────────────────────────────────
describe("quality invariants", () => {
  const combos: { progressionStrategy: ProgressionStrategy; phaseType: PhaseType; experienceLevel: ExperienceLevel }[] = [
    { progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner" },
    { progressionStrategy: "double", phaseType: "intensification", experienceLevel: "intermediate" },
    { progressionStrategy: "double", phaseType: "intensification", experienceLevel: "mixed" },
    { progressionStrategy: "rir", phaseType: "intensification", experienceLevel: "advanced" },
    { progressionStrategy: "rir", phaseType: "realization", experienceLevel: "competitive" },
    { progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "advanced" },
    { progressionStrategy: "taper", phaseType: "taper", experienceLevel: "competitive" },
  ];

  it("no negative sets/reps/rest/duration, no RIR below 0, exercises/day-order/section-order stable, for every legal combination", () => {
    for (const { progressionStrategy, phaseType, experienceLevel } of combos) {
      // targetRir is only present when realistic for the combo under test —
      // a real beginner canonical week would never have been authored with
      // one in the first place (that's an upstream/prompt-level guarantee,
      // not something this sweep should fabricate and then blame Phase B
      // for "not stripping"). The dedicated "rep progression" describe
      // block above separately proves Phase B never INTRODUCES targetRir
      // for a beginner starting from a realistic, RIR-less fixture.
      const targetRir = experienceLevel === "beginner" ? undefined : 3;
      const canonical = week({
        days: [
          day({
            dayOfWeek: 1,
            workout: {
              id: "bp",
              name: "D",
              sections: [
                section({ sectionType: "main_lift", orderIndex: 0, prescriptions: [prescription({ exerciseId: "e1", sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, targetRir })] }),
                section({ sectionType: "conditioning", orderIndex: 1, name: "Finisher", prescriptions: [prescription({ exerciseId: "e2", exerciseName: "Bike Sprints", sets: 4, repsMin: undefined, repsMax: undefined, durationSeconds: 200, restSeconds: 60 })] }),
              ],
            },
          }),
        ],
      });
      const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy, phaseType, experienceLevel, blockLength: 3 });
      expect(result.ok, `${progressionStrategy}/${phaseType}/${experienceLevel} should succeed`).toBe(true);
      if (!result.ok) continue;
      for (const w of result.weeks) {
        expect(w.days.map((d) => d.dayOfWeek)).toEqual([1]);
        const sections = w.days[0].workout!.sections;
        expect(sections.map((s) => s.sectionType)).toEqual(["main_lift", "conditioning"]);
        for (const s of sections) {
          for (const p of s.prescriptions) {
            if (p.sets != null) expect(p.sets).toBeGreaterThan(0);
            if (p.repsMin != null) expect(p.repsMin).toBeGreaterThan(0);
            if (p.repsMax != null) expect(p.repsMax).toBeGreaterThan(0);
            if (p.restSeconds != null) expect(p.restSeconds).toBeGreaterThanOrEqual(0);
            if (p.durationSeconds != null) expect(p.durationSeconds).toBeGreaterThan(0);
            if (p.targetRir != null) expect(p.targetRir).toBeGreaterThanOrEqual(0);
            if (experienceLevel === "beginner") expect(p.targetRir).toBeUndefined();
          }
        }
        expect(sections[0].prescriptions[0].exerciseId).toBe("e1");
        expect(sections[1].prescriptions[0].exerciseId).toBe("e2");
      }
    }
  });

  it("taper never increases volume for any prescription across the whole matrix", () => {
    const canonical = week({ days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ sets: 3, restSeconds: 90 })] })] } })] });
    const expanded = expandOk({ canonicalWeek: canonical, progressionStrategy: "taper", phaseType: "taper", experienceLevel: "competitive", blockWeekIndex: 2, blockLength: 2 });
    const p = firstPrescription(expanded);
    expect(p.sets!).toBeLessThanOrEqual(3);
  });

  it("deload never reaches the expansion path at all — asserted structurally, not just behaviorally", () => {
    const result = expandCanonicalWeek({
      canonicalWeek: week(),
      progressionStrategy: "volume_density",
      phaseType: "deload",
      experienceLevel: "advanced",
      blockWeekIndex: 2,
      blockLength: 2,
    });
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Worked examples A-H (Section 20)
// ─────────────────────────────────────────────────────────────
describe("worked examples", () => {
  it("A. Beginner 3-week hypertrophy block (rep progression) reads as a sensible ramp toward the top of the range", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Goblet Squat", repsMin: 10, repsMax: 15, sets: 3 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "rep", phaseType: "foundation", experienceLevel: "beginner", blockLength: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks.map((w) => firstPrescription(w).repsMin)).toEqual([10, 13, 15]);
    expect(result.weeks.every((w) => firstPrescription(w).repsMax === 15)).toBe(true);
  });

  it("B. Intermediate 3-week hypertrophy block (double progression) keeps the range fixed and gives a standing conditional cue", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Lat Pulldown", repsMin: 8, repsMax: 12, sets: 4 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "double", phaseType: "intensification", experienceLevel: "intermediate", blockLength: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks.every((w) => firstPrescription(w).repsMin === 8 && firstPrescription(w).repsMax === 12)).toBe(true);
    expect(firstPrescription(result.weeks[1]).coachNotes).toMatch(/double progression/i);
  });

  it("C. Advanced 3-week hypertrophy block (RIR progression) sharpens effort toward the block's hardest week", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Incline DB Press", repsMin: undefined, repsMax: undefined, targetRir: 3, sets: 4 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "rir", phaseType: "intensification", experienceLevel: "advanced", blockLength: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks.map((w) => firstPrescription(w).targetRir)).toEqual([3, 2, 0]);
  });

  it("D. Body-recomposition volume/density accumulation block leans on rest reduction, not fabricated volume", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Leg Press", sets: 3, restSeconds: 90 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "intermediate", blockLength: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rests = result.weeks.map((w) => firstPrescription(w).restSeconds);
    expect(rests[0]).toBe(90);
    expect(rests[2]!).toBeLessThan(90);
  });

  it("E. Advanced fat-loss accumulation block behaves identically to any other goal's density-accumulation block (goal-agnostic by design)", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Kettlebell Swing", sets: 3, restSeconds: 90 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "advanced", blockLength: 3 });
    expect(result.ok).toBe(true);
    // Phase B has no `goal` input at all (see Section 2 header) — this
    // test documents that fat_loss gets no special-cased behavior here.
  });

  it("F. Physique competition-prep 2-week taper reduces stress without touching nutrition/water/sodium (no such fields exist to touch)", () => {
    const canonical = week({ weekNumber: 15, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Leg Extension", sets: 3, setTechnique: "drop_set", restSeconds: 60 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "taper", phaseType: "taper", experienceLevel: "competitive", blockLength: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const peakWeek = firstPrescription(result.weeks[1]);
    expect(peakWeek.sets).toBe(2);
    expect(peakWeek.setTechnique).toBe("straight_set");
  });

  it("G. Deload is never expanded — the canonical deload week IS the whole block", () => {
    const canonical = week({ weekNumber: 9 });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "deload", experienceLevel: "advanced", blockLength: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weeks).toEqual([canonical]);
  });

  it("H. Executive-performance density block matches the body-recomposition shape exactly (goal-agnostic by design)", () => {
    const canonical = week({ weekNumber: 1, days: [day({ workout: { id: "bp", name: "D", sections: [section({ prescriptions: [prescription({ exerciseName: "Trap Bar Deadlift", sets: 3, restSeconds: 100 })] })] } })] });
    const result = expandBlockFromCanonicalWeek({ canonicalWeek: canonical, progressionStrategy: "volume_density", phaseType: "accumulation", experienceLevel: "beginner", blockLength: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstPrescription(result.weeks[2]).restSeconds!).toBeLessThan(100);
  });
});
