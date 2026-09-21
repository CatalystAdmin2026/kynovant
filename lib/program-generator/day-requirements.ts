// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Day Requirement Validation
//
// SERVER-ONLY, pure (no DB, no I/O). Verifies that a generated week
// honors each day's explicit coach-stated FINISHER requirements (see
// contracts.ts's ProgramShellFinisherSchema): "after the primary work, N
// exercises of kind X". Nothing here knows about abs, calves, carries or
// any other category — a requirement is just {count, muscle groups and/or
// movement pattern}, matched against the SAME candidate metadata the day
// was generated from (never guessed from an exercise name).
//
// Rule: the day's training exercises are flattened in section order, then
// prescription order (cooldown/rest sections are not training and are
// skipped). The LAST sum(exerciseCount) of them must satisfy the day's
// finishers, in the order the finishers were listed. That one rule
// encodes both "exactly these come AFTER the primary work" and the count.
// The count of PRIMARY exercises is deliberately not checked: it only
// exists as free-text coaching guidance ("6-8 per day"), and parsing free
// text into a hard rule is exactly the keyword-hack this mechanism avoids.
//
// Always WARNINGS, never blockers, never an auto-regeneration — the same
// posture as week-cross-day-validation.ts, and it rides the same
// extraWarnings pipeline (staged-generation.ts) into the coach's review.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { ExerciseCandidate } from "./exercise-candidates";
import { candidateMatchesFinisher, finisherMuscleGroups } from "./exercise-candidates";
import type { ModelDayDraft, ModelWeekDraft, ProgramShell, ProgramShellDay, ProgramShellFinisher } from "./contracts";
import type { ValidationFinding } from "./validation";

const NON_TRAINING_SECTIONS = new Set(["cooldown", "rest_period"]);

interface TrainingPrescription {
  exerciseId?: string | null;
}

export function flattenTrainingExercises(day: ModelDayDraft): TrainingPrescription[] {
  if (!day.workout) return [];
  return [...day.workout.sections]
    .filter((s) => !NON_TRAINING_SECTIONS.has(s.sectionType))
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((s) => [...s.prescriptions].sort((a, b) => a.orderIndex - b.orderIndex));
}

export interface FinisherCheck {
  finisher: ProgramShellFinisher;
  expected: number;
  matched: number;
}

// Returns one entry per finisher that was NOT satisfied (empty = all
// satisfied, or the day has none).
export function checkDayFinishers(
  day: ModelDayDraft,
  shellDay: ProgramShellDay,
  candidatesById: ReadonlyMap<string, ExerciseCandidate>,
): FinisherCheck[] {
  const finishers = shellDay.finishers ?? [];
  if (finishers.length === 0) return [];

  const training = flattenTrainingExercises(day);
  const total = finishers.reduce((n, f) => n + f.exerciseCount, 0);
  // Virtual positions 0..total-1 map onto the LAST `total` training
  // exercises; when the day has fewer than `total`, the leading virtual
  // positions have no exercise (their finishers come up short).
  const offset = training.length - total; // real index of virtual position 0

  const unmet: FinisherCheck[] = [];
  let virtualStart = 0;
  for (const finisher of finishers) {
    const slice: TrainingPrescription[] = [];
    for (let v = virtualStart; v < virtualStart + finisher.exerciseCount; v++) {
      const real = v + offset;
      if (real >= 0 && real < training.length) slice.push(training[real]);
    }
    virtualStart += finisher.exerciseCount;

    const verifiable = finisher.movementPattern != null || finisherMuscleGroups(finisher).length > 0;
    const matched = verifiable
      ? slice.filter((p) => {
          const candidate = p.exerciseId ? candidatesById.get(p.exerciseId) : undefined;
          return candidate ? candidateMatchesFinisher(candidate, finisher) : false;
        }).length
      : slice.length; // no criteria to verify against — count only
    if (matched < finisher.exerciseCount) unmet.push({ finisher, expected: finisher.exerciseCount, matched });
  }
  return unmet;
}

export function validateDayFinishers(
  week: ModelWeekDraft,
  shell: ProgramShell,
  candidatesById: ReadonlyMap<string, ExerciseCandidate>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const day of week.days) {
    const shellDay = shell.days.find((d) => d.dayOfWeek === day.dayOfWeek);
    if (!shellDay?.finishers?.length) continue;
    for (const unmet of checkDayFinishers(day, shellDay, candidatesById)) {
      findings.push({
        id: randomUUID(),
        code: "PROGRAM_GEN_DAY_FINISHER_UNMET",
        severity: "warning",
        title: `Week ${week.weekNumber}${day.label ? ` "${day.label}"` : ""}: requested finishing work not fully present`,
        explanation: `The coach asked for: "${unmet.finisher.description}" (${unmet.expected} exercise${unmet.expected === 1 ? "" : "s"} AFTER the primary work). Only ${unmet.matched} of the day's final exercises match that request — review this day's ending.`,
        weekId: week.id,
        dayId: day.id,
      });
    }
  }
  return findings;
}
