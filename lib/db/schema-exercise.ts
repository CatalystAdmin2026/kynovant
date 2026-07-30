// ─────────────────────────────────────────────────────────────
// Catalyst OS — Exercise Library & Workout Blueprint Schema
//
// SERVER-ONLY — never import this file from a client component.
// Defines the Sprint 5C.1 exercise catalog and workout blueprint
// data model using Drizzle ORM.
//
// Tables:
//   exercises, exercise_muscles, equipment_catalog,
//   exercise_equipment, exercise_relations, exercise_cues,
//   exercise_media, exercise_contraindications,
//   workout_template_sections, workout_template_exercises
//
// Reuses from schema.ts: templateStatusEnum, users, workoutTemplates
// ─────────────────────────────────────────────────────────────

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core/columns/common";
import { users, workoutTemplates, templateStatusEnum } from "./schema";

// tsvector custom type (read-only generated column — never written by Drizzle)
const tsvector = customType<{ data: string }>({
  dataType() { return "tsvector"; },
});

// ─────────────────────────────────────────────────────────────
// POSTGRES ENUMS
// ─────────────────────────────────────────────────────────────

export const muscleGroupEnum = pgEnum("muscle_group", [
  "chest",
  "front_deltoid",
  "lateral_deltoid",
  "rear_deltoid",
  "upper_back",
  "lats",
  "rhomboids",
  "trapezius",
  "triceps",
  "biceps",
  "brachialis",
  "brachioradialis",
  "forearms",
  "rectus_abdominis",
  "obliques",
  "transverse_abdominis",
  "spinal_erectors",
  "multifidus",
  "glutes",
  "hip_flexors",
  "adductors",
  "abductors",
  "quadriceps",
  "hamstrings",
  "calves",
  "tibialis",
  "cardiovascular",
]);

export const movementPatternEnum = pgEnum("movement_pattern", [
  "push_vertical",
  "push_horizontal",
  "pull_vertical",
  "pull_horizontal",
  "hip_hinge",
  "squat_bilateral",
  "squat_unilateral",
  "lunge",
  "carry",
  "rotation",
  "anti_rotation",
  "gait",
  "jump",
  "throw",
  "iso_hold",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_abduction",
  "shoulder_adduction",
  "knee_flexion",
  "knee_extension",
  "hip_extension",
  "hip_flexion",
  "scapular_retraction",
  "scapular_depression",
  "external_rotation",
  "internal_rotation",
]);

export const exerciseClassificationEnum = pgEnum("exercise_classification", [
  "compound",
  "isolation",
  "cardio",
  "mobility",
  "power",
  "skill",
]);

export const resistanceTypeEnum = pgEnum("resistance_type", [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "band",
  "bodyweight",
  "smith_machine",
  "trap_bar",
  "suspension",
  "plate_loaded",
  "medicine_ball",
  "sandbag",
  "chains",
  "landmine",
]);

export const exerciseDifficultyEnum = pgEnum("exercise_difficulty", [
  "beginner",
  "intermediate",
  "advanced",
  "specialist",
]);

export const bodyPositionEnum = pgEnum("body_position", [
  "standing",
  "seated",
  "lying_supine",
  "lying_prone",
  "incline",
  "decline",
  "kneeling",
  "split_stance",
  "hinge_position",
  "quadruped",
  "hanging",
]);

export const muscleRoleEnum = pgEnum("muscle_role", [
  "primary",
  "secondary",
  "stabilizer",
]);

export const equipmentRequirementEnum = pgEnum("equipment_requirement", [
  "required",
  "optional",
  "alternative",
]);

export const exerciseRelationTypeEnum = pgEnum("exercise_relation_type", [
  "regression",
  "progression",
  "substitute",
  "lower_joint_stress",
  "higher_joint_stress",
  "same_pattern",
  "contralateral",
]);

export const exerciseCueTypeEnum = pgEnum("exercise_cue_type", [
  "setup",
  "breathing",
  "execution",
  "mental_cue",
  "safety",
  "common_error",
  "correction",
  "coaching_tip",
]);

export const exerciseMediaTypeEnum = pgEnum("exercise_media_type", [
  "video_demo",
  "technique_image",
  "form_cue_image",
  "anatomy_overlay",
  "exercise_card",
]);

export const contraindicationSeverityEnum = pgEnum(
  "contraindication_severity",
  ["avoid", "modify", "monitor"],
);

export const workoutSectionTypeEnum = pgEnum("workout_section_type", [
  "warmup",
  "activation",
  "potentiation",
  "main_lift",
  "accessory",
  "conditioning",
  "finisher",
  "cooldown",
  "rest_period",
]);

export const setTechniqueEnum = pgEnum("set_technique", [
  "straight_set",
  "superset",
  "triset",
  "giant_set",
  "drop_set",
  "mechanical_drop_set",
  "tension_drop_set",
  "rest_pause",
  "cluster_set",
  "myo_reps",
  "lengthened_partials",
  "stretch_mediated_finisher",
  "tempo_set",
  "isometric",
  "circuit",
]);

export const substitutionPolicyEnum = pgEnum("substitution_policy", [
  "strict",
  "flexible",
  "coach_review",
  "no_substitute",
]);

export const exerciseScopeEnum = pgEnum("exercise_scope", [
  "system",
  "organization",
  "coach",
]);

// ─────────────────────────────────────────────────────────────
// TABLE 1 — exercises
//
// The canonical exercise catalog. Rows are immutable once referenced
// by an active workout_template. Create a new row (with parentExerciseId
// pointing to the prior version) rather than mutating a published record.
//
// Scoring fields (1–10 or 0–10):
//   fatigueCost, technicalComplexity, stabilityDemand — 1 = low, 10 = high
//   Joint stress fields — 0 = no load, 10 = extreme load on that joint
//   lengthenedBias, shortenedBias — 0 = none, 10 = extreme
//   stretchMediatedPotential — 0 = none, 10 = maximal
// ─────────────────────────────────────────────────────────────

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    alternateNames: jsonb("alternate_names").notNull().default([]),
    movementPattern: movementPatternEnum("movement_pattern").notNull(),
    classification: exerciseClassificationEnum("classification").notNull(),
    difficulty: exerciseDifficultyEnum("difficulty").notNull(),
    resistanceType: resistanceTypeEnum("resistance_type"),
    status: templateStatusEnum("status").notNull().default("draft"),
    parentExerciseId: uuid("parent_exercise_id").references(
      (): AnyPgColumn => exercises.id,
      { onDelete: "set null" },
    ),
    unilateral: boolean("unilateral").notNull().default(false),
    alternating: boolean("alternating").notNull().default(false),
    isTimeBased: boolean("is_time_based").notNull().default(false),
    isDistanceBased: boolean("is_distance_based").notNull().default(false),
    isCardio: boolean("is_cardio").notNull().default(false),
    isMobility: boolean("is_mobility").notNull().default(false),
    // 1–10 scoring fields
    fatigueCost: integer("fatigue_cost"),
    technicalComplexity: integer("technical_complexity"),
    stabilityDemand: integer("stability_demand"),
    // 0–10 joint stress fields
    jointStressShoulder: integer("joint_stress_shoulder"),
    jointStressElbow: integer("joint_stress_elbow"),
    jointStressWrist: integer("joint_stress_wrist"),
    jointStressSpine: integer("joint_stress_spine"),
    jointStressHip: integer("joint_stress_hip"),
    jointStressKnee: integer("joint_stress_knee"),
    jointStressAnkle: integer("joint_stress_ankle"),
    // 0–10 biomechanical profile
    lengthenedBias: integer("lengthened_bias"),
    shortenedBias: integer("shortened_bias"),
    stretchMediatedPotential: integer("stretch_mediated_potential"),
    defaultBodyPosition: bodyPositionEnum("default_body_position"),
    defaultNotes: text("default_notes"),
    coachCreated: boolean("coach_created").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    scope: exerciseScopeEnum("scope").notNull().default("coach"),
    primaryMuscleGroup: muscleGroupEnum("primary_muscle_group"),
    tags: jsonb("tags").notNull().default([]),
    defaultPrescription: jsonb("default_prescription"),
    // Generated tsvector — Postgres maintains this; never written by Drizzle
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exercise_slug").on(table.slug),
    index("idx_exercises_status").on(table.status),
    index("idx_exercises_movement_pattern").on(table.movementPattern),
    index("idx_exercises_classification").on(table.classification),
    index("idx_exercises_difficulty").on(table.difficulty),
    index("idx_exercises_parent").on(table.parentExerciseId),
    index("idx_exercises_scope").on(table.scope),
    index("idx_exercises_primary_muscle_group").on(table.primaryMuscleGroup),
    check(
      "chk_exercise_fatigue_cost",
      sql`${table.fatigueCost} IS NULL OR (${table.fatigueCost} >= 1 AND ${table.fatigueCost} <= 10)`,
    ),
    check(
      "chk_exercise_technical_complexity",
      sql`${table.technicalComplexity} IS NULL OR (${table.technicalComplexity} >= 1 AND ${table.technicalComplexity} <= 10)`,
    ),
    check(
      "chk_exercise_stability_demand",
      sql`${table.stabilityDemand} IS NULL OR (${table.stabilityDemand} >= 1 AND ${table.stabilityDemand} <= 10)`,
    ),
    check(
      "chk_joint_stress_shoulder",
      sql`${table.jointStressShoulder} IS NULL OR (${table.jointStressShoulder} >= 0 AND ${table.jointStressShoulder} <= 10)`,
    ),
    check(
      "chk_joint_stress_elbow",
      sql`${table.jointStressElbow} IS NULL OR (${table.jointStressElbow} >= 0 AND ${table.jointStressElbow} <= 10)`,
    ),
    check(
      "chk_joint_stress_wrist",
      sql`${table.jointStressWrist} IS NULL OR (${table.jointStressWrist} >= 0 AND ${table.jointStressWrist} <= 10)`,
    ),
    check(
      "chk_joint_stress_spine",
      sql`${table.jointStressSpine} IS NULL OR (${table.jointStressSpine} >= 0 AND ${table.jointStressSpine} <= 10)`,
    ),
    check(
      "chk_joint_stress_hip",
      sql`${table.jointStressHip} IS NULL OR (${table.jointStressHip} >= 0 AND ${table.jointStressHip} <= 10)`,
    ),
    check(
      "chk_joint_stress_knee",
      sql`${table.jointStressKnee} IS NULL OR (${table.jointStressKnee} >= 0 AND ${table.jointStressKnee} <= 10)`,
    ),
    check(
      "chk_joint_stress_ankle",
      sql`${table.jointStressAnkle} IS NULL OR (${table.jointStressAnkle} >= 0 AND ${table.jointStressAnkle} <= 10)`,
    ),
    check(
      "chk_exercise_lengthened_bias",
      sql`${table.lengthenedBias} IS NULL OR (${table.lengthenedBias} >= 0 AND ${table.lengthenedBias} <= 10)`,
    ),
    check(
      "chk_exercise_shortened_bias",
      sql`${table.shortenedBias} IS NULL OR (${table.shortenedBias} >= 0 AND ${table.shortenedBias} <= 10)`,
    ),
    check(
      "chk_exercise_smp",
      sql`${table.stretchMediatedPotential} IS NULL OR (${table.stretchMediatedPotential} >= 0 AND ${table.stretchMediatedPotential} <= 10)`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 2 — exercise_muscles
//
// Which muscles an exercise loads and at what role. emphasisPercent
// is optional guidance (0–100) — not required to sum to 100.
// ─────────────────────────────────────────────────────────────

export const exerciseMuscles = pgTable(
  "exercise_muscles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    muscleGroup: muscleGroupEnum("muscle_group").notNull(),
    role: muscleRoleEnum("role").notNull(),
    emphasisPercent: numeric("emphasis_percent", { precision: 5, scale: 2 }),
  },
  (table) => [
    uniqueIndex("uq_exercise_muscle_role").on(
      table.exerciseId,
      table.muscleGroup,
      table.role,
    ),
    index("idx_exercise_muscles_exercise_id").on(table.exerciseId),
    index("idx_exercise_muscles_muscle_group").on(table.muscleGroup),
    check(
      "chk_emphasis_percent",
      sql`${table.emphasisPercent} IS NULL OR (${table.emphasisPercent} >= 0 AND ${table.emphasisPercent} <= 100)`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 3 — equipment_catalog
//
// Reference table for discrete equipment items. Used as the FK
// target for exercise_equipment. Coaches can extend this table
// to match their facility or client home-gym setups.
// ─────────────────────────────────────────────────────────────

export const equipmentCatalog = pgTable(
  "equipment_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    brand: text("brand"),
    description: text("description"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_equipment_slug").on(table.slug),
    index("idx_equipment_catalog_category").on(table.category),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 4 — exercise_equipment
//
// Maps exercises to equipment items with a requirement type.
//   required   — the exercise cannot be performed without this item
//   optional   — the item improves the exercise but is not mandatory
//   alternative — this item can substitute for another listed item
// ─────────────────────────────────────────────────────────────

export const exerciseEquipment = pgTable(
  "exercise_equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    equipmentCatalogId: uuid("equipment_catalog_id")
      .notNull()
      .references(() => equipmentCatalog.id, { onDelete: "restrict" }),
    requirementType: equipmentRequirementEnum("requirement_type").notNull(),
  },
  (table) => [
    uniqueIndex("uq_exercise_equipment_type").on(
      table.exerciseId,
      table.equipmentCatalogId,
      table.requirementType,
    ),
    index("idx_exercise_equipment_exercise_id").on(table.exerciseId),
    index("idx_exercise_equipment_catalog_id").on(table.equipmentCatalogId),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 5 — exercise_relations
//
// Directed relationships between exercises. The source exercise
// is the "from" side. For regressions, source is the simpler exercise;
// for progressions, source is the harder exercise.
//
// Example: (leg_press → back_squat, type=lower_joint_stress) means
// "leg press is a lower-joint-stress alternative to back squat".
// ─────────────────────────────────────────────────────────────

export const exerciseRelations = pgTable(
  "exercise_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceExerciseId: uuid("source_exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    targetExerciseId: uuid("target_exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    relationType: exerciseRelationTypeEnum("relation_type").notNull(),
    substitutionPolicy: substitutionPolicyEnum("substitution_policy"),
    // How suitable this relation is as a substitution (1 = poor, 100 = ideal).
    suitabilityScore: integer("suitability_score"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exercise_relation_type").on(
      table.sourceExerciseId,
      table.targetExerciseId,
      table.relationType,
    ),
    index("idx_exercise_relations_source").on(table.sourceExerciseId),
    index("idx_exercise_relations_target").on(table.targetExerciseId),
    index("idx_exercise_relations_type").on(table.relationType),
    check(
      "chk_suitability_score",
      sql`${table.suitabilityScore} IS NULL OR (${table.suitabilityScore} >= 1 AND ${table.suitabilityScore} <= 100)`,
    ),
    check(
      "chk_no_self_relation",
      sql`${table.sourceExerciseId} != ${table.targetExerciseId}`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 6 — exercise_cues
//
// Coaching cues attached to exercises. Ordered by orderIndex.
// isPublic = true means the cue can be shown to clients in the portal.
// isPublic = false means it is for coach reference only.
// ─────────────────────────────────────────────────────────────

export const exerciseCues = pgTable(
  "exercise_cues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    cueType: exerciseCueTypeEnum("cue_type").notNull(),
    content: text("content").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exercise_cue_position").on(
      table.exerciseId,
      table.cueType,
      table.orderIndex,
    ),
    index("idx_exercise_cues_exercise_id").on(table.exerciseId),
    index("idx_exercise_cues_type").on(table.cueType),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 7 — exercise_media
//
// Video or image assets for an exercise. Only one row per exercise
// should have isPrimary = true; application logic enforces this.
// ─────────────────────────────────────────────────────────────

export const exerciseMedia = pgTable(
  "exercise_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    mediaType: exerciseMediaTypeEnum("media_type").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    caption: text("caption"),
    isPrimary: boolean("is_primary").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_exercise_media_exercise_id").on(table.exerciseId),
    index("idx_exercise_media_type").on(table.mediaType),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 8 — exercise_contraindications
//
// Medical or injury conditions that interact with an exercise.
//   avoid   — exercise must not be performed with this condition
//   modify  — exercise can be performed with a prescribed modification
//   monitor — exercise is allowed but requires closer attention
//
// suggestedRelationId links to an exercise_relations row that
// describes the recommended alternative when this exercise is avoided.
// ─────────────────────────────────────────────────────────────

export const exerciseContraindications = pgTable(
  "exercise_contraindications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    conditionOrInjury: text("condition_or_injury").notNull(),
    bodyRegion: text("body_region"),
    severity: contraindicationSeverityEnum("severity").notNull(),
    modificationNote: text("modification_note"),
    suggestedRelationId: uuid("suggested_relation_id").references(
      () => exerciseRelations.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_exercise_contraindications_exercise_id").on(table.exerciseId),
    index("idx_exercise_contraindications_severity").on(table.severity),
    index("idx_exercise_contraindications_body_region").on(table.bodyRegion),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 9 — workout_template_sections
//
// Ordered sections within a workout template (warmup, main lift,
// conditioning, cooldown, etc.). Exercises inside a section are
// stored in workout_template_exercises.
// ─────────────────────────────────────────────────────────────

export const workoutTemplateSections = pgTable(
  "workout_template_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutTemplateId: uuid("workout_template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sectionType: workoutSectionTypeEnum("section_type").notNull(),
    orderIndex: integer("order_index").notNull(),
    estimatedMinutes: integer("estimated_minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_section_order").on(
      table.workoutTemplateId,
      table.orderIndex,
    ),
    index("idx_wt_sections_template_id").on(table.workoutTemplateId),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 10 — workout_template_exercises
//
// Exercise prescriptions within a workout template.
//
// Prescription fields:
//   sets, repsMin/repsMax — rep range (repsMin ≤ repsMax enforced)
//   duration   — seconds (for time-based exercises like planks)
//   distanceMeters — for gait/cardio exercises
//   restSeconds — prescribed rest between sets
//   tempo      — 4-character string (eccentric/pause/concentric/pause)
//   targetRpe  — 0–10 rate of perceived exertion
//   targetRir  — 0–4+ reps in reserve
//   setTechnique — how sets are organized (straight, superset, etc.)
//
// Grouping:
//   groupId    — shared UUID among exercises in the same superset/triset
//   groupPosition — position within the group (1, 2, 3…)
// ─────────────────────────────────────────────────────────────

export const workoutTemplateExercises = pgTable(
  "workout_template_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutTemplateId: uuid("workout_template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(
      () => workoutTemplateSections.id,
      { onDelete: "set null" },
    ),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull(),
    groupId: uuid("group_id"),
    groupPosition: integer("group_position"),
    sets: integer("sets"),
    repsMin: integer("reps_min"),
    repsMax: integer("reps_max"),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: numeric("distance_meters", { precision: 8, scale: 2 }),
    restSeconds: integer("rest_seconds"),
    tempo: text("tempo"),
    targetRpe: numeric("target_rpe", { precision: 3, scale: 1 }),
    targetRir: numeric("target_rir", { precision: 3, scale: 1 }),
    setTechnique: setTechniqueEnum("set_technique"),
    substitutionPolicy: substitutionPolicyEnum("substitution_policy"),
    isRequired: boolean("is_required").notNull().default(true),
    coachNotes: text("coach_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_wte_order").on(
      table.workoutTemplateId,
      table.sectionId,
      table.orderIndex,
    ),
    index("idx_wte_template_id").on(table.workoutTemplateId),
    index("idx_wte_section_id").on(table.sectionId),
    index("idx_wte_exercise_id").on(table.exerciseId),
    index("idx_wte_group_id").on(table.groupId),
    check(
      "chk_reps_min_max",
      sql`${table.repsMin} IS NULL OR ${table.repsMax} IS NULL OR ${table.repsMin} <= ${table.repsMax}`,
    ),
    check(
      "chk_target_rpe",
      sql`${table.targetRpe} IS NULL OR (${table.targetRpe} >= 0 AND ${table.targetRpe} <= 10)`,
    ),
    check(
      "chk_target_rir",
      sql`${table.targetRir} IS NULL OR ${table.targetRir} >= 0`,
    ),
    check(
      "chk_sets_positive",
      sql`${table.sets} IS NULL OR ${table.sets} > 0`,
    ),
    check(
      "chk_rest_seconds_nonneg",
      sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`,
    ),
    check(
      "chk_group_position_positive",
      sql`${table.groupPosition} IS NULL OR ${table.groupPosition} >= 1`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// INFERRED TYPESCRIPT TYPES
// ─────────────────────────────────────────────────────────────

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

export type ExerciseMuscle = typeof exerciseMuscles.$inferSelect;
export type NewExerciseMuscle = typeof exerciseMuscles.$inferInsert;

export type EquipmentCatalogItem = typeof equipmentCatalog.$inferSelect;
export type NewEquipmentCatalogItem = typeof equipmentCatalog.$inferInsert;

export type ExerciseEquipment = typeof exerciseEquipment.$inferSelect;
export type NewExerciseEquipment = typeof exerciseEquipment.$inferInsert;

export type ExerciseRelation = typeof exerciseRelations.$inferSelect;
export type NewExerciseRelation = typeof exerciseRelations.$inferInsert;

export type ExerciseCue = typeof exerciseCues.$inferSelect;
export type NewExerciseCue = typeof exerciseCues.$inferInsert;

export type ExerciseMedia = typeof exerciseMedia.$inferSelect;
export type NewExerciseMedia = typeof exerciseMedia.$inferInsert;

export type ExerciseContraindication =
  typeof exerciseContraindications.$inferSelect;
export type NewExerciseContraindication =
  typeof exerciseContraindications.$inferInsert;

export type WorkoutTemplateSection =
  typeof workoutTemplateSections.$inferSelect;
export type NewWorkoutTemplateSection =
  typeof workoutTemplateSections.$inferInsert;

export type WorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferSelect;
export type NewWorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferInsert;

// ─────────────────────────────────────────────────────────────
// TABLE 11 — exercise_favorites
//
// Coach stars on exercises. Used for the Favorites filter in the
// Exercise Library and the "Recently Used" picker in blueprints.
// One row per (exerciseId, coachId) pair.
// ─────────────────────────────────────────────────────────────

export const exerciseFavorites = pgTable(
  "exercise_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exercise_favorite").on(table.exerciseId, table.coachId),
    index("idx_exercise_favorites_coach_id").on(table.coachId),
    index("idx_exercise_favorites_exercise_id").on(table.exerciseId),
  ],
);

// ─────────────────────────────────────────────────────────────
// TABLE 12 — exercise_coach_overrides
//
// Per-coach overrides for system exercises. Allows a coach to set
// their preferred default prescription and private notes without
// modifying the canonical exercise record.
//
// privateNotes is never shown to clients — coach reference only.
// ─────────────────────────────────────────────────────────────

export const exerciseCoachOverrides = pgTable(
  "exercise_coach_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultPrescription: jsonb("default_prescription"),
    privateNotes: text("private_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exercise_coach_override").on(table.exerciseId, table.coachId),
    index("idx_exercise_coach_overrides_coach_id").on(table.coachId),
    index("idx_exercise_coach_overrides_exercise_id").on(table.exerciseId),
  ],
);

export type ExerciseFavorite = typeof exerciseFavorites.$inferSelect;
export type NewExerciseFavorite = typeof exerciseFavorites.$inferInsert;

export type ExerciseCoachOverride = typeof exerciseCoachOverrides.$inferSelect;
export type NewExerciseCoachOverride = typeof exerciseCoachOverrides.$inferInsert;

// Enum value types
export type ExerciseScope = (typeof exerciseScopeEnum.enumValues)[number];
export type MuscleGroup = (typeof muscleGroupEnum.enumValues)[number];
export type MovementPattern = (typeof movementPatternEnum.enumValues)[number];
export type ExerciseClassification =
  (typeof exerciseClassificationEnum.enumValues)[number];
export type ResistanceType = (typeof resistanceTypeEnum.enumValues)[number];
export type ExerciseDifficulty =
  (typeof exerciseDifficultyEnum.enumValues)[number];
export type BodyPosition = (typeof bodyPositionEnum.enumValues)[number];
export type MuscleRole = (typeof muscleRoleEnum.enumValues)[number];
export type EquipmentRequirement =
  (typeof equipmentRequirementEnum.enumValues)[number];
export type ExerciseRelationType =
  (typeof exerciseRelationTypeEnum.enumValues)[number];
export type ExerciseCueType = (typeof exerciseCueTypeEnum.enumValues)[number];
export type ExerciseMediaType =
  (typeof exerciseMediaTypeEnum.enumValues)[number];
export type ContraindicationSeverity =
  (typeof contraindicationSeverityEnum.enumValues)[number];
export type WorkoutSectionType =
  (typeof workoutSectionTypeEnum.enumValues)[number];
export type SetTechnique = (typeof setTechniqueEnum.enumValues)[number];
export type SubstitutionPolicy =
  (typeof substitutionPolicyEnum.enumValues)[number];
