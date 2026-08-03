# Exercise Library Launch Audit — Exercise Science Review

**Scope:** live database, 288 active exercises. Code quality ignored — this is a content/data audit only.
**Method:** direct SQL queries against the production database (not the seed source files), cross-referenced against `docs/exercise-intelligence-spec.md`. Every count below is measured, not estimated.

---

## Baseline counts

| Metric | Count |
|---|---|
| Active exercises | 288 |
| Equipment catalog items | 61 |
| `exercise_muscles` rows | 929 |
| `exercise_cues` rows | 417 |
| `exercise_relations` rows | 190 |
| `exercise_contraindications` rows | 0 |
| `exercise_media` rows | 0 |

### Classification breakdown
| Classification | Count |
|---|---|
| compound | 165 |
| isolation | 113 |
| power | 6 |
| skill | 3 |
| cardio | 1 |
| mobility | **0** |

### Difficulty breakdown
| Difficulty | Count |
|---|---|
| beginner | 127 |
| intermediate | 124 |
| advanced | 35 |
| specialist | 2 |

### Resistance type breakdown
dumbbell 70 · barbell 54 · cable 48 · bodyweight 47 · machine 21 · band 12 · kettlebell 10 · plate_loaded 8 · landmine 5 · smith_machine 4 · trap_bar 3 · suspension 3 · medicine_ball 2 · sandbag 1

### Movement pattern coverage (all 26 enum values)
| Pattern | Count | | Pattern | Count |
|---|---|---|---|---|
| hip_hinge | 34 | | anti_rotation | 7 |
| push_horizontal | 29 | | hip_extension | 9 |
| pull_horizontal | 24 | | hip_flexion | 8 |
| shoulder_abduction | 23 | | iso_hold | 8 |
| elbow_flexion | 21 | | squat_unilateral | 10 |
| elbow_extension | 21 | | knee_extension | 3 |
| push_vertical | 19 | | scapular_retraction | 3 |
| squat_bilateral | 19 | | gait | 3 |
| pull_vertical | 13 | | external_rotation | 6 |
| lunge | 6 | | internal_rotation | 5 |
| rotation | 6 | | shoulder_adduction | 2 |
| carry | 7 | | scapular_depression | 1 |
| | | | knee_flexion | **1** |
| | | | jump | **0** |
| | | | throw | **0** |

### Muscle group — primary-role coverage (all 27 enum values)
| Muscle | Primary | Any role | | Muscle | Primary | Any role |
|---|---|---|---|---|---|---|
| quadriceps | 42 | 52 | | glutes | 14 | 87 |
| lats | 34 | 42 | | rear_deltoid | 12 | 55 |
| chest | 28 | 37 | | obliques | 12 | 44 |
| hamstrings | 28 | 64 | | hip_flexors | 8 | 12 |
| triceps | 24 | 64 | | trapezius | 6 | 34 |
| shoulder (front) | 22 | 84 | | rectus_abdominis | 5 | 27 |
| lateral_deltoid | 22 | 35 | | transverse_abdominis | 3 | 38 |
| biceps | 17 | 55 | | upper_back | 3 | 6 |
| | | | | brachialis | 3 | 20 |
| | | | | abductors | 1 | 19 |
| | | | | brachioradialis | 1 | 5 |
| | | | | spinal_erectors | 1 | 45 |
| | | | | multifidus | 1 | 1 |
| | | | | cardiovascular | 1 | 1 |
| **calves** | **0** | 5 | | **rhomboids** | **0** | 10 |
| **forearms** | **0** | 47 | | **tibialis** | **0** | 4 |
| **adductors** | **0** | 29 | | | | |

---

## 1. Missing Exercises

| Priority | Gap | Why it matters |
|---|---|---|
| **P0** | **Lying Leg Curl / Nordic Curl** — the hamstring `knee_flexion` family has exactly **one** exercise (Seated Leg Curl). `lying-leg-curl-machine` and `glute-ham-developer` equipment are already provisioned. Nordic Curl is used as a *calibration anchor in the spec itself* (§6.1, §6.3, §8.8) — it's referenced as ground truth but doesn't exist in the catalog. | Direct hamstring isolation is one of the most commonly prescribed accessory patterns (injury prevention, hypertrophy). A coach programming a hamstring-focused block has one option. |
| **P0** | **Cardio/conditioning is a single exercise** (Stair Climber). Assault Bike, Rowing Machine, Ski Erg, Stationary Bike, Treadmill, Jump Rope, Battle Rope — 7 pieces of cardio equipment — are seeded and **completely unused**. | Any general-population coaching practice (fat loss, conditioning days, GPP) needs interval/steady-state cardio prescriptions. This is a full missing modality, not a gap in one family. |
| **P1** | **Calf raises — zero exercises.** `machine-calf-raise` (standing) and `seated-calf-raise-machine` are seeded, unused. No standing, seated, or single-leg calf raise exists anywhere. | Calves are one of the most universally programmed isolation muscles; their complete absence is conspicuous in any generated program. |
| **P1** | **Plyometrics/power development** — `jump` and `throw` movement patterns have zero exercises. No box jump, broad jump, depth jump, or med-ball slam exists (the one "Medicine Ball Rotational Throw" is tagged `rotation`, not `throw`). | Needed for athletic-population programming and general power development in older/general clients (rate-of-force-development work). |
| **P1** | **Mobility/warm-up work — zero exercises.** `classification = mobility` and `is_mobility = true` both return 0 rows across the entire catalog. | Warm-up and mobility prep are standard components of virtually every real program template; this category is not just thin, it's empty. |
| **P2** | **Direct forearm/grip work** — no wrist curl, reverse wrist curl, or dedicated grip exercise (forearms only ever appear as secondary/stabilizer, 47 times, never primary). | Common accessory work, especially relevant given the library already emphasizes carries. |
| **P2** | **Direct adductor work** — no Copenhagen plank, cable hip adduction, or adductor machine exercise. `machine-hip-adduction` equipment is seeded, unused. | Groin/adductor injuries are common in athletic populations; there's no rehab or strengthening option. |
| **P3** | **Neck work** — no direct neck flexion/extension/lateral flexion exercises at all (not even represented as an equipment gap — no neck harness in the catalog either). | Lower priority for general coaching; relevant mainly for combat/contact-sport clients. |
| **P3** | **Tibialis / anterior shin work** — 0 primary, 4 any-role. No tibialis raise. | Trending in rehab/ankle-health circles but not yet a programming standard; safe to defer. |

---

## 2. Duplicate Exercises

**Finding: no true duplicates.** All 288 exercises were grouped by `(movement_pattern, primary_muscle_group, resistance_type, classification)` and every cluster of 3+ (40 clusters total) was manually reviewed. Every cluster is legitimate biomechanical variation (grip width, bar path, stance, angle) that a real coach would program distinctly — e.g. the 11-exercise barbell hip-hinge cluster is Conventional/Sumo/Deficit/Snatch-Grip/Banded Deadlift plus the Good Morning family, each with a genuinely different loading profile. Dumbbell Squat vs. Goblet Squat are different holds with different torso mechanics, not the same exercise twice.

The one real defect here isn't a *duplicate* — it's **silent data loss from slug collisions**.

| Priority | Issue | Detail |
|---|---|---|
| **P1** | **7 exercises are running on stale/thin legacy data instead of their intended canonical version.** `back-squat`, `leg-press`, `lat-pulldown`, `chest-supported-dumbbell-row`, `dumbbell-bench-press`, `cable-lateral-raise`, `plank` kept their original July-13 placeholder-seed rows because `ON CONFLICT DO NOTHING` silently discarded the richer canonical inserts that shared the same slug. Measured: `back-squat` has 4 cues, 2 equipment links, and no progression chain into `low-bar-back-squat`/`box-squat`/`front-squat` (all of which exist as *separate* rows and are functionally orphaned from the very exercise a client would naturally progress from). Other rows: `leg-press` (3 cues, 1 equipment link, 3 relations), `lat-pulldown` (2 cues, 1 equipment link, 5 relations), `chest-supported-dumbbell-row` (2 cues, 2 equipment links, 1 relation), `dumbbell-bench-press` (2 cues, 2 equipment links, 3 relations), `cable-lateral-raise` (2 cues, 1 equipment link, 7 relations), `plank` (4 cues, 0 equipment links — correct for bodyweight, 5 relations). | These are 7 of the highest-traffic, most-assigned exercises in any program (Back Squat, Leg Press, Lat Pulldown, Bench Press, Plank) — they're running on the least complete data in the entire library. |

---

## 3. Poor Categorization

| Priority | Issue | Detail |
|---|---|---|
| **P0** | **`back-squat`'s primary muscle is `glutes`, contradicting the spec's own worked example** ("For the Back Squat, primary is quadriceps — quads are most limiter at typical loads," §3.5). Root cause: `back-squat` has **two** `role='primary'` rows in `exercise_muscles` (glutes *and* quadriceps — a direct violation of the "0–1 primary" rule, §5.1), and whichever row's UUID happened to sort first won the denormalized column. | This is your #1 most-assigned exercise showing scientifically incorrect primary-muscle data to every coach who filters by muscle group or scans the list view. |
| **P1** | **16 exercises have duplicate `primary` roles** — Back Squat, Romanian Deadlift, Dip, Weighted Dip, Bulgarian Split Squat, Arnold Press, Behind-Neck Press, Handstand Push-Up, Barbell Floor Press, Dumbbell Floor Press, Decline Push-Up, Incline Barbell Bench Press, Incline Dumbbell Bench Press, Incline Dumbbell Fly, Plank, Chest-Supported Dumbbell Row. All 16 are legacy placeholder-seed rows (predate the canonical pipeline) — none of the 273 canonically-seeded exercises have this defect, confirming the newer pipeline's discipline is sound. | Same failure mode as #1 above at smaller scale — an editorial pass is needed to pick the correct single primary per exercise. |
| **P2** | **JM Press is classified `compound`** while its close cousins (Skull Crusher family) are `isolation` — correct given JM Press genuinely blends a press with an extension, but worth a coach-facing note since it's easy to assume all `elbow_extension`-pattern exercises are isolation. Not a bug, just worth flagging as an intentional outlier during any editorial review. | Low risk, just documentation. |

---

## 4. Missing Muscles (as a `primary` target)

| Muscle | Primary count | Any-role count | Priority |
|---|---|---|---|
| `calves` | **0** | 5 | **P1** — see Missing Exercises |
| `forearms` | **0** | 47 | **P2** |
| `adductors` | **0** | 29 | **P2** |
| `rhomboids` | **0** | 10 | **P3** — rhomboids are almost never trained in isolation in real programming (they're a secondary target of rowing/scapular-retraction work, which the library already covers at 10 any-role instances); low actual risk. |
| `tibialis` | **0** | 4 | **P3** |
| `abductors` | 1 (Banded Glute Walk only) | 19 | **P3** — thin but technically non-zero; a cable hip abduction or machine hip-abduction exercise (equipment already seeded) would round this out. |

Every other muscle group has real primary-role representation, from 1 (`brachioradialis`, `spinal_erectors`, `multifidus`, `cardiovascular` — all intentionally niche) up to 42 (`quadriceps`).

---

## 5. Missing Equipment (seeded but zero exercises use it)

13 of 61 equipment catalog items have zero linked exercises:

| Priority | Equipment | Ties to |
|---|---|---|
| **P0/P1** | Assault Bike, Rowing Machine, Ski Erg, Stationary Bike, Treadmill, Jump Rope, Battle Rope | Cardio gap (§1) |
| **P1** | Standing Calf Raise Machine, Seated Calf Raise Machine | Calves gap (§1) |
| **P1** | Lying Leg Curl Machine | Hamstring curl gap (§1) |
| **P2** | Hip Abduction Machine, Hip Adduction Machine | Adductor/abductor gap |
| **P3** | Machine Pullover | No machine pullover exercise exists; minor — dumbbell/barbell pullover already covered |

This list is a clean, direct checklist: every one of these was deliberately provisioned in `SHARED_EQUIPMENT` anticipating content that was never written.

---

## 6. Missing Movement Patterns

| Pattern | Count | Priority |
|---|---|---|
| `jump` | **0** | **P1** — plyometrics |
| `throw` | **0** | **P1** — plyometrics |
| `knee_flexion` | 1 | **P0** — see Missing Exercises (Nordic/lying leg curl) |
| `scapular_depression` | 1 (Straight-Arm Pulldown only) | **P3** — thin but the pattern's core use case (lat isolation via depression) is already well-served by the 34 `lats`-primary exercises elsewhere; not urgent. |
| `shoulder_adduction` | 2 | **P3** — inherently a rare, narrow pattern; already covered adequately for its scope. |
| `knee_extension` | 3 | **P3** — fine; Leg Extension + Sissy Squat family present. |

Every other pattern (20 of 27 in the enum) has reasonable-to-strong coverage (6–34 exercises each).

---

## 7. Missing Coaching Cues

| Priority | Finding |
|---|---|
| **P0** | **112 of 288 exercises (39%) have zero coaching cues** — no `setup`, no `execution`, nothing. This directly violates the platform's own completeness rule (spec §12: "At least 1 setup cue AND 1 execution cue" required for `active` status) — these 112 exercises are marked `active` while failing their own activation gate. |
| **P0 subset** | **12 of those 112 are `advanced` or `specialist` difficulty** with zero coaching guidance: Deficit Deadlift, Deficit Romanian Deadlift, Snatch-Grip Deadlift, Barbell Single-Leg Romanian Deadlift (specialist), Banded Deadlift, Good Morning, Seated Good Morning, Barbell Walking Lunge, Barbell Hack Squat, Kroc Row, Renegade Row, Wide-Grip Pull-Up, Single-Arm Kettlebell Swing. These are exactly the exercises where bad form carries the most injury risk — a coach assigning "Snatch-Grip Deadlift" to a client gets zero setup/safety guidance from the platform. |
| **P1** | The other ~100 are mostly `beginner`/`intermediate` variants of well-cued sibling exercises (e.g. Dumbbell Squat has no cues, but Goblet Squat and Bodyweight Squat nearby do) — lower individual risk, but still fails the platform's stated bar and should be closed out systematically. |

Full list of the 112 zero-cue exercises (slug — classification/difficulty):

```
assisted-pull-up (compound/beginner)                    kettlebell-front-squat (compound/intermediate)
b-stance-romanian-deadlift (compound/intermediate)       kettlebell-single-leg-deadlift (compound/intermediate)
band-pallof-press (isolation/beginner)                   kettlebell-sumo-deadlift (compound/beginner)
banded-deadlift (compound/advanced)                      kroc-row (compound/advanced)
banded-glute-walk (isolation/beginner)                   landmine-rotation (isolation/intermediate)
barbell-floor-press (compound/intermediate)               landmine-row (compound/intermediate)
barbell-glute-bridge (compound/beginner)                 lateral-lunge (compound/intermediate)
barbell-hack-squat (compound/advanced)                   low-bar-back-squat (compound/intermediate)
barbell-pullover (compound/intermediate)                 lying-leg-raise (isolation/beginner)
barbell-single-leg-romanian-deadlift (compound/specialist) machine-back-extension-exercise (compound/beginner)
barbell-step-up (compound/intermediate)                  machine-chest-press (compound/beginner)
barbell-walking-lunge (compound/advanced)                machine-hip-hinge (compound/beginner)
belt-squat-good-morning (compound/intermediate)          machine-rear-delt-fly (isolation/beginner)
block-pull (compound/intermediate)                       neutral-grip-dumbbell-press (compound/beginner)
bodyweight-squat (compound/beginner)                     neutral-grip-pull-up (compound/intermediate)
box-pistol-squat (compound/intermediate)                 pause-squat (compound/intermediate)
cable-overhead-press (compound/intermediate)             renegade-row (compound/advanced)
cable-rear-delt-fly (isolation/beginner)                 reverse-crunch (isolation/beginner)
cable-triceps-pressdown (isolation/beginner)             reverse-hyperextension (compound/beginner)
cable-woodchop-low-to-high (isolation/beginner)          reverse-lunge (compound/beginner)
captains-chair-leg-raise (isolation/intermediate)        ring-row (compound/intermediate)
chest-supported-machine-row (compound/beginner)          sandbag-carry (compound/intermediate)
chest-supported-rear-delt-raise (isolation/beginner)     seated-barbell-overhead-press (compound/intermediate)
close-grip-lat-pulldown (compound/beginner)              seated-good-morning (compound/advanced)
close-grip-seated-cable-row (compound/beginner)          seated-leg-curl (isolation/beginner)
curtsy-lunge (compound/intermediate)                     single-arm-cable-row (compound/intermediate)
decline-barbell-bench-press (compound/intermediate)      single-arm-dumbbell-bench-press (compound/intermediate)
decline-dumbbell-bench-press (compound/intermediate)     single-arm-dumbbell-overhead-press (compound/intermediate)
decline-push-up (compound/intermediate)                  single-arm-farmers-carry (compound/intermediate)
deficit-deadlift (compound/advanced)                     single-arm-kettlebell-swing (power/advanced)
deficit-romanian-deadlift (compound/advanced)            single-arm-lat-pulldown (compound/intermediate)
double-kettlebell-deadlift (compound/intermediate)       single-leg-cable-deadlift (compound/intermediate)
dumbbell-bulgarian-split-squat (compound/intermediate)   single-leg-extension (isolation/beginner)
dumbbell-curl (isolation/beginner)                       single-leg-glute-bridge (compound/beginner)
dumbbell-deadlift (compound/beginner)                    single-leg-press (compound/intermediate)
dumbbell-push-press (power/intermediate)                 smith-machine-bench-press (compound/beginner)
dumbbell-seated-overhead-press (compound/beginner)       smith-machine-overhead-press (compound/beginner)
dumbbell-squat (compound/beginner)                       smith-machine-romanian-deadlift (compound/beginner)
dumbbell-step-up (compound/beginner)                     smith-machine-squat (compound/beginner)
feet-elevated-inverted-row (compound/intermediate)       snatch-grip-deadlift (compound/specialist)
forward-lunge (compound/beginner)                        stair-climber (cardio/beginner)
front-rack-carry (compound/intermediate)                 standing-cable-rotation (isolation/beginner)
good-morning (compound/advanced)                         stiff-leg-deadlift (compound/intermediate)
half-kneeling-landmine-press (compound/intermediate)     stir-the-pot (isolation/intermediate)
half-kneeling-pallof-press (isolation/intermediate)      trap-bar-carry (compound/beginner)
hanging-knee-raise (isolation/intermediate)              trap-bar-deadlift-high-handle (compound/beginner)
heel-elevated-goblet-squat (compound/beginner)           trx-row (compound/beginner)
hip-thrust-machine-exercise (compound/beginner)          underhand-barbell-row (compound/intermediate)
incline-dumbbell-row (compound/beginner)                 underhand-lat-pulldown (compound/beginner)
incline-push-up (compound/beginner)                      underhand-seated-cable-row (compound/beginner)
incline-y-raise (isolation/intermediate)                 vertical-leg-press (compound/beginner)
jump-squat (power/intermediate)                          weighted-back-extension (compound/intermediate)
kettlebell-deadlift (compound/beginner)                  weighted-dip (compound/intermediate)
                                                          weighted-plank (isolation/intermediate)
                                                          wide-grip-bench-press (compound/intermediate)
                                                          wide-grip-pull-up (compound/advanced)
                                                          wide-grip-seated-cable-row (compound/beginner)
                                                          wide-push-up (compound/beginner)
                                                          yates-row (compound/intermediate)
```

---

## 8. Missing Substitution Relationships

| Priority | Finding |
|---|---|
| **P0** | Only **9** `substitute`-type relations exist in the entire library (out of 190 total relation rows). **221 of 288 exercises (77%) have no `substitute` or `lower_joint_stress` relation at all**, in either direction. |
| **P0** | This directly undercuts the platform's flagship differentiator — the spec's own architecture document describes a "Substitute Exercise Engine" as a core deliverable, with an explicit rule (§10.4): *"Every exercise with substitute relations must have at least 2 substitutes — one at similar difficulty and one that is a regression."* Effectively none of the library meets this bar today. |
| **P1** | Priority order for closing this: start with the highest-difficulty and highest-joint-stress exercises first (Snatch-Grip Deadlift, Behind-Neck Press, Deficit Deadlift, and other Jefferson-Curl-adjacent movements) since those are exactly the ones a coach most needs a safer substitute for. |

Relation type totals across the library: regression 45 · progression 43 · same_pattern 43 · lower_joint_stress 39 · contralateral 11 · **substitute 9**.

---

## 9. Missing Progression Relationships

| Priority | Finding |
|---|---|
| **P1** | **43** `progression` relations exist. **206 of 288 exercises (72%) have no `progression` or `regression` relation at all.** |
| **P1** | Concrete example: Back Squat has 11 relations total (best-covered squat in the library) but **no progression path to/from** `low-bar-back-squat`, `box-squat`, `front-squat`, `pause-squat`, or `zercher-squat` — 5 closely related squat variants sitting in the same database with zero graph connection between them, despite obviously belonging in the same progression family. |
| **P2** | The general pattern: relations were authored densely *within* each seed file's own family (e.g. all deadlift-to-deadlift links inside `004-hip-hinge.ts`) but not *across* files or across the legacy/canonical boundary. Cross-file relationship authoring is the actual gap, not relationship authoring in general. |

---

## 10. Missing Regression Relationships

| Priority | Finding |
|---|---|
| **P1** | **45** `regression` relations exist (roughly mirrors the progression count, since the pipeline correctly authors these as bidirectional pairs within a family — this part of the pipeline works as designed). Same 206/288 no-relation-at-all figure applies. |
| **P1** | The highest-value gap: **advanced/specialist-difficulty exercises without any regression path** — a coach with a deconditioned or injured client currently has no system-suggested "easier version" for e.g. Snatch-Grip Deadlift, Barbell Single-Leg RDL, Wide-Grip Pull-Up, Kroc Row, Renegade Row (the same list as the missing-cues P0 subset — these exercises are doubly underserved: no coaching guidance *and* no safer fallback). |

---

## Ranked Roadmap

**P0 — Launch blockers** (fix before/immediately at launch; these break the platform's own stated rules or create real client-safety exposure)
1. Write coaching cues for all 112 zero-cue exercises, prioritizing the 12 advanced/specialist ones first.
2. Fix the 16 duplicate-`primary`-role exercises (editorial pass: pick the correct single primary muscle per spec's biomechanical reasoning; start with Back Squat → quadriceps).
3. Add Lying Leg Curl + Nordic Curl (the spec's own calibration exercises are missing from the catalog).
4. Author `substitute`/`lower_joint_stress` relations for the ~20 highest-difficulty, highest-joint-stress exercises — the substitution engine is a stated core feature and is currently ~5% populated relative to the spec's own minimum bar.

**P1 — Fix in the first 1–2 weeks post-launch**
5. Build a cardio/conditioning family (bike, rower, ski erg, treadmill, jump rope, battle rope) — 7 pieces of equipment are sitting unused for this.
6. Add a calf-raise family (standing, seated, single-leg) — equipment already provisioned.
7. Build cross-family progression/regression chains, starting with the squat family (Back Squat ↔ Front Squat ↔ Box Squat ↔ Low-Bar ↔ Pause) and the 7 legacy-collision exercises reconnecting into their canonical siblings' relationship graphs.
8. Add a basic plyometric family (box jump, broad jump, depth jump) — `jump`/`throw` patterns are fully empty.
9. Repair the 7 legacy-collision exercises (Back Squat, Leg Press, Lat Pulldown, Chest-Supported DB Row, DB Bench Press, Cable Lateral Raise, Plank) up to full canonical richness.

**P2 — First month**
10. Add a mobility/warm-up category — currently a fully empty classification.
11. Add direct forearm/grip and adductor exercises.
12. Populate `exercise_contraindications` — currently **zero rows** system-wide, despite the spec defining this table with concrete worked examples (Behind-Neck Press → rotator cuff impingement). This is the other half of the "injury-aware coaching" promise, alongside substitution.
13. Close out remaining zero-cue exercises (the ~100 lower-risk beginner/intermediate ones).

**P3 — Backlog, not launch-relevant**
14. Rhomboid/tibialis/neck direct-work exercises.
15. `exercise_media` (video/image demos) — zero rows, but this is a separate content-production pipeline, not a data-modeling gap.
16. Round out `abductors` beyond the single Banded Glute Walk entry.

---

*No implementation was performed as part of this audit — findings and roadmap only.*
