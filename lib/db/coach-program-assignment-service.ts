// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Coach Program Assignment Service (Sprint 6.3A)
//
// SERVER-ONLY — never import from a Client Component.
//
// Handles:
//   - Listing publishable blueprints with Week 1 preview data
//   - Archiving the current active program and creating a new one
//   - Fetching the client's full program history
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, desc, asc, inArray, isNotNull, and } from "drizzle-orm";
import { getDb } from "./client";
import { programTemplates, workoutTemplates } from "./schema";
import {
  clientPrograms,
  programWeeks,
  programWeekDays,
} from "./schema-program";
import { assignProgram } from "./client-program-service";

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export interface Week1DayPreview {
  dayOfWeek: number; // 0 = Sun … 6 = Sat
  workoutName: string;
  estimatedMinutes: number | null;
}

export interface BlueprintForAssignment {
  id: string;
  name: string;
  category: string;
  experienceLevel: string;
  description: string | null;
  recommendedDaysPerWeek: number | null;
  defaultDurationWeeks: number | null;
  week1Preview: Week1DayPreview[];
  estimatedWeeklyMinutes: number | null;
}

export interface ProgramHistoryItem {
  id: string;
  programName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  assignedAt: string; // ISO string — serializable for client
  coachNotes: string | null;
  totalWeeks: number | null;
}

// ─────────────────────────────────────────────────────────────
// LIST ASSIGNABLE BLUEPRINTS
//
// Returns all published (status='active') program templates with
// a Week 1 preview so the coach can preview before assigning.
// ─────────────────────────────────────────────────────────────

export async function listAssignableBlueprints(
  coachId: string | null = null,
): Promise<BlueprintForAssignment[]> {
  const db = getDb();

  const templates = await db
    .select({
      id: programTemplates.id,
      name: programTemplates.name,
      category: programTemplates.category,
      experienceLevel: programTemplates.experienceLevel,
      description: programTemplates.description,
      recommendedDaysPerWeek: programTemplates.recommendedDaysPerWeek,
      defaultDurationWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(programTemplates)
    .where(
      and(
        eq(programTemplates.status, "active"),
        coachId === null ? undefined : eq(programTemplates.createdBy, coachId),
      ),
    )
    .orderBy(asc(programTemplates.name));

  if (templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);

  // Fetch week 1 IDs for each template
  const week1Rows = await db
    .select({
      templateId: programWeeks.programTemplateId,
      weekId: programWeeks.id,
    })
    .from(programWeeks)
    .where(
      and(
        inArray(programWeeks.programTemplateId, templateIds),
        eq(programWeeks.weekNumber, 1),
      ),
    );

  const week1Ids = week1Rows.map((w) => w.weekId);

  // Fetch training days for those week 1 rows
  const dayRows =
    week1Ids.length > 0
      ? await db
          .select({
            weekId: programWeekDays.programWeekId,
            dayOfWeek: programWeekDays.dayOfWeek,
            workoutName: workoutTemplates.name,
            estimatedMinutes: workoutTemplates.estimatedDurationMinutes,
          })
          .from(programWeekDays)
          .innerJoin(
            workoutTemplates,
            eq(programWeekDays.workoutTemplateId, workoutTemplates.id),
          )
          .where(
            and(
              inArray(programWeekDays.programWeekId, week1Ids),
              isNotNull(programWeekDays.workoutTemplateId),
            ),
          )
      : ([] as { weekId: string; dayOfWeek: number; workoutName: string; estimatedMinutes: number | null }[]);

  // Build lookup maps
  const week1ByTemplate = new Map<string, string>();
  for (const w of week1Rows) {
    week1ByTemplate.set(w.templateId, w.weekId);
  }

  const daysByWeekId = new Map<string, typeof dayRows>();
  for (const d of dayRows) {
    const list = daysByWeekId.get(d.weekId) ?? [];
    list.push(d);
    daysByWeekId.set(d.weekId, list);
  }

  return templates.map((t) => {
    const weekId = week1ByTemplate.get(t.id);
    const days = weekId ? (daysByWeekId.get(weekId) ?? []) : [];
    const sorted = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const estimatedWeeklyMinutes =
      sorted.reduce((s, d) => s + (d.estimatedMinutes ?? 0), 0) || null;

    return {
      id: t.id,
      name: t.name,
      category: t.category,
      experienceLevel: t.experienceLevel,
      description: t.description,
      recommendedDaysPerWeek: t.recommendedDaysPerWeek,
      defaultDurationWeeks: t.defaultDurationWeeks,
      week1Preview: sorted.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        workoutName: d.workoutName,
        estimatedMinutes: d.estimatedMinutes,
      })),
      estimatedWeeklyMinutes,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// GET CLIENT PROGRAM HISTORY
//
// All assignments for a client, newest first. Used to populate
// the Program History section beneath the active timeline.
// ─────────────────────────────────────────────────────────────

export async function getClientProgramHistory(
  clientId: string,
): Promise<ProgramHistoryItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: clientPrograms.id,
      programName: programTemplates.name,
      status: clientPrograms.status,
      startDate: clientPrograms.startDate,
      endDate: clientPrograms.endDate,
      assignedAt: clientPrograms.createdAt,
      coachNotes: clientPrograms.coachNotes,
      totalWeeks: programTemplates.defaultDurationWeeks,
    })
    .from(clientPrograms)
    .innerJoin(
      programTemplates,
      eq(clientPrograms.programTemplateId, programTemplates.id),
    )
    .where(eq(clientPrograms.clientId, clientId))
    .orderBy(desc(clientPrograms.createdAt));

  return rows.map((r) => ({
    id: r.id,
    programName: r.programName,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    assignedAt: r.assignedAt.toISOString(),
    coachNotes: r.coachNotes,
    totalWeeks: r.totalWeeks,
  }));
}

// ─────────────────────────────────────────────────────────────
// ARCHIVE + ASSIGN
//
// Archives any current active program (status='cancelled',
// endDate=newStartDate) then creates a new active assignment —
// both within a single transaction so a failure on the INSERT
// never leaves the client without an active program.
//
// Security: clientId must resolve to a user with role='client'.
// The server action caller is responsible for auth before invoking.
// ─────────────────────────────────────────────────────────────

export async function archiveAndAssignProgram({
  clientId,
  programTemplateId,
  startDate,
  coachNotes,
  coachId,
}: {
  clientId: string;
  programTemplateId: string;
  startDate: string;
  coachNotes?: string | null;
  /** Defense-in-depth ownership check — see AssignProgramInput.coachId. */
  coachId?: string | null;
}): Promise<{ ok: boolean; error?: string; assignmentId?: string }> {
  const result = await assignProgram({
    clientId,
    programTemplateId,
    startDate,
    coachNotes: coachNotes ?? null,
    overrideAllowMultiple: false,
    coachId,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, assignmentId: result.assignment?.id };
}
