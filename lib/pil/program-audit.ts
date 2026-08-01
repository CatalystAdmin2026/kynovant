// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Program Audit Orchestrator
//
// SERVER-ONLY. getProgramAudit() is the single entry point for
// full program-level analysis. Architecture:
//
//  1. M15 — validate structure (week gaps, empty weeks, archived refs)
//  2. Fetch all weeks + days from DB
//  3. Enrich each DISTINCT blueprint ONCE (critical: not per occurrence)
//  4. M03 — volume analysis per blueprint
//  5. M16 — frequency analysis per week (pure, uses M03 output)
//  6. M17 — recovery analysis across all weeks (pure)
//  7. Build PerMuscleWeeklyBrief (aggregation of M03 + M16 + M17)
//  8. M32 — program quality summary (aggregation)
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workoutTemplates } from "@/lib/db/schema";
import { programWeeks, programWeekDays } from "@/lib/db/schema-program";
import { getBlueprintEnriched } from "./enrichment";
import { validateProgramStructureFromData } from "./modules/program-structure";
import { analyzeVolume } from "./modules/volume";
import { analyzeFatigue } from "./modules/fatigue";
import { analyzeFrequency, type WeekInput } from "./modules/frequency";
import { analyzeRecovery } from "./modules/recovery";
import { analyzeVolumeProgression } from "./modules/volume-progression";
import { analyzeFatigueAccumulation, type FatigueWeekInput } from "./modules/fatigue-accumulation";
import { generateRecommendations } from "./recommendations";
import type {
  EnrichedProgramWeek,
  FatigueAnalysis,
  FrequencyAnalysis,
  MuscleGroup,
  PerMuscleWeekRow,
  PerMuscleWeeklyBriefData,
  PilFinding,
  PilSeverity,
  ProgramAuditResult,
  ProgramDay,
  ProgramDimensionStatus,
  ProgramQualitySummary,
  RecoverySpacingAnalysis,
  VolumeAnalysis,
} from "./types";

const SEVERITY_RANK: Record<PilSeverity, number> = {
  error: 0,
  warning: 1,
  caution: 2,
  info: 3,
};

function bySeverity(a: PilFinding, b: PilFinding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

// ─── PerMuscleWeeklyBrief builder ────────────────────────────────────────────

function buildPerMuscleWeeklyBrief(
  frequencyByWeek: FrequencyAnalysis[],
  recoveryAnalysis: RecoverySpacingAnalysis,
  distinctBlueprintsAnalyzed: number,
): PerMuscleWeeklyBriefData {
  if (frequencyByWeek.length === 0) {
    return { rows: [], weekCount: 0, distinctBlueprintsAnalyzed };
  }

  const weekCount = frequencyByWeek.length;

  // Accumulate per-muscle totals across all weeks
  const muscleAccumulator = new Map<
    MuscleGroup,
    {
      totalDirect: number;
      totalIndirect: number;
      totalSessions: number;
      trainingDays: Set<number>;
    }
  >();

  for (const weekFreq of frequencyByWeek) {
    for (const muscleData of weekFreq.byMuscle) {
      if (!muscleAccumulator.has(muscleData.muscleGroup)) {
        muscleAccumulator.set(muscleData.muscleGroup, {
          totalDirect: 0,
          totalIndirect: 0,
          totalSessions: 0,
          trainingDays: new Set(),
        });
      }
      const acc = muscleAccumulator.get(muscleData.muscleGroup)!;
      acc.totalDirect += muscleData.directSetsPerWeek;
      acc.totalIndirect += muscleData.indirectSetsPerWeek;
      acc.totalSessions += muscleData.sessionsPerWeek;
      for (const day of muscleData.trainingDays) {
        acc.trainingDays.add(day);
      }
    }
  }

  // Build recovery lookup for quick access
  const recoveryMap = new Map<
    MuscleGroup,
    { minRecoveryDays: number; status: PerMuscleWeekRow["recoveryStatus"] }
  >();
  for (const muscleRec of recoveryAnalysis.byMuscle) {
    const { minRecoveryDays } = muscleRec;
    const status: PerMuscleWeekRow["recoveryStatus"] =
      minRecoveryDays === 0 ? "same_day" : minRecoveryDays === 1 ? "consecutive" : "ok";
    recoveryMap.set(muscleRec.muscleGroup, { minRecoveryDays, status });
  }

  const rows: PerMuscleWeekRow[] = Array.from(muscleAccumulator.entries())
    .filter(([, acc]) => acc.totalDirect > 0 || acc.totalIndirect > 0)
    .map(([muscleGroup, acc]) => {
      const avgDirect = acc.totalDirect / weekCount;
      const avgIndirect = acc.totalIndirect / weekCount;
      const avgSessions = acc.totalSessions / weekCount;
      const recovery = recoveryMap.get(muscleGroup);

      return {
        muscleGroup,
        directSetsPerWeek: Math.round(avgDirect * 10) / 10,
        indirectSetsPerWeek: Math.round(avgIndirect * 10) / 10,
        totalSetsPerWeek: Math.round((avgDirect + avgIndirect) * 10) / 10,
        sessionsPerWeek: Math.round(avgSessions * 10) / 10,
        trainingDays: Array.from(acc.trainingDays).sort((a, b) => a - b),
        minRecoveryDays: recovery?.minRecoveryDays ?? null,
        recoveryStatus: recovery?.status ?? "ok",
        isPartialData: false,
      };
    })
    .sort((a, b) => b.directSetsPerWeek - a.directSetsPerWeek);

  return { rows, weekCount, distinctBlueprintsAnalyzed };
}

// ─── Dimension status derivation ─────────────────────────────────────────────

function deriveProgramDimensionStatus(
  allFindings: PilFinding[],
  structureHasErrors: boolean,
): ProgramDimensionStatus {
  const codes = new Set(allFindings.map((f) => f.code));

  const structure: ProgramDimensionStatus["structure"] = structureHasErrors
    ? "has_errors"
    : "ok";

  const frequency: ProgramDimensionStatus["frequency"] = codes.has("FREQUENCY_HIGH")
    ? "high"
    : "appropriate";

  const recovery: ProgramDimensionStatus["recovery"] =
    codes.has("RECOVERY_SAME_DAY") || codes.has("RECOVERY_CONSECUTIVE")
      ? "insufficient"
      : "adequate";

  return { structure, frequency, recovery };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function getProgramAudit(
  programTemplateId: string,
  coachId?: string,
): Promise<ProgramAuditResult> {
  const db = await getDb();

  // ── 1. Fetch program structure from DB ──────────────────────────────────────

  const rawWeeks = await db
    .select({
      id: programWeeks.id,
      weekNumber: programWeeks.weekNumber,
      label: programWeeks.label,
    })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programTemplateId));

  const weekIds = rawWeeks.map((w) => w.id);
  const rawDays =
    weekIds.length > 0
      ? await db
          .select({
            programWeekId: programWeekDays.programWeekId,
            dayOfWeek: programWeekDays.dayOfWeek,
            workoutTemplateId: programWeekDays.workoutTemplateId,
          })
          .from(programWeekDays)
          .where(inArray(programWeekDays.programWeekId, weekIds))
      : [];

  // Collect all non-null templateIds; check status in one query
  const distinctTemplateIds = [
    ...new Set(
      rawDays
        .map((d) => d.workoutTemplateId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const templateStatusMap = new Map<string, { name: string; status: string }>();
  if (distinctTemplateIds.length > 0) {
    const templates = await db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        status: workoutTemplates.status,
      })
      .from(workoutTemplates)
      .where(inArray(workoutTemplates.id, distinctTemplateIds));
    for (const t of templates) {
      templateStatusMap.set(t.id, { name: t.name, status: t.status });
    }
  }

  // Build EnrichedProgramWeek[]
  const daysByWeekId = new Map<string, ProgramDay[]>();
  for (const d of rawDays) {
    if (!daysByWeekId.has(d.programWeekId)) {
      daysByWeekId.set(d.programWeekId, []);
    }
    const tmpl = d.workoutTemplateId ? templateStatusMap.get(d.workoutTemplateId) : null;
    daysByWeekId.get(d.programWeekId)!.push({
      dayOfWeek: d.dayOfWeek,
      workoutTemplateId: d.workoutTemplateId,
      templateName: tmpl?.name ?? null,
      templateStatus: tmpl?.status ?? null,
    });
  }

  const enrichedWeeks: EnrichedProgramWeek[] = rawWeeks
    .map((w) => ({
      weekId: w.id,
      weekNumber: w.weekNumber,
      label: w.label,
      days: daysByWeekId.get(w.id) ?? [],
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber);

  // ── 2. M15 — Structure validation (pure, uses in-memory data) ──────────────

  const structureResult = validateProgramStructureFromData(enrichedWeeks);

  // ── 3. Enrich each DISTINCT blueprint once ─────────────────────────────────

  const blueprintMap = new Map<string, VolumeAnalysis>();
  const fatigueMap = new Map<string, FatigueAnalysis>();

  // Only enrich active templates (archived ones are flagged by M15)
  const activeTemplateIds = distinctTemplateIds.filter((id) => {
    const t = templateStatusMap.get(id);
    return t?.status === "active";
  });

  await Promise.all(
    activeTemplateIds.map(async (templateId) => {
      try {
        const blueprint = await getBlueprintEnriched(templateId, coachId);
        blueprintMap.set(templateId, analyzeVolume(blueprint));
        // Fatigue reuses the same enriched blueprint fetched above — no extra query.
        fatigueMap.set(templateId, analyzeFatigue(blueprint));
      } catch {
        // blueprint not found or enrichment failed — treat as no data
      }
    }),
  );

  // ── 4. Build frequency input per week ──────────────────────────────────────

  const weekInputs: WeekInput[] = enrichedWeeks.map((week) => ({
    weekNumber: week.weekNumber,
    days: week.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      volumeAnalysis:
        day.workoutTemplateId && blueprintMap.has(day.workoutTemplateId)
          ? blueprintMap.get(day.workoutTemplateId)!
          : null,
    })),
  }));

  // ── 5. M16 — Frequency analysis per week ───────────────────────────────────

  const frequencyByWeek = analyzeFrequency(weekInputs);

  // ── 6. M17 — Recovery analysis across all weeks ────────────────────────────

  const recoveryAnalysis = analyzeRecovery(frequencyByWeek);

  // ── 6b. M18 — Weekly volume progression + undertrained/overreached status ──

  const volumeProgressionAnalysis = analyzeVolumeProgression(frequencyByWeek);

  // ── 6c. M19 — Multi-week fatigue accumulation ───────────────────────────────

  const fatigueWeekInputs: FatigueWeekInput[] = enrichedWeeks.map((week) => ({
    weekNumber: week.weekNumber,
    weekLabel: week.label,
    days: week.days.map((day) => ({
      fatigueAnalysis:
        day.workoutTemplateId && fatigueMap.has(day.workoutTemplateId)
          ? fatigueMap.get(day.workoutTemplateId)!
          : null,
    })),
  }));
  const fatigueAccumulationAnalysis = analyzeFatigueAccumulation(fatigueWeekInputs);

  // ── 7. Build PerMuscleWeeklyBrief ──────────────────────────────────────────

  const perMuscleWeeklyBrief = buildPerMuscleWeeklyBrief(
    frequencyByWeek,
    recoveryAnalysis,
    activeTemplateIds.length,
  );

  // ── 8. Aggregate all findings ──────────────────────────────────────────────

  const allFindings: PilFinding[] = [
    ...structureResult.errors,
    ...structureResult.warnings,
    ...frequencyByWeek.flatMap((f) => f.findings),
    ...recoveryAnalysis.findings,
    ...volumeProgressionAnalysis.findings,
    ...fatigueAccumulationAnalysis.findings,
  ].sort(bySeverity);

  // ── 9. Program quality summary ─────────────────────────────────────────────

  const dimensionStatus = deriveProgramDimensionStatus(
    allFindings,
    !structureResult.valid,
  );

  const qualitySummary: ProgramQualitySummary = {
    programTemplateId,
    weekCount: enrichedWeeks.length,
    dimensionStatus,
    topFindings: allFindings.slice(0, 3),
  };

  return {
    programTemplateId,
    qualitySummary,
    structureResult,
    perMuscleWeeklyBrief,
    frequencyAnalysisByWeek: frequencyByWeek,
    recoveryAnalysis,
    volumeProgressionAnalysis,
    fatigueAccumulationAnalysis,
    allFindings,
    recommendations: generateRecommendations(allFindings),
    distinctBlueprintsAudited: blueprintMap.size,
    analyzedAt: new Date().toISOString(),
  };
}
