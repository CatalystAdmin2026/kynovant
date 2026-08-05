// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Draft Edit Operations
//
// SERVER-ONLY. Pure functions over an in-memory GeneratedProgramDraft —
// no DB access. Every operation returns a brand-new draft object (never
// mutates its input) plus a before/after snapshot of just the changed
// slice, for program_generation_edit_events. Callers (actions.ts) are
// responsible for re-validating the resulting draft against
// GeneratedProgramDraftSchema before persisting it — these functions
// only rearrange/patch already-valid structure, they don't independently
// re-check every invariant themselves.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { normalizeExerciseName } from "./exercise-resolution";
import type { GeneratedProgramDraft, PrescriptionEditPatch } from "./contracts";

export type EditOpResult =
  | { ok: true; draft: GeneratedProgramDraft; before: unknown; after: unknown }
  | { ok: false; error: string };

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findSection(draft: GeneratedProgramDraft, dayId: string, sectionId: string) {
  for (const week of draft.weeks) {
    for (const day of week.days) {
      if (day.id !== dayId || !day.workout) continue;
      const section = day.workout.sections.find((s) => s.id === sectionId);
      if (section) return { week, day, section };
    }
  }
  return null;
}

export function updatePrescription(
  draft: GeneratedProgramDraft,
  params: { dayId: string; sectionId: string; prescriptionId: string; patch: PrescriptionEditPatch },
): EditOpResult {
  const next = deepClone(draft);
  const located = findSection(next, params.dayId, params.sectionId);
  if (!located) return { ok: false, error: "Section not found in draft." };
  const idx = located.section.prescriptions.findIndex((p) => p.id === params.prescriptionId);
  if (idx === -1) return { ok: false, error: "Prescription not found in draft." };

  const before = deepClone(located.section.prescriptions[idx]);
  located.section.prescriptions[idx] = { ...located.section.prescriptions[idx], ...params.patch };
  return { ok: true, draft: next, before, after: located.section.prescriptions[idx] };
}

export function replaceExercise(
  draft: GeneratedProgramDraft,
  params: { dayId: string; sectionId: string; prescriptionId: string; exerciseId: string; exerciseName: string },
): EditOpResult {
  const next = deepClone(draft);
  const located = findSection(next, params.dayId, params.sectionId);
  if (!located) return { ok: false, error: "Section not found in draft." };
  const idx = located.section.prescriptions.findIndex((p) => p.id === params.prescriptionId);
  if (idx === -1) return { ok: false, error: "Prescription not found in draft." };

  const before = deepClone(located.section.prescriptions[idx]);
  located.section.prescriptions[idx] = {
    ...located.section.prescriptions[idx],
    exerciseId: params.exerciseId,
    exerciseName: params.exerciseName,
    // Clears any stale ambiguous/unresolved resolution record — the
    // coach has now manually supplied a real id, which is a stronger
    // signal than anything exercise-resolution.ts could have produced.
    exerciseResolution: undefined,
  };
  return { ok: true, draft: next, before, after: located.section.prescriptions[idx] };
}

// Bulk equivalent of replaceExercise() — walks the ENTIRE draft and
// replaces every prescription whose exerciseId is still null AND whose
// exerciseName normalizes to the given name (exercise-resolution.ts's
// own normalizeExerciseName, so this matches exactly the set of
// prescriptions that resolver treated as "the same unresolved name").
// Only ever touches exerciseId/exerciseName/exerciseResolution — every
// other field (sets/reps/rest/tempo/orderIndex/groupId/...) is left
// untouched, which is what "preserves placement" means here: a
// prescription's position in its section, and every prescribed
// parameter, survives a bulk replace exactly as-is.
//
// Deliberately narrower than "every prescription named X" — a
// prescription the coach already resolved (exerciseId set, whether by
// the original resolver or a prior manual Replace Exercise) is never
// touched by this, even if its exerciseName text happens to match. That
// would silently overwrite a coach's own prior decision, which this
// feature must never do.
export function replaceExerciseByName(
  draft: GeneratedProgramDraft,
  params: { normalizedName: string; exerciseId: string; exerciseName: string },
): EditOpResult {
  const next = deepClone(draft);
  const affected: { prescriptionId: string; previousExerciseName: string }[] = [];

  for (const week of next.weeks) {
    for (const day of week.days) {
      if (!day.workout) continue;
      for (const section of day.workout.sections) {
        for (const prescription of section.prescriptions) {
          if (
            prescription.exerciseId === null &&
            normalizeExerciseName(prescription.exerciseName) === params.normalizedName
          ) {
            affected.push({ prescriptionId: prescription.id, previousExerciseName: prescription.exerciseName });
            prescription.exerciseId = params.exerciseId;
            prescription.exerciseName = params.exerciseName;
            prescription.exerciseResolution = undefined;
          }
        }
      }
    }
  }

  if (affected.length === 0) {
    return {
      ok: false,
      error: `No unresolved prescriptions currently match "${params.normalizedName}" — they may have already been replaced.`,
    };
  }

  return {
    ok: true,
    draft: next,
    before: { normalizedName: params.normalizedName, affected },
    after: {
      normalizedName: params.normalizedName,
      exerciseId: params.exerciseId,
      exerciseName: params.exerciseName,
      replacedCount: affected.length,
      replacedPrescriptionIds: affected.map((a) => a.prescriptionId),
    },
  };
}

// Reorders a section's prescriptions to match the given id order exactly
// and reassigns orderIndex 0..n-1 accordingly. The caller must supply
// every prescription id currently in the section — a partial list is
// rejected rather than guessed at.
export function reorderExercises(
  draft: GeneratedProgramDraft,
  params: { dayId: string; sectionId: string; orderedPrescriptionIds: string[] },
): EditOpResult {
  const next = deepClone(draft);
  const located = findSection(next, params.dayId, params.sectionId);
  if (!located) return { ok: false, error: "Section not found in draft." };

  const before = deepClone(located.section.prescriptions);
  const byId = new Map(located.section.prescriptions.map((p) => [p.id, p]));

  const sameSet =
    params.orderedPrescriptionIds.length === located.section.prescriptions.length &&
    params.orderedPrescriptionIds.every((id) => byId.has(id));
  if (!sameSet) {
    return {
      ok: false,
      error: "Reorder list must contain exactly the section's current prescriptions, no more or fewer.",
    };
  }

  located.section.prescriptions = params.orderedPrescriptionIds.map((id, i) => ({
    ...byId.get(id)!,
    orderIndex: i,
  }));

  return { ok: true, draft: next, before, after: located.section.prescriptions };
}

// Moves a day to a different dayOfWeek within the same week. If another
// day already occupies the target slot, the two days swap dayOfWeek
// values (both stay in the draft — nothing is dropped), which keeps the
// "unique dayOfWeek per week" invariant trivially satisfied without
// needing a separate conflict-resolution step.
export function moveWorkoutDay(
  draft: GeneratedProgramDraft,
  params: { weekId: string; dayId: string; newDayOfWeek: number },
): EditOpResult {
  const next = deepClone(draft);
  const week = next.weeks.find((w) => w.id === params.weekId);
  if (!week) return { ok: false, error: "Week not found in draft." };
  const day = week.days.find((d) => d.id === params.dayId);
  if (!day) return { ok: false, error: "Day not found in draft." };

  const before = { dayId: day.id, dayOfWeek: day.dayOfWeek };

  if (day.dayOfWeek !== params.newDayOfWeek) {
    const conflict = week.days.find((d) => d.id !== day.id && d.dayOfWeek === params.newDayOfWeek);
    if (conflict) conflict.dayOfWeek = day.dayOfWeek;
    day.dayOfWeek = params.newDayOfWeek;
  }

  return { ok: true, draft: next, before, after: { dayId: day.id, dayOfWeek: day.dayOfWeek } };
}
