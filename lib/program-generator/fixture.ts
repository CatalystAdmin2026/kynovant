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
import { searchExercises } from "@/lib/db/exercise-service";
import type { ExerciseCandidate } from "./exercise-candidates";
import {
  ModelProgramDraftSchema,
  ModelWeekDraftSchema,
  ModelDayDraftSchema,
  type ModelProgramDraft,
  type ModelWeekDraft,
  type ModelDayDraft,
  type ModelBlueprint,
  type ModelPrescription,
  type ProgramShell,
  type ProgramShellDay,
  type ProgramShellPhase,
  type ProgramGenerationBrief,
} from "./contracts";

const MIN_EXERCISES_REQUIRED = 4;

// Minimal shape shared by ExerciseListRow (the unscoped searchExercises()
// fallback below) and ExerciseCandidate (the tenant-scoped, brief-aware
// candidate set staged generation actually computes) — buildPrescription
// only ever needs id/name, so either can drive it.
type FixtureSourceRow = { id: string; name: string };

function buildPrescription(row: FixtureSourceRow, orderIndex: number): ModelPrescription {
  return {
    id: randomUUID(),
    // Populated from the same real row the fixture already queried —
    // simulates a model that correctly followed the catalog-selection
    // instructions (see exercise-candidates.ts). Verification against
    // the actual computed candidate set for a given brief may still
    // reject this id (e.g. if the fixture's arbitrary row selection
    // fell outside that brief's equipment/difficulty filters), in which
    // case it's stripped and falls back to name resolution exactly as
    // it always has — both are legitimate, exercised paths.
    exerciseId: row.id,
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

function buildBlueprint(label: string, rows: FixtureSourceRow[]): ModelBlueprint {
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

// Prefers the tenant-scoped, brief-aware candidate set staged generation
// already computed (see exercise-candidates.ts) over an unscoped active-
// exercise query — this simulates "a model that correctly followed the
// catalog-selection instructions" and keeps dev-fixture output subject to
// the same tenant-visibility rules the real provider is constrained by,
// rather than fixture mode being a silent backdoor around them. Falls
// back to querying active exercises directly only when no usable
// candidate set is supplied (legacy call sites / tests exercising the
// name-resolver fallback path in isolation, where scope is irrelevant).
async function resolveFixtureSourceRows(
  candidates: ExerciseCandidate[],
  limit: number,
): Promise<FixtureSourceRow[]> {
  if (candidates.length >= MIN_EXERCISES_REQUIRED) return candidates.slice(0, limit);
  return searchExercises({ statuses: ["active"], limit });
}

// Assembles a two-day, one-week model-output draft from real exercise
// rows. Returns null (never throws, never fabricates) if the seeded
// library can't support a minimal draft.
export async function buildFixtureProgramDraft(candidates: ExerciseCandidate[] = []): Promise<ModelProgramDraft | null> {
  const active = await resolveFixtureSourceRows(candidates, 20);
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

// ─────────────────────────────────────────────────────────────
// STAGED FIXTURE — mirrors the real staged provider (generateProgramShell
// + generateProgramWeek, one call per week) rather than the single-shot
// path above, so tests and local dev exercise the actual staged
// orchestration (shell → N week calls → assembly → resolve → validate),
// not a shortcut around it. buildFixtureProgramShell is synchronous and
// deterministic (no exercise content, nothing to query); each week is
// built from the same real, active exercise rows the single-shot fixture
// uses, applied across every day in that week's fixed split.
// ─────────────────────────────────────────────────────────────

export function buildFixtureProgramShell(brief: ProgramGenerationBrief): ProgramShell {
  const dayOfWeekPool = [1, 2, 3, 4, 5, 6, 0];
  const days: ProgramShellDay[] = dayOfWeekPool.slice(0, brief.daysPerWeek).map((dayOfWeek, i) => ({
    dayOfWeek,
    label: `Day ${i + 1}`,
    focus: "Full Body",
  }));

  const phases: ProgramShellPhase[] =
    brief.weeks >= 4
      ? [
          {
            phaseNumber: 1,
            name: "Fixture Accumulation",
            weekStart: 1,
            weekEnd: brief.weeks - 1,
            progressionTarget: "Fixture phase — no real progression logic, deterministic output only.",
            isDeload: false,
          },
          {
            phaseNumber: 2,
            name: "Fixture Deload",
            weekStart: brief.weeks,
            weekEnd: brief.weeks,
            progressionTarget: "Fixture deload week.",
            isDeload: true,
          },
        ]
      : [
          {
            phaseNumber: 1,
            name: "Fixture Block",
            weekStart: 1,
            weekEnd: brief.weeks,
            progressionTarget: "Fixture phase — no real progression logic, deterministic output only.",
            isDeload: false,
          },
        ];

  return {
    title: "Fixture Program Shell",
    description: "Development fixture shell — structural skeleton only, no workout content.",
    totalWeeks: brief.weeks,
    days,
    phases,
    globalConstraints: brief.limitations ?? "",
  };
}

// Assembles one week's content (one blueprint per shell day) from real
// exercise rows — preferring the supplied candidate set (see
// resolveFixtureSourceRows above). Returns null (never throws, never
// fabricates) if the seeded library can't support a minimal week.
export async function buildFixtureProgramWeek(
  weekNumber: number,
  shell: ProgramShell,
  candidates: ExerciseCandidate[] = [],
): Promise<ModelWeekDraft | null> {
  const active = await resolveFixtureSourceRows(candidates, 8);
  if (active.length < MIN_EXERCISES_REQUIRED) return null;

  const days: ModelDayDraft[] = shell.days.map((shellDay) => ({
    id: randomUUID(),
    dayOfWeek: shellDay.dayOfWeek,
    label: shellDay.label,
    workout: buildBlueprint(shellDay.label, active),
  }));

  const candidate: ModelWeekDraft = {
    id: randomUUID(),
    weekNumber,
    label: `Week ${weekNumber}`,
    days,
  };

  const parsed = ModelWeekDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// Day-level staged generation's fixture — one shell day's worth of
// content (see staged-generation.ts's per-day loop, which replaced
// buildFixtureProgramWeek's per-call unit above). dayIndex is 1-based,
// into shell.days — same identity program_generation_days uses.
// Returns null (never throws) if the seeded library can't support a
// minimal day, or if dayIndex is out of range for this shell.
export async function buildFixtureProgramDay(
  shell: ProgramShell,
  dayIndex: number,
  candidates: ExerciseCandidate[] = [],
): Promise<ModelDayDraft | null> {
  const shellDay = shell.days[dayIndex - 1];
  if (!shellDay) return null;

  const active = await resolveFixtureSourceRows(candidates, 6);
  if (active.length < MIN_EXERCISES_REQUIRED) return null;

  const candidate: ModelDayDraft = {
    id: randomUUID(),
    dayOfWeek: shellDay.dayOfWeek,
    label: shellDay.label,
    workout: buildBlueprint(shellDay.label, active),
  };

  const parsed = ModelDayDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
