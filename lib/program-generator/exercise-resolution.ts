// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Exercise Name Resolution
//
// SERVER-ONLY. The ONLY place a model-supplied exercise name is ever
// turned into a real Exercise Library id. Nothing upstream (prompt.ts,
// provider.ts) ever asks the model for an id — see contracts.ts's
// Model*Schema tree, which has no exerciseId field at all. Nothing
// downstream (validation.ts, edit-ops.ts, approval.ts) ever invents
// one either. This is the single seam.
//
// Locked rules #4/#5 ("use only existing canonical Exercise Library
// IDs", "never invent exercise IDs") are enforced here structurally:
// a name either resolves to exactly one real, active exercise, or it
// doesn't — there is no fallback that fabricates an id, and the nil
// UUID (00000000-0000-0000-0000-000000000000) is never written
// anywhere in this file.
//
// Matching tiers, in order — each tier is skipped only if the
// previous tier found nothing; each tier independently refuses to
// silently pick a winner among multiple matches:
//   a. exact canonical-name match (case/whitespace-insensitive)
//   b. exact alternate-name match (same normalization)
//   c. one unambiguous result from the existing full-text search
//      (lib/db/exercise-service.ts's searchExercises, tsvector-backed)
//
// Query-count characteristics (requirement: no N+1 per prescription):
//   - Every name is normalized and deduplicated FIRST (see
//     resolveExerciseNames). A draft with 150 prescriptions but 22
//     distinct exercise names only ever resolves 22 names.
//   - Tiers a+b run as ONE combined query, scoped to exactly the
//     deduplicated requested names (not the whole catalog) via a
//     parameterized IN list.
//   - Tier c runs at most once per name that didn't match in tiers
//     a/b — bounded by the (typically small) residual, never by
//     prescription count.
//   - Total: 1 + |names unmatched after tiers a/b| queries, not
//     O(prescriptions) and not O(unique names) in the common case.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { exercises } from "@/lib/db/schema-exercise";
import { searchExercises } from "@/lib/db/exercise-service";
import type {
  ExerciseResolutionCandidate,
  ExerciseResolutionOutcome,
  GeneratedProgramDraft,
  GeneratedPrescriptionDraft,
  ModelPrescription,
  ModelProgramDraft,
} from "./contracts";

const MAX_CANDIDATES = 5;

export interface ExerciseResolution {
  outcome: ExerciseResolutionOutcome;
  /** The original, as-generated text this resolution was computed for. */
  requestedName: string;
  /** Real Exercise Library id — set only for exact/alternate_name/strong_match. */
  exerciseId: string | null;
  /** Canonical library name — set only alongside exerciseId. */
  exerciseName: string | null;
  /** Populated for "ambiguous"; empty for every other outcome. */
  candidates: ExerciseResolutionCandidate[];
}

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeCandidatesById(rows: { id: string; name: string }[]): ExerciseResolutionCandidate[] {
  const byId = new Map<string, ExerciseResolutionCandidate>();
  for (const row of rows) byId.set(row.id, { id: row.id, name: row.name });
  return [...byId.values()];
}

// Resolves a batch of raw, model-generated exercise names against the
// real, active Exercise Library. Returns a map keyed by NORMALIZED name
// (see normalizeExerciseName) — callers look up a prescription's
// resolution via the normalized form of its own exerciseName, which is
// how the same result is transparently reused for every repeat of the
// same exercise across the whole draft (requirement: resolve each
// unique name only once).
export async function resolveExerciseNames(
  rawNames: string[],
): Promise<Map<string, ExerciseResolution>> {
  const results = new Map<string, ExerciseResolution>();

  const firstSeenByNormalized = new Map<string, string>();
  for (const raw of rawNames) {
    const normalized = normalizeExerciseName(raw);
    if (normalized && !firstSeenByNormalized.has(normalized)) {
      firstSeenByNormalized.set(normalized, raw);
    }
  }
  const uniqueNormalized = [...firstSeenByNormalized.keys()];
  if (uniqueNormalized.length === 0) return results;

  // ── Tiers a + b: one query, scoped to exactly the requested names.
  //
  // The IN-list for the alternate-name EXISTS subquery is built with
  // sql.join() so every value becomes its own bound parameter — never
  // a single interpolated array literal. Drizzle's `sql` tag does NOT
  // serialize an interpolated JS array as a Postgres array literal the
  // way postgres.js's own tag does; `= ANY(${array}::type[])` binds a
  // malformed parameter and fails on every call (see the muscleGroups
  // filter comment in lib/db/exercise-service.ts for the same pitfall
  // hit and fixed there previously). inArray() below is exempt from
  // this — it's Drizzle's own array-safe helper, already used
  // extensively elsewhere in this codebase (e.g. validation.ts).
  const alternateNameInList = sql.join(
    uniqueNormalized.map((n) => sql`${n}`),
    sql`, `,
  );

  const candidateRows = await getDb()
    .select({
      id: exercises.id,
      name: exercises.name,
      alternateNames: exercises.alternateNames,
    })
    .from(exercises)
    .where(
      and(
        eq(exercises.status, "active"),
        or(
          inArray(sql`lower(${exercises.name})`, uniqueNormalized),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${exercises.alternateNames}) AS elem
            WHERE lower(elem) IN (${alternateNameInList})
          )`,
        ),
      ),
    );

  const exactByNormalized = new Map<string, { id: string; name: string }[]>();
  const alternateByNormalized = new Map<string, { id: string; name: string }[]>();

  for (const row of candidateRows) {
    const normalizedCanonical = normalizeExerciseName(row.name);
    if (firstSeenByNormalized.has(normalizedCanonical)) {
      const list = exactByNormalized.get(normalizedCanonical) ?? [];
      list.push({ id: row.id, name: row.name });
      exactByNormalized.set(normalizedCanonical, list);
    }

    const altNames = Array.isArray(row.alternateNames) ? (row.alternateNames as unknown[]) : [];
    for (const alt of altNames) {
      if (typeof alt !== "string") continue;
      const normalizedAlt = normalizeExerciseName(alt);
      if (firstSeenByNormalized.has(normalizedAlt)) {
        const list = alternateByNormalized.get(normalizedAlt) ?? [];
        list.push({ id: row.id, name: row.name });
        alternateByNormalized.set(normalizedAlt, list);
      }
    }
  }

  const needsSearchTier: string[] = [];

  for (const normalized of uniqueNormalized) {
    const requestedName = firstSeenByNormalized.get(normalized)!;

    const exactMatches = dedupeCandidatesById(exactByNormalized.get(normalized) ?? []);
    if (exactMatches.length === 1) {
      results.set(normalized, {
        outcome: "exact",
        requestedName,
        exerciseId: exactMatches[0].id,
        exerciseName: exactMatches[0].name,
        candidates: [],
      });
      continue;
    }
    if (exactMatches.length > 1) {
      results.set(normalized, {
        outcome: "ambiguous",
        requestedName,
        exerciseId: null,
        exerciseName: null,
        candidates: exactMatches.slice(0, MAX_CANDIDATES),
      });
      continue;
    }

    const alternateMatches = dedupeCandidatesById(alternateByNormalized.get(normalized) ?? []);
    if (alternateMatches.length === 1) {
      results.set(normalized, {
        outcome: "alternate_name",
        requestedName,
        exerciseId: alternateMatches[0].id,
        exerciseName: alternateMatches[0].name,
        candidates: [],
      });
      continue;
    }
    if (alternateMatches.length > 1) {
      results.set(normalized, {
        outcome: "ambiguous",
        requestedName,
        exerciseId: null,
        exerciseName: null,
        candidates: alternateMatches.slice(0, MAX_CANDIDATES),
      });
      continue;
    }

    needsSearchTier.push(normalized);
  }

  // ── Tier c: existing full-text search, only for names tiers a/b
  // couldn't place — bounded by the residual, not by prescription count.
  for (const normalized of needsSearchTier) {
    const requestedName = firstSeenByNormalized.get(normalized)!;
    const searchResults = await searchExercises({
      name: requestedName,
      statuses: ["active"],
      limit: MAX_CANDIDATES,
    });

    if (searchResults.length === 1) {
      results.set(normalized, {
        outcome: "strong_match",
        requestedName,
        exerciseId: searchResults[0].id,
        exerciseName: searchResults[0].name,
        candidates: [],
      });
    } else if (searchResults.length === 0) {
      results.set(normalized, {
        outcome: "unresolved",
        requestedName,
        exerciseId: null,
        exerciseName: null,
        candidates: [],
      });
    } else {
      results.set(normalized, {
        outcome: "ambiguous",
        requestedName,
        exerciseId: null,
        exerciseName: null,
        candidates: searchResults.slice(0, MAX_CANDIDATES).map((r) => ({ id: r.id, name: r.name })),
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// DRAFT-LEVEL COMPOSITION — the orchestration/action layer's single
// entry point. Walks a ModelProgramDraft (whatever the provider just
// produced — full generation or regenerate-day, both use the same
// Model*Schema shape and the same function here), resolves every
// exercise name exactly once regardless of how many times it repeats
// across weeks/days, and returns the fully-typed GeneratedProgramDraft
// that validation.ts/edit-ops.ts/approval.ts already expect.
//
// A resolution that isn't exact/alternate_name/strong_match leaves
// exerciseId null and attaches the outcome + candidates so
// validation.ts can turn it into an actionable, approval-blocking
// finding (PROGRAM_GEN_EXERCISE_AMBIGUOUS / PROGRAM_GEN_EXERCISE_UNRESOLVED)
// — the coach resolves it with the existing Replace Exercise edit
// action, which always writes a real id.
// ─────────────────────────────────────────────────────────────

export async function resolveProgramDraftExercises(
  modelDraft: ModelProgramDraft,
): Promise<GeneratedProgramDraft> {
  const allNames: string[] = [];
  for (const week of modelDraft.weeks) {
    for (const day of week.days) {
      if (!day.workout) continue;
      for (const section of day.workout.sections) {
        for (const prescription of section.prescriptions) {
          allNames.push(prescription.exerciseName);
        }
      }
    }
  }

  const resolutions = await resolveExerciseNames(allNames);

  function resolvePrescription(p: ModelPrescription): GeneratedPrescriptionDraft {
    const resolution = resolutions.get(normalizeExerciseName(p.exerciseName));
    // Every name pushed into allNames above was included in the
    // resolveExerciseNames() call, so every normalized name has an
    // entry — this branch only satisfies TypeScript's Map.get() typing.
    if (!resolution) {
      return {
        ...p,
        exerciseId: null,
        exerciseResolution: { outcome: "unresolved", candidates: [] },
      };
    }

    if (resolution.exerciseId && resolution.exerciseName) {
      return {
        ...p,
        exerciseId: resolution.exerciseId,
        // Canonical library name replaces the model's echo once resolved
        // — keeps the review UI's displayed name consistent with the
        // real exercise the id now points to.
        exerciseName: resolution.exerciseName,
        exerciseResolution: { outcome: resolution.outcome, candidates: [] },
      };
    }

    return {
      ...p,
      exerciseId: null,
      // Ambiguous/unresolved: preserve exactly what the model generated
      // — there is no canonical answer yet for the coach to see instead.
      exerciseName: p.exerciseName,
      exerciseResolution: { outcome: resolution.outcome, candidates: resolution.candidates },
    };
  }

  return {
    ...modelDraft,
    weeks: modelDraft.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        workout: day.workout
          ? {
              ...day.workout,
              sections: day.workout.sections.map((section) => ({
                ...section,
                prescriptions: section.prescriptions.map(resolvePrescription),
              })),
            }
          : null,
      })),
    })),
  };
}
