import type {
  ExerciseRelationType,
  MuscleGroup,
  SubstitutionPolicy,
} from "../../lib/db/schema-exercise";

export type LegacyPrimaryMuscleRepair = {
  slug: string;
  primaryMuscle: MuscleGroup;
  reviewedDuplicatePrimaries: readonly MuscleGroup[];
};

export type HighRiskExerciseRelation = {
  sourceSlug: string;
  targetSlug: string;
  relationType: ExerciseRelationType;
  substitutionPolicy: SubstitutionPolicy;
  suitabilityScore: number;
  notes: string;
};

export const LEGACY_PRIMARY_MUSCLE_REPAIRS = [
  {
    slug: "romanian-deadlift",
    primaryMuscle: "hamstrings",
    reviewedDuplicatePrimaries: ["glutes"],
  },
  {
    slug: "dip",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["triceps"],
  },
  {
    slug: "weighted-dip",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["triceps"],
  },
  {
    slug: "bulgarian-split-squat",
    primaryMuscle: "quadriceps",
    reviewedDuplicatePrimaries: ["glutes"],
  },
  {
    slug: "arnold-press",
    primaryMuscle: "front_deltoid",
    reviewedDuplicatePrimaries: ["lateral_deltoid"],
  },
  {
    slug: "behind-neck-press",
    primaryMuscle: "front_deltoid",
    reviewedDuplicatePrimaries: ["lateral_deltoid"],
  },
  {
    slug: "handstand-push-up",
    primaryMuscle: "front_deltoid",
    reviewedDuplicatePrimaries: ["lateral_deltoid"],
  },
  {
    slug: "barbell-floor-press",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["triceps"],
  },
  {
    slug: "dumbbell-floor-press",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["triceps"],
  },
  {
    slug: "decline-push-up",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["front_deltoid"],
  },
  {
    slug: "incline-barbell-bench-press",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["front_deltoid"],
  },
  {
    slug: "incline-dumbbell-bench-press",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["front_deltoid"],
  },
  {
    slug: "incline-dumbbell-fly",
    primaryMuscle: "chest",
    reviewedDuplicatePrimaries: ["front_deltoid"],
  },
  {
    slug: "plank",
    primaryMuscle: "rectus_abdominis",
    reviewedDuplicatePrimaries: ["transverse_abdominis"],
  },
  {
    slug: "chest-supported-dumbbell-row",
    primaryMuscle: "lats",
    reviewedDuplicatePrimaries: ["upper_back", "rhomboids", "rear_deltoid"],
  },
] as const satisfies readonly LegacyPrimaryMuscleRepair[];

export const HIGH_RISK_RELATIONS = [
  // Snatch-grip deadlift: safer pull options and explicit progression pair.
  {
    sourceSlug: "snatch-grip-deadlift",
    targetSlug: "conventional-deadlift",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 82,
    notes: "Conventional deadlift preserves the heavy barbell hinge stimulus with a narrower grip and less upper-back and shoulder mobility demand.",
  },
  {
    sourceSlug: "conventional-deadlift",
    targetSlug: "snatch-grip-deadlift",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 82,
    notes: "Snatch-grip deadlift can substitute for conventional deadlift when the goal is a harder long-range pull with more upper-back demand.",
  },
  {
    sourceSlug: "snatch-grip-deadlift",
    targetSlug: "conventional-deadlift",
    relationType: "progression",
    substitutionPolicy: "coach_review",
    suitabilityScore: 78,
    notes: "Snatch-grip deadlift is a progression from conventional deadlift because the wider grip increases range of motion and positional demand.",
  },
  {
    sourceSlug: "conventional-deadlift",
    targetSlug: "snatch-grip-deadlift",
    relationType: "regression",
    substitutionPolicy: "coach_review",
    suitabilityScore: 78,
    notes: "Conventional deadlift is the regression when snatch-grip position exceeds shoulder, grip, or spinal tolerance.",
  },
  {
    sourceSlug: "trap-bar-deadlift",
    targetSlug: "snatch-grip-deadlift",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 72,
    notes: "Trap-bar loading reduces spinal shear and removes the wide-grip shoulder demand while preserving a heavy hip-hinge pull.",
  },
  {
    sourceSlug: "snatch-grip-deadlift",
    targetSlug: "trap-bar-deadlift",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 72,
    notes: "Snatch-grip deadlift carries higher spine, shoulder, and grip demand than the centered trap-bar pull.",
  },

  // Deficit deadlift and deficit RDL: standard-range and supported alternatives.
  {
    sourceSlug: "conventional-deadlift",
    targetSlug: "deficit-deadlift",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 86,
    notes: "Standard-height deadlift reduces bottom-range spinal and hamstring demand while preserving the barbell pull pattern.",
  },
  {
    sourceSlug: "deficit-deadlift",
    targetSlug: "conventional-deadlift",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 86,
    notes: "Deficit deadlift adds deeper start-position stress and should be reserved for athletes who own standard deadlift mechanics.",
  },
  {
    sourceSlug: "barbell-romanian-deadlift",
    targetSlug: "deficit-romanian-deadlift",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 90,
    notes: "Standard RDL removes the deficit while retaining the same hamstring-biased hinge pattern.",
  },
  {
    sourceSlug: "deficit-romanian-deadlift",
    targetSlug: "barbell-romanian-deadlift",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 90,
    notes: "Deficit RDL increases lengthened hamstring loading and bottom-range spinal-position demand beyond the standard RDL.",
  },
  {
    sourceSlug: "deficit-romanian-deadlift",
    targetSlug: "barbell-romanian-deadlift",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 88,
    notes: "Standard barbell RDL is the closest substitute when the deficit range is not appropriate.",
  },
  {
    sourceSlug: "barbell-romanian-deadlift",
    targetSlug: "deficit-romanian-deadlift",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 88,
    notes: "Deficit RDL can substitute for standard RDL when the planned stimulus calls for more lengthened-position loading.",
  },

  // Behind-neck press: shoulder-friendlier overhead options.
  {
    sourceSlug: "dumbbell-overhead-press",
    targetSlug: "behind-neck-press",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 82,
    notes: "Dumbbells allow natural shoulder and wrist tracking without the extreme behind-neck position.",
  },
  {
    sourceSlug: "behind-neck-press",
    targetSlug: "dumbbell-overhead-press",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 82,
    notes: "Behind-neck pressing creates higher shoulder stress than dumbbell overhead pressing due to the abducted externally rotated bar path.",
  },
  {
    sourceSlug: "landmine-press",
    targetSlug: "behind-neck-press",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 76,
    notes: "Landmine press preserves a shoulder-dominant press while using a friendlier arc below full overhead elevation.",
  },
  {
    sourceSlug: "behind-neck-press",
    targetSlug: "landmine-press",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 76,
    notes: "Behind-neck press is higher shoulder stress than landmine pressing and requires more shoulder mobility.",
  },
  {
    sourceSlug: "behind-neck-press",
    targetSlug: "barbell-overhead-press",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 84,
    notes: "Standard barbell overhead press is the closest barbell substitute with a safer front-of-body bar path.",
  },
  {
    sourceSlug: "barbell-overhead-press",
    targetSlug: "behind-neck-press",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 84,
    notes: "Behind-neck press may substitute for standard overhead press only for athletes with the required shoulder mobility and coaching oversight.",
  },

  // Advanced unilateral hinge.
  {
    sourceSlug: "single-leg-romanian-deadlift",
    targetSlug: "barbell-single-leg-romanian-deadlift",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 88,
    notes: "Dumbbell single-leg RDL preserves unilateral hinge training with less balance consequence and easier load abandonment than a barbell.",
  },
  {
    sourceSlug: "barbell-single-leg-romanian-deadlift",
    targetSlug: "single-leg-romanian-deadlift",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 88,
    notes: "Barbell single-leg RDL is higher stress because the bar increases balance and recovery demands if position fails.",
  },
  {
    sourceSlug: "barbell-single-leg-romanian-deadlift",
    targetSlug: "single-leg-romanian-deadlift",
    relationType: "progression",
    substitutionPolicy: "coach_review",
    suitabilityScore: 86,
    notes: "Barbell loading is a progression after the dumbbell single-leg RDL is stable and loading is limited by dumbbell availability.",
  },
  {
    sourceSlug: "single-leg-romanian-deadlift",
    targetSlug: "barbell-single-leg-romanian-deadlift",
    relationType: "regression",
    substitutionPolicy: "flexible",
    suitabilityScore: 86,
    notes: "Dumbbell single-leg RDL is the safer regression for athletes still building unilateral hinge control.",
  },

  // Wide-grip pull-up.
  {
    sourceSlug: "lat-pulldown",
    targetSlug: "wide-grip-pull-up",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 82,
    notes: "Lat pulldown preserves vertical pulling with adjustable load and less shoulder/elbow stress than bodyweight wide-grip pulling.",
  },
  {
    sourceSlug: "wide-grip-pull-up",
    targetSlug: "lat-pulldown",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 82,
    notes: "Wide-grip pull-up adds bodyweight loading and a more demanding shoulder position than the pulldown.",
  },
  {
    sourceSlug: "wide-grip-pull-up",
    targetSlug: "pull-up",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 88,
    notes: "Standard pull-up is the closest substitute when the wide grip creates shoulder or elbow irritation.",
  },
  {
    sourceSlug: "pull-up",
    targetSlug: "wide-grip-pull-up",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 88,
    notes: "Wide-grip pull-up can substitute for standard pull-up when the training goal is greater upper-back and shoulder-abduction demand.",
  },

  // High-risk rows.
  {
    sourceSlug: "chest-supported-dumbbell-row",
    targetSlug: "kroc-row",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 78,
    notes: "Chest support removes the heavy anti-rotation and spinal stabilization demands of Kroc rows.",
  },
  {
    sourceSlug: "kroc-row",
    targetSlug: "chest-supported-dumbbell-row",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 78,
    notes: "Kroc row is higher stress because it is intentionally heavy and allows limited body English.",
  },
  {
    sourceSlug: "kroc-row",
    targetSlug: "single-arm-dumbbell-row",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 86,
    notes: "Single-arm dumbbell row is the closest lower-intensity substitute when Kroc-row loading or fatigue is inappropriate.",
  },
  {
    sourceSlug: "single-arm-dumbbell-row",
    targetSlug: "kroc-row",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 86,
    notes: "Kroc row can substitute for single-arm dumbbell row when a heavy high-rep lat and grip stimulus is intended.",
  },
  {
    sourceSlug: "single-arm-dumbbell-row",
    targetSlug: "renegade-row",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 72,
    notes: "Bench-supported single-arm row removes loaded plank, wrist-bearing, and anti-rotation demands.",
  },
  {
    sourceSlug: "renegade-row",
    targetSlug: "single-arm-dumbbell-row",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 72,
    notes: "Renegade row adds wrist loading and trunk anti-rotation stress beyond a supported dumbbell row.",
  },
  {
    sourceSlug: "renegade-row",
    targetSlug: "chest-supported-dumbbell-row",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 70,
    notes: "Chest-supported dumbbell row is the safest row substitute when the plank component is not desired.",
  },
  {
    sourceSlug: "chest-supported-dumbbell-row",
    targetSlug: "renegade-row",
    relationType: "substitute",
    substitutionPolicy: "coach_review",
    suitabilityScore: 70,
    notes: "Renegade row can substitute when the coach wants rowing plus anti-rotation trunk demand.",
  },

  // Good morning family: safer hinges for spinal-load management.
  {
    sourceSlug: "45-degree-back-extension",
    targetSlug: "good-morning",
    relationType: "lower_joint_stress",
    substitutionPolicy: "flexible",
    suitabilityScore: 80,
    notes: "Supported back extension removes the axial barbell position while preserving hip-hinge posterior-chain stimulus.",
  },
  {
    sourceSlug: "good-morning",
    targetSlug: "45-degree-back-extension",
    relationType: "higher_joint_stress",
    substitutionPolicy: "coach_review",
    suitabilityScore: 80,
    notes: "Good morning is higher spinal stress than a supported back extension because it uses a long barbell lever on the back.",
  },
] as const satisfies readonly HighRiskExerciseRelation[];
