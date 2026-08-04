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
  };
  return { ok: true, draft: next, before, after: located.section.prescriptions[idx] };
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
