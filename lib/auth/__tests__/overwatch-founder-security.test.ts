import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("Overwatch founder dashboard security and privacy", () => {
  it("keeps the production /overwatch page behind the admin-only page guard", () => {
    const page = source("app/overwatch/page.tsx");
    const guards = source("lib/auth/guards.ts");

    expect(page).toContain('import { requireOverwatchAdminPage } from "@/lib/auth/guards"');
    expect(page).toContain("await requireOverwatchAdminPage()");
    expect(page).not.toContain("requireCoachOrAdminPage");
    expect(guards).toContain("requireOverwatchAdminPage");
    expect(guards).toContain('redirect("/overwatch/login?error=authentication_required&next=/overwatch")');
    expect(guards).toContain('resolved.dbUser.status !== "active"');
    expect(guards).toContain('resolved.dbUser.role !== "admin"');
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

  it("routes unauthenticated Overwatch visitors to the dedicated founder login", () => {
    const proxy = source("proxy.ts");

    expect(proxy).toContain('"/overwatch"');
    expect(proxy).toContain('"/overwatch/login"');
    expect(proxy).toContain('pathname === "/overwatch" || pathname.startsWith("/overwatch/")');
  });

  it("ships a dedicated Overwatch login without customer or coach activation copy", () => {
    const page = source("app/overwatch/login/page.tsx");
    const client = source("app/overwatch/login/OverwatchLoginClient.tsx");

    expect(page).toContain("getOverwatchLoginState");
    expect(client).toContain("Kynovant Overwatch");
    expect(client).toContain("Founder access");
    expect(client).not.toContain("Contact your coach");
    expect(client).not.toContain("Start your free trial");
    expect(client).not.toContain("Client access is by coach invitation");
    expect(client).not.toContain("coach workspace");
  });

  it("does not make the founder email address the authorization boundary", () => {
    for (const file of [
      "lib/auth/guards.ts",
      "lib/auth/overwatch.ts",
      "app/auth/overwatch-redirect/route.ts",
      "app/overwatch/login/page.tsx",
      "app/overwatch/login/OverwatchLoginClient.tsx",
    ]) {
      const contents = source(file);
      expect(contents).not.toContain("kynovant@gmail.com");
      expect(contents).not.toMatch(/email\s*={2,3}/);
    }
  });

  it("uses the Overwatch-specific post-login verifier for password and magic-link auth", () => {
    const client = source("app/overwatch/login/OverwatchLoginClient.tsx");
    const callback = source("app/auth/callback/route.ts");
    const verifier = source("app/auth/overwatch-redirect/route.ts");

    expect(client).toContain("/auth/overwatch-redirect");
    expect(client).toContain("overwatch=1");
    expect(callback).toContain('overwatch === "1"');
    expect(verifier).toContain('dbUser.role !== "admin"');
    expect(verifier).toContain('dbUser.status !== "active"');
    expect(verifier).toContain("await supabase.auth.signOut()");
  });
});
