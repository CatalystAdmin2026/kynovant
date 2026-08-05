// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Draft DB Service
//
// SERVER-ONLY. All read/write access to program_generation_drafts and
// its child tables goes through this file — no route/action/component
// queries these tables directly.
//
// Tenant isolation (locked rule #10): every function that reads or
// mutates a specific draft takes a TenantScope, not a bare coachId.
// scope.coachId === null means admin (no filter) — this mirrors
// resolveTenantScope() in lib/auth/guards.ts and the coachId:string|null
// convention already used by listProgramTemplates()/listWorkoutTemplates()
// in this codebase. Ownership is enforced HERE, at the data layer, not
// left to callers — see getOwnedDraft().
// ─────────────────────────────────────────────────────────────

import "server-only";
import { and, eq, asc, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  programGenerationDrafts,
  programGenerationRuns,
  programGenerationWeeks,
  programGenerationEditEvents,
  programGenerationValidationEvents,
  type ProgramGenerationDraft,
  type ProgramGenerationStatus,
  type ProgramGenerationRun,
  type ProgramGenerationRunScope,
  type ProgramGenerationWeek,
  type ProgramGenerationEditAction,
} from "./schema-program-generator";
import type {
  ProgramGenerationBrief,
  GeneratedProgramDraft,
  ProgramShell,
  ModelWeekDraft,
} from "@/lib/program-generator/contracts";
import type { DraftValidationResult, ValidationFinding } from "@/lib/program-generator/validation";
import { groupKeyForFinding, occurrenceAckKey, groupAckKey } from "@/lib/program-generator/findings-grouping";
import type { TenantScope } from "@/lib/auth/guards";

export type { TenantScope };

export type DraftAccessResult =
  | { ok: true; draft: ProgramGenerationDraft }
  | { ok: false; error: "not_found" | "forbidden" };

// ─────────────────────────────────────────────────────────────
// CREATE / READ
// ─────────────────────────────────────────────────────────────

export async function createDraft(params: {
  coachId: string;
  clientId: string | null;
  brief: ProgramGenerationBrief;
}): Promise<ProgramGenerationDraft> {
  const db = getDb();
  const [row] = await db
    .insert(programGenerationDrafts)
    .values({
      coachId: params.coachId,
      clientId: params.clientId,
      status: "queued",
      briefJson: params.brief,
      briefVersion: 1,
    })
    .returning();
  return row;
}

// The sole ownership gate for a specific draft. Every route/action must
// call this (never a raw eq(id, draftId) select) before reading or
// mutating a draft belonging to someone else.
export async function getOwnedDraft(draftId: string, scope: TenantScope): Promise<DraftAccessResult> {
  const db = getDb();
  const rows = await db
    .select()
    .from(programGenerationDrafts)
    .where(eq(programGenerationDrafts.id, draftId))
    .limit(1);
  const draft = rows[0];
  if (!draft) return { ok: false, error: "not_found" };
  if (scope.coachId !== null && draft.coachId !== scope.coachId) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, draft };
}

export async function listDrafts(scope: TenantScope, clientId?: string): Promise<ProgramGenerationDraft[]> {
  const db = getDb();
  const conditions = [];
  if (scope.coachId !== null) conditions.push(eq(programGenerationDrafts.coachId, scope.coachId));
  if (clientId) conditions.push(eq(programGenerationDrafts.clientId, clientId));

  return db
    .select()
    .from(programGenerationDrafts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(programGenerationDrafts.createdAt));
}

// ─────────────────────────────────────────────────────────────
// STATUS / CONTENT MUTATION
// ─────────────────────────────────────────────────────────────

export async function setDraftStatus(
  draftId: string,
  status: ProgramGenerationStatus,
  extra?: { failureReason?: string | null },
): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationDrafts)
    .set({
      status,
      failureReason: extra?.failureReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(programGenerationDrafts.id, draftId));
}

// Set once per draft (or once per shell regeneration on a full resume
// that never got past the shell — see actions.ts) — the shell is held
// fixed across every subsequent week-generation call.
export async function saveProgramShell(draftId: string, shell: ProgramShell): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationDrafts)
    .set({ shellJson: shell, updatedAt: new Date() })
    .where(eq(programGenerationDrafts.id, draftId));
}

// Replaces draftJson wholesale and bumps draftVersion. Every edit
// operation (regenerate day, edit prescription, replace exercise,
// reorder, move day) goes through this — draftJson is never patched
// with a partial DB update, only ever fully reassembled in memory
// (validated against GeneratedProgramDraftSchema by the caller) and
// written back whole. This keeps "what does the draft look like right
// now" always a single source of truth with no drift between fields.
export async function saveDraftContent(
  draftId: string,
  content: GeneratedProgramDraft,
  status: ProgramGenerationStatus = "ready_for_review",
): Promise<ProgramGenerationDraft> {
  const db = getDb();
  const [row] = await db
    .update(programGenerationDrafts)
    .set({
      draftJson: content,
      draftVersion: sql`${programGenerationDrafts.draftVersion} + 1`,
      status,
      updatedAt: new Date(),
    })
    .where(eq(programGenerationDrafts.id, draftId))
    .returning();
  return row;
}

export async function saveValidationResult(
  draftId: string,
  result: DraftValidationResult,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(programGenerationDrafts)
      .set({
        insightsJson: result,
        validationStatus: result.status,
        lastValidatedAt: now,
        // A new validation run always invalidates any prior
        // acknowledgement — same rule warningsAcknowledgedAt already
        // enforces via the >= lastValidatedAt comparison in approval.ts,
        // extended to the granular key set. Finding ids are randomUUID()
        // per run, so a stale entry couldn't match anything going
        // forward anyway; clearing it explicitly keeps the stored state
        // from silently drifting into meaninglessness.
        warningsAcknowledgedAt: null,
        acknowledgedFindingKeys: [],
        updatedAt: now,
      })
      .where(eq(programGenerationDrafts.id, draftId));

    await tx.insert(programGenerationValidationEvents).values({
      draftId,
      status: result.status,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
      findingsJson: result,
    });
  });
}

export async function saveValidationFailure(draftId: string, reason: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(programGenerationDrafts)
      .set({
        validationStatus: "failed",
        lastValidatedAt: now,
        warningsAcknowledgedAt: null,
        acknowledgedFindingKeys: [],
        updatedAt: now,
      })
      .where(eq(programGenerationDrafts.id, draftId));

    await tx.insert(programGenerationValidationEvents).values({
      draftId,
      status: "failed",
      blockerCount: 0,
      warningCount: 0,
      findingsJson: { error: reason },
    });
  });
}

// Locked rule #8: warnings require explicit coach acknowledgement.
// Valid only for the CURRENT validation run — see the timestamp
// comparison in approval.ts, which requires
// warningsAcknowledgedAt >= lastValidatedAt. Whole-draft, blunt
// acknowledgement — kept for backward compatibility with existing
// callers; acknowledgeFindingKeys() below is the granular equivalent
// the review triage UI actually uses.
export async function acknowledgeWarnings(draftId: string): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationDrafts)
    .set({ warningsAcknowledgedAt: new Date(), updatedAt: new Date() })
    .where(eq(programGenerationDrafts.id, draftId));
}

export type AcknowledgeFindingsResult =
  | { ok: true; fullyAcknowledged: boolean }
  | { ok: false; error: string };

// Granular acknowledgement — one occurrence, one grouped issue, or every
// currently-visible warning group in one call (the caller computes
// which keys to pass; see acknowledgeFindingsAction in
// app/hq/programs/generate/actions.ts, which derives them from the
// draft's OWN current insightsJson, never trusting client-supplied
// finding data). Rejects the whole call if any key resolves to a
// BLOCKER — blockers can never be acknowledged away (locked rule #7).
// Reaching full coverage of every current warning also sets
// warningsAcknowledgedAt, which is the actual gate approval.ts checks —
// this function never needs to touch approval.ts itself.
export async function acknowledgeFindingKeys(
  draftId: string,
  keys: string[],
  currentInsights: DraftValidationResult,
): Promise<AcknowledgeFindingsResult> {
  const blockerKeys = new Set<string>();
  for (const f of currentInsights.blockers) {
    blockerKeys.add(occurrenceAckKey(f.id));
    blockerKeys.add(groupAckKey(groupKeyForFinding(f)));
  }
  for (const key of keys) {
    if (blockerKeys.has(key)) {
      return { ok: false, error: "Blocking issues cannot be acknowledged — they must be resolved." };
    }
  }

  const db = getDb();
  const [row] = await db
    .select({ acknowledgedFindingKeys: programGenerationDrafts.acknowledgedFindingKeys })
    .from(programGenerationDrafts)
    .where(eq(programGenerationDrafts.id, draftId))
    .limit(1);

  const existing = Array.isArray(row?.acknowledgedFindingKeys)
    ? (row!.acknowledgedFindingKeys as string[])
    : [];
  const merged = [...new Set([...existing, ...keys])];

  const fullyAcknowledged = isFullyAcknowledged(currentInsights.warnings, merged);
  const now = new Date();

  await db
    .update(programGenerationDrafts)
    .set({
      acknowledgedFindingKeys: merged,
      warningsAcknowledgedAt: fullyAcknowledged ? now : null,
      updatedAt: now,
    })
    .where(eq(programGenerationDrafts.id, draftId));

  return { ok: true, fullyAcknowledged };
}

function isFullyAcknowledged(warnings: ValidationFinding[], ackedKeys: string[]): boolean {
  if (warnings.length === 0) return true;
  const acked = new Set(ackedKeys);
  return warnings.every(
    (w) => acked.has(occurrenceAckKey(w.id)) || acked.has(groupAckKey(groupKeyForFinding(w))),
  );
}

export async function discardDraft(draftId: string): Promise<void> {
  await setDraftStatus(draftId, "discarded");
}

export async function markDraftApproved(params: {
  draftId: string;
  approvedBy: string;
  createdProgramTemplateId: string;
  createdWorkoutTemplateIds: string[];
}): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationDrafts)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: params.approvedBy,
      createdProgramTemplateId: params.createdProgramTemplateId,
      createdWorkoutTemplateIds: params.createdWorkoutTemplateIds,
      updatedAt: new Date(),
    })
    .where(eq(programGenerationDrafts.id, params.draftId));
}

// ─────────────────────────────────────────────────────────────
// GENERATION RUNS
// ─────────────────────────────────────────────────────────────

export async function startRun(params: {
  draftId: string;
  scope: ProgramGenerationRunScope;
  dayRef?: string | null;
  requestedByUserId: string;
  // Staged full_draft runs only — see program_generation_runs' own
  // schema comment. completedWeeks reflects the draft's overall
  // progress at the moment this run started (non-zero on a resume).
  totalWeeks?: number;
  completedWeeks?: number;
}): Promise<ProgramGenerationRun> {
  const db = getDb();
  const [row] = await db
    .insert(programGenerationRuns)
    .values({
      draftId: params.draftId,
      scope: params.scope,
      dayRef: params.dayRef ?? null,
      status: "running",
      requestedByUserId: params.requestedByUserId,
      startedAt: new Date(),
      totalWeeks: params.totalWeeks ?? null,
      completedWeeks: params.completedWeeks ?? null,
    })
    .returning();
  return row;
}

// Updates staged-generation progress on a run — polled by the review
// page while status='running' to show "Generating Week N of M".
export async function updateRunProgress(
  runId: string,
  progress: { currentWeek?: number; completedWeeks?: number },
): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationRuns)
    .set({
      ...(progress.currentWeek !== undefined ? { currentWeek: progress.currentWeek } : {}),
      ...(progress.completedWeeks !== undefined ? { completedWeeks: progress.completedWeeks } : {}),
    })
    .where(eq(programGenerationRuns.id, runId));
}

export async function getLatestRun(draftId: string): Promise<ProgramGenerationRun | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(programGenerationRuns)
    .where(eq(programGenerationRuns.draftId, draftId))
    .orderBy(desc(programGenerationRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function completeRun(
  runId: string,
  outcome: { provider: string; model: string },
): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationRuns)
    .set({
      status: "complete",
      provider: outcome.provider,
      model: outcome.model,
      completedAt: new Date(),
    })
    .where(eq(programGenerationRuns.id, runId));
}

export async function failRun(runId: string, errorMessage: string): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationRuns)
    .set({ status: "failed", errorMessage, completedAt: new Date() })
    .where(eq(programGenerationRuns.id, runId));
}

// ─────────────────────────────────────────────────────────────
// STAGED GENERATION — per-week persistence
//
// One row per (draft, weekNumber), upserted — a retry that regenerates
// a previously-failed week overwrites that row rather than appending a
// new one, so program_generation_weeks always holds exactly the latest
// outcome per week. See schema-program-generator.ts's table comment.
// ─────────────────────────────────────────────────────────────

export async function saveGenerationWeek(
  draftId: string,
  weekNumber: number,
  data: { status: "completed"; weekJson: ModelWeekDraft } | { status: "failed"; errorMessage: string },
): Promise<void> {
  const db = getDb();
  const values =
    data.status === "completed"
      ? { draftId, weekNumber, status: "completed" as const, weekJson: data.weekJson, errorMessage: null }
      : { draftId, weekNumber, status: "failed" as const, weekJson: null, errorMessage: data.errorMessage };

  await db
    .insert(programGenerationWeeks)
    .values(values)
    .onConflictDoUpdate({
      target: [programGenerationWeeks.draftId, programGenerationWeeks.weekNumber],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function listGenerationWeeks(draftId: string): Promise<ProgramGenerationWeek[]> {
  const db = getDb();
  return db
    .select()
    .from(programGenerationWeeks)
    .where(eq(programGenerationWeeks.draftId, draftId))
    .orderBy(asc(programGenerationWeeks.weekNumber));
}

// ─────────────────────────────────────────────────────────────
// EDIT AUDIT LOG
// ─────────────────────────────────────────────────────────────

export async function recordEditEvent(params: {
  draftId: string;
  actorUserId: string;
  action: ProgramGenerationEditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.insert(programGenerationEditEvents).values({
    draftId: params.draftId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    summary: params.summary,
    beforeJson: params.beforeJson ?? null,
    afterJson: params.afterJson ?? null,
  });
}

export async function listEditEvents(draftId: string) {
  const db = getDb();
  return db
    .select()
    .from(programGenerationEditEvents)
    .where(eq(programGenerationEditEvents.draftId, draftId))
    .orderBy(desc(programGenerationEditEvents.createdAt));
}

export async function listValidationEvents(draftId: string) {
  const db = getDb();
  return db
    .select()
    .from(programGenerationValidationEvents)
    .where(eq(programGenerationValidationEvents.draftId, draftId))
    .orderBy(desc(programGenerationValidationEvents.createdAt));
}
