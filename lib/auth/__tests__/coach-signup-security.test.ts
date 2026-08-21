// ─────────────────────────────────────────────────────────────
// Self-service coach signup — source-level security gates.
//
// Same "read the source, assert on it" style as
// production-security-release.test.ts — these are invariants about
// how the code is written, not just how it behaves for one input,
// so they stay true even for code paths a runtime test wouldn't
// happen to exercise.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

// Strips line comments so a file's own explanatory prose about the OLD
// vulnerable pattern (kept in header comments explaining the fix)
// never falsely trips a "the CODE must not do X" assertion.
function stripLineComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\/\/.*/, ""))
    .join("\n");
}

describe("self-service coach signup security gates", () => {
  it("never reads a role from the public signup request body", () => {
    const route = source("app/api/coach-signup/route.ts");

    // The only place "coach" is granted is the hardcoded literal inside
    // provisionInvitedCoach() — this route must never destructure or
    // forward a `role` field from its own request body.
    expect(route).not.toMatch(/body\.role/);
    expect(route).not.toMatch(/role:\s*body/);
    expect(route).toContain("interface SignupPayload");
    expect(route).not.toMatch(/SignupPayload\s*{[^}]*role/);
  });

  it("shares the exact same provisioning helper as the admin-invite path", () => {
    const selfServe = source("app/api/coach-signup/route.ts");
    const adminInvite = source("app/api/admin/coaches/route.ts");
    const provisioning = source("lib/db/coach-provisioning-service.ts");

    expect(selfServe).toContain('import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service"');
    expect(adminInvite).toContain('import { provisionInvitedCoach } from "@/lib/db/coach-provisioning-service"');

    // The role grant is a single hardcoded literal, not a parameter —
    // proves neither call site can pass a different role in.
    expect(provisioning).toContain('role: "coach"');
    expect(provisioning).not.toMatch(/role:\s*input\.role/);
  });

  it("never provisions a coach account for an email already registered as a client", () => {
    const route = source("app/api/coach-signup/route.ts");

    expect(route).toContain('existing.role === "client"');
    expect(route).toMatch(/existing\.role === "client"[\s\S]{0,900}status:\s*409/);
  });

  it("rate-limits the public endpoint by IP and by email using a DB-backed ledger", () => {
    const route = source("app/api/coach-signup/route.ts");
    const service = source("lib/db/coach-signup-service.ts");

    expect(route).toContain("countRecentAttemptsByIp");
    expect(route).toContain("countRecentAttemptsByEmail");
    expect(route).toContain("recordSignupAttempt");
    expect(service).toContain("coachSignupAttempts");
  });

  it("never creates a Stripe Checkout Session or Customer from the public signup route", () => {
    const route = source("app/api/coach-signup/route.ts");

    // The billing rule: signup only ever provisions the account. Any
    // dollar amount is confirmed later, inside an authenticated
    // session, via startCheckoutAction (app/account-status/page.tsx).
    expect(route).not.toContain("checkout.sessions.create");
    expect(route).not.toContain("createCoachCheckoutSession");
    expect(route).not.toContain("kynovantStripe");
  });

  it("documents createAdminClient()'s one deliberate public call site", () => {
    const admin = source("lib/supabase/admin.ts");
    expect(admin).toContain("coach-signup");
  });

  it("P0 FIX (Coach Invitation Auto-Consume): never emails Supabase's own single-use action_link — uses generateLink + this route's own buildAcceptLink to /auth/accept", () => {
    const route = source("app/api/coach-signup/route.ts");
    const code = stripLineComments(route);
    expect(code).not.toMatch(/inviteUserByEmail/);
    expect(code).not.toContain("data.properties.action_link");
    expect(code).not.toContain("data.properties?.action_link");
    expect(route).toContain("admin.auth.admin.generateLink({");
    expect(route).toContain("function buildAcceptLink(siteOrigin: string, hashedToken: string): string {");
    expect(route).toMatch(/new URL\("\/auth\/accept", siteOrigin\)/);
    expect(route).toContain("data.properties?.hashed_token");
    expect(route).toContain("sendCoachSignupEmail");
    expect(route).toContain("getKynovantResendConfig");
  });
});

describe("admin coach-invite route — source-level security gates", () => {
  it("P0 FIX (Coach Invitation Auto-Consume): never emails Supabase's own single-use action_link — uses generateLink + this route's own buildAcceptLink to /auth/accept", () => {
    const route = source("app/api/admin/coaches/route.ts");
    const code = stripLineComments(route);
    expect(code).not.toMatch(/inviteUserByEmail/);
    expect(code).not.toContain("data.properties.action_link");
    expect(code).not.toContain("data.properties?.action_link");
    expect(route).toContain("admin.auth.admin.generateLink({");
    expect(route).toContain("function buildAcceptLink(siteOrigin: string, hashedToken: string): string {");
    expect(route).toMatch(/new URL\("\/auth\/accept", siteOrigin\)/);
    expect(route).toContain("data.properties?.hashed_token");
    expect(route).toContain("sendAdminCoachInviteEmail");
    expect(route).toContain("getKynovantResendConfig");
  });

  it("guards POST with requireAdmin(), not requireCoachOrAdmin() — this mints paying-tier coach seats", () => {
    const route = source("app/api/admin/coaches/route.ts");
    expect(route).toMatch(/import \{ requireAdmin \} from "@\/lib\/auth\/guards"/);
    expect(route).toContain("const guard = await requireAdmin();");
    expect(route).not.toMatch(/import \{[^}]*\brequireCoachOrAdmin\b/);
  });

  it("role is never taken from request input — provisionInvitedCoach hardcodes it, body has no role field", () => {
    const route = source("app/api/admin/coaches/route.ts");
    expect(route).not.toMatch(/body\.role/);
    expect(route).toContain("let body: { email?: string; displayName?: string };");
  });
});
