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
import { and, eq, gt, asc, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import { clientProfiles } from "./schema";
import {
  programGenerationDrafts,
  programGenerationRuns,
  programGenerationWeeks,
  programGenerationEditEvents,
  programGenerationValidationEvents,
  programGenerationQuotaClaims,
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
import { parseGeneratedProgramDraft, parseProgramShell } from "@/lib/program-generator/contracts";
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

export interface DraftAttentionSummary {
  id: string;
  clientId: string | null;
  clientName: string | null;
  title: string | null;
  status: ProgramGenerationStatus;
  currentWeek: number | null;
  totalWeeks: number | null;
  createdAt: Date;
}

// Drafts a coach needs eyes on right now: still generating (queued/
// running, so the coach knows work is in flight) or finished and
// waiting on their review. Used by the HQ Overview dashboard only —
// title resolves from draftJson.name once generation completes, or
// shellJson.title while a run is still in progress and only the shell
// step has landed; both are optional so a freshly-queued draft with
// neither yet just falls back to null (rendered as "Untitled" by the
// caller) rather than blocking on a parse.
export async function listAttentionDrafts(
  scope: TenantScope,
  limit = 8,
): Promise<DraftAttentionSummary[]> {
  const db = getDb();
  const conditions = [
    inArray(programGenerationDrafts.status, ["queued", "running", "ready_for_review"]),
  ];
  if (scope.coachId !== null) conditions.push(eq(programGenerationDrafts.coachId, scope.coachId));

  const rows = await db
    .select({
      id: programGenerationDrafts.id,
      clientId: programGenerationDrafts.clientId,
      clientName: clientProfiles.fullName,
      shellJson: programGenerationDrafts.shellJson,
      draftJson: programGenerationDrafts.draftJson,
      status: programGenerationDrafts.status,
      createdAt: programGenerationDrafts.createdAt,
    })
    .from(programGenerationDrafts)
    .leftJoin(clientProfiles, eq(programGenerationDrafts.clientId, clientProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(programGenerationDrafts.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (r) => {
      let currentWeek: number | null = null;
      let totalWeeks: number | null = null;
      if (r.status === "queued" || r.status === "running") {
        const run = await getLatestRun(r.id);
        currentWeek = run?.currentWeek ?? null;
        totalWeeks = run?.totalWeeks ?? null;
      }

      const draftParsed = r.draftJson ? parseGeneratedProgramDraft(r.draftJson) : null;
      const shellParsed =
        !draftParsed?.ok && r.shellJson ? parseProgramShell(r.shellJson) : null;
      const title = draftParsed?.ok
        ? draftParsed.data.name
        : shellParsed?.ok
          ? shellParsed.data.title
          : null;

      return {
        id: r.id,
        clientId: r.clientId,
        clientName: r.clientName,
        title,
        status: r.status,
        currentWeek,
        totalWeeks,
        createdAt: r.createdAt,
      };
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// STATUS / CONTENT MUTATION
// ─────────────────────────────────────────────────────────────

// Atomic "failed → running" claim, closing a real double-submit race: two
// near-simultaneous resume calls (double-click, a client retry after a
// slow response) could otherwise both read status="failed" before either
// had written "running", both proceed into runStagedGeneration(), and
// race to persist/overwrite each other's output at the end — no
// corruption (each run's own in-memory weeks stay internally
// consistent), but a wasted duplicate generation and an unpredictable
// "which attempt's draft survives" outcome. A single conditional UPDATE
// guarantees only one caller ever observes success. Returns false if
// another caller already claimed it (or the draft isn't "failed").
export async function claimFailedDraftForResume(draftId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(programGenerationDrafts)
    .set({ status: "running", failureReason: null, updatedAt: new Date() })
    .where(and(eq(programGenerationDrafts.id, draftId), eq(programGenerationDrafts.status, "failed")))
    .returning({ id: programGenerationDrafts.id });
  return rows.length > 0;
}

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

export async function failRun(
  runId: string,
  errorMessage: string,
  outcome?: { provider?: string; model?: string },
): Promise<void> {
  const db = getDb();
  await db
    .update(programGenerationRuns)
    .set({
      status: "failed",
      errorMessage,
      ...(outcome?.provider ? { provider: outcome.provider } : {}),
      ...(outcome?.model ? { model: outcome.model } : {}),
      completedAt: new Date(),
    })
    .where(eq(programGenerationRuns.id, runId));
}

// ─────────────────────────────────────────────────────────────
// RATE LIMIT — per-coach AI generation quota
//
// Guards the ONLY thing on this feature that costs real provider money:
// generateProgramShell() / generateProgramWeek() (staged-generation.ts)
// and regenerateDayDraft() (actions.ts's regenerateDayAction). Every
// call site that is actually about to reach one of those must first
// call claimGenerationQuota() and abort (with a user-facing message) if
// it returns { ok: false }.
//
// Numbers (revised during final cost/security review — see git history
// for the original 20/hour proposal and the review that tightened it):
//   GENERATION_QUOTA_LIMIT = 10 per coach per rolling hour.
//
//   Model-call volume (inspected from the actual configured workflow,
//   not guessed): PROGRAM_GENERATOR_MODEL=anthropic/claude-sonnet-4 via
//   the Vercel AI Gateway (see .env.local / provider.ts). A fresh
//   full-program generation is 1 shell call (<=2,000 output tokens,
//   provider.ts's SHELL_MAX_OUTPUT_TOKENS) + 1 generateProgramWeek()
//   call per week (<=8,000 output tokens each, WEEK_MAX_OUTPUT_TOKENS).
//   contracts.ts caps brief.weeks at 16, so MAXIMUM is 1 + 16 = 17 model
//   calls / ~130,000 output tokens per generation. TYPICAL is far lower:
//   GenerateBriefForm.tsx pre-fills the brief's "Weeks" field with 8 (the
//   coach can type anything 1-16, but 8 is what an un-modified submit
//   produces) — i.e. a typical generation is 1 + 8 = 9 model calls,
//   ~66,000 output tokens worst-case-per-call-cap (actual usage is
//   normally well under each call's cap). regenerateDayDraft() (Regenerate
//   Day) is always exactly 1 model call, <=16,000 output tokens.
//
//   Worst-case hourly exposure at the ORIGINAL 20/hour proposal:
//   20 x 17 = 340 model calls/hour. At the REVISED 10/hour limit:
//   10 x 17 = 170 model calls/hour — a 50% cut to the worst-case ceiling
//   for the exact same "generous, launch-safe" intent, chosen over an
//   even tighter 6/hour or 8/hour: realistic legitimate usage (one
//   fresh generation + an occasional resume/retry + a handful of
//   Regenerate Day touch-ups while reviewing ONE client's draft) lands
//   around 4-9 claims per working session by the same call-volume
//   reasoning above, and 6/hour or 8/hour risks a single thorough
//   one-client review session (initial gen, one retry, several day
//   regens) occasionally tripping the limiter — the opposite of "normal
//   coaches should not notice." 10/hour keeps real headroom over that
//   typical 4-9 range while still meaningfully tightening the cost
//   ceiling a malicious loop / compromised session / automation bug is
//   capped at. One rolling window (not a separate tighter burst limit)
//   is the smallest control that still fully bounds rapid-fire clicking
//   or a tight retry loop — after the 10th claim in the window, every
//   further attempt is rejected regardless of how fast it arrives.
//
//   Dollar-cost figures are deliberately not stated here — current
//   Anthropic/gateway pricing is not encoded anywhere in this repo or
//   its config, and inventing a number would be a guess dressed up as
//   data. The reasoning above is call-volume-based, which is what this
//   repo can actually substantiate.
//
// Unit of account: one claim per top-level action invocation that will
// make at least one model call — NOT one claim per generateProgramWeek()
// call. Counting per-action keeps a normal multi-week generation
// invisible to the limiter (goal: "normal coaches should not notice the
// limiter"); counting per-model-call would charge a single legitimate
// 12-week generation 13 units against the same budget a 1-day regenerate
// costs 1 unit, which is a worse approximation of "how many times has
// this coach asked for a generation" than it is of raw token spend, and
// this feature's real cost driver is attempts, not week count (a coach
// cannot ask for an especially long program to burn extra quota faster
// than someone doing many short ones).
//
// Separate ledger from program_generation_runs (deliberately — see
// programGenerationQuotaClaims' own schema comment): program_generation_
// runs is written unconditionally, including on code paths that make
// ZERO model calls (a resume whose shell + every week already completed,
// where only finalization failed last time; a candidate-exhaustion
// failure that never reaches the model). Charging quota there would
// violate "resume/retry behavior must not accidentally consume quota
// incorrectly if it does not create a new paid model invocation." Every
// call site below only calls claimGenerationQuota() once it has already
// determined a real model call is imminent.
//
// Identity: coachId here is always the caller's OWN server-resolved
// identity (requireCoachOrAdmin() -> guard.dbUser.id in actions.ts's
// requireActor(), never a client-supplied id) — an admin generating on
// behalf of a coach's client is metered against the admin's own quota,
// exactly mirroring how program_generation_drafts.coach_id already
// attributes the draft. There is no parameter anywhere in this call
// chain that lets a caller charge someone else's bucket.
export const GENERATION_QUOTA_LIMIT = 10;
export const GENERATION_QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// claimId lets a caller release this specific claim later (see
// releaseGenerationQuotaClaim below) — added for the P0 fix to Maddie's
// incident (production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a):
// three real attempts each claimed a unit and each failed on a plain
// infrastructure timeout (the provider call was aborted before
// producing anything), not on the coach's own request pattern. A
// "failed attempts are charged the same as successful ones" policy is
// otherwise correct (see this function's own header comment — this
// feature's real cost driver is attempts, tokens are genuinely spent
// even on a failure that returns real model output) but a definitive
// *timeout* means zero usable output was ever produced — the provider
// call was killed by OUR OWN configured ceiling, not a cost the coach
// should absorb. Only `errorCode: "timeout"` failures in
// staged-generation.ts / regenerateDayAction release their claim;
// every other failure (invalid_output, provider_unavailable,
// not_configured, a real validation failure after real content came
// back) still counts, unchanged.
export type ClaimQuotaResult = { ok: true; claimId: string } | { ok: false; retryAfterMs: number };

// Atomicity under concurrency: a plain "SELECT count(*) ... ; if under
// limit, INSERT" is a genuine TOCTOU race between two concurrent callers
// for the SAME coach — Postgres does not serialize two independent
// INSERT...SELECT statements against each other just because the SELECT
// is nested inside the INSERT (that only makes the read+write atomic
// with respect to itself, not with respect to a second connection
// running the same statement at the same time). To close that race
// without taking a table-wide lock (which would serialize unrelated
// coaches' claims against each other and hurt normal throughput), this
// wraps the count-and-insert in one transaction guarded by
// pg_advisory_xact_lock(hashtext(coachId)) — a lock keyed on the coach's
// own id. Two concurrent claims for the SAME coach are forced to run
// one-at-a-time (the second blocks until the first commits, then
// re-reads the now-current count); two different coaches never contend
// for each other's lock, so tenant isolation and normal cross-coach
// throughput are unaffected. The lock auto-releases at transaction end
// (commit or rollback) — no manual unlock path to forget.
//
// hashtext(coachId) is a 32-bit hash, so pg_advisory_xact_lock(bigint)
// is keyed on a ~4.3 billion-value space — collision probability across
// the small number of coaches ever concurrently claiming at once is
// negligible, and even a coincidental collision between two DIFFERENT
// coaches would only serialize their claim attempts against each other
// for a few milliseconds longer; it can never cause a correctness issue,
// because every SELECT/INSERT inside the transaction is still scoped by
// the coach's REAL id (`coachId = ${coachId}`), never by the hash — the
// hash only ever decides lock contention/ordering, not which rows are
// counted or inserted.
//
// Connection-pool safety (lib/db/client.ts's getDb() caps the whole
// app's pool at max: 3 against Supabase's Session Mode pooler): a
// blocked pg_advisory_xact_lock() call holds its connection for as long
// as it waits, and Postgres has no default cap on that wait. A coach
// firing many concurrent claim attempts — exactly the "malicious loop /
// automation bug" scenario this whole feature exists to bound — would,
// without a bound, queue every extra attempt indefinitely on the SAME
// lock, each one pinning one of only 3 app-wide connections for the
// duration of its wait; enough concurrent attempts could stall unrelated
// requests elsewhere in the app, not just this coach's own. `SET LOCAL
// lock_timeout` bounds that: scoped to this transaction only (never
// leaks to any other query on the connection), it makes a blocked lock
// acquisition fail fast with Postgres error 55P03 (lock_not_available)
// after 2s instead of waiting unboundedly. 2s comfortably exceeds how
// long a legitimate double-click/retry race actually contends for the
// lock (the winning transaction's own count+insert is a couple of
// simple indexed queries — low milliseconds) while still bounding
// worst-case connection-hold time per blocked waiter under a genuine
// burst. A lock_timeout is treated the same as "over quota, try again
// shortly" rather than a raw DB error surfacing to the coach — it is a
// contention signal, not a data problem.
export async function claimGenerationQuota(
  coachId: string,
  draftId: string | null,
  scope: ProgramGenerationRunScope,
): Promise<ClaimQuotaResult> {
  const db = getDb();
  const cutoff = new Date(Date.now() - GENERATION_QUOTA_WINDOW_MS);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '2s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${coachId}))`);

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(programGenerationQuotaClaims)
        .where(
          and(
            eq(programGenerationQuotaClaims.coachId, coachId),
            gt(programGenerationQuotaClaims.createdAt, cutoff),
          ),
        );

      if (count >= GENERATION_QUOTA_LIMIT) {
        const [oldest] = await tx
          .select({ createdAt: programGenerationQuotaClaims.createdAt })
          .from(programGenerationQuotaClaims)
          .where(
            and(
              eq(programGenerationQuotaClaims.coachId, coachId),
              gt(programGenerationQuotaClaims.createdAt, cutoff),
            ),
          )
          .orderBy(asc(programGenerationQuotaClaims.createdAt))
          .limit(1);

        const retryAfterMs = oldest
          ? Math.max(0, oldest.createdAt.getTime() + GENERATION_QUOTA_WINDOW_MS - Date.now())
          : GENERATION_QUOTA_WINDOW_MS;

        return { ok: false, retryAfterMs };
      }

      const [inserted] = await tx
        .insert(programGenerationQuotaClaims)
        .values({ coachId, draftId, scope })
        .returning({ id: programGenerationQuotaClaims.id });
      return { ok: true, claimId: inserted.id };
    });
  } catch (err) {
    // Postgres 55P03 = lock_not_available — the lock_timeout above
    // tripped because this coach already has another claim attempt in
    // flight. Same user-facing shape as "over quota" (a short, clear
    // "try again" — see actions.ts/staged-generation.ts's message
    // formatting) rather than a raw 500, but a much shorter retry
    // window since this is contention, not exhaustion. Any other error
    // (a genuine DB failure) is not swallowed — it propagates exactly
    // like every other unexpected failure in this service layer.
    if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "55P03") {
      return { ok: false, retryAfterMs: 5_000 };
    }
    throw err;
  }
}

// Undoes a specific quota claim — see ClaimQuotaResult's own comment
// for exactly when this should (and should not) be called: only when
// the attempt that claim paid for produced zero usable provider output
// (a definitive timeout), never for a failure that got real content
// back from the model. Deleting (not just marking) the row is correct
// here: the claims table is a pure rolling-window counter (see this
// file's count(*) query above) with no other reader that would need a
// tombstone — a deleted row simply never counts against the coach's
// window, exactly as if the claim had never been taken. Best-effort:
// a delete that hits zero rows (already deleted, or the id was never a
// real claim) is not an error — never let quota bookkeeping cleanup
// fail the caller's actual failure-handling path.
export async function releaseGenerationQuotaClaim(claimId: string): Promise<void> {
  const db = getDb();
  await db.delete(programGenerationQuotaClaims).where(eq(programGenerationQuotaClaims.id, claimId));
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
