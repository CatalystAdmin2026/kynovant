// ─────────────────────────────────────────────────────────────
// Catalyst OS — Programming Intelligence Layer: Core Type System
//
// SERVER-ONLY. Never import this file from a client component.
//
// Every PIL analysis module is a pure function that consumes
// EnrichedBlueprint and returns types defined here. The enrichment
// service (lib/pil/enrichment.ts) is the only PIL file that
// queries the database — all modules receive pre-fetched data.
//
// Finding codes are the stable identity key for findings across
// runs. Format: CATEGORY_RULE_QUALIFIER (e.g. VOLUME_HIGH_DIRECT).
// Do not rename a code after it has been surfaced to coaches.
//
// Customer-facing branding: "Kynovant Insights → Training"
// Internal architecture name: Programming Intelligence Layer (PIL)
// These must never appear in the same context.
// ─────────────────────────────────────────────────────────────

// ─── Severity and Confidence ──────────────────────────────────────────────────

/**
 * error:    Definitively wrong regardless of coaching philosophy. Blocks Blueprint publication.
 * warning:  Evidence-informed guideline with a defensible threshold.
 * caution:  Reasonable heuristic that may not apply universally. Coach judgment welcomed.
 * info:     Observation without a universal right answer.
 */
export type PilSeverity = "error" | "warning" | "caution" | "info";

/**
 * certain:          Binary condition — no ambiguity about whether the rule fired.
 * heuristic:        Threshold is evidence-informed but coaching philosophy may override.
 * incomplete_data:  Finding cannot be fully computed because required library data is absent.
 */
export type PilConfidence = "certain" | "heuristic" | "incomplete_data";

// ─── Finding Building Blocks ──────────────────────────────────────────────────

export interface PilEvidenceFact {
  label: string;
  value: string | number;
}

export type PilAffectedEntityType =
  | "exercise"
  | "muscle"
  | "joint"
  | "section"
  | "day"
  | "week";

export interface PilAffectedEntity {
  type: PilAffectedEntityType;
  id: string;
  name: string;
}

export type PilSuggestedActionType =
  | "substitute"
  | "remove"
  | "reorder"
  | "adjust_volume"
  | "add_exercise"
  | "adjust_rest"
  | "increase_frequency";

export interface PilSuggestedAction {
  label: string;
  type: PilSuggestedActionType;
  /** Exercise to replace or remove */
  sourceExerciseId?: string;
  /** Pre-computed candidates from the Substitution Service (M30) */
  candidateExerciseIds?: string[];
  /** For frequency or day-of-week adjustments */
  targetDayOfWeek?: number;
  /** For program-level week adjustments */
  targetWeekNumbers?: number[];
  /** For volume adjustment suggestions */
  volumeAdjustment?: {
    muscleGroup: MuscleGroup;
    setsDelta: number;
  };
}

// ─── Core Finding Type ────────────────────────────────────────────────────────

export interface PilFinding {
  /**
   * Run-scoped UUID for React keying. NOT stable across analysis runs.
   * Use `code` as the stable identity key for finding persistence.
   */
  id: string;
  /**
   * Stable string identifier. Format: CATEGORY_RULE_QUALIFIER.
   * Examples: 'VALIDITY_REPS_INVERTED', 'VOLUME_HIGH_DIRECT', 'RECOVERY_SAME_DAY'.
   */
  code: string;
  category: PilCategory;
  severity: PilSeverity;
  confidence: PilConfidence;
  title: string;
  explanation: string;
  evidence: PilEvidenceFact[];
  affectedEntities: PilAffectedEntity[];
  suggestedActions?: PilSuggestedAction[];
}

export type PilCategory =
  | "validity"
  | "volume"
  | "fatigue"
  | "movement"
  | "joint_stress"
  | "redundancy"
  | "duration"
  | "muscle_balance"
  | "biomechanics"
  | "intensity"
  | "superset"
  | "ordering"
  | "complexity"
  | "program_structure"
  | "frequency"
  | "recovery"
  | "progression"
  | "periodization"
  | "deload"
  | "diversity"
  | "contraindication"
  | "equipment"
  | "goal_alignment"
  | "training_age"
  | "adherence"
  | "performance";

// ─── Exercise Library Domain Types ───────────────────────────────────────────
// These string unions mirror the pgEnum values in lib/db/schema-exercise.ts.
// The enrichment service bridges between Drizzle return types and these.
// If a schema enum is updated, update the corresponding union here.

/** Mirrors movementPatternEnum in schema-exercise.ts */
export type MovementPattern =
  | "push_vertical"
  | "push_horizontal"
  | "pull_vertical"
  | "pull_horizontal"
  | "hip_hinge"
  | "squat_bilateral"
  | "squat_unilateral"
  | "lunge"
  | "carry"
  | "rotation"
  | "anti_rotation"
  | "gait"
  | "jump"
  | "throw"
  | "iso_hold"
  | "elbow_flexion"
  | "elbow_extension"
  | "shoulder_abduction"
  | "shoulder_adduction"
  | "knee_flexion"
  | "knee_extension"
  | "hip_extension"
  | "hip_flexion"
  | "scapular_retraction"
  | "scapular_depression"
  | "external_rotation"
  | "internal_rotation";

/** Mirrors exerciseClassificationEnum in schema-exercise.ts */
export type ExerciseClassification =
  | "compound"
  | "isolation"
  | "cardio"
  | "mobility"
  | "power"
  | "skill";

/** Mirrors exerciseDifficultyEnum in schema-exercise.ts */
export type ExerciseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "specialist";

/** Mirrors templateStatusEnum in schema.ts (shared with workout_templates) */
export type ExerciseStatus = "draft" | "active" | "archived";

/** Mirrors exerciseScopeEnum in schema-exercise.ts */
export type ExerciseScope = "system" | "organization" | "coach";

/** Mirrors bodyPositionEnum in schema-exercise.ts */
export type BodyPosition =
  | "standing"
  | "seated"
  | "lying_supine"
  | "lying_prone"
  | "incline"
  | "decline"
  | "kneeling"
  | "split_stance"
  | "hinge_position"
  | "quadruped"
  | "hanging";

/** Mirrors resistanceTypeEnum in schema-exercise.ts */
export type ResistanceType =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "cable"
  | "machine"
  | "band"
  | "bodyweight"
  | "smith_machine"
  | "trap_bar"
  | "suspension"
  | "plate_loaded"
  | "medicine_ball"
  | "sandbag"
  | "chains"
  | "landmine";

/** Mirrors muscleGroupEnum in schema-exercise.ts */
export type MuscleGroup =
  | "chest"
  | "front_deltoid"
  | "lateral_deltoid"
  | "rear_deltoid"
  | "upper_back"
  | "lats"
  | "rhomboids"
  | "trapezius"
  | "triceps"
  | "biceps"
  | "brachialis"
  | "brachioradialis"
  | "forearms"
  | "rectus_abdominis"
  | "obliques"
  | "transverse_abdominis"
  | "spinal_erectors"
  | "multifidus"
  | "glutes"
  | "hip_flexors"
  | "adductors"
  | "abductors"
  | "quadriceps"
  | "hamstrings"
  | "calves"
  | "tibialis"
  | "cardiovascular";

/** Mirrors muscleRoleEnum in schema-exercise.ts */
export type MuscleRole = "primary" | "secondary" | "stabilizer";

/** Mirrors exerciseRelationTypeEnum in schema-exercise.ts */
export type ExerciseRelationType =
  | "regression"
  | "progression"
  | "substitute"
  | "lower_joint_stress"
  | "higher_joint_stress"
  | "same_pattern"
  | "contralateral";

/** Mirrors substitutionPolicyEnum in schema-exercise.ts */
export type SubstitutionPolicy =
  | "strict"
  | "flexible"
  | "coach_review"
  | "no_substitute";

/** Mirrors contraindicationSeverityEnum in schema-exercise.ts */
export type ContraindicationSeverity = "avoid" | "modify" | "monitor";

/** Mirrors setTechniqueEnum in schema-exercise.ts */
export type SetTechnique =
  | "straight_set"
  | "superset"
  | "triset"
  | "giant_set"
  | "drop_set"
  | "mechanical_drop_set"
  | "tension_drop_set"
  | "rest_pause"
  | "cluster_set"
  | "myo_reps"
  | "lengthened_partials"
  | "stretch_mediated_finisher"
  | "tempo_set"
  | "isometric"
  | "circuit";

/** Mirrors workoutSectionTypeEnum in schema-exercise.ts */
export type WorkoutSectionType =
  | "warmup"
  | "activation"
  | "potentiation"
  | "main_lift"
  | "accessory"
  | "conditioning"
  | "finisher"
  | "cooldown"
  | "rest_period";

// ─── Prescription Types ───────────────────────────────────────────────────────

/**
 * The shape of exercises.defaultPrescription and
 * exercise_coach_overrides.defaultPrescription JSONB fields.
 * Used as the effectivePrescription scaffold in EnrichedPrescription.
 */
export interface PilDefaultPrescription {
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  tempo?: string | null;
  targetRpe?: number | null;
  targetRir?: number | null;
  setTechnique?: SetTechnique | null;
}

// ─── Enriched Exercise Types ──────────────────────────────────────────────────

export interface EnrichedMuscle {
  muscleGroup: MuscleGroup;
  role: MuscleRole;
  /** Parsed from Drizzle numeric string to number at enrichment boundary. */
  emphasisPercent: number | null;
}

export interface EnrichedRelation {
  relatedExerciseId: string;
  relatedExerciseName: string;
  relationType: ExerciseRelationType;
  /**
   * 'outbound': this exercise is the source in the relation row.
   * 'inbound':  this exercise is the target in the relation row.
   * Bidirectional queries produce both directions.
   */
  direction: "outbound" | "inbound";
  /** 1–100; null if not scored. */
  suitabilityScore: number | null;
  substitutionPolicy: SubstitutionPolicy | null;
}

export interface EnrichedContraindication {
  id: string;
  conditionOrInjury: string;
  bodyRegion: string | null;
  severity: ContraindicationSeverity;
  modificationNote: string | null;
  suggestedRelationId: string | null;
}

export interface EnrichedExercise {
  id: string;
  name: string;
  slug: string;
  status: ExerciseStatus;
  scope: ExerciseScope;

  // Movement and classification
  movementPattern: MovementPattern;
  classification: ExerciseClassification;
  difficulty: ExerciseDifficulty;
  primaryMuscleGroup: MuscleGroup | null;
  defaultBodyPosition: BodyPosition | null;
  resistanceType: ResistanceType | null;

  // Behavioral flags
  unilateral: boolean;
  alternating: boolean;
  isTimeBased: boolean;
  isDistanceBased: boolean;
  isCardio: boolean;
  isMobility: boolean;

  // Scoring fields — null means data not yet entered, not zero
  fatigueCost: number | null;         // 1–10
  technicalComplexity: number | null; // 1–10
  stabilityDemand: number | null;     // 1–10

  // Joint stress — 0–10 per joint; null means unscored for this joint
  jointStressShoulder: number | null;
  jointStressElbow: number | null;
  jointStressWrist: number | null;
  jointStressSpine: number | null;
  jointStressHip: number | null;
  jointStressKnee: number | null;
  jointStressAnkle: number | null;

  // Biomechanical profile — 0–10; null means unscored
  lengthenedBias: number | null;
  shortenedBias: number | null;
  stretchMediatedPotential: number | null;

  /** Canonical default prescription; may be overridden per coach. */
  defaultPrescription: PilDefaultPrescription | null;

  // Related data — always arrays; never null or undefined
  muscles: EnrichedMuscle[];
  relations: EnrichedRelation[];
  contraindications: EnrichedContraindication[];
}

// ─── Enriched Blueprint Types ─────────────────────────────────────────────────

export interface EnrichedSection {
  id: string;
  name: string;
  sectionType: WorkoutSectionType;
  /** Null when the coach has not set an explicit duration estimate. */
  estimatedMinutes: number | null;
  orderIndex: number;
  notes: string | null;
}

export interface EnrichedPrescription {
  id: string;
  exerciseId: string;

  /**
   * Enriched exercise record. Null only when missing=true (exercise was
   * deleted or archived after this blueprint was authored).
   */
  exercise: EnrichedExercise | null;

  /**
   * True when the referenced exercise cannot be found (deleted) or has
   * status=archived. All prescription fields remain present; exercise is null.
   * M01 (Prescription Validity) surfaces this as VALIDITY_EXERCISE_ARCHIVED.
   */
  missing: boolean;

  /**
   * Resolved prescription used as the analysis baseline.
   * Resolution order: coach override defaultPrescription → exercise defaultPrescription → null.
   * Analysis modules use the explicit prescription fields (sets, repsMin, etc.)
   * for calculations; this is the scaffold shown in the Blueprint Editor.
   */
  effectivePrescription: PilDefaultPrescription | null;

  // Explicit prescription fields from workout_template_exercises
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  /** Parsed from Drizzle numeric string to number at enrichment boundary. */
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
  /** Parsed from Drizzle numeric string to number at enrichment boundary. */
  targetRpe: number | null;
  /** Parsed from Drizzle numeric string to number at enrichment boundary. */
  targetRir: number | null;
  setTechnique: SetTechnique | null;
  /** Shared UUID among exercises in the same superset or group. */
  groupId: string | null;
  /** Position within the group (1-based). */
  groupPosition: number | null;
  orderIndex: number;
  isRequired: boolean;
  substitutionPolicy: SubstitutionPolicy | null;
  coachNotes: string | null;

  // Section context — null when the prescription has no assigned section
  sectionId: string | null;
  sectionType: WorkoutSectionType | null;
}

export interface EnrichedBlueprint {
  templateId: string;
  name: string;
  /** Free-text coaching notes on the template. */
  description: string | null;
  /** Coaching objective or goal statement for this session. */
  objective: string | null;
  status: ExerciseStatus;

  sections: EnrichedSection[];

  /**
   * All prescriptions across all sections.
   * Ordered by sectionOrderIndex ASC, then prescription orderIndex ASC.
   * Analysis modules iterate this flat list rather than navigating sections.
   */
  prescriptions: EnrichedPrescription[];
}

// ─── Validation Result ────────────────────────────────────────────────────────

/** Output type of M01 — Prescription Validity Check. */
export interface ValidationResult {
  /** True when no error-severity findings are present. */
  valid: boolean;
  /** severity='error', confidence='certain'. Block Blueprint publication. */
  errors: PilFinding[];
  /** severity='warning', confidence='certain'. Coach should address before publishing. */
  warnings: PilFinding[];
}

// ─── M02 — Blueprint Completeness Assessment ──────────────────────────────────

/** Output type of M02 — Blueprint Completeness Assessment. */
export interface CompletenessReport {
  prescriptionCompleteness: {
    prescriptionsWithNoSets: number;
    prescriptionsWithNoRest: number;
    prescriptionsWithNoRpe: number;
    prescriptionsWithNoRepRange: number;
  };
  exerciseLibraryCompleteness: {
    exercisesWithNoFatigueCost: number;
    exercisesWithNoMuscleData: number;
    exercisesWithNoJointScores: number;
    exercisesWithNoBiomechanicalScoring: number;
  };
  /** 0–100 percentages: share of prescriptions where this analysis can fully run. */
  coveragePct: {
    fatigue: number;
    volume: number;
    jointStress: number;
  };
  /** Deterministic text: what scoring data would most improve analysis. */
  recommendation: string;
}

// ─── M03 — Volume Analysis ────────────────────────────────────────────────────

/** Output type of M03 — Volume Analysis. */
export interface VolumeAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    directSets: number;
    indirectSets: number;
    totalSets: number;
    contributingExerciseIds: string[];
  }>;
  totalPrescribedSets: number;
  unknownVolume: {
    /** Exercise IDs where sets is null. */
    prescriptionsWithNullSets: string[];
    /** Exercise IDs where exercise has no muscle data (muscles[] is empty). */
    prescriptionsWithNoMuscleData: string[];
  };
  findings: PilFinding[];
}

// ─── M04 — Fatigue Analysis ───────────────────────────────────────────────────

/** Output type of M04 — Fatigue Analysis. */
export interface FatigueAnalysis {
  /** sum(sets × fatigueCost) for prescriptions where both are non-null. */
  totalScore: number;
  /** 0–100: share of prescriptions where fatigueCost is known. */
  coveragePct: number;
  contributors: Array<{
    exerciseId: string;
    exerciseName: string;
    fatigueCost: number;
    sets: number;
    contribution: number;
  }>;
  /** Exercise IDs where fatigueCost is null. */
  unscored: string[];
  findings: PilFinding[];
}

// ─── M05 — Movement Pattern Analysis ─────────────────────────────────────────

/** Output type of M05 — Movement Pattern Analysis. */
export interface MovementAnalysis {
  byPattern: Array<{
    pattern: MovementPattern;
    sets: number;
    exerciseIds: string[];
  }>;
  pushPullBalance: {
    horizontal: { pushSets: number; pullSets: number; ratio: number | null };
    vertical: { pushSets: number; pullSets: number; ratio: number | null };
  };
  /** Pattern with >40% of total session sets; null when no single pattern dominates. */
  dominantPattern: MovementPattern | null;
  findings: PilFinding[];
}

// ─── M31 — Blueprint Quality Summary ─────────────────────────────────────────

/** Dimensional status badges for the Blueprint audit panel header. */
export interface BlueprintDimensionStatus {
  validity: "ok" | "has_errors";
  volume: "ok" | "elevated" | "incomplete" | "unknown";
  fatigue: "moderate" | "high" | "incomplete" | "unknown";
  movement: "balanced" | "imbalanced" | "unknown";
  jointStress: "ok" | "elevated" | "extreme" | "unknown";
  redundancy: "ok" | "detected" | "unknown";
  duration: "ok" | "long" | "very_long" | "unknown";
}

export interface BlueprintQualitySummary {
  templateId: string;
  dimensionStatus: BlueprintDimensionStatus;
  /** Top 2 findings by severity (error → warning → caution → info). */
  topFindings: PilFinding[];
}

// ─── Blueprint Audit Result ───────────────────────────────────────────────────

// ─── M06 — Joint Stress Analysis ─────────────────────────────────────────────

export type JointName = "shoulder" | "elbow" | "wrist" | "spine" | "hip" | "knee" | "ankle";

/** Output type of M06 — Joint Stress Analysis. */
export interface JointStressAnalysis {
  byJoint: Array<{
    joint: JointName;
    /** sum(sets × jointScore) for all prescriptions with a score for this joint. */
    cumulativeScore: number;
    /** Highest individual exercise score for this joint. */
    peakScore: number;
    highContributors: Array<{
      exerciseId: string;
      exerciseName: string;
      score: number;
      sets: number;
    }>;
    /** 0–100: share of prescriptions with a non-null score for this joint. */
    coveragePct: number;
  }>;
  findings: PilFinding[];
}

// ─── M07 — Exercise Redundancy Analysis ──────────────────────────────────────

/** Output type of M07 — Exercise Redundancy Analysis. */
export interface RedundancyAnalysis {
  redundantGroups: Array<{
    movementPattern: MovementPattern;
    primaryMuscleGroup: MuscleGroup;
    exercises: Array<{
      id: string;
      name: string;
      sets: number | null;
      sectionType: WorkoutSectionType | null;
    }>;
    totalSets: number;
  }>;
  /** Exercise IDs excluded from analysis because primaryMuscleGroup is null. */
  unknownCount: number;
  findings: PilFinding[];
}

// ─── M08 — Session Duration Estimation ───────────────────────────────────────

/** Output type of M08 — Session Duration Estimation. */
export interface DurationEstimate {
  estimatedMinutes: number;
  /** certain when all sections have estimatedMinutes set; heuristic otherwise. */
  confidence: "certain" | "heuristic";
  basisNote: string;
  /** Exercise IDs where restSeconds is null (heuristic rest used). */
  prescriptionsWithMissingRest: string[];
  findings: PilFinding[];
}

// ─── M15 — Program Structure Validation ──────────────────────────────────────

/** One day slot in a program week (rest day when workoutTemplateId is null). */
export interface ProgramDay {
  dayOfWeek: number; // 0=Sunday … 6=Saturday
  workoutTemplateId: string | null;
  templateName: string | null;
  templateStatus: string | null;
}

/** One week in a program template, fully resolved with its day schedule. */
export interface EnrichedProgramWeek {
  weekId: string;
  weekNumber: number;
  label: string | null;
  days: ProgramDay[];
}

/** Output of M15 — Program Structure Validation. */
export interface ProgramStructureResult {
  valid: boolean;
  weekCount: number;
  errors: PilFinding[];
  warnings: PilFinding[];
}

// ─── M16 — Program Frequency Analysis ────────────────────────────────────────

/** Output of M16 — Frequency Analysis, one per week. */
export interface FrequencyAnalysis {
  weekNumber: number;
  totalTrainingDays: number;
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    sessionsPerWeek: number;
    trainingDays: number[];      // dayOfWeek values where this muscle is trained
    directSetsPerWeek: number;
    indirectSetsPerWeek: number;
  }>;
  byPattern: Array<{
    pattern: MovementPattern;
    sessionsPerWeek: number;
  }>;
  findings: PilFinding[];
}

// ─── M17 — Recovery Spacing Analysis ─────────────────────────────────────────

/** Output of M17 — Recovery Spacing Analysis, across all weeks. */
export interface RecoverySpacingAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    trainingPairs: Array<{
      /** weekNumber × 7 + dayOfWeek, for gap arithmetic. */
      day1AbsoluteDay: number;
      day2AbsoluteDay: number;
      gapDays: number;
      week1: number;
      week2: number;
      dayOfWeek1: number;
      dayOfWeek2: number;
    }>;
    minRecoveryDays: number;
  }>;
  findings: PilFinding[];
}

// ─── Per-Muscle Weekly Brief ──────────────────────────────────────────────────

/** One row in the Per-Muscle Weekly Brief hero table. */
export interface PerMuscleWeekRow {
  muscleGroup: MuscleGroup;
  /** Average direct sets per week across all analyzed weeks. */
  directSetsPerWeek: number;
  /** Average indirect sets per week across all analyzed weeks. */
  indirectSetsPerWeek: number;
  totalSetsPerWeek: number;
  /** Average sessions per week where this muscle is directly trained. */
  sessionsPerWeek: number;
  /** Distinct dayOfWeek values across all weeks where muscle is trained. */
  trainingDays: number[];
  /** Minimum gap in calendar days between any two consecutive training sessions; null when ≤1 session total. */
  minRecoveryDays: number | null;
  /** Derived from recovery analysis for inline row annotation. */
  recoveryStatus: "ok" | "consecutive" | "same_day";
  /** True when some blueprints in the program lacked muscle data for this muscle. */
  isPartialData: boolean;
}

export interface PerMuscleWeeklyBriefData {
  rows: PerMuscleWeekRow[];
  weekCount: number;
  distinctBlueprintsAnalyzed: number;
}

// ─── M32 — Program Quality Summary ───────────────────────────────────────────

export interface ProgramDimensionStatus {
  structure: "ok" | "has_errors" | "unknown";
  frequency: "appropriate" | "high" | "unknown";
  recovery: "adequate" | "insufficient" | "unknown";
}

export interface ProgramQualitySummary {
  programTemplateId: string;
  weekCount: number;
  dimensionStatus: ProgramDimensionStatus;
  /** Top 3 findings by severity across all program modules. */
  topFindings: PilFinding[];
}

// ─── Program Audit Result ─────────────────────────────────────────────────────

/** Full output of getProgramAudit() — orchestrates M15, M16, M17, M32, M33. */
export interface ProgramAuditResult {
  programTemplateId: string;
  qualitySummary: ProgramQualitySummary;
  structureResult: ProgramStructureResult;
  perMuscleWeeklyBrief: PerMuscleWeeklyBriefData;
  frequencyAnalysisByWeek: FrequencyAnalysis[];
  recoveryAnalysis: RecoverySpacingAnalysis;
  allFindings: PilFinding[];
  /** Deterministic coaching recommendations derived from allFindings. */
  recommendations: CoachingRecommendationResult;
  distinctBlueprintsAudited: number;
  analyzedAt: string;
}

// ─── M30 — Substitution Service ───────────────────────────────────────────────

export interface SubstitutionCandidate {
  exerciseId: string;
  exerciseName: string;
  relationType: ExerciseRelationType;
  relationDirection: "outbound" | "inbound";
  suitabilityScore: number | null;
  substitutionPolicy: SubstitutionPolicy | null;
  primaryMuscleGroup: MuscleGroup | null;
  movementPattern: MovementPattern;
  /** 0–100: muscle+pattern overlap with the source exercise. */
  similarityScore: number;
}

export interface SubstitutionResult {
  sourceExerciseId: string;
  candidates: SubstitutionCandidate[];
}

// ─── M33 — Coaching Recommendation Engine ────────────────────────────────────

/**
 * Priority ordering for coaching recommendations.
 * critical: structural errors that must be fixed (safety / data integrity)
 * high:     recovery or fatigue issues with meaningful health/performance impact
 * medium:   optimization opportunities with established evidence base
 * low:      minor refinements — only surface when no higher-priority items exist
 */
export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type RecommendationCategory =
  | "volume"
  | "recovery"
  | "movement"
  | "joint_stress"
  | "program_structure"
  | "session_design";

export interface CoachingRecommendation {
  id: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  /** One imperative sentence. Always explains what to do AND implies why. */
  headline: string;
  /** One or two sentences grounding the recommendation in coaching evidence. */
  rationale: string;
  /**
   * Stable finding codes that drove this recommendation.
   * UI uses these to cross-reference with the full findings list.
   */
  supportingFindingCodes: string[];
  confidence: PilConfidence;
  /**
   * Muscle groups directly implicated by this recommendation.
   * UI uses this to highlight rows in PerMuscleWeeklyBrief or MuscleSetsTable.
   * Empty when the recommendation is not muscle-specific.
   */
  affectedMuscleGroups: string[];
  /**
   * Exercises that are candidates for substitution as part of the recommended fix.
   * Populated when a substitute_exercise action is applicable (redundancy, extreme joint stress).
   * UI uses this to pre-load SubstitutionDrawer.
   */
  substituteExercises: Array<{ id: string; name: string }>;
}

export interface CoachingRecommendationResult {
  /** The single most important action — null when no recommendations generated. */
  highestPriority: CoachingRecommendation | null;
  /** All recommendations, sorted critical → low, then confidence certain → heuristic. */
  recommendations: CoachingRecommendation[];
  /** Same recommendations grouped by category for panel rendering. */
  byCategory: Partial<Record<RecommendationCategory, CoachingRecommendation[]>>;
  /** False when findings are clean and no coaching action is needed. */
  hasActionableRecommendations: boolean;
}

// ─── Blueprint Audit Result ───────────────────────────────────────────────────

/** Full output of getBlueprintAudit() — orchestrates M00–M08, M33. */
export interface BlueprintAuditResult {
  templateId: string;
  qualitySummary: BlueprintQualitySummary;
  validationResult: ValidationResult;
  volumeAnalysis: VolumeAnalysis;
  fatigueAnalysis: FatigueAnalysis;
  movementAnalysis: MovementAnalysis;
  jointStressAnalysis: JointStressAnalysis;
  redundancyAnalysis: RedundancyAnalysis;
  durationEstimate: DurationEstimate;
  completenessReport: CompletenessReport;
  /** All findings from all modules, sorted error→warning→caution→info. */
  allFindings: PilFinding[];
  /** Deterministic coaching recommendations derived from allFindings. */
  recommendations: CoachingRecommendationResult;
  analyzedAt: string;
}
