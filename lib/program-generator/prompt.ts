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
  ProgramShellPhase,
  ModelWeekDraft,
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

// Compact, human-readable summary of a completed week — used as "prior
// week" context for the next week's generation. Deliberately NOT the
// full JSON (that would reintroduce the large-payload problem staged
// generation exists to avoid) — just enough for the model to continue
// coherently: which exercises were used, per day, WITH their catalog
// ids (requirement: pass prior-week selected ids forward) so the model
// can copy the exact same id forward for continuity instead of
// re-selecting by name and risking a different-but-similar exercise.
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
