// ─────────────────────────────────────────────────────────────
// AI Program Generator — per-coach generation rate-limit ledger
// (adversarial test suite)
//
// Real-DB suite, same fixture/cleanup conventions as
// program-generator-integration.test.ts: real Supabase Auth users with
// @isolation-test.invalid emails, robust multi-phase afterAll cleanup
// (captured-error + deferred-rethrow — see that file's own afterAll
// comment for the full rationale, reused verbatim here).
//
// Each test below uses its OWN dedicated coach fixture rather than
// sharing one across the suite — several tests deliberately drive a
// coach's claim count to (or past) GENERATION_QUOTA_LIMIT, which would
// corrupt any other test sharing that coach's ledger within the same
// rolling window.
//
// Server Actions in app/hq/programs/generate/actions.ts require a real
// Next.js request scope (next/headers cookies()) that a bare vitest
// process cannot provide — same constraint already documented by
// coach-signup-security.test.ts / rd-credential-gate.test.ts / etc. — so
// "admin/client spoofing" here is covered by real behavioral tests
// against claimGenerationQuota() (which is what actually enforces the
// limit) plus source-inspection tests proving actions.ts always feeds
// it the guard-resolved actor identity, never client input.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { users } from "../schema";
import { programGenerationQuotaClaims, programGenerationDrafts } from "../schema-program-generator";
import {
  claimGenerationQuota,
  releaseGenerationQuotaClaim,
  createDraft,
  saveProgramShell,
  saveGenerationWeek,
  setDraftStatus,
  GENERATION_QUOTA_LIMIT,
  GENERATION_QUOTA_WINDOW_MS,
} from "../program-generation-service";
import { runStagedGeneration } from "@/lib/program-generator/staged-generation";
import { buildFixtureProgramShell, buildFixtureProgramWeek } from "@/lib/program-generator/fixture";
import type { ProgramGenerationBrief } from "@/lib/program-generator/contracts";

const db = getDb();

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

async function countClaims(coachId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(programGenerationQuotaClaims)
    .where(eq(programGenerationQuotaClaims.coachId, coachId));
  return row?.count ?? 0;
}

const MINIMAL_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 1,
  daysPerWeek: 1,
  preferredSplit: "coach_decides",
  experienceLevel: "intermediate",
  equipmentAccess: "commercial_gym",
  targetSessionMinutes: 60,
  excludedExerciseIds: [],
  allowedTechniques: ["straight_set"],
  avoidedTechniques: [],
  hardSessionCap: false,
  warmupIncluded: true,
  musclePriorities: [],
};

const coachLimit = { id: "" };
const coachIsoA = { id: "" };
const coachIsoB = { id: "" };
const coachConcurrent = { id: "" };
const coachResume = { id: "" };
const coachBoundaryExpired = { id: "" };
const coachBoundaryActive = { id: "" };
// One dedicated coach per releaseGenerationQuotaClaim test — see this
// file's header comment: several of these drive a coach's claim count
// to the limit, which would corrupt a shared ledger across tests.
const coachReleaseBasic = { id: "" };
const coachReleaseLimit = { id: "" };
const coachReleaseIdempotent = { id: "" };
const coachReleaseSpecific = { id: "" };

const draftIds: string[] = [];

async function createAuthUser(label: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `quota-test-${label}-${randomUUID()}@isolation-test.invalid`,
    email_confirm: true,
    password: randomUUID(),
  });
  if (error || !data.user) {
    throw new Error(`Fixture setup failed: createUser(${label}) — ${error?.message}`);
  }
  return data.user.id;
}

beforeAll(async () => {
  [
    coachLimit.id,
    coachIsoA.id,
    coachIsoB.id,
    coachConcurrent.id,
    coachResume.id,
    coachBoundaryExpired.id,
    coachBoundaryActive.id,
    coachReleaseBasic.id,
    coachReleaseLimit.id,
    coachReleaseIdempotent.id,
    coachReleaseSpecific.id,
  ] = await Promise.all([
    createAuthUser("limit"),
    createAuthUser("iso-a"),
    createAuthUser("iso-b"),
    createAuthUser("concurrent"),
    createAuthUser("resume"),
    createAuthUser("boundary-expired"),
    createAuthUser("boundary-active"),
    createAuthUser("release-basic"),
    createAuthUser("release-limit"),
    createAuthUser("release-idempotent"),
    createAuthUser("release-specific"),
  ]);

  await Promise.all(
    [
      coachLimit,
      coachIsoA,
      coachIsoB,
      coachConcurrent,
      coachResume,
      coachBoundaryExpired,
      coachBoundaryActive,
      coachReleaseBasic,
      coachReleaseLimit,
      coachReleaseIdempotent,
      coachReleaseSpecific,
    ].map((c) => db.update(users).set({ role: "coach", status: "active" }).where(eq(users.id, c.id))),
  );
}, 30_000);

// Same captured-error + Promise.allSettled + deferred-rethrow philosophy
// as program-generator-integration.test.ts's afterAll — every phase is
// attempted regardless of an earlier one failing, and the first error is
// rethrown only once everything has been attempted.
afterAll(async () => {
  let firstError: unknown;

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[program-generation-quota cleanup] ${label} failed:`, err instanceof Error ? err.message : err);
      firstError = firstError ?? err;
    }
  };

  const allCoachIds = [
    coachLimit.id,
    coachIsoA.id,
    coachIsoB.id,
    coachConcurrent.id,
    coachResume.id,
    coachBoundaryExpired.id,
    coachBoundaryActive.id,
    coachReleaseBasic.id,
    coachReleaseLimit.id,
    coachReleaseIdempotent.id,
    coachReleaseSpecific.id,
  ].filter(Boolean);

  // program_generation_drafts.coach_id is ON DELETE RESTRICT against
  // users — must go before user deletion. program_generation_runs/
  // weeks/edit_events/validation_events/quota_claims all cascade from
  // the draft row itself, and quota_claims independently also cascades
  // straight from coach_id -> users.id ON DELETE CASCADE, so no
  // separate quota_claims cleanup step is needed here either way.
  await runPhase("delete program_generation_drafts", async () => {
    if (draftIds.length === 0) return;
    await db.delete(programGenerationDrafts).where(inArray(programGenerationDrafts.id, draftIds));
  });

  if (allCoachIds.length > 0) {
    await runPhase("delete public.users rows", async () => {
      await db.delete(users).where(inArray(users.id, allCoachIds));
    });

    await runPhase("delete Supabase Auth users", async () => {
      const adminClient = createAdminClient();
      const results = await Promise.allSettled(allCoachIds.map((id) => adminClient.auth.admin.deleteUser(id)));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    });
  }

  if (firstError) throw firstError;
}, 60_000);

// ─────────────────────────────────────────────────────────────
// Same-coach repeated invocation
// ─────────────────────────────────────────────────────────────

describe("claimGenerationQuota — same coach repeated invocation", () => {
  it(`allows exactly ${GENERATION_QUOTA_LIMIT} claims within the rolling window, then rejects the next one with a useful message`, async () => {
    for (let i = 0; i < GENERATION_QUOTA_LIMIT; i++) {
      const result = await claimGenerationQuota(coachLimit.id, null, "full_draft");
      expect(result.ok).toBe(true);
    }

    const blocked = await claimGenerationQuota(coachLimit.id, null, "full_draft");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(GENERATION_QUOTA_WINDOW_MS);
    }

    expect(await countClaims(coachLimit.id)).toBe(GENERATION_QUOTA_LIMIT);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────
// Cross-coach isolation
// ─────────────────────────────────────────────────────────────

describe("claimGenerationQuota — different coaches isolated", () => {
  it("one coach reaching their limit never blocks a different coach", async () => {
    for (let i = 0; i < GENERATION_QUOTA_LIMIT; i++) {
      expect((await claimGenerationQuota(coachIsoA.id, null, "full_draft")).ok).toBe(true);
    }
    expect((await claimGenerationQuota(coachIsoA.id, null, "full_draft")).ok).toBe(false);

    // coachIsoB has made zero claims — must succeed regardless of
    // coachIsoA's exhausted state.
    expect((await claimGenerationQuota(coachIsoB.id, null, "full_draft")).ok).toBe(true);
    expect(await countClaims(coachIsoB.id)).toBe(1);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────
// Concurrency — the atomicity guarantee itself
// ─────────────────────────────────────────────────────────────

describe("claimGenerationQuota — concurrent attempts", () => {
  it("never lets concurrent claims for the same coach exceed the limit, even when deliberately over-subscribed", async () => {
    const attempts = GENERATION_QUOTA_LIMIT + 10;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => claimGenerationQuota(coachConcurrent.id, null, "full_draft")),
    );

    const succeeded = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => !r.ok).length;
    expect(succeeded).toBe(GENERATION_QUOTA_LIMIT);
    expect(blocked).toBe(attempts - GENERATION_QUOTA_LIMIT);

    // The real proof: the ledger itself never exceeds the limit — a
    // naive check-then-insert race (two connections both reading "19,
    // under limit" before either commits) would show more rows here
    // than GENERATION_QUOTA_LIMIT despite every individual claimGenerationQuota()
    // call still, technically, having "checked before inserting".
    expect(await countClaims(coachConcurrent.id)).toBe(GENERATION_QUOTA_LIMIT);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────
// Failed generation behavior — no refund
// ─────────────────────────────────────────────────────────────

describe("claimGenerationQuota — failed generation behavior", () => {
  it("a consumed quota unit is not refunded when the generation it guarded later fails", async () => {
    const draftRow = await createDraft({ coachId: coachResume.id, clientId: null, brief: MINIMAL_BRIEF });
    draftIds.push(draftRow.id);

    const before = await countClaims(coachResume.id);
    const claim = await claimGenerationQuota(coachResume.id, draftRow.id, "full_draft");
    expect(claim.ok).toBe(true);

    // The real failure path staged-generation.ts takes once a claimed
    // attempt's model call fails — setDraftStatus() has no interaction
    // with the quota ledger at all (see claimGenerationQuota's own
    // "separate ledger" comment), so this must not release the claim.
    await setDraftStatus(draftRow.id, "failed", { failureReason: "simulated failure for test" });

    expect(await countClaims(coachResume.id)).toBe(before + 1);
  }, 30_000);

  it("setDraftStatus/failRun never reference the quota ledger table", () => {
    const service = source("lib/db/program-generation-service.ts");
    const failRunBody = service.slice(
      service.indexOf("export async function failRun("),
      service.indexOf("// ─────", service.indexOf("export async function failRun(")),
    );
    expect(failRunBody).not.toContain("programGenerationQuotaClaims");

    const setDraftStatusBody = service.slice(
      service.indexOf("export async function setDraftStatus("),
      service.indexOf("// Set once per draft"),
    );
    expect(setDraftStatusBody).not.toContain("programGenerationQuotaClaims");
  });
});

// ─────────────────────────────────────────────────────────────
// Retry / resume semantics
// ─────────────────────────────────────────────────────────────

describe("runStagedGeneration — resume/retry quota accounting", () => {
  const originalModel = process.env.PROGRAM_GENERATOR_MODEL;
  const originalFixture = process.env.PROGRAM_GENERATOR_USE_FIXTURE;

  beforeAll(() => {
    process.env.PROGRAM_GENERATOR_USE_FIXTURE = "true";
    delete process.env.PROGRAM_GENERATOR_MODEL;
  });

  afterAll(() => {
    if (originalModel === undefined) delete process.env.PROGRAM_GENERATOR_MODEL;
    else process.env.PROGRAM_GENERATOR_MODEL = originalModel;
    if (originalFixture === undefined) delete process.env.PROGRAM_GENERATOR_USE_FIXTURE;
    else process.env.PROGRAM_GENERATOR_USE_FIXTURE = originalFixture;
  });

  it("a fresh generation consumes exactly one quota unit, regardless of week count", async () => {
    const brief: ProgramGenerationBrief = { ...MINIMAL_BRIEF, weeks: 2, daysPerWeek: 1 };
    const row = await createDraft({ coachId: coachResume.id, clientId: null, brief });
    draftIds.push(row.id);

    const before = await countClaims(coachResume.id);
    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachResume.id,
      brief,
      clientContext: null,
      existingShell: null,
      isResume: false,
      startFromWeek: 1,
      startFromDay: 1,
      existingCompletedWeeks: new Map(),
      existingGenerationArchitecture: null,
      existingGenerationArchitectureVersion: null,
    });
    expect(result.ok).toBe(true);
    expect(await countClaims(coachResume.id)).toBe(before + 1);
  }, 30_000);

  it("a resume with weeks still remaining consumes exactly one more quota unit", async () => {
    const brief: ProgramGenerationBrief = { ...MINIMAL_BRIEF, weeks: 2, daysPerWeek: 1 };
    const row = await createDraft({ coachId: coachResume.id, clientId: null, brief });
    draftIds.push(row.id);
    const shell = buildFixtureProgramShell(brief);
    await saveProgramShell(row.id, shell);
    await setDraftStatus(row.id, "failed", { failureReason: "simulated failure for test" });

    const before = await countClaims(coachResume.id);
    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachResume.id,
      brief,
      clientContext: null,
      existingShell: shell,
      isResume: true,
      startFromWeek: 1,
      startFromDay: 1,
      existingCompletedWeeks: new Map(),
      existingGenerationArchitecture: null,
      existingGenerationArchitectureVersion: null,
    });
    expect(result.ok).toBe(true);
    expect(await countClaims(coachResume.id)).toBe(before + 1);
  }, 30_000);

  it("a resume whose shell and every week already completed — only finalization failed last time — consumes ZERO quota units", async () => {
    const brief: ProgramGenerationBrief = { ...MINIMAL_BRIEF, weeks: 1, daysPerWeek: 1 };
    const row = await createDraft({ coachId: coachResume.id, clientId: null, brief });
    draftIds.push(row.id);
    const shell = buildFixtureProgramShell(brief);
    await saveProgramShell(row.id, shell);
    const week1 = await buildFixtureProgramWeek(1, shell);
    if (!week1) throw new Error("fixture setup failed — not enough active exercises seeded.");
    await saveGenerationWeek(row.id, 1, { status: "completed", weekJson: week1 });
    await setDraftStatus(row.id, "failed", { failureReason: "simulated finalization-only failure" });

    const before = await countClaims(coachResume.id);
    const result = await runStagedGeneration({
      draftId: row.id,
      coachId: coachResume.id,
      brief,
      clientContext: null,
      existingShell: shell,
      isResume: true,
      startFromWeek: 2, // > shell.totalWeeks (1) — nothing left to generate
      startFromDay: 1,
      existingCompletedWeeks: new Map([[1, week1]]),
      existingGenerationArchitecture: null,
      existingGenerationArchitectureVersion: null,
    });
    expect(result.ok).toBe(true);
    expect(await countClaims(coachResume.id)).toBe(before);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────
// Admin/client identity spoofing — quota is always charged against the
// server-resolved actor, never a client-supplied id. Source-inspection
// (see file header for why: actions.ts requires a real request scope).
// ─────────────────────────────────────────────────────────────

describe("identity — quota is charged against the session-derived actor only", () => {
  it("generateProgramDraftAction feeds runStagedGeneration actor.coachId, never a client-supplied id", () => {
    const actionsSrc = source("app/hq/programs/generate/actions.ts");
    const start = actionsSrc.indexOf("export async function generateProgramDraftAction");
    const end = actionsSrc.indexOf("// Resumes a failed staged generation", start);
    const fnBody = actionsSrc.slice(start, end);

    expect(fnBody).toContain("const actor = await requireActor();");
    expect(fnBody).toContain("coachId: actor.coachId,");
    expect(fnBody).not.toMatch(/coachId:\s*input\./);
  });

  it("resumeGenerationAction feeds runStagedGeneration auth.coachId (from requireOwnedDraft's server-side guard), never a client-supplied id", () => {
    const actionsSrc = source("app/hq/programs/generate/actions.ts");
    const start = actionsSrc.indexOf("export async function resumeGenerationAction");
    const end = actionsSrc.indexOf("// ─────────────────────────────────────────────────────────────", start);
    const fnBody = actionsSrc.slice(start, end);

    expect(fnBody).toContain("const auth = await requireOwnedDraft(draftId);");
    expect(fnBody).toContain("coachId: auth.coachId,");
  });

  it("regenerateDayAction charges the quota claim against loaded.coachId, never a client-supplied id", () => {
    const actionsSrc = source("app/hq/programs/generate/actions.ts");
    const start = actionsSrc.indexOf("export async function regenerateDayAction");
    const end = actionsSrc.indexOf("// ─────────────────────────────────────────────────────────────", start);
    const fnBody = actionsSrc.slice(start, end);

    expect(fnBody).toContain("const loaded = await loadEditableDraft(params.draftId);");
    expect(fnBody).toContain('claimGenerationQuota(loaded.coachId, params.draftId, "single_day")');
  });

  it("requireActor() resolves coachId from the authenticated session guard, never from caller input", () => {
    const actionsSrc = source("app/hq/programs/generate/actions.ts");
    const start = actionsSrc.indexOf("async function requireActor");
    const end = actionsSrc.indexOf("async function requireOwnedDraft");
    const fnBody = actionsSrc.slice(start, end);

    expect(fnBody).toContain("await requireCoachOrAdmin()");
    expect(fnBody).toContain("coachId: guard.dbUser.id");
  });
});

// ─────────────────────────────────────────────────────────────
// Full model-invocation coverage — every path that can reach the
// provider is gated, and the AI SDK's own internal retry cannot
// independently consume extra quota.
// ─────────────────────────────────────────────────────────────

describe("full model-invocation coverage", () => {
  it("provider.ts's maxRetries is an internal AI SDK retry inside ONE callProvider() call, not a separate claimGenerationQuota() invocation", () => {
    // generateProgramShell()/generateProgramWeek()/regenerateDayDraft()
    // each call callProvider() exactly once per invocation; callProvider()
    // passes maxRetries to the AI SDK's own generateObject(), which
    // retries transparently *inside* that single call (same HTTP-level
    // attempt budget, not a new top-level action invocation). Since
    // claimGenerationQuota() is only ever called once per top-level
    // action invocation (staged-generation.ts / regenerateDayAction),
    // not once per callProvider() call, an internal SDK retry can never
    // trigger a second claim.
    const providerSrc = source("lib/program-generator/provider.ts");
    expect(providerSrc).toContain("maxRetries: PROVIDER_MAX_RETRIES");
    expect(providerSrc).not.toContain("claimGenerationQuota");

    const serviceSrc = source("lib/db/program-generation-service.ts");
    // claimGenerationQuota is defined here but never self-invoked in a
    // retry loop — it returns a single result per call, no internal
    // retry of its own that could re-claim.
    const fnStart = serviceSrc.indexOf("export async function claimGenerationQuota");
    const fnBody = serviceSrc.slice(fnStart, serviceSrc.indexOf("\n// ─────", fnStart + 1));
    const selfCallCount = (fnBody.match(/claimGenerationQuota\(/g) ?? []).length;
    expect(selfCallCount).toBe(1); // only its own declaration/signature, never a recursive/retry call
  });

  it("no route/action other than app/hq/programs/generate/actions.ts (directly or via staged-generation.ts) imports the model-calling provider functions", () => {
    // generateProgramShell / generateProgramWeek / generateProgramDay /
    // regenerateDayDraft are the ONLY functions in this codebase that
    // reach the AI SDK (provider.ts's own file header: "the only file
    // in the feature that may reference an LLM API key or call out to a
    // model provider"). A real repo-wide grep (not just checking
    // actions.ts's own content) — so this actually regresses if someone
    // later adds a second, ungated call site rather than merely
    // asserting today's known-good shape.
    //
    // Matches both import styles: the "@/lib/program-generator/
    // provider" alias (used by app/hq/programs/generate/actions.ts) AND
    // the "./provider" relative form (used by staged-generation.ts,
    // which lives in the same directory as provider.ts) — day-metadata/
    // day.id hardening moved actions.ts's regenerateDayAction onto
    // staged-generation.ts's regenerateDaySurgically() instead of
    // calling provider.ts directly, so actions.ts is no longer
    // guaranteed to be an importer itself; staged-generation.ts's own
    // relative import is what this check must actually catch.
    const providerSrc = source("lib/program-generator/provider.ts");
    expect(providerSrc).toContain("This is the only file in the feature that may reference");

    const grepResult = execSync(
      String.raw`grep -rlE 'from "@/lib/program-generator/provider"|from "\./provider"' --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next .`,
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const importers = grepResult
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\.\//, ""))
      .filter((line) => !line.includes("__tests__")); // test fixtures import it too — not app code paths

    // Every real (non-test) importer of provider.ts must be either the
    // gated Server Action surface itself, or staged-generation.ts, which
    // is ONLY reachable from that same gated surface (never exported to
    // a route/API handler directly — see staged-generation.ts's own file
    // header: "no auth/ownership checks of its own; every caller...
    // is responsible for calling requireCoachOrAdmin()...").
    const allowed = new Set([
      "app/hq/programs/generate/actions.ts",
      "lib/program-generator/staged-generation.ts",
    ]);
    for (const file of importers) {
      expect(allowed.has(file)).toBe(true);
    }
    expect(importers.length).toBeGreaterThan(0); // sanity: the grep itself actually matched something
  });
});

// ─────────────────────────────────────────────────────────────
// Window boundary / reset behavior
// ─────────────────────────────────────────────────────────────

describe("claimGenerationQuota — window boundary behavior", () => {
  it("claims that fell outside the window (all already expired) do not count against the limit", async () => {
    const now = Date.now();
    const expiredRows = Array.from({ length: GENERATION_QUOTA_LIMIT }, () => ({
      coachId: coachBoundaryExpired.id,
      draftId: null,
      scope: "full_draft" as const,
      createdAt: new Date(now - GENERATION_QUOTA_WINDOW_MS - 60_000), // 1 minute past the window
    }));
    await db.insert(programGenerationQuotaClaims).values(expiredRows);

    // All GENERATION_QUOTA_LIMIT rows exist but are outside the rolling
    // window — a fresh claim must still succeed exactly as if the coach
    // had never made them.
    const result = await claimGenerationQuota(coachBoundaryExpired.id, null, "full_draft");
    expect(result.ok).toBe(true);
  }, 30_000);

  it("claims just inside the window still count against the limit, and retryAfterMs reflects the true remaining time", async () => {
    const now = Date.now();
    const activeRows = Array.from({ length: GENERATION_QUOTA_LIMIT }, () => ({
      coachId: coachBoundaryActive.id,
      draftId: null,
      scope: "full_draft" as const,
      createdAt: new Date(now - GENERATION_QUOTA_WINDOW_MS + 60_000), // 1 minute inside the window
    }));
    await db.insert(programGenerationQuotaClaims).values(activeRows);

    const result = await claimGenerationQuota(coachBoundaryActive.id, null, "full_draft");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The oldest counted row has ~1 minute left before it ages out.
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(65_000);
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────
// P0 regression — production draft 1e39ca9a-c7d5-4e08-9f96-adefda1ba91a
// ("Maddie"): three real attempts each claimed a quota unit and each
// failed on a plain infrastructure timeout — zero usable output ever
// produced, three units gone for one program that never completed.
// See ClaimQuotaResult's comment in program-generation-service.ts for
// exactly when release is (and is not) appropriate; staged-generation.ts
// and regenerateDayAction wire this in only for errorCode "timeout".
// ─────────────────────────────────────────────────────────────

describe("releaseGenerationQuotaClaim — undoing a claim that paid for a definitive timeout", () => {
  it("a released claim no longer counts against the coach's window", async () => {
    const claim = await claimGenerationQuota(coachReleaseBasic.id, null, "full_draft");
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    expect(await countClaims(coachReleaseBasic.id)).toBe(1);

    await releaseGenerationQuotaClaim(claim.claimId);

    expect(await countClaims(coachReleaseBasic.id)).toBe(0);
  });

  it("releasing frees up room under the limit for a genuinely new claim", async () => {
    const claims: string[] = [];
    for (let i = 0; i < GENERATION_QUOTA_LIMIT; i++) {
      const result = await claimGenerationQuota(coachReleaseLimit.id, null, "full_draft");
      expect(result.ok).toBe(true);
      if (result.ok) claims.push(result.claimId);
    }

    // At the limit — the next claim is rejected exactly as
    // "same coach repeated invocation" above proves.
    expect((await claimGenerationQuota(coachReleaseLimit.id, null, "full_draft")).ok).toBe(false);

    // Release one (simulating one of those attempts having failed on a
    // definitive timeout) — a fresh claim now succeeds again.
    await releaseGenerationQuotaClaim(claims[0]);
    const afterRelease = await claimGenerationQuota(coachReleaseLimit.id, null, "full_draft");
    expect(afterRelease.ok).toBe(true);
  });

  it("releasing an already-released (or nonexistent) claim id is a safe no-op, never an error", async () => {
    const claim = await claimGenerationQuota(coachReleaseIdempotent.id, null, "full_draft");
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    await releaseGenerationQuotaClaim(claim.claimId);
    // Second release of the same (now-deleted) id must not throw.
    await expect(releaseGenerationQuotaClaim(claim.claimId)).resolves.toBeUndefined();
    // A random, never-issued id must not throw either.
    await expect(releaseGenerationQuotaClaim(randomUUID())).resolves.toBeUndefined();
  });

  it("only releases the specific claim by id — never touches another of the same coach's claims", async () => {
    const first = await claimGenerationQuota(coachReleaseSpecific.id, null, "full_draft");
    const second = await claimGenerationQuota(coachReleaseSpecific.id, null, "full_draft");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const before = await countClaims(coachReleaseSpecific.id);
    await releaseGenerationQuotaClaim(first.claimId);
    expect(await countClaims(coachReleaseSpecific.id)).toBe(before - 1);

    const [remaining] = await db
      .select({ id: programGenerationQuotaClaims.id })
      .from(programGenerationQuotaClaims)
      .where(eq(programGenerationQuotaClaims.coachId, coachReleaseSpecific.id));
    expect(remaining.id).toBe(second.claimId);
  });
});
