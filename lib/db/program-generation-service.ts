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
import { and, eq, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  programGenerationDrafts,
  programGenerationRuns,
  programGenerationEditEvents,
  programGenerationValidationEvents,
  type ProgramGenerationDraft,
  type ProgramGenerationStatus,
  type ProgramGenerationRun,
  type ProgramGenerationRunScope,
  type ProgramGenerationEditAction,
} from "./schema-program-generator";
import type { ProgramGenerationBrief, GeneratedProgramDraft } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";
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
// warningsAcknowledgedAt >= lastValidatedAt.
export async function acknowledgeWarnings(draftId: string): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationDrafts)
    .set({ warningsAcknowledgedAt: new Date(), updatedAt: new Date() })
    .where(eq(programGenerationDrafts.id, draftId));
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
    })
    .returning();
  return row;
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
