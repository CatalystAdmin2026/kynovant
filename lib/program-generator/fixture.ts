// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Development Fixture
//
// SERVER-ONLY. Only reachable when PROGRAM_GENERATOR_USE_FIXTURE=true
// (see provider.ts) — never a silent fallback for a missing/failing
// real provider.
//
// This is deliberately NOT a static object with hand-typed exercise
// UUIDs. A static fixture with invented IDs would violate locked rule
// #4/#5 ("use only existing canonical Exercise Library IDs"). Instead,
// this queries whatever active exercises actually exist in the current
// database and assembles a small, valid two-day draft from their real
// canonical names.
//
// Returns a ModelProgramDraft (name only, no exerciseId) — exactly the
// same contract the real provider returns — so the fixture exercises
// the full generate → resolve → validate → Insights → approve pipeline,
// including exercise-resolution.ts, rather than bypassing it. Using
// each exercise's own real `name` (not a paraphrase) means resolution
// deterministically hits the "exact" tier, which is what makes this
// fixture a reliable, fast, offline stand-in for local dev and tests.
//
// If the seeded library doesn't have enough active exercises to build a
// minimally sane draft, this fails safely (returns null) rather than
// fabricating anything.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "crypto";
import { searchExercises, type ExerciseListRow } from "@/lib/db/exercise-service";
import {
  ModelProgramDraftSchema,
  type ModelProgramDraft,
  type ModelBlueprint,
  type ModelPrescription,
} from "./contracts";

const MIN_EXERCISES_REQUIRED = 4;

function buildPrescription(row: ExerciseListRow, orderIndex: number): ModelPrescription {
  return {
    id: randomUUID(),
    exerciseName: row.name,
    orderIndex,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
    setTechnique: "straight_set",
    isRequired: true,
  };
}

function buildBlueprint(label: string, rows: ExerciseListRow[]): ModelBlueprint {
  return {
    id: randomUUID(),
    name: `${label} — Fixture Session`,
    primaryFocus: label,
    sections: [
      {
        id: randomUUID(),
        name: "Main Work",
        sectionType: "main_lift",
        orderIndex: 0,
        prescriptions: rows.map((row, i) => buildPrescription(row, i)),
      },
    ],
  };
}

// Queries real, currently-active exercises and assembles a two-day,
// one-week model-output draft from their real names. Returns null
// (never throws, never fabricates) if the seeded library can't support
// a minimal draft.
export async function buildFixtureProgramDraft(): Promise<ModelProgramDraft | null> {
  const active = await searchExercises({ statuses: ["active"], limit: 20 });
  if (active.length < MIN_EXERCISES_REQUIRED) return null;

  const half = Math.min(4, Math.floor(active.length / 2));
  const dayARows = active.slice(0, half);
  const dayBRows = active.slice(half, half + Math.min(4, active.length - half));
  if (dayARows.length < 2 || dayBRows.length < 2) return null;

  const candidate: ModelProgramDraft = {
    name: "Fixture Program Draft",
    description: "Development fixture draft generated from real seeded Exercise Library rows.",
    category: "muscle_growth",
    experienceLevel: "intermediate",
    defaultDurationWeeks: 1,
    recommendedDaysPerWeek: 2,
    weeks: [
      {
        id: randomUUID(),
        weekNumber: 1,
        days: [
          { id: randomUUID(), dayOfWeek: 1, label: "Day A", workout: buildBlueprint("Day A", dayARows) },
          { id: randomUUID(), dayOfWeek: 4, label: "Day B", workout: buildBlueprint("Day B", dayBRows) },
        ],
      },
    ],
  };

  const parsed = ModelProgramDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
