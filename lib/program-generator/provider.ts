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
//   PROGRAM_GENERATOR_TIMEOUT_MS — optional, defaults to 45000. Applied
//     PER provider call (shell, each week, day regeneration) — a staged
//     generation with 10 weeks makes 11 independently-timed calls, never
//     one call sized to fit the whole program in a single window.
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
//   generateProgramWeek()  — one call per week, using ModelWeekDraftSchema
//     directly (already-existing contract — a single week is exactly a
//     ModelWeekDraft). Bounded to a single week's output regardless of
//     how many weeks the whole Program has.
// This file is provider-only: it returns unresolved model output
// (ProgramShell / ModelWeekDraft) and never assembles, resolves
// exercises, or persists anything — that composition happens in
// app/hq/programs/generate/actions.ts.
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
  ModelProgramDraftSchema,
  type ProgramShell,
  type ModelWeekDraft,
  type ModelProgramDraft,
  type GeneratedProgramDraft,
  type ProgramGenerationBrief,
} from "./contracts";
import {
  buildShellGenerationPrompt,
  buildWeekGenerationPrompt,
  buildDayRegenerationPrompt,
} from "./prompt";
import type { ClientContextSummary } from "./client-context";
import { buildFixtureProgramDraft, buildFixtureProgramShell, buildFixtureProgramWeek } from "./fixture";

export type GenerationErrorCode =
  | "not_configured"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "cancelled"
  | "unknown";

export interface GenerationFailure {
  ok: false;
  errorCode: GenerationErrorCode;
  errorMessage: string;
  provider: string;
  model: string;
}

export interface ShellGenerationSuccess {
  ok: true;
  shell: ProgramShell;
  provider: string;
  model: string;
}
export type ShellGenerationOutcome = ShellGenerationSuccess | GenerationFailure;

export interface WeekGenerationSuccess {
  ok: true;
  week: ModelWeekDraft;
  provider: string;
  model: string;
}
export type WeekGenerationOutcome = WeekGenerationSuccess | GenerationFailure;

// Retained for regenerateDayDraft(), which still returns a full
// ModelProgramDraft (see that function's own comment) — not part of the
// staged-generation redesign this file otherwise implements.
export interface GenerationSuccess {
  ok: true;
  draft: ModelProgramDraft;
  provider: string;
  model: string;
}
export type GenerationOutcome = GenerationSuccess | GenerationFailure;

const DEFAULT_TIMEOUT_MS = 45_000;

// Sized from measured output for realistic content at each scope (see
// the latency investigation this staged design replaces): a lightweight
// shell (title/description/~7 day labels/~4-8 phases) is a few hundred
// tokens of real content; a single week (up to 7 days x up to 12
// sections x up to 30 prescriptions, realistically far less) is bounded
// to a small fraction of what a whole multi-week program required.
const SHELL_MAX_OUTPUT_TOKENS = 2_000;
const WEEK_MAX_OUTPUT_TOKENS = 8_000;
// regenerateDayDraft() still asks the model to echo the whole draft back
// (see that function) — unchanged scope for this redesign, but still
// worth an explicit bound rather than an unset provider default.
const DAY_REGEN_MAX_OUTPUT_TOKENS = 16_000;

// Never the SDK default (2) — see file header.
const PROVIDER_MAX_RETRIES = 1;

function resolveTimeoutMs(): number {
  const raw = process.env.PROGRAM_GENERATOR_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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
  | { ok: true; object: T; provider: string; model: string }
  | GenerationFailure;

async function callProvider<T>(params: CallProviderParams<T>): Promise<CallProviderResult<T>> {
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

    return { ok: true, object: result.object, provider: "vercel-ai-gateway", model };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        errorMessage: `Generation exceeded ${params.timeoutMs}ms and was aborted.`,
        provider: "vercel-ai-gateway",
        model,
      };
    }

    // AI SDK throws a typed NoObjectGeneratedError (and similar) when
    // the model's output doesn't conform to the schema — including when
    // maxOutputTokens cuts generation off before a valid object is
    // complete — or a provider/network error for transport failures. We
    // don't discriminate further here — both are "the provider did not
    // give us a usable result" and both must fail safely (locked rule:
    // no partial persistence, safe failure state).
    return {
      ok: false,
      errorCode: "provider_unavailable",
      errorMessage: err instanceof Error ? err.message : "Unknown provider error.",
      provider: "vercel-ai-gateway",
      model,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// DEV FIXTURE PROVIDER — only reachable when explicitly enabled. Never
// a silent fallback. See lib/program-generator/fixture.ts.
// ─────────────────────────────────────────────────────────────

async function callFixtureShellProvider(brief: ProgramGenerationBrief): Promise<ShellGenerationOutcome> {
  const shell = buildFixtureProgramShell(brief);
  return { ok: true, shell, provider: "dev-fixture", model: "dev-fixture" };
}

async function callFixtureWeekProvider(
  weekNumber: number,
  shell: ProgramShell,
): Promise<WeekGenerationOutcome> {
  const week = await buildFixtureProgramWeek(weekNumber, shell);
  if (!week) {
    return {
      ok: false,
      errorCode: "invalid_output",
      errorMessage:
        "Fixture provider could not build week content — fewer than the minimum required active " +
        "exercises exist in the Exercise Library. Seed more active exercises to use the fixture.",
      provider: "dev-fixture",
      model: "dev-fixture",
    };
  }
  return { ok: true, week, provider: "dev-fixture", model: "dev-fixture" };
}

async function callFixtureProvider(): Promise<GenerationOutcome> {
  const draft = await buildFixtureProgramDraft();
  if (!draft) {
    return {
      ok: false,
      errorCode: "invalid_output",
      errorMessage:
        "Fixture provider could not build a draft — fewer than the minimum required active " +
        "exercises exist in the Exercise Library. Seed more active exercises to use the fixture.",
      provider: "dev-fixture",
      model: "dev-fixture",
    };
  }
  return { ok: true, draft, provider: "dev-fixture", model: "dev-fixture" };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API — staged generation
// ─────────────────────────────────────────────────────────────

export async function generateProgramShell(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
): Promise<ShellGenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureShellProvider(brief);

  const prompt = buildShellGenerationPrompt(brief, clientContext);
  const result = await callProvider({
    prompt,
    schema: ProgramShellSchema,
    timeoutMs: resolveTimeoutMs(),
    maxOutputTokens: SHELL_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, shell: result.object, provider: result.provider, model: result.model };
}

export async function generateProgramWeek(params: {
  brief: ProgramGenerationBrief;
  clientContext: ClientContextSummary | null;
  shell: ProgramShell;
  weekNumber: number;
  priorWeekSummary: string | null;
}): Promise<WeekGenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureWeekProvider(params.weekNumber, params.shell);

  const prompt = buildWeekGenerationPrompt(
    params.brief,
    params.clientContext,
    params.shell,
    params.weekNumber,
    params.priorWeekSummary,
  );
  const result = await callProvider({
    prompt,
    schema: ModelWeekDraftSchema,
    timeoutMs: resolveTimeoutMs(),
    maxOutputTokens: WEEK_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, week: result.object, provider: result.provider, model: result.model };
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
): Promise<GenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureProvider();

  const prompt = buildDayRegenerationPrompt(brief, clientContext, existingDraft, dayId, instruction);
  const result = await callProvider({
    prompt,
    schema: ModelProgramDraftSchema,
    timeoutMs: resolveTimeoutMs(),
    maxOutputTokens: DAY_REGEN_MAX_OUTPUT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, draft: result.object, provider: result.provider, model: result.model };
}
