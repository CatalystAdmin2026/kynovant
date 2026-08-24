// ─────────────────────────────────────────────────────────────
// Catalyst OS — Program Builder Service (Sprint 6.0)
//
// SERVER-ONLY — never import from a Client Component.
// CRUD for program_templates, program_weeks, and program_week_days.
// Validation: blueprints must pass validateWorkoutTemplate() before
// a program can be published.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import { coachCanViewWorkoutTemplate } from "@/lib/auth/guards";

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

// Ownership visibility filter — see the matching comment in
// lib/db/workout-template-service.ts. coachId === null (admin): no
// filter. Otherwise: only templates this coach authored.
function ownerFilter(coachId: string | null) {
  return coachId === null ? undefined : eq(programTemplates.createdBy, coachId);
}
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

export async function listProgramTemplates(
  coachId: string | null = null,
): Promise<ProgramTemplate[]> {
  const db = getDb();
  return db
    .select()
    .from(programTemplates)
    .where(ownerFilter(coachId))
    .orderBy(asc(programTemplates.createdAt));
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE ASSIGNMENT STATS
//
// Real, per-template counts of client_programs assignments, grouped
// by status. Purely additive read — does not touch listProgramTemplates()
// or any other consumer, and does not alter client_programs in any way.
// Used to enrich the Programs list view with honest enrollment numbers.
// ─────────────────────────────────────────────────────────────

export interface ProgramTemplateStats {
  programTemplateId: string;
  activeClientCount: number;
  completedClientCount: number;
}

export async function listProgramTemplateStats(): Promise<ProgramTemplateStats[]> {
  const db = getDb();
  const rows = await db
    .select({
      programTemplateId: clientPrograms.programTemplateId,
      status: clientPrograms.status,
      count: sql<number>`count(*)::int`,
    })
    .from(clientPrograms)
    .groupBy(clientPrograms.programTemplateId, clientPrograms.status);

  const byTemplate = new Map<string, ProgramTemplateStats>();
  for (const row of rows) {
    const entry = byTemplate.get(row.programTemplateId) ?? {
      programTemplateId: row.programTemplateId,
      activeClientCount: 0,
      completedClientCount: 0,
    };
    if (row.status === "active") entry.activeClientCount = row.count;
    if (row.status === "completed") entry.completedClientCount = row.count;
    byTemplate.set(row.programTemplateId, entry);
  }
  return [...byTemplate.values()];
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

  return db.transaction(async (tx) => {
    const [row] = await tx
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
      await tx.insert(programWeeks).values(weekValues);
    }

    return row;
  });
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

  // Delete days → weeks → template, all-or-nothing. A partial failure here
  // (e.g. between deleting weeks and deleting the template row) would leave
  // an orphaned, week-less template that looks broken in the UI.
  const weeks = await db
    .select({ id: programWeeks.id })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, id));

  await db.transaction(async (tx) => {
    if (weeks.length > 0) {
      const weekIds = weeks.map((w) => w.id);
      await tx
        .delete(programWeekDays)
        .where(inArray(programWeekDays.programWeekId, weekIds));
      await tx
        .delete(programWeeks)
        .where(eq(programWeeks.programTemplateId, id));
    }

    await tx.delete(programTemplates).where(eq(programTemplates.id, id));
  });
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
// PUBLISH WITH AUTO-PUBLISHED DEPENDENCIES
//
// [Program publish auto-dependency workflow] publishProgram() above
// requires every referenced blueprint to ALREADY be status="active",
// forcing a coach into a separate manual "publish every generated
// blueprint" chore before they can publish the program that just
// generated them. This is the single coach-facing action instead:
// clicking "Publish Program" auto-publishes the EXACT draft blueprints
// that program references (and only those), then publishes the
// program — one intentional action, same outcome the coach wants.
//
// Left deliberately alongside (not replacing) publishProgram/
// validateProgramForPublish — those still exist and are unused by
// nothing else's behavior changes; this is purely additive. Reuses
// validateWorkoutTemplate() (the real per-blueprint content validator)
// unchanged — the only new logic is the STATUS gate: instead of
// "everything must already be active," each referenced blueprint is
// individually classified as leave-alone / auto-publish / fail-closed.
//
// Dependency source of truth: program_week_days.workout_template_id,
// read fresh from the DB inside this call — never client-supplied.
// A tampered publish request has no way to name a blueprint at all,
// let alone one this program doesn't actually reference.
export interface PublishProgramWithDependenciesResult {
  ok: boolean;
  template?: ProgramTemplate;
  autoPublishedBlueprintIds?: string[];
  errors?: string[];
}

export async function publishProgramWithDependencies(
  programId: string,
): Promise<PublishProgramWithDependenciesResult> {
  const db = getDb();

  const [program] = await db
    .select({ id: programTemplates.id, status: programTemplates.status, createdBy: programTemplates.createdBy })
    .from(programTemplates)
    .where(eq(programTemplates.id, programId))
    .limit(1);
  if (!program) {
    return { ok: false, errors: ["Program not found."] };
  }

  // Same dependency-collection query as validateProgramForPublish().
  const weeks = await db
    .select({ id: programWeeks.id })
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, programId));
  if (weeks.length === 0) {
    return { ok: false, errors: ["Program has no weeks defined."] };
  }
  const weekIds = weeks.map((w) => w.id);
  const days = await db
    .select({ workoutTemplateId: programWeekDays.workoutTemplateId })
    .from(programWeekDays)
    .where(inArray(programWeekDays.programWeekId, weekIds));
  const templateIds = [
    ...new Set(days.map((d) => d.workoutTemplateId).filter((tid): tid is string => tid !== null)),
  ];
  if (templateIds.length === 0) {
    return { ok: false, errors: ["Program has no workout blueprints assigned to any days."] };
  }

  // Deterministic order — see the exercise-fixture-ordering lesson this
  // codebase already learned once (an unordered multi-row query is
  // nondeterministic under Postgres); also keeps lock-acquisition order
  // identical across two concurrent publish attempts on the same
  // program, so a genuine double-click/two-tab race fails closed via
  // Postgres's own deadlock detection rather than ever interleaving.
  const templates = await db
    .select({
      id: workoutTemplates.id,
      name: workoutTemplates.name,
      status: workoutTemplates.status,
      createdBy: workoutTemplates.createdBy,
    })
    .from(workoutTemplates)
    .where(inArray(workoutTemplates.id, templateIds))
    .orderBy(asc(workoutTemplates.id));

  const errors: string[] = [];
  const toAutoPublish: string[] = [];

  const foundIds = new Set(templates.map((t) => t.id));
  for (const tid of templateIds) {
    if (!foundIds.has(tid)) {
      errors.push("A referenced blueprint could not be found.");
    }
  }

  for (const t of templates) {
    if (t.status === "active") {
      // Already published — leave its status alone, but its content is
      // still validated on every program publish, exactly like
      // validateProgramForPublish() already does for every referenced
      // blueprint regardless of status. Not weakened, not skipped.
      const result = await validateWorkoutTemplate(t.id);
      if (!result.valid) {
        errors.push(`Blueprint "${t.name}" failed validation: ${result.errors.join("; ")}`);
      }
      continue;
    }

    if (t.status === "archived") {
      // Fail closed — auto-publishing an archived blueprint would
      // silently reverse a coach's own explicit archive decision.
      errors.push(`Blueprint "${t.name}" is archived and cannot be published. Restore it from Blueprints first.`);
      continue;
    }

    // status === "draft" — the only status this function may ever flip
    // to "active" automatically, and only after both checks below pass.

    // Tenant isolation (Phase 4): only a blueprint owned by this
    // program's own coach may be auto-published. Dependencies are
    // read from the program's own persisted rows, never client input,
    // but this check is defense in depth regardless — the same
    // guarantee getExerciseByIdForCoach enforces for exercise
    // replacement. A blueprint some other coach privately owns is
    // rejected exactly like a nonexistent one, with no ownership
    // detail leaked in the error.
    if (t.createdBy !== program.createdBy) {
      errors.push(`Blueprint "${t.name}" is not accessible and cannot be published.`);
      continue;
    }

    const result = await validateWorkoutTemplate(t.id);
    if (!result.valid) {
      errors.push(`Blueprint "${t.name}" failed validation: ${result.errors.join("; ")}`);
      continue;
    }

    toAutoPublish.push(t.id);
  }

  // Fail the ENTIRE operation closed on any error — no partial
  // publication. Nothing has been written yet at this point (everything
  // above is read-only), so "fail closed" here simply means "never open
  // the transaction below."
  if (errors.length > 0) {
    console.error("[PROGRAM_PUBLISH_AUTO_DEPENDENCIES_REJECTED]", JSON.stringify({ programId, errorCount: errors.length }));
    return { ok: false, errors };
  }

  // Atomic write phase — real transaction, real rollback. Every read
  // above (validateWorkoutTemplate included) is side-effect-free pure
  // DB reads (see lib/pil/enrichment.ts — no network/external calls),
  // so nothing here can fail for a reason that would leave a partial
  // write behind.
  const outcome = await db.transaction(async (tx) => {
    for (const id of toAutoPublish) {
      await tx.update(workoutTemplates).set({ status: "active", updatedAt: new Date() }).where(eq(workoutTemplates.id, id));
    }

    // Conditional publish — the program's own status transition only
    // ever applies FROM "draft". Concurrency control: a second,
    // concurrent publish call (double-click, two tabs) either loses the
    // row lock and blocks until the first commits (then sees 0 rows
    // matched here and safely no-ops), or — if it happened to reach
    // this UPDATE with a stale read — Postgres's own deadlock detector
    // aborts one of the two transactions rather than ever letting them
    // interleave into an inconsistent state. No new locking primitive
    // needed; this reuses the transaction's own row-level locking.
    const publishedRows = await tx
      .update(programTemplates)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(programTemplates.id, programId), eq(programTemplates.status, "draft")))
      .returning();

    if (publishedRows.length === 0) {
      const [current] = await tx
        .select({ status: programTemplates.status })
        .from(programTemplates)
        .where(eq(programTemplates.id, programId));
      if (current?.status === "active") {
        // Already published (by this call's own earlier idempotent
        // path being re-entered, or a concurrent request that won the
        // race) — the auto-published blueprints above still happened
        // and are real; the program-level transition is just a no-op.
        const [row] = await tx.select().from(programTemplates).where(eq(programTemplates.id, programId));
        return { template: row };
      }
      throw new Error(`Program is in unexpected status "${current?.status}" and cannot be published.`);
    }

    return { template: publishedRows[0] };
  });

  console.log(
    "[PROGRAM_PUBLISH_AUTO_DEPENDENCIES]",
    JSON.stringify({ programId, autoPublishedCount: toAutoPublish.length, autoPublishedBlueprintIds: toAutoPublish }),
  );

  return { ok: true, template: outcome.template, autoPublishedBlueprintIds: toAutoPublish };
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
  coachId: string | null = null,
): Promise<ProgramWeekDay> {
  const db = getDb();

  // Referenced-blueprint check: even once this program's ownership is
  // enforced at the route layer, nothing previously stopped a coach from
  // slotting in another coach's *private* blueprint by UUID. A blueprint
  // is a valid reference only if it's this coach's own, or published
  // (shared library) — same visibility rule as viewing/cloning a template.
  if (coachId !== null && workoutTemplateId !== null) {
    const canView = await coachCanViewWorkoutTemplate(coachId, workoutTemplateId);
    if (!canView) {
      throw new Error(`Blueprint ${workoutTemplateId} not found or not accessible`);
    }
  }

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

  const sourceWeeks = await db
    .select()
    .from(programWeeks)
    .where(eq(programWeeks.programTemplateId, sourceId))
    .orderBy(asc(programWeeks.weekNumber));

  // Whole deep-copy is one transaction: a failure partway through (e.g. a
  // day referencing a blueprint deleted concurrently) must not leave a
  // half-built clone — either every week/day is written, or none is.
  return db.transaction(async (tx) => {
    const [clone] = await tx
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

    for (const week of sourceWeeks) {
      const [newWeek] = await tx
        .insert(programWeeks)
        .values({
          programTemplateId: clone.id,
          weekNumber: week.weekNumber,
          label: week.label,
          notes: week.notes,
        })
        .returning();

      const sourceDays = await tx
        .select()
        .from(programWeekDays)
        .where(eq(programWeekDays.programWeekId, week.id));

      if (sourceDays.length > 0) {
        await tx.insert(programWeekDays).values(
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
  });
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

  const sourceDays = await db
    .select()
    .from(programWeekDays)
    .where(eq(programWeekDays.programWeekId, weekId));

  // New week + copied days + version bump, all-or-nothing — a failure
  // partway through must not leave an empty, mis-numbered week behind.
  const newWeek = await db.transaction(async (tx) => {
    const [week] = await tx
      .insert(programWeeks)
      .values({
        programTemplateId: templateId,
        weekNumber: nextNumber,
        label: sourceWeek.label ? `${sourceWeek.label} (Copy)` : `Week ${nextNumber}`,
        notes: sourceWeek.notes,
      })
      .returning();

    if (sourceDays.length > 0) {
      await tx.insert(programWeekDays).values(
        sourceDays.map((d) => ({
          programWeekId: week.id,
          dayOfWeek: d.dayOfWeek,
          workoutTemplateId: d.workoutTemplateId,
          label: d.label,
          notes: d.notes,
        })),
      );
    }

    await tx
      .update(programTemplates)
      .set({ version: sql`${programTemplates.version} + 1`, updatedAt: new Date() })
      .where(eq(programTemplates.id, templateId));

    return week;
  });

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
  coachId: string | null = null,
): Promise<ImportProgramSpecResult> {
  const db = getDb();

  const [template] = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(eq(programTemplates.id, programId))
    .limit(1);

  if (!template) throw new Error(`Program template ${programId} not found`);

  // Referenced-blueprint check, upfront and outside the transaction: an
  // AI-generated spec is exactly the kind of payload most likely to
  // reference a bad or inaccessible workoutTemplateId (audit's own
  // words: "malformed/large payloads are a realistic trigger"). Failing
  // fast here with a clean error is much better than a mid-transaction
  // rollback after already deleting the program's existing structure.
  const referencedIds = [
    ...new Set(
      input.weeks
        .flatMap((w) => w.days)
        .map((d) => d.workoutTemplateId)
        .filter((id): id is string => id != null),
    ),
  ];

  if (referencedIds.length > 0) {
    const found = await db
      .select({
        id: workoutTemplates.id,
        createdBy: workoutTemplates.createdBy,
        status: workoutTemplates.status,
      })
      .from(workoutTemplates)
      .where(inArray(workoutTemplates.id, referencedIds));

    const foundById = new Map(found.map((f) => [f.id, f]));
    for (const id of referencedIds) {
      const row = foundById.get(id);
      if (!row) {
        throw new Error(`Blueprint ${id} not found`);
      }
      if (coachId !== null && row.createdBy !== coachId && row.status !== "active") {
        throw new Error(`Blueprint ${id} not found or not accessible`);
      }
    }
  }

  // Clear-existing + full week/day rewrite + version bump, all-or-nothing.
  // importProgramSpec is the AI-import seam; a partial write here would
  // silently delete a program's old structure and leave only a prefix of
  // the new one, with no atomicity to fall back on — exactly the gap the
  // scale-readiness audit flagged (the old code claimed atomicity in its
  // own comment without actually being wrapped in a transaction).
  return db.transaction(async (tx) => {
    if (input.clearExisting) {
      const existingWeeks = await tx
        .select({ id: programWeeks.id })
        .from(programWeeks)
        .where(eq(programWeeks.programTemplateId, programId));

      if (existingWeeks.length > 0) {
        await tx
          .delete(programWeekDays)
          .where(inArray(programWeekDays.programWeekId, existingWeeks.map((w) => w.id)));
        await tx
          .delete(programWeeks)
          .where(eq(programWeeks.programTemplateId, programId));
      }
    }

    let weeksCreated = 0;
    let daysCreated = 0;

    for (const specWeek of input.weeks) {
      const [newWeek] = await tx
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
        await tx.insert(programWeekDays).values(
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

    await tx
      .update(programTemplates)
      .set({ version: sql`${programTemplates.version} + 1`, updatedAt: new Date() })
      .where(eq(programTemplates.id, programId));

    return { weeksCreated, daysCreated };
  });
}
