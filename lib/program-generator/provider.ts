// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Provider Adapter
//
// SERVER-ONLY. This is the only file in the feature that may reference
// an LLM API key or call out to a model provider — never inline an API
// call anywhere else (validation.ts, approval.ts, and every route/action
// only ever call the exported generate*() functions below).
//
// Environment configuration (no hardcoded paid model choice):
//   PROGRAM_GENERATOR_MODEL      — required for the real provider. A
//     Vercel AI Gateway model string, e.g. "anthropic/claude-sonnet-4-5"
//     or "openai/gpt-4o". Read at call time, never a compiled-in default.
//   PROGRAM_GENERATOR_TIMEOUT_MS — optional. When set, OVERRIDES the
//     per-call-type default below for every call (shell, week, day
//     regen) uniformly — an emergency/ops escape hatch, not the normal
//     tuning knob. Applied PER provider call, never once for the whole
//     staged generation.
//
//   P0 incident (production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a,
//   "Maddie"): every attempt failed at Week 1 with "Generation exceeded
//   45000ms and was aborted." A single week's structured-output call
//   (up to WEEK_MAX_OUTPUT_TOKENS) can legitimately take longer than
//   45s at real-world Claude Sonnet throughput — 45s was simply too
//   short, not a provider outage. Fixed with per-call-type defaults
//   below instead of one blanket constant, because shell/week/day-regen
//   have very different output sizes (and the week default, unlike day
//   regen, sits inside runStagedGeneration()'s sequential per-week loop
//   — see that file's GENERATION_TIME_BUDGET_MS comment for why the
//   week default can't just be set as generously as day regen's without
//   separately bounding how many weeks one invocation attempts. Vercel
//   Hobby's function duration is capped at a HARD 300s — default and
//   maximum are the same number on this plan, so a per-call timeout
//   alone can never be raised enough to "solve" an unbounded sequential
//   loop; the two fixes are independent and both required).
//   PROGRAM_GENERATOR_USE_FIXTURE — optional, "true" to force the dev
//     fixture provider even if PROGRAM_GENERATOR_MODEL is also set.
//     Must be explicit — the fixture is never a silent fallback for a
//     misconfigured or failing real provider. If neither the model env
//     var nor the fixture flag is set, generation fails safely with
//     errorCode "not_configured" rather than guessing a default model.
//
// Staged generation (replaces the old single generateObject() call that
// asked the model for an entire multi-week Program at once — see
// docs/incident notes on the resulting 180s timeouts):
//   generateProgramShell() — one small call defining the Program's
//     structure (title, day labels, phase/progression outline) with no
//     workout content at all.
//   generateProgramDay()   — one call per DAY, using ModelDayDraftSchema
//     directly (already-existing contract — one shell day is exactly a
//     ModelDayDraft, the same element type ModelWeekDraft.days always
//     held). This is the staged path's actual per-call unit as of the
//     P0 day-level architecture change below — bounded to a single
//     day's output regardless of how many days/weeks the whole Program
//     has, and paired with a narrowed, day-relevant candidate set
//     (exercise-candidates.ts's narrowCandidatesForDay()) rather than
//     the full program-wide pool.
//   generateProgramWeek()  — RETAINED but no longer called by the
//     staged path (staged-generation.ts's per-week loop now drives
//     generateProgramDay() once per shell day instead). See the P0
//     note below for why: even after generateProgramWeek()'s own
//     timeout was doubled to 90s, production draft
//     1e39ca9a-c7d5-4e08-9f96-adefda1ba91a's Week 1 call still did not
//     complete — proof the problem was the size/complexity of a single
//     call, not its timeout value. Left in place (unused by production
//     code, still covered by its own existing tests) rather than
//     deleted as part of this already-large change; a reasonable
//     follow-up cleanup, not required for correctness.
// This file is provider-only: it returns unresolved model output
// (ProgramShell / ModelDayDraft / ModelWeekDraft) and never assembles,
// resolves exercises, or persists anything — that composition happens
// in lib/program-generator/staged-generation.ts and actions.ts.
//
// generateObject() enforces schema-conforming structured output at the
// provider boundary — the zod schemas passed to it (ProgramShellSchema,
// ModelWeekDraftSchema, ModelProgramDraftSchema) are the same ones used
// everywhere else in contracts.ts, so "structured JSON output" and
// "strict schema rejection" are the same mechanism, not two independent
// implementations to keep in sync.
//
// maxOutputTokens is set explicitly per call type (never left to a
// provider's own default) and maxRetries is 1, never the AI SDK's
// default of 2 — each call is now sized to comfortably fit its expected
// output, so a 3rd attempt at an already-correctly-sized request buys
// little; one retry still absorbs a single transient blip without
// tripling worst-case latency the way the default would.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { generateObject } from "ai";
import type { z } from "zod";
import {
  ProgramShellSchema,
  ModelWeekDraftSchema,
  ModelDayDraftSchema,
  ModelProgramDraftSchema,
  type ProgramShell,
  type ProgramShellDay,
  type ModelWeekDraft,
  type ModelDayDraft,
  type ModelProgramDraft,
  type GeneratedProgramDraft,
  type ProgramGenerationBrief,
} from "./contracts";
import {
  buildShellGenerationPrompt,
  buildWeekGenerationPrompt,
  buildDayGenerationPrompt,
  buildDayRegenerationPrompt,
  type DayBlueprintIntent,
} from "./prompt";
import type { ClientContextSummary } from "./client-context";
import {
  buildFixtureProgramDraft,
  buildFixtureProgramShell,
  buildFixtureProgramWeek,
  buildFixtureProgramDay,
} from "./fixture";
import type { ExerciseCandidate, ExerciseCandidateSet } from "./exercise-candidates";

export type GenerationErrorCode =
  | "not_configured"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "cancelled"
  | "unknown";

// elapsedMs/timeoutMs exist so callers can emit
// lib/program-generator/observability.ts's structured logs without
// duplicating timing logic — this file is the only place a provider
// call's clock actually runs (see callProvider() below).
export interface GenerationFailure {
  ok: false;
  errorCode: GenerationErrorCode;
  errorMessage: string;
  provider: string;
  model: string;
  elapsedMs: number;
  timeoutMs: number;
}

export interface ShellGenerationSuccess {
  ok: true;
  shell: ProgramShell;
  provider: string;
  model: string;
  elapsedMs: number;
}
export type ShellGenerationOutcome = ShellGenerationSuccess | GenerationFailure;

export interface WeekGenerationSuccess {
  ok: true;
  week: ModelWeekDraft;
  provider: string;
  model: string;
  elapsedMs: number;
}
export type WeekGenerationOutcome = WeekGenerationSuccess | GenerationFailure;

// The staged path's actual per-call unit as of the P0 day-level
// architecture change — see this file's header comment.
export interface DayGenerationSuccess {
  ok: true;
  day: ModelDayDraft;
  provider: string;
  model: string;
  elapsedMs: number;
}
export type DayGenerationOutcome = DayGenerationSuccess | GenerationFailure;

// Retained for regenerateDayDraft(), which still returns a full
// ModelProgramDraft (see that function's own comment) — not part of the
// staged-generation redesign this file otherwise implements.
export interface GenerationSuccess {
  ok: true;
  draft: ModelProgramDraft;
  provider: string;
  model: string;
  elapsedMs: number;
}
export type GenerationOutcome = GenerationSuccess | GenerationFailure;

// Per-call-type defaults, not one blanket constant — see file header
// for the reasoning (output size varies a lot by call type, and the
// week default specifically has to stay compatible with
// runStagedGeneration()'s sequential-loop time budget). All three are
// exported so staged-generation.ts's budget guard can reason about the
// REAL configured week timeout (respecting the env override) rather
// than duplicating a hardcoded number that could silently drift out of
// sync with this file's.
//
//   SHELL — smallest output (SHELL_MAX_OUTPUT_TOKENS); a call still
//     stuck at 60s is much more likely a genuine hang than legitimate
//     slowness, so it keeps a tighter ceiling than week/day-regen.
//   WEEK  — the call responsible for Maddie's incident. RETAINED for
//     generateProgramWeek() (unused by the staged path — see this
//     file's header comment) but no longer load-bearing for production
//     correctness: doubling this to 90s did NOT resolve the incident
//     (production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a's Week 1
//     call still ran the full 90,007ms without completing) — proof the
//     problem was call size/complexity, not this number.
//   DAY   — the staged path's actual per-call unit now. No production
//     measurement exists yet (no staging provider credentials were
//     available when this was written — see the architecture report
//     for this task); reasoned conservatively from the week evidence
//     instead: a single day's requested output (DAY_MAX_OUTPUT_TOKENS)
//     is a small fraction of WEEK_MAX_OUTPUT_TOKENS, and the week call
//     ran a FULL 90s without completing at 8,000 output tokens against
//     a ~150-candidate catalog — a day-sized call asks for roughly
//     1/5-1/7 of that content against a narrowed (~30-60 candidate,
//     see exercise-candidates.ts's narrowCandidatesForDay) catalog.
//     45s — the SAME number that proved insufficient for a full WEEK
//     pre-fix — should be generous for something this much smaller,
//     but this is an estimate, not a measurement: revisit once real
//     staged latency data exists (Phase 14/21 of the architecture
//     report explicitly could not be run in that environment either).
//   DAY_REGEN — largest output cap (DAY_REGEN_MAX_OUTPUT_TOKENS) and,
//     unlike week/day, always exactly one call outside any sequential
//     loop — no cumulative-duration concern, so it can afford the most
//     generous default. Unrelated to this change (see that function's
//     own comment) — untouched.
export const SHELL_DEFAULT_TIMEOUT_MS = 60_000;
export const WEEK_DEFAULT_TIMEOUT_MS = 90_000;
export const DAY_DEFAULT_TIMEOUT_MS = 45_000;
export const DAY_REGEN_DEFAULT_TIMEOUT_MS = 120_000;

// Sized from measured output for realistic content at each scope (see
// the latency investigation this staged design replaces): a lightweight
// shell (title/description/~7 day labels/~4-8 phases) is a few hundred
// tokens of real content; a single week (up to 7 days x up to 12
// sections x up to 30 prescriptions, realistically far less) is bounded
// to a small fraction of what a whole multi-week program required.
//
// DAY_MAX_OUTPUT_TOKENS: one day's worth of the same content (up to 12
// sections x up to 30 prescriptions — contracts.ts's ModelBlueprintSchema
// bounds are per-day already, unchanged).
//
// Real staging benchmark (real Claude Sonnet 4 calls via the AI Gateway,
// against the seeded staging exercise library — see the day-level
// generator review-remediation report for the full 7-case table) found
// the original 2,000 ("reasoned conservatively," never measured — see
// git history) genuinely too tight: an intensity-technique day
// (supersets/drop-sets/rest-pause, 48 candidates) hit finishReason:
// "length" at exactly 2,000 output tokens and failed schema validation
// with a truncated, incomplete object — NoObjectGeneratedError,
// "provider_unavailable" — reproduced twice, consistently, ~20s wasted
// per attempt, zero output. The same prompt with maxOutputTokens raised
// to 3,500 succeeded using only 2,284 output tokens (finishReason:
// "stop"). Every one of the 5 non-intensity-technique benchmark cases
// (simple/standard/full-body/restrictive-equipment/candidate-heavy, up
// to 150 candidates) completed well inside 2,000. 3,500 covers the
// measured need with ~35% headroom, without moving anywhere near
// WEEK_MAX_OUTPUT_TOKENS scale.
const SHELL_MAX_OUTPUT_TOKENS = 2_000;
const WEEK_MAX_OUTPUT_TOKENS = 8_000;
const DAY_MAX_OUTPUT_TOKENS = 3_500;
// regenerateDayDraft() still asks the model to echo the whole draft back
// (see that function) — unchanged scope for this redesign, but still
// worth an explicit bound rather than an unset provider default.
const DAY_REGEN_MAX_OUTPUT_TOKENS = 16_000;

// Never the SDK default (2) — see file header.
const PROVIDER_MAX_RETRIES = 1;

// PROGRAM_GENERATOR_TIMEOUT_MS, when set, overrides every call type
// uniformly (ops escape hatch). Unset (the normal case) falls through
// to the per-call-type default passed in by the caller.
export function resolveTimeoutMs(defaultMs: number): number {
  const raw = process.env.PROGRAM_GENERATOR_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

function isFixtureModeEnabled(): boolean {
  return process.env.PROGRAM_GENERATOR_USE_FIXTURE === "true";
}

// ─────────────────────────────────────────────────────────────
// REAL PROVIDER — Vercel AI Gateway via the `ai` package. Model is a
// plain "provider/model" gateway string read from the environment; this
// file never names a specific paid model as a fallback. Generic over
// the schema/output type so shell, week, and day-regeneration calls
// share one implementation of the not_configured/timeout/provider_
// unavailable handling instead of three copies of it.
// ─────────────────────────────────────────────────────────────

interface CallProviderParams<T> {
  prompt: string;
  schema: z.ZodType<T>;
  timeoutMs: number;
  maxOutputTokens: number;
}

type CallProviderResult<T> =
  | { ok: true; object: T; provider: string; model: string; elapsedMs: number }
  | GenerationFailure;

async function callProvider<T>(params: CallProviderParams<T>): Promise<CallProviderResult<T>> {
  const startedAt = Date.now();
  const model = process.env.PROGRAM_GENERATOR_MODEL;
  if (!model) {
    return {
      ok: false,
      errorCode: "not_configured",
      errorMessage:
        "PROGRAM_GENERATOR_MODEL is not set and PROGRAM_GENERATOR_USE_FIXTURE is not enabled. " +
        "Configure a model (e.g. PROGRAM_GENERATOR_MODEL=anthropic/claude-sonnet-4-5) or explicitly " +
        "enable the development fixture.",
      provider: "unconfigured",
      model: "unconfigured",
      elapsedMs: Date.now() - startedAt,
      timeoutMs: params.timeoutMs,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const result = await generateObject({
      model,
      schema: params.schema,
      prompt: params.prompt,
      abortSignal: controller.signal,
      maxOutputTokens: params.maxOutputTokens,
      maxRetries: PROVIDER_MAX_RETRIES,
    });
    clearTimeout(timer);

    return { ok: true, object: result.object, provider: "vercel-ai-gateway", model, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        errorMessage: `Generation exceeded ${params.timeoutMs}ms and was aborted.`,
        provider: "vercel-ai-gateway",
        model,
        elapsedMs: Date.now() - startedAt,
        timeoutMs: params.timeoutMs,
      };
    }

    // AI SDK throws a typed NoObjectGeneratedError (and similar) when
    // the model's output doesn't conform to the schema — including when
    // maxOutputTokens cuts generation off before a valid object is
    // complete — or a provider/network error for transport failures. We
    // don't discriminate further here — both are "the provider did not
    // give us a usable result" and both must fail safely (locked rule:
    // no partial persistence, safe failure state).
    //
    // err.message only — NEVER err.cause or (for NoObjectGeneratedError
    // specifically) err.text, which can carry the model's raw generated
    // output. This is the one place that boundary is enforced; see
    // observability.ts's header comment for why it's still truncated
    // again defensively before being logged.
    return {
      ok: false,
      errorCode: "provider_unavailable",
      errorMessage: err instanceof Error ? err.message : "Unknown provider error.",
      provider: "vercel-ai-gateway",
      model,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: params.timeoutMs,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// DEV FIXTURE PROVIDER — only reachable when explicitly enabled. Never
// a silent fallback. See lib/program-generator/fixture.ts.
// ─────────────────────────────────────────────────────────────

// Fixture calls are synchronous/in-process (no provider round trip and
// no real timeout window), so elapsedMs/timeoutMs are always 0 here —
// never fabricated, just genuinely not applicable.
async function callFixtureShellProvider(brief: ProgramGenerationBrief): Promise<ShellGenerationOutcome> {
  const shell = buildFixtureProgramShell(brief);
  return { ok: true, shell, provider: "dev-fixture", model: "dev-fixture", elapsedMs: 0 };
}

async function callFixtureWeekProvider(
  weekNumber: number,
  shell: ProgramShell,
  candidates: ExerciseCandidate[],
): Promise<WeekGenerationOutcome> {
  const week = await buildFixtureProgramWeek(weekNumber, shell, candidates);
  if (!week) {
    return {
      ok: false,
      errorCode: "invalid_output",
      errorMessage:
        "Fixture provider could not build week content — fewer than the minimum required active " +
        "exercises exist in the Exercise Library. Seed more active exercises to use the fixture.",
      provider: "dev-fixture",
      model: "dev-fixture",
      elapsedMs: 0,
      timeoutMs: 0,
    };
  }
  return { ok: true, week, provider: "dev-fixture", model: "dev-fixture", elapsedMs: 0 };
}

async function callFixtureDayProvider(
  shell: ProgramShell,
  dayIndex: number,
  candidates: ExerciseCandidate[],
): Promise<DayGenerationOutcome> {
  const day = await buildFixtureProgramDay(shell, dayIndex, candidates);
  if (!day) {
    return {
      ok: false,
      errorCode: "invalid_output",
      errorMessage:
        "Fixture provider could not build day content — fewer than the minimum required active " +
        "exercises exist in the Exercise Library. Seed more active exercises to use the fixture.",
      provider: "dev-fixture",
      model: "dev-fixture",
      elapsedMs: 0,
      timeoutMs: 0,
    };
  }
  return { ok: true, day, provider: "dev-fixture", model: "dev-fixture", elapsedMs: 0 };
}

async function callFixtureProvider(candidates: ExerciseCandidate[]): Promise<GenerationOutcome> {
  const draft = await buildFixtureProgramDraft(candidates);
  if (!draft) {
    return {
      ok: false,
      errorCode: "invalid_output",
      errorMessage:
        "Fixture provider could not build a draft — fewer than the minimum required active " +
        "exercises exist in the Exercise Library. Seed more active exercises to use the fixture.",
      provider: "dev-fixture",
      model: "dev-fixture",
      elapsedMs: 0,
      timeoutMs: 0,
    };
  }
  return { ok: true, draft, provider: "dev-fixture", model: "dev-fixture", elapsedMs: 0 };
}

// ─────────────────────────────────────────────────────────────
// [Monday-first scheduling remediation — independent review fix,
// candidate 637b665] Codex review findings on the first pass:
//
// P1: explicit free-text scheduling ("Train Sunday through Thursday")
// can legitimately produce [0,1,2,3,4], and the original normalizer
// had no access to the brief/freeformInstructions at all, so it
// silently overrode that explicit coach intent to [1,2,3,4,5]. Fixed
// by threading freeformInstructions through and skipping normalization
// entirely whenever hasExplicitWeekdayIntent() finds a named weekday.
//
// P2: the original check used SET equality, so a permutation like
// [2,0,1] — not the naive ascending sequence at all — also qualified
// as "the ambiguous default." Fixed by requiring the exact ascending
// positional pattern (days[i].dayOfWeek === i for every i), which a
// genuinely-arbitrary or intentional non-ascending arrangement can
// never satisfy.
// ─────────────────────────────────────────────────────────────

// Recognizes an explicit, deterministic mention of a specific calendar
// day (or "weekend[s]", which unambiguously and deterministically means
// Saturday+Sunday — unlike "weekdays," which is ambiguous about count/
// which days, so deliberately NOT included; see the task's own
// "weekdays preferred"/"early in the week" exclusions). Word-boundary,
// case-insensitive, single regex pass — deliberately NOT general NLP.
// Accepted abbreviations match the standard English set (Sun, Mon,
// Tue/Tues, Wed, Thu/Thurs, Fri, Sat), each with an optional trailing
// "s" for plurals ("Tuesdays and Saturdays"). Word boundaries mean this
// also correctly matches inside "Mon-Fri" and "Sat/Sun" (hyphen and
// slash are non-word characters, so \b still lands on either side of
// the token) without needing separate range/pair handling — any string
// containing at least one recognized day name is enough to suppress
// normalization; the MODEL, not this function, is responsible for
// interpreting the full requested schedule into dayOfWeek values.
//
// Known, accepted false-positive risk (documented rather than silently
// ignored): a few of the required abbreviations are also ordinary
// English words in isolation ("Sat" as past tense of "sit", "Sun" as
// the star) — the task's own example list explicitly requires
// recognizing bare "Sun"/"Sat" as valid day abbreviations, so this
// trade-off is inherent to the spec, not an oversight. The cost of a
// rare false positive here (occasionally leaving an ambiguous default
// un-normalized) is low and fails toward preserving whatever the model
// produced, never toward inventing something new.
const WEEKDAY_TOKEN_PATTERN = new RegExp(
  "\\b(" +
    [
      "sundays?",
      "suns?",
      "mondays?",
      "mons?",
      "tuesdays?",
      "tuess?",
      "tues?",
      "wednesdays?",
      "weds?",
      "thursdays?",
      "thurss?",
      "thus?",
      "fridays?",
      "fris?",
      "saturdays?",
      "sats?",
      "weekends?",
    ].join("|") +
    ")\\b",
  "i",
);

export function hasExplicitWeekdayIntent(freeformInstructions?: string | null): boolean {
  if (!freeformInstructions) return false;
  return WEEKDAY_TOKEN_PATTERN.test(freeformInstructions);
}

// This targets ONLY the exact, narrow signature of "the model picked
// no specific days at all and defaulted to naive sequential slots
// starting at 0" — i.e. days[i].dayOfWeek === i for every position,
// for n scheduled days (see the P2 fix note above: exact ascending
// order, not mere set membership). Any OTHER arrangement — Tue/Thu/Sat,
// weekends, a deliberately Sunday-anchored split, or even a permutation
// of {0,...,n-1} that isn't already in ascending order — is left
// byte-for-byte untouched, on top of the explicit-intent check above.
//
// Deliberately excludes n === 1: a single chosen day trivially "looks
// like" {0}, the exact same shape as the ambiguous-default signature,
// with zero structural way to distinguish "the model defaulted" from
// "the coach explicitly wants only Sunday training" beyond the
// freeform-text check above (which still applies and still helps when
// the coach actually named the day) — there is no contract field
// carrying explicit day-of-week intent (checked: brief only has
// daysPerWeek/preferredSplit/freeformInstructions, nothing structural).
// The prompt instruction (telling the model to default to Monday even
// for a single day) is the primary defense for the single-day case
// when no day name was mentioned at all.
//
// Deliberately excludes n >= 7: every day of the week is used
// regardless of "start day" — there is no distinct Monday-first
// variant to normalize toward, and shifting would push a value out of
// the valid 0-6 range.
export function normalizeAmbiguousShellSchedule(
  days: ProgramShellDay[],
  freeformInstructions?: string | null,
): ProgramShellDay[] {
  const n = days.length;
  if (n <= 1 || n >= 7) return days;
  if (hasExplicitWeekdayIntent(freeformInstructions)) return days;

  const isExactAscendingDefault = days.every((d, i) => d.dayOfWeek === i);
  if (!isExactAscendingDefault) return days;

  // Exact match — shift every day forward by one (0->1, 1->2, ..., n-1->n),
  // landing on {1, ..., n}: Monday through the nth consecutive day, still
  // fully within the valid 0-6 range since n <= 6 here. Only dayOfWeek
  // moves; label/focus/targetMuscleGroups and array position are untouched.
  return days.map((d) => ({ ...d, dayOfWeek: d.dayOfWeek + 1 }));
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API — staged generation
// ─────────────────────────────────────────────────────────────

export async function generateProgramShell(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  candidateSet?: ExerciseCandidateSet,
): Promise<ShellGenerationOutcome> {
  if (isFixtureModeEnabled()) {
    const fixtureResult = await callFixtureShellProvider(brief);
    return fixtureResult.ok
      ? {
          ...fixtureResult,
          shell: { ...fixtureResult.shell, days: normalizeAmbiguousShellSchedule(fixtureResult.shell.days, brief.freeformInstructions) },
        }
      : fixtureResult;
  }

  const prompt = buildShellGenerationPrompt(brief, clientContext, candidateSet);
  const result = await callProvider({
    prompt,
    schema: ProgramShellSchema,
    timeoutMs: resolveTimeoutMs(SHELL_DEFAULT_TIMEOUT_MS),
    maxOutputTokens: SHELL_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  const shell = { ...result.object, days: normalizeAmbiguousShellSchedule(result.object.days, brief.freeformInstructions) };
  return { ok: true, shell, provider: result.provider, model: result.model, elapsedMs: result.elapsedMs };
}

// The staged path's actual per-call unit — see this file's header
// comment for the P0 architecture change this replaced
// generateProgramWeek() with. dayIndex is 1-based into shell.days
// (same identity program_generation_days uses) — shellDay is that
// exact element, already resolved by the caller (staged-generation.ts)
// so this function stays a pure "ask for one day" primitive with no
// index-lookup logic of its own.
export async function generateProgramDay(params: {
  brief: ProgramGenerationBrief;
  clientContext: ClientContextSummary | null;
  shell: ProgramShell;
  weekNumber: number;
  dayIndex: number;
  shellDay: ProgramShellDay;
  priorSameDaySummary: string | null;
  weekSoFarSummary: string | null;
  candidates: ExerciseCandidate[];
  // Phase D — see prompt.ts's DayBlueprintIntent for the full rationale.
  // Absent for every caller except the new blueprint-guided canonical-
  // week path; the fixture provider ignores it entirely (same as every
  // other prompt-only field), so this is a no-op for existing callers.
  blueprintIntent?: DayBlueprintIntent | null;
}): Promise<DayGenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureDayProvider(params.shell, params.dayIndex, params.candidates);

  const prompt = buildDayGenerationPrompt(
    params.brief,
    params.clientContext,
    params.shell,
    params.weekNumber,
    params.shellDay,
    params.priorSameDaySummary,
    params.weekSoFarSummary,
    params.candidates,
    params.blueprintIntent ?? null,
  );
  const result = await callProvider({
    prompt,
    schema: ModelDayDraftSchema,
    timeoutMs: resolveTimeoutMs(DAY_DEFAULT_TIMEOUT_MS),
    maxOutputTokens: DAY_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, day: result.object, provider: result.provider, model: result.model, elapsedMs: result.elapsedMs };
}

export async function generateProgramWeek(params: {
  brief: ProgramGenerationBrief;
  clientContext: ClientContextSummary | null;
  shell: ProgramShell;
  weekNumber: number;
  priorWeekSummary: string | null;
  candidates: ExerciseCandidate[];
}): Promise<WeekGenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureWeekProvider(params.weekNumber, params.shell, params.candidates);

  const prompt = buildWeekGenerationPrompt(
    params.brief,
    params.clientContext,
    params.shell,
    params.weekNumber,
    params.priorWeekSummary,
    params.candidates,
  );
  const result = await callProvider({
    prompt,
    schema: ModelWeekDraftSchema,
    timeoutMs: resolveTimeoutMs(WEEK_DEFAULT_TIMEOUT_MS),
    maxOutputTokens: WEEK_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, week: result.object, provider: result.provider, model: result.model, elapsedMs: result.elapsedMs };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API — regenerate a single day within an already-generated
// draft. Still asks the model to echo the whole draft back (only the
// targeted day should actually change) — this predates, and is
// independent of, the staged shell/week redesign above: a single day
// was already a small, bounded request, not the source of the 180s
// timeouts staged generation exists to fix. Left unchanged in scope,
// though still worth its own explicit output cap (DAY_REGEN_MAX_OUTPUT_TOKENS)
// rather than an unset provider default.
// ─────────────────────────────────────────────────────────────

export async function regenerateDayDraft(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  existingDraft: GeneratedProgramDraft,
  dayId: string,
  instruction: string | undefined,
  candidates: ExerciseCandidate[],
): Promise<GenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureProvider(candidates);

  const prompt = buildDayRegenerationPrompt(brief, clientContext, existingDraft, dayId, instruction, candidates);
  const result = await callProvider({
    prompt,
    schema: ModelProgramDraftSchema,
    timeoutMs: resolveTimeoutMs(DAY_REGEN_DEFAULT_TIMEOUT_MS),
    maxOutputTokens: DAY_REGEN_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, draft: result.object, provider: result.provider, model: result.model, elapsedMs: result.elapsedMs };
}
