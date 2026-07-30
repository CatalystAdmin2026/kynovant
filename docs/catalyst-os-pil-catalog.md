# Catalyst OS — Programming Intelligence Catalog

Definitive design document for the Programming Intelligence Layer · July 2026

---

## Purpose of This Document

This is the functional blueprint for the Catalyst Programming Intelligence Engine. It catalogs every analysis, audit, validation, recommendation, and intelligence capability the PIL will eventually perform — not just Phase 1. Its purpose is to ensure the complete long-term vision is understood before any code is committed, so that Phase 1 decisions do not paint later phases into corners.

This document is a design specification, not an implementation guide. It contains no code.

The constitutional principles governing PIL are in `docs/AI_PRINCIPLES.md` under the Programming Intelligence Doctrine (P-1 through P-9). The Phase 1 architecture is in `docs/catalyst-os-programming-intelligence.md`. This document supersedes neither of those — it extends them.

---

## Module Catalog

Modules are organized into groups by domain. Each module is assigned a stable identifier (M00–M35) for cross-referencing in the dependency map and phase assignments.

---

### GROUP 0 — Foundation

---

#### M00 — Blueprint Enrichment

**Purpose**
Answers: "What exercise knowledge does each prescription in this blueprint carry?" This is not an analysis module — it is the data layer every analysis module depends on. It exists to eliminate N+1 queries and ensure every downstream module receives a consistent, typed enriched structure.

**Inputs**
- `workout_template_exercises` (prescriptions: sets, reps, rest, tempo, RPE, setTechnique, groupId, groupPosition, orderIndex, sectionId, isRequired, substitutionPolicy)
- `workout_template_sections` (sectionType, estimatedMinutes, orderIndex)
- `exercises` (all scoring fields: fatigueCost, technicalComplexity, jointStress×7, lengthenedBias, shortenedBias, stretchMediatedPotential, movementPattern, classification, difficulty, resistanceType, unilateral, alternating, isTimeBased, isCardio, isMobility, defaultBodyPosition, primaryMuscleGroup, scope, status)
- `exercise_muscles` (muscleGroup, role, emphasisPercent — all muscles per exercise)
- `exercise_relations` (sourceExerciseId, targetExerciseId, relationType, suitabilityScore — bidirectional)
- `exercise_coach_overrides` (defaultPrescription — per coachId, when coachId supplied)

**Outputs**
`EnrichedBlueprint` — structured object containing:
- Blueprint metadata (templateId, name, objective)
- `sections[]` with type and estimated duration
- `prescriptions[]` each containing:
  - Full typed exercise data (all scoring fields above)
  - Resolved `effectivePrescription` (override ?? canonical)
  - Muscles array with role and emphasisPercent
  - Relations array (bidirectional, tagged by direction)
  - Prescription fields (sets, repsMin/repsMax, rest, etc.)
  - Section context (type, position)

**Deterministic or Heuristic?**
Deterministic. Pure database read. No thresholds or rules applied.

**Confidence**
Complete when all exercises in the blueprint are found in the library with active status. Reduced when:
- An exercise has status=archived or cannot be found (flagged as `missing: true` on that prescription)
- An exercise has no `exercise_muscles` rows (flagged per prescription; volume and balance modules will have incomplete data for this exercise)

**Explainability**
Not applicable — this is a data layer, not an analysis. Its output is consumed by analysis modules that produce findings.

**Dependencies**
None. This is the root of the dependency graph.

**Complexity**
Small. Five batched queries regardless of blueprint size. The complexity is in defining the type correctly — the type is load-bearing for the entire engine.

**Recommended Phase**
1A — first deliverable of the entire PIL system.

---

### GROUP 1 — Blueprint Validation

---

#### M01 — Prescription Validity Check

**Purpose**
Answers: "Does this blueprint contain prescription errors that are definitively wrong — regardless of coaching philosophy?" These are hard violations that no amount of coaching preference resolves.

**Inputs**
- `EnrichedBlueprint` (all prescription fields, exercise.status, repsMin, repsMax, sets, targetRpe, targetRir, groupId, groupPosition, groupPosition ordering)

**Outputs**
`ValidationResult`
```
interface ValidationResult {
  valid: boolean;
  errors: PilFinding[];   // severity='error', confidence='certain'
  warnings: PilFinding[]; // severity='warning', confidence='certain'
}
```

**Findings produced**

| Code | Condition |
|---|---|
| `VALIDITY_REPS_INVERTED` | repsMin > repsMax |
| `VALIDITY_EXERCISE_ARCHIVED` | Exercise referenced has status=archived or missing |
| `VALIDITY_SETS_ZERO` | sets = 0 (DB allows null but not zero; any 0 is an authoring error) |
| `VALIDITY_RPE_EXCEEDS_MAX` | targetRpe > 10 |
| `VALIDITY_GROUP_SINGLE` | A groupId references only one prescription (a superset of one) |
| `VALIDITY_GROUP_POSITION_GAP` | groupPositions within a groupId are non-sequential |
| `VALIDITY_DUPLICATE_ORDER` | Two prescriptions share orderIndex within the same section |
| `VALIDITY_ORPHANED_SECTION` | A prescription references a sectionId that does not exist |

All findings from M01 are `severity='error'` and `confidence='certain'`. They block Blueprint publication in the existing validator (`workout-validator.ts`). M01 extends and supersedes the existing validator with PIL types.

**Deterministic or Heuristic?**
Deterministic. All rules are binary.

**Confidence**
Always complete for the data that is present. Cannot flag errors in missing data (deleted exercises) — flags the absence itself.

**Explainability**
Deterministic template text only. Error conditions require no AI phrasing — they are structural facts.

**Dependencies**
M00 (Blueprint Enrichment).

**Complexity**
Small. Single pass over the enriched prescription list.

**Recommended Phase**
1A — should be wired first because it gates Blueprint publication and provides the safety net for all other modules.

---

#### M02 — Blueprint Completeness Assessment

**Purpose**
Answers: "Which prescription fields are missing that would improve analysis quality?" Not a hard error — a soft assessment of how much information is available for downstream analysis.

**Inputs**
- `EnrichedBlueprint` (all prescription fields, all exercise scoring fields)

**Outputs**
`CompletenessReport`
```
interface CompletenessReport {
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
  coveragePct: {
    fatigue: number;     // 0-100: % of prescribed sets with known fatigueCost
    volume: number;      // 0-100: % of prescriptions with muscle data
    jointStress: number; // 0-100: % of prescriptions with any joint score
  };
  recommendation: string; // deterministic: what scoring data, if added, would most improve analysis
}
```

**Findings produced**
This module produces no `PilFinding` objects. It produces a completeness report that is surfaced separately in the audit UI as a data quality panel. It does not compete with analysis findings for attention.

**Deterministic or Heuristic?**
Deterministic. Counts missing fields.

**Confidence**
Always complete — counting null fields is always possible.

**Explainability**
Deterministic template. "12 of 20 exercises lack a fatigue cost score. Fatigue analysis covers approximately 40% of prescribed sets."

**Dependencies**
M00 (Blueprint Enrichment).

**Complexity**
Small. Single pass over enriched data.

**Recommended Phase**
1B — display alongside every Blueprint audit. Helps coaches understand why some findings say `confidence='incomplete_data'`.

---

### GROUP 2 — Blueprint Analysis (Phase 1)

---

#### M03 — Volume Analysis

**Purpose**
Answers: "How many sets does each muscle group receive, directly and indirectly, in this session?"

**Inputs**
- `EnrichedBlueprint` (prescription.sets, exercise.primaryMuscleGroup, exercise.muscles[].role, exercise.muscles[].muscleGroup, exercise.muscles[].emphasisPercent)

**Outputs**
`VolumeAnalysis`
```
interface VolumeAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    directSets: number;        // sets where this muscle is role='primary'
    indirectSets: number;      // sets where role='secondary' or 'stabilizer'
    totalSets: number;
    contributingExerciseIds: string[];
  }>;
  totalPrescribedSets: number;
  unknownVolume: {
    prescriptionsWithNullSets: string[];       // exercise IDs
    prescriptionsWithNoMuscleData: string[];   // exercise IDs
  };
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `VOLUME_HIGH_DIRECT` | caution | heuristic | Direct sets for any muscle group exceed 10 per session |
| `VOLUME_ZERO_DIRECT_MAJOR` | info | certain | A major muscle group (chest, quads, hamstrings, glutes, lats, upper_back) has 0 direct sets |
| `VOLUME_DATA_INCOMPLETE` | info | incomplete_data | >30% of prescriptions lack muscle data |

**Deterministic or Heuristic?**
Deterministic calculation. Heuristic thresholds for findings.

**Confidence**
Reduced when exercises lack `exercise_muscles` rows. Report unknownVolume to caller.

**Explainability**
Deterministic template text in Phase 1. Evidence facts: direct sets per muscle, contributing exercise names, threshold value.
AI phrasing in Phase 2: "Your quadriceps volume is above the general guideline for a single session..."

**Dependencies**
M00.

**Complexity**
Small. Aggregation over a flat list.

**Recommended Phase**
1B.

---

#### M04 — Fatigue Analysis

**Purpose**
Answers: "What is the systemic fatigue demand of this session, and which exercises contribute most?"

**Inputs**
- `EnrichedBlueprint` (prescription.sets, exercise.fatigueCost, exercise.classification)

**Outputs**
`FatigueAnalysis`
```
interface FatigueAnalysis {
  totalScore: number;      // sum(sets × fatigueCost) for scored exercises
  coveragePct: number;     // % of prescribed sets with known fatigueCost
  contributors: Array<{
    exerciseId: string;
    exerciseName: string;
    fatigueCost: number;
    sets: number;
    contribution: number;  // sets × fatigueCost
  }>;
  unscored: string[];      // exercise IDs where fatigueCost is null
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `FATIGUE_HIGH_COST_EXERCISE` | caution | heuristic | Any exercise has fatigueCost ≥ 8 AND sets ≥ 4 |
| `FATIGUE_ACCUMULATION` | caution | heuristic | 3+ exercises have fatigueCost ≥ 7 in one session |
| `FATIGUE_DATA_THIN` | info | incomplete_data | Coverage < 70% |

**Deterministic or Heuristic?**
Deterministic calculation. Heuristic thresholds for findings.

**Confidence**
Reduced proportionally to exercises missing `fatigueCost`. Report coveragePct.

**Explainability**
Deterministic template: "Estimated session fatigue score is X based on N exercises (coverage: Y%). Back Squat contributes the most at 5 sets × fatigueCost 9 = 45 units."
AI phrasing in Phase 2 for contextual interpretation.

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
1B.

---

#### M05 — Movement Pattern Analysis

**Purpose**
Answers: "Is this session mechanically balanced across movement patterns, and are push/pull mechanics in proportion?"

**Inputs**
- `EnrichedBlueprint` (prescription.sets, exercise.movementPattern)

**Outputs**
`MovementAnalysis`
```
interface MovementAnalysis {
  byPattern: Array<{
    pattern: MovementPattern;
    sets: number;
    exerciseIds: string[];
  }>;
  pushPullBalance: {
    horizontal: { pushSets: number; pullSets: number; ratio: number | null };
    vertical: { pushSets: number; pullSets: number; ratio: number | null };
  };
  dominantPattern: MovementPattern | null;  // pattern with >40% of sets
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `MOVEMENT_PUSH_PULL_H` | warning | heuristic | Horizontal push:pull ratio > 2:1 |
| `MOVEMENT_PUSH_PULL_V` | caution | heuristic | Vertical push:pull ratio > 2:1 |
| `MOVEMENT_PATTERN_DOMINANT` | info | certain | Any single pattern exceeds 40% of session sets |

The horizontal push:pull finding is `warning` (elevated shoulder injury risk); the vertical finding is `caution` (less acute). Only fires when both sides have prescriptions — a lower-body session with zero horizontal push and pull produces no push:pull finding.

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Always complete. `movementPattern` is NOT NULL.

**Explainability**
Deterministic template: "Horizontal pushing volume (8 sets) is 4× horizontal pulling volume (2 sets). Ratios above 2:1 are commonly associated with cumulative shoulder joint stress over training blocks."

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
1B.

---

#### M06 — Joint Stress Analysis

**Purpose**
Answers: "Does this session accumulate high load on specific joints, and are multiple high-stress exercises targeting the same joint?"

**Inputs**
- `EnrichedBlueprint` (prescription.sets, exercise.jointStressShoulder, exercise.jointStressElbow, exercise.jointStressWrist, exercise.jointStressSpine, exercise.jointStressHip, exercise.jointStressKnee, exercise.jointStressAnkle)

**Outputs**
`JointStressAnalysis`
```
interface JointStressAnalysis {
  byJoint: Array<{
    joint: 'shoulder' | 'elbow' | 'wrist' | 'spine' | 'hip' | 'knee' | 'ankle';
    cumulativeScore: number;
    peakScore: number;
    highContributors: Array<{
      exerciseId: string;
      exerciseName: string;
      score: number;
      sets: number;
    }>;
    coveragePct: number;  // % of prescriptions with a score for this joint
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `JOINT_STRESS_EXTREME_EXERCISE` | caution | certain | Single exercise scores ≥ 9 on any joint |
| `JOINT_STRESS_MULTIPLE_HIGH` | caution | heuristic | 3+ exercises score ≥ 6 on the same joint |
| `JOINT_STRESS_HIGH_CUMULATIVE` | warning | heuristic | Cumulative score for a joint exceeds 40 in one session |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Reduced per-joint when joint scores are null. Each joint has its own coveragePct.

**Explainability**
Deterministic template: "Three exercises in this session score 7 or higher on lumbar spine stress: Back Squat (8), Romanian Deadlift (7), Good Morning (8). Cumulative spine score is 52."

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
1C.

---

#### M07 — Exercise Redundancy Analysis

**Purpose**
Answers: "Are any exercises in this Blueprint mechanically duplicating each other — same movement pattern targeting the same primary muscle?"

**Inputs**
- `EnrichedBlueprint` (exercise.movementPattern, exercise.primaryMuscleGroup, prescription.sets, prescription.sectionType)

**Outputs**
`RedundancyAnalysis`
```
interface RedundancyAnalysis {
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
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `REDUNDANCY_PATTERN_MUSCLE` | caution | heuristic | 2+ exercises share movementPattern + primaryMuscleGroup |

Confidence is deliberately `heuristic`. Intentional pairing (two hip-hinge hamstring exercises for hypertrophy) is valid. This is a coach decision, not a rule violation.

**Deterministic or Heuristic?**
Deterministic detection; heuristic interpretation.

**Confidence**
Reduced when exercises lack `primaryMuscleGroup` (which itself depends on `exercise_muscles` data).

**Explainability**
Deterministic template: "Two exercises share the hip_hinge pattern with hamstrings as primary muscle: Romanian Deadlift (3 sets) and Seated Leg Curl (3 sets). This may be intentional — confirm the pairing serves a distinct purpose in this session."

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
1C.

---

#### M08 — Session Duration Estimation

**Purpose**
Answers: "How long will this session take to complete?"

**Inputs**
- `EnrichedBlueprint` (section.estimatedMinutes, prescription.sets, prescription.restSeconds, exercise.isTimeBased, exercise.classification, exercise.isCardio)

**Outputs**
`DurationEstimate`
```
interface DurationEstimate {
  estimatedMinutes: number;
  confidence: 'certain' | 'heuristic';
  basisNote: string;
  prescriptionsWithMissingRest: string[];
}
```

Estimate basis (in order of preference):
1. If all sections have `estimatedMinutes` → sum them (`certain`)
2. Otherwise: SUM per prescription of (sets × setDuration) + (sets - 1) × restSeconds, where setDuration is heuristic by classification:
   - `cardio`, `isTimeBased=true`: use prescription.durationSeconds / 60; fallback 5 min
   - `compound`, `power`: 45 seconds
   - `isolation`: 30 seconds
   - `mobility`: 60 seconds

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `DURATION_LONG` | caution | heuristic | Estimated duration > 90 minutes |
| `DURATION_VERY_LONG` | warning | heuristic | Estimated duration > 120 minutes |

**Deterministic or Heuristic?**
Deterministic when `estimatedMinutes` are set on all sections. Heuristic otherwise.

**Confidence**
Depends on data quality. Always returns an estimate; flags confidence level.

**Explainability**
Deterministic template with confidence disclosure: "Estimated session duration is 95 minutes (heuristic — based on set counts and typical rest periods). Coach-defined section durations would improve precision."

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
1C.

---

### GROUP 3 — Blueprint Analysis (Phase 2)

---

#### M09 — Muscle Balance Analysis

**Purpose**
Answers: "Beyond push/pull, are opposing muscle groups proportionally trained within this session and across the program?" Extends M05 to agonist/antagonist pairs beyond horizontal/vertical movement: quad/hamstring balance, chest/rear-delt balance, biceps/triceps isolation balance, hip flexor/glute balance.

**Inputs**
- M03 outputs (VolumeAnalysis.byMuscle)
- Reference antagonist pairing map (hardcoded in PIL):
  - quadriceps ↔ hamstrings
  - chest ↔ rear_deltoid
  - biceps ↔ triceps
  - hip_flexors ↔ glutes
  - spinal_erectors ↔ rectus_abdominis
  - front_deltoid ↔ rear_deltoid

**Outputs**
`MuscleBalanceAnalysis`
```
interface MuscleBalanceAnalysis {
  pairs: Array<{
    agonist: MuscleGroup;
    antagonist: MuscleGroup;
    agonistDirectSets: number;
    antagonistDirectSets: number;
    ratio: number | null;
    status: 'balanced' | 'imbalanced' | 'unknown';
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `BALANCE_AGONIST_DOMINANT` | caution | heuristic | Any agonist:antagonist direct-set ratio exceeds 3:1 |
| `BALANCE_ANTAGONIST_ZERO` | info | certain | Antagonist has 0 direct sets when agonist has ≥ 4 |

**Deterministic or Heuristic?**
Deterministic calculation on M03 output; heuristic thresholds.

**Confidence**
Depends on M03 completeness.

**Explainability**
Deterministic template: "Quadriceps receive 14 direct sets; hamstrings receive 3. A ratio above 3:1 may represent cumulative anterior knee stress over time."

**Dependencies**
M03 (Volume Analysis).

**Complexity**
Small (given M03 output). The complexity is in maintaining the antagonist pairing map.

**Recommended Phase**
2.

---

#### M10 — Biomechanical Profile Analysis

**Purpose**
Answers: "Does this session provide a healthy mix of lengthened-position and shortened-position muscle loading? Is there sufficient stretch-mediated hypertrophy stimulus?"

This module operationalizes current evidence on muscle fiber recruitment and hypertrophy: exercises loading the muscle in a lengthened position (lengthenedBias ≥ 7) produce different stimulus than shortened-position exercises.

**Inputs**
- `EnrichedBlueprint` (exercise.lengthenedBias, exercise.shortenedBias, exercise.stretchMediatedPotential, prescription.sets, exercise.primaryMuscleGroup)

**Outputs**
`BiomechanicalProfileAnalysis`
```
interface BiomechanicalProfileAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    lengthBasedSets: number;   // sets where lengthenedBias ≥ 6
    shortBasedSets: number;    // sets where shortenedBias ≥ 6
    highSmpSets: number;       // sets where stretchMediatedPotential ≥ 7
    totalSets: number;
  }>;
  coveragePct: number;  // % of prescriptions with biomechanical scores
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `BIOMECH_ALL_SHORTENED` | caution | heuristic | A muscle group receives ≥6 sets with all from shortened-biased exercises (shortenedBias ≥ 6, lengthenedBias ≤ 3) |
| `BIOMECH_SMP_LOW` | info | heuristic | A muscle group has ≥6 direct sets but zero exercises with stretchMediatedPotential ≥ 6 |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds based on emerging research. These findings carry `confidence='heuristic'` — the field is evolving.

**Confidence**
Heavily dependent on library scoring. Currently the most data-hungry module after joint stress. Without lengthenedBias and stretchMediatedPotential scores, this module returns a thin analysis with low coverage.

**Explainability**
Deterministic template in Phase 2. AI phrasing in Phase 3: nuanced explanation of why lengthened-bias loading matters.

**Dependencies**
M00.

**Complexity**
Small (once data exists). Data population is the real constraint.

**Recommended Phase**
2 — only after a Knowledge Completion Sprint populates lengthenedBias and stretchMediatedPotential for system exercises.

---

#### M11 — Intensity Distribution Analysis

**Purpose**
Answers: "Are the prescribed RPE values and rep ranges consistent with the stated training goal? Is intensity distributed appropriately across the session?"

**Inputs**
- `EnrichedBlueprint` (prescription.targetRpe, prescription.repsMin, prescription.repsMax, prescription.setTechnique, prescription.sectionType)
- `clientGoals.goalType` (optional — if present, enables goal-alignment sub-analysis)

**Outputs**
`IntensityAnalysis`
```
interface IntensityAnalysis {
  averageTargetRpe: number | null;
  rpeDistribution: Array<{ bucket: string; setCount: number }>; // '<6', '6-7', '7-8', '8-9', '9-10'
  repRangeDistribution: Array<{ bucket: string; setCount: number }>; // '1-5', '6-8', '9-12', '13-20', '20+'
  prescriptionsWithNoRpe: number;
  goalAlignment: 'strength' | 'hypertrophy' | 'endurance' | 'mixed' | 'unknown';
  // derived from rep ranges; not from goal type
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `INTENSITY_HIGH_VOLUME_HIGH_RPE` | warning | heuristic | Average RPE ≥ 8 with total prescribed sets ≥ 20 |
| `INTENSITY_REP_RANGE_MISMATCH` | info | heuristic | Rep ranges suggest one goal type (e.g. strength: <5 reps) but prescribed sets are structured for another |
| `INTENSITY_RPE_INCOHERENT` | caution | certain | A drop set or myo-rep prescription has targetRpe < 7 (structurally incoherent) |

**Deterministic or Heuristic?**
Deterministic detection; heuristic interpretation of goal alignment.

**Confidence**
Reduced when targetRpe is null on most prescriptions.

**Explainability**
Deterministic template: "71% of prescribed sets fall in the 6–12 rep range with average RPE 7.8, consistent with hypertrophy stimulus."

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
2.

---

#### M12 — Superset Compatibility Analysis

**Purpose**
Answers: "Are exercises grouped in supersets mechanically appropriate to pair — do they avoid compounding fatigue on the same joint or muscle group, and does the pairing make sense for the prescribed intensity?"

**Inputs**
- `EnrichedBlueprint` (prescription.groupId, prescription.groupPosition, prescription.setTechnique, exercise.primaryMuscleGroup, exercise.movementPattern, exercise.jointStress×7, exercise.stabilityDemand)

**Outputs**
`SupersetCompatibilityAnalysis`
```
interface SupersetCompatibilityAnalysis {
  groups: Array<{
    groupId: string;
    technique: SetTechnique;
    exercises: Array<{
      exerciseId: string;
      exerciseName: string;
      primaryMuscleGroup: MuscleGroup;
      movementPattern: MovementPattern;
    }>;
    compatibility: 'compatible' | 'questionable' | 'incompatible';
    reason?: string;
  }>;
}
```

Compatibility rules:
- **Incompatible**: Two spine-loading exercises (jointStressSpine ≥ 7) in a myo-rep or rest-pause superset
- **Questionable**: Two exercises targeting the same primaryMuscleGroup in a straight superset (defeats the purpose of blood shunting)
- **Compatible**: Antagonist pairing (chest + rows, biceps + triceps) or non-competing muscle groups

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `SUPERSET_HIGH_SPINE_COMPOUND` | warning | heuristic | Two exercises with jointStressSpine ≥ 7 are in the same group |
| `SUPERSET_SAME_MUSCLE` | caution | heuristic | Two exercises with identical primaryMuscleGroup in a straight superset |

**Deterministic or Heuristic?**
Heuristic. Superset design has legitimate exceptions.

**Confidence**
Requires `stabilityDemand` and `jointStress` scores to be populated.

**Explainability**
Deterministic template: "Back Squat and Romanian Deadlift are grouped as a superset. Both carry high lumbar spine stress scores (8 and 7). Performing these consecutively without full spine recovery between sets may increase injury risk."

**Dependencies**
M00, M06 (joint stress data is reused from enrichment).

**Complexity**
Small–Medium. Rules are clear but the compatibility taxonomy requires careful definition.

**Recommended Phase**
2.

---

#### M13 — Exercise Ordering Analysis

**Purpose**
Answers: "Are exercises sequenced in an order that respects energy system demands, technical complexity, and fatigue management within the session?"

**Inputs**
- `EnrichedBlueprint` (prescription.orderIndex, prescription.sectionType, exercise.fatigueCost, exercise.technicalComplexity, exercise.classification, exercise.isTimeBased, exercise.isCardio)

**Outputs**
`OrderingAnalysis`
```
interface OrderingAnalysis {
  violations: Array<{
    exerciseId: string;
    exerciseName: string;
    issue: string;
    orderIndex: number;
    sectionType: WorkoutSectionType;
  }>;
}
```

Rules applied:
- A `power` or `skill` exercise appearing after a `fatigueCost ≥ 8` exercise in the same section
- A `technicalComplexity ≥ 8` exercise placed after moderate-to-high-fatigue exercises in the main lift section
- A cardio exercise in a `main_lift` section before strength exercises
- An exercise appearing in a section inconsistent with its classification (e.g., an isolation exercise in `activation` section with high loads prescribed)

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `ORDER_TECHNICAL_AFTER_FATIGUE` | caution | heuristic | High-complexity exercise follows high-fatigue exercise in same section |
| `ORDER_POWER_PLACEMENT` | caution | heuristic | Power/skill classification exercise is not near the start of the main lift section |
| `ORDER_SECTION_TYPE_MISMATCH` | info | heuristic | Exercise classification does not match typical section type |

**Deterministic or Heuristic?**
Heuristic. Exercise ordering is coaching-philosophy-dependent.

**Confidence**
Requires `technicalComplexity` and `fatigueCost` scores.

**Explainability**
Deterministic template: "Power Clean is ordered after Back Squat (fatigueCost 9). Power movements require maximal CNS availability and are most effective when performed before high-fatigue compound exercises."

**Dependencies**
M00, M04 (fatigue data reused from enrichment).

**Complexity**
Small.

**Recommended Phase**
2.

---

#### M14 — Technical Complexity Distribution

**Purpose**
Answers: "Is the technical demand of this session appropriate for the prescribed client, and does it follow a coherent warm-up-to-main-lift complexity curve?"

**Inputs**
- `EnrichedBlueprint` (exercise.technicalComplexity, exercise.difficulty, prescription.sectionType, prescription.sets)
- `trainingProfiles.experienceLevel` (optional — enables client-specific finding)

**Outputs**
`ComplexityDistribution`
```
interface ComplexityDistribution {
  averageComplexity: number | null;
  bySection: Array<{
    sectionType: WorkoutSectionType;
    averageComplexity: number | null;
    exercises: Array<{ exerciseId: string; exerciseName: string; complexity: number | null }>;
  }>;
  highComplexityExercises: Array<{ exerciseId: string; exerciseName: string; complexity: number }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `COMPLEXITY_HIGH_VOLUME` | caution | heuristic | 3+ exercises with technicalComplexity ≥ 8 in a single session |
| `COMPLEXITY_CLIENT_MISMATCH` | warning | heuristic | Session average complexity significantly exceeds client experienceLevel (when client context provided) |

**Deterministic or Heuristic?**
Heuristic.

**Confidence**
Requires `technicalComplexity` scores.

**Explainability**
Deterministic template. AI phrasing in Phase 3 for client-specific explanation.

**Dependencies**
M00.

**Complexity**
Small.

**Recommended Phase**
2.

---

### GROUP 4 — Program Validation

---

#### M15 — Program Structure Validation

**Purpose**
Answers: "Does the program structure have any hard errors — missing weeks, duplicate day assignments, or structural gaps that would prevent correct assignment to a client?"

**Inputs**
- `program_weeks` (weekNumber ordering, gaps)
- `program_week_days` (dayOfWeek uniqueness per week, workoutTemplateId validity)
- `workout_templates` (status of each referenced template)

**Outputs**
`ProgramValidationResult`
```
interface ProgramValidationResult {
  valid: boolean;
  errors: PilFinding[];
  warnings: PilFinding[];
}
```

**Findings produced**

| Code | Condition |
|---|---|
| `PROGRAM_WEEK_GAP` | weekNumbers are not sequential (e.g., weeks 1, 2, 4 — week 3 missing) |
| `PROGRAM_EMPTY_WEEK` | A program week has no training days |
| `PROGRAM_ARCHIVED_BLUEPRINT` | A program_week_day references a workout_template with status=archived |
| `PROGRAM_NO_WEEKS` | Program has 0 weeks defined |
| `PROGRAM_ALL_REST` | No training days across the entire program (all days are rest/null) |

**Deterministic or Heuristic?**
Deterministic. All violations are structural facts.

**Confidence**
Always complete.

**Explainability**
Deterministic template.

**Dependencies**
None on PIL modules. Direct DB read.

**Complexity**
Small.

**Recommended Phase**
1D — before program-level analysis begins.

---

### GROUP 5 — Program Analysis (Phase 1)

---

#### M16 — Program Frequency Analysis

**Purpose**
Answers: "For each muscle group, how many training sessions per week target it — and is that frequency appropriate for recovery and adaptation?"

**Inputs**
- Program structure (weekNumber, dayOfWeek, workoutTemplateId per day)
- M00 (EnrichedBlueprint for each distinct template in the week)
- M03 outputs per blueprint (VolumeAnalysis — to know which muscles are trained each day)

**Outputs**
`FrequencyAnalysis`
```
interface FrequencyAnalysis {
  weekNumber: number;
  totalTrainingDays: number;
  totalRestDays: number;
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    sessionsPerWeek: number;
    trainingDays: number[];  // dayOfWeek values
    directSetsPerWeek: number;  // sum of directSets from M03 across all sessions
  }>;
  byPattern: Array<{
    pattern: MovementPattern;
    sessionsPerWeek: number;
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `FREQUENCY_HIGH` | caution | heuristic | Any muscle group trained ≥ 5 sessions per week |
| `FREQUENCY_ZERO_MAJOR` | info | certain | A major muscle group (glutes, quads, hamstrings, lats, chest) has 0 training sessions in a week within a program claiming to be full-body |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Depends on M03 completeness per blueprint.

**Explainability**
Deterministic template: "Quadriceps are trained directly 4 days this week (Monday, Wednesday, Thursday, Saturday) for a total of 28 direct sets."

**Dependencies**
M00, M03.

**Complexity**
Medium. Requires enriching and analyzing multiple blueprints, then aggregating across the week.

**Recommended Phase**
1D.

---

#### M17 — Recovery Spacing Analysis

**Purpose**
Answers: "For muscle groups trained multiple times per week, is there sufficient recovery time between sessions?"

**Inputs**
- M16 outputs (byMuscle.trainingDays — dayOfWeek per muscle per week)
- Adjacent week data (to detect week-boundary recovery gaps)

**Outputs**
`RecoverySpacingAnalysis`
```
interface RecoverySpacingAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    trainingPairs: Array<{
      day1: number;           // dayOfWeek
      day2: number;
      gapDays: number;        // calendar days between sessions
      week1: number;
      week2: number;
    }>;
    minRecoveryDays: number;  // shortest gap across all pairs
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `RECOVERY_SAME_DAY` | error | certain | Same muscle targeted in two sessions on the same day |
| `RECOVERY_CONSECUTIVE` | warning | heuristic | Same muscle trained on consecutive days (gap = 1) |
| `RECOVERY_SHORT` | caution | heuristic | Gap between sessions < 2 days for a high-volume muscle group |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Depends on M16. Can always compute gaps from day data.

**Explainability**
Deterministic template: "Hamstrings are trained Monday and Tuesday (1-day gap). General recovery guidelines suggest 48+ hours between sessions for the same primary muscle group."

**Dependencies**
M16 (Frequency Analysis).

**Complexity**
Small (given M16 output).

**Recommended Phase**
1D.

---

### GROUP 6 — Program Analysis (Phase 2)

---

#### M18 — Weekly Volume Progression

**Purpose**
Answers: "Does the program's volume follow a logical progression week-over-week — increasing appropriately, deloading when needed, and avoiding unstructured volume spikes?"

**Inputs**
- M03 outputs per week (VolumeAnalysis.byMuscle.directSets — summed per muscle across the week)
- M16 outputs per week (totalTrainingDays)
- All weeks in the program structure

**Outputs**
`VolumeProgressionAnalysis`
```
interface VolumeProgressionAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    weeklyVolume: Array<{ weekNumber: number; directSets: number }>;
    trend: 'increasing' | 'decreasing' | 'flat' | 'variable' | 'insufficient_data';
    maxWeeklyIncreasePct: number;  // largest single-week jump %
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `PROGRESSION_SPIKE` | warning | heuristic | Single-week volume increase >20% for any major muscle group |
| `PROGRESSION_NO_INCREASE` | info | heuristic | A 4+ week block shows no volume increase for a muscle group (for a non-deload program) |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Depends on M03 completeness per week.

**Explainability**
Deterministic template with week-by-week table.

**Dependencies**
M03 (per week), M16 (per week).

**Complexity**
Medium. Requires multi-week aggregation.

**Recommended Phase**
2.

---

#### M19 — Multi-Week Fatigue Accumulation

**Purpose**
Answers: "Is systemic fatigue accumulating at a rate that suggests a deload is needed before it is explicitly scheduled?"

**Inputs**
- M04 outputs per week (FatigueAnalysis.totalScore — summed per week)
- Program week structure (which weeks are marked as deload)

**Outputs**
`FatigueAccumulationAnalysis`
```
interface FatigueAccumulationAnalysis {
  weeklyFatigue: Array<{ weekNumber: number; weeklyScore: number; rollingAverage: number }>;
  peakAccumulationWeek: number | null;
  deloadWeeks: number[];
  projectedBurnoutWeek: number | null;  // heuristic projection
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `FATIGUE_ACCUMULATION_PEAK` | warning | heuristic | 3+ consecutive weeks of increasing fatigue score with no deload |
| `FATIGUE_DELOAD_TIMING` | caution | heuristic | Projected peak fatigue falls in a non-deload week |

**Deterministic or Heuristic?**
Heuristic. Fatigue accumulation modeling is inherently approximate.

**Confidence**
Depends on M04 coverage. Heavily reduced when fatigueCost is incomplete.

**Explainability**
Deterministic template with week-by-week fatigue chart data.

**Dependencies**
M04 (per week).

**Complexity**
Medium.

**Recommended Phase**
2.

---

#### M20 — Periodization Analysis

**Purpose**
Answers: "Does the program follow a coherent periodization structure — does it have identifiable accumulation, intensification, and realization phases? Does the volume/intensity arc make sense?"

**Inputs**
- M18 (Volume Progression)
- M19 (Fatigue Accumulation)
- M11 outputs per week (Intensity Distribution — RPE averages per week)
- Program week labels and notes (coach-authored context)

**Outputs**
`PeriodizationAnalysis`
```
interface PeriodizationAnalysis {
  detectedPhases: Array<{
    startWeek: number;
    endWeek: number;
    phase: 'accumulation' | 'intensification' | 'realization' | 'deload' | 'unclear';
    confidence: 'certain' | 'heuristic';
  }>;
  periodizationModel: 'linear' | 'undulating' | 'block' | 'unstructured' | 'insufficient_data';
  coachNotes: string[];  // extracted from week labels
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `PERIODIZATION_UNCLEAR` | info | heuristic | Volume and intensity metrics suggest no coherent progression arc across weeks |
| `PERIODIZATION_REALIZATION_LONG` | caution | heuristic | A realization phase (high intensity, low volume) exceeds 3 weeks without a preceding intensification phase |

**Deterministic or Heuristic?**
Primarily heuristic. Phase detection is model-dependent.

**Confidence**
Requires M11 (RPE data) and M18 (volume data) to be complete.

**Explainability**
Deterministic template with AI phrasing in Phase 3.

**Dependencies**
M11, M18, M19.

**Complexity**
Large. Phase detection requires pattern recognition over multi-week data.

**Recommended Phase**
2 (late Phase 2 or Phase 3 depending on complexity).

---

#### M21 — Deload Adequacy Analysis

**Purpose**
Answers: "When a deload week is scheduled, is it actually a deload — or is volume and intensity similar to the surrounding weeks?"

**Inputs**
- M03 outputs for deload weeks vs. surrounding weeks
- M04 outputs for deload weeks vs. surrounding weeks
- Program week labels (which weeks the coach intends as deloads)

**Outputs**
`DeloadAnalysis`
```
interface DeloadAnalysis {
  deloadWeeks: Array<{
    weekNumber: number;
    volumeReductionPct: number;  // relative to preceding week
    fatigueReductionPct: number;
    isActuallyDeload: boolean;   // volume and/or fatigue reduced by ≥ 30%
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `DELOAD_INSUFFICIENT_VOLUME_REDUCTION` | warning | heuristic | A labeled deload week has <30% volume reduction from the preceding week |
| `DELOAD_MISSING` | info | heuristic | Program is 8+ weeks with no identified deload period |

**Deterministic or Heuristic?**
Heuristic thresholds. Deterministic calculation.

**Confidence**
Depends on M03 and M04 completeness.

**Explainability**
Deterministic template: "Week 5 is labeled as a deload but total direct quad sets are 18 — only 12% less than Week 4 (20 sets). A meaningful deload typically reduces volume by 30-50%."

**Dependencies**
M03, M04, M18.

**Complexity**
Small (given M03/M04 outputs).

**Recommended Phase**
2.

---

#### M22 — Blueprint Diversity Analysis

**Purpose**
Answers: "Does the program use enough distinct workout blueprints to provide variety, or does repetition of the same blueprint every week risk staleness and adaptation plateau?"

**Inputs**
- Program week structure (workoutTemplateId per day per week — count of distinct templates)
- Total program weeks

**Outputs**
`DiversityAnalysis`
```
interface DiversityAnalysis {
  distinctBlueprintsUsed: number;
  totalBlueprintSlots: number;
  blueprintReuseRate: number;  // distinctBlueprints / totalSlots
  highFrequencyBlueprints: Array<{
    templateId: string;
    templateName: string;
    timesUsed: number;
    weekNumbers: number[];
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `DIVERSITY_SINGLE_BLUEPRINT` | info | certain | A program uses the same blueprint for all training days across all weeks |
| `DIVERSITY_LOW` | info | heuristic | Fewer than 3 distinct blueprints across a program ≥ 8 weeks |

**Deterministic or Heuristic?**
Deterministic calculation; heuristic thresholds.

**Confidence**
Always complete — counts from schedule data.

**Explainability**
Deterministic template.

**Dependencies**
None on other analysis modules. Direct schedule data.

**Complexity**
Small.

**Recommended Phase**
2.

---

### GROUP 7 — Client-Specific Analysis (Phase 2)

---

#### M23 — Contraindication Analysis

**Purpose**
Answers: "Do any exercises in this Blueprint conflict with this client's known injury history or health conditions?"

**Critical implementation note:** This module is limited by a structural gap between `injuries_limitations` (free text `bodyRegion` and `conditionName`) and `exercise_contraindications` (free text `conditionOrInjury` and `bodyRegion`). There is no FK link. Phase 2 matching will use `bodyRegion` text normalization (lowercased, stripped) as the primary join key, supplemented by keyword matching on `conditionName` vs. `conditionOrInjury`. This is not deterministic — it is probabilistic matching. **This gap must be documented as a known limitation.**

**Inputs**
- `EnrichedBlueprint` (exercise.contraindications[] from exercise_contraindications)
- `injuriesLimitations` (bodyRegion, conditionName, status, severity — for the specific client)

**Outputs**
`ContraindicationAnalysis`
```
interface ContraindicationAnalysis {
  conflicts: Array<{
    exerciseId: string;
    exerciseName: string;
    contraindicationSeverity: 'avoid' | 'modify' | 'monitor';
    matchedInjury: {
      injuryId: string;
      bodyRegion: string;
      conditionName: string | null;
      injuryStatus: InjuryStatus;
    };
    matchConfidence: 'exact' | 'region_match' | 'fuzzy';
    modificationNote: string | null;
    suggestedAlternativeRelationId: string | null;
  }>;
  reviewedExerciseCount: number;
  unresolvableExercises: number;  // exercises with contraindications but no match possible
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `CONTRAINDICATION_AVOID` | error | heuristic (due to text matching) | An exercise has severity='avoid' for a client's active injury |
| `CONTRAINDICATION_MODIFY` | warning | heuristic | An exercise has severity='modify' for a client's active injury |
| `CONTRAINDICATION_MONITOR` | caution | heuristic | An exercise has severity='monitor' for a client's active injury |

**ALL findings from this module are `confidence='heuristic'`** due to the text-matching limitation. The coach must review each flagged conflict. Catalyst makes no clinical guarantee.

**Deterministic or Heuristic?**
Heuristic (text matching on non-FK fields). Deterministic only if a future structured bridge is built.

**Confidence**
Always partial until the structured bridge between `injuries_limitations` and `exercise_contraindications` is built. This is a Phase 2 module with an acknowledged limitation.

**Explainability**
Deterministic template with explicit confidence disclosure: "Back Squat has a stored contraindication for 'lumbar spine' conditions (severity: avoid). This client has an active injury record with body region 'lower back' (matched on region — review recommended)."

**Dependencies**
M00.

**Complexity**
Large — the text matching, deduplication, and confidence scoring make this non-trivial.

**Recommended Phase**
2.

---

#### M24 — Equipment Access Analysis

**Purpose**
Answers: "Can this client perform all exercises in this Blueprint given their available equipment?"

**Critical implementation note:** `equipment_access` stores free-text `equipmentType` and `equipmentName`. `exercise_equipment` links to `equipment_catalog` by UUID. There is no FK link between a client's equipment inventory and the catalog. Phase 2 matching requires text-to-catalog normalization. This is probabilistic, not deterministic.

**Inputs**
- `EnrichedBlueprint` (exercise.resistanceType, from exercise_equipment via enrichment — requires adding equipment to enrichment in Phase 2)
- `equipmentAccess` (equipmentType, equipmentName, available — for the specific client)
- `exercise_equipment` (equipmentCatalogId, requirementType)
- `equipment_catalog` (name — for display)

**Outputs**
`EquipmentAnalysis`
```
interface EquipmentAnalysis {
  inaccessibleExercises: Array<{
    exerciseId: string;
    exerciseName: string;
    requiredEquipment: string[];
    missingEquipment: string[];
    matchConfidence: 'certain' | 'heuristic';
  }>;
  accessibleExercises: number;
  unknownAccessibility: number;  // exercises where equipment requirements are unclear
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `EQUIPMENT_MISSING_REQUIRED` | warning | heuristic | Client likely lacks required equipment for an exercise |

**Deterministic or Heuristic?**
Heuristic until the equipment access FK bridge is built.

**Confidence**
Partial due to text matching. Requires Phase 2 structured bridge.

**Explainability**
Deterministic template: "Back Squat requires a barbell and squat rack. Client's equipment profile does not include a squat rack (matched on 'rack' keyword — confirm with coach)."

**Dependencies**
M00 (extended to include equipment in Phase 2 enrichment).

**Complexity**
Large — same structural gap problem as M23.

**Recommended Phase**
2.

---

#### M25 — Goal Alignment Analysis

**Purpose**
Answers: "Does this program's volume, intensity, and movement pattern composition support the client's stated training goal?"

**Inputs**
- M03 outputs (VolumeAnalysis — per week)
- M05 outputs (MovementAnalysis)
- M11 outputs (IntensityAnalysis — RPE and rep range distribution)
- M16 outputs (FrequencyAnalysis)
- `clientGoals` (goalType, targetDate, priority)

Goal alignment rules (heuristic):
- `fat_loss`: benefit from compound movements, moderate volume, higher frequency, moderate RPE (7-8)
- `muscle_gain`: higher per-session direct volume (8-15 sets per muscle group per week), hypertrophic rep ranges (6-12), moderate-high RPE (7-9)
- `strength`: lower rep ranges (1-5), very high RPE (8.5-10), compound movements dominant, lower frequency
- `athletic_performance`: movement pattern variety, power/speed exercises present, moderate volume
- `general_health`, `mobility`, `maintenance`: broad movement variety, moderate volume, no extreme intensity

**Outputs**
`GoalAlignmentAnalysis`
```
interface GoalAlignmentAnalysis {
  goalType: GoalType;
  alignedDimensions: string[];
  misalignedDimensions: string[];
  overallAlignment: 'aligned' | 'partial' | 'misaligned' | 'unknown';
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `GOAL_INTENSITY_MISMATCH` | caution | heuristic | Average RPE profile conflicts with stated goal (e.g., strength goal but average RPE 6) |
| `GOAL_VOLUME_MISMATCH` | caution | heuristic | Total weekly volume pattern conflicts with stated goal |
| `GOAL_PATTERN_MISMATCH` | info | heuristic | Movement pattern distribution does not support stated goal |

**Deterministic or Heuristic?**
Heuristic. Goal alignment rules encode training science consensus, not absolute truths.

**Confidence**
Depends on M03, M05, M11, M16 completeness + client goal being set.

**Explainability**
Deterministic template. AI phrasing in Phase 3: nuanced explanation of why the mismatch matters.

**Dependencies**
M03, M05, M11, M16.

**Complexity**
Medium.

**Recommended Phase**
2.

---

#### M26 — Training Age Appropriateness

**Purpose**
Answers: "Is the technical complexity and exercise selection appropriate for this client's training experience?"

**Inputs**
- M14 outputs (ComplexityDistribution)
- `trainingProfiles` (experienceLevel, yearsTraining)
- `EnrichedBlueprint` (exercise.difficulty, exercise.technicalComplexity)

**Outputs**
`TrainingAgeAnalysis`
```
interface TrainingAgeAnalysis {
  clientExperienceLevel: string;
  sessionAverageComplexity: number | null;
  sessionAverageDifficulty: number | null;
  highComplexityExerciseCount: number;
  alignmentStatus: 'appropriate' | 'advanced_for_level' | 'too_basic' | 'unknown';
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `AGE_COMPLEXITY_HIGH` | caution | heuristic | Session has 3+ specialist-difficulty exercises for a beginner client |
| `AGE_EXERCISE_ADVANCED` | caution | heuristic | A specific exercise has difficulty=specialist and client is beginner or intermediate |

**Deterministic or Heuristic?**
Heuristic.

**Confidence**
Requires `technicalComplexity` scores and client `trainingProfile`.

**Explainability**
Deterministic template: "This session includes 2 exercises rated specialist difficulty (Olympic Clean, Snatch) while the client's profile shows beginner experience level."

**Dependencies**
M14.

**Complexity**
Small (given M14).

**Recommended Phase**
2.

---

### GROUP 8 — Performance Analysis (Phase 3)

---

#### M27 — Adherence Pattern Analysis

**Purpose**
Answers: "What does this client's actual workout completion history look like — which sessions are completed, which are skipped, and which exercises are most frequently abandoned mid-session?"

**Inputs**
- `workout_sessions` (clientId, workoutTemplateId, status, completionPercent, programWeekNumber, programDayOfWeek, completedAt)
- `workout_set_logs` (workoutTemplateExerciseId — to identify which exercises were actually started)

**Outputs**
`AdherenceAnalysis`
```
interface AdherenceAnalysis {
  overallCompletionPct: number;
  sessionCompletionByDay: Array<{
    dayOfWeek: number;
    completedCount: number;
    skippedCount: number;
    partialCount: number;
  }>;
  exercisesWithLowCompletion: Array<{
    exerciseId: string;
    exerciseName: string;
    sessionsAppeared: number;
    sessionsStarted: number;
    completionRate: number;
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `ADHERENCE_SESSION_LOW` | caution | certain | Client completes < 60% of scheduled sessions |
| `ADHERENCE_EXERCISE_ABANDONED` | info | certain | A specific exercise is abandoned (not logged) in > 40% of sessions where it appears |

**Deterministic or Heuristic?**
Deterministic calculation from session logs.

**Confidence**
Requires minimum 4 weeks of session data for meaningful patterns.

**Explainability**
Deterministic template. Evidence: session counts, completion rates per day, per exercise.

**Dependencies**
None on analysis modules. Reads directly from session tables.

**Complexity**
Medium.

**Recommended Phase**
3.

---

#### M28 — Performance Trend Analysis

**Purpose**
Answers: "Is this client's actual performance improving week-over-week — are actual RPE values decreasing (adaptation) or holding steady, and is actual weight/reps progressing?"

**Inputs**
- `workout_set_logs` (actualRpe, actualReps, actualWeightKg, actualDurationSeconds, workoutTemplateExerciseId, completedAt)
- `workout_template_exercises` (targetRpe, repsMin, repsMax, exerciseId)

**Outputs**
`PerformanceTrendAnalysis`
```
interface PerformanceTrendAnalysis {
  byExercise: Array<{
    exerciseId: string;
    exerciseName: string;
    weeklyAverageRpe: Array<{ week: number; avgRpe: number }>;
    weeklyAverageReps: Array<{ week: number; avgReps: number }>;
    weeklyAverageWeight: Array<{ week: number; avgWeightKg: number | null }>;
    rpeTrend: 'decreasing' | 'stable' | 'increasing' | 'insufficient_data';
    repsTrend: 'increasing' | 'stable' | 'decreasing' | 'insufficient_data';
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `PERFORMANCE_RPE_INCREASING` | caution | certain | An exercise shows consistently increasing actual RPE over 3+ weeks at same prescription |
| `PERFORMANCE_STAGNANT` | info | certain | No measurable reps or weight improvement over 4+ consecutive weeks |
| `PERFORMANCE_RPE_BELOW_TARGET` | info | heuristic | Consistently 2+ RPE below target (client may be under-stimulated) |

**Deterministic or Heuristic?**
Deterministic from log data; heuristic trend thresholds.

**Confidence**
Requires 4+ weeks of consistent set log data per exercise.

**Explainability**
Deterministic template with trend chart data.

**Dependencies**
None on analysis modules.

**Complexity**
Medium–Large. Data aggregation across many set logs, trend detection.

**Recommended Phase**
3.

---

#### M29 — Progressive Overload Validation

**Purpose**
Answers: "Does the client's actual training performance confirm that progressive overload is occurring — or is the prescribed progression being undermined by incomplete adherence or stagnant actual performance?"

**Inputs**
- M27 outputs (AdherenceAnalysis)
- M28 outputs (PerformanceTrendAnalysis)
- M18 outputs (VolumeProgressionAnalysis — prescribed progression)

**Outputs**
`ProgressiveOverloadValidation`
```
interface ProgressiveOverloadValidation {
  byExercise: Array<{
    exerciseId: string;
    prescribedProgressionExists: boolean;
    actualProgressionDetected: boolean;
    gap: 'no_gap' | 'prescription_not_progressing' | 'adherence_blocking' | 'performance_stagnant';
  }>;
}
```

**Findings produced**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `OVERLOAD_BLOCKED_BY_ADHERENCE` | warning | certain | Program shows week-over-week volume increase but client's session completion is < 70% |
| `OVERLOAD_STAGNANT` | caution | certain | Both prescription and performance are flat over 4+ weeks |

**Deterministic or Heuristic?**
Deterministic — all inputs are computed or measured facts.

**Confidence**
Requires M27 and M28 data completeness.

**Dependencies**
M27, M28, M18.

**Complexity**
Small (given M27/M28 outputs).

**Recommended Phase**
3.

---

### GROUP 9 — Intelligence Layer

---

#### M30 — Substitution Service

**Purpose**
Answers: "For an exercise that cannot or should not be performed (due to injury, equipment, preference), what are the most suitable alternatives?"

Phase 1D version: finds related exercises by relationType. Phase 2 version: filters by client contraindications and equipment. Phase 3 version: AI-assisted ranking with contextual explanation.

**Inputs**
Phase 1D:
- Source exerciseId
- Requested relationType(s) (regression, progression, substitute, lower_joint_stress)
- `exercise_relations` (bidirectional — both sourceExerciseId AND targetExerciseId directions)
- `exercises` (status=active filter, for each candidate)
- `exercise.primaryMuscleGroup`, `exercise.movementPattern` (for similarity scoring)

Phase 2 additions:
- M23 outputs (ContraindicationAnalysis — filter unsafe candidates)
- M24 outputs (EquipmentAnalysis — filter inaccessible candidates)

**Outputs**
`SubstitutionResult`
```
interface SubstitutionResult {
  sourceExerciseId: string;
  candidates: Array<{
    exerciseId: string;
    exerciseName: string;
    relationType: ExerciseRelationType;
    relationDirection: 'outbound' | 'inbound';
    suitabilityScore: number | null;
    substitutionPolicy: SubstitutionPolicy | null;
    primaryMuscleGroup: MuscleGroup;
    movementPattern: MovementPattern;
    similarityScore: number;  // computed from muscle+pattern overlap
    safetyStatus: 'safe' | 'caution' | 'contraindicated' | 'unknown';  // Phase 2+
  }>;
}
```

**Findings produced**
This module returns structured candidates, not findings. The coach selects from candidates. No finding is produced by this module itself.

**Deterministic or Heuristic?**
Deterministic (Phase 1D: query + similarity scoring). Heuristic (Phase 2: client-specific safety scoring).

**Confidence**
Depends on the quality and completeness of `exercise_relations` data. An exercise with no relations produces an empty candidates list.

**Explainability**
Each candidate carries its relationType and suitabilityScore. The UI can display: "Romanian Deadlift → Leg Curl: lower_joint_stress, suitability 80/100."

**Dependencies**
M00 (for exercise enrichment). M23, M24 (Phase 2).

**Complexity**
Medium. Bidirectional relation query + deduplication + similarity scoring.

**Recommended Phase**
1D (basic) → 2 (client-specific).

---

#### M31 — Blueprint Quality Summary

**Purpose**
Answers: "Given all available Blueprint analysis findings, what is the overall quality picture of this session — and what does a coach most need to address?"

This is an aggregation function, not an independent analysis. It runs after all applicable Blueprint modules (M01–M14) and produces a structured summary.

**Inputs**
- All applicable Blueprint module outputs

**Outputs**
`BlueprintQualitySummary`
```
interface BlueprintQualitySummary {
  templateId: string;
  templateName: string;
  findingCounts: { error: number; warning: number; caution: number; info: number };
  dimensionStatus: {
    validity: 'ok' | 'has_errors' | 'unknown';
    volume: 'ok' | 'elevated' | 'incomplete' | 'unknown';
    fatigue: 'moderate' | 'high' | 'incomplete' | 'unknown';
    movement: 'balanced' | 'imbalanced' | 'unknown';
    jointStress: 'low' | 'moderate' | 'high' | 'unknown';
    redundancy: 'none' | 'detected' | 'unknown';
    duration: 'appropriate' | 'long' | 'very_long' | 'unknown';
  };
  topFindings: PilFinding[];  // top 3 by severity, then confidence
  dataQuality: 'complete' | 'partial' | 'thin';
}
```

**Deterministic or Heuristic?**
Deterministic aggregation of analysis outputs.

**Dependencies**
All Blueprint modules.

**Complexity**
Small (aggregation only).

**Recommended Phase**
1B (initial version with M03/M04/M05 only) → grows as modules are added.

---

#### M32 — Program Quality Summary

**Purpose**
Answers: "Given all available Program analysis findings, what is the overall quality picture of this program — and what does a coach most need to address?"

**Inputs**
- All applicable Program module outputs (M15–M29)
- BlueprintQualitySummary per blueprint (M31)

**Outputs**
`ProgramQualitySummary`
```
interface ProgramQualitySummary {
  programId: string;
  weekCount: number;
  findingCounts: { error: number; warning: number; caution: number; info: number };
  dimensionStatus: {
    structure: 'ok' | 'has_errors' | 'unknown';
    frequency: 'appropriate' | 'high' | 'unknown';
    recovery: 'adequate' | 'insufficient' | 'unknown';
    progression: 'present' | 'absent' | 'unknown';
    periodization: 'structured' | 'unstructured' | 'unknown';
    goalAlignment: 'aligned' | 'partial' | 'misaligned' | 'unknown';
  };
  topFindings: PilFinding[];
  blueprintSummaries: BlueprintQualitySummary[];  // one per distinct blueprint
}
```

**Dependencies**
All Program modules. M31 per blueprint.

**Complexity**
Small (aggregation).

**Recommended Phase**
1D (initial) → grows as modules are added.

---

### GROUP 10 — Future / AI Consumers

---

#### M33 — AI-Assisted Program Generation

**Purpose**
Answers: "Given a set of coaching parameters (client goal, equipment, experience, time constraints), generate a complete program using structured PIL analysis as the constraint engine." AI proposes; PIL validates; coach approves.

**Inputs**
- Client profile (all relevant modules: goals, equipment, injuries, training profile)
- Coach preferences and coaching philosophy
- All PIL analysis modules (used as constraint validators during generation)
- AI model (for proposal generation — constrained by PIL outputs)

**Architecture note:**
This is the module where AI and PIL finally combine. AI generates candidate program structures; PIL audits each candidate using M01–M31; findings are fed back to the AI to refine proposals. The AI may not override a PIL `error` or `warning` finding — it must propose a revision.

**Phase:** Future (Phase 3+). Not before all Phase 1 and Phase 2 modules are stable.

---

#### M34 — Autoregulation Integration

**Purpose**
Answers: "Based on this client's actual RPE logs relative to prescribed RPE, should today's session be adjusted?" Session-level adjustment recommendation based on real-time or recent-session feedback.

**Inputs**
- M28 (PerformanceTrendAnalysis — recent RPE trends)
- `workout_set_logs` (actual vs. prescribed RPE for the last 1-2 sessions)
- Today's blueprint (for adjustment recommendation context)

**Phase:** Future (Phase 3). Requires robust M28 data.

---

#### M35 — Client Progress Prediction

**Purpose**
Answers: "Based on current adherence patterns, program quality, and performance trends, what is the predicted trajectory toward this client's goal?"

**Phase:** Future. Requires M25 (goal alignment), M27 (adherence), M28 (performance), and multiple months of session data.

---

## Dependency Map

```
External Data Sources
├── exercise_library (exercises, muscles, relations, contraindications)
├── workout_templates + sections + exercises (blueprints)
├── program_weeks + program_week_days (program structure)
├── client_programs + client_program_weeks + client_program_week_days (assigned programs)
├── workout_sessions + workout_set_logs (performance history)
└── client_profile tables (goals, training, health, equipment, injuries)

                    ┌─────────────────────────┐
                    │  M00: Blueprint          │ ← Phase 1A: ALL modules depend on this
                    │  Enrichment              │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────▼─────┐          ┌─────▼─────┐         ┌─────▼─────┐
    │M01 Validity│          │M02 Compl. │         │M03 Volume │ ← Phase 1B
    └───────────┘          └───────────┘         └─────┬─────┘
                                                        │
                    ┌───────────────────────────────────┤
                    │                   │               │
              ┌─────▼─────┐      ┌─────▼─────┐   ┌────▼────────┐
              │M04 Fatigue│      │M05 Movement│   │M09 Muscle   │ ← Phase 2
              └─────┬─────┘      └─────┬─────┘   │Balance      │
                    │                  │          └─────────────┘
              ┌─────▼─────┐      ┌─────▼─────┐
              │M06 Joint  │      │M07 Redund.│ ← Phase 1C
              │Stress     │      │           │
              └─────┬─────┘      └───────────┘
                    │
              ┌─────▼─────────────────────────────────────────┐
              │M08 Duration  M10 Biomech  M11 Intensity        │ ← Phase 1C / Phase 2
              │M12 Superset  M13 Ordering M14 Complexity       │
              └──────────────────────────┬────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │       M31: Blueprint Quality Summary     │ ← grows each phase
                    └─────────────────────────────────────────┘

Program Structure (independent from blueprint enrichment at the structural level)
    ┌─────────────────────────┐
    │  M15: Program Structure │ ← Phase 1D (before other program modules)
    │  Validation              │
    └─────────────────────────┘

Program Analysis (depends on M00 + M03 per blueprint per day)
    M00 + M03 ──► M16: Frequency Analysis ── Phase 1D
                       │
                       └──► M17: Recovery Spacing ── Phase 1D
                       │
    M03 (per week) ───► M18: Volume Progression ── Phase 2
    M04 (per week) ───► M19: Fatigue Accumulation ── Phase 2
    M11 (per week) ──┐
    M18 + M19 ───────┴► M20: Periodization Analysis ── Phase 2/3
    M03 + M04 ──────► M21: Deload Adequacy ── Phase 2
    (schedule only) ► M22: Blueprint Diversity ── Phase 2

Client-Specific (depends on program/blueprint analysis + client profile)
    M00 ──────────────────► M23: Contraindication Analysis ── Phase 2
    M00 ──────────────────► M24: Equipment Access ── Phase 2
    M03+M05+M11+M16 ─────► M25: Goal Alignment ── Phase 2
    M14 ─────────────────► M26: Training Age ── Phase 2

Performance (from session logs — no module dependencies)
    (session logs) ──────► M27: Adherence Pattern ── Phase 3
    (set logs) ──────────► M28: Performance Trend ── Phase 3
    M27 + M28 + M18 ────► M29: Progressive Overload Validation ── Phase 3

Intelligence
    M00 + exercise_relations ► M30: Substitution Service ── Phase 1D/2
    All blueprint modules ──► M31: Blueprint Quality Summary ── Phase 1B+
    All program modules ────► M32: Program Quality Summary ── Phase 1D+

Future AI
    All PIL modules ─────► M33: AI Program Generation ── Phase 3+
    M27 + M28 ──────────► M34: Autoregulation ── Phase 3+
    M25 + M27 + M28 ────► M35: Client Progress Prediction ── Future
```

---

## Knowledge Completeness Audit

This section audits every Exercise Library field required by the Programming Intelligence Layer. It answers whether the field exists in the schema, which phase needs it, what happens if it is missing, and whether a dedicated Knowledge Completion Sprint is required before PIL implementation.

### Legend
- **Phase 1 Required**: A Phase 1 module degrades without this field
- **Phase 2 Required**: A Phase 2 module needs this field
- **Unknown / Partial**: Field exists but population status of system exercise library is unknown
- **Action**: What PIL does when the field is null

---

### Exercise Library Fields

| Field | Exists | Phase 1 | Phase 2 | Phase 3+ | If Null | Catalog Action |
|---|---|---|---|---|---|---|
| `movementPattern` | ✅ NOT NULL | Required | Required | Required | Cannot be null | N/A — enforced |
| `classification` | ✅ NOT NULL | Required | Required | Required | Cannot be null | N/A — enforced |
| `status` | ✅ NOT NULL | Required | Required | Required | Cannot be null | N/A — enforced |
| `primaryMuscleGroup` | ✅ nullable | Required | Required | Required | Volume analysis excludes this exercise; flag `VOLUME_DATA_INCOMPLETE` | Skip exercise in volume count; report in M02 |
| `fatigueCost` | ✅ nullable (1–10) | Required | Required | Required | Fatigue module excludes; reduces coverage | Skip in M04; report coverage % in M02 |
| `jointStressShoulder` | ✅ nullable (0–10) | Required | Required | Required | Per-joint coverage reduced | Skip this joint for this exercise in M06 |
| `jointStressElbow` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `jointStressWrist` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `jointStressSpine` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `jointStressHip` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `jointStressKnee` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `jointStressAnkle` | ✅ nullable (0–10) | Required | Required | Required | Same | Same |
| `technicalComplexity` | ✅ nullable (1–10) | Not required | Required (M13, M14, M26) | Required | M13, M14, M26 return unknown | Report in M02; flag `incomplete_data` on those findings |
| `stabilityDemand` | ✅ nullable (1–10) | Not required | Required (M12) | — | M12 cannot assess superset risk | Flag `incomplete_data` on M12 |
| `lengthenedBias` | ✅ nullable (0–10) | Not required | Required (M10) | Required | M10 returns thin analysis | Report in M02; flag `incomplete_data` on M10 |
| `shortenedBias` | ✅ nullable (0–10) | Not required | Required (M10) | Required | Same | Same |
| `stretchMediatedPotential` | ✅ nullable (0–10) | Not required | Required (M10) | Required | Same | Same |
| `defaultBodyPosition` | ✅ nullable | Not required | Nice-to-have (M12) | — | M12 falls back to movementPattern | Degraded M12 |
| `unilateral` | ✅ boolean, NOT NULL | Not required | Nice-to-have (M09) | — | Defaults to false — low risk | Acceptable |
| `alternating` | ✅ boolean, NOT NULL | Not required | Nice-to-have | — | Same | Acceptable |
| `isTimeBased` | ✅ boolean, NOT NULL | Required (M08) | Required | Required | Affects duration estimation fallback | Use classification fallback in M08 |
| `isCardio` | ✅ boolean, NOT NULL | Not required | Nice-to-have | — | Classification handles most cases | Acceptable |
| `isMobility` | ✅ boolean, NOT NULL | Not required | Nice-to-have | — | Same | Acceptable |
| `resistanceType` | ✅ nullable | Not required | Required (M24) | — | Equipment analysis cannot determine resistance | Flag `unknown` in M24 |
| `defaultPrescription` | ✅ nullable JSONB | Required (Blueprint Picker) | Nice-to-have | — | Prescription scaffold unavailable | Already handled in Exercise Library |

### exercise_muscles Rows

| Data | Exists | Phase 1 | Phase 2 | If Missing |
|---|---|---|---|---|
| Primary muscle assignments per exercise | ✅ (table exists; population unknown) | Required for M03 | Required | M03 volume is incomplete for this exercise; M02 flags it |
| Secondary muscle assignments | ✅ | Nice-to-have Phase 1; Required Phase 2 | Required for M09 | Indirect volume unavailable for this exercise |
| Stabilizer muscle assignments | ✅ | Not required | Nice-to-have | No stabilizer volume tracking |
| emphasisPercent | ✅ nullable | Not required | Nice-to-have | Volume counted equally regardless; percentages used only for display |

### exercise_relations Rows

| Data | Exists | Phase 1 | Phase 2 | If Missing |
|---|---|---|---|---|
| Regression/progression relations | ✅ (table exists; population sparse) | Not required | Required (M30) | M30 returns empty candidates for this exercise |
| Substitute relations | ✅ | Not required | Required (M30) | Same |
| lower_joint_stress relations | ✅ | Not required | Required (M30, M23 suggestions) | Same |
| suitabilityScore on relations | ✅ nullable | Not required | Required (M30 ranking) | M30 returns unranked candidates |

### exercise_contraindications Rows

| Data | Exists | Phase 1 | Phase 2 | If Missing |
|---|---|---|---|---|
| Contraindication records per exercise | ✅ (table exists; population unknown) | Not required | Required (M23) | M23 cannot flag this exercise; safety gap |

### Client Profile Fields (for Phase 2 client-specific modules)

| Field | Exists | Schema Note | Phase 2 Use | If Missing |
|---|---|---|---|---|
| `client_goals.goalType` | ✅ structured enum | Fully structured | M25 Goal Alignment | M25 cannot run; no goal context |
| `training_profiles.experienceLevel` | ✅ enum | Fully structured | M26 Training Age | M26 cannot assess appropriateness |
| `training_profiles.yearsTraining` | ✅ nullable numeric | Semi-structured | M26 | Fallback to experienceLevel |
| `training_profiles.availableDaysPerWeek` | ✅ nullable integer | Structured | M25 context | Available but not critical |
| `injuries_limitations.bodyRegion` | ✅ free text | **NOT structured FK** | M23 Contraindication | Text matching only; heuristic |
| `injuries_limitations.conditionName` | ✅ free text | **NOT structured FK** | M23 | Text matching only; heuristic |
| `injuries_limitations.status` | ✅ enum | Structured | M23 (filter to active/chronic) | Acceptable |
| `equipment_access.equipmentType` | ✅ free text | **NOT FK to equipment_catalog** | M24 Equipment Access | Text matching only; heuristic |
| `equipment_access.equipmentName` | ✅ free text | **NOT FK to equipment_catalog** | M24 | Text matching only; heuristic |
| `health_profiles.diagnosedConditions` | ✅ free text | Free text | M23 supplementary | Cannot use deterministically |
| `health_profiles.physicianRestrictions` | ✅ free text | Free text | M23 supplementary | Cannot use deterministically |

### Structural Gaps (Not a Missing Field — Missing a Bridge)

| Gap | Impact | Required For | Mitigation in Phase 2 |
|---|---|---|---|
| `injuries_limitations` ↔ `exercise_contraindications` have no FK bridge; both use free text body region | M23 must rely on text normalization; all contraindication matches are heuristic | M23 | Phase 2: build `injury_contraindication_bridge` mapping table or normalize both to a controlled vocabulary |
| `equipment_access` ↔ `equipment_catalog` have no FK bridge; client equipment is free text | M24 must rely on text matching | M24 | Phase 2: build bridge or require clients to select from `equipment_catalog` items |

### Assessment: Is a Knowledge Completion Sprint Required?

**Yes — before Phase 1B, not before Phase 1A.**

Phase 1A (types and enrichment) can proceed immediately. No Exercise Library data is needed to build the type system and enrichment query.

Phase 1B (Volume, Fatigue, Movement analysis) will produce findings only as good as the library's scoring data. Based on the 15-exercise seed script, it is not known whether `fatigueCost`, `jointStress*`, or `exercise_muscles` rows are populated for system exercises. Before Phase 1B ships to a coach, the following minimum scoring population should be verified:

| Data | Minimum Required for Phase 1B Value |
|---|---|
| `exercise_muscles` rows | All 15 seeded exercises should have at least primary muscle assignments |
| `fatigueCost` | All compound exercises (Back Squat, Deadlift, Hip Thrust, etc.) should be scored |
| `movementPattern` | Already NOT NULL — no action needed |
| `jointStress*` | At minimum, `jointStressSpine` and `jointStressKnee` for Phase 1C value |

**Recommendation:** Designate the window between Phase 1A (types + enrichment) and Phase 1B (first analysis modules) as the **Knowledge Completion window**. Populate scores for all 15 seeded exercises before Phase 1B begins. Continue populating as the library grows.

---

## Analysis Philosophy

### Should Catalyst have a numeric Program Score?

No.

A single numeric score (e.g., "Program Score: 73/100") fails for three reasons:

1. **It implies calibration that doesn't exist.** The weights assigned to volume imbalance, joint stress, recovery spacing, and periodization coherence would be arbitrary. Changing any weight changes every score. There is no ground truth to calibrate against.

2. **It collapses distinct concerns.** A program with excellent volume and movement balance but dangerous back-to-back spine loading might score 80/100. A coach who acts on that score without seeing the joint stress detail has been misled.

3. **It varies across coaching philosophies.** A powerlifting program and a general health program have legitimately different appropriate scores on the same metrics. A universal score treats them identically.

### Should Catalyst have category scores?

Not numeric ones. But dimensional status indicators per category are valuable — and honest.

**Recommendation: Status per dimension (3 states) + categorized findings.**

Instead of "Fatigue Score: 68," display:

```
Fatigue Load:    ◉ HIGH    — 3 exercises with cost ≥ 7; coverage 80%
Volume:          ◉ OK      — within guidelines for all major muscles
Movement:        ◉ CAUTION — horizontal push:pull ratio 4:1
Joint Stress:    ◉ MODERATE — lumbar spine cumulative score elevated
Recovery:        ◉ OK      — all muscles have 48+ hours between sessions
```

Three states (OK / CAUTION or ELEVATED / UNKNOWN) plus the finding detail beneath each dimension gives coaches:
- Fast scanability (the status row)
- Full detail on demand (the findings)
- Honest representation of incomplete data (UNKNOWN)

This is not fake precision. Three states per dimension is calibrated to what the analysis can actually claim.

### Formal Distinction Between Finding Types

Catalyst must formally distinguish four types of findings. These are constitutional, not stylistic:

**Hard Violations** — `severity: 'error'`, `confidence: 'certain'`
- The prescription or structure is definitively wrong regardless of coaching philosophy
- Examples: repsMin > repsMax; archived exercise referenced; same muscle trained twice in one session at the program level
- No threshold — the condition is binary
- Response: must be resolved before Blueprint can be published (existing validator behavior extended)

**Evidence-Informed Guidelines** — `severity: 'warning'`, `confidence: 'heuristic'`
- Rules backed by research consensus with defensible thresholds; not universal but correct for the majority of coaching contexts
- Examples: horizontal push:pull ratio > 2:1; consecutive same-muscle training days
- Response: coach should have a deliberate reason to proceed despite the warning

**Heuristics** — `severity: 'caution'`, `confidence: 'heuristic'`
- Reasonable defaults that require coaching judgment; intentional exceptions are valid
- Examples: >10 direct sets per muscle per session; exercise redundancy detection; high-fatigue exercise ordering
- Response: coach reviews; no automatic action required

**Incomplete Data** — any severity, `confidence: 'incomplete_data'`
- A finding that could not be fully computed because required Exercise Library data is absent
- The finding that would have fired is noted, along with what data would enable it
- Response: improve library data quality; finding does not imply the program is problematic

**Coach Preferences** — `severity: 'info'` or configurable in Phase 2
- Observations that reflect coaching philosophy without a universal right answer
- Examples: session duration estimates; blueprint diversity; zero direct sets for a muscle in a week
- Response: informational; no response required unless it surfaces an oversight

---

## Engine Architecture Review

This section challenges the current proposed architecture. The intent is criticism, not confirmation.

---

### Challenge 1: The `EnrichedBlueprint` type is load-bearing and underspecified — lock it early or pay later

The entire PIL engine passes `EnrichedBlueprint` between modules. If the type changes — adding a field, removing one, changing a nested type — every analysis module must be updated.

The current plan schedules Phase 1A to define this type. That is correct. But the plan does not specify the review process for the type before it is written. If the type is written, analysis modules are built against it, and then Phase 2 requires adding `equipment` data to enrichment, a cascade change is necessary.

**Recommendation:** The `EnrichedBlueprint` type should be reviewed and explicitly approved before Phase 1A code is written. The type contract is the most consequential decision in the entire Phase 1 implementation.

---

### Challenge 2: The finding `id` is ephemeral — this becomes a problem in Phase 2

Findings are described as having a random UUID "stable per analysis run." Two runs of the same audit on the same unchanged blueprint produce different finding IDs. This means:

- A coach cannot dismiss a finding and have that dismissal persist
- A UI cannot track which findings the coach has reviewed
- An AI consumer cannot reference a specific finding from a prior run

For Phase 1 (UI-only, no persistence), this is acceptable. For Phase 2 (where AI orchestration needs to reference specific findings, and coaches may want to annotate or dismiss findings), ephemeral IDs are a structural problem.

**Recommendation:** Define a deterministic finding `code` that encodes the module, the rule, and the primary affected entity — not a random UUID. Example: `vol:VOLUME_HIGH_DIRECT:quadriceps` — deterministic, stable across runs, survives blueprint changes that don't affect this finding. Reserve the `id` field for run-scoped tracking only. When Phase 2 adds finding persistence, the `code` becomes the stable identity key.

---

### Challenge 3: The dual-source problem is underspecified

Catalyst has two program representations:
- Template programs: `program_weeks` + `program_week_days` (owned by the coach's template library)
- Assigned client programs: `client_program_weeks` + `client_program_week_days` (owned by the client record)

The current architecture defines `getBlueprintEnriched(templateId)` and gestures at `getEnrichedClientProgram` without specifying the differences. These differences matter:

- Template program analysis informs Blueprint-level editing decisions
- Client program analysis informs client-specific coaching decisions
- A coach may want to audit the template before assigning, and audit the client's assigned copy after customization

**Recommendation:** Define two distinct enrichment paths explicitly in Phase 1D:
- `getEnrichedTemplateProgram(programTemplateId)` — reads from `program_weeks` + `program_week_days`
- `getEnrichedClientProgram(clientProgramId)` — reads from `client_program_weeks` + `client_program_week_days`

The analysis modules (M16–M32) must accept either structure. The types should share a common `EnrichedProgramWeek` interface with an optional `sourceType: 'template' | 'client'` tag.

---

### Challenge 4: `getBlueprintAudit` has too many responsibilities in its current description

The orchestration function `getBlueprintAudit(templateId, coachId?)` is described as calling enrichment and then all applicable analysis modules. For Phase 1B, this is three modules. By Phase 2, this could be twelve. A single function that grows unboundedly will become difficult to test and modify.

**Recommendation:** Introduce a standard audit pipeline pattern:

```
type BlueprintAnalysisModule = (blueprint: EnrichedBlueprint, context?: PilContext) => ModuleAnalysis;

getBlueprintAudit runs the enrichment once, then passes the result through a registered list of modules.
```

Modules are registered, not hardcoded as call sites. Adding a Phase 2 module requires registering it, not modifying `getBlueprintAudit`. This also enables selective module execution (run only volume + fatigue, skip duration and redundancy) when performance or scope demands it.

---

### Challenge 5: The `suggestedActions` type is too narrow for AI consumers

`suggestedActions` on a finding is defined as:
```
interface PilSuggestedAction {
  label: string;
  type: 'substitute' | 'remove' | 'reorder' | ...
  exerciseId?: string;
}
```

For Phase 1 (coach reads a text label and acts manually), this is sufficient. For Phase 3 (AI generates a revised blueprint from PIL findings), an AI consumer needs to act on `suggestedActions` programmatically. The action must carry enough context to drive the action without re-deriving it.

A `type: 'substitute'` action with only `exerciseId?` tells the AI "replace this exercise with something" — but not with what. The AI must call the Substitution Service again.

**Recommendation:** Design `suggestedActions` for AI consumption from the start, even if Phase 1 ignores the extra fields:

```
interface PilSuggestedAction {
  label: string;
  type: 'substitute' | 'remove' | 'reorder' | 'adjust_volume' | 'add_exercise' | 'adjust_rest' | 'increase_frequency';
  sourceExerciseId?: string;   // exercise to replace/remove
  candidateExerciseIds?: string[];  // pre-computed substitutes (from M30)
  targetDayOfWeek?: number;   // for frequency adjustments
  targetWeekNumbers?: number[]; // for program-level adjustments
  volumeAdjustment?: { muscleGroup: MuscleGroup; setsDelta: number }; // for volume adjustments
}
```

---

### Challenge 6: Module M31 and M32 create a summary-of-summaries risk

`BlueprintQualitySummary` (M31) is built from all Blueprint module outputs. `ProgramQualitySummary` (M32) is built from all Program module outputs, and includes `blueprintSummaries[]` from M31.

If M31 and M32 both render dimension status for the same concerns (e.g., joint stress appears in both the Blueprint summary and the Program summary), coaches see two places with joint stress information that may appear inconsistent if one is per-session and the other is program-level.

**Recommendation:** Define clear scope boundaries:
- M31 (`BlueprintQualitySummary`) answers only per-session questions
- M32 (`ProgramQualitySummary`) answers only cross-session and program-level questions
- M32 embeds M31 summaries per day without re-analyzing them

The program-level joint stress finding (`JOINT_STRESS_HIGH_CUMULATIVE`) lives in M32, not in M31. The session-level finding lives in M31. They are distinct.

---

### Challenge 7: A missing module — Prescription Coherence

The current catalog has Prescription Validity (M01) for structural errors and Intensity Distribution (M11) for RPE analysis. Neither covers the case where a prescription's constituent fields are individually valid but incoherent as a combination.

Examples of incoherent prescriptions:
- A `myo_reps` technique with `targetRpe: 5` (myo-reps require near-maximal effort; RPE 5 is incompatible)
- A `drop_set` technique with `repsMin: 1` and `repsMax: 3` (drop sets are hypertrophic techniques; strength rep ranges defeat the purpose)
- A `stretch_mediated_finisher` technique with `targetRpe: 6` (this technique requires high mechanical tension; RPE 6 is insufficient)
- `targetRpe: 9.5` with `repsMax: 20` (physiologically implausible — 20 reps at RPE 9.5 implies no capacity left for progressive overload)

**Recommendation:** Add M01a — Prescription Coherence Check, a sub-module within M01 that validates the internal logic of combined prescription fields. Small complexity, genuine value, belongs in Phase 1B or 1C. Its findings have `severity: 'caution'` and `confidence: 'certain'`.

---

### Challenge 8: Violation of Doctrine P-9 — Extensibility without fragmentation — is already latent

The existing `workout-validator.ts` in `lib/db/workout-validator.ts` runs validation independently of PIL. It performs its own prescription checks. When M01 (Prescription Validity) is built, there will be two validation paths for the same errors.

**This is the first fragmentation risk.** The existing validator will produce different finding formats (the current `ValidationResult` type) from M01 (which produces `PilFinding[]`). Coaches will encounter validation errors in two places: the Blueprint editor (via the existing validator) and the Blueprint audit (via M01).

**Recommendation:** In Phase 1B, refactor `workout-validator.ts` to call M01 (the PIL validation module) rather than maintaining its own validation logic. The Blueprint editor continues to call the validator; the validator calls PIL internally and translates findings to the format the editor expects. This preserves the existing API contract while eliminating duplicate logic.

---

## Final Recommendation

### The smallest version that makes coaches say "I've never seen software analyze my programming like this before"

Not: "You have 14 sets of quads." Any spreadsheet can count sets.

Not: "Your push:pull ratio is 4:1." Coaches know this intuitively.

Not: "Exercise X and Y are redundant." Coaches recognize their own programming decisions.

**The differentiating insight is synthesis across multiple dimensions that coaches cannot efficiently compute manually — and that no current platform computes at all.**

The capability that crosses that threshold is:

### The Per-Muscle Weekly Brief

A view that shows, for every muscle group in a program week, the following in a single structured table:

| Muscle Group | Direct Sets/Wk | Indirect Sets/Wk | Training Days | Shortest Rest |
|---|---|---|---|---|
| Quadriceps | 28 | 12 | 4 | 1 day |
| Hamstrings | 9 | 18 | 2 | 3 days |
| Glutes | 15 | 22 | 4 | **0 days** ⚠ |
| Chest | 18 | 4 | 2 | 3 days |
| Rear Deltoid | 4 | 10 | 2 | 3 days |
| Lats | 21 | 6 | 3 | 1 day |
| Quadriceps : Hamstrings (direct) | **3.1:1** ⚠ | | | |

This table is generated automatically from structured exercise and program data. It requires:
- M00 (Blueprint Enrichment) — knows each exercise's muscles and roles
- M03 (Volume Analysis) — calculates direct and indirect sets per muscle per session
- M16 (Program Frequency Analysis) — aggregates across sessions in the week
- M17 (Recovery Spacing Analysis) — computes minimum rest between sessions

Four modules. All deterministic. No AI required.

No current coaching platform — Trainerize, Everfit, CoachRx, TrueCoach, or any comparable tool — generates this table automatically. Every coach who has used a spreadsheet to track this has done it manually. When Catalyst produces it automatically and flags the 0-day glute recovery gap and the 3:1 quad-to-hamstring imbalance without the coach having to calculate anything, the response will be what the user described.

**This is the minimum differentiated release.** It requires a functioning Exercise Library with muscle data populated, a functioning enrichment layer, and volume + frequency + recovery modules. It is achievable in Phase 1D.

Everything beyond this is an expansion of an engine that already does something no competitor does.

---

## Phase Summary Table

| Module | Name | Phase | Complexity | Schema Ready? |
|---|---|---|---|---|
| M00 | Blueprint Enrichment | 1A | Small | ✅ Yes |
| M01 | Prescription Validity | 1A | Small | ✅ Yes |
| M02 | Blueprint Completeness | 1B | Small | ✅ Yes |
| M03 | Volume Analysis | 1B | Small | ✅ Yes (needs muscle data) |
| M04 | Fatigue Analysis | 1B | Small | ✅ Yes (needs fatigueCost) |
| M05 | Movement Pattern Analysis | 1B | Small | ✅ Yes |
| M06 | Joint Stress Analysis | 1C | Small | ✅ Yes (needs jointStress scores) |
| M07 | Exercise Redundancy | 1C | Small | ✅ Yes (needs muscle data) |
| M08 | Session Duration Estimation | 1C | Small | ✅ Yes |
| M09 | Muscle Balance Analysis | 2 | Small | ✅ Yes (needs M03) |
| M10 | Biomechanical Profile Analysis | 2 | Small | ⚠ Needs biometric scores |
| M11 | Intensity Distribution | 2 | Small | ✅ Yes |
| M12 | Superset Compatibility | 2 | Small–Med | ⚠ Needs stabilityDemand |
| M13 | Exercise Ordering | 2 | Small | ⚠ Needs technicalComplexity |
| M14 | Technical Complexity Distribution | 2 | Small | ⚠ Needs technicalComplexity |
| M15 | Program Structure Validation | 1D | Small | ✅ Yes |
| M16 | Program Frequency Analysis | 1D | Medium | ✅ Yes (depends on M03) |
| M17 | Recovery Spacing Analysis | 1D | Small | ✅ Yes (depends on M16) |
| M18 | Weekly Volume Progression | 2 | Medium | ✅ Yes (depends on M03) |
| M19 | Multi-Week Fatigue Accumulation | 2 | Medium | ⚠ Needs fatigueCost (depends on M04) |
| M20 | Periodization Analysis | 2/3 | Large | ⚠ Needs M11, M18, M19 |
| M21 | Deload Adequacy | 2 | Small | ✅ Yes (depends on M03, M04) |
| M22 | Blueprint Diversity | 2 | Small | ✅ Yes |
| M23 | Contraindication Analysis | 2 | Large | ⚠ No FK bridge (text matching) |
| M24 | Equipment Access Analysis | 2 | Large | ⚠ No FK bridge (text matching) |
| M25 | Goal Alignment | 2 | Medium | ✅ Yes (depends on M03, M05, M11, M16) |
| M26 | Training Age Appropriateness | 2 | Small | ⚠ Needs technicalComplexity |
| M27 | Adherence Pattern Analysis | 3 | Medium | ✅ Yes |
| M28 | Performance Trend Analysis | 3 | Med–Large | ✅ Yes |
| M29 | Progressive Overload Validation | 3 | Small | ✅ Yes (depends on M27, M28) |
| M30 | Substitution Service | 1D/2 | Medium | ✅ Yes (sparse relations data) |
| M31 | Blueprint Quality Summary | 1B+ | Small | Depends on phase modules |
| M32 | Program Quality Summary | 1D+ | Small | Depends on phase modules |
| M33 | AI Program Generation | 3+ | X-Large | Requires all Phase 1–2 |
| M34 | Autoregulation Integration | 3+ | Large | Requires M28 |
| M35 | Client Progress Prediction | Future | X-Large | Requires M25, M27, M28 |

---

## Document History

| Date | Change |
|---|---|
| 2026-07-28 | Initial version — full module catalog, dependency map, knowledge audit, architecture review, final recommendation |
