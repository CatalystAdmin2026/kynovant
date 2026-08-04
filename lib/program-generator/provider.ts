// ─────────────────────────────────────────────────────────────
// Kynovant — AI-Assisted Program Generator: Provider Adapter
//
// SERVER-ONLY. This is the only file in the feature that may reference
// an LLM API key or call out to a model provider — never inline an API
// call anywhere else (validation.ts, approval.ts, and every route/action
// only ever call generateProgramDraft()/regenerateDay() below).
//
// Environment configuration (no hardcoded paid model choice):
//   PROGRAM_GENERATOR_MODEL      — required for the real provider. A
//     Vercel AI Gateway model string, e.g. "anthropic/claude-sonnet-4-5"
//     or "openai/gpt-4o". Read at call time, never a compiled-in default.
//   PROGRAM_GENERATOR_TIMEOUT_MS — optional, defaults to 45000.
//   PROGRAM_GENERATOR_USE_FIXTURE — optional, "true" to force the dev
//     fixture provider even if PROGRAM_GENERATOR_MODEL is also set.
//     Must be explicit — the fixture is never a silent fallback for a
//     misconfigured or failing real provider. If neither the model env
//     var nor the fixture flag is set, generation fails safely with
//     errorCode "not_configured" rather than guessing a default model.
//
// AI SDK's generateObject() enforces schema-conforming structured output
// at the provider boundary — the zod schema passed to it is
// ModelProgramDraftSchema (contracts.ts), NOT GeneratedProgramDraftSchema.
// The model-output schema has no exerciseId field on any prescription at
// all, so the model is structurally incapable of being asked to invent
// or infer a database id — it can only ever supply exerciseName.
//
// This file is provider-only: it returns a ModelProgramDraft, the raw
// (unresolved) shape the model produced. Turning that into a real,
// persisted GeneratedProgramDraft — matching exerciseName against the
// Exercise Library — is exercise-resolution.ts's job, composed in the
// orchestration/action layer (app/hq/programs/generate/actions.ts), not
// here. Keeping resolution out of this file means every call site (full
// generation, regenerate-day) is guaranteed to run the exact same
// resolution path, since there's no way to get a GeneratedProgramDraft
// without going through it.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { generateObject } from "ai";
import {
  ModelProgramDraftSchema,
  type ModelProgramDraft,
  type GeneratedProgramDraft,
  type ProgramGenerationBrief,
} from "./contracts";
import { buildProgramGenerationPrompt, buildDayRegenerationPrompt } from "./prompt";
import type { ClientContextSummary } from "./client-context";
import { buildFixtureProgramDraft } from "./fixture";

export type GenerationErrorCode =
  | "not_configured"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "cancelled"
  | "unknown";

export interface GenerationSuccess {
  ok: true;
  draft: ModelProgramDraft;
  provider: string;
  model: string;
}

export interface GenerationFailure {
  ok: false;
  errorCode: GenerationErrorCode;
  errorMessage: string;
  provider: string;
  model: string;
}

export type GenerationOutcome = GenerationSuccess | GenerationFailure;

const DEFAULT_TIMEOUT_MS = 45_000;

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
// file never names a specific paid model as a fallback.
// ─────────────────────────────────────────────────────────────

async function callRealProvider(
  prompt: string,
  timeoutMs: number,
): Promise<GenerationOutcome> {
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await generateObject({
      model,
      schema: ModelProgramDraftSchema,
      prompt,
      abortSignal: controller.signal,
    });
    clearTimeout(timer);

    return {
      ok: true,
      draft: result.object,
      provider: "vercel-ai-gateway",
      model,
    };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        errorCode: "timeout",
        errorMessage: `Generation exceeded ${timeoutMs}ms and was aborted.`,
        provider: "vercel-ai-gateway",
        model,
      };
    }

    // AI SDK throws a typed NoObjectGeneratedError (and similar) when
    // the model's output doesn't conform to the schema, or a
    // provider/network error for transport failures. We don't
    // discriminate further here — both are "the provider did not give
    // us a usable draft" and both must fail safely (locked rule: no
    // partial persistence, safe failure state).
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
// a silent fallback. Returns a small, real, schema-valid draft built
// from actual seeded Exercise Library rows so tests and local dev can
// exercise the full generate → validate → approve pipeline without a
// live API key. See lib/program-generator/fixture.ts for what it
// returns and why those specific exercises were chosen.
// ─────────────────────────────────────────────────────────────

async function callFixtureProvider(): Promise<GenerationOutcome> {
  const draft = await buildFixtureProgramDraft();
  if (!draft) {
    // Not enough active, seeded exercises to assemble a minimal draft.
    // Fails safely rather than fabricating exercise data to fill the gap.
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
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export async function generateProgramDraft(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
): Promise<GenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureProvider();

  const prompt = buildProgramGenerationPrompt(brief, clientContext);
  return callRealProvider(prompt, resolveTimeoutMs());
}

export async function regenerateDayDraft(
  brief: ProgramGenerationBrief,
  clientContext: ClientContextSummary | null,
  existingDraft: GeneratedProgramDraft,
  dayId: string,
  instruction: string | undefined,
): Promise<GenerationOutcome> {
  if (isFixtureModeEnabled()) return callFixtureProvider();

  const prompt = buildDayRegenerationPrompt(brief, clientContext, existingDraft, dayId, instruction);
  return callRealProvider(prompt, resolveTimeoutMs());
}
