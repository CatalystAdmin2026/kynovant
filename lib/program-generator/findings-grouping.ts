// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Findings Grouping
//
// SERVER-ONLY-safe (no DB access, no "server-only" import needed — pure
// in-memory transformation, importable from a Server Component). Turns
// the flat DraftValidationResult (raw findings, one per week/day/
// prescription occurrence) into a coach-facing grouped hierarchy: the
// same unresolved exercise name or the same PIL finding code+entity
// repeated across 8 weeks becomes ONE group with 8 occurrences, not 8
// separate rows.
//
// Deterministic and memoization-safe: same (insights, draft) input
// always produces the same output, no randomness, no I/O. Called once
// per page render server-side (app/hq/programs/generate/[draftId]/
// page.tsx) — grouping never issues a request per finding, and raw
// findings are never duplicated in storage to support it; this reads
// the same insightsJson/draftJson already fetched for the page.
//
// Group key derivation (groupKeyForFinding), in priority order:
//   1. Unresolved/ambiguous/equipment-mismatch exercise NAME findings
//      have no stable exerciseId yet — grouped by normalized name
//      (exercise-resolution.ts's own normalizeExerciseName, so this
//      exactly matches how the resolver itself already deduplicates
//      repeated names across the whole draft).
//   2. A finding with a real exerciseId (not-found, excluded) groups by
//      that id — repeats of the same excluded/missing exercise collapse
//      together regardless of which week/day/section referenced it.
//   3. A PIL-sourced finding (volume/fatigue/redundancy/joint-stress)
//      groups by code + its non-locational affected entities (muscle/
//      joint/exercise — excluding day/week/section, which vary by
//      occurrence and are exactly what "occurrences" is for). This is
//      what keeps "high shoulder load" and "high knee load" as separate
//      groups under the same finding code, per PilFinding's own
//      documented stable-identity contract (code, not the run-scoped id).
//   4. Everything else (program-structural findings with no specific
//      entity) groups by code alone.
// ─────────────────────────────────────────────────────────────

import { normalizeExerciseName } from "./exercise-resolution";
import type { GeneratedProgramDraft, ExerciseResolutionCandidate } from "./contracts";
import type { DraftValidationResult, ValidationFinding, ValidationFindingSeverity } from "./validation";

export function groupKeyForFinding(f: ValidationFinding): string {
  if (f.exerciseName && f.exerciseId == null) {
    return `${f.code}:name:${normalizeExerciseName(f.exerciseName)}`;
  }
  if (f.exerciseId) {
    return `${f.code}:exercise:${f.exerciseId}`;
  }
  if (f.affectedEntities && f.affectedEntities.length > 0) {
    const nonLocational = f.affectedEntities
      .filter((e) => e.type !== "day" && e.type !== "week" && e.type !== "section")
      .map((e) => `${e.type}:${e.id}`)
      .sort();
    if (nonLocational.length > 0) {
      return `${f.code}:${nonLocational.join(",")}`;
    }
  }
  return f.code;
}

/** Occurrence-level acknowledgement key — see acknowledgeFindingKeys()
 *  in lib/db/program-generation-service.ts. Ephemeral by design: finding
 *  ids are randomUUID() per validation run, which is fine because
 *  acknowledgedFindingKeys is cleared on every revalidation anyway. */
export function occurrenceAckKey(findingId: string): string {
  return `finding:${findingId}`;
}

export function groupAckKey(groupKey: string): string {
  return `group:${groupKey}`;
}

// ─────────────────────────────────────────────────────────────
// OUTPUT SHAPE
// ─────────────────────────────────────────────────────────────

export interface FindingOccurrence {
  findingId: string;
  weekNumber: number | null;
  weekLabel: string | null;
  /** The workout/blueprint name for this day, or "Rest Day" when the
   *  finding's dayId resolves to a day with no assigned workout, or
   *  null when the finding carries no day locator at all (program-
   *  level structural findings). */
  dayLabel: string | null;
  weekId?: string;
  dayId?: string;
  blueprintId?: string;
  sectionId?: string;
  prescriptionId?: string;
  exerciseId?: string;
}

export interface FindingGroup {
  groupKey: string;
  code: string;
  severity: ValidationFindingSeverity;
  title: string;
  /** Representative explanation — the first occurrence's. Occurrences
   *  sharing a group key always share the same code and (for exercise-
   *  name groups) the same name, so the explanation text is materially
   *  identical modulo which week/day it names. */
  explanation: string;
  exerciseName: string | null;
  candidates: ExerciseResolutionCandidate[];
  occurrences: FindingOccurrence[];
  occurrenceCount: number;
  /** True for the two codes Replace All Occurrences can act on — an
   *  unresolved or ambiguous exercise name with no exerciseId yet. */
  isReplaceableExerciseGroup: boolean;
}

export interface FindingsHierarchy {
  blockers: FindingGroup[];
  warnings: FindingGroup[];
  info: FindingGroup[];
}

export interface ReviewSummary {
  unresolvedExerciseNameCount: number;
  ambiguousExerciseNameCount: number;
  /** Unique prescriptionIds referenced by any blocker or warning. */
  totalAffectedPrescriptions: number;
  /** Blocker groups with no specific exercise reference — hard
   *  exclusions aside, these are structural (all-rest weeks, count
   *  mismatches promoted to blockers, etc.) rather than exercise-level. */
  blockingStructuralIssueCount: number;
  warningCategoryCount: number;
  approvalPossible: boolean;
}

export interface GroupedDraftFindings {
  hierarchy: FindingsHierarchy;
  summary: ReviewSummary;
}

const REPLACEABLE_CODES = new Set(["PROGRAM_GEN_EXERCISE_AMBIGUOUS", "PROGRAM_GEN_EXERCISE_UNRESOLVED"]);

// ─────────────────────────────────────────────────────────────
// DRAFT LOCATION INDEX — resolves a finding's weekId/dayId to
// human-readable labels without re-walking the draft tree per finding.
// ─────────────────────────────────────────────────────────────

interface LocationInfo {
  weekNumber: number;
  weekLabel: string | null;
  dayLabel: string | null;
}

function buildLocationIndex(draft: GeneratedProgramDraft | null): Map<string, LocationInfo> {
  const index = new Map<string, LocationInfo>();
  if (!draft) return index;

  for (const week of draft.weeks) {
    for (const day of week.days) {
      const dayLabel = day.workout ? day.workout.name : (day.label ?? "Rest Day");
      index.set(day.id, {
        weekNumber: week.weekNumber,
        weekLabel: week.label ?? null,
        dayLabel,
      });
    }
  }
  return index;
}

function buildOccurrence(f: ValidationFinding, locations: Map<string, LocationInfo>): FindingOccurrence {
  const loc = f.dayId ? locations.get(f.dayId) : undefined;
  return {
    findingId: f.id,
    weekNumber: loc?.weekNumber ?? null,
    weekLabel: loc?.weekLabel ?? null,
    dayLabel: loc?.dayLabel ?? null,
    weekId: f.weekId,
    dayId: f.dayId,
    blueprintId: f.blueprintId,
    sectionId: f.sectionId,
    prescriptionId: f.prescriptionId,
    exerciseId: f.exerciseId,
  };
}

function groupFindingList(
  findings: ValidationFinding[],
  locations: Map<string, LocationInfo>,
): FindingGroup[] {
  const byKey = new Map<string, FindingGroup>();

  for (const f of findings) {
    const key = groupKeyForFinding(f);
    const occurrence = buildOccurrence(f, locations);

    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences.push(occurrence);
      existing.occurrenceCount++;
      continue;
    }

    byKey.set(key, {
      groupKey: key,
      code: f.code,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      exerciseName: f.exerciseName ?? null,
      candidates: f.candidates ?? [],
      occurrences: [occurrence],
      occurrenceCount: 1,
      isReplaceableExerciseGroup: REPLACEABLE_CODES.has(f.code),
    });
  }

  // Stable, coach-useful order: most-repeated issue first, ties broken
  // by title so the same input always renders the same order.
  return [...byKey.values()].sort(
    (a, b) => b.occurrenceCount - a.occurrenceCount || a.title.localeCompare(b.title),
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export function groupDraftFindings(
  insights: DraftValidationResult | null,
  draft: GeneratedProgramDraft | null,
): GroupedDraftFindings {
  if (!insights) {
    return {
      hierarchy: { blockers: [], warnings: [], info: [] },
      summary: {
        unresolvedExerciseNameCount: 0,
        ambiguousExerciseNameCount: 0,
        totalAffectedPrescriptions: 0,
        blockingStructuralIssueCount: 0,
        warningCategoryCount: 0,
        approvalPossible: false,
      },
    };
  }

  const locations = buildLocationIndex(draft);
  const blockers = groupFindingList(insights.blockers, locations);
  const warnings = groupFindingList(insights.warnings, locations);
  const info = groupFindingList(insights.info, locations);

  const unresolvedNames = new Set(
    insights.blockers
      .filter((f) => f.code === "PROGRAM_GEN_EXERCISE_UNRESOLVED" && f.exerciseName)
      .map((f) => normalizeExerciseName(f.exerciseName!)),
  );
  const ambiguousNames = new Set(
    insights.blockers
      .filter((f) => f.code === "PROGRAM_GEN_EXERCISE_AMBIGUOUS" && f.exerciseName)
      .map((f) => normalizeExerciseName(f.exerciseName!)),
  );

  const affectedPrescriptionIds = new Set(
    [...insights.blockers, ...insights.warnings]
      .map((f) => f.prescriptionId)
      .filter((id): id is string => id != null),
  );

  const blockingStructuralIssueCount = blockers.filter((g) => !g.exerciseName).length;

  return {
    hierarchy: { blockers, warnings, info },
    summary: {
      unresolvedExerciseNameCount: unresolvedNames.size,
      ambiguousExerciseNameCount: ambiguousNames.size,
      totalAffectedPrescriptions: affectedPrescriptionIds.size,
      blockingStructuralIssueCount,
      warningCategoryCount: warnings.length,
      approvalPossible: insights.blockers.length === 0,
    },
  };
}
