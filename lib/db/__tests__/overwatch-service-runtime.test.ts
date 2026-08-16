import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("Overwatch metrics runtime safety", () => {
  it("does not fan out the production dashboard queries concurrently", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).not.toContain("Promise.all([");
    expect(service).toContain("Supabase session-mode pooling");
  });

  it("uses pooler-safe timestamp parameters for aggregate date filters", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("sevenDaysAgoIso");
    expect(service).toContain("${sevenDaysAgoIso}::timestamptz");
    expect(service).not.toContain("${sevenDaysAgo})");
    expect(service).not.toContain(">= ${sevenDaysAgo}`");
  });

  it("treats unflagged legacy coach accounts as customer accounts during rollout", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("internalAccountFlags");
    expect(service).toContain("coalesce(${internalAccountFlags.classification}, 'customer') = 'customer'");
    expect(service).toContain("businessCoachPredicate");
  });

  it("bounds rolling-window metrics at now and rejects invalid AI latencies", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("nowIso");
    expect(service).toContain("${programGenerationRuns.createdAt} <= ${nowIso}::timestamptz");
    expect(service).toContain("${programGenerationRuns.completedAt} >= ${programGenerationRuns.startedAt}");
    expect(service).toContain("${programGenerationRuns.completedAt} <= ${nowIso}::timestamptz");
    expect(service).toContain("ws.completed_at <= ${nowIso}::timestamptz");
    expect(service).toContain("ci.submitted_at <= ${nowIso}::timestamptz");
    expect(service).toContain("m.created_at <= ${nowIso}::timestamptz");
  });

  it("normalizes DB timestamp fields before service-level date math", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("function toDateOrNull");
    expect(service).toContain("currentPeriodEnd: toDateOrNull(coach.currentPeriodEnd)");
    expect(service).toContain("cancelledAt: toDateOrNull(coach.cancelledAt)");
    expect(service).toContain("lastActiveAt: toDateOrNull(coach.lastActiveAt)");
    expect(service).toContain("firstSignupAt: toDateOrNull(lead.firstSignupAt)");
  });

  it("keeps founder/operator profile data separate from authorization", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("operatorProfiles");
    expect(service).toContain("getOverwatchFounderProfile");
    expect(service).not.toContain("getOverwatchFounderFirstName");
  });

  it("locks the Overwatch ops tables behind RLS", () => {
    const migration = source("drizzle/0027_overwatch_account_classification.sql");

    expect(migration).toContain("ALTER TABLE public.internal_account_flags ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.operator_profiles ENABLE ROW LEVEL SECURITY");
  });

  it("limits the legacy fixture classifier to the known invalid fixture domain", () => {
    // FIXTURE_PATTERNS moved to overwatch-fixture-classification.ts (the
    // pure, tested matching/classification module) when the classifier's
    // drizzle-orm array-binding bug was fixed — classify-overwatch-
    // fixtures.ts is now a thin CLI wrapper that imports the pattern
    // list rather than declaring it. The invariant this test guards is
    // unchanged: each approved pattern is kept whole, never split from
    // its @isolation-test.invalid domain suffix.
    const script = source("scripts/repairs/overwatch-fixture-classification.ts");

    expect(script).toContain("@isolation-test.invalid");
    expect(script).toContain("candidate-test-coach-%@isolation-test.invalid");
    expect(script).not.toContain('"candidate-test-coach-%"');
    expect(script).not.toContain('"review-triage-test-coach-%"');
  });

  it("scopes engagement and AI metrics through customer coach accounts", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("programGenerationRuns.requestedByUserId");
    expect(service).toContain("m.created_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("ci.submitted_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("ws.completed_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("customer_coaches");
  });

  it("excludes unlinked invalid-domain fixture leads from acquisition counts", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("function acquisitionLeadPredicate");
    expect(service).toContain("${coachAcquisitionLeads.normalizedEmail} not like '%@isolation-test.invalid'");
    expect(service).toContain(".where(acquisitionLeadPredicate())");
  });
});
