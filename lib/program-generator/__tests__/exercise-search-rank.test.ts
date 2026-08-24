// ─────────────────────────────────────────────────────────────
// rankExerciseNameMatch — pure ranking used by
// searchReplacementExercisesAction (Draft Review exercise search &
// replacement UX).
//
// searchReplacementExercisesAction itself can't be invoked directly in
// Vitest — it's a "use server" action that starts with
// loadEditableDraft -> requireOwnedDraft -> requireCoachOrAdmin(),
// which needs a real Next.js request context (cookies()). That same
// constraint is documented at lib/db/__tests__/
// program-generator-review-triage.test.ts's "Replace All Occurrences —
// ownership and validity gates" describe block, which tests the
// underlying gates directly instead of the action wrapper. This file
// follows the same approach for the one genuinely new piece of logic
// the search action adds on top of the already-tested searchExercises()
// query: the in-memory relevance ranking. DB-backed search behavior
// itself (exact/prefix/alias/case-insensitive/no-results, tenant
// isolation, system visibility) is covered separately in
// lib/db/__tests__/program-generator-review-triage.test.ts, against a
// real database.
//
// rankExerciseNameMatch expects an already-lowercased query (its one
// caller lowercases once up front, then reuses that value for every
// row) — these tests call it the same way.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { rankExerciseNameMatch } from "../exercise-search-rank";

describe("rankExerciseNameMatch", () => {
  it("ranks an exact name match highest (tier 0)", () => {
    const exercise = { name: "Back Squat", alternateNames: [] };
    expect(rankExerciseNameMatch(exercise, "back squat")).toBe(0);
  });

  it("ranks a name-prefix match above alias/contains (tier 1)", () => {
    const exercise = { name: "Back Squat Variant", alternateNames: [] };
    expect(rankExerciseNameMatch(exercise, "back squat")).toBe(1);
  });

  it("ranks an alias/alternate-name match above a plain contains match (tier 2)", () => {
    // Query doesn't appear in the name at all, only in an alternate name
    // — proves alias search is ranked distinctly from a name substring.
    const exercise = { name: "Barbell Deadlift", alternateNames: ["Conventional Pull"] };
    expect(rankExerciseNameMatch(exercise, "conventional")).toBe(2);
  });

  it("ranks a mid-name contains match below prefix and alias (tier 3)", () => {
    const exercise = { name: "Seated Cable Row", alternateNames: [] };
    expect(rankExerciseNameMatch(exercise, "cable")).toBe(3);
  });

  it("falls back to the lowest tier when the query matches neither name nor alias directly", () => {
    // Represents a row that only matched via full-text search on notes
    // or Postgres stemming — searchExercises() already found it
    // relevant; this tier just sorts it after every literal match.
    const exercise = { name: "Romanian Deadlift", alternateNames: ["RDL"] };
    expect(rankExerciseNameMatch(exercise, "hamstring")).toBe(4);
  });

  it("is case-insensitive on the exercise name (assuming an already-lowercased query, matching production usage)", () => {
    const exercise = { name: "Front Squat", alternateNames: [] };
    expect(rankExerciseNameMatch(exercise, "front squat")).toBe(0);
  });

  it("is case-insensitive on alternate names", () => {
    const exercise = { name: "Hip Thrust", alternateNames: ["Glute Bridge Press"] };
    expect(rankExerciseNameMatch(exercise, "glute bridge")).toBe(2);
  });

  it("sorting by rank produces exact -> prefix -> alias -> contains -> fallback order", () => {
    const query = "press";
    const rows = [
      { name: "Overhead Barbell Press Variant", alternateNames: [] }, // contains (3)
      { name: "Press", alternateNames: [] }, // exact (0)
      { name: "Press Variation A", alternateNames: [] }, // prefix (1)
      { name: "Chest Fly", alternateNames: ["Press Alternative"] }, // alias (2)
      { name: "Landmine Rotation", alternateNames: [] }, // fallback (4) — only reachable via searchExercises's own text match in real usage
    ];
    const sorted = [...rows].sort((a, b) => rankExerciseNameMatch(a, query) - rankExerciseNameMatch(b, query));
    expect(sorted.map((r) => r.name)).toEqual([
      "Press",
      "Press Variation A",
      "Chest Fly",
      "Overhead Barbell Press Variant",
      "Landmine Rotation",
    ]);
  });
});
