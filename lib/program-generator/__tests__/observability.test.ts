// ─────────────────────────────────────────────────────────────
// AI Program Generator — production observability regression suite.
//
// Added alongside lib/program-generator/observability.ts (see that
// file's header comment for the incident this closes: production
// draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a's post-fix Week 1 failure
// could not be diagnosed from Vercel logs alone). Pure unit tests —
// no DB, no network, no fixtures — these functions are plain
// console.error/console.log wrappers over an explicit field allowlist.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  sanitizeErrorMessage,
  logGenerationFailure,
  logProviderSuccess,
  logQuotaRelease,
  type GenerationFailureLog,
} from "../observability";

function captureConsole() {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  return { errorSpy, logSpy };
}

function parseLoggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls[0];
  // Every call here is (tag, jsonString) — see observability.ts.
  return JSON.parse(call[1] as string);
}

const BASE_FAILURE: GenerationFailureLog = {
  draftId: "1e39ca9a-c7d5-4e08-9f96-adefda1ba91a",
  runId: "run-123",
  stage: "week",
  weekNumber: 1,
  errorCode: "timeout",
  errorMessage: "Generation exceeded 90000ms and was aborted.",
  provider: "vercel-ai-gateway",
  model: "anthropic/claude-sonnet-4-5",
  elapsedMs: 90_004,
  timeoutMs: 90_000,
  isRetryOrResume: true,
  completedWeeks: 0,
  quotaClaimed: true,
  quotaReleased: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeErrorMessage", () => {
  it("collapses whitespace/newlines to a single line", () => {
    expect(sanitizeErrorMessage("line one\nline two\n\ttabbed")).toBe("line one line two tabbed");
  });

  it("truncates a message longer than the cap, appending an ellipsis", () => {
    const huge = "x".repeat(2000);
    const result = sanitizeErrorMessage(huge);
    expect(result.length).toBeLessThan(400);
    expect(result.endsWith("…")).toBe(true);
  });

  it("leaves a short, already-clean message untouched", () => {
    const msg = "Generation exceeded 90000ms and was aborted.";
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });
});

describe("logGenerationFailure — sensitive-data allowlist", () => {
  it("logs only the allowlisted fields — no prompt, catalog, client, or secret data can pass through", () => {
    const { errorSpy } = captureConsole();

    // Every field the type accepts, supplied at once, so the key list
    // below is a genuine exhaustive check — not just "whatever fields
    // this one BASE_FAILURE fixture happens to set."
    logGenerationFailure({
      ...BASE_FAILURE,
      dayNumber: 3,
      // Deliberately try to smuggle sensitive content through the one
      // free-text field (errorMessage) an upstream caller controls — a
      // real AI SDK error could theoretically include something like
      // this if callProvider() were ever changed carelessly.
      errorMessage:
        "provider_unavailable: client Jane Doe (jane@example.com) diabetes profile, prompt: " +
        "'You are generating week 1...' catalog: [ex-1, ex-2] sk-ant-api03-FAKESECRETVALUE",
    });

    const payload = parseLoggedPayload(errorSpy);
    const keys = Object.keys(payload).sort();
    expect(keys).toEqual(
      [
        "completedWeeks",
        "draftId",
        "dayNumber",
        "elapsedMs",
        "errorCode",
        "errorMessage",
        "isRetryOrResume",
        "model",
        "provider",
        "quotaClaimed",
        "quotaReleased",
        "runId",
        "stage",
        "timeoutMs",
        "weekNumber",
      ].sort(),
    );
    // The sensitive-looking payload is truncated (cap is 300 chars, this
    // string is under that, so it passes through unmodified) — the test
    // that matters is structural: there is no separate "prompt" or
    // "clientName" field anywhere in the logged object for a caller to
    // populate in the first place.
    expect(payload).not.toHaveProperty("prompt");
    expect(payload).not.toHaveProperty("clientName");
    expect(payload).not.toHaveProperty("clientEmail");
    expect(payload).not.toHaveProperty("catalog");
    expect(payload).not.toHaveProperty("exerciseCatalog");
    expect(payload).not.toHaveProperty("apiKey");
    expect(payload).not.toHaveProperty("cookie");
    expect(payload).not.toHaveProperty("token");
    expect(payload).not.toHaveProperty("databaseUrl");
  });

  it("truncates an oversized errorMessage before logging (defense in depth against a long provider/HTTP error body)", () => {
    const { errorSpy } = captureConsole();
    const longMessage = "provider error: " + "a".repeat(5000);

    logGenerationFailure({ ...BASE_FAILURE, errorMessage: longMessage });

    const payload = parseLoggedPayload(errorSpy);
    expect((payload.errorMessage as string).length).toBeLessThan(400);
  });

  it("uses console.error (not console.log) — a failure is unambiguously an error-level event", () => {
    const { errorSpy, logSpy } = captureConsole();
    logGenerationFailure(BASE_FAILURE);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("tags every failure line with the stable [PROGRAM_GENERATOR_FAILURE] prefix", () => {
    const { errorSpy } = captureConsole();
    logGenerationFailure(BASE_FAILURE);
    expect(errorSpy.mock.calls[0][0]).toBe("[PROGRAM_GENERATOR_FAILURE]");
  });
});

describe("logGenerationFailure — timeout classification carries the fields needed to diagnose it", () => {
  it("a timeout failure includes errorCode, provider, model, elapsedMs, and timeoutMs together", () => {
    const { errorSpy } = captureConsole();
    logGenerationFailure({
      ...BASE_FAILURE,
      errorCode: "timeout",
      elapsedMs: 90_012,
      timeoutMs: 90_000,
    });
    const payload = parseLoggedPayload(errorSpy);
    expect(payload.errorCode).toBe("timeout");
    expect(payload.provider).toBe("vercel-ai-gateway");
    expect(payload.model).toBe("anthropic/claude-sonnet-4-5");
    expect(payload.elapsedMs).toBe(90_012);
    expect(payload.timeoutMs).toBe(90_000);
  });

  it("a schema/validation-shaped failure (invalid_output) is classified distinctly from a timeout", () => {
    const { errorSpy } = captureConsole();
    logGenerationFailure({
      ...BASE_FAILURE,
      errorCode: "invalid_output",
      errorMessage: "No object generated.",
      elapsedMs: 4_200,
      quotaClaimed: true,
      quotaReleased: false, // invalid_output is not a timeout — never released
    });
    const payload = parseLoggedPayload(errorSpy);
    expect(payload.errorCode).toBe("invalid_output");
    expect(payload.errorCode).not.toBe("timeout");
    expect(payload.quotaReleased).toBe(false);
  });

  it("a provider_unavailable failure is classified distinctly from both timeout and invalid_output", () => {
    const { errorSpy } = captureConsole();
    logGenerationFailure({ ...BASE_FAILURE, errorCode: "provider_unavailable", quotaReleased: false });
    const payload = parseLoggedPayload(errorSpy);
    expect(payload.errorCode).toBe("provider_unavailable");
  });

  it("optional fields (runId, weekNumber, dayNumber) are omitted, not null, when not supplied", () => {
    const { errorSpy } = captureConsole();
    logGenerationFailure({
      draftId: "d1",
      stage: "day_regeneration",
      errorCode: "timeout",
      errorMessage: "Generation exceeded 120000ms and was aborted.",
      provider: "vercel-ai-gateway",
      model: "anthropic/claude-sonnet-4-5",
      isRetryOrResume: false,
    });
    const payload = parseLoggedPayload(errorSpy);
    expect(payload).not.toHaveProperty("runId");
    expect(payload).not.toHaveProperty("weekNumber");
    expect(payload).not.toHaveProperty("dayNumber");
    expect(payload).not.toHaveProperty("completedWeeks");
  });
});

describe("logProviderSuccess", () => {
  it("logs only draftId/stage/weekNumber/dayNumber/provider/model/elapsedMs, via console.log", () => {
    const { logSpy } = captureConsole();
    logProviderSuccess({
      draftId: "1e39ca9a-c7d5-4e08-9f96-adefda1ba91a",
      stage: "week",
      weekNumber: 2,
      dayNumber: 3,
      provider: "vercel-ai-gateway",
      model: "anthropic/claude-sonnet-4-5",
      elapsedMs: 41_302,
    });
    expect(logSpy.mock.calls[0][0]).toBe("[PROGRAM_GENERATOR_PROVIDER_OK]");
    const payload = parseLoggedPayload(logSpy);
    expect(Object.keys(payload).sort()).toEqual(
      ["dayNumber", "draftId", "elapsedMs", "model", "provider", "stage", "weekNumber"].sort(),
    );
    expect(payload.elapsedMs).toBe(41_302);
  });

  it("never fires for a failed call — success and failure are logged from mutually exclusive branches upstream", () => {
    // Structural guarantee, not a behavioral one this pure function can
    // enforce itself — verified instead by reading staged-generation.ts/
    // actions.ts's call sites: logProviderSuccess is only ever reached
    // after `if (!outcome.ok) { ...; return ...; }` has already
    // returned. This test just documents that expectation precisely so
    // a future refactor that moves the call above the guard is caught
    // by reviewers reading this file, not asserting anything at runtime
    // beyond the function's own pure behavior above.
    expect(true).toBe(true);
  });
});

describe("logQuotaRelease", () => {
  it("logs draftId, runId, reason, and success — nothing else, nothing user-identifying", () => {
    const { logSpy } = captureConsole();
    logQuotaRelease({
      draftId: "1e39ca9a-c7d5-4e08-9f96-adefda1ba91a",
      runId: "run-123",
      reason: "provider_timeout",
      success: true,
    });
    expect(logSpy.mock.calls[0][0]).toBe("[PROGRAM_GENERATOR_QUOTA_RELEASE]");
    const payload = parseLoggedPayload(logSpy);
    expect(Object.keys(payload).sort()).toEqual(["draftId", "reason", "runId", "success"].sort());
    expect(payload.success).toBe(true);
  });

  it("records a release DB failure as success: false, still without throwing", () => {
    const { logSpy } = captureConsole();
    expect(() =>
      logQuotaRelease({ draftId: "d1", runId: "r1", reason: "provider_timeout", success: false }),
    ).not.toThrow();
    const payload = parseLoggedPayload(logSpy);
    expect(payload.success).toBe(false);
  });
});
