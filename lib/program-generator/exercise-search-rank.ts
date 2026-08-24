// ─────────────────────────────────────────────────────────────
// rankExerciseNameMatch — pure relevance ranking for the Draft Review
// exercise-replacement search picker.
//
// Lives here (not inlined in app/hq/programs/generate/actions.ts) for
// two reasons: it's pure logic with zero dependency on Next.js/"use
// server", matching this repo's convention that actions.ts stays a
// thin wrapper around real logic in lib/; and every test file in this
// repo lives under lib/**/__tests__/ (see vitest.config.ts's `include`
// — app/ is never scanned), so this needed a lib/ home to get any test
// coverage at all.
//
// searchReplacementExercisesAction (app/hq/programs/generate/actions.ts)
// is the only caller: it runs searchExercises() (existing, unmodified,
// already tenant-scoped, already full-text-matched via the exercises
// table's generated tsvector column — see
// drizzle/0014_exercise_search_vector_alternate_names.sql) and then
// re-sorts that already-small, already-relevant result set in memory
// using this function. No new search infrastructure, no extra queries.
//
// Deliberately narrow, matching the task's own "ship the straightforward
// picker, don't redesign exercise-selection intelligence" scope: exact
// name match, then name prefix, then alias/alternate-name match (data
// already present on every returned row), then "contains," then
// everything else — i.e. whatever searchExercises's own order already
// produced (alphabetical), preserved as the stable tiebreak within this
// last bucket via Array.prototype.sort's stability.
//
// Expects an already-lowercased `query` — the one caller lowercases
// once up front and reuses that value for every row, rather than this
// function re-lowercasing per call per row.
// ─────────────────────────────────────────────────────────────

export function rankExerciseNameMatch(exercise: { name: string; alternateNames: string[] }, query: string): number {
  const lowerName = exercise.name.toLowerCase();
  if (lowerName === query) return 0;
  if (lowerName.startsWith(query)) return 1;
  if (exercise.alternateNames.some((alt) => alt.toLowerCase().includes(query))) return 2;
  if (lowerName.includes(query)) return 3;
  return 4;
}
