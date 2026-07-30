# Catalyst Exercise Intelligence Specification

**Version:** 1.0  
**Status:** Canonical — all Exercise Library data must comply with this document.  
**Scope:** Defines the schema, scoring methodology, valid values, and deterministic rules for every field in the Catalyst Exercise Library.

This document is the permanent source of truth. When a field in the database contradicts this document, the document is correct and the database must be corrected — not the other way around.

---

## 1. Purpose and Architecture

The Exercise Library is a **structured knowledge graph**, not a flat list of exercises. Every field captures real biomechanical, physiological, or coaching knowledge in a machine-readable form. Downstream systems (Programming Intelligence Layer, Recommendation Engine, Substitute Exercise Engine, AI programming assistance) consume this data deterministically — they do not embed exercise knowledge internally.

**Design principle:** An exercise that is perfectly scored but rarely used is far more valuable than an exercise with placeholder data. Incomplete records are a liability. Every exercise must pass a completeness check before being set to `active`.

### Architecture Invariant

```
Exercise Library (knowledge graph)
  ↓ consumed by
Programming Intelligence Layer (deterministic analysis)
  ↓ produces
Findings (structured observations)
  ↓ consumed by
Recommendation Engine (deterministic rules)
  ↓ produces
Coach Actions (substitute, adjust, flag)
```

No layer below the Exercise Library should encode exercise-specific knowledge. If a downstream system needs to know that Romanian Deadlifts stress the spine more than Leg Presses, it reads that from the library — it does not hardcode it.

---

## 2. Identity Fields

### 2.1 `slug` — Required

**Purpose:** Stable, URL-safe unique identifier. Never renamed after the exercise is referenced by any template.

**Format:** lowercase, hyphen-separated, no special characters.  
**Examples:** `back-squat`, `single-arm-dumbbell-row`, `cable-face-pull`

**Rules:**
- Maximum 80 characters
- No version numbers — create a new exercise with `parentExerciseId` pointing to the prior version instead of renaming
- Prefer specificity: `dumbbell-incline-bench-press` not `incline-press`

### 2.2 `name` — Required

**Purpose:** Human-readable canonical name as it appears in coaching contexts.

**Rules:**
- Title case
- Include resistance type prefix when disambiguation is needed: `Dumbbell Romanian Deadlift` vs `Barbell Romanian Deadlift`
- Avoid brand names (write `Lat Pulldown Machine` not `Nautilus Pulldown`)
- Maximum 80 characters

### 2.3 `alternateNames` — Optional, JSON Array

**Purpose:** Common aliases a coach or client might search by. Powers full-text search.

**Examples:** `["RDL", "Stiff Leg Deadlift"]` for Romanian Deadlift

**Rules:**
- Include common abbreviations
- Include variation names that coaches colloquially use
- Do not include names of distinct exercises (a Stiff Leg Deadlift has meaningful biomechanical differences from an RDL)

### 2.4 `status` — Required

**Valid values:** `draft | active | archived`

- `draft` — incomplete record, excluded from all coach interfaces and PIL analysis
- `active` — complete record, available for use
- `archived` — historically referenced but no longer assignable to new templates

**Rule:** An exercise can only be set to `active` if all required fields are populated and all scoring fields are non-null. Use `draft` while building the record.

### 2.5 `scope` — Required

**Valid values:** `system | organization | coach`

- `system` — Catalyst-maintained exercises, available to all coaches
- `organization` — created by an organization admin, visible within that organization
- `coach` — created by an individual coach, private to them

All seeded library exercises use `scope: "system"`.

### 2.6 `parentExerciseId` — Optional

When an exercise is updated in a way that changes its prescriptions (new muscle data, significantly revised scores), create a new exercise row and set `parentExerciseId` to the prior version's ID. This preserves historical integrity for completed workout sessions.

---

## 3. Classification Fields

### 3.1 `classification` — Required

**Valid values:** `compound | isolation | cardio | mobility | power | skill`

| Value | Definition |
|-------|-----------|
| `compound` | Primary movement involves two or more joints working together |
| `isolation` | Primary movement is single-joint with minimal secondary joint involvement |
| `cardio` | Sustained aerobic effort; primary training stimulus is cardiovascular |
| `mobility` | Primary purpose is range-of-motion improvement; minimal load |
| `power` | Primary movement is explosive; intent is maximal rate of force development |
| `skill` | Coordination and technique are the primary training stimulus |

**Rule:** Most barbell and dumbbell exercises are `compound`. Cable isolation exercises (lateral raise, curl, pushdown) are `isolation`. Olympic lifts and jump variations are `power`.

### 3.2 `resistanceType` — Required for weighted exercises

**Valid values:** `barbell | dumbbell | kettlebell | cable | machine | band | bodyweight | smith_machine | trap_bar | suspension | plate_loaded | medicine_ball | sandbag | chains | landmine`

**Rules:**
- Use the primary resistance source, not the equipment used for stability
- A Bulgarian Split Squat with dumbbells is `dumbbell`, even though it uses a bench for balance
- Suspension trainers (TRX) use `suspension`
- Landmine exercises use `landmine` (the pivot attachment is the defining characteristic)

### 3.3 `difficulty` — Required

**Valid values:** `beginner | intermediate | advanced | specialist`

| Level | Description |
|-------|------------|
| `beginner` | Can be safely coached to a new trainee in one session. Minimal technique risk. |
| `intermediate` | Requires several sessions to establish safe technique. Moderate coaching demand. |
| `advanced` | Requires months of prerequisite training to perform safely at meaningful loads. |
| `specialist` | Requires sport-specific coaching background (Olympic lifting, gymnastics, etc.) |

**Anchor examples:**
- `beginner`: Machine exercises, bodyweight squats, push-ups, dumbbell curls
- `intermediate`: Barbell squat, deadlift, bench press, most barbell exercises
- `advanced`: Olympic derivatives, Jefferson curl, loaded carries at heavy weights
- `specialist`: Full snatch, clean & jerk, gymnastics ring work

### 3.4 `movementPattern` — Required

**Valid values:**

| Value | Description | Example |
|-------|-------------|---------|
| `push_horizontal` | Horizontal pressing away from body | Bench Press, Push-Up |
| `push_vertical` | Vertical pressing overhead | Overhead Press, Dip |
| `pull_horizontal` | Horizontal pulling toward body | Bent Row, Cable Row |
| `pull_vertical` | Vertical pulling downward | Pull-Up, Lat Pulldown |
| `hip_hinge` | Hip-dominant hinge with spine neutral | Romanian Deadlift, Good Morning |
| `squat_bilateral` | Two-leg squat pattern | Back Squat, Leg Press |
| `squat_unilateral` | Single-leg squat pattern | Bulgarian Split Squat, Pistol |
| `lunge` | Stepping patterns with split stance | Forward Lunge, Reverse Lunge |
| `hip_extension` | Isolated hip extension (no significant knee bend) | Hip Thrust, Glute Bridge |
| `hip_flexion` | Isolated hip flexion | Leg Raise, Hanging Knee Raise |
| `knee_extension` | Isolated knee extension | Leg Extension |
| `knee_flexion` | Isolated knee flexion | Leg Curl, Nordic Curl |
| `elbow_flexion` | Isolated elbow flexion | Curl variations |
| `elbow_extension` | Isolated elbow extension | Triceps extensions |
| `shoulder_abduction` | Raising arm away from midline | Lateral Raise |
| `shoulder_adduction` | Pulling arm toward midline | Cable Adduction |
| `external_rotation` | External rotation of shoulder | Band External Rotation |
| `internal_rotation` | Internal rotation of shoulder | Internal Rotation |
| `scapular_retraction` | Pulling shoulder blades together | Face Pull, Band Pull-Apart |
| `scapular_depression` | Pulling shoulder blades down | Straight Arm Pulldown |
| `carry` | Loaded carrying over distance | Farmer's Carry, Suitcase Carry |
| `rotation` | Rotational core movement | Wood Chop, Russian Twist |
| `anti_rotation` | Resisting rotational force | Pallof Press, Dead Bug |
| `iso_hold` | Sustained static position under load | Plank, Wall Sit |
| `gait` | Repetitive locomotion | Running, Stair Climber |
| `jump` | Explosive ballistic leaving ground | Box Jump, Broad Jump |
| `throw` | Ballistic explosive release | Medicine Ball Throw |

**Rule:** Assign the **primary** movement pattern. For exercises that span multiple patterns (e.g., Power Clean = hip hinge + vertical pull), assign the pattern that defines the primary training stimulus.

### 3.5 `primaryMuscleGroup` — Required

**Purpose:** The single muscle group receiving the largest direct stimulus. Used by the PIL for grouping and quick filtering.

**Valid values** (from `muscleGroupEnum`):

```
chest, front_deltoid, lateral_deltoid, rear_deltoid,
upper_back, lats, rhomboids, trapezius,
triceps, biceps, brachialis, brachioradialis, forearms,
rectus_abdominis, obliques, transverse_abdominis,
spinal_erectors, multifidus,
glutes, hip_flexors, adductors, abductors,
quadriceps, hamstrings, calves, tibialis,
cardiovascular
```

**Rules:**
- Select the **one** muscle that would be most noticeably fatigued the day after the exercise
- For the Back Squat, primary is `quadriceps` (quads are most limiter at typical loads)
- For Hip Thrust, primary is `glutes`
- For Romanian Deadlift, primary is `hamstrings`
- For Overhead Press, primary is `front_deltoid` (anterior delt is most loaded overhead)
- Cardio exercises use `cardiovascular`

---

## 4. Boolean Attributes

| Field | Purpose | Notes |
|-------|---------|-------|
| `unilateral` | Trains one limb at a time | True for single-arm row, pistol squat |
| `alternating` | Alternates between limbs each rep | True for alternating dumbbell curl |
| `isTimeBased` | Prescription is duration, not reps | True for planks, cardio |
| `isDistanceBased` | Prescription may include distance | True for carries, running |
| `isCardio` | Cardiovascular training stimulus | True for rowing machine, bike |
| `isMobility` | Primary purpose is mobility/flexibility | True for deep squat hold, hip flexor stretch |

---

## 5. Muscle Intelligence

### 5.1 Muscle Roles

Every exercise-muscle relationship is assigned one of three roles:

| Role | Definition | Threshold |
|------|-----------|----------|
| `primary` | Muscle is the primary force producer; its fatigue limits the set | The muscle you feel working most |
| `secondary` | Muscle contributes meaningful force but is not the primary limiter | Assists but doesn't limit the set |
| `stabilizer` | Muscle contracts isometrically to maintain position and joint integrity | Active but not driving movement |

**Rules:**
- Every exercise has at least one `primary` muscle
- Exercises may have 0–1 `primary`, 0–4 `secondary`, and 0–5 `stabilizer` muscles (though most have 1 primary, 1-3 secondary, 1-3 stabilizers)
- Do not list a muscle as both `primary` and `secondary`
- Do not include muscles with truly negligible recruitment (e.g., don't list `calves` as stabilizer for Bench Press)
- `stabilizer` entries reflect muscles that actively contract to hold form, not just passive structures

### 5.2 Common Muscle Role Patterns

**Bilateral Squat (Back Squat, Leg Press):**
- Primary: `quadriceps`
- Secondary: `glutes`, `adductors`
- Stabilizer: `spinal_erectors`, `hamstrings`

**Hip Hinge (Romanian Deadlift, Good Morning):**
- Primary: `hamstrings`
- Secondary: `glutes`, `spinal_erectors`, `adductors`

**Hip Extension (Hip Thrust, Glute Bridge):**
- Primary: `glutes`
- Secondary: `hamstrings`
- Stabilizer: `quadriceps`

**Horizontal Push (Bench Press, Push-Up):**
- Primary: `chest`
- Secondary: `front_deltoid`, `triceps`

**Horizontal Pull (Row variations):**
- Primary: `upper_back` or `lats` (depends on angle and grip)
- Secondary: `rear_deltoid`, `biceps`
- Stabilizer: `spinal_erectors` (for unsupported rows)

**Vertical Pull (Pull-Up, Lat Pulldown):**
- Primary: `lats`
- Secondary: `rear_deltoid`, `upper_back`, `biceps`

**Vertical Push (Overhead Press):**
- Primary: `front_deltoid`
- Secondary: `lateral_deltoid`, `triceps`
- Stabilizer: `spinal_erectors`, `trapezius`

---

## 6. Biomechanical Profile

### 6.1 `lengthenedBias` (0–10)

**Purpose:** How much of the exercise's stimulus is delivered at the lengthened (stretched) position of the primary muscle.

**Scoring:**
- **0:** No stretch — exercise only loads the muscle in a shortened/mid-range position
- **3–4:** Some stretch at the bottom but most load is mid-range
- **6–7:** Clear lengthened bias; the primary muscle is under significant load when stretched
- **9–10:** Extreme stretch loading; the fully stretched position is where the exercise is hardest

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Leg Extension (quad only at mid-range) |
| 2 | Machine Chest Fly (closes at short position) |
| 5 | Barbell Bench Press |
| 7 | Romanian Deadlift (hamstrings under load at stretch) |
| 9 | Nordic Curl, Bulgarian Split Squat (deep stretch under load) |
| 10 | Sissy Squat, Deep RDL |

**Relevance:** High `lengthenedBias` exercises are associated with greater muscle damage and hypertrophy stimulus at equivalent volumes. The PIL uses this to flag potential accumulation of high-damage workouts.

### 6.2 `shortenedBias` (0–10)

**Purpose:** How much of the exercise's stimulus is delivered at the shortened (contracted/peak contraction) position.

**Scoring:**
- **0:** No contraction emphasis — peak position is easy or unloaded
- **5:** Equal load at stretch and contraction
- **8–10:** Hardest position is peak contraction; exercise loads maximally at short position

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Romanian Deadlift (easy at top) |
| 3 | Squat |
| 6 | Hip Thrust (hard at glute lockout) |
| 8 | Machine Chest Fly (hard at closed position) |
| 9 | Leg Extension (peak contraction is hardest) |

**Note:** A single exercise can score moderately on both `lengthenedBias` and `shortenedBias` (cable exercises through full ROM).

### 6.3 `stretchMediatedPotential` (0–10)

**Purpose:** The exercise's capacity to create a stretch-mediated hypertrophy stimulus — the additional growth signal from training at long muscle lengths. Based on current evidence from Pedrosa, Maeo, and related stretch-mediated hypertrophy research.

**Scoring:**
- **0–1:** No meaningful stretch component (machine in limited ROM, shortened-only exercises)
- **3–4:** Moderate stretch; some evidence of lengthened loading
- **7–8:** Strong stretch component; exercise is categorized as "lengthened-biased" in research
- **9–10:** Extreme stretch; exercise specifically targets the lengthened position and produces significant peak eccentric tension

**Rules:**
- `stretchMediatedPotential` cannot exceed `lengthenedBias` by more than 2 points
- Cardio exercises score 0
- Mobility exercises score 0 (no resistance at stretch)

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Stair Climber, Plank |
| 2 | Barbell Curl (some stretch at bottom) |
| 5 | Leg Press |
| 7 | Romanian Deadlift |
| 9 | Bulgarian Split Squat, Nordic Curl |
| 10 | Deep Sissy Squat, Prone Leg Curl to extreme |

---

## 7. Fatigue Intelligence

### 7.1 Overview

Three fields capture different dimensions of exercise fatigue:

| Field | What it measures | Scale |
|-------|-----------------|-------|
| `fatigueCost` | Combined local + systemic fatigue per working set | 1–10 |
| `technicalComplexity` | Skill and coordination demand | 1–10 |
| `stabilityDemand` | Balance and proprioceptive demand | 1–10 |

### 7.2 `fatigueCost` — Deterministic Scoring Rules

`fatigueCost` reflects how much fatigue — both in the trained muscles (local) and systemically (neural, cardiovascular, metabolic) — a typical working set at appropriate training intensity generates.

**Base score by classification:**
| Classification | Base score |
|----------------|-----------|
| `isolation` | 2 |
| `compound` | 4 |
| `power` | 5 |
| `cardio` | 3 |
| `mobility` | 1 |

**Adjustments (additive):**
| Condition | Adjustment |
|-----------|-----------|
| Barbell resistance type | +1 |
| Involves spinal loading (spine score ≥ 5) | +1 |
| Involves 3+ primary/secondary muscle groups | +1 |
| Bilateral compound involving legs | +1 |
| High metabolic demand (legs + cardio component) | +1 |
| Isometric hold lasting > 30s typical | +1 |
| Olympic/power classification | +2 (instead of compound adjustment) |
| Isolation with machine (guided, seated) | −1 |
| Unilateral (half load per side) | −1 |

**Final cap:** Maximum 10.

**Calibration anchors:**
| Score | Example |
|-------|---------|
| 1 | Banded Clamshell, Plank |
| 2 | Dumbbell Curl, Leg Extension |
| 3 | Cable Lateral Raise, Machine Row |
| 4 | Dumbbell Bench Press, Lat Pulldown |
| 5 | Barbell Row, Leg Press, Pull-Up |
| 6 | Barbell Bench Press, Dumbbell Deadlift |
| 7 | Barbell Squat, Romanian Deadlift, Barbell OHP |
| 8 | Conventional Deadlift, Front Squat |
| 9 | Heavy Barbell Deadlift, Heavy Squat (near maximal) |
| 10 | Power Clean, Full Snatch, maximal effort compound |

**Notes on systemic vs local:** A heavy leg press (8–10 sets) accumulates more systemic fatigue than its score suggests — this is a deliberate simplification. The score reflects a single working set at 70–85% intensity. The PIL's frequency and volume modules handle cumulative effects.

### 7.3 `technicalComplexity` — Deterministic Scoring Rules

`technicalComplexity` reflects the coaching time, motor learning prerequisite, and technical failure modes of the exercise.

**Scoring anchors:**
| Score | Description | Examples |
|-------|------------|---------|
| 1 | No technique required; nearly impossible to perform incorrectly | Machine leg extension, Pec Deck, seated calf raise |
| 2 | Simple technique; coach in < 5 minutes | Leg press, machine row, dumbbell curl |
| 3 | Basic free weight technique; takes 1–3 sessions | Dumbbell bench, lat pulldown, cable exercises |
| 4 | Moderate technique; requires coaching on bracing/position | Barbell bench, dumbbell row, most dumbbell compounds |
| 5 | Requires coaching on multiple cues simultaneously | Barbell deadlift, barbell squat (beginner), chin-up |
| 6 | Complex setup and multiple technique cues; multi-session learning | Front squat, overhead squat, barbell row, Romanian deadlift |
| 7 | High technical demand; significant failure risk without coaching | Bulgarian split squat (loaded), Good Morning |
| 8 | Expert technique required; years of practice typical | Jefferson curl, pause squat, advanced calisthenics |
| 9 | Specialist coaching required; high injury risk without expertise | Olympic lift derivatives, advanced barbell variations |
| 10 | Sport-specific elite skill; coach must have specialty certification | Full Clean & Jerk, Full Snatch |

### 7.4 `stabilityDemand` — Deterministic Scoring Rules

`stabilityDemand` reflects the proprioceptive, balance, and stabilizer-activation requirements of the exercise.

**Scoring anchors:**
| Score | Description | Examples |
|-------|------------|---------|
| 1 | Fully supported; no balance required | Seated machine exercises, lying exercises |
| 2 | Minimally stabilized; some postural demand | Seated dumbbell exercises |
| 3 | Standing or supported with mild balance demand | Cable exercises, machine row standing |
| 4 | Free weight with moderate stability needs | Dumbbell bench, lat pulldown |
| 5 | Barbell compounds with good base of support | Back squat, deadlift |
| 6 | Standing barbell or demanding free weight | Barbell OHP, Bent Over Row |
| 7 | Unilateral with moderate stability demand | Single leg press, dumbbell split squat |
| 8 | Unilateral with high stability demand | Pistol squat, single leg RDL, standing cable curl |
| 9 | Unilateral overhead or extreme balance | Turkish Get-Up, single arm overhead press |
| 10 | Maximum balance challenge | Single arm overhead on unstable surface |

---

## 8. Joint Intelligence

### 8.1 Overview

Seven joints are tracked individually. Scores reflect the **compressive and shear forces** placed on each joint during a working set at typical training intensity (not maximal effort). A score of 0 means the joint is not meaningfully loaded. Scores are additive across exercises within a session or program.

The PIL's Joint Stress module uses these scores to flag sessions with cumulative loading that may predispose to overuse injury.

### 8.2 Joint Scoring Scale (all joints, 0–10)

| Score | Interpretation |
|-------|---------------|
| 0 | No meaningful load on this joint |
| 1–2 | Incidental load; joint is not a limiting factor |
| 3–4 | Moderate load; appropriate for healthy trainees |
| 5–6 | Significant load; monitor for individuals with existing issues |
| 7–8 | High load; requires preparation, mobility, and form precision |
| 9–10 | Extreme load; contraindicated for many populations; flag in PIL |

### 8.3 Shoulder Joint (`jointStressShoulder`)

**Rule:** Include only if shoulder is meaningfully loaded. Do not score lower body exercises.

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Leg Press, Hip Thrust, Leg Curl |
| 1–2 | Deadlift (incidental grip/trap load) |
| 3 | Lat Pulldown, Cable Row (shoulder in moderate position) |
| 4 | Pull-Up, Dumbbell Bench Press |
| 5 | Barbell Bench Press, Cable Fly |
| 6 | Overhead Press (dumbbell), Dip |
| 7 | Barbell Overhead Press, Upright Row |
| 8 | Behind-Neck Press, Wide Grip Upright Row |
| 9 | Extreme internal rotation under load |

**High-risk patterns:** Behind-neck pressing, extreme horizontal abduction at depth (deep pec deck), wide-grip upright rows.

### 8.4 Elbow Joint (`jointStressElbow`)

**Rule:** Include for all exercises involving elbow flexion, extension, or significant elbow-bearing load.

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Squat, Deadlift, Hip Thrust |
| 1–2 | Overhead press (axial load, not elbow bending) |
| 3 | Dumbbell Curl, Triceps Pressdown |
| 4 | Pull-Up, Barbell Curl |
| 5 | Close Grip Bench Press, Skull Crusher |
| 6 | Dip (elbow flexion + body weight) |
| 7 | JM Press, extreme range skull crusher |

### 8.5 Wrist Joint (`jointStressWrist`)

**Rule:** Score wrists for exercises requiring active wrist stabilization, loaded dorsiflexion/palmarflexion, or radial/ulnar deviation under load.

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Machine exercises with neutral grip handles |
| 1–2 | Cable exercises with straight bar |
| 3 | Barbell exercises with hook grip or loaded wrist position |
| 4 | Front rack position (barbell front squat, power clean) |
| 5 | Wrist Curl, behind-back wrist curl |
| 6 | Heavy front squat with rack position |

### 8.6 Spine (`jointStressSpine`)

**Rule:** Include for all exercises with axial load, significant spinal flexion/extension under load, or anti-rotation demand.

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Seated machine exercises with back support |
| 1–2 | Seated dumbbell exercises (light axial load) |
| 2 | Leg Press (minimal spinal load) |
| 3 | Barbell Hip Thrust, Plank |
| 4 | Lat Pulldown, Leg Extension |
| 5 | Romanian Deadlift, Pull-Up |
| 6 | Bent Over Row, Barbell Curl |
| 7 | Barbell Squat, Overhead Press (standing) |
| 8 | Conventional Deadlift, Heavy Good Morning |
| 9 | Snatch, Jefferson Curl |

**High-risk patterns:** Hyperlordosis under load, spinal flexion under heavy load, rapid flexion/extension cycles.

### 8.7 Hip Joint (`jointStressHip`)

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Upper body isolation (curl, pushdown) |
| 2 | Calf Raise |
| 3 | Plank (incidental hip loading) |
| 4 | Good Morning (hip hinge, moderate) |
| 5 | Romanian Deadlift, Hip Thrust |
| 6 | Leg Press (deep), Goblet Squat |
| 7 | Back Squat, Conventional Deadlift |
| 8 | Front Squat, Deep Sumo Deadlift, Bulgarian Split Squat |
| 9 | Extreme depth squat, pistol squat |

### 8.8 Knee Joint (`jointStressKnee`)

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Romanian Deadlift, Hip Thrust (minimal knee bend) |
| 2 | Hip Thrust (knee at 90°, minimal shear) |
| 3 | Stiff Leg Deadlift |
| 4 | Leg Curl, Leg Extension (isolated) |
| 5 | Goblet Squat, Leg Press (moderate depth) |
| 6 | Back Squat (parallel depth) |
| 7 | Deep Squat, Full Leg Press |
| 8 | Bulgarian Split Squat, Pistol Squat |
| 9 | Deep lunge with heavy load, extreme knee flexion |

**High-risk pattern:** Valgus collapse under load, knee past toes without adequate ankle mobility, full squat with excessive forward lean.

### 8.9 Ankle Joint (`jointStressAnkle`)

**Rule:** Score only for exercises with significant ankle dorsiflexion demand or substantial loading through the foot.

**Anchors:**
| Score | Example |
|-------|---------|
| 0 | Most machine and upper body exercises |
| 1–2 | Stair Climber (light ankle demand) |
| 3 | Squat patterns (passive demand) |
| 4 | Calf Raise (isolated loading) |
| 5 | Jump landing, heavy calf raise |
| 6 | Olympic lift receiving position |
| 7 | Extreme depth squat with limited ankle mobility |

---

## 9. Coaching Intelligence

### 9.1 Coaching Cues

Each exercise should have 2–4 coaching cues across the following types:

| Type | Purpose | Example |
|------|---------|---------|
| `setup` | How to position before the first rep | "Bar at mid-foot. Hip-width stance." |
| `execution` | What to think about during the rep | "Drive the floor away. Keep chest tall." |
| `breathing` | Breathing and bracing protocol | "Big breath into your belly. Hold the brace through the rep." |
| `mental_cue` | A single phrase the athlete can recall mid-set | "Chest up. Knees out." |
| `common_error` | The most frequent technical breakdown and why it matters | "Heels rising at the bottom: reduce load and address ankle mobility." |
| `correction` | How to fix the most common error | "Place plates under heels temporarily to reinforce pattern." |
| `safety` | Critical safety information | "Never lockout elbow joints under load." |
| `coaching_tip` | Advanced refinement for athletes already competent | "Try initiating the pull by pushing the floor down rather than lifting the bar up." |

**Rules:**
- Every `active` exercise requires at least one `setup` cue and one `execution` cue
- Common errors should describe both the error AND the consequence: "Rounded lower back — increases disc shear force significantly"
- Mental cues should be 3–5 words maximum: athletes cannot recall complex instructions during a set
- Cues must be prescriptive, not descriptive: "Drive knees out" not "Make sure your knees don't cave"

### 9.2 Contraindications

Contraindications capture medical, structural, or biomechanical conditions that affect exercise safety.

| Severity | Meaning |
|----------|---------|
| `avoid` | Do not perform this exercise in this condition. Alternative must be provided. |
| `modify` | Perform with specific adjustments (reduced ROM, lighter load, different position). |
| `monitor` | Acceptable with coach awareness. Flag if symptoms worsen. |

**Examples:**
- `avoid`: Behind-neck press → rotator cuff impingement history
- `modify`: Barbell squat → anterior knee pain (reduce depth, widen stance)
- `monitor`: Deadlift → controlled hypertension (monitor exertion level)

**Rules:**
- Only add contraindications for well-established clinical relationships
- Do not add speculative or rare contraindications
- Every `avoid` contraindication should reference an exercise substitute

---

## 10. Exercise Relationships

Exercise relationships form the **substitute graph** — the data structure that powers the Substitute Exercise Engine.

### 10.1 Relationship Types

| Type | From → To | Direction |
|------|----------|-----------|
| `substitute` | Exercise A → Exercise B | A can replace B (similar stimulus, different context) |
| `progression` | Harder → Easier | "This exercise is a progression of that one" |
| `regression` | Easier → Harder | "This exercise is a regression toward that one" |
| `lower_joint_stress` | Easier on joints → Harder | "This is a joint-friendly alternative to that" |
| `higher_joint_stress` | More joint stress → Less | Inverse of above |
| `same_pattern` | Variation → Variation | Same movement pattern, different loading |
| `contralateral` | Bilateral → Unilateral | "This is the unilateral version of that" |

### 10.2 Suitability Score (0–100)

`suitabilityScore` represents how appropriate the substitute is as a functional replacement.

**Scoring factors:**
| Factor | Weight |
|--------|--------|
| Same movement pattern | +40 |
| Same primary muscle group | +30 |
| Similar difficulty level | +15 |
| Similar resistance type | +10 |
| Same body position | +5 |

**Calibration:**
- **90–100:** Near-perfect substitute (same pattern, same muscle, similar difficulty)
- **70–89:** Good substitute (same muscle, different pattern or difficulty)
- **50–69:** Reasonable substitute (different pattern, similar muscle group)
- **30–49:** Partial substitute (different pattern, complementary muscles)
- **0–29:** Related but not a functional substitute

### 10.3 Similarity Score (0–100)

`similarityScore` is computed deterministically by the Substitute Exercise Engine at query time (not stored):
- +50 if same primary muscle group
- +50 if same movement pattern

This is a binary match, not a gradual scale — see `substitution.ts`.

### 10.4 Relationship Rules

1. **Every exercise with `substitute` relations must have at least 2 substitutes** — one at similar difficulty and one that is a regression (for injured/deconditioned clients)
2. **Progressions and regressions must be bidirectional** — if A is a progression of B, create both A→B (progression) and B→A (regression)
3. **`lower_joint_stress` relationships must be validated against joint stress scores** — the referenced exercise must have a lower total joint stress than the original
4. **Suitability scores are assigned when the relationship is created** and should reflect coaching judgment, not just algorithmic scoring

### 10.5 Core Relationship Graph Examples

```
Romanian Deadlift (hip_hinge, hamstrings)
  ↓ lower_joint_stress substitutes:
  - Cable Pull-Through (no spinal load)
  - 45° Back Extension
  ↓ progressions:
  - Conventional Deadlift
  - Deficit RDL
  ↓ regressions:
  - Dumbbell RDL
  - Kettlebell Romanian Deadlift
  ↓ same_pattern variations:
  - Single Leg Romanian Deadlift
  - Trap Bar Romanian Deadlift
  - Good Morning
```

---

## 11. Metadata and Search Tags

### 11.1 `tags` (JSON Array)

**Purpose:** Free-form search tags that don't fit structured fields. Power future coach search ("show me exercises good for shoulder health", "show me exercises I can do with knee pain").

**Naming convention:** lowercase, hyphen-separated.

**Standard tag vocabulary:**

| Category | Tags |
|----------|------|
| Goal | `fat-loss`, `muscle-building`, `strength`, `athletic-performance`, `rehab`, `general-fitness` |
| Environment | `home-gym`, `gym`, `no-equipment`, `minimal-equipment`, `hotel-room` |
| Body zone | `upper-body`, `lower-body`, `full-body`, `core`, `posterior-chain`, `anterior-chain` |
| Characteristic | `beginner-friendly`, `joint-friendly`, `high-stimulus`, `low-fatigue`, `compound`, `isolation` |
| Specific value | `knee-friendly`, `shoulder-friendly`, `spine-friendly`, `hip-friendly` |
| Technique flags | `technical`, `requires-spotter`, `requires-equipment`, `bodyweight-only` |

**Rule:** An exercise tagged `knee-friendly` must have `jointStressKnee` ≤ 4.

### 11.2 `defaultBodyPosition`

Sets the expected default body position when prescribing this exercise. Used for coaching interface display and future cue suggestions.

**Valid values:** `standing | seated | lying_supine | lying_prone | incline | decline | kneeling | split_stance | hinge_position | quadruped | hanging`

---

## 12. Completeness Requirements for `active` Status

An exercise may not be set to `active` unless all of the following are true:

| Check | Requirement |
|-------|-----------|
| Identity | `slug`, `name`, `movementPattern`, `classification`, `difficulty` populated |
| Primary muscle | `primaryMuscleGroup` populated |
| Muscle data | At least 1 `exercise_muscles` row with `role = primary` |
| Scoring | `fatigueCost`, `technicalComplexity`, `stabilityDemand` all non-null |
| Biomechanical | `lengthenedBias`, `shortenedBias`, `stretchMediatedPotential` all non-null |
| Cues | At least 1 `setup` cue AND 1 `execution` cue |
| Joint stress | At least 1 non-null joint stress score (the most-loaded joint) |
| Status | `status = "system"` exercises require full data; `status = "coach"` exercises are self-service |

---

## 13. Scoring Quick Reference

### Fatigue Cost (1–10)
```
1  — Activation, mobility, banded warm-up
2  — Light isolation (cable lateral raise, leg extension)
3  — Moderate isolation (dumbbell curl, machine exercises)
4  — Dumbbell compounds (dumbbell bench, lat pulldown)
5  — Barbell isolation + bodyweight compounds (pull-up, leg press)
6  — Light barbell compounds (barbell bench, barbell row)
7  — Heavy barbell compounds (squat, overhead press, RDL)
8  — Very heavy compound (heavy deadlift, heavy squat)
9  — Near-maximal compound, Olympic derivatives
10 — Full Olympic lifts, maximal effort
```

### Technical Complexity (1–10)
```
1  — Guided machine, zero technique
2  — Machine + some positioning
3  — Basic cable and dumbbell
4  — Dumbbell compounds
5  — Barbell basics (deadlift for beginners)
6  — Advanced barbell patterns (front squat, RDL)
7  — Expert barbell (Bulgarian, Good Morning)
8  — Advanced calisthenics, extreme barbell
9  — Olympic derivatives
10 — Full Olympic lifts
```

### Stability Demand (1–10)
```
1  — Fully supported machine
2  — Seated unsupported
3  — Standing cable (anchored)
4  — Free weight with stable base
5  — Barbell compound bilateral
6  — Standing barbell (overhead, bent over)
7  — Unilateral with moderate demand
8  — Unilateral compound (single leg DL)
9  — Single limb overhead
10 — Extreme unstable unilateral
```

### Joint Stress (0–10, per joint)
```
0  — No load
1-2 — Incidental (minor stabilization)
3-4 — Moderate (standard loaded movement)
5-6 — High (significant shear or compressive force)
7-8 — Very high (heavy load, extreme ROM)
9-10 — Extreme (flag for PIL — contraindicated for many)
```

---

## 14. Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-11 | Initial canonical specification |

---

*This specification was authored as part of the Catalyst OS Phase 2A — Exercise Intelligence initiative. It supersedes all prior informal exercise data conventions.*
