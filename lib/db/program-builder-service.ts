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
import { getDb, isSerializationFailure } from "./client";
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
//
// [Independent review remediation — P1 findings]
//
// FINDING 1 (cross-tenant info leak): every check below that could
// reveal a blueprint's name or status now runs AFTER ownership has
// been positively established. A referenced blueprint that is not
// status="active" (i.e. draft or archived) AND not owned by this
// program's own coach is rejected via ONE generic, deduplicated
// message ("A required blueprint is unavailable or inaccessible.")
// that names no blueprint, no status, no owner, no id. Only for an
// ALREADY-ACTIVE dependency (shared-library visible to any coach via
// the app's own existing viewing rules — coachCanViewWorkoutTemplate)
// or a dependency this program's OWN coach owns does a validation
// error ever name it — matching the pre-existing UX convention for
// information the coach is already entitled to see.
//
// FINDING 2 (TOCTOU) + FINDING 3 (accurate transition counting): the
// ENTIRE read-validate-write sequence — loading the program, resolving
// its referenced dependency ids, reading each dependency's status/
// owner/content, and every write — now runs inside ONE
// db.transaction() at SERIALIZABLE isolation. Postgres's serializable
// snapshot isolation (SSI) tracks true read-write conflicts against
// ANY concurrently-committing transaction (regardless of that other
// transaction's own isolation level) and aborts this transaction with
// a 40001 serialization_failure — never allowing it to commit — if
// anything it read (the program row, a dependency's status/createdBy,
// or a dependency's content via validateWorkoutTemplate, now reading
// through this same transaction rather than a separate connection —
// see DbOrTx in lib/db/client.ts) was concurrently changed before this
// transaction's commit. That is the actual guarantee behind "the state
// validated is the state being published": Postgres itself refuses to
// let a stale-snapshot commit succeed, rather than this code merely
// hoping no race occurred. A 40001 is caught once, outside the
// transaction, and reported as a clear "please try again" error — no
// silent retry, no elaborate distributed locking.
//
// Every write is additionally its own conditional UPDATE ... RETURNING
// (status='draft' AND created_by=<program's coach> for a blueprint;
// status='draft' for the program), so autoPublishedBlueprintIds
// contains ONLY the ids THIS invocation's UPDATE actually transitioned
// — never a blueprint some other transaction already published, even
// on the (SSI-permitted) occasions where two non-conflicting publishes
// of *different* programs sharing a dependency happen to interleave
// without triggering a serialization failure.
export interface PublishProgramWithDependenciesResult {
  ok: boolean;
  template?: ProgramTemplate;
  autoPublishedBlueprintIds?: string[];
  errors?: string[];
}

const GENERIC_INACCESSIBLE_DEPENDENCY_ERROR = "A required blueprint is unavailable or inaccessible.";

export async function publishProgramWithDependencies(
  programId: string,
): Promise<PublishProgramWithDependenciesResult> {
  const db = getDb();

  let result: PublishProgramWithDependenciesResult;
  try {
    result = await db.transaction(
      async (tx) => {
        // ── Authoritative reads, inside this transaction ─────────
        const [program] = await tx
          .select({ id: programTemplates.id, status: programTemplates.status, createdBy: programTemplates.createdBy })
          .from(programTemplates)
          .where(eq(programTemplates.id, programId))
          .limit(1);
        if (!program) {
          return { ok: false, errors: ["Program not found."] };
        }
        // Captured once as its own binding — see its use below for why
        // ("null owner" must be handled as a deliberate, type-narrowed
        // case, not papered over with a non-null assertion at the
        // write site).
        const ownerCoachId: string | null = program.createdBy;

        const weeks = await tx
          .select({ id: programWeeks.id })
          .from(programWeeks)
          .where(eq(programWeeks.programTemplateId, programId));
        if (weeks.length === 0) {
          return { ok: false, errors: ["Program has no weeks defined."] };
        }
        const weekIds = weeks.map((w) => w.id);
        const days = await tx
          .select({ workoutTemplateId: programWeekDays.workoutTemplateId })
          .from(programWeekDays)
          .where(inArray(programWeekDays.programWeekId, weekIds));
        const templateIds = [
          ...new Set(days.map((d) => d.workoutTemplateId).filter((tid): tid is string => tid !== null)),
        ];
        if (templateIds.length === 0) {
          return { ok: false, errors: ["Program has no workout blueprints assigned to any days."] };
        }

        // Deterministic order — an unordered multi-row query is
        // nondeterministic under Postgres (a lesson this codebase has
        // already learned once elsewhere); deterministic order also
        // keeps this transaction's own read/lock pattern consistent
        // across repeated calls, which matters for SSI's conflict
        // detection being predictable rather than order-dependent.
        const templates = await tx
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
        let hasInaccessibleDependency = false;
        const candidates: string[] = []; // draft, owned by this program's coach, content-valid

        const foundIds = new Set(templates.map((t) => t.id));
        for (const tid of templateIds) {
          if (!foundIds.has(tid)) {
            // Same FK-RESTRICT reasoning as before: a referenced
            // workout_templates row cannot actually be deleted while
            // referenced, so this is unreachable in practice — kept as
            // a fail-closed defensive branch, not a leak vector (no
            // per-row detail available to leak in the first place).
            hasInaccessibleDependency = true;
          }
        }

        for (const t of templates) {
          if (t.status === "active") {
            // Already published — leave its status alone. Content is
            // still validated on every program publish, exactly like
            // validateProgramForPublish() already does for every
            // referenced blueprint regardless of status — not
            // weakened, not skipped. Naming it in a validation error
            // is not a leak: an active blueprint is shared-library
            // visible to any coach already (coachCanViewWorkoutTemplate),
            // independent of this feature.
            const contentResult = await validateWorkoutTemplate(t.id, tx);
            if (!contentResult.valid) {
              errors.push(`Blueprint "${t.name}" failed validation: ${contentResult.errors.join("; ")}`);
            }
            continue;
          }

          // status is "draft" or "archived" — not safe to leave alone,
          // and NOT safe to even describe by name or status until
          // ownership is positively established. Ownership is checked
          // FIRST, before this blueprint's status is used in any error
          // message — a private draft and a private archived blueprint
          // are indistinguishable to the caller from this point on.
          //
          // ownerCoachId === null (the program itself has no owner —
          // e.g. its creating user was since deleted) is treated the
          // same as a mismatch, never auto-publishable, rather than
          // relying on SQL's own "NULL = NULL is never true" semantics
          // to fail closed by accident.
          if (ownerCoachId === null || t.createdBy !== ownerCoachId) {
            hasInaccessibleDependency = true;
            continue;
          }

          // From here on, t is the program's OWN coach's blueprint —
          // safe to name.
          if (t.status === "archived") {
            errors.push(`Blueprint "${t.name}" is archived and cannot be published. Restore it from Blueprints first.`);
            continue;
          }

          // Own + draft — the only case this function may ever
          // transition to "active".
          const contentResult = await validateWorkoutTemplate(t.id, tx);
          if (!contentResult.valid) {
            errors.push(`Blueprint "${t.name}" failed validation: ${contentResult.errors.join("; ")}`);
            continue;
          }

          candidates.push(t.id);
        }

        if (hasInaccessibleDependency) {
          errors.push(GENERIC_INACCESSIBLE_DEPENDENCY_ERROR);
        }

        // Fail the ENTIRE operation closed on any error — no partial
        // publication. Nothing has been written yet (everything above
        // is read-only within this transaction), so returning here
        // simply commits a no-op read-only transaction.
        if (errors.length > 0) {
          return { ok: false, errors };
        }

        // ── Writes — conditional, RETURNING actual transitions ───
        // candidates is only ever non-empty when ownerCoachId is a real
        // string (every push into candidates happens after the
        // ownerCoachId===null-continue guard above) — this `if` makes
        // that a type-checked fact instead of a non-null assertion,
        // with no behavioral difference (an empty candidates array
        // means this loop is a no-op either way).
        const autoPublishedBlueprintIds: string[] = [];
        if (ownerCoachId !== null) {
          for (const id of candidates) {
            const rows = await tx
              .update(workoutTemplates)
              .set({ status: "active", updatedAt: new Date() })
              .where(
                and(
                  eq(workoutTemplates.id, id),
                  eq(workoutTemplates.status, "draft"),
                  eq(workoutTemplates.createdBy, ownerCoachId),
                ),
              )
              .returning({ id: workoutTemplates.id });
            // 0 rows here means this exact row no longer matches the
            // predicate we just validated it against — under
            // SERIALIZABLE isolation a concurrent committing writer
            // that touched this row would instead cause OUR
            // transaction to fail at commit with 40001 (caught below),
            // so this branch is defense in depth, not the primary
            // correctness mechanism. Either way: never report a
            // blueprint this transaction did not itself transition.
            if (rows.length > 0) autoPublishedBlueprintIds.push(rows[0].id);
          }
        }

        const publishedRows = await tx
          .update(programTemplates)
          .set({ status: "active", updatedAt: new Date() })
          .where(and(eq(programTemplates.id, programId), eq(programTemplates.status, "draft")))
          .returning();

        let template: ProgramTemplate;
        if (publishedRows.length > 0) {
          template = publishedRows[0];
        } else {
          // Program was already active (an idempotent re-publish, or —
          // within this same transaction's consistent snapshot — this
          // was always going to be the case). The dependency
          // transitions above, if any, are still real and reported.
          const [current] = await tx.select().from(programTemplates).where(eq(programTemplates.id, programId));
          if (current?.status !== "active") {
            throw new Error(`Program is in unexpected status "${current?.status}" and cannot be published.`);
          }
          template = current;
        }

        return { ok: true, template, autoPublishedBlueprintIds };
      },
      { isolationLevel: "serializable" },
    );
  } catch (err) {
    if (isSerializationFailure(err)) {
      return { ok: false, errors: ["Publishing conflicted with a concurrent change. Please try again."] };
    }
    throw err;
  }

  // Logged only after the transaction has actually committed — never
  // for a transaction Postgres itself rolled back.
  if (result.ok) {
    console.log(
      "[PROGRAM_PUBLISH_AUTO_DEPENDENCIES]",
      JSON.stringify({
        programId,
        autoPublishedCount: result.autoPublishedBlueprintIds?.length ?? 0,
        autoPublishedBlueprintIds: result.autoPublishedBlueprintIds ?? [],
      }),
    );
  } else {
    // Sanitized — count only, never the error text itself (which may
    // legitimately name the coach's OWN blueprints) and never a
    // cross-tenant detail (which the errors array never contains in
    // the first place, per Finding 1's remediation above).
    console.error("[PROGRAM_PUBLISH_AUTO_DEPENDENCIES_REJECTED]", JSON.stringify({ programId, errorCount: result.errors?.length ?? 0 }));
  }

  return result;
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
