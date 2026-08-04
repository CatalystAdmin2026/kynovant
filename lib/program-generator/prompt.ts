// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Prompt Construction
//
// SERVER-ONLY. Deterministic — the same brief + client context always
// produces the same prompt string. Randomness, if any, belongs to the
// model's own sampling, never to this function.
//
// This prompt asks the model to choose exercises by NAME/description
// and describe intent — it does NOT ask the model to invent exerciseIds.
// Locked rule #4/#5 ("use only existing canonical Exercise Library IDs",
// "never invent exercise IDs") is enforced downstream in validation.ts,
// which resolves every exercise the model names against the real
// library and rejects anything that doesn't match — see
// lib/program-generator/validation.ts's exercise-resolution pass. The
// GeneratedProgramDraftSchema (contracts.ts) still requires a real
// exerciseId field on every prescription; the resolution step is what
// fills it in correctly before the schema is even checked, so a model
// that "helpfully" fabricates a uuid-shaped string is caught by
// existence validation regardless.
// ─────────────────────────────────────────────────────────────

import "server-only";
import type { ProgramGenerationBrief, GeneratedProgramDraft } from "./contracts";
import type { ClientContextSummary } from "./client-context";

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
- Choose exercises by describing them clearly (name, primary muscle, equipment) — you are not expected to know internal database IDs. A separate system will resolve your exercise choices against the real exercise library and reject anything it cannot match, so prefer common, unambiguous exercise names.
- Every set/rep/rest/tempo/RPE/RIR value must be realistic for the stated experience level and goal.
- Do not include any exercise described in the excluded list above, under any name or variation.
- Every training day must have at least one section with at least one exercise. Do not leave a training day empty.
- Keep each session within the target session length.
- Do not fabricate scientific claims or guarantee outcomes.
`.trim();

export function buildProgramGenerationPrompt(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
): string {
  return [
    "You are drafting a multi-week strength training Program for a professional coach's review. This is a DRAFT — the coach will review, edit, and explicitly approve before anything is created or shown to a client.",
    "",
    "## Program Brief",
    formatBriefSection(brief),
    "",
    "## Client Context",
    formatClientContextSection(clientContext),
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
    "## Day Being Regenerated",
    dayDescription,
    instruction ? `Coach instruction for this regeneration: ${instruction}` : "No additional instruction — keep the day's original focus and duration target, produce a fresh alternative.",
    "",
    "## Output Contract",
    OUTPUT_CONTRACT_NOTES,
    "Return the complete Program draft in the same shape as a full generation — the day you were asked to regenerate should reflect your new work; every other day should be returned unchanged from the current draft provided in this prompt's context.",
  ].join("\n");
}
