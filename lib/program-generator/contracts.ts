// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Strict Contracts
//
// SERVER-ONLY — never import from a Client Component (imports
// server-only schema modules).
//
// Every enum below is imported directly from the real Drizzle schema —
// never hand-duplicated — so a schema change here is impossible without
// also changing the database. This is the mechanical enforcement of
// locked safety rules #4/#5: only real Exercise Library IDs, never
// invented enum values.
//
// Three schema trees:
//   ProgramGenerationBriefSchema — coach input, validated before
//     generation starts.
//   Model*Schema (ModelProgramDraftSchema etc.) — exactly what the LLM
//     is asked to produce via generateObject(). Prescriptions carry
//     exerciseName only — never exerciseId. The model is never asked
//     to know, invent, or infer a database UUID; see
//     lib/program-generator/exercise-resolution.ts, the only place a
//     name is ever turned into a real Exercise Library id.
//   Generated*Schema (GeneratedProgramDraftSchema etc.) — the resolved,
//     persisted draft. Structurally the same tree, but each
//     prescription's exerciseId is nullable: non-null only once
//     exercise-resolution.ts has matched it to a real, unambiguous
//     library row. A null exerciseId always carries an
//     `exerciseResolution` record (outcome + candidates) explaining why,
//     which validation.ts turns into an actionable, approval-blocking
//     finding. Every week/day/section/prescription also carries a
//     stable, generator-assigned `id` (a plain string, not a DB id) so
//     edit operations can address a specific node inside draftJson
//     without it being a persisted row.
//
// Field-level validation only. Cross-referential checks that require a
// database lookup (exercise exists/active, exclusion enforcement,
// equipment compatibility) live in lib/program-generator/validation.ts —
// zod cannot make a DB call mid-parse, so this file is deliberately
// scoped to what's checkable from the payload alone.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { z } from "zod";
import {
  templateCategoryEnum,
  experienceLevelEnum,
} from "@/lib/db/schema";
import {
  workoutSectionTypeEnum,
  setTechniqueEnum,
  substitutionPolicyEnum,
  muscleGroupEnum,
} from "@/lib/db/schema-exercise";

// ─────────────────────────────────────────────────────────────
// SHARED ENUM SCHEMAS — sourced from the real DB enums, zero invention
// ─────────────────────────────────────────────────────────────

export const TemplateCategorySchema = z.enum(templateCategoryEnum.enumValues);
export const ExperienceLevelSchema = z.enum(experienceLevelEnum.enumValues);
export const WorkoutSectionTypeSchema = z.enum(workoutSectionTypeEnum.enumValues);
export const SetTechniqueSchema = z.enum(setTechniqueEnum.enumValues);
export const SubstitutionPolicySchema = z.enum(substitutionPolicyEnum.enumValues);
export const MuscleGroupSchema = z.enum(muscleGroupEnum.enumValues);

// Generation-input-only concepts — not real DB enums, never persisted as
// enum columns anywhere. Fixed here (not free text) so the prompt/
// generator has a closed vocabulary to work from, but this is a
// UX/generation concept, not an Exercise Library or Program/Blueprint
// schema value, so locked rule #5 ("never invent enum values") does not
// apply to these two.
export const PreferredSplitSchema = z.enum([
  "full_body",
  "upper_lower",
  "push_pull_legs",
  "body_part",
  "hybrid",
  "coach_decides",
]);

export const EquipmentAccessSchema = z.enum([
  "commercial_gym",
  "home_gym",
  "dumbbells_only",
  "bands_only",
  "bodyweight",
  "custom",
]);

const uuidSchema = z.string().uuid();

// ─────────────────────────────────────────────────────────────
// EXERCISE RESOLUTION OUTCOME — see exercise-resolution.ts for the
// matching logic itself. Defined here (not there) because it's part of
// the persisted prescription's schema/contract, not an implementation
// detail of the resolver.
// ─────────────────────────────────────────────────────────────

export const ExerciseResolutionOutcomeSchema = z.enum([
  "exact",
  "alternate_name",
  "strong_match",
  "ambiguous",
  "unresolved",
]);
export type ExerciseResolutionOutcome = z.infer<typeof ExerciseResolutionOutcomeSchema>;

export const ExerciseResolutionCandidateSchema = z.object({
  id: uuidSchema,
  name: z.string(),
});
export type ExerciseResolutionCandidate = z.infer<typeof ExerciseResolutionCandidateSchema>;

// Attached to a prescription only by the resolver (never by the model —
// omitted entirely from the Model*Schema tree below). Always present
// when exerciseId is null; may be present when non-null too, purely as
// an audit trail of how the match was made.
export const ExerciseResolutionRecordSchema = z.object({
  outcome: ExerciseResolutionOutcomeSchema,
  candidates: z.array(ExerciseResolutionCandidateSchema).max(10).default([]),
});
export type ExerciseResolutionRecord = z.infer<typeof ExerciseResolutionRecordSchema>;

// ─────────────────────────────────────────────────────────────
// PROGRAM BRIEF — coach input (docs/ai-program-generator-ux-spec.md §15.2,
// §6.1 for MVP field constraints)
// ─────────────────────────────────────────────────────────────

export const ProgramGenerationBriefSchema = z.object({
  goal: TemplateCategorySchema,
  goalDetail: z.string().max(2000).optional(),

  // MVP constraints per UX spec §6.1.C.
  weeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  preferredSplit: PreferredSplitSchema,
  experienceLevel: ExperienceLevelSchema,

  // MVP: multi-select only, no ordering (UX spec §6.1.D).
  musclePriorities: z.array(MuscleGroupSchema).max(10).default([]),

  equipmentAccess: EquipmentAccessSchema,
  equipmentNotes: z.string().max(2000).optional(),

  limitations: z.string().max(4000).optional(),
  movementRestrictions: z.string().max(2000).optional(),

  // Hard exclusions — must reference real exercises. Existence is
  // verified in validation.ts (DB lookup), not here.
  excludedExerciseIds: z.array(uuidSchema).max(100).default([]),
  excludedExerciseNotes: z.string().max(2000).optional(),

  allowedTechniques: z.array(SetTechniqueSchema).default(["straight_set"]),
  avoidedTechniques: z.array(SetTechniqueSchema).default([]),
  techniqueNotes: z.string().max(2000).optional(),

  targetSessionMinutes: z.number().int().min(10).max(240),
  hardSessionCap: z.boolean().default(false),
  warmupIncluded: z.boolean().default(true),

  freeformInstructions: z.string().max(4000).optional(),
})
  .refine(
    (brief) => !brief.allowedTechniques.some((t) => brief.avoidedTechniques.includes(t)),
    { message: "A technique cannot be both allowed and avoided.", path: ["avoidedTechniques"] },
  );

export type ProgramGenerationBrief = z.infer<typeof ProgramGenerationBriefSchema>;

// ─────────────────────────────────────────────────────────────
// GENERATED PROGRAM DRAFT — model output (UX spec §15.4)
//
// id fields on week/day/section/prescription are generator-assigned
// (crypto.randomUUID() at construction time — see prompt.ts/provider.ts),
// stable across coach edits, and used to address a specific node for
// edit operations. They are never DB primary keys until approval.
// ─────────────────────────────────────────────────────────────

// Base object schema kept separate from the refined version below so
// edit-ops.ts can derive a partial "patch" schema from it — z.object()
// supports .partial()/.pick(), but the z.object(...).refine(...) result
// (ZodEffects) does not.
export const GeneratedPrescriptionDraftObjectSchema = z.object({
  id: z.string().min(1),
  // Null until exercise-resolution.ts has matched exerciseName to a
  // real, unambiguous, active Exercise Library row. Never a placeholder
  // UUID (never the nil UUID, never fabricated) — null is the only
  // representation of "not yet resolved." validation.ts blocks approval
  // on any null exerciseId; the coach clears it via the existing
  // Replace Exercise edit action, which always writes a real id.
  exerciseId: uuidSchema.nullable(),
  // The model's/coach's exercise name. Authoritative source for
  // resolution; echoed here for display even after resolution succeeds
  // so the review UI never depends on a second round-trip.
  exerciseName: z.string().min(1).max(200),
  orderIndex: z.number().int().min(0),

  sets: z.number().int().min(1).max(20).optional(),
  repsMin: z.number().int().min(1).max(100).optional(),
  repsMax: z.number().int().min(1).max(100).optional(),
  durationSeconds: z.number().int().min(1).max(3600).optional(),
  restSeconds: z.number().int().min(0).max(1800).optional(),
  tempo: z.string().max(20).optional(),
  targetRpe: z.number().min(0).max(10).optional(),
  targetRir: z.number().min(0).max(20).optional(),
  setTechnique: SetTechniqueSchema.optional(),
  groupId: z.string().max(60).optional(),
  groupPosition: z.number().int().min(1).optional(),
  coachNotes: z.string().max(1000).optional(),
  isRequired: z.boolean().default(true),
  substitutionPolicy: SubstitutionPolicySchema.optional(),
  // Set only by exercise-resolution.ts. See ExerciseResolutionRecordSchema.
  exerciseResolution: ExerciseResolutionRecordSchema.optional(),
});

export const GeneratedPrescriptionDraftSchema = GeneratedPrescriptionDraftObjectSchema.refine(
  (p) => p.repsMin == null || p.repsMax == null || p.repsMin <= p.repsMax,
  { message: "repsMin must be <= repsMax.", path: ["repsMax"] },
);

// Coach-editable subset — excludes id/exerciseId/exerciseName/orderIndex,
// which are addressed or set through dedicated operations (replaceExercise,
// reorderExercises), never through a free-form prescription patch.
export const PrescriptionEditPatchSchema = GeneratedPrescriptionDraftObjectSchema.pick({
  sets: true,
  repsMin: true,
  repsMax: true,
  durationSeconds: true,
  restSeconds: true,
  tempo: true,
  targetRpe: true,
  targetRir: true,
  setTechnique: true,
  groupId: true,
  groupPosition: true,
  coachNotes: true,
  isRequired: true,
  substitutionPolicy: true,
}).partial().refine(
  (p) => p.repsMin == null || p.repsMax == null || p.repsMin <= p.repsMax,
  { message: "repsMin must be <= repsMax.", path: ["repsMax"] },
);
export type PrescriptionEditPatch = z.infer<typeof PrescriptionEditPatchSchema>;

export const GeneratedBlueprintSectionDraftSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  sectionType: WorkoutSectionTypeSchema,
  orderIndex: z.number().int().min(0),
  estimatedMinutes: z.number().int().min(1).max(300).optional(),
  notes: z.string().max(1000).optional(),
  prescriptions: z.array(GeneratedPrescriptionDraftSchema).min(1).max(30),
}).refine(
  (section) => {
    const orders = section.prescriptions.map((p) => p.orderIndex);
    return new Set(orders).size === orders.length;
  },
  { message: "Prescription orderIndex values must be unique within a section.", path: ["prescriptions"] },
);

export const GeneratedBlueprintDraftSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  primaryFocus: z.string().max(200).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(600).optional(),
  sections: z.array(GeneratedBlueprintSectionDraftSchema).min(1).max(12),
}).refine(
  (bp) => {
    const orders = bp.sections.map((s) => s.orderIndex);
    return new Set(orders).size === orders.length;
  },
  { message: "Section orderIndex values must be unique within a Blueprint.", path: ["sections"] },
);

export const GeneratedDayDraftSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  label: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  workout: GeneratedBlueprintDraftSchema.nullable(),
});

export const GeneratedWeekDraftSchema = z.object({
  id: z.string().min(1),
  weekNumber: z.number().int().min(1),
  label: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  days: z.array(GeneratedDayDraftSchema).min(1).max(7),
}).refine(
  (week) => {
    const dows = week.days.map((d) => d.dayOfWeek);
    return new Set(dows).size === dows.length;
  },
  { message: "dayOfWeek values must be unique within a week.", path: ["days"] },
);

export const GeneratedProgramDraftSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: TemplateCategorySchema,
  experienceLevel: ExperienceLevelSchema,
  defaultDurationWeeks: z.number().int().min(1).max(16),
  recommendedDaysPerWeek: z.number().int().min(1).max(7),
  weeks: z.array(GeneratedWeekDraftSchema).min(1).max(16),
}).refine(
  (program) => {
    const nums = program.weeks.map((w) => w.weekNumber);
    return new Set(nums).size === nums.length;
  },
  { message: "weekNumber values must be unique within a Program.", path: ["weeks"] },
);

export type GeneratedPrescriptionDraft = z.infer<typeof GeneratedPrescriptionDraftSchema>;
export type GeneratedBlueprintSectionDraft = z.infer<typeof GeneratedBlueprintSectionDraftSchema>;
export type GeneratedBlueprintDraft = z.infer<typeof GeneratedBlueprintDraftSchema>;
export type GeneratedDayDraft = z.infer<typeof GeneratedDayDraftSchema>;
export type GeneratedWeekDraft = z.infer<typeof GeneratedWeekDraftSchema>;
export type GeneratedProgramDraft = z.infer<typeof GeneratedProgramDraftSchema>;

// ─────────────────────────────────────────────────────────────
// MODEL OUTPUT DRAFT — exactly what generateObject() asks the LLM to
// produce (lib/program-generator/provider.ts). Structurally identical
// to the Generated*Schema tree above, except prescriptions carry
// exerciseName only. The model is never given a schema field it could
// fill with a fabricated or nil-UUID id — the field simply isn't part
// of this contract, which is what makes the earlier zero-UUID-for-
// every-exercise failure mode structurally impossible rather than
// merely discouraged in prompt text.
//
// lib/program-generator/exercise-resolution.ts is the sole place a
// ModelProgramDraft is turned into a GeneratedProgramDraft.
// ─────────────────────────────────────────────────────────────

export const ModelPrescriptionObjectSchema = GeneratedPrescriptionDraftObjectSchema.omit({
  exerciseId: true,
  exerciseResolution: true,
});

export const ModelPrescriptionSchema = ModelPrescriptionObjectSchema.refine(
  (p) => p.repsMin == null || p.repsMax == null || p.repsMin <= p.repsMax,
  { message: "repsMin must be <= repsMax.", path: ["repsMax"] },
);

export const ModelBlueprintSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  sectionType: WorkoutSectionTypeSchema,
  orderIndex: z.number().int().min(0),
  estimatedMinutes: z.number().int().min(1).max(300).optional(),
  notes: z.string().max(1000).optional(),
  prescriptions: z.array(ModelPrescriptionSchema).min(1).max(30),
}).refine(
  (section) => {
    const orders = section.prescriptions.map((p) => p.orderIndex);
    return new Set(orders).size === orders.length;
  },
  { message: "Prescription orderIndex values must be unique within a section.", path: ["prescriptions"] },
);

export const ModelBlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  primaryFocus: z.string().max(200).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(600).optional(),
  sections: z.array(ModelBlueprintSectionSchema).min(1).max(12),
}).refine(
  (bp) => {
    const orders = bp.sections.map((s) => s.orderIndex);
    return new Set(orders).size === orders.length;
  },
  { message: "Section orderIndex values must be unique within a Blueprint.", path: ["sections"] },
);

export const ModelDayDraftSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  label: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  workout: ModelBlueprintSchema.nullable(),
});

export const ModelWeekDraftSchema = z.object({
  id: z.string().min(1),
  weekNumber: z.number().int().min(1),
  label: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  days: z.array(ModelDayDraftSchema).min(1).max(7),
}).refine(
  (week) => {
    const dows = week.days.map((d) => d.dayOfWeek);
    return new Set(dows).size === dows.length;
  },
  { message: "dayOfWeek values must be unique within a week.", path: ["days"] },
);

export const ModelProgramDraftSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: TemplateCategorySchema,
  experienceLevel: ExperienceLevelSchema,
  defaultDurationWeeks: z.number().int().min(1).max(16),
  recommendedDaysPerWeek: z.number().int().min(1).max(7),
  weeks: z.array(ModelWeekDraftSchema).min(1).max(16),
}).refine(
  (program) => {
    const nums = program.weeks.map((w) => w.weekNumber);
    return new Set(nums).size === nums.length;
  },
  { message: "weekNumber values must be unique within a Program.", path: ["weeks"] },
);

export type ModelPrescription = z.infer<typeof ModelPrescriptionSchema>;
export type ModelBlueprintSection = z.infer<typeof ModelBlueprintSectionSchema>;
export type ModelBlueprint = z.infer<typeof ModelBlueprintSchema>;
export type ModelDayDraft = z.infer<typeof ModelDayDraftSchema>;
export type ModelWeekDraft = z.infer<typeof ModelWeekDraftSchema>;
export type ModelProgramDraft = z.infer<typeof ModelProgramDraftSchema>;

// ─────────────────────────────────────────────────────────────
// PARSE HELPERS — return a discriminated result instead of throwing,
// so callers (the provider adapter, edit endpoints) can produce a safe
// failure state per locked rule "no unknown enum values" / "strict
// schema rejection" rather than an unhandled exception.
// ─────────────────────────────────────────────────────────────

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: z.ZodIssue[] };

export function parseProgramGenerationBrief(input: unknown): ParseResult<ProgramGenerationBrief> {
  const result = ProgramGenerationBriefSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: "Program Brief failed validation.", issues: result.error.issues };
  }
  return { ok: true, data: result.data };
}

export function parseGeneratedProgramDraft(input: unknown): ParseResult<GeneratedProgramDraft> {
  const result = GeneratedProgramDraftSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: "Generated draft failed schema validation.", issues: result.error.issues };
  }
  return { ok: true, data: result.data };
}

export function parseModelProgramDraft(input: unknown): ParseResult<ModelProgramDraft> {
  const result = ModelProgramDraftSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: "Model output draft failed schema validation.", issues: result.error.issues };
  }
  return { ok: true, data: result.data };
}
