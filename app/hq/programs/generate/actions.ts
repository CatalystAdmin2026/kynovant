"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Server Actions
//
// This is the entry point for the entire feature's mutating surface —
// generate, resume/retry, view is a plain page-level read (see
// page.tsx), every edit operation, discard, rerun validation,
// acknowledge warnings, approve.
//
// Every action here follows the same shape already established by
// app/hq/check-ins/[checkInId]/actions.ts: requireCoachOrAdmin() guard,
// then an object-level ownership check, then delegate to the service/
// domain layer, then revalidatePath. Nothing here talks to the database
// directly — that's lib/db/program-generation-service.ts's job — and
// nothing here calls a model provider directly — that's
// lib/program-generator/provider.ts's job, reached only through its
// exported generate*() functions — regenerateDayAction below calls
// generateProgramDay() (the same one staged generation uses for every
// day), not regenerateDayDraft() (provider.ts's older whole-draft-echo
// function, now unused by this file — see regenerateDayAction's own
// comment for why it was replaced, kept in provider.ts only because
// program-generator-integration.test.ts still tests it directly).
//
// Staged generation orchestration (runStagedGeneration, below) is the
// composition point the diagnosed 180s-timeout fix required: it drives
// one generateProgramShell() call followed by one generateProgramWeek()
// call per week, persisting each week as it completes, and only calls
// resolveProgramDraftExercises()/validateGeneratedDraft() once, after
// every week has succeeded. Both generateProgramDraftAction() (fresh)
// and resumeGenerationAction() (retry after a failed week) call the
// same function — a resume just supplies the weeks already completed
// and the first weekNumber still missing, so completed weeks are never
// regenerated.
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireCoachOrAdmin, assertCoachOwnsClient, resolveTenantScope } from "@/lib/auth/guards";
import type { PublicUser } from "@/lib/supabase/session";
import { getDb } from "@/lib/db/client";
import { clientProfiles } from "@/lib/db/schema";
import { getExerciseByIdForCoach, searchExercises } from "@/lib/db/exercise-service";
import { rankExerciseNameMatch } from "@/lib/program-generator/exercise-search-rank";
import {
  createDraft,
  getOwnedDraft,
  saveDraftContent,
  acknowledgeWarnings,
  acknowledgeFindingKeys,
  discardDraft as discardDraftRow,
  setDraftStatus,
  claimFailedDraftForResume,
  listGenerationWeeks,
  listGenerationDaysForWeek,
  startRun,
  completeRun,
  failRun,
  recordEditEvent,
  claimGenerationQuota,
  releaseGenerationQuotaClaim,
  GENERATION_QUOTA_LIMIT,
} from "@/lib/db/program-generation-service";
import {
  parseProgramGenerationBrief,
  parseGeneratedProgramDraft,
  parseProgramShell,
  ModelWeekDraftSchema,
  PrescriptionEditPatchSchema,
  type ProgramGenerationBrief,
  type GeneratedProgramDraft,
  type ProgramShell,
  type ModelWeekDraft,
} from "@/lib/program-generator/contracts";
import { logGenerationFailure, logProviderSuccess, logQuotaRelease } from "@/lib/program-generator/observability";
import { normalizeExerciseName } from "@/lib/program-generator/exercise-resolution";
import { buildExerciseCandidateSet } from "@/lib/program-generator/exercise-candidates";
import { catalogGapFindings } from "@/lib/program-generator/validation";
import { buildClientContextSummary, type ClientContextSummary } from "@/lib/program-generator/client-context";
import {
  updatePrescription,
  replaceExercise,
  replaceExerciseByName,
  reorderExercises,
  moveWorkoutDay,
  findDayUnique,
} from "@/lib/program-generator/edit-ops";
import { approveDraft } from "@/lib/program-generator/approval";
import { runStagedGeneration, runAndSaveValidation, regenerateDaySurgically } from "@/lib/program-generator/staged-generation";
import { GENERATION_ARCHITECTURES, type GenerationArchitecture } from "@/lib/program-generator/block-plan";
import { notifyProgramDraftReady, notifyProgramDraftFailed } from "@/lib/db/coach-notification-service";
import type { DraftValidationResult } from "@/lib/program-generator/validation";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ─────────────────────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────────────────────

async function requireActor(): Promise<
  { ok: true; coachId: string; scope: { coachId: string | null }; dbUser: PublicUser } | { ok: false; error: string }
> {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };
  return { ok: true, coachId: guard.dbUser.id, scope: resolveTenantScope(guard.dbUser), dbUser: guard.dbUser };
}

async function requireOwnedDraft(draftId: string) {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false as const, error: actor.error };
  const access = await getOwnedDraft(draftId, actor.scope);
  if (!access.ok) return { ok: false as const, error: access.error === "not_found" ? "Draft not found." : "You do not have access to this draft." };
  return { ok: true as const, coachId: actor.coachId, scope: actor.scope, draft: access.draft };
}

// drizzle/0036/0037's generation_architecture column is a plain
// nullable text column with a DB-level CHECK constraint (app-layer-
// validated union, not a Postgres enum — see 0036's own header) —
// narrows the raw DB value to the real GenerationArchitecture union.
//
// Review finding on Phase C candidate 5bfc4bc: a genuinely unset
// column (null — every draft that hasn't made this decision yet) and
// a MALFORMED non-null value (should be prevented entirely by 0037's
// CHECK constraint going forward, but this function must not assume a
// constraint added after the fact retroactively fixed every existing
// row, and a raw SQL statement could still theoretically bypass it)
// must not be silently treated as the same case. Both still end up
// routed to legacy_day by runStagedGeneration's own isResume-based
// safety rule regardless — that outcome is correct either way — but a
// malformed value is a genuine data-integrity signal worth surfacing,
// never a value this application itself ever writes.
function parseGenerationArchitecture(value: string | null): GenerationArchitecture | null {
  if (value === null) return null;
  if ((GENERATION_ARCHITECTURES as readonly string[]).includes(value)) return value as GenerationArchitecture;
  console.error(
    `[program-generator] draft has a malformed generation_architecture value ("${value}") — ` +
      "this should be impossible under drizzle/0037's CHECK constraint. Falling back to legacy_day via the resume path.",
  );
  return null;
}

// drizzle/0038's generation_architecture_version column, same
// malformed-vs-null distinction as parseGenerationArchitecture above.
// A pre-Phase-D "block" draft (version NULL) correctly parses to null
// here too — runStagedGeneration's own version-resolution then treats
// a null version exactly like a null architecture on a resume: never
// re-derived as "the current default," always read back as-is once
// non-null, and this function's job is only to reject a value that
// couldn't have come from this application's own writer.
function parseGenerationArchitectureVersion(value: number | null): 1 | 2 | null {
  if (value === null) return null;
  if (value === 1 || value === 2) return value;
  console.error(
    `[program-generator] draft has a malformed generation_architecture_version value (${value}) — ` +
      "this should be impossible under drizzle/0038's CHECK constraint. Treating as unset.",
  );
  return null;
}

function revalidateDraft(draftId: string) {
  revalidatePath(`/hq/programs/generate/${draftId}`);
  revalidatePath("/hq/programs/generate");
  revalidatePath("/hq/programs");
}

async function resolveClientContext(clientId: string | null): Promise<ClientContextSummary | null> {
  if (!clientId) return null;
  const db = getDb();
  const rows = await db
    .select({ fullName: clientProfiles.fullName })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, clientId))
    .limit(1);
  return buildClientContextSummary(clientId, rows[0]?.fullName ?? null);
}

// ─────────────────────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────────────────────

export async function generateProgramDraftAction(input: {
  clientId: string | null;
  brief: unknown;
}): Promise<ActionResult<{ draftId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  if (input.clientId) {
    const ownership = await assertCoachOwnsClient(actor.dbUser, input.clientId);
    if (!ownership.ok) return { ok: false, error: ownership.error };
  }

  const parsedBrief = parseProgramGenerationBrief(input.brief);
  if (!parsedBrief.ok) return { ok: false, error: parsedBrief.error };

  const draftRow = await createDraft({
    coachId: actor.coachId,
    clientId: input.clientId,
    brief: parsedBrief.data,
  });
  await setDraftStatus(draftRow.id, "running");

  const clientContext = await resolveClientContext(input.clientId);

  const result = await runStagedGeneration({
    draftId: draftRow.id,
    coachId: actor.coachId,
    brief: parsedBrief.data,
    clientContext,
    existingShell: null,
    isResume: false,
    startFromWeek: 1,
    startFromDay: 1,
    existingCompletedWeeks: new Map(),
    // Genuinely fresh draft, just created above — has never made this
    // decision. runStagedGeneration derives and persists it now.
    existingGenerationArchitecture: null,
    existingGenerationArchitectureVersion: null,
  });

  if (result.ok) {
    await notifyProgramDraftReady({ coachId: actor.coachId, draftId: draftRow.id });
  } else {
    await notifyProgramDraftFailed({ coachId: actor.coachId, draftId: draftRow.id, reason: result.error });
  }

  revalidateDraft(draftRow.id);
  return result.ok
    ? { ok: true, data: { draftId: draftRow.id } }
    : { ok: false, error: result.error, data: { draftId: draftRow.id } };
}

// Resumes a failed staged generation: never regenerates a week already
// persisted as 'completed', including the shell if it already
// completed. Only reachable on a draft currently in status='failed'.
export async function resumeGenerationAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (auth.draft.status !== "failed") {
    return { ok: false, error: "Only a failed draft can be retried." };
  }

  // Atomic claim — closes the double-click/retry race where two
  // concurrent calls both observe status="failed" above before either
  // has transitioned it. Only one caller ever wins; the other sees
  // false here rather than kicking off a duplicate, wasted generation
  // run racing to overwrite the same draft. See claimFailedDraftForResume's
  // own comment.
  const claimed = await claimFailedDraftForResume(draftId);
  if (!claimed) {
    return { ok: false, error: "This draft is already being retried." };
  }

  // The claim above already moved status to "running" — every exit from
  // here on must leave the draft in a real terminal state rather than
  // stuck "running" forever, so each early return below restores
  // status="failed" with a reason before returning.
  const parsedBrief = parseProgramGenerationBrief(auth.draft.briefJson);
  if (!parsedBrief.ok) {
    await setDraftStatus(draftId, "failed", { failureReason: "Draft brief is not currently valid." });
    return { ok: false, error: "Draft brief is not currently valid." };
  }

  let existingShell: ProgramShell | null = null;
  if (auth.draft.shellJson) {
    const parsedShell = parseProgramShell(auth.draft.shellJson);
    if (parsedShell.ok) existingShell = parsedShell.data;
  }

  const existingWeekRows = await listGenerationWeeks(draftId);
  const existingCompletedWeeks = new Map<number, ModelWeekDraft>();
  for (const row of existingWeekRows) {
    if (row.status !== "completed" || !row.weekJson) continue;
    const parsedWeek = ModelWeekDraftSchema.safeParse(row.weekJson);
    if (parsedWeek.success) existingCompletedWeeks.set(row.weekNumber, parsedWeek.data);
  }

  const totalWeeks = existingShell?.totalWeeks ?? parsedBrief.data.weeks;
  let startFromWeek = 1;
  while (startFromWeek <= totalWeeks && existingCompletedWeeks.has(startFromWeek)) {
    startFromWeek++;
  }

  // P0 day-level architecture change: within startFromWeek (the first
  // NOT-fully-completed week), find the first shell day without a
  // 'completed' row — this is what lets Retry resume at the exact
  // unfinished day rather than the whole week. A draft with no day
  // rows for this week yet (never started under this architecture, or
  // a pre-day-level draft) correctly falls through to day 1 — no
  // migration/backfill needed (see drizzle/0034's own comment).
  let startFromDay = 1;
  if (existingShell && startFromWeek <= totalWeeks) {
    const existingDayRows = await listGenerationDaysForWeek(draftId, startFromWeek);
    const completedDayNumbers = new Set(
      existingDayRows.filter((row) => row.status === "completed").map((row) => row.dayNumber),
    );
    while (startFromDay <= existingShell.days.length && completedDayNumbers.has(startFromDay)) {
      startFromDay++;
    }
  }

  const clientContext = await resolveClientContext(auth.draft.clientId);

  const result = await runStagedGeneration({
    draftId,
    coachId: auth.coachId,
    brief: parsedBrief.data,
    clientContext,
    existingShell,
    isResume: true,
    startFromWeek,
    startFromDay,
    existingCompletedWeeks,
    existingGenerationArchitecture: parseGenerationArchitecture(auth.draft.generationArchitecture),
    existingGenerationArchitectureVersion: parseGenerationArchitectureVersion(auth.draft.generationArchitectureVersion),
  });

  if (result.ok) {
    await notifyProgramDraftReady({ coachId: auth.coachId, draftId });
  } else {
    await notifyProgramDraftFailed({ coachId: auth.coachId, draftId, reason: result.error });
  }

  revalidateDraft(draftId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ─────────────────────────────────────────────────────────────
// EDIT OPERATIONS
// ─────────────────────────────────────────────────────────────

async function loadEditableDraft(draftId: string) {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  // Locked rule (review triage requirement #2): an approved draft has
  // already become a real Program/Blueprint — editing draftJson after
  // that point would silently diverge from what was actually created. A
  // discarded draft is deliberately dead. Neither should accept edits,
  // including the bulk replace-all path below, which is exactly the
  // scenario that surfaced this gap wasn't previously enforced anywhere.
  if (auth.draft.status === "approved" || auth.draft.status === "discarded") {
    return { ok: false as const, error: `This draft is ${auth.draft.status} and can no longer be edited.` };
  }

  const parsedDraft = parseGeneratedProgramDraft(auth.draft.draftJson);
  if (!parsedDraft.ok) return { ok: false as const, error: "Draft content is not currently valid." };
  const parsedBrief = parseProgramGenerationBrief(auth.draft.briefJson);
  if (!parsedBrief.ok) return { ok: false as const, error: "Draft brief is not currently valid." };

  return { ok: true as const, coachId: auth.coachId, draftRow: auth.draft, draft: parsedDraft.data, brief: parsedBrief.data };
}

async function applyEditAndSave(
  draftId: string,
  coachId: string,
  brief: ProgramGenerationBrief,
  editResult: { ok: true; draft: GeneratedProgramDraft; before: unknown; after: unknown } | { ok: false; error: string },
  eventMeta: { action: Parameters<typeof recordEditEvent>[0]["action"]; entityType: string; entityId: string | null; summary: string },
): Promise<ActionResult> {
  if (!editResult.ok) return { ok: false, error: editResult.error };

  const reparsed = parseGeneratedProgramDraft(editResult.draft);
  if (!reparsed.ok) return { ok: false, error: `Edit produced an invalid draft: ${reparsed.error}` };

  await saveDraftContent(draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(draftId, reparsed.data, brief, coachId);
  await recordEditEvent({
    draftId,
    actorUserId: coachId,
    action: eventMeta.action,
    entityType: eventMeta.entityType,
    entityId: eventMeta.entityId,
    summary: eventMeta.summary,
    beforeJson: editResult.before,
    afterJson: editResult.after,
  });

  revalidateDraft(draftId);
  return { ok: true };
}

export async function updatePrescriptionAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  prescriptionId: string;
  patch: unknown;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const parsedPatch = PrescriptionEditPatchSchema.safeParse(params.patch);
  if (!parsedPatch.success) return { ok: false, error: "Invalid prescription edit." };

  const result = updatePrescription(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    prescriptionId: params.prescriptionId,
    patch: parsedPatch.data,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "prescription_updated",
    entityType: "prescription",
    entityId: params.prescriptionId,
    summary: "Coach edited a prescription.",
  });
}

export async function replaceExerciseAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  prescriptionId: string;
  exerciseId: string;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // Never trust a client-supplied exercise name — always re-derive it
  // from the real library. If the id doesn't resolve, reject here
  // rather than letting an invented id slip into the draft (locked
  // rule #4/#5); full validation would also catch it, but this gives
  // an immediate, specific error instead of a generic blocker later.
  //
  // [Draft Review exercise search/replacement UX] getExerciseByIdForCoach
  // (not the unscoped getExerciseById) — the same visibility rule
  // searchExercises() itself already enforces: system + organization
  // scope, plus the DRAFT's own coach's private exercises only. Scoped
  // to loaded.draftRow.coachId (the draft's actual owning coach), not
  // the acting user's own id — correct for both a coach editing their
  // own draft (identical either way) and an admin editing on a coach's
  // behalf (must see what THAT coach can see, not the admin's own
  // scope). A client submitting another coach's private exercise id —
  // whether by tampering or a stale/malicious request — is rejected
  // here exactly like a nonexistent id.
  const exercise = await getExerciseByIdForCoach(params.exerciseId, loaded.draftRow.coachId);
  if (!exercise) return { ok: false, error: "That exercise does not exist in the library." };
  if (exercise.status !== "active") {
    return { ok: false, error: "That exercise is not currently active and cannot be used." };
  }

  const result = replaceExercise(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    prescriptionId: params.prescriptionId,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_replaced",
    entityType: "prescription",
    entityId: params.prescriptionId,
    summary: `Coach replaced an exercise with "${exercise.name}".`,
  });
}

// Server-authoritative "Replace All Occurrences" — review triage
// requirement #2. Reuses the exact same loadEditableDraft (ownership +
// approved/discarded status gate) and applyEditAndSave (save + rerun
// validation + one audit event) pipeline every other edit action goes
// through; the only new piece is the pure edit-op below, which walks
// every week/day/section instead of a single addressed prescription.
//
// normalizedName must be exercise-resolution.ts's own
// normalizeExerciseName() output — the caller (the review triage UI)
// gets this directly from the grouped finding it's acting on, never
// free text, so there's no risk of it drifting from how prescriptions
// were actually grouped.
export async function replaceAllOccurrencesAction(params: {
  draftId: string;
  normalizedName: string;
  exerciseId: string;
}): Promise<ActionResult<{ replacedCount: number }>> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // [Draft Review exercise search/replacement UX] Same tenant-scoped
  // lookup as replaceExerciseAction above — see that call site's own
  // comment for the full rationale.
  const exercise = await getExerciseByIdForCoach(params.exerciseId, loaded.draftRow.coachId);
  if (!exercise) return { ok: false, error: "That exercise does not exist in the library." };
  if (exercise.status !== "active") {
    return { ok: false, error: "That exercise is not currently active and cannot be used." };
  }

  // Re-normalize server-side rather than trusting the client's string
  // verbatim — cheap, and keeps this action's own authority over what
  // "the same name" means independent of whatever the caller sent.
  const normalizedName = normalizeExerciseName(params.normalizedName);

  const result = replaceExerciseByName(loaded.draft, {
    normalizedName,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const replacedCount = (result.after as { replacedCount: number }).replacedCount;

  const saveResult = await applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_replaced",
    entityType: "bulk_exercise_replace",
    entityId: normalizedName,
    summary: `Coach replaced all ${replacedCount} occurrence(s) of an unresolved exercise with "${exercise.name}".`,
  });

  if (!saveResult.ok) return { ok: false, error: saveResult.error };
  return { ok: true, data: { replacedCount } };
}

// ─────────────────────────────────────────────────────────────
// [Draft Review exercise search/replacement UX]
//
// Replaces the old "Replacement exercise ID" free-text field — a raw
// UUID a coach was expected to know and type by hand — with a
// searchable-by-name picker. This is the server side of that picker:
// a thin wrapper around the EXISTING, already tenant-aware
// searchExercises() (lib/db/exercise-service.ts), reusing the exact
// same auth/ownership/draft-status gate every other edit action in
// this file already goes through (loadEditableDraft) rather than
// inventing a parallel search surface or a second Exercise Library.
//
// Server-backed rather than shipping the whole library to the browser
// — searchExercises() already does a single indexed (GIN tsvector,
// including alternate_names/aliases — see drizzle/0014) query, so this
// is one lightweight round trip per search, not a client-side scan.
//
// Scoped to loaded.draftRow.coachId (the draft's own owning coach, see
// replaceExerciseAction's own comment above for why this — not the
// acting user's id — is the correct scope for both a coach on their
// own draft and an admin acting on a coach's behalf) — a coach can
// never even SEE another tenant's private exercise here, the same
// guarantee getExerciseByIdForCoach enforces at the actual replace
// step. This is defense in depth, not the only place tenant isolation
// is enforced: the id this returns is still re-validated from scratch
// by replaceExerciseAction/replaceAllOccurrencesAction when the coach
// actually confirms a replacement — this search result is never
// trusted on its own.
export interface ReplacementExerciseSearchResult {
  id: string;
  name: string;
  primaryMuscleGroup: string | null;
}

// searchExercises() itself orders results alphabetically (a single
// ORDER BY, not a relevance rank) — rankExerciseNameMatch (lib/
// program-generator/exercise-search-rank.ts; see that file's header for
// the full rationale and tier order) re-sorts that already-small,
// already tenant-scoped, already text-matched result set in memory,
// with zero additional queries.
export async function searchReplacementExercisesAction(params: {
  draftId: string;
  query: string;
}): Promise<ActionResult<{ exercises: ReplacementExerciseSearchResult[] }>> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const query = params.query.trim();
  if (query.length === 0) return { ok: true, data: { exercises: [] } };

  const results = await searchExercises({ name: query, statuses: ["active"], limit: 20 }, loaded.draftRow.coachId);

  const lowerQuery = query.toLowerCase();
  const ranked = [...results].sort(
    (a, b) => rankExerciseNameMatch(a, lowerQuery) - rankExerciseNameMatch(b, lowerQuery),
  );

  return {
    ok: true,
    data: { exercises: ranked.map((e) => ({ id: e.id, name: e.name, primaryMuscleGroup: e.primaryMuscleGroup })) },
  };
}

export async function reorderExercisesAction(params: {
  draftId: string;
  dayId: string;
  sectionId: string;
  orderedPrescriptionIds: string[];
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = reorderExercises(loaded.draft, {
    dayId: params.dayId,
    sectionId: params.sectionId,
    orderedPrescriptionIds: params.orderedPrescriptionIds,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "exercise_reordered",
    entityType: "section",
    entityId: params.sectionId,
    summary: "Coach reordered exercises within a section.",
  });
}

export async function moveWorkoutDayAction(params: {
  draftId: string;
  weekId: string;
  dayId: string;
  newDayOfWeek: number;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const result = moveWorkoutDay(loaded.draft, {
    weekId: params.weekId,
    dayId: params.dayId,
    newDayOfWeek: params.newDayOfWeek,
  });

  return applyEditAndSave(params.draftId, loaded.coachId, loaded.brief, result, {
    action: "day_moved",
    entityType: "day",
    entityId: params.dayId,
    summary: `Coach moved a training day to day-of-week ${params.newDayOfWeek}.`,
  });
}

// P0 review finding, fixed here: this used to ask the model to echo
// the ENTIRE program back (schema: ModelProgramDraftSchema) with an
// instruction to leave every day but the target "unchanged" — but the
// prompt (buildDayRegenerationPrompt) never actually included the
// existing draft's content, only a one-line description of the target
// day. The model had no way to honor "unchanged" for content it never
// saw, so every single-day regeneration risked silently fabricating
// new content for the rest of the whole program.
//
// Rewritten to delegate the actual generation to
// staged-generation.ts's regenerateDaySurgically() — the same
// "auth/quota/run-tracking in actions.ts, domain logic in a plain
// testable module" split runStagedGeneration already uses. This
// wrapper's own job is just: fail closed on an ambiguous/missing
// target BEFORE any provider call or quota claim, parse the shell,
// handle quota bookkeeping, and persist the result.
export async function regenerateDayAction(params: {
  draftId: string;
  dayId: string;
  instruction?: string;
}): Promise<ActionResult> {
  const loaded = await loadEditableDraft(params.draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // Fail closed FIRST — before any provider call, quota claim, or run
  // record — exactly the "do not regenerate, do not persist anything"
  // requirement for a target that can't be uniquely resolved.
  // regenerateDaySurgically re-checks this itself too (defense in
  // depth, and so it's safe to call directly, e.g. from a test) — this
  // earlier check exists purely to avoid claiming quota/starting a run
  // for a request that's already known to be invalid.
  const located = findDayUnique(loaded.draft, params.dayId);
  if (!located.ok) {
    return {
      ok: false,
      error: located.reason === "ambiguous"
        ? "This draft has more than one day sharing the same identifier — refusing to guess which one to regenerate. Regenerate this draft or contact support."
        : "Day not found in draft.",
    };
  }

  if (!loaded.draftRow.shellJson) {
    return { ok: false, error: "This draft has no stored Program Shell — cannot safely regenerate a single day." };
  }
  const parsedShell = parseProgramShell(loaded.draftRow.shellJson);
  if (!parsedShell.ok) {
    return { ok: false, error: "This draft's Program Shell is no longer valid — cannot safely regenerate a single day." };
  }
  const shell = parsedShell.data;

  const clientContext = await resolveClientContext(loaded.draftRow.clientId);

  const run = await startRun({
    draftId: params.draftId,
    scope: "single_day",
    dayRef: params.dayId,
    requestedByUserId: loaded.coachId,
  });

  // Same curated-catalog rules as staged generation (requirement:
  // regenerate-day must use the same catalog constraints) — recomputed
  // here since regenerate-day is a standalone action, not part of a
  // runStagedGeneration() call.
  const candidateSet = await buildExerciseCandidateSet(loaded.brief, loaded.coachId);

  // Same fail-fast rationale as staged generation (see
  // runStagedGeneration's own comment) — total candidate exhaustion
  // means the model has nothing valid to select from at all; fail with a
  // clear, actionable message instead of spending a model call on a day
  // that's guaranteed to come back entirely unresolved.
  if (candidateSet.candidates.length === 0) {
    await failRun(
      run.id,
      "No exercises in the Exercise Library are compatible with this brief's equipment and experience-level combination.",
    );
    return {
      ok: false,
      error:
        "No exercises in the Exercise Library are compatible with this brief's equipment and experience-level combination. Adjust the brief or add matching exercises to the library.",
    };
  }

  // Rate-limit gate — regenerateDaySurgically() below always makes
  // exactly one model call, so (unlike staged generation's resume path)
  // this is unconditional once we're past the candidate-exhaustion
  // fail-fast above. Shares the SAME per-coach quota as full-draft
  // generation/resume (claimGenerationQuota's own comment) — a coach
  // cannot dodge the limiter by only ever using "Regenerate Day".
  const claim = await claimGenerationQuota(loaded.coachId, params.draftId, "single_day");
  if (!claim.ok) {
    const minutes = Math.max(1, Math.ceil(claim.retryAfterMs / 60_000));
    await failRun(run.id, "Coach AI generation quota exceeded.");
    return {
      ok: false,
      error: `You've reached the AI generation limit (${GENERATION_QUOTA_LIMIT} per hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const result = await regenerateDaySurgically({
    draft: loaded.draft,
    shell,
    brief: loaded.brief,
    clientContext,
    dayId: params.dayId,
    coachId: loaded.coachId,
    candidateSet,
  });

  if (!result.ok) {
    // GenerationFailure (has errorCode/provider/model/elapsedMs) vs. a
    // plain {ok:false,error} from findDayUnique/shell-slot-mismatch/
    // replaceDayContent — only the former needs quota-release-on-
    // timeout and the sanitized structured failure log.
    if ("errorCode" in result) {
      // See ClaimQuotaResult's comment in program-generation-service.ts:
      // a definitive timeout produced zero usable output — don't charge
      // the coach's quota for infrastructure aborting its own call.
      let quotaReleased = false;
      if (result.errorCode === "timeout") {
        try {
          await releaseGenerationQuotaClaim(claim.claimId);
          logQuotaRelease({ draftId: params.draftId, runId: run.id, reason: "provider_timeout", success: true });
          quotaReleased = true;
        } catch {
          logQuotaRelease({ draftId: params.draftId, runId: run.id, reason: "provider_timeout", success: false });
        }
      }
      logGenerationFailure({
        draftId: params.draftId,
        runId: run.id,
        stage: "day_regeneration",
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        provider: result.provider,
        model: result.model,
        elapsedMs: result.elapsedMs,
        timeoutMs: result.timeoutMs,
        isRetryOrResume: false,
        quotaClaimed: true,
        quotaReleased,
      });
      await failRun(run.id, result.errorMessage, { provider: result.provider, model: result.model });
    } else {
      await failRun(run.id, result.error);
    }
    // Fail closed: draftJson was never touched — the pre-regeneration
    // draft is exactly what's still persisted.
    return { ok: false, error: "errorCode" in result ? "Regeneration failed. Please try again." : result.error };
  }

  logProviderSuccess({
    draftId: params.draftId,
    stage: "day_regeneration",
    provider: result.provider,
    model: result.model,
    elapsedMs: result.elapsedMs,
  });

  const reparsed = parseGeneratedProgramDraft(result.draft);
  if (!reparsed.ok) {
    await failRun(run.id, reparsed.error, { provider: result.provider, model: result.model });
    // Fail closed: draftJson was never touched — the pre-regeneration
    // draft is exactly what's still persisted.
    return { ok: false, error: `Regeneration produced an invalid draft: ${reparsed.error}` };
  }

  await completeRun(run.id, { provider: result.provider, model: result.model });
  await saveDraftContent(params.draftId, reparsed.data, "ready_for_review");
  await runAndSaveValidation(
    params.draftId,
    reparsed.data,
    loaded.brief,
    loaded.coachId,
    catalogGapFindings(candidateSet.gaps),
  );
  await recordEditEvent({
    draftId: params.draftId,
    actorUserId: loaded.coachId,
    action: "day_regenerated",
    entityType: "day",
    entityId: params.dayId,
    summary: params.instruction ? `Coach regenerated a day: "${params.instruction}"` : "Coach regenerated a day.",
  });

  revalidateDraft(params.draftId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────

export async function rerunValidationAction(draftId: string): Promise<ActionResult> {
  const loaded = await loadEditableDraft(draftId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  await runAndSaveValidation(draftId, loaded.draft, loaded.brief, loaded.coachId);
  revalidateDraft(draftId);
  return { ok: true };
}

export async function acknowledgeWarningsAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await acknowledgeWarnings(draftId);
  revalidateDraft(draftId);
  return { ok: true };
}

// Review triage requirement #6 — one action, three granularities, all
// driven by which keys the caller passes:
//   - one occurrence:      [occurrenceAckKey(findingId)]
//   - one grouped issue:   [groupAckKey(groupKey)]
//   - all visible warnings: groupAckKey(...) for every current warning group
// The UI always derives these keys from the SAME grouped structure it
// rendered (lib/program-generator/findings-grouping.ts), never free
// text — but this action still re-derives "is this actually a blocker"
// server-side from the draft's own current insightsJson rather than
// trusting the caller's classification of what it's acknowledging.
export async function acknowledgeFindingsAction(
  draftId: string,
  keys: string[],
): Promise<ActionResult<{ fullyAcknowledged: boolean }>> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (auth.draft.status === "approved" || auth.draft.status === "discarded") {
    return { ok: false, error: `This draft is ${auth.draft.status} and can no longer be edited.` };
  }
  if (keys.length === 0) return { ok: false, error: "No findings selected to acknowledge." };

  const insights = auth.draft.insightsJson as DraftValidationResult | null;
  if (!insights) return { ok: false, error: "This draft has not been validated yet." };

  const result = await acknowledgeFindingKeys(draftId, keys, insights);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateDraft(draftId);
  return { ok: true, data: { fullyAcknowledged: result.fullyAcknowledged } };
}

export async function discardDraftAction(draftId: string): Promise<ActionResult> {
  const auth = await requireOwnedDraft(draftId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await discardDraftRow(draftId);
  revalidateDraft(draftId);
  return { ok: true };
}

export async function approveDraftAction(draftId: string): Promise<ActionResult<{ programTemplateId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const outcome = await approveDraft(draftId, actor.scope, actor.coachId);
  if (!outcome.ok) return { ok: false, error: outcome.errorMessage };

  revalidateDraft(draftId);
  revalidatePath(`/hq/programs/${outcome.programTemplateId}`);
  return { ok: true, data: { programTemplateId: outcome.programTemplateId } };
}
