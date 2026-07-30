// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Program Structure Validation (M15)
//
// SERVER-ONLY (the DB wrapper). The pure analysis function
// validateProgramStructureFromData() is exported separately
// for unit testing without database access.
//
// Finding codes:
//   PROGRAM_NO_WEEKS             0 weeks defined
//   PROGRAM_ALL_REST             No training days in the entire program
//   PROGRAM_WEEK_GAP             weekNumbers are not sequential
//   PROGRAM_EMPTY_WEEK           A week has no day rows
//   PROGRAM_ARCHIVED_BLUEPRINT   A day references an archived template
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workoutTemplates } from "@/lib/db/schema";
import { programWeeks, programWeekDays } from "@/lib/db/schema-program";
import type {
  EnrichedProgramWeek,
  PilFinding,
  ProgramDay,
  ProgramStructureResult,
} from "../types";

// ─── Pure analysis ────────────────────────────────────────────────────────────

export function validateProgramStructureFromData(
  weeks: EnrichedProgramWeek[],
): ProgramStructureResult {
  const errors: PilFinding[] = [];
  const warnings: PilFinding[] = [];

  // PROGRAM_NO_WEEKS
  if (weeks.length === 0) {
    errors.push({
      id: randomUUID(),
      code: "PROGRAM_NO_WEEKS",
      category: "program_structure",
      severity: "error",
      confidence: "certain",
      title: "Program has no weeks defined",
      explanation: "A program must have at least one week before it can be assigned to a client.",
      evidence: [],
      affectedEntities: [],
    });
    return { valid: false, weekCount: 0, errors, warnings };
  }

  // PROGRAM_ALL_REST
  const hasAnyTrainingDay = weeks.some((w) =>
    w.days.some((d) => d.workoutTemplateId !== null),
  );
  if (!hasAnyTrainingDay) {
    errors.push({
      id: randomUUID(),
      code: "PROGRAM_ALL_REST",
      category: "program_structure",
      severity: "error",
      confidence: "certain",
      title: "Program has no training days",
      explanation:
        "All days across all weeks are rest days. Add at least one blueprint to a training day.",
      evidence: [{ label: "Weeks checked", value: weeks.length }],
      affectedEntities: [],
    });
    return { valid: false, weekCount: weeks.length, errors, warnings };
  }

  // PROGRAM_WEEK_GAP — weekNumbers must be contiguous from 1
  const sortedNumbers = weeks.map((w) => w.weekNumber).sort((a, b) => a - b);
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i + 1) {
      const expected = i + 1;
      errors.push({
        id: randomUUID(),
        code: "PROGRAM_WEEK_GAP",
        category: "program_structure",
        severity: "error",
        confidence: "certain",
        title: `Week ${expected} is missing`,
        explanation: `Program week numbers must be contiguous (1, 2, 3, …). Week ${expected} is missing — week ${sortedNumbers[i]} follows week ${sortedNumbers[i - 1] ?? 0}.`,
        evidence: [
          { label: "Present weeks", value: sortedNumbers.join(", ") },
          { label: "Missing", value: expected },
        ],
        affectedEntities: [],
      });
      break; // report the first gap only
    }
  }

  // PROGRAM_EMPTY_WEEK
  for (const week of weeks) {
    if (week.days.length === 0) {
      warnings.push({
        id: randomUUID(),
        code: "PROGRAM_EMPTY_WEEK",
        category: "program_structure",
        severity: "warning",
        confidence: "certain",
        title: `Week ${week.weekNumber} has no days defined`,
        explanation: `Week ${week.weekNumber}${week.label ? ` (${week.label})` : ""} has no training or rest days. Add days to complete the program structure.`,
        evidence: [{ label: "Week", value: week.weekNumber }],
        affectedEntities: [
          { type: "week", id: week.weekId, name: `Week ${week.weekNumber}` },
        ],
      });
    }
  }

  // PROGRAM_ARCHIVED_BLUEPRINT
  for (const week of weeks) {
    for (const day of week.days) {
      if (
        day.workoutTemplateId !== null &&
        day.templateStatus !== null &&
        day.templateStatus !== "active"
      ) {
        errors.push({
          id: randomUUID(),
          code: "PROGRAM_ARCHIVED_BLUEPRINT",
          category: "program_structure",
          severity: "error",
          confidence: "certain",
          title: `Week ${week.weekNumber} references an archived blueprint`,
          explanation: `The blueprint "${day.templateName ?? day.workoutTemplateId}" is archived and cannot be assigned to clients. Replace it with an active blueprint.`,
          evidence: [
            { label: "Week", value: week.weekNumber },
            { label: "Day of week", value: day.dayOfWeek },
            { label: "Status", value: day.templateStatus },
          ],
          affectedEntities: [
            {
              type: "week",
              id: week.weekId,
              name: `Week ${week.weekNumber}, Day ${day.dayOfWeek}`,
            },
          ],
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    weekCount: weeks.length,
    errors,
    warnings,
  };
}

// ─── DB wrapper ───────────────────────────────────────────────────────────────

export async function validateProgramStructure(
  programTemplateId: string,
): Promise<ProgramStructureResult> {
  const db = await getDb();

  // Fetch weeks
  const rawWeeks = await db
    .select({
      id: programWeeks.id,
      weekNumber: programWeeks.weekNumber,
      label: programWeeks.label,
    })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programTemplateId));

  if (rawWeeks.length === 0) {
    return validateProgramStructureFromData([]);
  }

  const weekIds = rawWeeks.map((w) => w.id);

  // Fetch all days for all weeks
  const rawDays = await db
    .select({
      programWeekId: programWeekDays.programWeekId,
      dayOfWeek: programWeekDays.dayOfWeek,
      workoutTemplateId: programWeekDays.workoutTemplateId,
    })
    .from(programWeekDays)
    .where(inArray(programWeekDays.programWeekId, weekIds));

  // Collect all non-null templateIds to check status
  const templateIds = [
    ...new Set(
      rawDays
        .map((d) => d.workoutTemplateId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const templateStatusMap = new Map<string, { name: string; status: string }>();
  if (templateIds.length > 0) {
    const templates = await db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        status: workoutTemplates.status,
      })
      .from(workoutTemplates)
      .where(inArray(workoutTemplates.id, templateIds));
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

  const enrichedWeeks: EnrichedProgramWeek[] = rawWeeks.map((w) => ({
    weekId: w.id,
    weekNumber: w.weekNumber,
    label: w.label,
    days: daysByWeekId.get(w.id) ?? [],
  }));

  return validateProgramStructureFromData(enrichedWeeks);
}
