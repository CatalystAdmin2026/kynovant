// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Draft Validation
//
// SERVER-ONLY. Runs after every generation/regeneration and again on
// explicit "rerun validation." Never persists anything itself — the
// caller (program-generation-service.ts) stores the result on
// program_generation_drafts + a program_generation_validation_events row.
//
// Four layers, per MVP requirement D:
//   1. Exercise existence   — every referenced exerciseId must be a real
//                              row in the Exercise Library (locked rule
//                              #4/#5: never invent exercise IDs).
//   2. Exclusion enforcement — anything in brief.excludedExerciseIds is a
//                              hard exclusion (locked rule #6) — always a
//                              blocker, never merely a warning.
//   3. Equipment compatibility — a coarse, deterministic heuristic against
//                              brief.equipmentAccess. Always a warning:
//                              the signal is too imprecise to justify
//                              blocking approval on its own. Disclosed as
//                              an MVP limitation.
//   4. Structural + Kynovant Insights — per-Blueprint (day) PIL audit via
//                              the real, pure orchestrateBlueprint()
//                              (identical engine used for real, persisted
//                              Blueprints — not a reimplementation), plus
//                              a lightweight custom Program-level
//                              structural check. There is no pure
//                              in-memory equivalent of getProgramAudit()
//                              (it requires persisted rows), so the
//                              Program-level pass here is a deliberately
//                              scoped structural check, not a full M15
//                              audit — this mirrors the existing
//                              validateProgramForPublish() precedent,
//                              which likewise only checks that referenced
//                              Blueprints are active, not a full M15 pass,
//                              before real persistence.
//
// PIL severity → this feature's severity, per locked rules #7/#8:
//   error              → blocker  (Kynovant Insights blockers prevent approval)
//   warning | caution  → warning  (requires coach acknowledgement)
//   info               → info
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { inArray, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { exercises, exerciseMuscles, exerciseCoachOverrides } from "@/lib/db/schema-exercise";
import { assembleBlueprint, type RawBlueprintData } from "@/lib/pil/enrichment";
import { orchestrateBlueprint } from "@/lib/pil/blueprint-audit";
import type { BlueprintAuditResult, PilFinding, PilSeverity } from "@/lib/pil/types";
import type {
  GeneratedProgramDraft,
  GeneratedBlueprintDraft,
  ProgramGenerationBrief,
  ExerciseResolutionCandidate,
  ExerciseResolutionRecord,
} from "./contracts";

// ─────────────────────────────────────────────────────────────
// FINDING MODEL
// ─────────────────────────────────────────────────────────────

export type ValidationFindingSeverity = "blocker" | "warning" | "info";
export type DraftValidationStatus = "ready" | "warnings" | "blocked";

export interface ValidationFinding {
  id: string;
  code: string;
  severity: ValidationFindingSeverity;
  title: string;
  explanation: string;
  weekId?: string;
  dayId?: string;
  blueprintId?: string;
  sectionId?: string;
  prescriptionId?: string;
  exerciseId?: string;
  /** Populated for PROGRAM_GEN_EXERCISE_AMBIGUOUS — the real candidate
   *  rows the coach can choose from via Replace Exercise. */
  candidates?: ExerciseResolutionCandidate[];
}

export interface BlueprintValidationEntry {
  weekId: string;
  dayId: string;
  blueprintId: string;
  blueprintName: string;
  audit: BlueprintAuditResult;
}

export interface DraftValidationResult {
  status: DraftValidationStatus;
  blockers: ValidationFinding[];
  warnings: ValidationFinding[];
  info: ValidationFinding[];
  blueprintAudits: BlueprintValidationEntry[];
  unresolvedExerciseIds: string[];
}

function severityFromPil(severity: PilSeverity): ValidationFindingSeverity {
  if (severity === "error") return "blocker";
  if (severity === "warning" || severity === "caution") return "warning";
  return "info";
}

function fromPilFinding(
  f: PilFinding,
  context: { weekId: string; dayId: string; blueprintId: string },
): ValidationFinding {
  return {
    id: randomUUID(),
    code: f.code,
    severity: severityFromPil(f.severity),
    title: f.title,
    explanation: f.explanation,
    weekId: context.weekId,
    dayId: context.dayId,
    blueprintId: context.blueprintId,
    exerciseId: f.affectedEntities.find((e) => e.type === "exercise")?.id,
  };
}

// ─────────────────────────────────────────────────────────────
// REFERENCE COLLECTION
// ─────────────────────────────────────────────────────────────

interface PrescriptionRef {
  weekId: string;
  dayId: string;
  blueprintId: string;
  sectionId: string;
  prescriptionId: string;
  /** Null when exercise-resolution.ts couldn't place this name uniquely
   *  (ambiguous or unresolved) — see exerciseResolution below. */
  exerciseId: string | null;
  exerciseName: string;
  exerciseResolution?: ExerciseResolutionRecord;
}

function collectPrescriptionRefs(draft: GeneratedProgramDraft): PrescriptionRef[] {
  const refs: PrescriptionRef[] = [];
  for (const week of draft.weeks) {
    for (const day of week.days) {
      if (!day.workout) continue;
      for (const section of day.workout.sections) {
        for (const prescription of section.prescriptions) {
          refs.push({
            weekId: week.id,
            dayId: day.id,
            blueprintId: day.workout.id,
            sectionId: section.id,
            prescriptionId: prescription.id,
            exerciseId: prescription.exerciseId,
            exerciseName: prescription.exerciseName,
            exerciseResolution: prescription.exerciseResolution,
          });
        }
      }
    }
  }
  return refs;
}

// ─────────────────────────────────────────────────────────────
// EQUIPMENT COMPATIBILITY — coarse, deterministic heuristic.
// Not a substitute for real per-item equipment-catalog matching (no
// such structured data exists on the brief in the MVP — equipmentAccess
// is a coarse category the coach picks, not a list of catalog items).
// Always emits warnings, never blockers — the signal isn't precise
// enough to justify blocking approval on its own.
// ─────────────────────────────────────────────────────────────

const EQUIPMENT_ACCESS_ALLOWED_RESISTANCE: Partial<Record<ProgramGenerationBrief["equipmentAccess"], Set<string>>> = {
  bodyweight: new Set(["bodyweight"]),
  bands_only: new Set(["bodyweight", "band"]),
  dumbbells_only: new Set(["bodyweight", "dumbbell"]),
  home_gym: new Set([
    "bodyweight",
    "dumbbell",
    "kettlebell",
    "band",
    "barbell",
    "suspension",
    "medicine_ball",
    "sandbag",
  ]),
  // commercial_gym and custom are intentionally absent — treated as
  // "cannot deterministically restrict," so no equipment finding fires.
};

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export async function validateGeneratedDraft(
  draft: GeneratedProgramDraft,
  brief: ProgramGenerationBrief,
  coachId: string,
): Promise<DraftValidationResult> {
  const blockers: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];
  const info: ValidationFinding[] = [];

  const refs = collectPrescriptionRefs(draft);
  const referencedExerciseIds = Array.from(
    new Set(refs.map((r) => r.exerciseId).filter((id): id is string => id !== null)),
  );
  const excludedSet = new Set(brief.excludedExerciseIds);

  const db = getDb();

  const [exerciseRows, muscleRows, overrideRows] = referencedExerciseIds.length > 0
    ? await Promise.all([
        db.select().from(exercises).where(inArray(exercises.id, referencedExerciseIds)),
        db.select().from(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, referencedExerciseIds)),
        db
          .select()
          .from(exerciseCoachOverrides)
          .where(and(eq(exerciseCoachOverrides.coachId, coachId), inArray(exerciseCoachOverrides.exerciseId, referencedExerciseIds))),
      ])
    : [[], [], []];

  const foundExerciseIds = new Set(exerciseRows.map((e) => e.id));
  const unresolvedExerciseIds = referencedExerciseIds.filter((id) => !foundExerciseIds.has(id));

  // Layer 1: exercise existence — never invented, never fabricated.
  // Prescriptions with a null exerciseId (ambiguous/unresolved — see
  // Layer 1b below) are a distinct, more specific failure mode and are
  // skipped here rather than reported as a generic "not found."
  for (const ref of refs) {
    if (ref.exerciseId === null) continue;
    if (!foundExerciseIds.has(ref.exerciseId)) {
      blockers.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_EXERCISE_NOT_FOUND",
        severity: "blocker",
        title: "Exercise not found in library",
        explanation: `Exercise ID ${ref.exerciseId} does not match any exercise in the library. It cannot be approved.`,
        weekId: ref.weekId,
        dayId: ref.dayId,
        blueprintId: ref.blueprintId,
        sectionId: ref.sectionId,
        prescriptionId: ref.prescriptionId,
        exerciseId: ref.exerciseId,
      });
    }
  }

  // Layer 1b: unresolved/ambiguous exercise names — exercise-resolution.ts
  // couldn't place the model's exerciseName as exactly one real, active
  // library exercise. Always a blocker (there is no real id to persist),
  // never silently defaulted. The coach resolves it with the existing
  // Replace Exercise edit action, which always writes a real id.
  for (const ref of refs) {
    if (ref.exerciseId !== null) continue;
    const resolution = ref.exerciseResolution;

    if (resolution?.outcome === "ambiguous") {
      const names = resolution.candidates.map((c) => c.name).join(", ");
      blockers.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_EXERCISE_AMBIGUOUS",
        severity: "blocker",
        title: "Exercise name matched more than one library exercise",
        explanation: `"${ref.exerciseName}" matched multiple library exercises (${names || "no candidate names available"}) and could not be resolved automatically. Use Replace Exercise to choose the correct one.`,
        weekId: ref.weekId,
        dayId: ref.dayId,
        blueprintId: ref.blueprintId,
        sectionId: ref.sectionId,
        prescriptionId: ref.prescriptionId,
        candidates: resolution.candidates,
      });
    } else {
      // outcome === "unresolved", or resolution metadata is missing
      // entirely (defensive — should never happen once every
      // generation path routes through exercise-resolution.ts).
      blockers.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_EXERCISE_UNRESOLVED",
        severity: "blocker",
        title: "Exercise name did not match the library",
        explanation: `"${ref.exerciseName}" could not be matched to any exercise in the library. Use Replace Exercise to choose the correct one.`,
        weekId: ref.weekId,
        dayId: ref.dayId,
        blueprintId: ref.blueprintId,
        sectionId: ref.sectionId,
        prescriptionId: ref.prescriptionId,
      });
    }
  }

  // Layer 2: hard exclusions — always a blocker, never negotiable. Only
  // meaningful once a prescription has a real exerciseId to compare.
  for (const ref of refs) {
    if (ref.exerciseId !== null && excludedSet.has(ref.exerciseId)) {
      const row = exerciseRows.find((e) => e.id === ref.exerciseId);
      blockers.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_EXCLUDED_EXERCISE_USED",
        severity: "blocker",
        title: "Excluded exercise present in draft",
        explanation: `"${row?.name ?? ref.exerciseId}" is on the coach's excluded-exercise list for this Program and cannot be included.`,
        weekId: ref.weekId,
        dayId: ref.dayId,
        blueprintId: ref.blueprintId,
        sectionId: ref.sectionId,
        prescriptionId: ref.prescriptionId,
        exerciseId: ref.exerciseId,
      });
    }
  }

  // Layer 3: equipment compatibility — warning-only heuristic.
  const allowedResistance = EQUIPMENT_ACCESS_ALLOWED_RESISTANCE[brief.equipmentAccess];
  if (allowedResistance) {
    for (const ref of refs) {
      const row = exerciseRows.find((e) => e.id === ref.exerciseId);
      if (!row || !row.resistanceType) continue;
      if (!allowedResistance.has(row.resistanceType)) {
        warnings.push({
          id: randomUUID(),
          code: "PROGRAM_GEN_EQUIPMENT_MISMATCH",
          severity: "warning",
          title: "Exercise may not match available equipment",
          explanation: `"${row.name}" typically requires ${row.resistanceType.replace(/_/g, " ")}, which may not be available under "${brief.equipmentAccess.replace(/_/g, " ")}." Confirm before approving.`,
          weekId: ref.weekId,
          dayId: ref.dayId,
          blueprintId: ref.blueprintId,
          sectionId: ref.sectionId,
          prescriptionId: ref.prescriptionId,
          exerciseId: row.id,
        });
      }
    }
  }

  // Layer 4a: Blueprint-level Kynovant Insights — one real PIL audit per
  // training day, run in-memory against not-yet-persisted draft data via
  // the same pure assembleBlueprint()/orchestrateBlueprint() pipeline
  // used for real, persisted Blueprints.
  const blueprintAudits: BlueprintValidationEntry[] = [];
  for (const week of draft.weeks) {
    for (const day of week.days) {
      if (!day.workout) continue;
      const audit = auditDraftBlueprint(day.workout, exerciseRows, muscleRows, overrideRows, coachId);
      blueprintAudits.push({
        weekId: week.id,
        dayId: day.id,
        blueprintId: day.workout.id,
        blueprintName: day.workout.name,
        audit,
      });
      for (const f of audit.allFindings) {
        const mapped = fromPilFinding(f, { weekId: week.id, dayId: day.id, blueprintId: day.workout.id });
        if (mapped.severity === "blocker") blockers.push(mapped);
        else if (mapped.severity === "warning") warnings.push(mapped);
        else info.push(mapped);
      }
    }
  }

  // Layer 4b: Program-level structural check — deliberately lightweight;
  // see file header. Not a full M15 audit (no in-memory equivalent
  // exists), but consistent with the existing pre-persistence precedent
  // in validateProgramForPublish().
  for (const structuralFinding of checkProgramStructure(draft, brief)) {
    if (structuralFinding.severity === "blocker") blockers.push(structuralFinding);
    else if (structuralFinding.severity === "warning") warnings.push(structuralFinding);
    else info.push(structuralFinding);
  }

  const status: DraftValidationStatus =
    blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warnings" : "ready";

  return { status, blockers, warnings, info, blueprintAudits, unresolvedExerciseIds };
}

// ─────────────────────────────────────────────────────────────
// PROGRAM-LEVEL STRUCTURAL CHECK (custom, lightweight — see header)
// ─────────────────────────────────────────────────────────────

function checkProgramStructure(
  draft: GeneratedProgramDraft,
  brief: ProgramGenerationBrief,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const week of draft.weeks) {
    const trainingDays = week.days.filter((d) => d.workout !== null);
    if (trainingDays.length === 0) {
      findings.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_WEEK_ALL_REST",
        severity: "warning",
        title: "Week has no training days",
        explanation: `Week ${week.weekNumber} has no assigned workouts — every day is a rest day. Confirm this is intentional.`,
        weekId: week.id,
      });
    } else if (trainingDays.length !== brief.daysPerWeek) {
      findings.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_DAYS_PER_WEEK_MISMATCH",
        severity: "info",
        title: "Training days differ from the brief",
        explanation: `Week ${week.weekNumber} has ${trainingDays.length} training day(s); the brief requested ${brief.daysPerWeek}.`,
        weekId: week.id,
      });
    }
  }

  if (draft.weeks.length !== brief.weeks) {
    findings.push({
      id: randomUUID(),
      code: "PROGRAM_GEN_WEEK_COUNT_MISMATCH",
      severity: "info",
      title: "Program length differs from the brief",
      explanation: `The draft has ${draft.weeks.length} week(s); the brief requested ${brief.weeks}.`,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────
// PER-BLUEPRINT ENRICHMENT — reuses the real, pure assembleBlueprint()
// so draft audits run through the exact same analysis code as real,
// persisted Blueprints. Relations and contraindications are supplied as
// empty arrays: no PIL module invoked by orchestrateBlueprint() reads
// EnrichedExercise.relations or .contraindications (confirmed by
// grepping every module under lib/pil/modules/*.ts and lib/pil/*.ts) —
// only the standalone substitution service (M30) does, and that is not
// part of this audit path.
// ─────────────────────────────────────────────────────────────

function auditDraftBlueprint(
  blueprint: GeneratedBlueprintDraft,
  exerciseRows: (typeof exercises.$inferSelect)[],
  muscleRows: (typeof exerciseMuscles.$inferSelect)[],
  overrideRows: (typeof exerciseCoachOverrides.$inferSelect)[],
  coachId: string,
): BlueprintAuditResult {
  void coachId;

  const rawSections = blueprint.sections.map((s) => ({
    id: s.id,
    name: s.name,
    sectionType: s.sectionType,
    orderIndex: s.orderIndex,
    estimatedMinutes: s.estimatedMinutes ?? null,
    notes: s.notes ?? null,
  }));

  // Prescriptions with no resolved exerciseId (ambiguous/unresolved)
  // are excluded from the PIL audit input entirely — there is no real
  // exercise data for volume/fatigue/joint-stress analysis to read, and
  // conflating "AI couldn't resolve this name" with PIL's own
  // VALIDITY_EXERCISE_INACTIVE ("this id points at a deleted/archived
  // exercise") would blur two different concepts. The dedicated
  // PROGRAM_GEN_EXERCISE_AMBIGUOUS/UNRESOLVED findings (Layer 1b above)
  // already cover them.
  const rawPrescriptions = blueprint.sections.flatMap((s) =>
    s.prescriptions
      .filter((p): p is typeof p & { exerciseId: string } => p.exerciseId !== null)
      .map((p) => ({
        id: p.id,
        exerciseId: p.exerciseId,
        sectionId: s.id,
        orderIndex: p.orderIndex,
        groupId: p.groupId ?? null,
        groupPosition: p.groupPosition ?? null,
        sets: p.sets ?? null,
        repsMin: p.repsMin ?? null,
        repsMax: p.repsMax ?? null,
        durationSeconds: p.durationSeconds ?? null,
        distanceMeters: null,
        restSeconds: p.restSeconds ?? null,
        tempo: p.tempo ?? null,
        targetRpe: p.targetRpe != null ? String(p.targetRpe) : null,
        targetRir: p.targetRir != null ? String(p.targetRir) : null,
        setTechnique: p.setTechnique ?? null,
        substitutionPolicy: p.substitutionPolicy ?? null,
        isRequired: p.isRequired,
        coachNotes: p.coachNotes ?? null,
      })),
  );

  const rawData: RawBlueprintData = {
    template: {
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description ?? null,
      objective: blueprint.primaryFocus ?? null,
      status: "draft",
    },
    rawSections,
    rawPrescriptions,
    rawExercises: exerciseRows,
    rawMuscles: muscleRows,
    rawRelationsOut: [],
    rawRelationsIn: [],
    rawContraindications: [],
    rawOverrides: overrideRows.map((o) => ({ exerciseId: o.exerciseId, defaultPrescription: o.defaultPrescription })),
  };

  const enriched = assembleBlueprint(rawData);
  return orchestrateBlueprint(enriched);
}
