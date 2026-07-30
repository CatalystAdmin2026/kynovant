// ─────────────────────────────────────────────────────────────
// Catalyst OS — Program Builder Service (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
// CRUD for program_templates, program_weeks, and program_week_days.
// Validation: blueprints must pass validateWorkoutTemplate() before
// a program can be published.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, asc, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";

// Atomically increments program_templates.version for the given template ID.
// Called by every function that mutates template structure so that clients
// assigned from a previous version can be identified by future sync workflows.
async function bumpTemplateVersion(templateId: string): Promise<void> {
  const db = getDb();
  await db
    .update(programTemplates)
    .set({ version: sql`${programTemplates.version} + 1`, updatedAt: new Date() })
    .where(eq(programTemplates.id, templateId));
}

async function getTemplateIdForWeek(weekId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ programTemplateId: programWeeks.programTemplateId })
    .from(programWeeks)
    .where(eq(programWeeks.id, weekId))
    .limit(1);
  return row?.programTemplateId ?? null;
}
import {
  programTemplates,
  workoutTemplates,
  type ProgramTemplate,
  type TemplateCategory,
  type ExperienceLevel,
} from "./schema";
import {
  programWeeks,
  programWeekDays,
  clientPrograms,
  type ProgramWeek,
  type ProgramWeekDay,
} from "./schema-program";
import { validateWorkoutTemplate } from "./workout-validator";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─────────────────────────────────────────────────────────────
// SHAPES
// ─────────────────────────────────────────────────────────────

export interface ProgramDayData {
  day: ProgramWeekDay;
  workoutName: string | null;
  workoutStatus: string | null;
}

export interface ProgramWeekData {
  week: ProgramWeek;
  days: ProgramDayData[];
}

export interface ProgramContent {
  template: ProgramTemplate;
  weeks: ProgramWeekData[];
}

export interface CreateProgramInput {
  name: string;
  category: TemplateCategory;
  experienceLevel: ExperienceLevel;
  description?: string | null;
  recommendedDaysPerWeek?: number | null;
  defaultDurationWeeks?: number | null;
  createdBy?: string | null;
}

export interface UpdateProgramInput {
  name?: string;
  description?: string | null;
  category?: TemplateCategory;
  experienceLevel?: ExperienceLevel;
  recommendedDaysPerWeek?: number | null;
  defaultDurationWeeks?: number | null;
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// PROGRAM TEMPLATE CRUD
// ─────────────────────────────────────────────────────────────

export async function listProgramTemplates(): Promise<ProgramTemplate[]> {
  const db = getDb();
  return db
    .select()
    .from(programTemplates)
    .orderBy(asc(programTemplates.createdAt));
}

export async function getProgramTemplate(
  id: string,
): Promise<ProgramTemplate | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(programTemplates)
    .where(eq(programTemplates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createProgramTemplate(
  data: CreateProgramInput,
): Promise<ProgramTemplate> {
  const db = getDb();
  const slug = slugify(data.name);

  const [row] = await db
    .insert(programTemplates)
    .values({
      name: data.name,
      slug,
      category: data.category,
      experienceLevel: data.experienceLevel,
      description: data.description ?? null,
      recommendedDaysPerWeek: data.recommendedDaysPerWeek ?? null,
      defaultDurationWeeks: data.defaultDurationWeeks ?? null,
      status: "draft",
      version: 1,
      createdBy: data.createdBy ?? null,
    })
    .returning();

  // Auto-scaffold weeks if defaultDurationWeeks is set
  if (data.defaultDurationWeeks && data.defaultDurationWeeks > 0) {
    const weekValues = Array.from(
      { length: data.defaultDurationWeeks },
      (_, i) => ({
        programTemplateId: row.id,
        weekNumber: i + 1,
        label: `Week ${i + 1}`,
      }),
    );
    await db.insert(programWeeks).values(weekValues);
  }

  return row;
}

export async function updateProgramTemplate(
  id: string,
  data: UpdateProgramInput,
): Promise<ProgramTemplate> {
  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  // Track whether any structural content is changing (not just status).
  // Version is only bumped for content changes so that publish/unpublish
  // transitions don't generate spurious "template updated" signals.
  let structuralChange = false;

  if (data.name !== undefined) {
    updates.name = data.name;
    updates.slug = slugify(data.name);
    structuralChange = true;
  }
  if (data.description !== undefined) {
    updates.description = data.description;
    structuralChange = true;
  }
  if (data.category !== undefined) {
    updates.category = data.category;
    structuralChange = true;
  }
  if (data.experienceLevel !== undefined) {
    updates.experienceLevel = data.experienceLevel;
    structuralChange = true;
  }
  if (data.recommendedDaysPerWeek !== undefined) {
    updates.recommendedDaysPerWeek = data.recommendedDaysPerWeek;
    structuralChange = true;
  }
  if (data.defaultDurationWeeks !== undefined) {
    updates.defaultDurationWeeks = data.defaultDurationWeeks;
    structuralChange = true;
  }
  if (data.status !== undefined) updates.status = data.status;

  if (structuralChange) {
    updates.version = sql`${programTemplates.version} + 1`;
  }

  const [row] = await db
    .update(programTemplates)
    .set(updates)
    .where(eq(programTemplates.id, id))
    .returning();

  return row;
}

export async function deleteProgramTemplate(id: string): Promise<void> {
  const db = getDb();

  // Refuse to delete if any client assignment references this template.
  // The FK RESTRICT would catch this at the DB level but with an opaque error;
  // this gives a clean, actionable message before touching anything.
  const [assigned] = await db
    .select({ id: clientPrograms.id })
    .from(clientPrograms)
    .where(eq(clientPrograms.programTemplateId, id))
    .limit(1);

  if (assigned) {
    throw new Error(
      "This program has client assignments and cannot be deleted. Archive it instead.",
    );
  }

  // Delete days → weeks first (FK constraints)
  const weeks = await db
    .select({ id: programWeeks.id })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, id));

  if (weeks.length > 0) {
    const weekIds = weeks.map((w) => w.id);
    await db
      .delete(programWeekDays)
      .where(inArray(programWeekDays.programWeekId, weekIds));
    await db
      .delete(programWeeks)
      .where(eq(programWeeks.programTemplateId, id));
  }

  await db.delete(programTemplates).where(eq(programTemplates.id, id));
}

// ─────────────────────────────────────────────────────────────
// PUBLISH VALIDATION
//
// Before setting status = 'active', every workout blueprint
// assigned to the program must pass validateWorkoutTemplate().
// Returns { valid: true } or { valid: false, errors: string[] }.
// ─────────────────────────────────────────────────────────────

export interface PublishValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateProgramForPublish(
  programId: string,
): Promise<PublishValidationResult> {
  const db = getDb();
  const errors: string[] = [];

  // Collect all unique workout template IDs across all week days
  const weeks = await db
    .select({ id: programWeeks.id })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programId));

  if (weeks.length === 0) {
    return { valid: false, errors: ["Program has no weeks defined."] };
  }

  const weekIds = weeks.map((w) => w.id);
  const days = await db
    .select({
      workoutTemplateId: programWeekDays.workoutTemplateId,
    })
    .from(programWeekDays)
    .where(inArray(programWeekDays.programWeekId, weekIds));

  const templateIds = [
    ...new Set(
      days
        .map((d) => d.workoutTemplateId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (templateIds.length === 0) {
    return {
      valid: false,
      errors: ["Program has no workout blueprints assigned to any days."],
    };
  }

  // Check each blueprint: must be status='active' and pass validation
  const templates = await db
    .select({ id: workoutTemplates.id, name: workoutTemplates.name, status: workoutTemplates.status })
    .from(workoutTemplates)
    .where(inArray(workoutTemplates.id, templateIds));

  for (const t of templates) {
    if (t.status !== "active") {
      errors.push(
        `Blueprint "${t.name}" is not published (status: ${t.status}). Publish it before adding to this program.`,
      );
      continue;
    }
    const result = await validateWorkoutTemplate(t.id);
    if (!result.valid) {
      errors.push(
        `Blueprint "${t.name}" failed validation: ${result.errors.join("; ")}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function publishProgram(id: string): Promise<{
  ok: boolean;
  template?: ProgramTemplate;
  errors?: string[];
}> {
  const validation = await validateProgramForPublish(id);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const template = await updateProgramTemplate(id, { status: "active" });
  return { ok: true, template };
}

// ─────────────────────────────────────────────────────────────
// WEEK CRUD
// ─────────────────────────────────────────────────────────────

export async function addProgramWeek(
  programId: string,
  data: { label?: string; notes?: string },
): Promise<ProgramWeek> {
  const db = getDb();

  const rows = await db
    .select({ n: programWeeks.weekNumber })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programId))
    .orderBy(sql`${programWeeks.weekNumber} DESC`)
    .limit(1);

  const nextWeek = (rows[0]?.n ?? 0) + 1;

  const [row] = await db
    .insert(programWeeks)
    .values({
      programTemplateId: programId,
      weekNumber: nextWeek,
      label: data.label ?? `Week ${nextWeek}`,
      notes: data.notes ?? null,
    })
    .returning();

  await bumpTemplateVersion(programId);
  return row;
}

export async function updateProgramWeek(
  weekId: string,
  data: { label?: string; notes?: string | null },
): Promise<ProgramWeek> {
  const db = getDb();
  const [row] = await db
    .update(programWeeks)
    .set({
      label: data.label,
      notes: data.notes,
      updatedAt: new Date(),
    })
    .where(eq(programWeeks.id, weekId))
    .returning();

  const templateId = await getTemplateIdForWeek(weekId);
  if (templateId) await bumpTemplateVersion(templateId);
  return row;
}

export async function deleteProgramWeek(weekId: string): Promise<void> {
  const db = getDb();
  const templateId = await getTemplateIdForWeek(weekId);
  await db
    .delete(programWeekDays)
    .where(eq(programWeekDays.programWeekId, weekId));
  await db.delete(programWeeks).where(eq(programWeeks.id, weekId));
  if (templateId) await bumpTemplateVersion(templateId);
}

// ─────────────────────────────────────────────────────────────
// DAY SLOT CRUD
// ─────────────────────────────────────────────────────────────

export async function setDayWorkout(
  weekId: string,
  dayOfWeek: number,
  workoutTemplateId: string | null,
  label?: string | null,
  notes?: string | null,
): Promise<ProgramWeekDay> {
  const db = getDb();

  // Upsert: if row exists for (weekId, dayOfWeek) update it, else insert
  const existing = await db
    .select()
    .from(programWeekDays)
    .where(
      sql`${programWeekDays.programWeekId} = ${weekId} AND ${programWeekDays.dayOfWeek} = ${dayOfWeek}`,
    )
    .limit(1);

  let row: ProgramWeekDay;
  if (existing[0]) {
    [row] = await db
      .update(programWeekDays)
      .set({
        workoutTemplateId,
        label: label ?? null,
        notes: notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(programWeekDays.id, existing[0].id))
      .returning();
  } else {
    [row] = await db
      .insert(programWeekDays)
      .values({
        programWeekId: weekId,
        dayOfWeek,
        workoutTemplateId,
        label: label ?? null,
        notes: notes ?? null,
      })
      .returning();
  }

  const templateId = await getTemplateIdForWeek(weekId);
  if (templateId) await bumpTemplateVersion(templateId);
  return row;
}

export async function clearDayWorkout(weekId: string, dayOfWeek: number): Promise<void> {
  const db = getDb();
  const templateId = await getTemplateIdForWeek(weekId);
  await db
    .delete(programWeekDays)
    .where(
      sql`${programWeekDays.programWeekId} = ${weekId} AND ${programWeekDays.dayOfWeek} = ${dayOfWeek}`,
    );
  if (templateId) await bumpTemplateVersion(templateId);
}

// ─────────────────────────────────────────────────────────────
// FULL PROGRAM CONTENT
// ─────────────────────────────────────────────────────────────

export async function getProgramContent(
  programId: string,
): Promise<ProgramContent | null> {
  const db = getDb();

  const [template] = await db
    .select()
    .from(programTemplates)
    .where(eq(programTemplates.id, programId))
    .limit(1);

  if (!template) return null;

  const weeks = await db
    .select()
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programId))
    .orderBy(asc(programWeeks.weekNumber));

  if (weeks.length === 0) {
    return { template, weeks: [] };
  }

  const weekIds = weeks.map((w) => w.id);
  const days = await db
    .select({
      day: programWeekDays,
      workoutName: workoutTemplates.name,
      workoutStatus: workoutTemplates.status,
    })
    .from(programWeekDays)
    .leftJoin(
      workoutTemplates,
      eq(programWeekDays.workoutTemplateId, workoutTemplates.id),
    )
    .where(inArray(programWeekDays.programWeekId, weekIds));

  const daysByWeek = new Map<string, ProgramDayData[]>();
  for (const { day, workoutName, workoutStatus } of days) {
    const list = daysByWeek.get(day.programWeekId) ?? [];
    list.push({ day, workoutName, workoutStatus });
    daysByWeek.set(day.programWeekId, list);
  }

  const weekData: ProgramWeekData[] = weeks.map((week) => ({
    week,
    days: (daysByWeek.get(week.id) ?? []).sort(
      (a, b) => a.day.dayOfWeek - b.day.dayOfWeek,
    ),
  }));

  return { template, weeks: weekData };
}

// ─────────────────────────────────────────────────────────────
// CLONE
//
// Deep-copies a program template into a new draft. Preserves the
// entire week/day structure. The clone's name gets " (Copy)"
// appended. parentTemplateId points back to the original for
// lineage tracking. Used by both the coach UI and future AI
// generator (which clones a base template before populating it).
// ─────────────────────────────────────────────────────────────

export async function cloneProgramTemplate(
  sourceId: string,
  coachId: string | null = null,
): Promise<ProgramTemplate> {
  const db = getDb();

  const [source] = await db
    .select()
    .from(programTemplates)
    .where(eq(programTemplates.id, sourceId))
    .limit(1);

  if (!source) throw new Error(`Program template ${sourceId} not found`);

  const baseName = source.name.replace(/ \(Copy\)(\s*\d+)?$/, "");
  const cloneName = `${baseName} (Copy)`;
  const cloneSlug = slugify(cloneName) + "-" + Date.now().toString(36);

  const [clone] = await db
    .insert(programTemplates)
    .values({
      name: cloneName,
      slug: cloneSlug,
      category: source.category,
      experienceLevel: source.experienceLevel,
      description: source.description,
      recommendedDaysPerWeek: source.recommendedDaysPerWeek,
      defaultDurationWeeks: source.defaultDurationWeeks,
      status: "draft",
      version: 1,
      createdBy: coachId,
      parentTemplateId: sourceId,
    })
    .returning();

  const sourceWeeks = await db
    .select()
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, sourceId))
    .orderBy(asc(programWeeks.weekNumber));

  for (const week of sourceWeeks) {
    const [newWeek] = await db
      .insert(programWeeks)
      .values({
        programTemplateId: clone.id,
        weekNumber: week.weekNumber,
        label: week.label,
        notes: week.notes,
      })
      .returning();

    const sourceDays = await db
      .select()
      .from(programWeekDays)
      .where(eq(programWeekDays.programWeekId, week.id));

    if (sourceDays.length > 0) {
      await db.insert(programWeekDays).values(
        sourceDays.map((d) => ({
          programWeekId: newWeek.id,
          dayOfWeek: d.dayOfWeek,
          workoutTemplateId: d.workoutTemplateId,
          label: d.label,
          notes: d.notes,
        })),
      );
    }
  }

  return clone;
}

// ─────────────────────────────────────────────────────────────
// COPY WEEK
//
// Appends a duplicate of weekId at the end of the program.
// Copies all day-slot assignments. Used by coaches to repeat
// a training week pattern without manually re-assigning each day.
// ─────────────────────────────────────────────────────────────

export async function copyProgramWeek(
  weekId: string,
): Promise<ProgramWeek> {
  const db = getDb();

  const templateId = await getTemplateIdForWeek(weekId);
  if (!templateId) throw new Error(`Week ${weekId} not found`);

  const [sourceWeek] = await db
    .select()
    .from(programWeeks)
    .where(eq(programWeeks.id, weekId))
    .limit(1);

  if (!sourceWeek) throw new Error(`Week ${weekId} not found`);

  const [lastWeek] = await db
    .select({ n: programWeeks.weekNumber })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, templateId))
    .orderBy(sql`${programWeeks.weekNumber} DESC`)
    .limit(1);

  const nextNumber = (lastWeek?.n ?? 0) + 1;

  const [newWeek] = await db
    .insert(programWeeks)
    .values({
      programTemplateId: templateId,
      weekNumber: nextNumber,
      label: sourceWeek.label ? `${sourceWeek.label} (Copy)` : `Week ${nextNumber}`,
      notes: sourceWeek.notes,
    })
    .returning();

  const sourceDays = await db
    .select()
    .from(programWeekDays)
    .where(eq(programWeekDays.programWeekId, weekId));

  if (sourceDays.length > 0) {
    await db.insert(programWeekDays).values(
      sourceDays.map((d) => ({
        programWeekId: newWeek.id,
        dayOfWeek: d.dayOfWeek,
        workoutTemplateId: d.workoutTemplateId,
        label: d.label,
        notes: d.notes,
      })),
    );
  }

  await bumpTemplateVersion(templateId);
  return newWeek;
}

// ─────────────────────────────────────────────────────────────
// IMPORT SPEC  (AI seam)
//
// Accepts a declarative program spec and atomically applies it.
// When clearExisting=true, wipes the current week/day structure
// before writing. Human coach builds the same structure
// incrementally; AI generator submits it in one call. The
// on-disk data shape is identical — no special handling needed.
// ─────────────────────────────────────────────────────────────

export interface ProgramSpecDay {
  dayOfWeek: number;
  workoutTemplateId: string | null;
  label?: string | null;
  notes?: string | null;
}

export interface ProgramSpecWeek {
  weekNumber: number;
  label?: string | null;
  notes?: string | null;
  days: ProgramSpecDay[];
}

export interface ImportProgramSpecInput {
  clearExisting?: boolean;
  weeks: ProgramSpecWeek[];
}

export interface ImportProgramSpecResult {
  weeksCreated: number;
  daysCreated: number;
}

export async function importProgramSpec(
  programId: string,
  input: ImportProgramSpecInput,
): Promise<ImportProgramSpecResult> {
  const db = getDb();

  const [template] = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(eq(programTemplates.id, programId))
    .limit(1);

  if (!template) throw new Error(`Program template ${programId} not found`);

  if (input.clearExisting) {
    const existingWeeks = await db
      .select({ id: programWeeks.id })
      .from(programWeeks)
      .where(eq(programWeeks.programTemplateId, programId));

    if (existingWeeks.length > 0) {
      await db
        .delete(programWeekDays)
        .where(inArray(programWeekDays.programWeekId, existingWeeks.map((w) => w.id)));
      await db
        .delete(programWeeks)
        .where(eq(programWeeks.programTemplateId, programId));
    }
  }

  let weeksCreated = 0;
  let daysCreated = 0;

  for (const specWeek of input.weeks) {
    const [newWeek] = await db
      .insert(programWeeks)
      .values({
        programTemplateId: programId,
        weekNumber: specWeek.weekNumber,
        label: specWeek.label ?? `Week ${specWeek.weekNumber}`,
        notes: specWeek.notes ?? null,
      })
      .returning();

    weeksCreated++;

    const trainingDays = specWeek.days.filter((d) => d.workoutTemplateId != null);
    if (trainingDays.length > 0) {
      await db.insert(programWeekDays).values(
        trainingDays.map((d) => ({
          programWeekId: newWeek.id,
          dayOfWeek: d.dayOfWeek,
          workoutTemplateId: d.workoutTemplateId,
          label: d.label ?? null,
          notes: d.notes ?? null,
        })),
      );
      daysCreated += trainingDays.length;
    }
  }

  await bumpTemplateVersion(programId);
  return { weeksCreated, daysCreated };
}
