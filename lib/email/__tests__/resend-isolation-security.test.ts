// ─────────────────────────────────────────────────────────────
// Resend brand isolation — source-level security gates.
//
// Same "read the source, assert on it" style as
// lib/auth/__tests__/production-security-release.test.ts and
// lib/auth/__tests__/coach-signup-security.test.ts — these are
// invariants about how the code is written, not just how it behaves
// for one input, so they stay true even for a code path a runtime
// test wouldn't happen to exercise.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const KYNOVANT_ROUTE = "app/api/applications/route.ts";
const CATALYST_ROUTES = [
  "app/api/stripe/webhook/route.ts",
  "app/api/docusign/webhook/route.ts",
];

describe("Resend brand isolation — no route reads process.env.*RESEND* directly", () => {
  it("every Resend-sending route goes through lib/email/resend-brand-config.ts, not raw process.env", () => {
    for (const file of [KYNOVANT_ROUTE, ...CATALYST_ROUTES]) {
      const route = source(file);
      // The only acceptable form is going through the shared getters.
      // A bare process.env.RESEND_API_KEY / KYNOVANT_RESEND_API_KEY read
      // at a route call site would bypass the fail-closed, single-
      // source-of-truth boundary the getters provide.
      expect(route).not.toMatch(/process\.env\.RESEND_API_KEY/);
      expect(route).not.toMatch(/process\.env\.RESEND_FROM_EMAIL/);
      expect(route).not.toMatch(/process\.env\.RESEND_ADMIN_EMAIL/);
      expect(route).not.toMatch(/process\.env\.KYNOVANT_RESEND_API_KEY/);
      expect(route).not.toMatch(/process\.env\.KYNOVANT_RESEND_FROM_EMAIL/);
      expect(route).not.toMatch(/process\.env\.KYNOVANT_RESEND_ADMIN_EMAIL/);
    }
  });
});

describe("Kynovant's application-intake route never references Catalyst's config", () => {
  it("imports and calls getKynovantResendConfig, never getCatalystResendConfig", () => {
    const route = source(KYNOVANT_ROUTE);
    expect(route).toContain(
      'import { getKynovantResendConfig } from "@/lib/email/resend-brand-config"',
    );
    expect(route).toContain("getKynovantResendConfig()");
    expect(route).not.toContain("getCatalystResendConfig");
  });
});

describe("Catalyst's send paths never reference Kynovant's config", () => {
  it.each(CATALYST_ROUTES)("%s imports and calls getCatalystResendConfig, never getKynovantResendConfig", (file) => {
    const route = source(file);
    expect(route).toContain(
      'import { getCatalystResendConfig } from "@/lib/email/resend-brand-config"',
    );
    expect(route).toContain("getCatalystResendConfig()");
    expect(route).not.toContain("getKynovantResendConfig");
  });
});

describe("Catalyst transactional emails do not use Kynovant-facing copy", () => {
  it("keeps Catalyst Stripe client-payment email subjects and visible copy Catalyst-branded", () => {
    const route = source("app/api/stripe/webhook/route.ts");

    expect(route).not.toContain("<title>Welcome to Kynovant</title>");
    expect(route).not.toContain("Welcome to Kynovant — your membership is active.");
    expect(route).not.toContain("Kynovant Elite");
    expect(route).not.toContain("from:    `Kynovant <${fromEmail}>`");
    expect(route).not.toContain('subject: "Welcome to Kynovant"');
    expect(route).not.toContain("<title>New Client Payment — Kynovant</title>");
    expect(route).not.toContain("Kynovant — Admin Notification");
    expect(route).not.toContain('subject: "New Kynovant Client Payment Received"');
  });

  it("keeps Catalyst DocuSign activation email subjects and visible copy Catalyst-branded", () => {
    const route = source("app/api/docusign/webhook/route.ts");

    expect(route).not.toContain("<title>Activate Your Kynovant Membership</title>");
    expect(route).not.toContain("Your Kynovant agreement is fully executed.");
    expect(route).not.toContain("from:    `Kynovant <${fromEmail}>`");
    expect(route).not.toContain('subject: "Your Kynovant Agreement Is Complete"');
  });
});

describe("lib/email/resend-brand-config.ts — the two getters cannot cross-read each other's vars", () => {
  it("getKynovantResendConfig's body only references KYNOVANT_RESEND_* env var names", () => {
    const config = source("lib/email/resend-brand-config.ts");
    const fnBody = config.slice(
      config.indexOf("export function getKynovantResendConfig"),
      config.indexOf("* Catalyst Coaching Elite's Resend credential"),
    );
    expect(fnBody).toContain("KYNOVANT_RESEND_API_KEY");
    expect(fnBody).toContain("KYNOVANT_RESEND_FROM_EMAIL");
    expect(fnBody).toContain("KYNOVANT_RESEND_ADMIN_EMAIL");
    // Bare "RESEND_API_KEY" etc. (without the KYNOVANT_ prefix) must
    // never appear inside this function body.
    expect(fnBody).not.toMatch(/[^_]RESEND_API_KEY/);
    expect(fnBody).not.toMatch(/[^_]RESEND_FROM_EMAIL/);
    expect(fnBody).not.toMatch(/[^_]RESEND_ADMIN_EMAIL/);
  });

  it("getCatalystResendConfig's body only references the generic RESEND_* env var names", () => {
    const config = source("lib/email/resend-brand-config.ts");
    const fnBody = config.slice(config.indexOf("export function getCatalystResendConfig"));
    expect(fnBody).toContain("process.env.RESEND_API_KEY");
    expect(fnBody).toContain("process.env.RESEND_FROM_EMAIL");
    expect(fnBody).toContain("process.env.RESEND_ADMIN_EMAIL");
    expect(fnBody).not.toContain("KYNOVANT_RESEND");
  });

  it("both getters fail closed (return null) rather than returning a partial config", () => {
    const config = source("lib/email/resend-brand-config.ts");
    const occurrences = config.match(/return null;/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
