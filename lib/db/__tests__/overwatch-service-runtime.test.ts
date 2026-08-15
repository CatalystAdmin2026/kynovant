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

  it("defaults business metrics to explicitly customer-classified accounts only", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("internalAccountFlags");
    expect(service).toContain("coalesce(${internalAccountFlags.classification}, 'customer') = 'customer'");
    expect(service).toContain("businessCoachPredicate");
  });

  it("keeps founder/operator profile data separate from authorization", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("operatorProfiles");
    expect(service).toContain("getOverwatchFounderProfile");
    expect(service).not.toContain("getOverwatchFounderFirstName");
  });

  it("scopes engagement and AI metrics through customer coach accounts", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("programGenerationRuns.requestedByUserId");
    expect(service).toContain("m.created_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("ci.submitted_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("ws.completed_at >= ${sevenDaysAgoIso}::timestamptz");
    expect(service).toContain("customer_coaches");
  });
});
