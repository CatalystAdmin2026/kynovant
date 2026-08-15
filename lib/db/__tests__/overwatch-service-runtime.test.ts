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
});
