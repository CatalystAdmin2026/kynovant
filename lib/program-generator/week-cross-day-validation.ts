// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Cross-Day Week Validation
//
// SERVER-ONLY, plain pure module (no DB, no I/O) — every check below
// runs entirely off the already-in-memory ModelWeekDraft, ProgramShell,
// ProgramGenerationBrief, and candidate lookup, so it's directly unit-
// testable without a database or provider call.
//
// P1 review finding on the day-level architecture change (see staged-
// generation.ts's header comment): whole-week generation let the model
// implicitly coordinate an entire week in one pass. Day-level
// generation can now produce individually reasonable days that combine
// into a bad week — five isolated good days that never work as a
// program. This runs once per week, right after that week's days are
// assembled (staged-generation.ts), BEFORE it's persisted as complete.
//
// Deliberately conservative and CONTEXT-AWARE, per explicit instruction
// not to encode arbitrary bodybuilding dogma:
//   - Every finding here is a WARNING, never a blocker — same posture
//     already established by validation.ts's own equipment-compatibility
//     check ("the signal is too imprecise to justify blocking approval
//     on its own"). A coach reviews and acknowledges, exactly like every
//     other warning this feature already produces — never auto-
//     regenerated, never silently corrected.
//   - "Is this pattern actually a problem?" always asks the brief's own
//     stated intent (preferredSplit, musclePriorities) first. A full-
//     body plan repeating movement categories, or a specialization plan
//     intentionally overloading one muscle group, is by-design, not a
//     defect — these checks skip themselves in exactly those cases
//     rather than firing and asking the coach to dismiss a known-good
//     result every time.
//   - Metadata (muscle group / movement pattern / equipment) comes from
//     the SAME narrowed candidate lookup staged-generation.ts already
//     built for this attempt — never re-queried, never guessed from an
//     exercise name.
//
// Explicitly NOT attempted in this pass (see the architecture report
// for the reasoning): same-muscle loading on adjacent days, high-
// fatigue movement recovery conflicts, and "obvious programming
// imbalance" are real concerns but don't have a deterministic,
// defensible signal available here without inventing exercise-science
// thresholds this codebase can't substantiate — exactly the "arbitrary
// dogma" risk called out. Left as a documented follow-up, not silently
// skipped.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { ExerciseCandidate } from "./exercise-candidates";
import { CORE_MUSCLE_GROUPS } from "./exercise-candidates";
import type { ModelWeekDraft, ProgramGenerationBrief, ProgramShell } from "./contracts";
import { classifyConcentration, contextualConcentrationSeverity } from "@/lib/pil/modules/redundancy";
import type { ValidationFinding } from "./validation";
import type { MuscleGroup, MovementPattern } from "@/lib/db/schema-exercise";

// A minimal, defensible foundational set — not the full movement-
// pattern enum, just the handful of pattern families most programming
// philosophies agree a well-rounded week should touch somewhere.
// Deliberately small: the goal is catching a real gap (a week with NO
// hip-hinge or squat pattern anywhere), not policing exercise variety.
const FOUNDATIONAL_MOVEMENT_PATTERNS: MovementPattern[] = [
  "hip_hinge",
  "squat_bilateral",
  "push_horizontal",
  "pull_horizontal",
];

// Splits where day-to-day repetition of the same muscle/exercise is
// inherent to the split itself, not a coordination failure — the
// duplicate-exercise check below skips entirely for these.
const REPETITION_EXPECTED_SPLITS: ProgramGenerationBrief["preferredSplit"][] = ["full_body", "coach_decides"];

// Splits loose enough (or explicitly coach-authored) that a strict
// foundational-pattern-coverage expectation isn't a fair check —
// "body_part"/"hybrid" splits can legitimately dedicate an entire week
// to isolation work in a specialization phase.
const PATTERN_COVERAGE_EXEMPT_SPLITS: ProgramGenerationBrief["preferredSplit"][] = ["coach_decides", "body_part"];

// Splits that inherently promise broad, every-major-muscle-group
// coverage WITHIN one week (as opposed to "body_part"/"hybrid", which
// can legitimately dedicate an entire week to a specialization rotation
// that only fully cycles across multiple weeks).
const FULL_WEEK_COVERAGE_SPLITS: ProgramGenerationBrief["preferredSplit"][] = [
  "full_body",
  "upper_lower",
  "push_pull_legs",
];

// >85% of a week's prescriptions sharing one resistance type is only
// suspicious when the brief's OWN equipment access doesn't already
// imply that outcome (e.g. "dumbbells_only" legitimately produces
// ~100% dumbbell work — that's not overuse, that's the brief).
const EQUIPMENT_OVERUSE_THRESHOLD = 0.85;
const SINGLE_EQUIPMENT_BRIEFS: ProgramGenerationBrief["equipmentAccess"][] = [
  "bodyweight",
  "bands_only",
  "dumbbells_only",
];

interface FlatPrescription {
  exerciseId: string | null;
  exerciseName: string;
  dayId: string;
  dayLabel: string;
  sectionType: string;
  candidate: ExerciseCandidate | null;
}

// Only the session's primary work (main lifts and accessories) counts for
// concentration/coverage — see lib/pil/modules/redundancy.ts.
const PRIMARY_WORK = new Set(["main_lift", "accessory"]);

function flattenWeek(week: ModelWeekDraft, candidatesById: Map<string, ExerciseCandidate>): FlatPrescription[] {
  const flat: FlatPrescription[] = [];
  for (const day of week.days) {
    if (!day.workout) continue;
    for (const section of day.workout.sections) {
      for (const p of section.prescriptions) {
        flat.push({
          exerciseId: p.exerciseId ?? null,
          exerciseName: p.exerciseName,
          dayId: day.id,
          dayLabel: day.label ?? day.workout.name,
          sectionType: section.sectionType,
          candidate: p.exerciseId ? (candidatesById.get(p.exerciseId) ?? null) : null,
        });
      }
    }
  }
  return flat;
}

function finding(code: string, title: string, explanation: string, weekId: string): ValidationFinding {
  return { id: randomUUID(), code, severity: "warning", title, explanation, weekId };
}

// A. + K. Duplicate main-lift/compound exercise across multiple days —
// the same specific exercise, chosen as a primary compound movement, on
// 2+ different days in one week, when the split doesn't call for it.
function checkDuplicateExercises(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  flat: FlatPrescription[],
): ValidationFinding[] {
  if (REPETITION_EXPECTED_SPLITS.includes(brief.preferredSplit)) return [];

  const daysByExercise = new Map<string, Set<string>>();
  const namesByExercise = new Map<string, string>();
  for (const p of flat) {
    if (p.sectionType !== "main_lift" && p.candidate?.classification !== "compound") continue;
    if (!p.exerciseId) continue;
    // A muscle the coach explicitly asked to prioritize is expected to
    // recur — not a coordination gap.
    if (p.candidate?.primaryMuscleGroup && brief.musclePriorities.includes(p.candidate.primaryMuscleGroup)) continue;
    const days = daysByExercise.get(p.exerciseId) ?? new Set<string>();
    days.add(p.dayId);
    daysByExercise.set(p.exerciseId, days);
    namesByExercise.set(p.exerciseId, p.exerciseName);
  }

  const findings: ValidationFinding[] = [];
  for (const [exerciseId, days] of daysByExercise) {
    if (days.size < 2) continue;
    findings.push({
      ...finding(
        "PROGRAM_GEN_WEEK_DUPLICATE_MAIN_LIFT",
        `"${namesByExercise.get(exerciseId)}" repeated as a main lift on ${days.size} days this week`,
        `This is the same primary compound movement on ${days.size} different days in Week ${week.weekNumber}, and the split ("${brief.preferredSplit.replace(/_/g, " ")}") doesn't call for repeating it. May be intentional — review before approving.`,
        week.id,
      ),
      exerciseId,
    });
  }
  return findings;
}

// B./C./G. Muscle-group and foundational-movement-pattern coverage —
// a muscle the brief prioritizes, or a foundational pattern the split
// implies, that never appears anywhere in the week at all.
function checkCoverageGaps(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  flat: FlatPrescription[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const trainedMuscles = new Set<MuscleGroup>();
  const trainedPatterns = new Set<MovementPattern>();
  for (const p of flat) {
    if (!p.candidate) continue;
    if (p.candidate.primaryMuscleGroup) trainedMuscles.add(p.candidate.primaryMuscleGroup);
    for (const m of p.candidate.secondaryMuscleGroups) trainedMuscles.add(m);
    trainedPatterns.add(p.candidate.movementPattern);
  }

  // Priority muscles are an explicit coach ask — a real gap here is the
  // clearest, least dogma-adjacent signal this module can raise.
  for (const priority of brief.musclePriorities) {
    if (!trainedMuscles.has(priority)) {
      findings.push(
        finding(
          "PROGRAM_GEN_WEEK_PRIORITY_MUSCLE_GAP",
          `${priority.replace(/_/g, " ")} — a prioritized muscle group — has no volume this week`,
          `Week ${week.weekNumber} has zero exercises training ${priority.replace(/_/g, " ")}, despite it being one of this brief's prioritized muscle groups.`,
          week.id,
        ),
      );
    }
  }

  // Broad muscle-group coverage — only for splits that inherently
  // promise it within a single week (see FULL_WEEK_COVERAGE_SPLITS'
  // own comment). One combined finding rather than one per muscle, so
  // a genuinely thin week doesn't spam the coach with a dozen near-
  // identical warnings.
  if (FULL_WEEK_COVERAGE_SPLITS.includes(brief.preferredSplit)) {
    const missingCore = CORE_MUSCLE_GROUPS.filter((mg) => !trainedMuscles.has(mg));
    if (missingCore.length > 0) {
      findings.push(
        finding(
          "PROGRAM_GEN_WEEK_MUSCLE_COVERAGE_GAP",
          `Week ${week.weekNumber} doesn't train ${missingCore.length} major muscle group${missingCore.length === 1 ? "" : "s"}`,
          `A "${brief.preferredSplit.replace(/_/g, " ")}" split typically covers every major muscle group within one week. Missing this week: ${missingCore.map((mg) => mg.replace(/_/g, " ")).join(", ")}.`,
          week.id,
        ),
      );
    }
  }

  if (!PATTERN_COVERAGE_EXEMPT_SPLITS.includes(brief.preferredSplit)) {
    const missingPatterns = FOUNDATIONAL_MOVEMENT_PATTERNS.filter((p) => !trainedPatterns.has(p));
    if (missingPatterns.length > 0) {
      findings.push(
        finding(
          "PROGRAM_GEN_WEEK_MOVEMENT_PATTERN_GAP",
          `Week ${week.weekNumber} has no ${missingPatterns.map((p) => p.replace(/_/g, " ")).join(", ")} movement`,
          `A "${brief.preferredSplit.replace(/_/g, " ")}" split would typically include at least one exercise using each foundational movement pattern somewhere across the week.`,
          week.id,
        ),
      );
    }
  }

  return findings;
}

// H. Equipment-family overuse — only when the brief's own equipment
// access doesn't already explain a near-single-equipment week.
function checkEquipmentOveruse(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  flat: FlatPrescription[],
): ValidationFinding[] {
  if (SINGLE_EQUIPMENT_BRIEFS.includes(brief.equipmentAccess)) return [];

  const withResistance = flat.filter((p) => p.candidate?.resistanceType);
  if (withResistance.length < 8) return []; // too little signal to judge fairly

  const counts = new Map<string, number>();
  for (const p of withResistance) {
    const type = p.candidate!.resistanceType!;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const findings: ValidationFinding[] = [];
  for (const [type, count] of counts) {
    const share = count / withResistance.length;
    if (share >= EQUIPMENT_OVERUSE_THRESHOLD) {
      findings.push(
        finding(
          "PROGRAM_GEN_WEEK_EQUIPMENT_OVERUSE",
          `${Math.round(share * 100)}% of Week ${week.weekNumber}'s exercises use ${type}`,
          `This brief has broader equipment access than "${type}" alone (equipmentAccess: ${brief.equipmentAccess}), but ${Math.round(share * 100)}% of this week's prescriptions use it — review whether more variety is warranted.`,
          week.id,
        ),
      );
    }
  }
  return findings;
}


// D. Repeated finisher exercises across the week's training days.
//
// A finisher is any prescription in a "finisher" section. With T days that
// have finisher exercises, an exercise is flagged when it appears on at
// least 3 of them AND on at least 60% of them. Below that (one or two
// days, or a minority of days) reuse is ordinary — a small finisher pool
// or a coach's favorite — and is NOT flagged. Severity: 4+ days and >=80%
// of finisher days (the "same finishers every single day" case) is a
// warning; the 3-of-5 band is info only (shown, never gating). An
// exercise the coach named in their own instructions is exempt: explicit
// coach direction outranks the diversity preference. Reported once per
// week (not per exercise) so a repeated pair reads as one observation.
const FINISHER_REPEAT_MIN_DAYS = 3;
const FINISHER_REPEAT_MIN_SHARE = 0.6;
const FINISHER_REPEAT_WARNING_MIN_DAYS = 4;
const FINISHER_REPEAT_WARNING_MIN_SHARE = 0.8;

function coachNamedExercise(brief: ProgramGenerationBrief, exerciseName: string): boolean {
  const text = [brief.freeformInstructions, brief.techniqueNotes, brief.equipmentNotes]
    .filter((t): t is string => !!t)
    .join(" ")
    .toLowerCase();
  return text.length > 0 && text.includes(exerciseName.toLowerCase());
}

function checkFinisherRepetition(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  flat: FlatPrescription[],
): ValidationFinding[] {
  const daysWithFinishers = new Set<string>();
  const daysByExercise = new Map<string, Set<string>>();
  const nameById = new Map<string, string>();
  for (const p of flat) {
    if (p.sectionType !== "finisher" || !p.exerciseId) continue;
    daysWithFinishers.add(p.dayId);
    const days = daysByExercise.get(p.exerciseId) ?? new Set<string>();
    days.add(p.dayId);
    daysByExercise.set(p.exerciseId, days);
    nameById.set(p.exerciseId, p.exerciseName);
  }
  const totalDays = daysWithFinishers.size;
  if (totalDays < FINISHER_REPEAT_MIN_DAYS) return [];

  const repeated = [...daysByExercise.entries()]
    .filter(([, days]) => days.size >= FINISHER_REPEAT_MIN_DAYS && days.size / totalDays >= FINISHER_REPEAT_MIN_SHARE)
    .filter(([id]) => !coachNamedExercise(brief, nameById.get(id) ?? ""))
    .sort((a, b) => b[1].size - a[1].size || (nameById.get(a[0]) ?? "").localeCompare(nameById.get(b[0]) ?? ""));
  if (repeated.length === 0) return [];

  const strongest = repeated[0][1].size;
  const warning =
    strongest >= FINISHER_REPEAT_WARNING_MIN_DAYS && strongest / totalDays >= FINISHER_REPEAT_WARNING_MIN_SHARE;
  const list = repeated.map(([id, days]) => `"${nameById.get(id)}" (${days.size} of ${totalDays} days)`).join(", ");
  return [
    {
      id: randomUUID(),
      code: "PROGRAM_GEN_WEEK_FINISHER_REPETITIVE",
      severity: warning ? "warning" : "info",
      title: `Repetitive finishers in Week ${week.weekNumber}: ${list}`,
      explanation: `The same finisher exercise${repeated.length === 1 ? " is" : "s are"} used on most training days this week: ${list}. That satisfies the requested finishing work but may be more repetitive than intended — consider varying the finishers across days unless you want them constant. Not an error.`,
      weekId: week.id,
    },
  ];
}

// C. A concentrated session that also leaves a targeted muscle without
// primary work, when alternatives for that muscle existed in the candidate
// set. Only days with an explicit structured targetMuscleGroups hint of 2+
// muscles are judged (inferred-from-text days would be too noisy), and only
// when the day's primary work is already meaningfully concentrated in one
// stimulus key (classifyConcentration >= moderate) — the "requested
// coverage left weak" evidence, not a general coverage audit. Warning.
function checkConcentrationCoverage(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  shell: ProgramShell,
  candidatesById: Map<string, ExerciseCandidate>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const allCandidates = [...candidatesById.values()];
  for (const day of week.days) {
    if (!day.workout) continue;
    const shellDay = shell.days.find((d) => d.dayOfWeek === day.dayOfWeek);
    const targets = shellDay?.targetMuscleGroups ?? [];
    if (targets.length < 2) continue;

    const primary: ExerciseCandidate[] = [];
    for (const section of day.workout.sections) {
      if (!PRIMARY_WORK.has(section.sectionType)) continue;
      for (const p of section.prescriptions) {
        const c = p.exerciseId ? candidatesById.get(p.exerciseId) : undefined;
        if (c?.primaryMuscleGroup) primary.push(c);
      }
    }
    if (primary.length < 3) continue;

    const byKey = new Map<string, ExerciseCandidate[]>();
    for (const c of primary) {
      const key = `${c.movementPattern}::${c.primaryMuscleGroup}`;
      byKey.set(key, [...(byKey.get(key) ?? []), c]);
    }
    const [topKey, topMembers] = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const tier = classifyConcentration(topMembers.length, primary.length);
    if (tier === "low") continue;
    const topMuscle = topMembers[0].primaryMuscleGroup!;
    // Specialization exempts the coverage escalation too.
    if (contextualConcentrationSeverity(tier, topMuscle, { specializedMuscles: brief.musclePriorities, dayTargetMuscles: targets }).adjustment === "specialization") continue;

    const covered = new Set<string>();
    for (const c of primary) {
      if (c.primaryMuscleGroup) covered.add(c.primaryMuscleGroup);
      for (const m of c.secondaryMuscleGroups) covered.add(m);
    }
    const missing = targets.filter((m) => !covered.has(m) && allCandidates.some((c) => c.primaryMuscleGroup === m));
    if (missing.length === 0) continue;

    const label = day.label ?? day.workout.name;
    findings.push({
      id: randomUUID(),
      code: "PROGRAM_GEN_DAY_CONCENTRATION_COVERAGE",
      severity: "warning",
      title: `Week ${week.weekNumber} "${label}": concentrated session with uncovered target muscles`,
      explanation: `${topMembers.length} of this day's ${primary.length} primary exercises share the ${topKey.split("::")[0].replace(/_/g, " ")} / ${topMuscle.replace(/_/g, " ")} stimulus, while ${missing.map((m) => m.replace(/_/g, " ")).join(", ")} — targeted by this day — has no primary work even though matching exercises were available. This is a heuristic overlap signal; review whether the day covers what was requested.`,
      weekId: week.id,
      dayId: day.id,
    });
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT — called by staged-generation.ts once per week,
// immediately after that week's days are assembled and BEFORE it's
// persisted as complete. Findings ride along into runAndSaveValidation's
// extraWarnings at the end of the whole generation, exactly like
// catalogGapFindings() already does — the SAME coach review/
// acknowledgement UI, no new findings pipeline.
// ─────────────────────────────────────────────────────────────

// Runs once per AI-authored week only: deterministically expanded weeks
// (block architecture) never reach this, and nothing here compares one week
// to another, so stable exercise selection across weeks (progression) can
// never produce a finding. `shell` is optional; without it the
// concentration-coverage check is skipped.
export function validateWeekCrossDay(
  week: ModelWeekDraft,
  brief: ProgramGenerationBrief,
  candidatesById: Map<string, ExerciseCandidate>,
  shell?: ProgramShell,
): ValidationFinding[] {
  const flat = flattenWeek(week, candidatesById);
  return [
    ...checkDuplicateExercises(week, brief, flat),
    ...checkCoverageGaps(week, brief, flat),
    ...checkEquipmentOveruse(week, brief, flat),
    ...checkFinisherRepetition(week, brief, flat),
    ...(shell ? checkConcentrationCoverage(week, brief, shell, candidatesById) : []),
  ];
}
