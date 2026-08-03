// ─────────────────────────────────────────────────────────────
// Catalyst OS — Workout Blueprint Service (Sprint 5C.2)
//
// SERVER-ONLY — never import from a Client Component.
// CRUD for workout_templates, workout_template_sections,
// and workout_template_exercises.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  workoutTemplates,
  type WorkoutTemplate,
  type ExperienceLevel,
  type TemplateStatus,
} from "./schema";

// Ownership visibility filter shared by both list functions below.
// coachId === null (admin): no filter, every template. Otherwise:
// only templates this coach authored. See lib/db/schema.ts's comment
// on programTemplates/workoutTemplates.createdBy, and the note in
// docs/roadmaps/saas-evolution/kynovant-saas-evolution-roadmap.md §5
// that private-vs-shared template visibility remains an open product
// decision — this is the conservative default (private-by-creator)
// pending that decision, not a resolution of it.
function ownerFilter(coachId: string | null) {
  return coachId === null ? undefined : eq(workoutTemplates.createdBy, coachId);
}
import {
  workoutTemplateSections,
  workoutTemplateExercises,
  exercises,
  type WorkoutTemplateSection,
  type WorkoutTemplateExercise,
  type WorkoutSectionType,
  type SetTechnique,
  type SubstitutionPolicy,
} from "./schema-exercise";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function nextSectionOrder(templateId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ o: workoutTemplateSections.orderIndex })
    .from(workoutTemplateSections)
    .where(eq(workoutTemplateSections.workoutTemplateId, templateId))
    .orderBy(sql`${workoutTemplateSections.orderIndex} DESC`)
    .limit(1);
  return (rows[0]?.o ?? -1) + 1;
}

async function nextPrescriptionOrder(
  templateId: string,
  sectionId: string | null,
): Promise<number> {
  const db = getDb();
  const conditions = [
    eq(workoutTemplateExercises.workoutTemplateId, templateId),
  ];
  if (sectionId !== null) {
    conditions.push(eq(workoutTemplateExercises.sectionId, sectionId));
  }
  const rows = await db
    .select({ o: workoutTemplateExercises.orderIndex })
    .from(workoutTemplateExercises)
    .where(and(...conditions))
    .orderBy(sql`${workoutTemplateExercises.orderIndex} DESC`)
    .limit(1);
  return (rows[0]?.o ?? -1) + 1;
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE CRUD
// ─────────────────────────────────────────────────────────────

export async function listWorkoutTemplates(
  coachId: string | null = null,
): Promise<WorkoutTemplate[]> {
  const db = getDb();
  return db
    .select()
    .from(workoutTemplates)
    .where(ownerFilter(coachId))
    .orderBy(asc(workoutTemplates.createdAt));
}

// Returns templates enriched with exercise count — used by the
// program builder's blueprint picker for at-a-glance previews.
export type WorkoutTemplateSummary = Pick<
  WorkoutTemplate,
  | "id" | "name" | "slug" | "status" | "primaryFocus"
  | "estimatedDurationMinutes" | "recommendedExperienceLevel"
  | "description" | "updatedAt"
> & { exerciseCount: number };

export async function listWorkoutTemplatesWithSummary(
  coachId: string | null = null,
): Promise<WorkoutTemplateSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id:                          workoutTemplates.id,
      name:                        workoutTemplates.name,
      slug:                        workoutTemplates.slug,
      status:                      workoutTemplates.status,
      primaryFocus:                workoutTemplates.primaryFocus,
      estimatedDurationMinutes:    workoutTemplates.estimatedDurationMinutes,
      recommendedExperienceLevel:  workoutTemplates.recommendedExperienceLevel,
      description:                 workoutTemplates.description,
      updatedAt:                   workoutTemplates.updatedAt,
      exerciseCount:               sql<number>`count(${workoutTemplateExercises.id})::int`,
    })
    .from(workoutTemplates)
    .leftJoin(
      workoutTemplateExercises,
      eq(workoutTemplateExercises.workoutTemplateId, workoutTemplates.id),
    )
    .where(ownerFilter(coachId))
    .groupBy(workoutTemplates.id)
    .orderBy(asc(workoutTemplates.name));

  return rows;
}

export async function getWorkoutTemplate(
  id: string,
): Promise<WorkoutTemplate | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateTemplateInput {
  name: string;
  slug?: string;
  description?: string | null;
  primaryFocus?: string | null;
  recommendedExperienceLevel: ExperienceLevel;
  estimatedDurationMinutes?: number | null;
  objective?: string | null;
  coachingMethodology?: string | null;
  defaultSetStyle?: string | null;
  minimumDaysPerWeek?: number | null;
  maximumDaysPerWeek?: number | null;
  createdBy?: string | null;
}

export async function createWorkoutTemplate(
  data: CreateTemplateInput,
): Promise<WorkoutTemplate> {
  const db = getDb();
  const slug = data.slug?.trim() || slugify(data.name);
  const rows = await db
    .insert(workoutTemplates)
    .values({
      name: data.name,
      slug,
      description: data.description ?? null,
      primaryFocus: data.primaryFocus ?? null,
      recommendedExperienceLevel: data.recommendedExperienceLevel,
      estimatedDurationMinutes: data.estimatedDurationMinutes ?? null,
      objective: data.objective ?? null,
      coachingMethodology: data.coachingMethodology ?? null,
      defaultSetStyle: data.defaultSetStyle ?? null,
      minimumDaysPerWeek: data.minimumDaysPerWeek ?? null,
      maximumDaysPerWeek: data.maximumDaysPerWeek ?? null,
      createdBy: data.createdBy ?? null,
    })
    .returning();
  return rows[0];
}

export interface UpdateTemplateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  primaryFocus?: string | null;
  recommendedExperienceLevel?: ExperienceLevel;
  estimatedDurationMinutes?: number | null;
  status?: TemplateStatus;
  objective?: string | null;
  coachingMethodology?: string | null;
  defaultSetStyle?: string | null;
  minimumDaysPerWeek?: number | null;
  maximumDaysPerWeek?: number | null;
}

export async function updateWorkoutTemplate(
  id: string,
  data: UpdateTemplateInput,
): Promise<WorkoutTemplate> {
  const db = getDb();
  const rows = await db
    .update(workoutTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workoutTemplates.id, id))
    .returning();
  if (!rows[0]) throw new Error(`Template ${id} not found`);
  return rows[0];
}

export async function deleteWorkoutTemplate(id: string): Promise<void> {
  const db = getDb();
  await db.delete(workoutTemplates).where(eq(workoutTemplates.id, id));
}

// ─────────────────────────────────────────────────────────────
// SECTIONS
// ─────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  name: string;
  sectionType: WorkoutSectionType;
  estimatedMinutes?: number | null;
  notes?: string | null;
}

export async function addSection(
  templateId: string,
  data: CreateSectionInput,
): Promise<WorkoutTemplateSection> {
  const db = getDb();
  const orderIndex = await nextSectionOrder(templateId);
  const rows = await db
    .insert(workoutTemplateSections)
    .values({
      workoutTemplateId: templateId,
      name: data.name,
      sectionType: data.sectionType,
      orderIndex,
      estimatedMinutes: data.estimatedMinutes ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  return rows[0];
}

export interface UpdateSectionInput {
  name?: string;
  sectionType?: WorkoutSectionType;
  estimatedMinutes?: number | null;
  notes?: string | null;
}

export async function updateSection(
  id: string,
  data: UpdateSectionInput,
): Promise<WorkoutTemplateSection> {
  const db = getDb();
  const rows = await db
    .update(workoutTemplateSections)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workoutTemplateSections.id, id))
    .returning();
  if (!rows[0]) throw new Error(`Section ${id} not found`);
  return rows[0];
}

export async function deleteSection(id: string): Promise<void> {
  const db = getDb();
  // FK on workout_template_exercises.section_id is SET NULL on delete
  await db
    .delete(workoutTemplateSections)
    .where(eq(workoutTemplateSections.id, id));
}

export async function moveSection(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workoutTemplateSections)
    .where(eq(workoutTemplateSections.id, id))
    .limit(1);
  const section = rows[0];
  if (!section) return;

  const all = await db
    .select({ id: workoutTemplateSections.id, o: workoutTemplateSections.orderIndex })
    .from(workoutTemplateSections)
    .where(eq(workoutTemplateSections.workoutTemplateId, section.workoutTemplateId))
    .orderBy(asc(workoutTemplateSections.orderIndex));

  const idx = all.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;

  const current = all[idx];
  const swap = all[swapIdx];

  // Three-step swap to avoid unique-index conflict — must be atomic
  await db.transaction(async (tx) => {
    await tx
      .update(workoutTemplateSections)
      .set({ orderIndex: -1 })
      .where(eq(workoutTemplateSections.id, current.id));
    await tx
      .update(workoutTemplateSections)
      .set({ orderIndex: current.o })
      .where(eq(workoutTemplateSections.id, swap.id));
    await tx
      .update(workoutTemplateSections)
      .set({ orderIndex: swap.o })
      .where(eq(workoutTemplateSections.id, current.id));
  });
}

// ─────────────────────────────────────────────────────────────
// PRESCRIPTIONS
// ─────────────────────────────────────────────────────────────

export interface CreatePrescriptionInput {
  exerciseId: string;
  sectionId?: string | null;
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: string | null;
  restSeconds?: number | null;
  tempo?: string | null;
  targetRpe?: string | null;
  targetRir?: string | null;
  setTechnique?: SetTechnique | null;
  groupId?: string | null;
  groupPosition?: number | null;
  coachNotes?: string | null;
  isRequired?: boolean;
  substitutionPolicy?: SubstitutionPolicy | null;
}

export async function addPrescription(
  templateId: string,
  data: CreatePrescriptionInput,
): Promise<WorkoutTemplateExercise> {
  const db = getDb();
  const sectionId = data.sectionId ?? null;
  const orderIndex = await nextPrescriptionOrder(templateId, sectionId);
  const rows = await db
    .insert(workoutTemplateExercises)
    .values({
      workoutTemplateId: templateId,
      sectionId,
      exerciseId: data.exerciseId,
      orderIndex,
      groupId: data.groupId ?? null,
      groupPosition: data.groupPosition ?? null,
      sets: data.sets ?? null,
      repsMin: data.repsMin ?? null,
      repsMax: data.repsMax ?? null,
      durationSeconds: data.durationSeconds ?? null,
      distanceMeters: data.distanceMeters ?? null,
      restSeconds: data.restSeconds ?? null,
      tempo: data.tempo ?? null,
      targetRpe: data.targetRpe ?? null,
      targetRir: data.targetRir ?? null,
      setTechnique: data.setTechnique ?? null,
      substitutionPolicy: data.substitutionPolicy ?? null,
      isRequired: data.isRequired ?? true,
      coachNotes: data.coachNotes ?? null,
    })
    .returning();
  return rows[0];
}

export interface UpdatePrescriptionInput {
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: string | null;
  restSeconds?: number | null;
  tempo?: string | null;
  targetRpe?: string | null;
  targetRir?: string | null;
  setTechnique?: SetTechnique | null;
  groupId?: string | null;
  groupPosition?: number | null;
  coachNotes?: string | null;
  isRequired?: boolean;
  substitutionPolicy?: SubstitutionPolicy | null;
  sectionId?: string | null;
}

export async function updatePrescription(
  id: string,
  data: UpdatePrescriptionInput,
): Promise<WorkoutTemplateExercise> {
  const db = getDb();
  const rows = await db
    .update(workoutTemplateExercises)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workoutTemplateExercises.id, id))
    .returning();
  if (!rows[0]) throw new Error(`Prescription ${id} not found`);
  return rows[0];
}

export async function deletePrescription(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(workoutTemplateExercises)
    .where(eq(workoutTemplateExercises.id, id));
}

export async function movePrescription(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workoutTemplateExercises)
    .where(eq(workoutTemplateExercises.id, id))
    .limit(1);
  const p = rows[0];
  if (!p) return;

  const conditions = [
    eq(workoutTemplateExercises.workoutTemplateId, p.workoutTemplateId),
  ];
  if (p.sectionId !== null) {
    conditions.push(eq(workoutTemplateExercises.sectionId, p.sectionId));
  }

  const all = await db
    .select({ id: workoutTemplateExercises.id, o: workoutTemplateExercises.orderIndex })
    .from(workoutTemplateExercises)
    .where(and(...conditions))
    .orderBy(asc(workoutTemplateExercises.orderIndex));

  const idx = all.findIndex((x) => x.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;

  const current = all[idx];
  const swap = all[swapIdx];

  // Three-step swap to avoid unique-index conflict — must be atomic
  await db.transaction(async (tx) => {
    await tx
      .update(workoutTemplateExercises)
      .set({ orderIndex: -1 })
      .where(eq(workoutTemplateExercises.id, current.id));
    await tx
      .update(workoutTemplateExercises)
      .set({ orderIndex: current.o })
      .where(eq(workoutTemplateExercises.id, swap.id));
    await tx
      .update(workoutTemplateExercises)
      .set({ orderIndex: swap.o })
      .where(eq(workoutTemplateExercises.id, current.id));
  });
}

// ─────────────────────────────────────────────────────────────
// FULL BLUEPRINT RETRIEVAL
// ─────────────────────────────────────────────────────────────

export interface PrescriptionWithExercise extends WorkoutTemplateExercise {
  exerciseName: string;
}

export interface SectionWithPrescriptions {
  section: WorkoutTemplateSection;
  prescriptions: PrescriptionWithExercise[];
}

export interface BlueprintContent {
  template: WorkoutTemplate;
  sections: SectionWithPrescriptions[];
  unsectioned: PrescriptionWithExercise[];
}

export async function getBlueprintContent(
  templateId: string,
): Promise<BlueprintContent | null> {
  const db = getDb();

  const templateRows = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .limit(1);

  const template = templateRows[0];
  if (!template) return null;

  const [sectionRows, prescriptionRows] = await Promise.all([
    db
      .select()
      .from(workoutTemplateSections)
      .where(eq(workoutTemplateSections.workoutTemplateId, templateId))
      .orderBy(asc(workoutTemplateSections.orderIndex)),
    db
      .select()
      .from(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.workoutTemplateId, templateId))
      .orderBy(asc(workoutTemplateExercises.orderIndex)),
  ]);

  const exerciseIds = [...new Set(prescriptionRows.map((p) => p.exerciseId))];
  const exerciseRows =
    exerciseIds.length > 0
      ? await db
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(inArray(exercises.id, exerciseIds))
      : [];
  const nameMap = new Map(exerciseRows.map((e) => [e.id, e.name]));

  const enriched: PrescriptionWithExercise[] = prescriptionRows.map((p) => ({
    ...p,
    exerciseName: nameMap.get(p.exerciseId) ?? "(unknown exercise)",
  }));

  const sectionIdSet = new Set(sectionRows.map((s) => s.id));

  const sections: SectionWithPrescriptions[] = sectionRows.map((section) => ({
    section,
    prescriptions: enriched.filter((p) => p.sectionId === section.id),
  }));

  const unsectioned = enriched.filter(
    (p) => p.sectionId === null || !sectionIdSet.has(p.sectionId),
  );

  return { template, sections, unsectioned };
}
