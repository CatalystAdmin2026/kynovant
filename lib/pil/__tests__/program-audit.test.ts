import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EnrichedProgramWeek, VolumeAnalysis, FrequencyAnalysis } from "../types";

// ─── Mock the DB-dependent modules ───────────────────────────────────────────
// program-audit.ts is the orchestrator — we test its pure aggregation logic
// by mocking all DB-level calls and testing invariants.

vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/schema", () => ({
  workoutTemplates: { id: "id", name: "name", status: "status" },
}));
vi.mock("@/lib/db/schema-program", () => ({
  programWeeks: { id: "id", programTemplateId: "program_template_id", weekNumber: "week_number", label: "label" },
  programWeekDays: { programWeekId: "program_week_id", dayOfWeek: "day_of_week", workoutTemplateId: "workout_template_id" },
}));

// ─── Mock the pure sub-modules (we test them independently) ──────────────────
vi.mock("../enrichment", () => ({ getBlueprintEnriched: vi.fn() }));
vi.mock("../modules/program-structure", () => ({
  validateProgramStructureFromData: vi.fn(),
}));
vi.mock("../modules/volume", () => ({ analyzeVolume: vi.fn() }));
vi.mock("../modules/frequency", () => ({ analyzeFrequency: vi.fn() }));
vi.mock("../modules/recovery", () => ({ analyzeRecovery: vi.fn() }));

import { getDb } from "@/lib/db/client";
import { getBlueprintEnriched } from "../enrichment";
import { validateProgramStructureFromData } from "../modules/program-structure";
import { analyzeVolume } from "../modules/volume";
import { analyzeFrequency } from "../modules/frequency";
import { analyzeRecovery } from "../modules/recovery";
import { getProgramAudit } from "../program-audit";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROG_ID = "prog-1";

function emptyStructureResult() {
  return { valid: true, weekCount: 2, errors: [], warnings: [] };
}

function emptyVolumeAnalysis(): VolumeAnalysis {
  return {
    byMuscle: [],
    byPattern: [],
    totalSets: 0,
    findings: [],
    prescriptionsWithUnknownMuscle: [],
  } as unknown as VolumeAnalysis;
}

function emptyFreqResult(weekNumber: number): FrequencyAnalysis {
  return { weekNumber, totalTrainingDays: 0, byMuscle: [], byPattern: [], findings: [] };
}

function emptyRecoveryResult() {
  return { byMuscle: [], findings: [] };
}

// Build a simple mock Drizzle chain
function makeMockDb(
  rawWeeks: object[],
  rawDays: object[],
  templates: object[],
) {
  let selectCallCount = 0;
  const datasets = [rawWeeks, rawDays, templates];

  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  chain.where.mockImplementation(() => {
    const data = datasets[selectCallCount] ?? [];
    selectCallCount++;
    return Promise.resolve(data);
  });

  return chain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getProgramAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (validateProgramStructureFromData as ReturnType<typeof vi.fn>).mockReturnValue(
      emptyStructureResult(),
    );
    (analyzeVolume as ReturnType<typeof vi.fn>).mockReturnValue(emptyVolumeAnalysis());
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([
      emptyFreqResult(1),
      emptyFreqResult(2),
    ]);
    (analyzeRecovery as ReturnType<typeof vi.fn>).mockReturnValue(emptyRecoveryResult());
  });

  it("enriches each distinct blueprint exactly once even when reused across multiple days", async () => {
    // Two weeks, two days each, same blueprint reused on all 4 days
    const db = makeMockDb(
      [
        { id: "week-1", weekNumber: 1, label: null },
        { id: "week-2", weekNumber: 2, label: null },
      ],
      [
        { programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-shared" },
        { programWeekId: "week-1", dayOfWeek: 3, workoutTemplateId: "tmpl-shared" },
        { programWeekId: "week-2", dayOfWeek: 1, workoutTemplateId: "tmpl-shared" },
        { programWeekId: "week-2", dayOfWeek: 3, workoutTemplateId: "tmpl-shared" },
      ],
      [{ id: "tmpl-shared", name: "Full Body A", status: "active" }],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await getProgramAudit(PROG_ID);

    // enrichment should have been called exactly once despite 4 occurrences
    expect(getBlueprintEnriched).toHaveBeenCalledTimes(1);
    expect(getBlueprintEnriched).toHaveBeenCalledWith("tmpl-shared", undefined);
  });

  it("enriches N distinct blueprints when N different blueprints are used", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [
        { programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-a" },
        { programWeekId: "week-1", dayOfWeek: 3, workoutTemplateId: "tmpl-b" },
        { programWeekId: "week-1", dayOfWeek: 5, workoutTemplateId: "tmpl-c" },
      ],
      [
        { id: "tmpl-a", name: "Push", status: "active" },
        { id: "tmpl-b", name: "Pull", status: "active" },
        { id: "tmpl-c", name: "Legs", status: "active" },
      ],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    await getProgramAudit(PROG_ID);

    expect(getBlueprintEnriched).toHaveBeenCalledTimes(3);
  });

  it("skips enrichment for archived blueprints", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [
        { programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-active" },
        { programWeekId: "week-1", dayOfWeek: 3, workoutTemplateId: "tmpl-archived" },
      ],
      [
        { id: "tmpl-active", name: "Active Blueprint", status: "active" },
        { id: "tmpl-archived", name: "Old Blueprint", status: "archived" },
      ],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    await getProgramAudit(PROG_ID);

    // Only the active blueprint should be enriched
    expect(getBlueprintEnriched).toHaveBeenCalledTimes(1);
    expect(getBlueprintEnriched).toHaveBeenCalledWith("tmpl-active", undefined);
  });

  it("returns distinctBlueprintsAudited = number of blueprints successfully enriched", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [
        { programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-a" },
        { programWeekId: "week-1", dayOfWeek: 3, workoutTemplateId: "tmpl-b" },
      ],
      [
        { id: "tmpl-a", name: "Blueprint A", status: "active" },
        { id: "tmpl-b", name: "Blueprint B", status: "active" },
      ],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    const result = await getProgramAudit(PROG_ID);
    expect(result.distinctBlueprintsAudited).toBe(2);
  });

  it("handles enrichment failure gracefully — blueprint excluded without crashing", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [{ programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-bad" }],
      [{ id: "tmpl-bad", name: "Broken Blueprint", status: "active" }],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("enrichment failed"),
    );
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    const result = await getProgramAudit(PROG_ID);
    expect(result.distinctBlueprintsAudited).toBe(0);
    // Should not throw — result is returned normally
    expect(result.programTemplateId).toBe(PROG_ID);
  });

  it("returns no findings for a clean, well-structured program", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [{ programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-1" }],
      [{ id: "tmpl-1", name: "Clean Blueprint", status: "active" }],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    const result = await getProgramAudit(PROG_ID);
    expect(result.allFindings).toHaveLength(0);
    expect(result.qualitySummary.dimensionStatus.structure).toBe("ok");
  });

  it("dimensionStatus.structure is has_errors when structure result is invalid", async () => {
    const db = makeMockDb(
      [],  // no weeks
      [],
      [],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (validateProgramStructureFromData as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      weekCount: 0,
      errors: [{ id: "x", code: "PROGRAM_NO_WEEKS", severity: "error", category: "program_structure", confidence: "certain", title: "No weeks", explanation: "", evidence: [], affectedEntities: [] }],
      warnings: [],
    });
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (analyzeRecovery as ReturnType<typeof vi.fn>).mockReturnValue(emptyRecoveryResult());

    const result = await getProgramAudit(PROG_ID);
    expect(result.qualitySummary.dimensionStatus.structure).toBe("has_errors");
  });

  it("passes coachId through to getBlueprintEnriched", async () => {
    const db = makeMockDb(
      [{ id: "week-1", weekNumber: 1, label: null }],
      [{ programWeekId: "week-1", dayOfWeek: 1, workoutTemplateId: "tmpl-1" }],
      [{ id: "tmpl-1", name: "Blueprint", status: "active" }],
    );
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (getBlueprintEnriched as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([emptyFreqResult(1)]);

    await getProgramAudit(PROG_ID, "coach-42");
    expect(getBlueprintEnriched).toHaveBeenCalledWith("tmpl-1", "coach-42");
  });

  it("result includes analyzedAt as a valid ISO timestamp", async () => {
    const db = makeMockDb([], [], []);
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    (analyzeFrequency as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await getProgramAudit(PROG_ID);
    expect(() => new Date(result.analyzedAt)).not.toThrow();
    expect(new Date(result.analyzedAt).toISOString()).toBe(result.analyzedAt);
  });
});
