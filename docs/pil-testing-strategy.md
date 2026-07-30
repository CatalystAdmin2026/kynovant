# PIL Testing Strategy

**Scope:** All analysis modules in `lib/pil/` (M00–M35).
**Framework:** Vitest (Node environment). Tests live in `lib/pil/__tests__/`.

---

## 1. Architecture Contract Every Module Must Honor

Every analysis module is a **pure function**: it receives `EnrichedBlueprint` (or a sub-type of it) and returns findings. It never reads from the database, never has side effects, and never generates UUIDs that affect test assertions. This purity is what makes the tests fast, deterministic, and exhaustive.

`getBlueprintEnriched` is the only function allowed to touch the database. It is tested only through integration tests (out of scope for this document). Everything downstream is unit-tested against the assembled `EnrichedBlueprint` object.

---

## 2. File and Naming Conventions

| Artifact | Convention |
|---|---|
| Test file | `lib/pil/__tests__/<module-slug>.test.ts` |
| Helper file | `lib/pil/__tests__/helpers.ts` (shared across all modules) |
| Setup file | `lib/pil/__tests__/setup.ts` (mocks `server-only`) |

### `describe` blocks

Each `describe` block names one **finding code** or one logical concern:

```
describe("validatePrescriptions — VALIDITY_REPS_INVERTED", () => { ... })
describe("assessVolume — VOLUME_MUSCLE_UNDERTRAINED", () => { ... })
describe("assessVolume — clean blueprint", () => { ... })
```

The pattern is `<functionName> — <FINDING_CODE_OR_CONCERN>`.

### `it` descriptions

Write the `it` string as a declarative sentence stating the expected behavior, not the mechanism:

```
✓  "errors when repsMin > repsMax"
✓  "does not fire when repsMin === repsMax (equal is valid)"
✗  "tests the reps check"
✗  "works correctly"
```

---

## 3. Test Helpers

All tests share the factory functions in `helpers.ts`. The pattern is:

```typescript
makeExercise(overrides?)     → EnrichedExercise
makeSection(overrides?)      → EnrichedSection
makePrescription(overrides?) → EnrichedPrescription
makeBlueprint(overrides?)    → EnrichedBlueprint
```

**Rule:** helpers return safe, valid defaults. A test overrides only the fields relevant to the case under test. This makes the intent of each test immediately readable.

When a new module introduces a new sub-type or supporting object (e.g., `EnrichedMuscleWeek` for volume analysis), add a factory for it in `helpers.ts` — never define it inline in the test file.

When a factory grows large, prefer **named presets** over large inline overrides:

```typescript
// Good
const archivedExercise = makeExercise({ status: "archived" });

// Avoid
const p = makePrescription({ exercise: makeExercise({ status: "archived", movementPattern: "pull_vertical", ... }) });
```

---

## 4. Coverage Requirements by Category

### 4.1 Happy Path

Every module must have a **clean blueprint test** — a blueprint with no violations that returns `valid: true` and zero findings:

```typescript
it("returns valid=true with no findings for a well-formed blueprint", () => {
  const result = runModule(makeBlueprint());
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
  expect(result.warnings).toHaveLength(0);
});
```

This test is the regression anchor. If it starts failing, the module is emitting false positives.

### 4.2 Boundary Coverage

For every numeric threshold, test both sides of the boundary **and the boundary itself**:

| Boundary | Tests required |
|---|---|
| `targetRpe > 10` (error) | `targetRpe = 10` (no error), `targetRpe = 10.1` (error) |
| `repsMin > repsMax` (error) | `repsMin = repsMax` (no error), `repsMin = repsMax + 1` (error) |
| `groupSize < 2` (error) | `size = 1` (error), `size = 2` (no error) |

Write separate `it` blocks for each case. Never combine "fires" and "does not fire" into a single test.

For **heuristic thresholds** (confidence = `heuristic`), document the threshold value in a comment above the test. These thresholds are more likely to change than deterministic ones.

### 4.3 Malformed Data (Multi-Violation)

Each module must include at least one test that constructs a blueprint with **multiple simultaneous violations** and asserts that all finding codes appear in the output:

```typescript
it("reports all violations in a single pass", () => {
  const result = runModule(/* blueprint with 3 known violations */);
  const codes = result.errors.map((f) => f.code);
  expect(codes).toContain("MODULE_CODE_A");
  expect(codes).toContain("MODULE_CODE_B");
  expect(codes).toContain("MODULE_CODE_C");
});
```

This test catches early-return bugs where a check aborts the run after the first violation.

### 4.4 Missing Metadata (Incomplete Exercise Data)

Analysis modules often require exercise attributes (muscle data, movement pattern, joint stress scores) that may be absent. For each attribute a module reads, include a test for the `null` case:

```typescript
it("does not fire when primaryMuscleGroup is null", () => { ... });
it("does not fire when muscle records are empty", () => { ... });
```

When an attribute is null, a module has two valid choices: skip the check (no finding) or emit a finding with `confidence: "incomplete_data"`. The choice must be documented in the module's source comment and tested.

### 4.5 Confidence and `incomplete_data`

Findings have three confidence values:

| Value | Meaning | Test requirement |
|---|---|---|
| `"certain"` | Deterministic — fires whenever condition is true | Test both trigger and non-trigger |
| `"heuristic"` | Probabilistic — model-based threshold | Test trigger, non-trigger, and boundary. Document threshold. |
| `"incomplete_data"` | Fired because required data is absent | Test that the finding fires when the specific attribute is null/missing, and does NOT fire when the attribute is present. |

An `incomplete_data` finding is informational, not an error. It tells the coach that the analysis could not run, not that the blueprint is wrong. Always assert the correct severity (`"caution"` or `"info"`) in these tests.

```typescript
it("emits incomplete_data caution when fatigueCost is null", () => {
  const p = makePrescription({ exercise: makeExercise({ fatigueCost: null }) });
  const result = runModule(makeBlueprint({ prescriptions: [p] }));
  const finding = result.warnings.find((f) => f.code === "VOLUME_FATIGUE_INCOMPLETE");
  expect(finding?.confidence).toBe("incomplete_data");
  expect(finding?.severity).toBe("caution");
});
```

---

## 5. Finding Code Stability

**Finding codes are stable identity keys.** Once a code ships to a coach-visible surface, it must never be renamed. Tests assert on codes explicitly — this is intentional. A test that breaks because a code was renamed is doing its job.

When you need to split a finding into two distinct cases, add a new code (`CATEGORY_RULE_CASE_A`, `CATEGORY_RULE_CASE_B`) rather than changing the existing one. The old tests for the old code become regression tests for the non-split case.

If a code is deprecated (the check is removed), mark it in the catalog and leave the test file with a `skip` comment explaining when it was retired and why. Never delete a test for a code that was once live.

---

## 6. What Tests Assert (and What They Don't)

### Always assert

- `finding.code` — the stable identity of the finding
- `result.valid` — the pass/fail gate
- `result.errors.length` / `result.warnings.length` — prevents ghost findings
- `finding.confidence` and `finding.severity` — for `heuristic` and `incomplete_data` cases

### Assert when it matters

- `finding.affectedEntities` — when the test verifies that the finding points at the right exercise or muscle, not just that it fires
- `finding.evidence` — when a module is expected to populate specific evidence facts (e.g., actual vs. recommended volume)

### Do not assert

- `finding.id` — run-scoped UUID, different every run
- `finding.explanation` prose — wording changes are not regressions
- `finding.title` — same as explanation; content over presentation

---

## 7. Regression Testing Philosophy

The PIL test suite is a **behavioral contract**, not a code coverage report.

A test should answer: *given this exact blueprint state, does this module produce the correct findings?* If the answer changes, it is either a bug or a deliberate behavior change that must be reviewed.

**When to add a test:**
- Any new finding code introduced in a module requires at minimum: trigger test, non-trigger test, boundary test (if numeric), multi-violation test update.
- Any bug reported in production requires a test that reproduces the bug first, then is fixed by the correction.

**When to update a test:**
- A threshold changes (heuristic refinement). Update the boundary test and document the old value and the reason for the change in a comment.
- A finding is promoted from `heuristic` to `certain` after enough data confirms the rule. Update confidence assertions.

**When to never modify a test:**
- A finding code is renamed. Do not rename the test — instead, add the new code's tests alongside the old skip-annotated ones.
- Explanation prose changes. Tests do not assert on prose.

---

## 8. Running Tests

```bash
npm test           # single run (CI mode)
npm run test:watch # watch mode (development)
```

All tests must pass before a milestone is marked complete. A milestone is not complete if `npx tsc --noEmit` has errors, even if tests pass.
