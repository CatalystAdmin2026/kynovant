// ─────────────────────────────────────────────────────────────
// Catalyst OS — PIL Blueprint Enrichment (M00)
//
// SERVER-ONLY. Never import from a client component.
//
// getBlueprintEnriched is the only PIL function that queries the
// database. It executes batched queries and assembles EnrichedBlueprint,
// which every analysis module receives as its sole input.
//
// Query pattern: 3 sequential queries to obtain IDs (template →
// sections + prescriptions → exercise IDs), then 1 parallel batch
// for all exercise-level data (exercises, muscles, outbound relations,
// inbound relations, contraindications, coach overrides).
// No N+1 queries regardless of blueprint size.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { eq, inArray, and, asc } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { workoutTemplates } from "@/lib/db/schema";
import {
  exercises,
  workoutTemplateSections,
  workoutTemplateExercises,
  exerciseMuscles,
  exerciseRelations,
  exerciseContraindications,
  exerciseCoachOverrides,
} from "@/lib/db/schema-exercise";
import type {
  EnrichedBlueprint,
  EnrichedSection,
  EnrichedPrescription,
  EnrichedExercise,
  EnrichedMuscle,
  EnrichedRelation,
  EnrichedContraindication,
  PilDefaultPrescription,
  MuscleGroup,
  MuscleRole,
  ExerciseRelationType,
  SubstitutionPolicy,
  WorkoutSectionType,
  SetTechnique,
  MovementPattern,
  ExerciseClassification,
  ExerciseDifficulty,
  ExerciseStatus,
  ExerciseScope,
  BodyPosition,
  ResistanceType,
  ContraindicationSeverity,
} from "./types";

// ─── Raw query result types ───────────────────────────────────────────────────
// These are the shapes returned directly by Drizzle before assembly.

type RawTemplate = {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: string;
};

type RawSection = {
  id: string;
  name: string;
  sectionType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  notes: string | null;
};

type RawPrescription = {
  id: string;
  exerciseId: string;
  sectionId: string | null;
  orderIndex: number;
  groupId: string | null;
  groupPosition: number | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  distanceMeters: string | null; // Drizzle returns numeric as string
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null; // Drizzle returns numeric as string
  targetRir: string | null; // Drizzle returns numeric as string
  setTechnique: string | null;
  substitutionPolicy: string | null;
  isRequired: boolean;
  coachNotes: string | null;
};

type RawExercise = {
  id: string;
  name: string;
  slug: string;
  status: string;
  scope: string;
  movementPattern: string;
  classification: string;
  difficulty: string;
  primaryMuscleGroup: string | null;
  defaultBodyPosition: string | null;
  resistanceType: string | null;
  unilateral: boolean;
  alternating: boolean;
  isTimeBased: boolean;
  isDistanceBased: boolean;
  isCardio: boolean;
  isMobility: boolean;
  fatigueCost: number | null;
  technicalComplexity: number | null;
  stabilityDemand: number | null;
  jointStressShoulder: number | null;
  jointStressElbow: number | null;
  jointStressWrist: number | null;
  jointStressSpine: number | null;
  jointStressHip: number | null;
  jointStressKnee: number | null;
  jointStressAnkle: number | null;
  lengthenedBias: number | null;
  shortenedBias: number | null;
  stretchMediatedPotential: number | null;
  defaultPrescription: unknown;
};

type RawMuscle = {
  exerciseId: string;
  muscleGroup: string;
  role: string;
  emphasisPercent: string | null; // Drizzle returns numeric as string
};

type RawRelationOut = {
  sourceExerciseId: string;
  targetExerciseId: string;
  relatedName: string;
  relationType: string;
  suitabilityScore: number | null;
  substitutionPolicy: string | null;
};

type RawRelationIn = {
  targetExerciseId: string;
  sourceExerciseId: string;
  relatedName: string;
  relationType: string;
  suitabilityScore: number | null;
  substitutionPolicy: string | null;
};

type RawContraindication = {
  id: string;
  exerciseId: string;
  conditionOrInjury: string;
  bodyRegion: string | null;
  severity: string;
  modificationNote: string | null;
  suggestedRelationId: string | null;
};

type RawOverride = {
  exerciseId: string;
  defaultPrescription: unknown;
};

// ─── Assembly types (pure, no DB) ────────────────────────────────────────────

export type RawBlueprintData = {
  template: RawTemplate;
  rawSections: RawSection[];
  rawPrescriptions: RawPrescription[];
  rawExercises: RawExercise[];
  rawMuscles: RawMuscle[];
  rawRelationsOut: RawRelationOut[];
  rawRelationsIn: RawRelationIn[];
  rawContraindications: RawContraindication[];
  rawOverrides: RawOverride[];
};

// ─── Pure assembly function (exported for testing) ───────────────────────────

export function assembleBlueprint(data: RawBlueprintData): EnrichedBlueprint {
  const {
    template,
    rawSections,
    rawPrescriptions,
    rawExercises,
    rawMuscles,
    rawRelationsOut,
    rawRelationsIn,
    rawContraindications,
    rawOverrides,
  } = data;

  // Build sections map: id → EnrichedSection
  const sectionMap = new Map<string, EnrichedSection>();
  for (const s of rawSections) {
    sectionMap.set(s.id, {
      id: s.id,
      name: s.name,
      sectionType: s.sectionType as WorkoutSectionType,
      estimatedMinutes: s.estimatedMinutes,
      orderIndex: s.orderIndex,
      notes: s.notes,
    });
  }

  // Build exercise supplementary data maps: exerciseId → data
  const muscleMap = new Map<string, EnrichedMuscle[]>();
  for (const m of rawMuscles) {
    const list = muscleMap.get(m.exerciseId) ?? [];
    list.push({
      muscleGroup: m.muscleGroup as MuscleGroup,
      role: m.role as MuscleRole,
      emphasisPercent: m.emphasisPercent != null ? parseFloat(m.emphasisPercent) : null,
    });
    muscleMap.set(m.exerciseId, list);
  }

  const relationMap = new Map<string, EnrichedRelation[]>();
  for (const r of rawRelationsOut) {
    const list = relationMap.get(r.sourceExerciseId) ?? [];
    list.push({
      relatedExerciseId: r.targetExerciseId,
      relatedExerciseName: r.relatedName,
      relationType: r.relationType as ExerciseRelationType,
      direction: "outbound",
      suitabilityScore: r.suitabilityScore,
      substitutionPolicy: r.substitutionPolicy as SubstitutionPolicy | null,
    });
    relationMap.set(r.sourceExerciseId, list);
  }
  for (const r of rawRelationsIn) {
    const list = relationMap.get(r.targetExerciseId) ?? [];
    list.push({
      relatedExerciseId: r.sourceExerciseId,
      relatedExerciseName: r.relatedName,
      relationType: r.relationType as ExerciseRelationType,
      direction: "inbound",
      suitabilityScore: r.suitabilityScore,
      substitutionPolicy: r.substitutionPolicy as SubstitutionPolicy | null,
    });
    relationMap.set(r.targetExerciseId, list);
  }

  const contraindicationMap = new Map<string, EnrichedContraindication[]>();
  for (const c of rawContraindications) {
    const list = contraindicationMap.get(c.exerciseId) ?? [];
    list.push({
      id: c.id,
      conditionOrInjury: c.conditionOrInjury,
      bodyRegion: c.bodyRegion,
      severity: c.severity as ContraindicationSeverity,
      modificationNote: c.modificationNote,
      suggestedRelationId: c.suggestedRelationId,
    });
    contraindicationMap.set(c.exerciseId, list);
  }

  const overrideMap = new Map<string, PilDefaultPrescription>();
  for (const o of rawOverrides) {
    if (o.defaultPrescription != null) {
      overrideMap.set(o.exerciseId, o.defaultPrescription as PilDefaultPrescription);
    }
  }

  // Build enriched exercise map: id → EnrichedExercise
  const exerciseMap = new Map<string, EnrichedExercise>();
  for (const e of rawExercises) {
    exerciseMap.set(e.id, {
      id: e.id,
      name: e.name,
      slug: e.slug,
      status: e.status as ExerciseStatus,
      scope: e.scope as ExerciseScope,
      movementPattern: e.movementPattern as MovementPattern,
      classification: e.classification as ExerciseClassification,
      difficulty: e.difficulty as ExerciseDifficulty,
      primaryMuscleGroup: e.primaryMuscleGroup as MuscleGroup | null,
      defaultBodyPosition: e.defaultBodyPosition as BodyPosition | null,
      resistanceType: e.resistanceType as ResistanceType | null,
      unilateral: e.unilateral,
      alternating: e.alternating,
      isTimeBased: e.isTimeBased,
      isDistanceBased: e.isDistanceBased,
      isCardio: e.isCardio,
      isMobility: e.isMobility,
      fatigueCost: e.fatigueCost,
      technicalComplexity: e.technicalComplexity,
      stabilityDemand: e.stabilityDemand,
      jointStressShoulder: e.jointStressShoulder,
      jointStressElbow: e.jointStressElbow,
      jointStressWrist: e.jointStressWrist,
      jointStressSpine: e.jointStressSpine,
      jointStressHip: e.jointStressHip,
      jointStressKnee: e.jointStressKnee,
      jointStressAnkle: e.jointStressAnkle,
      lengthenedBias: e.lengthenedBias,
      shortenedBias: e.shortenedBias,
      stretchMediatedPotential: e.stretchMediatedPotential,
      defaultPrescription: e.defaultPrescription as PilDefaultPrescription | null,
      muscles: muscleMap.get(e.id) ?? [],
      relations: relationMap.get(e.id) ?? [],
      contraindications: contraindicationMap.get(e.id) ?? [],
    });
  }

  // Build enriched prescriptions
  const prescriptions: EnrichedPrescription[] = rawPrescriptions.map((p) => {
    const exercise = exerciseMap.get(p.exerciseId) ?? null;
    // missing=true only when the exercise record cannot be found in the DB (deleted).
    // Archived/draft exercises are still returned; M01 flags invalid status separately.
    const missing = exercise === null;
    const override = overrideMap.get(p.exerciseId) ?? null;
    const effectivePrescription =
      override ?? exercise?.defaultPrescription ?? null;
    const section = p.sectionId ? (sectionMap.get(p.sectionId) ?? null) : null;

    return {
      id: p.id,
      exerciseId: p.exerciseId,
      exercise,
      missing,
      effectivePrescription,
      sets: p.sets,
      repsMin: p.repsMin,
      repsMax: p.repsMax,
      durationSeconds: p.durationSeconds,
      distanceMeters: p.distanceMeters != null ? parseFloat(p.distanceMeters) : null,
      restSeconds: p.restSeconds,
      tempo: p.tempo,
      targetRpe: p.targetRpe != null ? parseFloat(p.targetRpe) : null,
      targetRir: p.targetRir != null ? parseFloat(p.targetRir) : null,
      setTechnique: p.setTechnique as SetTechnique | null,
      groupId: p.groupId,
      groupPosition: p.groupPosition,
      orderIndex: p.orderIndex,
      isRequired: p.isRequired,
      substitutionPolicy: p.substitutionPolicy as SubstitutionPolicy | null,
      coachNotes: p.coachNotes,
      sectionId: p.sectionId,
      sectionType: section?.sectionType ?? null,
    };
  });

  // Sort: section orderIndex ASC, then prescription orderIndex ASC.
  // Prescriptions without a section sort last.
  prescriptions.sort((a, b) => {
    const sA = a.sectionId ? (sectionMap.get(a.sectionId)?.orderIndex ?? Infinity) : Infinity;
    const sB = b.sectionId ? (sectionMap.get(b.sectionId)?.orderIndex ?? Infinity) : Infinity;
    if (sA !== sB) return sA - sB;
    return a.orderIndex - b.orderIndex;
  });

  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    objective: template.objective,
    status: template.status as ExerciseStatus,
    sections: rawSections.map((s) => sectionMap.get(s.id)!),
    prescriptions,
  };
}

// ─── Database enrichment function ────────────────────────────────────────────

export async function getBlueprintEnriched(
  templateId: string,
  coachId?: string,
  // [Program publish auto-dependency workflow — TOCTOU remediation]
  // Optional: pass the caller's own transaction (see DbOrTx's own
  // comment) so this read participates in that transaction instead of
  // opening a separate connection. Every existing caller omits this
  // and gets the exact previous behavior.
  dbClient?: DbOrTx,
): Promise<EnrichedBlueprint> {
  const db = dbClient ?? getDb();

  // ── Query 1: Blueprint metadata ──────────────────────────
  const templateRows = await db
    .select({
      id: workoutTemplates.id,
      name: workoutTemplates.name,
      description: workoutTemplates.description,
      objective: workoutTemplates.objective,
      status: workoutTemplates.status,
    })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .limit(1);

  const template = templateRows[0];
  if (!template) {
    throw new Error(`Blueprint not found: ${templateId}`);
  }

  // ── Queries 2 + 3 (parallel): Sections and prescriptions ─
  const [rawSections, rawPrescriptions] = await Promise.all([
    db
      .select({
        id: workoutTemplateSections.id,
        name: workoutTemplateSections.name,
        sectionType: workoutTemplateSections.sectionType,
        orderIndex: workoutTemplateSections.orderIndex,
        estimatedMinutes: workoutTemplateSections.estimatedMinutes,
        notes: workoutTemplateSections.notes,
      })
      .from(workoutTemplateSections)
      .where(eq(workoutTemplateSections.workoutTemplateId, templateId))
      .orderBy(asc(workoutTemplateSections.orderIndex)),

    db
      .select({
        id: workoutTemplateExercises.id,
        exerciseId: workoutTemplateExercises.exerciseId,
        sectionId: workoutTemplateExercises.sectionId,
        orderIndex: workoutTemplateExercises.orderIndex,
        groupId: workoutTemplateExercises.groupId,
        groupPosition: workoutTemplateExercises.groupPosition,
        sets: workoutTemplateExercises.sets,
        repsMin: workoutTemplateExercises.repsMin,
        repsMax: workoutTemplateExercises.repsMax,
        durationSeconds: workoutTemplateExercises.durationSeconds,
        distanceMeters: workoutTemplateExercises.distanceMeters,
        restSeconds: workoutTemplateExercises.restSeconds,
        tempo: workoutTemplateExercises.tempo,
        targetRpe: workoutTemplateExercises.targetRpe,
        targetRir: workoutTemplateExercises.targetRir,
        setTechnique: workoutTemplateExercises.setTechnique,
        substitutionPolicy: workoutTemplateExercises.substitutionPolicy,
        isRequired: workoutTemplateExercises.isRequired,
        coachNotes: workoutTemplateExercises.coachNotes,
      })
      .from(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.workoutTemplateId, templateId))
      .orderBy(asc(workoutTemplateExercises.orderIndex)),
  ]);

  // Deduplicate exercise IDs for batch queries
  const exerciseIds = [...new Set(rawPrescriptions.map((p) => p.exerciseId))];

  // ── Parallel batch: all exercise-level data ───────────────
  // Guard against inArray([]) which generates invalid SQL.
  const [rawExercises, rawMuscles, rawRelationsOut, rawRelationsIn, rawContraindications, rawOverrides] =
    exerciseIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: exercises.id,
              name: exercises.name,
              slug: exercises.slug,
              status: exercises.status,
              scope: exercises.scope,
              movementPattern: exercises.movementPattern,
              classification: exercises.classification,
              difficulty: exercises.difficulty,
              primaryMuscleGroup: exercises.primaryMuscleGroup,
              defaultBodyPosition: exercises.defaultBodyPosition,
              resistanceType: exercises.resistanceType,
              unilateral: exercises.unilateral,
              alternating: exercises.alternating,
              isTimeBased: exercises.isTimeBased,
              isDistanceBased: exercises.isDistanceBased,
              isCardio: exercises.isCardio,
              isMobility: exercises.isMobility,
              fatigueCost: exercises.fatigueCost,
              technicalComplexity: exercises.technicalComplexity,
              stabilityDemand: exercises.stabilityDemand,
              jointStressShoulder: exercises.jointStressShoulder,
              jointStressElbow: exercises.jointStressElbow,
              jointStressWrist: exercises.jointStressWrist,
              jointStressSpine: exercises.jointStressSpine,
              jointStressHip: exercises.jointStressHip,
              jointStressKnee: exercises.jointStressKnee,
              jointStressAnkle: exercises.jointStressAnkle,
              lengthenedBias: exercises.lengthenedBias,
              shortenedBias: exercises.shortenedBias,
              stretchMediatedPotential: exercises.stretchMediatedPotential,
              defaultPrescription: exercises.defaultPrescription,
            })
            .from(exercises)
            .where(inArray(exercises.id, exerciseIds)),

          db
            .select({
              exerciseId: exerciseMuscles.exerciseId,
              muscleGroup: exerciseMuscles.muscleGroup,
              role: exerciseMuscles.role,
              emphasisPercent: exerciseMuscles.emphasisPercent,
            })
            .from(exerciseMuscles)
            .where(inArray(exerciseMuscles.exerciseId, exerciseIds)),

          // Outbound: this exercise is the source; join to get target name
          db
            .select({
              sourceExerciseId: exerciseRelations.sourceExerciseId,
              targetExerciseId: exerciseRelations.targetExerciseId,
              relatedName: exercises.name,
              relationType: exerciseRelations.relationType,
              suitabilityScore: exerciseRelations.suitabilityScore,
              substitutionPolicy: exerciseRelations.substitutionPolicy,
            })
            .from(exerciseRelations)
            .innerJoin(
              exercises,
              eq(exerciseRelations.targetExerciseId, exercises.id),
            )
            .where(inArray(exerciseRelations.sourceExerciseId, exerciseIds)),

          // Inbound: this exercise is the target; join to get source name
          db
            .select({
              targetExerciseId: exerciseRelations.targetExerciseId,
              sourceExerciseId: exerciseRelations.sourceExerciseId,
              relatedName: exercises.name,
              relationType: exerciseRelations.relationType,
              suitabilityScore: exerciseRelations.suitabilityScore,
              substitutionPolicy: exerciseRelations.substitutionPolicy,
            })
            .from(exerciseRelations)
            .innerJoin(
              exercises,
              eq(exerciseRelations.sourceExerciseId, exercises.id),
            )
            .where(inArray(exerciseRelations.targetExerciseId, exerciseIds)),

          db
            .select({
              id: exerciseContraindications.id,
              exerciseId: exerciseContraindications.exerciseId,
              conditionOrInjury: exerciseContraindications.conditionOrInjury,
              bodyRegion: exerciseContraindications.bodyRegion,
              severity: exerciseContraindications.severity,
              modificationNote: exerciseContraindications.modificationNote,
              suggestedRelationId: exerciseContraindications.suggestedRelationId,
            })
            .from(exerciseContraindications)
            .where(inArray(exerciseContraindications.exerciseId, exerciseIds)),

          coachId
            ? db
                .select({
                  exerciseId: exerciseCoachOverrides.exerciseId,
                  defaultPrescription: exerciseCoachOverrides.defaultPrescription,
                })
                .from(exerciseCoachOverrides)
                .where(
                  and(
                    inArray(exerciseCoachOverrides.exerciseId, exerciseIds),
                    eq(exerciseCoachOverrides.coachId, coachId),
                  ),
                )
            : Promise.resolve([]),
        ])
      : [[], [], [], [], [], []];

  return assembleBlueprint({
    template,
    rawSections,
    rawPrescriptions: rawPrescriptions as RawPrescription[],
    rawExercises: rawExercises as RawExercise[],
    rawMuscles: rawMuscles as RawMuscle[],
    rawRelationsOut: rawRelationsOut as RawRelationOut[],
    rawRelationsIn: rawRelationsIn as RawRelationIn[],
    rawContraindications: rawContraindications as RawContraindication[],
    rawOverrides: rawOverrides as RawOverride[],
  });
}
