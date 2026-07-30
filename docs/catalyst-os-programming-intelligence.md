# Catalyst OS — Programming Intelligence Layer

Phase 1 Architecture & Implementation Plan · July 2026

---

## Overview

The Programming Intelligence Layer (PIL) is a deterministic coaching engine that evaluates, validates, and explains strength-training programs using structured data from the Exercise Library and program schema. It does not generate programs. It does not apply changes. It produces transparent findings that a coach can act on.

This document defines the Phase 1 architecture for PIL: responsibilities, inputs, outputs, analysis modules, service design, and implementation sequence. It is a design specification for approval before code is written.

The constitutional principles governing PIL are defined in `docs/AI_PRINCIPLES.md` under "Programming Intelligence Doctrine" (P-1 through P-9).

---

## A. Phase 1 Responsibilities

**PIL Phase 1 will:**

- Analyze Blueprint programming for volume, fatigue, movement-pattern distribution, joint stress, exercise redundancy, and estimated session duration
- Analyze Program structure for muscle-group frequency and recovery spacing across training weeks
- Identify meaningful risks and imbalances with categorized severity
- Generate transparent findings with structured evidence — every number visible, every rule named
- Return typed analysis contracts consumable by future UI routes and AI consumers

**PIL Phase 1 will not:**

- Generate complete programs or propose full blueprint replacements
- Automatically rewrite, reorder, or alter any existing Blueprint, Program, or Assignment
- Use an LLM for any calculation or scoring
- Diagnose injuries or apply client-health contraindication filtering (no structured bridge exists yet)
- Create exercises or edit the Exercise Library
- Silently apply substitutions
- Build autonomous optimization or rebalancing loops
- Apply coach-specific threshold configurations (defaults only in Phase 1)

---

## B. Inputs

### Exercise Knowledge

From `exercises` and related tables:

| Field | Source | Notes |
|---|---|---|
| `id`, `name`, `slug` | `exercises` | Identity |
| `movementPattern` | `exercises` | 27 patterns |
| `classification` | `exercises` | compound, isolation, cardio, mobility, power, skill |
| `difficulty` | `exercises` | beginner → specialist |
| `fatigueCost` | `exercises` | 1–10; null for exercises not yet scored |
| `technicalComplexity` | `exercises` | 1–10; null for exercises not yet scored |
| `stabilityDemand` | `exercises` | 1–10; null |
| `jointStress{Shoulder,Elbow,Wrist,Spine,Hip,Knee,Ankle}` | `exercises` | 0–10; null per joint |
| `lengthenedBias`, `shortenedBias`, `stretchMediatedPotential` | `exercises` | 0–10; null |
| `primaryMuscleGroup` | `exercises` | denormalized from exercise_muscles |
| `scope`, `status` | `exercises` | for validation |
| `muscles[]` | `exercise_muscles` | muscleGroup, role (primary/secondary/stabilizer), emphasisPercent |
| `relations[]` | `exercise_relations` | relationType, suitabilityScore, substitutionPolicy |
| `contraindications[]` | `exercise_contraindications` | conditionOrInjury, bodyRegion, severity |
| `effectivePrescription` | `exercise_coach_overrides` ?? `exercises.defaultPrescription` | resolved per coach |

### Blueprint Prescription Data

From `workout_template_exercises` and `workout_template_sections`:

| Field | Source | Notes |
|---|---|---|
| `sets` | `workout_template_exercises` | null = unset |
| `repsMin`, `repsMax` | `workout_template_exercises` | nullable |
| `restSeconds` | `workout_template_exercises` | nullable |
| `tempo` | `workout_template_exercises` | 4-character string |
| `targetRpe`, `targetRir` | `workout_template_exercises` | nullable numeric |
| `setTechnique` | `workout_template_exercises` | straight, superset, myo_reps, etc. |
| `groupId`, `groupPosition` | `workout_template_exercises` | superset/triset grouping |
| `isRequired`, `substitutionPolicy` | `workout_template_exercises` | |
| `orderIndex`, `sectionId` | `workout_template_exercises` | placement |
| `sectionType` | `workout_template_sections` | warmup, main_lift, accessory, etc. |
| `estimatedMinutes` | `workout_template_sections` | optional coach estimate |

### Program Structure

From `program_weeks`, `program_week_days`, `client_program_weeks`, `client_program_week_days`:

| Field | Source | Notes |
|---|---|---|
| `weekNumber` | `program_weeks` / `client_program_weeks` | 1-indexed |
| `label`, `notes` | `program_weeks` / `client_program_weeks` | optional |
| `dayOfWeek` | `program_week_days` / `client_program_week_days` | 0=Sun … 6=Sat |
| `workoutTemplateId` | `program_week_days` / `client_program_week_days` | null = rest day |

### Future-Aware Inputs (Not in Phase 1)

The following will eventually connect to PIL but require infrastructure not yet built:

| Input | Missing Infrastructure | Target Phase |
|---|---|---|
| Client goals | No structured goal → program bridge | Phase 2 |
| Training age | No `trainingAge` field on client profile | Phase 2 |
| Equipment access | No `client_equipment_access` table | Phase 2 |
| Injury/limitation matching | `injuries_limitations` is free text; no FK bridge to `exercise_contraindications` | Phase 2 |
| Check-in adherence | `workout_sessions.completionPercent` exists; service needed | Phase 2 |
| Workout performance trends | `workout_set_logs.actualRpe`, `actualWeightKg` exist; trend analysis needed | Phase 2 |

These are noted here so the Phase 1 enrichment types include placeholder fields that Phase 2 can populate without changing the analysis function signatures.

---

## C. Outputs — The Analysis Contract

### PilFinding

Every finding PIL produces must conform to this type. All fields are required except `suggestedActions`.

```typescript
interface PilFinding {
  id: string;                          // random UUID, stable per analysis run
  code: string;                        // e.g. VOLUME_QUADS_HIGH, PUSH_PULL_IMBALANCE_H
  category: PilCategory;
  severity: PilSeverity;
  confidence: PilConfidence;
  title: string;                       // short coach-facing description
  explanation: string;                 // deterministic template text in Phase 1
  evidence: PilEvidenceFact[];         // structured facts that produced this finding
  affectedEntities: PilAffectedEntity[];
  suggestedActions?: PilSuggestedAction[];
}

type PilCategory =
  | 'volume'
  | 'fatigue'
  | 'movement'
  | 'joint_stress'
  | 'redundancy'
  | 'duration'
  | 'frequency'
  | 'recovery'
  | 'progression'
  | 'validity';

type PilSeverity =
  | 'error'     // prescription is definitively wrong (repsMin > repsMax, missing exercise)
  | 'warning'   // evidence-informed guideline violated with a defensible threshold
  | 'caution'   // heuristic concern; coaching judgment applies
  | 'info';     // optimization opportunity or informational context

type PilConfidence =
  | 'certain'           // derived from structured data with a clear rule
  | 'heuristic'         // reasonable default; may not apply to every coaching philosophy
  | 'incomplete_data';  // could not be fully computed due to missing library data

interface PilEvidenceFact {
  label: string;            // e.g. "Weekly quad sets", "Push:pull ratio (horizontal)"
  value: string | number;
  unit?: string;            // e.g. "sets", "ratio", "minutes"
}

interface PilAffectedEntity {
  type: 'exercise' | 'blueprint' | 'section' | 'day' | 'week';
  id: string;
  label?: string;           // exercise name, section type, week number, etc.
}

interface PilSuggestedAction {
  label: string;
  type: 'substitute' | 'remove' | 'reorder' | 'adjust_volume' | 'add_exercise' | 'increase_frequency';
  exerciseId?: string;
  weekIds?: string[];
}
```

### Why this shape over the proposed example

The user's proposed shape (`id`, `code`, `category`, `severity`, `confidence`, `title`, `explanation`, `evidence`, `affectedEntities`, `suggestedActions`) is correct in structure. Two refinements:

1. `evidence` is typed as `PilEvidenceFact[]` rather than an unstructured string or object. This allows AI consumers in Phase 2 to read specific facts without parsing text, and allows the UI to render evidence rows rather than blocks of prose.

2. `affectedEntities` has a `type` discriminant so consumers know whether an ID is an exercise, a blueprint section, a training day, or a program week. Untyped IDs create consumer-side guessing.

### No Numeric Program Score

PIL Phase 1 does not produce an aggregate numeric score (e.g., "Program Score: 73/100"). Reasons:

- A composite score implies calibrated weightings that do not yet exist
- It collapses distinct concerns (volume, joint stress, redundancy) into a single number that obscures which concerns are serious
- Different coaching philosophies have legitimately different thresholds; a universal score would be wrong for at least some of them

What coaches see instead: categorized findings with counts by severity. "2 warnings, 3 cautions, 5 info items" communicates actionability without fake precision. A summary panel can render these counts visually without requiring a score.

Numeric scores per category (e.g., a fatigue score) are valid *metrics* — they should be returned as part of the analysis objects and displayed to coaches. A score per module is not the same as a synthetic program score.

---

## D. Analysis Modules

### Module 1: Blueprint Enrichment (Phase 1A)

**Purpose:** Single, N+1-free database query that returns a Blueprint with complete exercise knowledge attached. Everything downstream depends on this function.

**Consumes:** `workout_templates`, `workout_template_sections`, `workout_template_exercises`, `exercises`, `exercise_muscles`, `exercise_coach_overrides`

**Returns:** `EnrichedBlueprint` — a typed structure containing every prescription enriched with the exercise's full PIL-relevant properties.

**Applies to:** Blueprint (template analysis). A separate `getEnrichedClientProgram` variant draws from the client-owned tables.

**Deterministic:** Yes (pure DB read).

**Unknown condition:** An exercise referenced by a prescription cannot be found (status=archived or deleted). The enrichment layer flags this per-prescription; analysis modules must handle `exercise: null` gracefully.

**Query design (5 queries regardless of exercise count):**
1. Fetch `workout_template_sections` for the template
2. Fetch `workout_template_exercises` for the template
3. Fetch `exercises IN (...exerciseIds)` — batch
4. Fetch `exercise_muscles WHERE exercise_id IN (...exerciseIds)` — batch
5. Fetch `exercise_coach_overrides WHERE exercise_id IN (...exerciseIds) AND coach_id = coachId` — batch (only when coachId provided)

**Phase:** 1A — first function built; all other modules depend on it.

---

### Module 2: Volume Analysis (Phase 1B)

**Purpose:** Calculate direct and indirect sets per muscle group across a Blueprint.

**Consumes:** `EnrichedBlueprint` (exercise.primaryMuscleGroup, exercise.muscles, prescription.sets)

**Calculates:**
- Direct sets per muscle group: SUM(prescription.sets) for prescriptions where this muscle is `role='primary'`
- Indirect sets per muscle group: SUM(prescription.sets) for prescriptions where this muscle is `role='secondary'` or `'stabilizer'`
- Exercises contributing to each muscle group total (for evidence)
- Exercises where `sets` is null (incomplete prescriptions)

**Returns:** `VolumeAnalysis`
```typescript
interface VolumeAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    directSets: number;
    indirectSets: number;
    totalSets: number;
    contributingExerciseIds: string[];
  }>;
  totalPrescribedSets: number;
  prescriptionsWithMissingMuscleData: string[];  // exercise IDs with no exercise_muscles rows
  prescriptionsWithUnsetSets: string[];           // exercise IDs where sets is null
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `VOLUME_MUSCLE_ZERO_DIRECT` | `info` | `certain` | A major muscle group has 0 direct sets |
| `VOLUME_MUSCLE_HIGH_DIRECT` | `caution` | `heuristic` | Direct sets for a muscle group exceed 10 in a single session |
| `INCOMPLETE_MUSCLE_DATA` | `caution` | `incomplete_data` | One or more exercises lack exercise_muscles rows |

**Applies to:** Blueprint. Program-level volume is the sum of blueprint volumes across program_week_days.

**Deterministic:** Yes.

**Assumptions:** Emphasis percent is used for evidence display only — it does not affect set counting. All primary-role muscles receive equal set credit regardless of emphasisPercent.

**Unknown condition:** When `sets` is null, the prescription is counted as 0 direct sets and flagged in `prescriptionsWithUnsetSets`.

**Phase:** 1B.

---

### Module 3: Fatigue Analysis (Phase 1B)

**Purpose:** Calculate session fatigue load from prescription sets × exercise fatigueCost scores.

**Consumes:** `EnrichedBlueprint` (exercise.fatigueCost, exercise.classification, prescription.sets)

**Calculates:**
- Per-exercise fatigue contribution: `prescription.sets × exercise.fatigueCost`
- Session total fatigue score (sum of contributions for exercises with known fatigueCost)
- Session coverage: what percentage of prescribed sets have known fatigueCost
- Exercises with null fatigueCost (incomplete data)

**Returns:** `FatigueAnalysis`
```typescript
interface FatigueAnalysis {
  totalScore: number;                   // sum of all non-null contributions
  coveragePct: number;                  // 0–100: % of prescribed sets with known fatigueCost
  contributors: Array<{
    exerciseId: string;
    exerciseName: string;
    fatigueCost: number;
    sets: number;
    contribution: number;
  }>;
  exercisesWithUnknownFatigue: string[]; // exercise IDs where fatigueCost is null
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `FATIGUE_HIGH_SINGLE_EXERCISE` | `caution` | `heuristic` | An exercise has fatigueCost ≥ 8 and sets ≥ 4 |
| `FATIGUE_MULTIPLE_HIGH_COST` | `caution` | `heuristic` | 3+ exercises with fatigueCost ≥ 7 in one session |
| `FATIGUE_DATA_INCOMPLETE` | `info` | `incomplete_data` | Coverage < 70% (less than 70% of sets have scored exercises) |

**Applies to:** Blueprint.

**Deterministic:** Yes when data exists. `incomplete_data` when coverage is low.

**Important design note:** PIL does not claim a threshold for total session fatigue score (e.g., "above 80 is too much"). The raw numbers are informative for coach comparison across blueprints. Only specific patterns (multiple high-cost exercises, extreme individual exercises) generate findings. Absolute totals are metrics, not findings.

**Phase:** 1B.

---

### Module 4: Movement Pattern Analysis (Phase 1B)

**Purpose:** Analyze the distribution of movement patterns and identify mechanical imbalances.

**Consumes:** `EnrichedBlueprint` (exercise.movementPattern, prescription.sets)

**Calculates:**
- Set volume per movement pattern
- Horizontal push (push_horizontal) vs. horizontal pull (pull_horizontal) ratio
- Vertical push (push_vertical) vs. vertical pull (pull_vertical) ratio
- Exercises without a movement pattern (cannot be classified)

**Returns:** `MovementAnalysis`
```typescript
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
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `PUSH_PULL_IMBALANCE_H` | `warning` | `heuristic` | Horizontal push:pull ratio > 2:1 |
| `PUSH_PULL_IMBALANCE_V` | `caution` | `heuristic` | Vertical push:pull ratio > 2:1 |
| `PATTERN_DOMINANCE` | `info` | `certain` | Any single pattern exceeds 40% of total session sets |

**Applies to:** Blueprint.

**Deterministic:** Yes.

**Assumption:** The push/pull finding fires only when both push and pull prescriptions exist. A lower-body session with zero push and zero pull does not produce a push/pull imbalance finding — the absence of both is not an imbalance.

**Phase:** 1B.

---

### Module 5: Joint Stress Analysis (Phase 1C)

**Purpose:** Identify sessions with high cumulative joint load on specific joints.

**Consumes:** `EnrichedBlueprint` (exercise.jointStress*, prescription.sets)

**Calculates:**
- Per-joint cumulative score across the session: SUM(prescription.sets × exercise.jointStressX) for each joint dimension
- Per-joint peak score: highest single jointStressX among prescriptions
- Exercises contributing ≥ 6 to a joint score (high-stress contributors)

**Returns:** `JointStressAnalysis`
```typescript
interface JointStressAnalysis {
  byJoint: Array<{
    joint: 'shoulder' | 'elbow' | 'wrist' | 'spine' | 'hip' | 'knee' | 'ankle';
    cumulativeScore: number;
    peakScore: number;
    highContributors: Array<{ exerciseId: string; exerciseName: string; score: number; sets: number }>;
    exercisesWithUnknownScore: string[];
  }>;
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `JOINT_STRESS_HIGH_CUMULATIVE` | `warning` | `heuristic` | A joint's cumulative score exceeds 40 in a single session |
| `JOINT_STRESS_MULTIPLE_HIGH` | `caution` | `heuristic` | 3+ exercises score ≥ 6 on the same joint |
| `JOINT_STRESS_EXTREME_SINGLE` | `caution` | `certain` | A single exercise scores ≥ 9 on any joint |

**Applies to:** Blueprint.

**Deterministic:** Yes when data exists.

**Unknown condition:** When jointStress is null for an exercise, that exercise is excluded from cumulative scoring and listed in `exercisesWithUnknownScore`.

**Phase:** 1C.

---

### Module 6: Exercise Redundancy Detection (Phase 1C)

**Purpose:** Find exercises in the same Blueprint that target the same movement pattern and primary muscle group, indicating potential unintentional overlap.

**Consumes:** `EnrichedBlueprint` (exercise.movementPattern, exercise.primaryMuscleGroup)

**Calculates:**
- Groups of exercises sharing the same (movementPattern, primaryMuscleGroup) pair
- For each group: total sets, exercise names, section types (warmup vs. main lift context)

**Returns:** `RedundancyAnalysis`
```typescript
interface RedundancyAnalysis {
  redundantGroups: Array<{
    movementPattern: MovementPattern;
    primaryMuscleGroup: MuscleGroup;
    exercises: Array<{ id: string; name: string; sets: number | null; sectionType: string | null }>;
    totalSets: number;
  }>;
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `EXERCISE_REDUNDANCY` | `caution` | `heuristic` | 2+ exercises share movementPattern + primaryMuscleGroup |

**Applies to:** Blueprint.

**Deterministic:** Yes.

**Confidence is deliberately `heuristic`**: intentional exercise pairing is a legitimate programming strategy (e.g., two hamstring hip-hinge exercises for hypertrophy variety). This finding informs; the coach decides.

**Phase:** 1C.

**What this module does NOT do:** Cross-reference `exercise_relations WHERE relationType='same_pattern'`. That is a richer redundancy definition and is deferred to Phase 2. Phase 1 uses the simpler and fully deterministic (movementPattern + primaryMuscleGroup) definition.

---

### Module 7: Session Duration Estimation (Phase 1C)

**Purpose:** Estimate total session duration from available section estimates and prescription structure.

**Consumes:** `EnrichedBlueprint` (sections.estimatedMinutes, prescription.sets, prescription.restSeconds, exercise.isTimeBased, exercise.durationSeconds)

**Calculates:**
- If all sections have `estimatedMinutes`: sum them (certain)
- Otherwise: heuristic estimate
  - Per prescription: estimated_execution_time + (sets - 1) × restSeconds
  - estimated_execution_time ≈ sets × (avg_set_duration) where avg_set_duration by classification:
    - `cardio`: use prescription.durationSeconds if set; else 5 minutes
    - `compound`/`power`: 45 seconds per set
    - `isolation`: 30 seconds per set
    - `mobility`: 60 seconds per set

**Returns:** `DurationEstimate`
```typescript
interface DurationEstimate {
  estimatedMinutes: number;
  confidence: 'certain' | 'heuristic';
  basisNote: string;  // e.g. "Based on coach-set section estimates" or "Estimated from set structure"
  prescriptionsWithMissingRest: string[]; // exercise IDs where restSeconds is null
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `SESSION_LONG` | `caution` | `heuristic` | Estimated duration exceeds 90 minutes |
| `SESSION_VERY_LONG` | `warning` | `heuristic` | Estimated duration exceeds 120 minutes |

**Applies to:** Blueprint.

**Deterministic/Heuristic:** Depends on data. When section.estimatedMinutes are complete, this is certain. Otherwise it is heuristic.

**Phase:** 1C.

---

### Module 8: Program Frequency Analysis (Phase 1D)

**Purpose:** For each muscle group, calculate how many distinct sessions per week target it across a program week.

**Consumes:** Program week structure (weekNumber, dayOfWeek, workoutTemplateId per day) + `getBlueprintEnriched` per distinct template in the week

**Calculates:**
- Sessions per week per muscle group (direct training days)
- Sessions per week per movement pattern
- Total training days per week
- Rest day count per week

**Returns:** `FrequencyAnalysis`
```typescript
interface FrequencyAnalysis {
  weekNumber: number;
  trainingDays: number;
  restDays: number;
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    sessionsPerWeek: number;
    trainingDays: number[]; // dayOfWeek values
  }>;
  byPattern: Array<{
    pattern: MovementPattern;
    sessionsPerWeek: number;
  }>;
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `FREQUENCY_HIGH` | `caution` | `heuristic` | A muscle group is targeted 5+ days per week |
| `FREQUENCY_LOW` | `info` | `heuristic` | A major muscle group is targeted 0 days in a week (for programs claiming to be full-body) |

**Applies to:** Program (weekly aggregation).

**Deterministic:** Yes.

**Phase:** 1D.

---

### Module 9: Recovery Spacing Analysis (Phase 1D)

**Purpose:** For each muscle group targeted on multiple days, compute the minimum rest between consecutive sessions and flag insufficient recovery.

**Consumes:** `FrequencyAnalysis` (byMuscle.trainingDays per week) + week-to-week day data for multi-week programs

**Calculates:**
- Minimum gap between consecutive training days for each muscle group (within a week and across week boundaries)
- Gap in days: dayOfWeek[i+1] - dayOfWeek[i], accounting for week wrapping

**Returns:** `RecoverySpacingAnalysis`
```typescript
interface RecoverySpacingAnalysis {
  byMuscle: Array<{
    muscleGroup: MuscleGroup;
    minRecoveryDays: number;    // shortest gap between any two sessions targeting this muscle
    trainingPairs: Array<{ day1: number; day2: number; gapDays: number }>;
  }>;
}
```

**Findings this module produces:**

| Code | Severity | Confidence | Condition |
|---|---|---|---|
| `RECOVERY_SAME_DAY` | `error` | `certain` | Same muscle group targeted on the same dayOfWeek in the same week (different blueprints, same day) |
| `RECOVERY_CONSECUTIVE` | `warning` | `heuristic` | A muscle group is targeted on consecutive days (gap = 1) |
| `RECOVERY_SHORT` | `caution` | `heuristic` | A muscle group is targeted with < 48 hours between sessions (gap < 2 days) |

**Applies to:** Program.

**Deterministic:** Yes.

**Phase:** 1D.

---

### Deferred Modules

The following modules were evaluated and deferred from Phase 1:

**Substitution Service** — deferred to Phase 1D or Phase 2. The bidirectional relation query exists in the schema, but meaningful substitution requires the client-health contraindication bridge (not yet built). A Phase 1D version can provide "related exercises" by relationType — useful but scoped. Full injury-aware substitution is Phase 2.

**Progression Validation** — deferred to Phase 2. The program schema supports comparing blueprints week-over-week, but PIL has no calibrated model for "appropriate progression rate." Arbitrary thresholds for volume or intensity increase would produce misleading findings. This requires both the model and validated thresholds before it is useful.

**Equipment Conflict Detection** — deferred to Phase 2. `exercise_equipment` exists in the schema. Blueprint-level conflict detection (an exercise requires equipment that conflicts with another exercise in the same session) is feasible. Client-level conflict detection (equipment a specific client doesn't have) requires a `client_equipment_access` table that doesn't exist yet. Blueprint-level is the smaller and buildable scope, but is low-urgency relative to volume/fatigue/movement analysis.

---

## E. Scoring Philosophy

### No Single Program Score

PIL Phase 1 does not produce a composite numeric program score. The reasons are technical, not aspirational.

A composite score requires calibrated weightings across heterogeneous concerns (volume imbalance + joint stress + movement balance + recovery spacing). These weightings would be arbitrary, impossible to justify to a coach who asks "why 73?", and wrong for at least some coaching philosophies. The number would look precise while being fabricated.

### What replaces a score

Each analysis module returns **metrics** (numbers that describe a state) and **findings** (judgments about whether a state is noteworthy). The distinction matters:

- **Metric:** "Quadriceps received 14 direct sets in this session."
- **Finding:** "14 direct sets exceeds the 10-set caution threshold for a single session."

Metrics are always returned. Findings are conditional on rules or heuristics. A coach looking at the audit view sees both.

The finding count by severity serves as the practical equivalent of a score — "0 errors, 2 warnings, 4 cautions" is immediately interpretable and actionable in a way a single number is not.

### Severity thresholds

| Severity | Meaning | Example |
|---|---|---|
| `error` | Prescription is definitively wrong regardless of coaching philosophy | repsMin > repsMax; exercise not found in library |
| `warning` | An evidence-informed guideline is violated; the threshold is defensible and documented | Horizontal push:pull ratio > 2:1; consecutive same-muscle training days |
| `caution` | A heuristic concern that may or may not apply; coaching judgment governs | >10 direct sets in one session; multiple high-fatigue exercises |
| `info` | An optimization opportunity or informational note | A muscle group with 0 direct sets; session estimated at 85 minutes |

### How findings distinguish confidence levels

Every finding includes a `confidence` field:
- `certain` — the conclusion follows from the data by clear definition (e.g., a prescribed exercise has status=archived)
- `heuristic` — the threshold or rule reflects general evidence but is not universal
- `incomplete_data` — the finding could not be completed because Exercise Library scoring data is missing

This distinction allows coaches to weight findings appropriately. An `error`/`certain` finding demands attention. A `caution`/`heuristic`/`incomplete_data` finding is context-dependent.

### Future coach-configurable thresholds

Phase 2 can introduce a `coach_programming_preferences` table that stores optional threshold overrides per coach. The Phase 1 heuristic thresholds become the system defaults. Coaches who train advanced athletes might raise the volume threshold; coaches prioritizing injury prevention might lower the joint-stress threshold.

Phase 1 does not implement this. Phase 1 hard-codes clearly documented defaults. When Phase 2 adds configuration, the analysis functions accept a `context?` parameter with optional overrides.

---

## F. Service Architecture

### Directory Structure

```
lib/pil/
  types.ts              — all shared PIL types
  enrichment.ts         — getBlueprintEnriched, getProgramEnriched (DB access)
  volume.ts             — analyzeBlueprintVolume (pure function)
  fatigue.ts            — analyzeBlueprintFatigue (pure function)
  movement.ts           — analyzeBlueprintMovement (pure function)
  joint-stress.ts       — analyzeBlueprintJointStress (pure function)
  redundancy.ts         — analyzeBlueprintRedundancy (pure function)
  duration.ts           — estimateSessionDuration (pure function, heuristic)
  frequency.ts          — analyzeProgramFrequency (pure function — takes enriched week data)
  recovery.ts           — analyzeProgramRecovery (pure function)
  blueprint-audit.ts    — getBlueprintAudit (orchestrates enrichment + all blueprint modules)
  program-audit.ts      — getProgramAudit (orchestrates enrichment + all program modules)

__tests__/pil/
  volume.test.ts
  fatigue.test.ts
  movement.test.ts
  joint-stress.test.ts
  redundancy.test.ts
  duration.test.ts
  frequency.test.ts
  recovery.test.ts
```

### Design Principles for the Service Layer

**1. DB access is isolated to enrichment functions**

`enrichment.ts` is the only file in `lib/pil/` that imports from `lib/db/`. All other modules receive `EnrichedBlueprint` or `EnrichedProgram` as input and return typed analysis objects. This makes the analysis modules testable without a database and means the enrichment strategy can change without touching the analysis logic.

**2. No N+1 queries**

`getBlueprintEnriched(templateId, coachId?)`:
1. One query: `workout_template_sections WHERE workoutTemplateId = X`
2. One query: `workout_template_exercises WHERE workoutTemplateId = X`
3. One batch query: `exercises WHERE id IN (...all exerciseIds)`
4. One batch query: `exercise_muscles WHERE exerciseId IN (...all exerciseIds)`
5. One batch query (when coachId present): `exercise_coach_overrides WHERE exerciseId IN (...) AND coachId = X`

Total: 5 queries regardless of blueprint size.

`getProgramEnriched(programId)` or `getTemplateProgramEnriched(templateId)`:
- Collect distinct `workoutTemplateId` values across all weeks and days
- Batch-call `getBlueprintEnriched` for all distinct templates once
- Return a structured week-by-week schedule with pre-enriched blueprints attached

**3. Pure calculation functions**

Analysis modules are pure TypeScript functions: same inputs → same outputs, no side effects, no DB calls. This enables unit testing without infrastructure. Example:

```typescript
// volume.ts
export function analyzeBlueprintVolume(blueprint: EnrichedBlueprint): VolumeAnalysis { ... }

// NOT this:
export async function analyzeBlueprintVolume(templateId: string): Promise<VolumeAnalysis> { ... }
```

**4. Effective prescription resolution**

`getBlueprintEnriched` resolves `effectivePrescription` for each exercise when a `coachId` is provided, using the same logic introduced in Exercise Library Fix 1: `coachOverride.defaultPrescription ?? exercise.defaultPrescription`. Analysis functions that use prescription data (volume primarily) use this resolved value.

**5. Bidirectional relation lookup**

When `enrichment.ts` populates `exercise.relations`, it queries both:
- `WHERE sourceExerciseId = X` (outbound)
- `WHERE targetExerciseId = X` (inbound)

Results are tagged by direction so the substitution service and redundancy module can use them correctly. This fixes the unidirectional gap from the architecture review.

**6. Bulk coach override fetch**

A new function `getCoachOverridesForExercises(coachId, exerciseIds[])` is added to `lib/db/exercise-service.ts`. This replaces the N+1 pattern that would otherwise be needed. It is called once per enrichment operation.

**7. Caching**

No caching in Phase 1. Blueprint enrichment is fast (5 queries, ~20 exercises). Program enrichment batches distinct templates. If performance issues emerge at scale (many weeks, many distinct blueprints), a `pil_audit_cache` table with a content hash key and TTL can be added in Phase 2. Do not add it prematurely.

### Audit Entry Points

```
app/api/internal/
  blueprints/[id]/audit/route.ts     — GET → calls getBlueprintAudit
  programs/[id]/audit/route.ts       — GET → calls getProgramAudit
```

Both routes use `requireCoachOrAdmin()` and accept an optional `coachId` for override resolution.

The audit functions in `blueprint-audit.ts` and `program-audit.ts` are the only consumers of PIL modules that are also called from API routes. They orchestrate enrichment → analysis → finding collection → typed response.

### Separation from `lib/db/`

PIL is a consumer of `lib/db/`, not an extension of it. The service functions in `lib/db/exercise-service.ts` and `lib/db/workout-template-service.ts` are not modified to support PIL (except for the `getCoachOverridesForExercises` bulk function, which belongs in the exercise service regardless of PIL). PIL's domain logic lives entirely in `lib/pil/`.

---

## G. Findings and Explainability Model

### The structure of evidence

Every finding carries `evidence: PilEvidenceFact[]` — an array of labeled fact rows that produced the finding. These are not prose; they are structured data rows that the UI renders as a table or list.

Example evidence for `PUSH_PULL_IMBALANCE_H`:
```
[
  { label: "Horizontal push sets", value: 12 },
  { label: "Horizontal pull sets", value: 3 },
  { label: "Push:pull ratio", value: "4:1", unit: "ratio" },
  { label: "Threshold", value: "2:1", unit: "ratio" }
]
```

Example evidence for `VOLUME_QUADS_HIGH`:
```
[
  { label: "Direct quad sets", value: 14, unit: "sets" },
  { label: "Contributing exercises", value: "Back Squat, Leg Press, Bulgarian Split Squat" },
  { label: "Caution threshold", value: 10, unit: "sets" }
]
```

This structure allows:
- **Deterministic text generation**: the `explanation` field is generated from a template function that reads the evidence facts
- **AI phrasing in Phase 2**: the AI model receives the structured evidence and produces a coaching-voice explanation; it does not invent the facts
- **UI rendering**: the evidence panel can render each fact as a labeled row without parsing prose

### Deterministic text in Phase 1

Every `explanation` is generated by a pure TypeScript function that takes the analysis result and produces a string. Example:

```typescript
function explainPushPullImbalance(evidence: PilEvidenceFact[]): string {
  const pushSets = evidence.find(e => e.label === 'Horizontal push sets')?.value ?? '?';
  const pullSets = evidence.find(e => e.label === 'Horizontal pull sets')?.value ?? '?';
  return `Horizontal pushing volume (${pushSets} sets) significantly exceeds horizontal pulling ` +
    `volume (${pullSets} sets). A push:pull ratio above 2:1 is associated with increased ` +
    `shoulder joint stress over time. Consider adding or increasing horizontal pulling work.`;
}
```

This is:
- Auditable: the code is readable and the output is predictable
- Testable: the function can be unit-tested against known inputs
- An inventory: it establishes the content vocabulary AI will later rephrase
- Honest: the numbers appear in the text because they come from the structured evidence

### AI phrasing in Phase 2+

When Phase 2 introduces AI phrasing:
1. The structured `evidence` array is passed to the model
2. The model produces a coaching-voice explanation
3. The coach reviews the explanation in the audit UI (following AI_PRINCIPLES.md P-1)
4. The approved phrasing is stored with coach approval metadata
5. The `explanation` field in the stored finding holds the approved AI-generated text

The structured `evidence` is never AI-generated. AI rephrases the human-facing `explanation` only.

**Confirmation:** Structured facts plus deterministic baseline text in Phase 1, AI language added in Phase 2. This is the correct sequencing.

---

## H. Phase Breakdown

### Phase 1A — Core Foundation

Deliverables:
- `lib/pil/types.ts`: all shared types (PilFinding, EnrichedBlueprint, VolumeAnalysis, FatigueAnalysis, etc.)
- `lib/pil/enrichment.ts`: `getBlueprintEnriched(templateId, coachId?)`, `getEnrichedClientProgram(clientProgramId, coachId?)`
- `lib/db/exercise-service.ts`: add `getCoachOverridesForExercises(coachId, exerciseIds[])`
- Unit tests for enrichment output shape

**This phase ships nothing visible. It is the critical path foundation — nothing else builds until it exists.**

### Phase 1B — Blueprint Analysis: Core Modules

Deliverables:
- `lib/pil/volume.ts`: `analyzeBlueprintVolume`
- `lib/pil/fatigue.ts`: `analyzeBlueprintFatigue`
- `lib/pil/movement.ts`: `analyzeBlueprintMovement`
- `lib/pil/blueprint-audit.ts`: `getBlueprintAudit` (runs 1A + volume + fatigue + movement)
- `app/api/internal/blueprints/[id]/audit/route.ts`
- Unit tests for each analysis module

**This is the first release with user value. A coach can call the audit API for any blueprint and receive volume, fatigue, and movement pattern findings.**

### Phase 1C — Blueprint Analysis: Extended Modules

Deliverables:
- `lib/pil/joint-stress.ts`: `analyzeBlueprintJointStress`
- `lib/pil/redundancy.ts`: `analyzeBlueprintRedundancy`
- `lib/pil/duration.ts`: `estimateSessionDuration`
- Update `lib/pil/blueprint-audit.ts` to include new modules
- Unit tests

### Phase 1D — Program Analysis

Deliverables:
- `lib/pil/frequency.ts`: `analyzeProgramFrequency`
- `lib/pil/recovery.ts`: `analyzeProgramRecovery`
- `lib/pil/program-audit.ts`: `getProgramAudit`
- `app/api/internal/programs/[id]/audit/route.ts`
- Unit tests

### Phase 1E — Coach-Facing Audit UI

Deliverables:
- `app/hq/blueprints/[id]/audit/page.tsx`: Blueprint Audit view
- `app/hq/programs/[id]/audit/page.tsx`: Program Audit view
- Shared finding display component: severity badge, title, explanation, expandable evidence panel
- Links from Blueprint editor and Program editor to respective audit pages
- No AI dependency in Phase 1E

**This phase completes the PIL MVP. Coaches have an audit view for both Blueprints and Programs. All findings are deterministic, all evidence is visible.**

---

## I. Explicit Deferrals

The following are explicitly out of scope for Phase 1 and should not be built until the phase that requires them:

| Feature | Why Deferred | Target Phase |
|---|---|---|
| Client-health contraindication bridge | `injuries_limitations` is free text; structured bridge doesn't exist | Phase 2 |
| Injury-aware substitution with contraindication exclusion | Requires client-health bridge | Phase 2 |
| Adherence-aware recommendations | Requires workout session completion analysis service | Phase 2 |
| Performance-aware progression (actual RPE vs. target, load trends) | Requires set_log trend analysis | Phase 2 |
| Autonomous program optimization or rebalancing | Explicitly prohibited by PIL doctrine | Never (coach authority) |
| AI program generation | Requires complete PIL foundation first | Phase 3+ |
| AI phrasing of PIL findings | Phase 1 uses deterministic text; AI phrasing is additive | Phase 2 |
| Auto-substitution (applied without coach approval) | Explicitly prohibited by PIL doctrine | Never (coach authority) |
| Program version comparison and diffing | Useful but not critical for foundation | Phase 2 |
| Coach-configurable threshold profiles | Phase 1 uses documented system defaults | Phase 2 |
| `coach_recently_used_exercises` denormalization | Performance concern at scale; not critical yet | Phase 2 |
| Formal progression validation | No calibrated model for appropriate progression rate | Phase 2 |
| Equipment conflict detection (client-specific) | Requires `client_equipment_access` table | Phase 2 |

---

## J. Final Recommendations

### What is the smallest coherent and valuable Phase 1 release?

Phase 1B: Blueprint Audit with volume, fatigue, and movement pattern analysis accessible via API. A coach who calls `GET /api/internal/blueprints/[id]/audit` receives actionable findings about any blueprint in the library — without AI, without client-specific data, without new schema. This is the foundation that proves the architecture works and delivers immediate coaching value.

### What should be implemented first?

Phase 1A — shared types and `getBlueprintEnriched`. Every other module depends on the enriched blueprint structure. If the enrichment output type changes, every analysis module must change. Lock it first. The types should be reviewed and approved before analysis modules are built.

### What should not be built yet?

- Anything in the Deferrals list above
- A numeric program score
- Coach-facing UI (Phase 1E) before the API layer is validated (Phases 1A–1D)
- Any AI involvement in calculating or producing findings

### Does the current schema support the recommended design?

Yes, completely. The Exercise Library schema (exercises, exercise_muscles, exercise_relations, exercise_contraindications, exercise_coach_overrides), the Blueprint schema (workout_template_exercises, workout_template_sections), and the Program schema (program_weeks, program_week_days, client_program_weeks, client_program_week_days, workout_sessions, workout_set_logs) contain every field needed for Phase 1 analysis.

### Are any schema changes genuinely required?

No. Phase 1 can be fully implemented without a migration. The `getCoachOverridesForExercises` bulk function requires no schema change — it reads from `exercise_coach_overrides` which already exists.

The first schema change PIL might eventually require is a `pil_audit_cache` table for storing computed audit results with a content hash key and TTL — but only if on-demand computation becomes slow at scale. That is a Phase 2 concern.

### Decisions requiring approval before implementation begins

The following require explicit approval before code is written:

1. **PilFinding type contract** — the exact interface as defined in Section C should be reviewed and approved. Changes to this type after implementation begins cascade through every analysis module and API response.

2. **Volume thresholds** — the caution threshold for direct sets per muscle group per session is currently set at 10. This is a documented heuristic. Approval needed: is 10 the right default? Should it vary by classification (compound vs. isolation)?

3. **Push/pull balance threshold** — currently set at 2:1 for `warning`. Approval needed: is 2:1 the right threshold, or should horizontal and vertical imbalance use different ratios?

4. **Fatigue scoring thresholds** — `FATIGUE_HIGH_SINGLE_EXERCISE` fires at fatigueCost ≥ 8 AND sets ≥ 4. `FATIGUE_MULTIPLE_HIGH_COST` fires at 3+ exercises with fatigueCost ≥ 7. Approval needed on these specific values.

5. **Phase 1B scope** — should duration estimation (Phase 1C) be included in Phase 1B? It adds relatively little complexity but increases scope. Recommendation is to keep 1B focused on volume/fatigue/movement and build 1C as a second pass.

6. **API route naming** — `GET /api/internal/blueprints/[id]/audit` and `GET /api/internal/programs/[id]/audit`. The blueprints route uses a different path than the existing `GET /api/internal/workout-templates/[id]`. Approval needed: should the audit route live under `/workout-templates/[id]/audit` (matching existing conventions) or under a new `/blueprints/[id]/audit` path?

### Challenges that require honest attention before implementation

**Incomplete exercise data:** Phase 1 analysis quality depends entirely on how complete the Exercise Library scoring data is. If most system exercises lack `fatigueCost`, `movementPattern` scoring, and `exercise_muscles` rows, the fatigue and volume modules will return mostly `incomplete_data` findings. The honest mitigation is to display coverage metrics in the audit UI ("12 of 20 exercises have fatigue data") so coaches understand the analysis quality, and to invest in library seeding before expecting meaningful findings.

**Threshold calibration:** All heuristic thresholds in Phase 1 are informed guesses documented in this plan. They should be reviewed by a strength coach with programming experience before the UI ships. A threshold that fires too often becomes noise; a threshold that never fires provides no value.

**Blueprint vs. client program analysis:** The `getBlueprintEnriched` function works on `workout_templates` (the shared reference). `getEnrichedClientProgram` works on `client_program_week_days → workout_templates`. Both are needed. The audit API routes should expose both: a template-level audit for the Blueprint editor, and a client-program-level audit for the client's assigned program view.

---

## Files Reference

### New files to be created (Phase 1)

| File | Phase | Purpose |
|---|---|---|
| `lib/pil/types.ts` | 1A | All shared PIL types |
| `lib/pil/enrichment.ts` | 1A | getBlueprintEnriched, getEnrichedClientProgram |
| `lib/pil/volume.ts` | 1B | analyzeBlueprintVolume |
| `lib/pil/fatigue.ts` | 1B | analyzeBlueprintFatigue |
| `lib/pil/movement.ts` | 1B | analyzeBlueprintMovement |
| `lib/pil/blueprint-audit.ts` | 1B | getBlueprintAudit |
| `lib/pil/joint-stress.ts` | 1C | analyzeBlueprintJointStress |
| `lib/pil/redundancy.ts` | 1C | analyzeBlueprintRedundancy |
| `lib/pil/duration.ts` | 1C | estimateSessionDuration |
| `lib/pil/frequency.ts` | 1D | analyzeProgramFrequency |
| `lib/pil/recovery.ts` | 1D | analyzeProgramRecovery |
| `lib/pil/program-audit.ts` | 1D | getProgramAudit |
| `app/api/internal/blueprints/[id]/audit/route.ts` | 1B | Blueprint audit API |
| `app/api/internal/programs/[id]/audit/route.ts` | 1D | Program audit API |
| `app/hq/blueprints/[id]/audit/page.tsx` | 1E | Blueprint Audit UI |
| `app/hq/programs/[id]/audit/page.tsx` | 1E | Program Audit UI |
| `__tests__/pil/*.test.ts` | each phase | Unit tests per module |

### Existing files to be modified (Phase 1)

| File | Change |
|---|---|
| `lib/db/exercise-service.ts` | Add `getCoachOverridesForExercises(coachId, exerciseIds[])` bulk function |
| `docs/catalyst-os-exercise-library.md` | Update search service table to reflect current filters (activeOnly → statuses) |
| `docs/AI_PRINCIPLES.md` | Programming Intelligence Doctrine already added (this sprint) |

---

## Document History

| Date | Change |
|---|---|
| 2026-07-28 | Initial version — Phase 1 architecture plan established |
