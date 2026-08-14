import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("Overwatch founder dashboard security and privacy", () => {
  it("keeps the production /overwatch page behind the admin-only page guard", () => {
    const page = source("app/overwatch/page.tsx");

    expect(page).toContain('import { requireAdminPage } from "@/lib/auth/guards"');
    expect(page).toContain("await requireAdminPage()");
    expect(page).not.toContain("requireCoachOrAdminPage");
  });

  it("does not expose client identities or sensitive client tables in the Overwatch data service", () => {
    const service = source("lib/db/overwatch-service.ts");

    expect(service).toContain("activeClientCount");
    expect(service).not.toContain("clientProfiles");
    expect(service).not.toContain("weeklyCheckIns");
    expect(service).not.toContain("messages");
    expect(service).not.toContain("documents");
    expect(service).not.toContain("clientId:");
  });

  it("keeps acquisition tracking separate from the abuse/rate-limit attempt ledger", () => {
    const schema = source("lib/db/schema-coach-acquisition.ts");
    const signupSchema = source("lib/db/schema-coach-signup.ts");
    const route = source("app/api/coach-signup/route.ts");

    expect(schema).toContain("coach_acquisition_leads");
    expect(schema).not.toContain('ip:');
    expect(schema).not.toContain('"ip"');
    expect(signupSchema).toContain("coach_signup_attempts");
    expect(route).toContain("recordSignupAttempt");
    expect(route).toContain("recordAcquisitionSignup");
  });
});
