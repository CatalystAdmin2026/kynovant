# Catalyst OS — Phase 1 Programming Intelligence Roadmap

Implementation planning document · July 2026

Preceded by:
- `docs/AI_PRINCIPLES.md` — Constitutional doctrine (P-1 through P-9)
- `docs/catalyst-os-programming-intelligence.md` — Phase 1 architecture
- `docs/catalyst-os-pil-catalog.md` — Full module catalog

This document converts the architecture into an execution roadmap. It does not contain implementation code.

---

## Part 1 — Phase 1 Implementation Roadmap

Phase 1 is organized into five milestones, each independently shippable and testable. The milestones are designed to be GitHub milestones — every Definition of Done is binary and verifiable.

---

### Milestone 1A — PIL Foundation

**Objective**
Establish the shared type contract, enrichment service, and prescription validation module that every downstream analysis depends on. The milestone is invisible to coaches — no UI changes. Its value is architectural: defining the types correctly here prevents cascade changes when analysis modules are added.

**Services to create**

`lib/pil/enrichment.ts`
- `getBlueprintEnriched(templateId: string, coachId?: string): Promise<EnrichedBlueprint>`
- Executes exactly 5 batched queries: sections, prescriptions, exercises, muscles, overrides (+ favorites when coachId is present)
- Returns a fully typed `EnrichedBlueprint` with `effectivePrescription` resolved

`lib/pil/modules/validity.ts`
- `validatePrescriptions(blueprint: EnrichedBlueprint): ValidationResult`
- Pure function — no DB calls
- Returns all 8 hard validity findings (see catalog M01)

**Types to create**

`lib/pil/types.ts` — the PIL type contract. Every type defined here is permanent. Changes to this file after 1B ships cascade to every analysis module.

```
PilSeverity: 'error' | 'warning' | 'caution' | 'info'
PilConfidence: 'certain' | 'heuristic' | 'incomplete_data'
PilEvidenceFact: { label: string; value: string | number }
PilAffectedEntity: { type: 'exercise' | 'muscle' | 'joint' | 'day' | 'week'; id: string; name: string }
PilSuggestedAction: { label: string; type: ActionType; sourceExerciseId?: string; candidateExerciseIds?: string[]; ... }
PilFinding: { id: string; code: string; category: string; severity: PilSeverity; confidence: PilConfidence; title: string; explanation: string; evidence: PilEvidenceFact[]; affectedEntities: PilAffectedEntity[]; suggestedActions?: PilSuggestedAction[] }

EnrichedExercise: all scoring fields + muscles[] + relations[]
EnrichedPrescription: effectivePrescription + all prescription fields + exercise: EnrichedExercise
EnrichedSection: sectionType + estimatedMinutes + prescriptions[]
EnrichedBlueprint: templateId + name + sections[] + prescriptions[]

ValidationResult: { valid: boolean; errors: PilFinding[]; warnings: PilFinding[] }
```

**Note on finding `code` stability:** Finding codes must be deterministic and stable across runs. The code format is `CATEGORY_RULE_QUALIFIER` — e.g., `VALIDITY_REPS_INVERTED`, `VOLUME_HIGH_DIRECT`. These codes are the stable identity key for Phase 2 finding persistence (dismissal, annotation). Do not change codes after 1B ships without a migration plan.

**APIs to create**
None. 1A is a pure service layer.

**UI components**
None. No coach-visible output.

**Tests**

`lib/pil/__tests__/enrichment.test.ts`
- Asserts exactly 5 SQL queries executed (via query count mock or spy)
- Asserts `effectivePrescription` = override when override exists
- Asserts `effectivePrescription` = canonical when no override
- Asserts exercises with status=archived are flagged `missing: true` on the prescription
- Asserts exercises with no `exercise_muscles` rows have empty `muscles[]` (not a crash)

`lib/pil/__tests__/validity.test.ts`
- One test per finding code (8 tests), each constructing the minimum EnrichedBlueprint that triggers the finding
- One test for a clean blueprint that produces zero findings
- One test for multiple simultaneous violations

**Files affected**
- New: `lib/pil/types.ts`, `lib/pil/enrichment.ts`, `lib/pil/modules/validity.ts`
- New: `lib/pil/__tests__/enrichment.test.ts`, `lib/pil/__tests__/validity.test.ts`
- Modified: `lib/db/workout-validator.ts` — refactored to call `validatePrescriptions()` internally, preserving the existing external API. This is the highest-risk change in 1A. It must not break Blueprint publishing.

**Dependencies**
Schema only. No other PIL modules.

**Estimated complexity**
Medium. The enrichment query batching and the type definitions require care. The validation logic is simple. The workout-validator.ts refactor is the risk.

**Definition of Done**
- [ ] `getBlueprintEnriched()` passes all enrichment tests with zero N+1 queries
- [ ] `validatePrescriptions()` correctly produces and clears all 8 finding codes
- [ ] All existing `workout-validator.ts` callers and their tests pass without modification
- [ ] `npx tsc --noEmit` returns clean
- [ ] `lib/pil/types.ts` is reviewed and approved before 1B begins

---

### Milestone 1B — Blueprint Volume, Fatigue, and Movement

**Objective**
Implement the three analysis modules that produce the Per-Muscle Weekly Brief and push/pull balance. This is the first coach-visible milestone and the differentiation anchor. When 1B ships, coaches can open a Blueprint and see how many direct and indirect sets each muscle group receives, the push/pull balance, and the session's estimated fatigue profile.

**Services to create**

`lib/pil/modules/volume.ts`
- `analyzeVolume(blueprint: EnrichedBlueprint): VolumeAnalysis`

`lib/pil/modules/fatigue.ts`
- `analyzeFatigue(blueprint: EnrichedBlueprint): FatigueAnalysis`

`lib/pil/modules/movement.ts`
- `analyzeMovement(blueprint: EnrichedBlueprint): MovementAnalysis`

`lib/pil/modules/completeness.ts`
- `assessCompleteness(blueprint: EnrichedBlueprint): CompletenessReport`

`lib/pil/blueprint-audit.ts`
- `getBlueprintAudit(templateId: string, coachId?: string): Promise<BlueprintAuditResult>`
- Orchestrates: M00 → M01 → M02 → M03 → M04 → M05 → M31
- Pure function pipeline; enrichment is the only async call

**Types to create**
`VolumeAnalysis`, `FatigueAnalysis`, `MovementAnalysis`, `CompletenessReport`, `BlueprintAuditResult`, `BlueprintQualitySummary`

The `BlueprintQualitySummary` dimensional status model:
```
dimensionStatus: {
  validity: 'ok' | 'has_errors';
  volume: 'ok' | 'elevated' | 'incomplete' | 'unknown';
  fatigue: 'moderate' | 'high' | 'incomplete' | 'unknown';
  movement: 'balanced' | 'imbalanced' | 'unknown';
  jointStress: 'unknown';   // populated in 1C
  redundancy: 'unknown';    // populated in 1C
  duration: 'unknown';      // populated in 1C
}
```

Dimensions that will be populated in later milestones start as `'unknown'` — not absent. The panel renders them as neutral grey badges, not as missing fields.

**APIs to create**

`POST /api/internal/pil/blueprint/[templateId]/audit`
- Auth: `requireCoachOrAdmin()`
- Reads `coachId` from session; passes to `getBlueprintAudit()`
- Returns `BlueprintAuditResult`
- No request body needed; all inputs are from the path and session

**UI components**

`components/pil/BlueprintAuditPanel.tsx`
- Renders `BlueprintQualitySummary`: dimensional status row + top findings
- Not a modal — renders inline below blueprint metadata in the HQ blueprint detail view
- "Run Analysis" button triggers the API; result is cached client-side for the session

`components/pil/MuscleSetsTable.tsx`
- Hero component: muscle group × direct sets × indirect sets
- Sortable by muscle group name or total sets
- Rows where data is incomplete (no exercise_muscles) render with a subtle "incomplete" indicator

`components/pil/MovementPatternChart.tsx`
- Horizontal stacked bar: one bar per pattern category
- Push/pull pair is visually adjacent with a ratio label between them
- Fires only when at least two different patterns are present in the blueprint

`components/pil/PilFindingCard.tsx`
- Severity left-border (red/orange/yellow/none by severity)
- Title + one-line explanation always visible
- "Evidence" expand section: renders `PilEvidenceFact[]` as a bulleted list
- Confidence treatment: `heuristic` findings have a small inline note: "Guideline — your coaching judgment applies"
- `incomplete_data` findings render muted with a small "data quality" icon — clearly visually distinct from real findings

`components/pil/DataQualityBanner.tsx`
- Renders `CompletenessReport` at the bottom of the panel, below all real findings
- Text only, no chart: "Volume coverage: 80% (4 exercises lack muscle group data)"
- This is the only place incomplete data is surfaced. Real findings never explain why they are incomplete — the banner handles that centrally.

**Tests**

`lib/pil/__tests__/volume.test.ts`
- Direct set counting (primary role only)
- Indirect set counting (secondary + stabilizer roles)
- `VOLUME_HIGH_DIRECT` fires at ≥10 direct sets, not at 9
- `VOLUME_ZERO_DIRECT_MAJOR` fires for a major muscle group with 0 direct sets
- `VOLUME_DATA_INCOMPLETE` fires when >30% of prescriptions have no muscle data
- Exercise with no muscle rows: excluded from volume count, included in unknownVolume

`lib/pil/__tests__/fatigue.test.ts`
- Coverage % calculation with mixed null/non-null fatigueCost
- `FATIGUE_HIGH_COST_EXERCISE` threshold edge cases
- `FATIGUE_ACCUMULATION` fires at exactly 3 high-cost exercises, not at 2

`lib/pil/__tests__/movement.test.ts`
- Push/pull ratio calculation: horizontal and vertical independently
- `MOVEMENT_PUSH_PULL_H` fires at >2:1, not at 2:1 exactly
- No push/pull finding fires when one side is zero (incomplete session, not an imbalance)
- `MOVEMENT_PATTERN_DOMINANT` fires at >40% threshold

`lib/pil/__tests__/blueprint-audit.test.ts` (integration)
- Full round trip: seeded blueprint → `getBlueprintAudit()` → non-empty result
- Asserts exactly one enrichment call (not per module)
- Asserts `BlueprintQualitySummary.dimensionStatus` reflects actual module outputs

**Files affected**
- New: all services, types, UI components, test files above; API route
- Modified: HQ Blueprint detail page — adds `BlueprintAuditPanel` below blueprint metadata

**Dependencies**
Milestone 1A complete. Exercise library seeded with `exercise_muscles` rows for at least the compound exercises (otherwise Volume and Fatigue coverage will be below 40% and the first coach experience will be mostly incomplete-data notices).

**Estimated complexity**
Medium. The analysis logic in each module is straightforward. The complexity is in the UI and in ensuring the data quality story is communicated correctly without undermining confidence in the real findings.

**Definition of Done**
- [ ] A coach can open any Blueprint in HQ, click "Run Analysis," and see Volume, Fatigue, and Movement findings within 500ms
- [ ] The Per-Muscle sets table correctly reflects all muscles from the seeded exercise library
- [ ] Push/pull imbalance finding fires correctly on a blueprint with 3 chest exercises and 0 rowing
- [ ] Incomplete data appears only in the DataQualityBanner, not mixed into real findings
- [ ] All module unit tests pass
- [ ] `npx tsc --noEmit` returns clean

---

### Milestone 1C — Joint Stress, Redundancy, and Duration

**Objective**
Deepen the Blueprint-level analysis with three additional modules. Joint Stress is the module that most differentiates Catalyst from competitors — no other platform models cumulative joint load. This milestone completes the Blueprint audit surface.

**Services to create**

`lib/pil/modules/joint-stress.ts`
- `analyzeJointStress(blueprint: EnrichedBlueprint): JointStressAnalysis`

`lib/pil/modules/redundancy.ts`
- `analyzeRedundancy(blueprint: EnrichedBlueprint): RedundancyAnalysis`

`lib/pil/modules/duration.ts`
- `estimateDuration(blueprint: EnrichedBlueprint): DurationEstimate`

**Types to create**
`JointStressAnalysis`, `RedundancyAnalysis`, `DurationEstimate`

**APIs to create**
None. These modules are registered with `getBlueprintAudit()` — the existing audit API picks them up automatically.

**UI components**

`components/pil/JointStressPanel.tsx`
- Seven joints as a horizontal bar chart
- Each bar colored by severity: low (neutral), moderate (yellow), high (orange), extreme (red)
- Clicking a bar expands to list the contributing exercises and their individual scores
- Only renders when at least one joint has coverage

`components/pil/RedundancyAlert.tsx`
- Inline within the exercise list in the blueprint view (not just in the audit panel)
- Draws a subtle visual connection between two exercises identified as redundant
- The finding card in the audit panel lists the pair with a "Is this intentional?" note in the explanation

`components/pil/DurationBadge.tsx`
- Simple badge near the Blueprint header: "Est. 72 min" with a confidence indicator
- Tooltip: "Based on set counts and typical rest periods. Add section durations for precision."
- Renders regardless of audit state — always-on estimation

**Tests**

`lib/pil/__tests__/joint-stress.test.ts`
- Per-joint score aggregation (sum of sets × stress score for each exercise)
- `JOINT_STRESS_EXTREME_EXERCISE` fires at ≥9, not at 8
- `JOINT_STRESS_MULTIPLE_HIGH` fires at exactly 3 exercises with score ≥6 on the same joint
- Per-joint coverage calculation with partial null data
- No finding fires for a joint where all exercises have null scores (incomplete_data treatment)

`lib/pil/__tests__/redundancy.test.ts`
- Two exercises with identical movementPattern + primaryMuscleGroup → finding fires
- Two exercises with same movementPattern but different primaryMuscleGroup → no finding
- Exercises with null primaryMuscleGroup → excluded from redundancy check, noted in unknownCount

`lib/pil/__tests__/duration.test.ts`
- Section-based estimate (`certain` confidence) when all sections have estimatedMinutes
- Heuristic estimate with correct fallback durations per classification
- `DURATION_LONG` fires above 90 minutes, `DURATION_VERY_LONG` above 120

**Files affected**
- New: 3 service modules, 3 UI components, 3 test files
- Modified: `lib/pil/blueprint-audit.ts` (register 3 new modules), `BlueprintAuditPanel` (joint stress and redundancy status indicators), Blueprint detail page (DurationBadge in header)

**Dependencies**
Milestone 1B complete. Joint stress module requires `jointStressSpine` and `jointStressKnee` to be populated for at least compound exercises for meaningful findings.

**Estimated complexity**
Small. All three modules are simpler than the 1B modules. The joint stress UI is the most complex piece.

**Definition of Done**
- [ ] Joint stress panel renders for a blueprint containing Back Squat and Romanian Deadlift with non-null spine scores
- [ ] `JOINT_STRESS_MULTIPLE_HIGH` fires correctly on a blueprint with 3 high-spine exercises
- [ ] Redundancy finding fires correctly and does not fire on intentionally distinct exercises sharing a movement pattern
- [ ] Duration badge appears in Blueprint header, always-on (not gated on audit)
- [ ] `BlueprintQualitySummary.dimensionStatus.jointStress`, `.redundancy`, `.duration` are now populated (not 'unknown')
- [ ] All module unit tests pass

---

### Milestone 1D — Program Layer, Frequency, Recovery, and Substitution

**Objective**
Extend PIL to program-level analysis and ship the Per-Muscle Weekly Brief — the table that is the definitive differentiating feature. Also ships the basic substitution service. This milestone is the product demo milestone: everything needed to run the 10-minute conference demo is present after 1D.

**Services to create**

`lib/pil/modules/program-structure.ts`
- `validateProgramStructure(programTemplateId: string): Promise<ProgramStructureResult>`
- Reads directly from program_weeks and program_week_days — the only program module with DB calls (structure is not part of EnrichedBlueprint)

`lib/pil/modules/frequency.ts`
- `analyzeFrequency(weeks: EnrichedProgramWeek[]): FrequencyAnalysis`

`lib/pil/modules/recovery.ts`
- `analyzeRecovery(frequency: FrequencyAnalysis): RecoverySpacingAnalysis`

`lib/pil/program-audit.ts`
- `getProgramAudit(programTemplateId: string, coachId?: string): Promise<ProgramAuditResult>`
- Enriches each distinct blueprint once (not once per occurrence) — the key performance requirement
- Orchestrates: program structure → per-blueprint enrichment + analysis → frequency → recovery → M32

`lib/pil/substitution.ts`
- `getSubstitutes(exerciseId: string, coachId?: string, policy?: RelationType[]): Promise<SubstitutionResult>`
- Queries `exercise_relations` bidirectionally
- Filters to active exercises only
- Returns candidates ranked by suitabilityScore (desc), then similarity score

**Types to create**
`EnrichedProgramWeek`, `FrequencyAnalysis`, `RecoverySpacingAnalysis`, `ProgramStructureResult`, `ProgramAuditResult`, `ProgramQualitySummary`, `SubstitutionResult`

**APIs to create**

`POST /api/internal/pil/program/[programTemplateId]/audit`
- Auth: `requireCoachOrAdmin()`
- Returns `ProgramAuditResult`
- Performance requirement: must complete in < 2 seconds for a 4-week program with 5 distinct blueprints

`GET /api/internal/pil/exercise/[exerciseId]/substitutes`
- Auth: `requireCoachOrAdmin()`
- Query params: `policy` (comma-separated RelationType values, optional)
- Returns `SubstitutionResult`

**UI components**

`components/pil/PerMuscleWeeklyBrief.tsx`
- THE hero component of the entire PIL system
- Table: muscle group × direct sets × indirect sets × training days × shortest rest gap
- Rows with gap = 0 days: flagged with an error-severity inline badge
- Rows with gap = 1 day: flagged with a warning-severity badge
- Muscle groups with direct:indirect ratio > 3:1 in favor of one agonist: annotated
- Sortable. Filterable by muscle group category (upper / lower / core)

`components/pil/ProgramAuditPanel.tsx`
- Renders `ProgramQualitySummary` — dimensional status indicators for program-level dimensions
- Hosts the `PerMuscleWeeklyBrief` as its primary visual
- Recovery spacing findings appear as inline row annotations in the Brief, not as separate cards

`components/pil/SubstitutionDrawer.tsx`
- Slide-over triggered from a finding's suggested action or from an exercise menu in the Blueprint Editor
- Lists substitution candidates with: name, relationType label, movement pattern, primary muscle
- "Swap" button triggers the Blueprint Editor's `handleSwapExercise()` action
- Phase 1: no client-specific filtering. Phase 2: adds contraindication and equipment filters.

**Tests**

`lib/pil/__tests__/program-structure.test.ts`
- Week gap detection (weeks 1, 2, 4 — week 3 missing → finding)
- Empty week detection
- Archived blueprint reference detection

`lib/pil/__tests__/frequency.test.ts`
- Correct session count per muscle per week (using M03 output per blueprint)
- `FREQUENCY_HIGH` threshold (≥5 sessions per week)
- Correct handling of rest days (null workoutTemplateId)
- Same blueprint appearing on multiple days: analyzed once, counted multiple times

`lib/pil/__tests__/recovery.test.ts`
- Same-day detection: dayOfWeek equality → `RECOVERY_SAME_DAY` (error)
- Consecutive day detection: gap = 1 → `RECOVERY_CONSECUTIVE` (warning)
- Week-boundary recovery: last day of week N and first day of week N+1

`lib/pil/__tests__/program-audit.test.ts` (integration)
- Asserts distinct blueprints are enriched once, not per occurrence (verify query count)
- Asserts `ProgramAuditResult.perMuscleWeeklyBrief` contains correct aggregated sets across all sessions

`lib/pil/__tests__/substitution.test.ts`
- Bidirectional relation query (outbound AND inbound relations returned)
- Deduplication when same exercise appears in both directions
- Filter to active exercises (archived candidates excluded)
- Empty result when exercise has no relations

**Files affected**
- New: all services, types, UI components, test files, API routes above
- Modified: Program builder page in HQ (adds ProgramAuditPanel), Blueprint Editor (integrates SubstitutionDrawer into exercise menu)

**Dependencies**
Milestone 1C complete. `exercise_relations` rows must exist for the seeded exercises for the Substitution Service to return non-empty results.

**Estimated complexity**
Large. The Per-Muscle Weekly Brief aggregation across multiple blueprints per week is the most complex computation in Phase 1. The program audit orchestration — enriching each distinct blueprint once and aggregating across the week — requires careful design to maintain the performance requirement.

**Definition of Done**
- [ ] `PerMuscleWeeklyBrief` renders correctly for a 4-day upper/lower split with the seeded exercise library
- [ ] A 0-day glute recovery gap is flagged as an error-severity finding in the recovery panel
- [ ] Program audit completes in < 2 seconds for a 4-week, 5-blueprint-distinct program
- [ ] Substitution drawer returns at least one candidate for Back Squat (or any exercise with seeded relations)
- [ ] All module tests pass

---

### Milestone 1E — Knowledge Completion and Polish

**Objective**
This milestone is not new analysis modules. It is the hardening sprint that makes the existing analysis meaningful. The 1B–1D modules are only as valuable as the Exercise Library scoring data. This milestone populates that data and polishes the user experience.

**Tasks (not services — these are data and UX work)**

**Knowledge Completion Sprint**
- Populate `fatigueCost` for all 15 seeded exercises (every compound exercise should have a score ≥ 6; every isolation exercise ≥ 2)
- Populate `exercise_muscles` rows (primary + secondary) for all 15 exercises
- Populate `jointStressSpine` and `jointStressKnee` for all compound exercises
- Populate `movementPattern` verification (already NOT NULL, but confirm values are correct)
- Populate `exercise_relations` for at least the major compound movements (regression, substitute, lower_joint_stress relations)
- Add at least 5 `exercise_contraindications` rows for high-risk exercises (Back Squat → lumbar, Barbell Upright Row → shoulder, etc.)

This data entry is not automated — it is coached data entry by a human with exercise science knowledge. The milestone is not done until the seeded library produces non-trivial findings on a real training program.

**UX Polish**
- Consistent loading states across all PIL panels (skeleton loaders, not spinners)
- Error boundaries on all PIL components — a failed analysis must not crash the Blueprint editor
- Empty state copy for panels where the seeded library produces no findings (e.g., a blueprint with only one exercise)
- Ensure "Run Analysis" button is clearly labeled with the customer-facing product name (see Part 4)

**Performance Audit**
- Profile `getBlueprintAudit()` against a 25-exercise blueprint — confirm < 500ms
- Profile `getProgramAudit()` against a 12-week, 5-blueprint program — confirm < 3 seconds
- Identify any N+1 queries introduced accidentally in 1B–1D and resolve

**Internal Documentation**
- `lib/pil/README.md` — one-page guide explaining the module registration pattern, how to add a Phase 2 module, and what the EnrichedBlueprint type contract guarantees
- This is the document that prevents Phase 2 modules from being built outside the PIL architecture (doctrine P-9)

**Definition of Done**
- [ ] All 15 seeded exercises have: exercise_muscles rows, fatigueCost, jointStressSpine, jointStressKnee
- [ ] A blueprint containing Back Squat, Romanian Deadlift, Bench Press, Barbell Row, and Overhead Press produces non-trivial Volume, Movement, and Joint Stress findings
- [ ] Volume coverage ≥ 85% for the seeded library
- [ ] All PIL panels have error boundaries — a thrown exception inside any analysis module shows a graceful fallback, not a crash
- [ ] `lib/pil/README.md` exists and accurately documents the module registration pattern

---

## Part 2 — Week-by-Week Build Order

This sequence is optimized for long-term architecture, not implementation speed. Each decision is explained below.

---

### Week 1 — Milestone 1A: Foundation

**Days 1–2: Define and review the PIL type system**
Write `lib/pil/types.ts`. Do not touch the enrichment query or any module yet. Review and approve the types before any other file is written.

Why first: Every decision made after this point builds on the type contract. An `EnrichedBlueprint` type that is wrong forces changes to every module written against it. The cost of getting this right in week 1 is one day of careful type design. The cost of getting it wrong is a cascade refactor during week 3.

What later modules depend on it: Every module in the entire PIL system — M00 through M32 — is typed against `EnrichedBlueprint` and `PilFinding`.

Coach-visible value unlocked: None yet. This is foundation work.

**Days 3–5: Enrichment service and workout-validator.ts refactor**
Write `getBlueprintEnriched()`. Refactor `workout-validator.ts` to call `validatePrescriptions()` internally. Write tests for both.

Why now, not later: The workout-validator.ts refactor is the riskiest change in all of Phase 1 — it touches existing behavior that affects Blueprint publishing. Do it in week 1 when there are no new analysis modules depending on it. A refactor done in week 4, after three analysis modules are shipping to coaches, is a four-times harder refactor under time pressure.

What later modules depend on it: All analysis modules in 1B–1D are pure functions that receive `EnrichedBlueprint` — the work done here is their data foundation.

Coach-visible value unlocked: None from the refactor itself. Existing Blueprint validation continues to work, but now from a single source of truth.

---

### Week 2 — Milestone 1B: Volume, Fatigue, Movement, and the First Coach UI

**Days 6–8: Volume, Fatigue, Movement analysis modules**
Write all three modules as pure functions, with unit tests, before touching the UI. The modules are the most intellectually important part of 1B — get them right first.

Why this order: The UI is easier to design and review once you can see real output. Writing the UI against mock data introduces assumptions about what the data will look like; writing it against real module output reveals the edge cases.

What later modules depend on it: M03 (Volume) feeds M09 (Muscle Balance), M16 (Frequency), M18 (Volume Progression) — all Phase 2. Getting M03's output type right now means Phase 2 modules can be added without modifying M03.

**Days 9–10: Blueprint audit API and first coach-visible UI**
Write `getBlueprintAudit()`, the API route, and the `BlueprintAuditPanel`. Wire to the HQ Blueprint detail page. Ship to staging.

Coach-visible value unlocked: The first version of Program Intelligence is live. A coach can open a Blueprint in HQ and see how many direct sets each muscle receives, whether the push/pull balance is flagged, and what the estimated fatigue profile looks like. This is the first meaningful differentiation milestone.

---

### Week 3 — Milestones 1C and the start of 1D

**Days 11–13: Joint Stress, Redundancy, Duration**
Three relatively simple modules, but joint stress is the most differentiating addition in week 3.

Why before program-level analysis: The Blueprint-level analysis surface should be complete before adding program-level analysis. A coach who clicks on a Blueprint audit should see the full picture of that session. If joint stress is missing from Blueprint audit while program analysis is already available, the Blueprint audit feels incomplete.

What later modules depend on it: M06 (Joint Stress) data is reused by M23 (Contraindication Analysis) in Phase 2 to assess which exercises to flag for specific injuries. The output shape established here is that Phase 2 input.

Coach-visible value unlocked: Joint stress analysis is now visible. The combination of volume + movement + joint stress in one panel gives an experienced coach everything they need to evaluate a session's physical demand profile.

**Days 14–15: Program structure validation and begin frequency module**
Write `validateProgramStructure()` and begin `analyzeFrequency()`. Program structure validation is small and should not take more than a day.

Why program structure before frequency: Frequency analysis aggregates across multiple blueprints in a week. If the program structure has errors (week gaps, archived blueprint references), frequency analysis should not run on a structurally invalid program. Build the gating module first.

Coach-visible value unlocked: Program structural errors are now surfaced. If a coach has a week 3 missing from their program, they see it explicitly.

---

### Week 4 — Milestone 1D Complete and Milestone 1E

**Days 16–20: Frequency, Recovery, Program Audit, Substitution, Per-Muscle Weekly Brief**
This is the highest-complexity week. The Per-Muscle Weekly Brief aggregation is the most complex computation in Phase 1 — allocate time accordingly.

Why the Per-Muscle Weekly Brief is worth this complexity: This is the demo moment. When this table renders correctly — showing muscle groups, direct and indirect sets across the week, and recovery gaps — the differentiation claim is proven. Everything in weeks 1–3 was foundational infrastructure. Week 4 is the payoff.

What later modules depend on it: M16 (Frequency) feeds M17 (Recovery Spacing), M18 (Volume Progression across weeks), and M25 (Goal Alignment). M17 feeds every recovery finding in Phase 2. The aggregation pattern established in `getProgramAudit()` is reused for the entire Phase 2 program analysis layer.

Coach-visible value unlocked: The Per-Muscle Weekly Brief is now visible on any Program in HQ. Program Frequency and Recovery findings are live. The Substitution Service is available in the Blueprint Editor.

**Days 21–25: Milestone 1E — Knowledge completion and polish**
Populate exercise library scoring data. Audit the UI. Run performance profiling. Write `lib/pil/README.md`.

Why this is the final milestone and not an ongoing activity: A Knowledge Completion Sprint done in the middle of analysis module development will reveal gaps in the module specifications (e.g., you start populating fatigueCost and realize the scale needs adjustment). Doing it after all modules are written means the scoring populates against a stable analysis system that can verify the data immediately.

Coach-visible value unlocked: The existing analysis panels become meaningfully more complete. What was "Volume coverage: 40%" becomes "Volume coverage: 85%." The findings that were incomplete become real findings. The product moves from "shows promise" to "immediately useful."

---

## Part 3 — MVP Definition

The Minimum Viable Programming Intelligence Engine is:

**Modules included**
- M00 — Blueprint Enrichment
- M01 — Prescription Validity (replaces workout-validator.ts internals)
- M02 — Completeness Assessment (always alongside volume analysis)
- M03 — Volume Analysis
- M05 — Movement Pattern Analysis
- M16 — Frequency Analysis
- M17 — Recovery Spacing Analysis
- M31 — Blueprint Quality Summary (partial — volume, movement, recovery dimensions only)

**UI included**
- `MuscleSetsTable` (per-muscle direct/indirect sets per session)
- `PerMuscleWeeklyBrief` (the hero table)
- `MovementPatternChart` (push/pull balance)
- `PilFindingCard` (for the findings above)
- `DataQualityBanner` (completeness disclosure)

**Explicitly excluded from MVP**
- M04 (Fatigue) — valuable but not the differentiation anchor; ships in full 1B alongside volume
- M06 (Joint Stress) — differentiated depth, not differentiation hook; ships in 1C
- M07 (Redundancy), M08 (Duration) — informational; 1C
- M15 (Program Structure Validation) — operational, not differentiating; 1D
- M30 (Substitution Service) — useful but not what makes coaches say "nothing else does this"; 1D

**Why this is the MVP and not less**

The core question is: "If Catalyst shipped only this subset, would experienced coaches immediately recognize this platform as fundamentally different?"

The answer is yes, for one specific reason: the Per-Muscle Weekly Brief.

No experienced coach has ever opened a coaching platform and seen this table generated automatically. The per-muscle direct and indirect set breakdown, aggregated across sessions in a week, with the quad:hamstring ratio and the 0-day glute recovery gap flagged without the coach calculating anything — that is the moment. M03 + M16 + M17 produce it. M05 (push/pull balance) adds the second finding that experienced coaches immediately recognize as real coaching knowledge.

M04, M06, M07, M08 are depth. Depth is important, but it is not what creates the differentiation recognition moment. They make the product better — they do not change the category.

The MVP produces the differentiation recognition moment. Everything else in Phase 1 extends it.

---

## Part 4 — Product Naming

### Evaluation of Candidates

| Candidate | Memorable | Professional | Coach Familiar | Scalable | Marketing | Grows Beyond Programming |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Catalyst Insights | Low | Medium | Low | Medium | Low | Medium |
| Catalyst Audit | Medium | Medium | Medium | Medium | Medium | Low |
| Program Audit | Medium | High | High | Low | Medium | No |
| Blueprint Audit | Medium | High | High | Low | Medium | No |
| Programming Audit | Low | Medium | Medium | Low | Low | No |
| Coach Insights | Low | Medium | Low | Medium | Medium | High |
| Training Insights | Low | Medium | Medium | Medium | Low | Medium |
| **Program Intelligence** | **Medium** | **High** | **High** | **High** | **High** | **High** |
| Blueprint Insights | Medium | Medium | Medium | Low | Medium | Low |

**Notes on individual candidates:**

**Catalyst Insights / Coach Insights / Training Insights / Blueprint Insights** — "Insights" is the most overused word in SaaS product naming. Salesforce Insights, HubSpot Insights, Fitbod Insights. It communicates nothing specific and carries no premium. Coaches will not remember that Catalyst has "Insights" — every platform has insights.

**Program Audit / Blueprint Audit / Catalyst Audit** — "Audit" carries compliance and tax connotations for most people. In sports science circles, a "training audit" is legitimate — experienced coaches use it. But the word's primary cultural association is the IRS, not performance. The activation cost is high: coaches have to override their first instinct before the word lands correctly.

**Blueprint Insights / Program Insights** — same "Insights" problem, more specific domain. Still forgettable.

**Programming Audit** — awkward phrasing. "Programming" as a gerund in product naming does not work.

**Program Intelligence** — the strongest candidate on the provided list. "Program" is the noun coaches use daily. "Intelligence" implies smart analysis without promising or implying AI. Together: your program, with intelligence applied. The phrase has precedent in adjacent domains (Competitive Intelligence, Business Intelligence) and coaches understand the noun form. It is not overselling (not "Program Genius" or "AI Coach") and not underselling (not "Program Check").

### My Recommendation: **Program Intelligence**

From the provided list, **Program Intelligence** is the correct choice and does not need to be replaced.

The recommendation comes with one architectural addition: as Catalyst adds Nutrition, Recovery, and Check-In analysis modules in the future, they should be named consistently: **Nutrition Intelligence**, **Recovery Intelligence**, **Check-In Intelligence**. The platform-level product family becomes **Catalyst Intelligence** — each domain is a module within it.

This naming system is clean, scalable, and consistent. A coach who uses Program Intelligence for six months will immediately understand what "Nutrition Intelligence" does when it appears on their sidebar. The naming teaches the product architecture.

**The button label:** "Program Intelligence" — used as both the feature name and the CTA. No verb needed. Coaches click "Program Intelligence" the same way they click "Calendar" or "Library." It is a destination, not an action.

**The panel header:** "Program Intelligence" when on a Program page; "Blueprint Intelligence" when contextually scoped to a single session. The parent name is the umbrella — the child context clarifies scope.

**What coaches say to each other:** "Have you run Program Intelligence on that block?" — natural, professional, memorable.

---

## Part 5 — UI Vision

### The Experience

A coach clicks "Program Intelligence" on a program page in HQ. A full-width panel slides up from the bottom of the Program view, or expands inline below the program calendar — it does not navigate away. The program itself remains visible above, because the coach will want to reference it while reading the analysis.

The panel has a fixed header and scrollable body.

---

### What the Coach Sees First

**Fixed header row (always visible, never scrolls away):**
```
Program Intelligence          [Last analyzed: just now]    [Re-analyze]

Volume: OK  ·  Movement: CAUTION  ·  Joint Stress: HIGH  ·  Recovery: OK  ·  Structure: OK
```

The dimensional status row is the first thing a coach reads. Six dimensions, each one to three words. The color treatment is restrained: HIGH is orange, CAUTION is yellow, OK is an uncolored neutral text. No green checkmarks — green implies celebration, and analysis results should feel clinical, not congratulatory.

The status row answers "is anything seriously wrong?" in under three seconds. That is its only job.

---

### Visual Hierarchy

**Level 1 — Always visible above the fold:**
1. Dimensional status row (header, pinned)
2. Per-Muscle Weekly Brief table — this is always open, never collapsed
3. Top 2 findings (highest severity), each as a finding card with title and one-line explanation

**Level 2 — Below the fold, visible by scrolling:**
4. Remaining findings, grouped by dimension: Movement, Joint Stress, Recovery, Volume, Structure
5. Within each dimension group, findings are ordered: error → warning → caution → info
6. Each finding card is expandable to show evidence

**Level 3 — Bottom of panel:**
7. Data Quality section — completeness coverage percentages, non-judgmental
8. "This analysis covers X of Y exercises fully" — the explanation lives here, not inline with real findings

---

### Per-Muscle Weekly Brief — the hero table

The table is always open. It is never collapsible. It is the reason the coach opened this panel.

```
Muscle Group          Direct Sets/Wk    Indirect Sets/Wk    Training Days    Shortest Rest
────────────────────────────────────────────────────────────────────────────────────────────
Quadriceps            28                12                  4                1 day
Hamstrings            9                 18                  2                3 days
Glutes                15                22                  4                ⚠ 0 days
Chest                 18                4                   2                3 days
Rear Deltoid          4                 10                  2                3 days
Lats                  21                6                   3                1 day
────────────────────────────────────────────────────────────────────────────────────────────
Quad : Hamstring (direct)   3.1:1 ⚠
```

Design details:
- The table has no outer border and no shadow. It reads like a spreadsheet, not a widget.
- The "⚠ 0 days" in Shortest Rest is the only cell that uses color (orange background, not red — this is a warning, not an error, at the table level; the error-level finding card surfaces below)
- The ratio annotation below the table appears only when a meaningful ratio disparity exists (>2.5:1 for major muscle pairs)
- Muscle groups with incomplete data (no exercise_muscles rows for some contributing exercises) show their counts in muted text with a small superscript "~" indicating partial count

---

### Finding Cards

Each finding card has:
- Left border color: red (error) / orange (warning) / yellow (caution) / none (info)
- Title: direct, coaching-voice — "Horizontal push/pull ratio is 4:1" not "MOVEMENT_PUSH_PULL_H detected"
- One-line explanation: always visible without expanding — "High horizontal push volume relative to pulling movements is associated with cumulative shoulder joint stress over time."
- Expandable "Evidence" section: bullet list of contributing exercises with specific numbers
- Confidence treatment (in expanded view only, not in the title): for heuristic findings, a single sentence — "This is a guideline, not a rule. Your coaching judgment applies."
- Suggested action (if present): a text link at the bottom of the card — "Find a horizontal pull substitute →" — which opens the SubstitutionDrawer

What gets a chart:
- **Movement pattern distribution** — horizontal stacked bar showing proportion of sets per pattern. Proportional charts are more intuitive than raw numbers here because the insight is "too much of one pattern relative to others."
- **Joint stress by joint** — vertical bars, one per joint, colored by severity. Clicking a bar expands a list of contributing exercises.

What does not get a chart:
- Volume (the table is better), fatigue total (a number is better), recovery spacing (the table row annotation is sufficient).

---

### How Incomplete Data and Confidence Are Communicated

**Rule:** Real findings and data quality issues are never in the same visual zone.

Incomplete data lives at the bottom of the panel, in the Data Quality section. It reads:
```
Data Quality
Volume coverage: 83%  ·  Fatigue coverage: 53%  ·  Joint Stress coverage: 71%
4 exercises lack muscle group data — volume totals are approximate for those exercises.
Add fatigue cost scores to your exercise library to improve fatigue coverage.
```

This section is visually distinct from findings: smaller text, a subtle grey background, no left border. It is informational, not alarming.

Confidence treatment on finding cards:
- `certain`: no annotation. The finding stands alone.
- `heuristic`: in the expanded evidence section, a single sentence in muted text: "This threshold reflects general training guidelines — coaches with specific programming rationale may disagree."
- `incomplete_data` findings: these are borderline cases. If a finding fires despite incomplete data (e.g., joint stress is partially populated and a moderate finding fires), the card renders muted with a note: "Based on partial data — results may change as exercise library scoring improves." These never appear with error or warning severity.

---

### What Summarized vs. Detailed Means

**Summarized (always visible):**
- Dimensional status row
- Per-Muscle Weekly Brief
- Finding card titles and one-line explanations

**Detailed (on expand):**
- Evidence bullet list (which exercises, which numbers, which thresholds)
- Confidence explanation
- Suggested actions

The design principle: a coach reviewing 20 blueprints in a session can scan the summary row and the hero table for each one in under 10 seconds. They expand evidence only when a finding surprises them or when they want to confirm it before acting.

---

## Part 6 — Future Vision

### Two-Year Projection

In two years, Catalyst has:
- Program Intelligence (the system built in Phase 1)
- Nutrition Intelligence (macros, meal timing, caloric targets vs. goals)
- Recovery Intelligence (sleep, HRV proxies, soreness patterns from check-ins)
- Check-In Intelligence (sentiment trend, compliance pattern, coach response latency)
- AI synthesis layer

### Does "Program Intelligence" still make sense?

Yes. The naming system designed here scales directly: Program Intelligence, Nutrition Intelligence, Recovery Intelligence, Check-In Intelligence. Each is a module in the Catalyst Intelligence platform. The umbrella becomes **Catalyst Intelligence** — four lenses applied to one client.

The naming choice is not just correct for now. It is the correct decision for the eventual navigation structure:

```
Catalyst HQ
├── Clients
│   └── [Client Name]
│       ├── Overview              ← AI synthesis across all Intelligence modules
│       ├── Program Intelligence  ← today's system
│       ├── Nutrition Intelligence
│       ├── Recovery Intelligence
│       └── Check-In Intelligence
├── Programs
└── Exercise Library
```

### Will the architecture scale?

Yes — with one explicit preparation required before the second domain ships.

The PIL finding shape (`PilFinding` with typed `code`, `severity`, `confidence`, `evidence[]`) is machine-readable. When the AI synthesis layer arrives, it will consume findings from all four domains and produce a unified client health assessment: "Program load is high, recovery indicators are declining, and this client's check-in sentiment has dropped for three consecutive weeks. These three signals are not independent."

That synthesis is only possible if findings from all domains share a compatible type. The type designed today is that type. Do not change the `PilFinding` shape in Phase 2 without considering the cross-domain synthesis that will consume it.

**The one explicit preparation:** Before Nutrition Intelligence ships, define a `CatalystIntelligence` aggregation surface — a type and service that reads findings from multiple domains for a client and exposes them to the AI synthesizer. This surface does not need to do anything sophisticated in its first version. It needs to exist, so that Nutrition Intelligence findings are designed with cross-domain consumption in mind from the start.

### Will coaches experience these as separate tools or one unified system?

Both, and that is correct.

At the domain level, coaches experience separate tools. When a coach reviews a program, they use Program Intelligence on that program. When they review nutrition data, they use Nutrition Intelligence on that data. Domain-specific analysis is contextual — it lives where the data lives.

At the client level, coaches experience one unified system. The Client Overview page synthesizes signals from all four domains into a single assessment. The coach opens a client record and sees: "Three Intelligence signals are flagging this client — see overview." One click reveals the cross-domain picture.

The product hierarchy is:
- Unified at the client level (AI synthesis produces one coherent picture)
- Separated at the domain level (each intelligence module lives in its domain context)

This is not a design compromise. It is the correct design: coaches think in domains when building programs and reviewing check-ins, and think in clients when making coaching decisions. The product should mirror how coaches actually think.

### Challenge to current direction

One risk deserves explicit naming: **the analysis surface without the action surface**.

Program Intelligence produces findings. Coaches see findings. Coaches must then act — modify a blueprint, swap an exercise, adjust program volume. In Phase 1, the only action surface is the Substitution Service (M30) triggered from a finding card. Every other finding requires the coach to manually navigate to the Blueprint Editor, manually find the exercise, and manually make the change.

By Phase 2, findings should be actionable within the analysis panel. Not automated — the coach still approves every change (Doctrine P-1). But a finding card's "suggested action" should be clickable in a way that opens the relevant editing surface in context, pre-populated with the suggestion.

If this action-from-finding pattern is not designed before Phase 2 begins, every Phase 2 analysis module will independently decide how to handle suggested actions — and the result will be an inconsistent UX where some findings are actionable and others require the coach to navigate away and figure out what to do.

**Recommendation:** In Phase 2, before adding any new analysis modules, add an action bridge between finding cards and the editing surfaces (Blueprint Editor, Program Builder). The finding's `suggestedActions` type (already designed with this in mind) is the contract. The action bridge is the implementation.

---

## Final Recommendation

### Are we ready to begin implementation?

Yes. The architectural design phase is complete. The type contracts are specified, the module boundaries are defined, the phase assignments are decided, and the tradeoffs are documented. The design has passed the point of diminishing returns. Implementation is the right next step.

Three conditions must be met before writing the first module:

1. **`lib/pil/types.ts` is reviewed and approved before any other PIL file is written.** The type contract is load-bearing. Every module, test, and API route depends on it. One day of careful type review is worth two weeks of cascade refactoring.

2. **The `workout-validator.ts` refactor is scoped into Milestone 1A, not deferred.** This is the change most likely to create a regression in existing behavior. Do it when only one module exists (M01 validity) and the test surface is small.

3. **The Knowledge Completion Sprint is explicitly scheduled between 1A completion and 1B launch.** The analysis modules in 1B are pointless without adequate Exercise Library scoring. Launching Program Intelligence with 30% fatigue coverage is worse than not launching — it signals to coaches that the data is thin.

---

### What is the first GitHub issue?

**PIL-1A-01: Define PIL type system**
`lib/pil/types.ts` — all shared types for the Programming Intelligence Layer.
Scope: PilFinding, PilSeverity, PilConfidence, PilEvidenceFact, PilAffectedEntity, PilSuggestedAction, EnrichedBlueprint, EnrichedPrescription, EnrichedExercise, EnrichedSection, ValidationResult.
Acceptance: `npx tsc --noEmit` clean; types reviewed and approved; no implementation code.
Labels: `pil`, `foundation`, `milestone-1A`

This is the first issue because it has no predecessors and every subsequent issue depends on it.

---

### What should be built first?

The types. Not the queries. Not the modules. Not the UI.

Write `lib/pil/types.ts`. Stop. Read it. Review it against the catalog. Ask whether a Phase 2 module would break the type if added. Ask whether the `EnrichedBlueprint` shape can accommodate client context in Phase 2 without a breaking change. Ask whether `PilFinding.suggestedActions` is rich enough for Phase 3 AI consumption.

If the answers are yes: approve the types and write the enrichment query.

If the answers reveal gaps: fix them now, not during week 3 under time pressure.

---

### What should intentionally wait?

In order of most important to defer:

1. **M04 (Fatigue Analysis)** — ships in full Phase 1B, not MVP. The MVP produces the differentiation moment without it.
2. **M10 (Biomechanical Profile)** — defer to Phase 3. Library data is not ready. Science is not stable enough for heuristic thresholds.
3. **M20 (Periodization Analysis)** — defer indefinitely. Coaches know their own periodization model.
4. **M22 (Blueprint Diversity Analysis)** — remove. The assumption behind it (variety is good) is too broad to be defensible.
5. **M25 (Goal Alignment Analysis)** — defer until periodization phase context is solved. Currently produces false positives on intentional strength phases for non-strength clients.
6. **M35 (Client Progress Prediction)** — remove permanently. Any point prediction will erode trust when wrong.
7. **AI synthesis layer** — Phase 3. Not because AI is unimportant but because the deterministic layer must be complete and battle-tested before AI consumers are built on top of it.

---

### What risks still concern you?

**Risk 1: Exercise Library scoring completeness.**
This is the highest-likelihood risk. The analysis is only as good as the data behind it. If Phase 1B launches with 30% fatigue cost coverage and 50% muscle data coverage, coaches will correctly conclude the tool is not useful yet. The Knowledge Completion Sprint must be treated as a launch-blocking dependency of Milestone 1B, not as a follow-up task.

**Risk 2: The workout-validator.ts refactor causes a regression.**
The existing validator gates Blueprint publishing. A regression here means coaches cannot publish programs. The test coverage on the refactored validator must be comprehensive before 1A closes.

**Risk 3: Finding code instability across versions.**
Finding codes are string constants: `VOLUME_HIGH_DIRECT`, `RECOVERY_SAME_DAY`. If a code is renamed or a threshold is adjusted in Phase 2, any Phase 1 finding dismissal or annotation stored against the old code becomes orphaned. This is not a Phase 1 problem — it becomes a Phase 2 problem. It needs a decision before Phase 2 begins, not a patch after. Recommendation: treat finding codes as database enum values — add new ones freely, deprecate old ones explicitly, never silently rename.

**Risk 4: Scope creep within the 30-day window.**
The PIL architecture is intellectually rich. There will be moments during Phase 1B or 1C when adding a Phase 2 module feels easy. Resist. The discipline that matters here is not technical — it is product. The 30-day scope is defined precisely. Every module added before the foundation is battle-tested is a module that may need to be rebuilt when Phase 1E reveals performance or data quality issues.

**Risk 5: The action gap — findings without action surfaces.**
Program Intelligence will produce findings. In Phase 1, coaches read findings and manually navigate to act on them. This is acceptable for Phase 1 and immediately recognizable as something to fix in Phase 2. The risk is that if this is not explicitly scoped into Phase 2 planning, it becomes permanently deferred. Every phase that ships analysis without action surfaces trains coaches to treat the intelligence as informational rather than operational. Plan the action bridge before Phase 2 begins.

---

### If you were acting as Principal Engineer on Catalyst, would you approve implementation today? Why or why not?

**Yes — with the type review as a precondition.**

The design is complete. The tradeoffs are documented. The scope is bounded. The module boundaries are clean. The finding shape is typed and machine-readable for Phase 3 AI consumption. The phasing prevents premature complexity. The MVP is correctly defined.

What earns the approval:

The design has been genuinely honest about its limitations — the injuries-contraindications bridge, the equipment access gap, the finding code stability problem, the action-surface gap — rather than optimistic about them. An architecture document that surfaces its own risks is more trustworthy than one that presents only the happy path.

The type contract is load-bearing and is being treated as such — reviewed and approved before any query or module is written. Most PIL-scale systems get into trouble when analysis modules are written before the shared types are stable. This design does not make that mistake.

The Knowledge Completion Sprint is acknowledged as a first-class dependency rather than a background activity. Analysis software built on incomplete data teaches coaches not to trust the analysis. The sprint is placed correctly: between 1A (which reveals what data is needed) and 1B (which needs that data to produce meaningful output).

The condition that stays: do not write the first enrichment query until `lib/pil/types.ts` is reviewed and signed off. Not for bureaucratic reasons. Because the cost of reviewing types before writing code is a few hours, and the cost of refactoring types after three analysis modules are built against them is several days under pressure.

Build the types. Approve them. Then build the engine.

---

## Document History

| Date | Change |
|---|---|
| 2026-07-28 | Initial version — full Phase 1 roadmap, week-by-week build order, MVP definition, product naming, UI vision, future vision, final recommendation |
