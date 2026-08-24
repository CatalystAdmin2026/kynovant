// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Prompt Construction
//
// SERVER-ONLY. Deterministic — the same brief + client context +
// candidate catalog always produces the same prompt string. Randomness,
// if any, belongs to the model's own sampling, never to this function.
//
// Week/day-regeneration prompts include a bounded, curated Exercise
// Catalog (see exercise-candidates.ts) and instruct the model to select
// every exercise's id and name from it — never to invent or infer one.
// That instruction alone is not the enforcement mechanism: nothing
// downstream trusts a returned id merely because the model followed
// instructions. exercise-candidates.ts's verify*AgainstCandidates()
// independently checks every returned id against the exact candidate
// set supplied for that call, and exercise-resolution.ts's name-based
// resolver remains a defensive fallback for anything that doesn't
// verify. See contracts.ts's header comment for the full picture.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type {
  ProgramGenerationBrief,
  GeneratedProgramDraft,
  ProgramShell,
  ProgramShellDay,
  ProgramShellPhase,
  ModelWeekDraft,
  ModelDayDraft,
} from "./contracts";
import type { ClientContextSummary } from "./client-context";
import { formatCandidatesForPrompt, type ExerciseCandidate, type ExerciseCandidateSet } from "./exercise-candidates";

function formatBriefSection(brief: ProgramGenerationBrief): string {
  const lines: string[] = [
    `Goal: ${brief.goal}${brief.goalDetail ? ` — ${brief.goalDetail}` : ""}`,
    `Program length: ${brief.weeks} weeks, ${brief.daysPerWeek} training days per week`,
    `Preferred split: ${brief.preferredSplit}`,
    `Experience level: ${brief.experienceLevel}`,
    `Equipment access: ${brief.equipmentAccess}${brief.equipmentNotes ? ` — ${brief.equipmentNotes}` : ""}`,
    `Target session length: ${brief.targetSessionMinutes} minutes${brief.hardSessionCap ? " (hard cap — do not exceed)" : ""}`,
    `Warmup included in session time: ${brief.warmupIncluded ? "yes" : "no"}`,
  ];

  if (brief.musclePriorities.length > 0) {
    lines.push(`Muscle priorities: ${brief.musclePriorities.join(", ")}`);
  }
  if (brief.limitations) {
    lines.push(`Coach-noted limitations (honor exactly, do not diagnose): ${brief.limitations}`);
  }
  if (brief.movementRestrictions) {
    lines.push(`Movement restrictions: ${brief.movementRestrictions}`);
  }
  if (brief.excludedExerciseNotes) {
    lines.push(`Additional excluded movements (freeform, best-effort honor): ${brief.excludedExerciseNotes}`);
  }
  lines.push(`Allowed set techniques: ${brief.allowedTechniques.join(", ")}`);
  if (brief.avoidedTechniques.length > 0) {
    lines.push(`Avoided set techniques: ${brief.avoidedTechniques.join(", ")}`);
  }
  if (brief.techniqueNotes) {
    lines.push(`Technique notes: ${brief.techniqueNotes}`);
  }
  if (brief.freeformInstructions) {
    lines.push(`Coach freeform instructions: ${brief.freeformInstructions}`);
  }

  return lines.join("\n");
}

function formatClientContextSection(context: ClientContextSummary | null): string {
  if (!context) {
    return "No client selected — this is a library Program draft, not tied to a specific person.";
  }

  const lines: string[] = [];
  if (context.fullName) lines.push(`Client: ${context.fullName}`);
  if (context.activeGoals.length > 0) {
    lines.push(
      `Active goals on file: ${context.activeGoals.map((g) => g.description ?? g.goalType).join("; ")}`,
    );
  }
  if (context.trainingDaysAvailable != null) {
    lines.push(`Client's stated available training days per week: ${context.trainingDaysAvailable}`);
  }
  if (context.equipmentNotes) {
    lines.push(`Client's on-file equipment: ${context.equipmentNotes}`);
  }
  if (context.isIncomplete) {
    lines.push(
      "This client's profile is incomplete. Do not guess at missing preferences — rely on the brief above.",
    );
  }

  return lines.length > 0 ? lines.join("\n") : "Client selected, but no additional profile context on file.";
}

const OUTPUT_CONTRACT_NOTES = `
Output requirements:
- Every exercise you include MUST be selected from the "Exercise Catalog" section by its exact id and name. Never invent, infer, or guess an exerciseId. Never select an exercise that is not present in the supplied catalog. Copy the id and name exactly as given — do not alter, abbreviate, translate, or paraphrase either one.
- This applies to EVERY exercise in every section, including warmup, activation, mobility, and cardio/conditioning work. Do not invent generic stretches, unnamed activation drills, or any warmup movement absent from the catalog — select warmups from the catalog exactly like any other exercise.
- If nothing in the catalog is a good fit for a specific need, choose the closest reasonable match that IS in the catalog rather than inventing something. Catalog gaps are handled separately by the system — it is never your job to fill one by fabricating an exercise.
- Every set/rep/rest/tempo/RPE/RIR value must be realistic for the stated experience level and goal.
- Do not include any exercise described in the excluded list above, under any name or variation — excluded exercises have already been removed from the catalog, so if you only select from the catalog this is automatic.
- Every training day must have at least one section with at least one exercise. Do not leave a training day empty.
- Keep each session within the target session length.
- Do not fabricate scientific claims or guarantee outcomes.
`.trim();

function formatCatalogSection(candidates: ExerciseCandidate[]): string {
  return [
    "## Exercise Catalog (SELECT ONLY FROM THIS LIST)",
    "Each line: id | name | alt names | muscle (+secondary) | movement pattern | classification | equipment | level | flags | high-stress joints.",
    "You MUST use only ids and names from this list — see Output Contract below for the full rule.",
    "",
    formatCandidatesForPrompt(candidates),
  ].join("\n");
}

function summarizeCandidateCoverage(candidateSet: ExerciseCandidateSet): string {
  if (candidateSet.gaps.length === 0) {
    return `${candidateSet.candidates.length} candidate exercises are available across the requested muscle groups, with warmup/mobility and cardio coverage.`;
  }
  const gapList = candidateSet.gaps.map((g) => `${g.category.replace(/_/g, " ")}`).join(", ");
  return `${candidateSet.candidates.length} candidate exercises are available. Note: limited library coverage for: ${gapList} — plan around this rather than assuming full coverage in those areas.`;
}

function formatDayLabels(shell: ProgramShell): string {
  return shell.days
    .map((d) => `dayOfWeek ${d.dayOfWeek} — "${d.label}"${d.focus ? ` (${d.focus})` : ""}`)
    .join("\n");
}

function findPhaseForWeek(shell: ProgramShell, weekNumber: number): ProgramShellPhase | null {
  return shell.phases.find((p) => weekNumber >= p.weekStart && weekNumber <= p.weekEnd) ?? null;
}

function formatPhase(phase: ProgramShellPhase | null, weekNumber: number): string {
  if (!phase) {
    return `No phase in the shell covers week ${weekNumber} — use your best judgment to continue the program's overall progression.`;
  }
  return [
    `Phase ${phase.phaseNumber} — "${phase.name}" (weeks ${phase.weekStart}-${phase.weekEnd})${phase.isDeload ? " — DELOAD PHASE" : ""}`,
    `Progression target for this phase: ${phase.progressionTarget}`,
  ].join("\n");
}

// P0 architecture change (see staged-generation.ts's header comment):
// generateProgramWeek()/buildWeekGenerationPrompt() asked one call to
// produce an entire week — proven too large/slow for reliable
// serverless execution. This asks for exactly one training day at a
// time (ModelDayDraftSchema — already the schema every week's `days`
// array element used, unchanged), using the SAME narrowed-candidate
// (exercise-candidates.ts's narrowCandidatesForDay(), not the full
// program-wide pool) and compact-continuity principles as the week
// prompt below, scoped down to one day.
//
// priorSameDaySummary is the LAST COMPLETED week's day at this exact
// shell-day-slot (not "the previous day generated," which could be an
// unrelated split day) — shell.days is a fixed weekly split reused
// every week, so day index N always means the same training emphasis
// across weeks (e.g. slot 1 = "Push" every week); progressing that
// slot's own history is what keeps week 6's Push day building on week
// 5's Push day rather than week 6's own Pull day.
// Phase D (blueprint-guided canonical-week concurrency): the ONE piece
// of context a canonical day generated CONCURRENTLY with its siblings
// can safely receive that weekSoFarSummary cannot — weekSoFarSummary
// is "what other days already produced," which by definition doesn't
// exist yet when every day in a batch starts at the same time. This is
// deterministic, pre-computed intent (blueprint.ts), never another
// day's actual generated output — see blueprint.ts's own header for
// why that's what makes concurrency safe at all. Optional/nullable
// throughout: entirely absent for the legacy_day path and for a
// Phase C (pre-blueprint) block draft, so this function's existing
// callers are unaffected.
export interface DayBlueprintIntent {
  primaryPatternEmphasis: string | null;
  techniqueEligibility: string | null;
  siblingAllocationSummary: string | null;
}

export function buildDayGenerationPrompt(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  shell: ProgramShell,
  weekNumber: number,
  shellDay: ProgramShellDay,
  priorSameDaySummary: string | null,
  weekSoFarSummary: string | null,
  candidates: ExerciseCandidate[],
  blueprintIntent: DayBlueprintIntent | null = null,
): string {
  const phase = findPhaseForWeek(shell, weekNumber);

  return [
    `You are generating ONE training day — "${shellDay.label}" (week ${weekNumber} of ${shell.totalWeeks} of an already-structured multi-week strength training Program), for a professional coach's review. Produce ONLY this one day — do not restate or reference other days.`,
    "",
    "## Program Brief (context for the whole Program)",
    formatBriefSection(brief),
    "",
    "## Client Context",
    formatClientContextSection(clientContext),
    "",
    formatCatalogSection(candidates),
    "",
    "## Program Shell (fixed for the whole Program — do not deviate)",
    `Title: ${shell.title}`,
    shell.description,
    "",
    "Global constraints (apply to every day, including this one):",
    shell.globalConstraints || "None beyond the brief above.",
    "",
    "## This Day",
    `Week ${weekNumber} of ${shell.totalWeeks} — dayOfWeek ${shellDay.dayOfWeek}, label "${shellDay.label}"${shellDay.focus ? `, focus: ${shellDay.focus}` : ""}. Your output's dayOfWeek and label MUST match these exactly.`,
    formatPhase(phase, weekNumber),
    "",
    // P1 review finding: each day used to see only cross-WEEK context
    // (the same day-slot in a prior week) with no visibility into what
    // OTHER days already generated earlier in the SAME week — the exact
    // gap that lets five individually-reasonable days combine into an
    // uncoordinated week (see week-cross-day-validation.ts, which
    // catches what still gets through after this).
    ...(weekSoFarSummary
      ? [
          "## Already Generated This Week",
          "Other days already built for this same week — avoid duplicating their main lifts and cover what they haven't, unless the split intentionally repeats (e.g. a full-body plan):",
          weekSoFarSummary,
          "",
        ]
      : []),
    // This day is generating CONCURRENTLY with its siblings this week —
    // there is no "already generated this week" content to see (that's
    // the whole reason this section exists instead). What it DOES have
    // is deterministic, pre-computed allocation intent — a soft nudge,
    // never a hard mandate, and never a claim about what a sibling day
    // actually ended up producing.
    ...(blueprintIntent
      ? [
          "## Week Coordination Plan (siblings are generating concurrently — this is planned intent, not their actual output)",
          blueprintIntent.primaryPatternEmphasis
            ? `For this day's primary compound/main lift, prefer a "${blueprintIntent.primaryPatternEmphasis.replace(/_/g, " ")}" movement pattern where a sensible option exists in the catalog above — this keeps it distinct from a sibling day that shares an overlapping muscle group and was assigned a different pattern to emphasize. Use your own judgment if no good option in that pattern fits.`
            : null,
          blueprintIntent.techniqueEligibility
            ? `This day is eligible to use "${blueprintIntent.techniqueEligibility.replace(/_/g, " ")}" on at most ONE exercise, if there's a genuinely appropriate candidate (e.g. a final accessory set) — do not force it onto every set, and do not use any OTHER intensity technique.`
            : "This day is not eligible for any high-fatigue intensity technique (drop set, rest-pause, myo-reps, etc.) this week — use straight sets, or the technique bounds already stated in the brief above.",
          blueprintIntent.siblingAllocationSummary
            ? `Other days planned for this same week (for context on what NOT to duplicate — none of this has been generated yet):\n${blueprintIntent.siblingAllocationSummary}`
            : null,
          "",
        ].filter((line): line is string => line !== null)
      : []),
    "## Continuity With This Same Day In Prior Weeks",
    priorSameDaySummary
      ? [
          `This day slot ("${shellDay.label}") has run before, in an earlier week. Build on it — do not generate an unrelated session:`,
          priorSameDaySummary,
          "Preserve the same core exercises where reasonable and progress them (more load, reps, sets, or reduced rest) according to the phase's progression target above. Only substitute an exercise if there's a clear reason (e.g. this phase's focus shifted, or a deload calls for lighter/simpler movements) — do not vary exercises just for the sake of variety.",
        ].join("\n")
      : `This is the first time this day slot ("${shellDay.label}") runs in the Program — establish the baseline exercises and loading that later weeks' same-slot days will progress from.`,
    "",
    "## Output Contract",
    OUTPUT_CONTRACT_NOTES,
  ].join("\n");
}

// Compact "what's already in this week" context — P1 review finding
// (day-level architecture v1): each day only ever saw cross-WEEK
// continuity, never what OTHER days earlier in the SAME week already
// covered, which is exactly the gap that lets individually-reasonable
// days combine into an uncoordinated week. Deliberately NOT full JSON
// per day (same "compact, not a token dump" principle as every other
// continuity summary here) — one line per completed day (exercise
// names + ids, so the model can avoid or intentionally reuse a
// specific id) plus one aggregate muscle-volume tally line.
export function summarizeWeekSoFarForPrompt(
  completedDaysThisWeek: ReadonlyMap<number, ModelDayDraft>,
  candidatesById: ReadonlyMap<string, ExerciseCandidate>,
): string | null {
  if (completedDaysThisWeek.size === 0) return null;

  const lines: string[] = [];
  const muscleSets = new Map<string, number>();

  const orderedDays = Array.from(completedDaysThisWeek.entries()).sort(([a], [b]) => a - b);
  for (const [, day] of orderedDays) {
    lines.push(summarizeDayForPrompt(day));
    if (!day.workout) continue;
    for (const section of day.workout.sections) {
      for (const p of section.prescriptions) {
        const c = p.exerciseId ? candidatesById.get(p.exerciseId) : undefined;
        if (!c?.primaryMuscleGroup) continue;
        const sets = p.sets ?? 1;
        muscleSets.set(c.primaryMuscleGroup, (muscleSets.get(c.primaryMuscleGroup) ?? 0) + sets);
      }
    }
  }

  if (muscleSets.size > 0) {
    const tally = Array.from(muscleSets.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([mg, sets]) => `${mg.replace(/_/g, " ")} ~${sets} sets`)
      .join(", ");
    lines.push(`Approximate volume so far this week (by primary muscle): ${tally}.`);
  }

  return lines.join("\n");
}

// Compact, human-readable summary of a single completed day — used as
// buildDayGenerationPrompt's priorSameDaySummary. Same "ids, not full
// JSON" principle as summarizeWeekForPrompt below.
export function summarizeDayForPrompt(day: ModelDayDraft): string {
  if (!day.workout) return `${day.label ?? `Day ${day.dayOfWeek}`}: rest day`;
  const exercises = day.workout.sections
    .flatMap((s) => s.prescriptions)
    .map((p) => (p.exerciseId ? `${p.exerciseName} [id:${p.exerciseId}]` : p.exerciseName))
    .join(", ");
  return `${day.label ?? day.workout.name}${day.workout.primaryFocus ? ` (${day.workout.primaryFocus})` : ""}: ${exercises}`;
}

// Compact, human-readable summary of a completed week — used as "prior
// week" context for the next week's generation. Deliberately NOT the
// full JSON (that would reintroduce the large-payload problem staged
// generation exists to avoid) — just enough for the model to continue
// coherently: which exercises were used, per day, WITH their catalog
// ids (requirement: pass prior-week selected ids forward) so the model
// can copy the exact same id forward for continuity instead of
// re-selecting by name and risking a different-but-similar exercise.
//
// Retained for generateProgramWeek()'s still-existing (but, since the
// P0 architecture change above, no longer staged-path-invoked) whole-
// week contract — see that function's own comment.
export function summarizeWeekForPrompt(week: ModelWeekDraft): string {
  const dayLines = week.days.map((day) => {
    if (!day.workout) return `${day.label ?? `Day ${day.dayOfWeek}`}: rest day`;
    const exercises = day.workout.sections
      .flatMap((s) => s.prescriptions)
      .map((p) => (p.exerciseId ? `${p.exerciseName} [id:${p.exerciseId}]` : p.exerciseName))
      .join(", ");
    return `${day.label ?? day.workout.name}${day.workout.primaryFocus ? ` (${day.workout.primaryFocus})` : ""}: ${exercises}`;
  });
  return dayLines.join("\n");
}

export function buildShellGenerationPrompt(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  candidateSet?: ExerciseCandidateSet,
): string {
  return [
    "You are designing the STRUCTURE of a multi-week strength training Program for a professional coach's review — not the workout content itself. A separate step will generate each week's actual exercises using the structure you define here, so this structure must be specific enough to keep every week consistent with it.",
    "",
    "## Program Brief",
    formatBriefSection(brief),
    "",
    "## Client Context",
    formatClientContextSection(clientContext),
    ...(candidateSet
      ? ["", "## Exercise Library Availability", summarizeCandidateCoverage(candidateSet)]
      : []),
    "",
    "## What to produce",
    `- totalWeeks must be exactly ${brief.weeks}.`,
    `- days must have exactly ${brief.daysPerWeek} entries — the fixed weekly training split every week will follow. Give each a clear label (e.g. "Upper Push", "Lower Body", "Full Body A") consistent with the requested split (${brief.preferredSplit}).`,
    // [Monday-first scheduling remediation] Root cause of a real
    // production defect: this prompt never told the model what
    // dayOfWeek means, so it defaulted to naive 0-indexed sequential
    // values (0,1,2,...) — which the app's own persisted schema and
    // every UI (schema-program.ts, ProgramBuilder.tsx, DraftReviewClient.tsx)
    // interpret as 0=Sunday, rendering the program as starting Sunday
    // instead of the intended Monday. This is a HINT, not a guarantee —
    // provider.ts's normalizeAmbiguousShellSchedule() is the
    // deterministic backstop for when the model doesn't comply.
    "- dayOfWeek uses this application's fixed convention: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday. Unless the brief or its Additional Notes explicitly requests a different schedule (e.g. specific named days, weekends, or a non-Monday start), the training week should begin on Monday (dayOfWeek=1) and use consecutive days from there.",
    "- phases must divide the program into logical progression blocks (e.g. accumulation, intensification, a deload) with non-overlapping week ranges that together cover every week from 1 to totalWeeks. Mark deload/lighter weeks explicitly via isDeload. Each phase's progressionTarget should describe concretely what should increase or change across weeks in that phase (e.g. \"add 1 rep per set each week, then increase load\").",
    "- globalConstraints should compactly restate any injury, exclusion, or equipment limitations from the brief above that every week's generation must continue to honor.",
    "Do not include any exercises, sets, reps, or workout content — that comes later, one week at a time.",
  ].join("\n");
}

export function buildWeekGenerationPrompt(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  shell: ProgramShell,
  weekNumber: number,
  priorWeekSummary: string | null,
  candidates: ExerciseCandidate[],
): string {
  const phase = findPhaseForWeek(shell, weekNumber);

  return [
    `You are generating week ${weekNumber} of ${shell.totalWeeks} of an already-structured multi-week strength training Program, for a professional coach's review. Produce ONLY this one week — do not restate or summarize other weeks.`,
    "",
    "## Program Brief (context for the whole Program)",
    formatBriefSection(brief),
    "",
    "## Client Context",
    formatClientContextSection(clientContext),
    "",
    formatCatalogSection(candidates),
    "",
    "## Program Shell (fixed for the whole Program — do not deviate)",
    `Title: ${shell.title}`,
    shell.description,
    "",
    "Fixed weekly split — this week's `days` must use exactly these dayOfWeek values and labels, no others:",
    formatDayLabels(shell),
    "",
    "Global constraints (apply to every week, including this one):",
    shell.globalConstraints || "None beyond the brief above.",
    "",
    "## This Week",
    `Week number: ${weekNumber} of ${shell.totalWeeks}`,
    formatPhase(phase, weekNumber),
    "",
    "## Continuity With Prior Weeks",
    priorWeekSummary
      ? [
          "This is NOT the first week. Build on what came before — do not generate an unrelated program:",
          priorWeekSummary,
          "Preserve the same core exercises where reasonable and progress them (more load, reps, sets, or reduced rest) according to the phase's progression target above. Only substitute an exercise if there's a clear reason (e.g. this phase's focus shifted, or a deload calls for lighter/simpler movements) — do not vary exercises just for the sake of variety.",
        ].join("\n")
      : "This is the first week of the Program — establish the baseline exercises and loading that later weeks will progress from.",
    "",
    "## Output Contract",
    OUTPUT_CONTRACT_NOTES,
  ].join("\n");
}

export function buildDayRegenerationPrompt(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  existingDraft: GeneratedProgramDraft,
  dayId: string,
  instruction: string | undefined,
  candidates: ExerciseCandidate[],
): string {
  const targetDay = existingDraft.weeks
    .flatMap((w) => w.days.map((d) => ({ week: w, day: d })))
    .find(({ day }) => day.id === dayId);

  const dayDescription = targetDay
    ? `Week ${targetDay.week.weekNumber}, day of week ${targetDay.day.dayOfWeek}${targetDay.day.label ? ` ("${targetDay.day.label}")` : ""}. Current focus: ${targetDay.day.workout?.primaryFocus ?? "unspecified"}.`
    : "The referenced day could not be located in the current draft.";

  return [
    "You are regenerating a single training day within an already-drafted multi-week Program, for a coach's review. Only this one day's workout should be produced — do not restate or change the rest of the Program.",
    "",
    "## Program Brief (context for the whole Program)",
    formatBriefSection(brief),
    "",
    "## Client Context",
    formatClientContextSection(clientContext),
    "",
    formatCatalogSection(candidates),
    "",
    "## Day Being Regenerated",
    dayDescription,
    instruction ? `Coach instruction for this regeneration: ${instruction}` : "No additional instruction — keep the day's original focus and duration target, produce a fresh alternative.",
    "",
    "## Output Contract",
    OUTPUT_CONTRACT_NOTES,
    "Return the complete Program draft in the same shape as a full generation — the day you were asked to regenerate should reflect your new work; every other day should be returned unchanged from the current draft provided in this prompt's context.",
  ].join("\n");
}
