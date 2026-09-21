// ─────────────────────────────────────────────────────────────
// Diagnostics pass 1 — provider-boundary error classification and
// sanitized structured-output diagnostics.
//
// Uses the REAL ai@7 NoObjectGeneratedError / TypeValidationError /
// APICallError classes and a REAL ZodError produced by
// ProgramShellSchema.safeParse() — only generateObject() itself is
// mocked (no network), so the error shapes tested here are the shapes
// the SDK actually throws.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject, NoObjectGeneratedError, APICallError, JSONParseError, TypeValidationError } from "ai";
import { generateProgramShell } from "../provider";
import { ProgramShellSchema, parseProgramGenerationBrief } from "../contracts";
import { logGenerationFailure } from "../observability";
import { releaseQuotaOnTimeout } from "../staged-generation";

const mockedGenerateObject = vi.mocked(generateObject);

const RAW_SECRET = "RAW-MODEL-OUTPUT-SECRET-do-not-log";

const brief = (() => {
  const parsed = parseProgramGenerationBrief({
    goal: "muscle_growth",
    weeks: 4,
    daysPerWeek: 3,
    preferredSplit: "full_body",
    experienceLevel: "intermediate",
    equipmentAccess: "commercial_gym",
    targetSessionMinutes: 60,
  });
  if (!parsed.ok) throw new Error("test brief invalid: " + JSON.stringify(parsed));
  return parsed.data;
})();

// A shell that is valid JSON but violates the contract: dayOfWeek 7 (too_big)
// and a phase running past totalWeeks (custom refine). Carries RAW_SECRET in
// a free-text field so leakage would be detectable.
const BAD_SHELL = {
  title: RAW_SECRET,
  description: RAW_SECRET,
  totalWeeks: 4,
  days: [{ dayOfWeek: 7, label: RAW_SECRET }],
  phases: [
    { phaseNumber: 1, name: "Base", weekStart: 1, weekEnd: 9, progressionTarget: RAW_SECRET, isDeload: false },
  ],
  globalConstraints: RAW_SECRET,
};

function realSchemaValidationError(finishReason: "stop" | "length" = "stop") {
  const parsed = ProgramShellSchema.safeParse(BAD_SHELL);
  if (parsed.success) throw new Error("fixture unexpectedly valid");
  const validation = new TypeValidationError({ value: BAD_SHELL, cause: parsed.error });
  return new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    cause: validation,
    text: JSON.stringify(BAD_SHELL),
    response: { id: "r", timestamp: new Date(), modelId: "m", body: { leak: RAW_SECRET } } as never,
    usage: { inputTokens: 1234, outputTokens: 321, totalTokens: 1555 } as never,
    finishReason,
  });
}

beforeEach(() => {
  process.env.PROGRAM_GENERATOR_MODEL = "anthropic/claude-sonnet-4";
  delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
  mockedGenerateObject.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callProvider classification (via generateProgramShell)", () => {
  it("A: schema-validation NoObjectGeneratedError -> invalid_output with sanitized diagnostics", async () => {
    mockedGenerateObject.mockRejectedValueOnce(realSchemaValidationError());
    const out = await generateProgramShell(brief, null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("invalid_output");
    expect(out.errorMessage).toBe("No object generated: response did not match schema.");
    expect(out.validation?.kind).toBe("schema_validation");
    const byPath = Object.fromEntries((out.validation?.issues ?? []).map((i) => [i.path, i.code]));
    expect(byPath["days[0].dayOfWeek"]).toBe("too_big");
    expect(out.validation?.finishReason).toBe("stop");
    expect(out.validation?.inputTokens).toBe(1234);
    expect(out.validation?.outputTokens).toBe(321);
  });

  it("A3: a cross-field refine failure (zod only runs refines once structure is valid) is reported as custom at the refine's path", async () => {
    const refineOnly = { ...BAD_SHELL, days: [{ dayOfWeek: 1, label: "A" }] };
    const parsed = ProgramShellSchema.safeParse(refineOnly);
    if (parsed.success) throw new Error("fixture unexpectedly valid");
    mockedGenerateObject.mockRejectedValueOnce(
      new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        cause: new TypeValidationError({ value: refineOnly, cause: parsed.error }),
        text: JSON.stringify(refineOnly),
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: {} as never,
        finishReason: "stop",
      }),
    );
    const out = await generateProgramShell(brief, null);
    if (out.ok) throw new Error("expected failure");
    expect(out.errorCode).toBe("invalid_output");
    expect(out.validation?.issues).toEqual([
      { path: "phases", code: "custom", message: "Every phase's week range must fall within totalWeeks." },
    ]);
  });

  it("A2: unparseable JSON (e.g. truncated) NoObjectGeneratedError -> invalid_output, kind json_parse, finishReason kept", async () => {
    mockedGenerateObject.mockRejectedValueOnce(
      new NoObjectGeneratedError({
        message: "No object generated: could not parse the response.",
        cause: new JSONParseError({ text: `{"title": "${RAW_SECRET}`, cause: new Error("Unexpected end") }),
        text: `{"title": "${RAW_SECRET}`,
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: {} as never,
        finishReason: "length",
      }),
    );
    const out = await generateProgramShell(brief, null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("invalid_output");
    expect(out.validation?.kind).toBe("json_parse");
    expect(out.validation?.finishReason).toBe("length");
    expect(out.validation?.issues).toEqual([]);
  });

  it("B: genuine provider/transport failure stays provider_unavailable, no validation block", async () => {
    mockedGenerateObject.mockRejectedValueOnce(
      new APICallError({ message: "Service Unavailable", url: "https://gw", requestBodyValues: {}, statusCode: 503 }),
    );
    const out = await generateProgramShell(brief, null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("provider_unavailable");
    expect(out.errorMessage).toBe("Service Unavailable");
    expect(out.validation).toBeUndefined();

    mockedGenerateObject.mockRejectedValueOnce(new Error("fetch failed"));
    const out2 = await generateProgramShell(brief, null);
    if (!out2.ok) expect(out2.errorCode).toBe("provider_unavailable");
  });

  it("C: abort still maps to timeout", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    mockedGenerateObject.mockRejectedValueOnce(abort);
    const out = await generateProgramShell(brief, null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errorCode).toBe("timeout");
      expect(out.validation).toBeUndefined();
    }
  });

  it("F: success path is unchanged", async () => {
    const shell = {
      title: "T",
      description: "D",
      totalWeeks: 4,
      days: [
        { dayOfWeek: 1, label: "A" },
        { dayOfWeek: 3, label: "B" },
        { dayOfWeek: 5, label: "C" },
      ],
      phases: [{ phaseNumber: 1, name: "P", weekStart: 1, weekEnd: 4, progressionTarget: "x", isDeload: false }],
      globalConstraints: "",
    };
    mockedGenerateObject.mockResolvedValueOnce({ object: shell } as never);
    const out = await generateProgramShell(brief, null);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.shell.days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
      expect(out.provider).toBe("vercel-ai-gateway");
    }
  });
});

describe("failure telemetry", () => {
  it("D/E: issue paths reach PROGRAM_GENERATOR_FAILURE and raw model output never does", async () => {
    mockedGenerateObject.mockRejectedValueOnce(realSchemaValidationError());
    const out = await generateProgramShell(brief, null);
    if (out.ok) throw new Error("expected failure");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logGenerationFailure({
      draftId: "d",
      runId: "r",
      stage: "shell",
      errorCode: out.errorCode,
      errorMessage: out.errorMessage,
      provider: out.provider,
      model: out.model,
      elapsedMs: out.elapsedMs,
      timeoutMs: out.timeoutMs,
      isRetryOrResume: false,
      completedWeeks: 0,
      quotaClaimed: true,
      quotaReleased: false,
      validation: out.validation,
    });

    const [tag, json] = errorSpy.mock.calls[0] as [string, string];
    expect(tag).toBe("[PROGRAM_GENERATOR_FAILURE]");
    const payload = JSON.parse(json);
    expect(payload.errorCode).toBe("invalid_output");
    expect(payload.validation.issues.map((i: { path: string }) => i.path)).toContain("days[0].dayOfWeek");
    expect(payload.validation.issues.find((i: { path: string }) => i.path === "days[0].dayOfWeek").code).toBe("too_big");
    expect(payload.quotaClaimed).toBe(true);
    expect(payload.quotaReleased).toBe(false);

    expect(json).not.toContain(RAW_SECRET);
    expect(json).not.toContain("leak");
  });

  it("logger drops any extra keys smuggled onto a validation object", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logGenerationFailure({
      draftId: "d",
      stage: "shell",
      errorCode: "invalid_output",
      errorMessage: "m",
      provider: "p",
      model: "m",
      isRetryOrResume: false,
      validation: {
        kind: "schema_validation",
        issueCount: 1,
        issues: [{ path: "a", code: "custom", message: "msg", input: RAW_SECRET } as never],
        text: RAW_SECRET,
      } as never,
    });
    expect((errorSpy.mock.calls[0] as [string, string])[1]).not.toContain(RAW_SECRET);
  });
});

describe("quota semantics unchanged", () => {
  it("invalid_output is not refundable (only timeout is)", async () => {
    expect(await releaseQuotaOnTimeout("invalid_output", "claim", "d", "r", false)).toBe(false);
    expect(await releaseQuotaOnTimeout("provider_unavailable", "claim", "d", "r", false)).toBe(false);
  });
});
