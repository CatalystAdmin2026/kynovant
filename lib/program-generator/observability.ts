// ─────────────────────────────────────────────────────────────
// Kynovant — AI Program Generator: Production Observability
//
// Narrow, sanitized structured logging for generation failures,
// provider timing, and quota-release events — added because
// production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a's post-fix
// Week 1 failure could not be diagnosed: production DB access is
// unavailable from this environment, Vercel Hobby's raw runtime logs
// carry no per-request duration or response-body detail, and the
// coach-facing UI intentionally shows one generic failure message for
// every error. This closes that gap by making the next failure (or
// success) legible from Vercel's log viewer alone.
//
// Every line here is exactly one console.error/console.log call with
// a stable bracket-prefixed tag and a compact JSON payload — grep-able
// from Vercel's log viewer without any new tooling or dashboard.
//
// STRICT allowlist — every field actually logged is named explicitly
// in the interfaces below. There is no field here a caller could use
// to smuggle through a client name/email, medical/nutrition detail,
// prompt text, full model response, the exercise catalog, an API key,
// a cookie, a token, or a database URL — none of those are accepted
// parameters in the first place. In particular:
//   - errorMessage always passes through sanitizeErrorMessage() before
//     being logged — collapsed to one line and length-capped.
//   - provider.ts's callProvider() (the only place a provider error is
//     caught) already reads only `err.message`, never `err.cause` or
//     (for the AI SDK's NoObjectGeneratedError specifically) `err.text`
//     — the field that can carry the model's raw generated output. The
//     truncation here is defense in depth on top of that, not a sign
//     such a body is expected to arrive.
//   - Nothing here ever receives a prompt string, a candidate list, a
//     brief, or a client-context object — the call sites only ever
//     pass draftId/runId/stage/weekNumber/dayNumber/errorCode/
//     errorMessage/provider/model/timing/quota fields, all of which are
//     already-derived, non-sensitive identifiers.
// ─────────────────────────────────────────────────────────────

const MAX_ERROR_MESSAGE_LENGTH = 300;

export function sanitizeErrorMessage(raw: string): string {
  const singleLine = raw.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${singleLine.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : singleLine;
}

export type GenerationStage = "shell" | "week" | "day_regeneration";

export interface GenerationFailureLog {
  draftId: string;
  runId?: string;
  stage: GenerationStage;
  weekNumber?: number;
  dayNumber?: number;
  errorCode: string;
  errorMessage: string;
  provider: string;
  model: string;
  elapsedMs?: number;
  timeoutMs?: number;
  isRetryOrResume: boolean;
  // Meaningful for stage "week" (weeks completed so far in this
  // attempt) and "shell" (always 0 by construction). Not applicable
  // to "day_regeneration", which has no week-progress concept — omit
  // rather than pass a 0 that would misleadingly read as "zero weeks
  // done" for a stage that doesn't track weeks at all.
  completedWeeks?: number;
  quotaClaimed?: boolean;
  quotaReleased?: boolean;
}

// console.error (not .log) — this is unambiguously a failure event, and
// Vercel's log viewer lets `level: ["error"]` filter on exactly this.
export function logGenerationFailure(fields: GenerationFailureLog): void {
  console.error(
    "[PROGRAM_GENERATOR_FAILURE]",
    JSON.stringify({
      draftId: fields.draftId,
      runId: fields.runId,
      stage: fields.stage,
      weekNumber: fields.weekNumber,
      dayNumber: fields.dayNumber,
      errorCode: fields.errorCode,
      errorMessage: sanitizeErrorMessage(fields.errorMessage),
      provider: fields.provider,
      model: fields.model,
      elapsedMs: fields.elapsedMs,
      timeoutMs: fields.timeoutMs,
      isRetryOrResume: fields.isRetryOrResume,
      completedWeeks: fields.completedWeeks,
      quotaClaimed: fields.quotaClaimed,
      quotaReleased: fields.quotaReleased,
    }),
  );
}

export interface ProviderSuccessLog {
  draftId: string;
  stage: GenerationStage;
  weekNumber?: number;
  dayNumber?: number;
  provider: string;
  model: string;
  elapsedMs: number;
}

// One line per provider call, not per token/exercise — see this
// file's header. Gives real latency distribution (p50/p95/tail)
// instead of guessing from a handful of incident timestamps.
export function logProviderSuccess(fields: ProviderSuccessLog): void {
  console.log(
    "[PROGRAM_GENERATOR_PROVIDER_OK]",
    JSON.stringify({
      draftId: fields.draftId,
      stage: fields.stage,
      weekNumber: fields.weekNumber,
      dayNumber: fields.dayNumber,
      provider: fields.provider,
      model: fields.model,
      elapsedMs: fields.elapsedMs,
    }),
  );
}

export interface QuotaReleaseLog {
  draftId: string;
  runId?: string;
  reason: string;
  success: boolean;
}

// success/failure describes the release DB operation itself (did the
// delete run without throwing), not whether a row happened to exist —
// see releaseGenerationQuotaClaim's own doc comment: zero rows deleted
// is an expected, non-error outcome, not a "failure" here.
export function logQuotaRelease(fields: QuotaReleaseLog): void {
  console.log(
    "[PROGRAM_GENERATOR_QUOTA_RELEASE]",
    JSON.stringify({
      draftId: fields.draftId,
      runId: fields.runId,
      reason: fields.reason,
      success: fields.success,
    }),
  );
}
