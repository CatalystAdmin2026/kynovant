# Kynovant — Exercise Library & Workout Blueprint Foundation

Sprint 5C.1 · July 2026

---

## Overview

This document describes the exercise catalog and workout blueprint data model introduced in Sprint 5C.1. It covers the taxonomy design, schema relationships, RLS policy, versioning strategy, validation rules, and future integration paths.

---

## Design Principles

1. **Immutability after publication** — exercise rows are not mutated once referenced by an active blueprint. Create a new row with `parentExerciseId` pointing to the prior version instead.
2. **Structured over free-text** — muscle groups, movement patterns, equipment items, and cue types are normalized enums or FK-referenced tables. Free-text fields exist only for narrative descriptions.
3. **Coach-owned library** — all exercises are server-side only. No browser writes. Clients view exercises via server-rendered prescription summaries; they do not query the catalog directly.
4. **Composable prescriptions** — a workout template is a collection of ordered sections, each containing exercise prescriptions with full rep/set/RPE/tempo metadata. Templates are reusable blueprints — they are never assigned to clients directly (that happens in a future program-building sprint).

---

## Exercise Taxonomy

### Movement Patterns

| Value | Description |
|---|---|
| `push_vertical` | Overhead pressing (shoulder press, push press) |
| `push_horizontal` | Horizontal pressing (bench, push-up) |
| `pull_vertical` | Vertical pulling (pullup, lat pulldown) |
| `pull_horizontal` | Horizontal pulling (row, face pull) |
| `hip_hinge` | Deadlift pattern, RDL, good morning |
| `squat_bilateral` | Both legs loaded simultaneously (squat, leg press) |
| `squat_unilateral` | Single-leg squat patterns (split squat, pistol) |
| `lunge` | Stepping/lunging patterns |
| `carry` | Loaded carries (farmer carry, suitcase carry) |
| `rotation` | Rotational core work |
| `anti_rotation` | Pallof press, plank, deadbug |
| `gait` | Walking, running, stair climbing |
| `jump` | Plyometric and ballistic patterns |
| `throw` | Medicine ball throws |
| `iso_hold` | Isometric holds (plank, wall sit) |

### Classifications

| Value | Description |
|---|---|
| `compound` | Multi-joint, recruits multiple muscle groups |
| `isolation` | Single-joint, targets one muscle group |
| `cardio` | Primarily cardiovascular demand |
| `mobility` | Flexibility and joint range of motion |
| `power` | Explosive, velocity-dependent |
| `skill` | Technical motor patterns (handstand, Olympic lifts) |

### Difficulty Levels

| Value | Notes |
|---|---|
| `beginner` | Machine-friendly, low technical demand, safe for new trainees |
| `intermediate` | Requires foundational movement patterns and body awareness |
| `advanced` | High technical complexity or load management skill |
| `specialist` | Elite-level technique; requires structured coach instruction |

These describe the **exercise itself**, not the client's level. A beginner client can still perform advanced exercises with proper progression. Use `recommendedExperienceLevel` on workout_templates to match the overall template to client experience.

### Muscle Groups

27 groups covering all major anatomical regions. See `muscleGroupEnum` in `schema-exercise.ts` for the full list. Key design decisions:

- **`cardiovascular`** is a valid muscle group for cardio exercises (stair climber, assault bike). This allows filtering "exercises by primary target" to include cardio options.
- **Deltoid split** — `front_deltoid`, `lateral_deltoid`, `rear_deltoid` are tracked separately because they have meaningfully different training demands and injury profiles.
- **`multifidus`** is tracked separately from `spinal_erectors` because it is a deep stabilizer with different fatigue dynamics.

### Scoring Fields (1–10 scale)

| Field | 1 = | 10 = |
|---|---|---|
| `fatigueCost` | Minimal CNS and systemic fatigue | Extreme fatigue (heavy compound, high volume) |
| `technicalComplexity` | No learning curve | Requires years of practice |
| `stabilityDemand` | Fixed machine (no stability) | Extreme balance/proprioception demand |

### Joint Stress Fields (0–10 scale)

Seven joints tracked: shoulder, elbow, wrist, spine, hip, knee, ankle.

- **0** = no meaningful load on that joint
- **10** = extreme compressive/shear stress

These inform exercise substitution when a client has a joint injury or limitation. The search service supports `maxJointStressKnee`, `maxJointStressShoulder`, and `maxJointStressSpine` filters.

### Biomechanical Profile Fields (0–10 scale)

| Field | Description |
|---|---|
| `lengthenedBias` | How much the primary muscle is loaded in its lengthened position |
| `shortenedBias` | How much the primary muscle is loaded in its shortened position |
| `stretchMediatedPotential` | Capacity for stretch-mediated hypertrophy stimulus |

These fields support evidence-based programming principles around muscle fiber recruitment and hypertrophy optimization.

---

## Schema Relationships

```
exercises ─┬──> exercise_muscles         (1:many — muscle group + role)
            ├──> exercise_equipment       (many:many via equipment_catalog)
            ├──> exercise_relations       (1:many — source and target)
            ├──> exercise_cues            (1:many — ordered coaching cues)
            ├──> exercise_media           (1:many — video/image assets)
            └──> exercise_contraindications (1:many — injury/condition flags)

equipment_catalog ──> exercise_equipment (1:many)

exercise_relations ──> exercise_contraindications.suggested_relation_id (optional)

workout_templates ─┬──> workout_template_sections    (1:many — ordered sections)
                   └──> workout_template_exercises    (1:many — exercise prescriptions)

workout_template_sections ──> workout_template_exercises (1:many — exercises in section)
workout_template_exercises ──> exercises               (FK — the prescribed exercise)
```

### Foreign Key Behavior

| FK | On Delete |
|---|---|
| `exercise_muscles.exerciseId` | RESTRICT — muscle links must be removed before deleting an exercise |
| `exercise_equipment.exerciseId` | RESTRICT |
| `exercise_relations.sourceExerciseId` | RESTRICT |
| `exercise_contraindications.exerciseId` | RESTRICT |
| `exercise_cues.exerciseId` | RESTRICT |
| `exercise_media.exerciseId` | RESTRICT |
| `workout_template_exercises.exerciseId` | RESTRICT — cannot delete an exercise referenced in a template |
| `workout_template_exercises.sectionId` | SET NULL — prescription survives section deletion |
| `workout_template_sections.workoutTemplateId` | RESTRICT |
| `workout_template_exercises.workoutTemplateId` | RESTRICT |

**No ON DELETE CASCADE** on exercise tables. All deletions must be explicit. Prefer archiving (`status = archived`) over deletion.

---

## Template Versioning Strategy

Both `workout_templates` and `program_templates` now include `templateFamilyId` (UUID, nullable). This groups template versions that belong to the same lineage.

**How versioning works:**

1. When a new version of a template is needed, create a new row.
2. Copy `templateFamilyId` from the original row (or generate a new UUID for the first version).
3. Increment `version`.
4. Keep `status = draft` until ready to publish.
5. Archive the old version (`status = archived`) when the new version goes `active`.

**Slug convention:** Each version has a unique slug. Append `-v2`, `-v3` etc. to distinguish versions that would otherwise share a slug.

**Unique constraint:** `uq_workout_template_family_version` enforces `unique(templateFamilyId, version)` for rows where `templateFamilyId IS NOT NULL`. Postgres treats NULLs as distinct in unique indexes, so unassigned rows do not conflict.

**Why not change the slug unique constraint?** The global slug uniqueness is retained because it provides a clean lookup key. Coach tooling queries templates by slug. Replacing this with a family+version lookup would complicate all existing references. The family pattern is additive.

---

## Equipment Catalog

`equipment_catalog` is a normalized reference table. Each row represents a distinct piece of equipment. `exercise_equipment` links exercises to equipment with a `requirementType`:

| requirementType | Meaning |
|---|---|
| `required` | Exercise cannot be performed without this item |
| `optional` | Item improves the exercise but is not mandatory |
| `alternative` | Item can substitute for another listed item in the same exercise |

The catalog is extensible — coaches can add items that match their facility or a client's home gym setup. The `findExercisesByEquipmentSet` helper in `exercise-service.ts` returns exercises whose required equipment is fully satisfied by a given set of catalog IDs.

---

## Workout Blueprint Structure

A workout blueprint (template) consists of:

```
workout_templates          ← metadata: name, objective, days/week, experience level
  └── workout_template_sections  ← ordered sections: warmup, main lift, conditioning…
        └── workout_template_exercises ← prescriptions: exercise + sets/reps/tempo/RPE
```

### Section Types

| Type | Typical Content |
|---|---|
| `warmup` | Light cardiovascular, general movement prep |
| `activation` | Targeted muscle activation (banded work, light isolation) |
| `potentiation` | Moderate intensity movements to prime the CNS |
| `main_lift` | Primary strength or hypertrophy movements |
| `accessory` | Supporting exercises after main lifts |
| `conditioning` | Metabolic conditioning, circuits |
| `finisher` | High-intensity end-of-session work |
| `cooldown` | Stretching, mobility, light recovery |
| `rest_period` | Structured rest between sections |

### Exercise Grouping

Exercises in the same superset or triset share a `groupId` (plain UUID) and sequential `groupPosition` (1, 2, 3…). The `setTechnique` field describes how sets are organized:

- `superset` — 2 exercises alternated
- `triset` — 3 exercises alternated
- `myo_reps` — activation set + mini-sets with short rest
- `rest_pause` — single set broken into clusters with intra-set rest
- `stretch_mediated_finisher` — Kynovant-specific: lengthened position holds at end of sets

### Prescription Fields

| Field | Type | Notes |
|---|---|---|
| `sets` | integer | Number of working sets |
| `repsMin / repsMax` | integer | Rep range (DB enforces repsMin ≤ repsMax) |
| `durationSeconds` | integer | For time-based exercises |
| `distanceMeters` | numeric | For gait/cardio exercises |
| `restSeconds` | integer | Prescribed rest between sets |
| `tempo` | text | 4-character code: eccentric/pause/concentric/pause (e.g. "3010") |
| `targetRpe` | numeric | Rate of perceived exertion 0–10 |
| `targetRir` | numeric | Reps in reserve ≥ 0 |
| `setTechnique` | enum | How sets are organized |
| `substitutionPolicy` | enum | `strict / flexible / coach_review / no_substitute` |
| `isRequired` | boolean | Whether this exercise is mandatory |
| `coachNotes` | text | Internal coach notes for this prescription |

---

## Exercise Relations

Directed relationships between exercises. The `source` exercise is the "from" side:

| Type | Semantic |
|---|---|
| `regression` | Source is an easier version of target |
| `progression` | Source is a harder version of target |
| `substitute` | Source can replace target with similar training effect |
| `lower_joint_stress` | Source has lower joint stress than target |
| `higher_joint_stress` | Source has higher joint stress than target |
| `same_pattern` | Both exercises share the same movement pattern |
| `contralateral` | Source is the single-limb version of target |

Relations are used by the validator and future substitution engine when a client's contraindications prevent certain exercises.

---

## Contraindications

`exercise_contraindications` flags which medical or injury conditions interact with an exercise:

| Severity | Meaning |
|---|---|
| `avoid` | Exercise must not be performed; suggest an alternative |
| `modify` | Exercise can be performed with a specified modification |
| `monitor` | Exercise is permitted but requires coach attention |

`suggestedRelationId` can point to an `exercise_relations` row that identifies the recommended alternative when an exercise is avoided.

---

## RLS Policy

All 10 new tables have RLS enabled. **No client SELECT policies** are created in this sprint. The exercise library is server-only — coaches and admins access it via server-side helpers that bypass RLS.

Future sprints will add:
- A coach SELECT policy on `exercises` (all active rows)
- A client SELECT policy on prescriptions via a view that joins workout programs assigned to the authenticated client

---

## Validation Service

`lib/db/workout-validator.ts` — `validateWorkoutTemplate(templateId): Promise<ValidationResult>`

### Checks performed

| Check | Result |
|---|---|
| Template exists | error if not found |
| No exercise prescriptions | warning |
| Duplicate section orderIndex | error |
| Prescription references foreign section | error |
| Duplicate orderIndex within a section | error |
| Non-active exercise referenced | error |
| Missing exercise IDs | error |
| Group with fewer than 2 exercises | warning |
| Mixed setTechniques within a group | warning |
| Non-sequential groupPositions | warning |
| repsMin > repsMax | error |
| minimumDaysPerWeek > maximumDaysPerWeek | error |
| Template has exercises but no sections | warning |

A template must have zero errors before it can be published (`status = active`). Warnings are advisory and do not block publication.

---

## Search Service

`lib/db/exercise-service.ts` — `searchExercises(filters): Promise<Exercise[]>`

### Available filters

| Filter | Type | Notes |
|---|---|---|
| `name` | string | Case-insensitive ILIKE match |
| `muscleGroups` | MuscleGroup[] | Pass-through to `findExercisesByMuscleGroup` |
| `movementPattern` | MovementPattern | Exact match |
| `classification` | ExerciseClassification | Exact match |
| `difficulty` | ExerciseDifficulty | Exact match |
| `equipmentCatalogIds` | string[] | Filter to exercises whose required equipment is satisfied |
| `unilateral` | boolean | |
| `isCardio` | boolean | |
| `isMobility` | boolean | |
| `maxJointStressKnee` | number | Post-filter on joint stress |
| `maxJointStressShoulder` | number | |
| `maxJointStressSpine` | number | |
| `activeOnly` | boolean | Default true |
| `limit` | number | Default 50 |

### Additional helpers

| Function | Purpose |
|---|---|
| `getExerciseBySlug(slug)` | Fetch a single exercise by slug |
| `getExerciseById(id)` | Fetch a single exercise by UUID |
| `getExerciseMuscles(exerciseId)` | All muscle associations |
| `getExerciseCues(exerciseId, publicOnly)` | Coaching cues |
| `getExerciseRelations(exerciseId)` | Outgoing relations |
| `getExerciseWithDetails(exerciseId)` | Exercise + muscles + relations + public cues |
| `findExercisesByMuscleGroup(group, activeOnly)` | All exercises targeting a muscle group |
| `findExercisesByEquipmentSet(ids, activeOnly)` | Exercises satisfying an equipment set |
| `getAllEquipment()` | Full equipment catalog |

---

## Dev Seed

`scripts/seed-exercises.ts` seeds 15 representative exercises for local development and testing. Run after applying the Sprint 5C.1 migration:

```bash
source .env.local && npx tsx scripts/seed-exercises.ts
```

The script is **idempotent** — all inserts use `ON CONFLICT DO NOTHING`. Re-running it will not create duplicates.

### Seeded exercises

| Exercise | Pattern | Classification | Difficulty |
|---|---|---|---|
| Back Squat | squat_bilateral | compound | intermediate |
| Romanian Deadlift | hip_hinge | compound | intermediate |
| Hip Thrust | hip_hinge | compound | beginner |
| Leg Press | squat_bilateral | compound | beginner |
| Bulgarian Split Squat | squat_unilateral | compound | intermediate |
| Lat Pulldown | pull_vertical | compound | beginner |
| Chest-Supported Dumbbell Row | pull_horizontal | compound | beginner |
| Dumbbell Bench Press | push_horizontal | compound | beginner |
| Cable Lateral Raise | push_vertical | isolation | beginner |
| Seated Leg Curl | hip_hinge | isolation | beginner |
| Cable Triceps Pressdown | push_horizontal | isolation | beginner |
| Dumbbell Curl | pull_horizontal | isolation | beginner |
| Plank | iso_hold | compound | beginner |
| Stair Climber | gait | cardio | beginner |
| Banded Glute Walk | gait | isolation | beginner |

### Seeded relations

| Source | Target | Type | Notes |
|---|---|---|---|
| Leg Press | Back Squat | `lower_joint_stress` | Removes axial spine load |
| Bulgarian Split Squat | Back Squat | `same_pattern` | Both squat patterns |
| Seated Leg Curl | Romanian Deadlift | `progression` | RDL requires greater hip stability |

---

## Files Created (Sprint 5C.1)

| File | Purpose |
|---|---|
| `lib/db/schema-exercise.ts` | 15-enum, 10-table Drizzle schema |
| `lib/db/exercise-service.ts` | Server-only search and retrieval helpers |
| `lib/db/workout-validator.ts` | Workout blueprint validation service |
| `scripts/seed-exercises.ts` | Idempotent dev seed — 15 exercises |
| `docs/catalyst-os-exercise-library.md` | This document |

### Files modified

| File | Change |
|---|---|
| `lib/db/schema.ts` | Added `templateFamilyId` + workout-specific columns to both template tables |
| `drizzle.config.ts` | Added `schema-exercise.ts` to schema array |

---

## Missing Inputs for Future Generation

**For workout generation (not yet captured):**
- Client 1-rep max values or training percentages per exercise
- Movement screen results (FMS, mobility assessment scores)
- Prior program history (what templates a client has run and for how long)
- Rate of perceived exertion calibration baseline
- Session preference data (preferred session duration per day of week)

**For substitution engine (future sprint):**
- Client `injuries_limitations` linked to exercise `exercise_contraindications` by body region
- Client `equipment_access` linked to `exercise_equipment` via equipment catalog
- Substitution confidence scoring based on pattern overlap + muscle group match

---

## Future Integrations

### Program Builder (future sprint)

A program builder will assign workout template families to client enrollments. The resulting client program will reference specific template rows (by ID, not slug), locking in the exercise prescription at the point of assignment. Template updates create new versions; existing client programs are not affected.

### Client Workout View (future sprint)

Clients will see their workout prescriptions via a server-rendered view that:
1. Joins their active program → workout template → sections → exercises
2. Strips `coachNotes` and other internal fields
3. Surfaces only `isPublic = true` cues
4. Renders substitution suggestions filtered by the client's equipment access and injury limitations

No direct client queries against exercise tables. All data goes through server-side helpers.
