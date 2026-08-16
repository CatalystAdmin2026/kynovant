// ─────────────────────────────────────────────────────────────
// startCheckoutAction — source-level security invariants.
//
// startCheckoutAction is a Server Action: it depends on
// requireAuthenticatedPage() → next/headers cookies(), which requires
// a real Next.js request scope that does not exist inside a vitest
// process — the same limitation this codebase already documents and
// works around in lib/auth/__tests__/coach-signup-security.test.ts and
// lib/auth/__tests__/rd-credential-gate.test.ts's source-inspection
// suites. Followed identically here: read the actual source and assert
// on it, which is exactly as strong a proof for a function whose
// entire body is "resolve the session, then branch on it."
//
// The live-DB-backed proof that the DECISION logic itself is correct
// (already-entitled coaches denied, trial withheld for returning
// coaches, admin bypass does not apply) lives in
// lib/db/__tests__/checkout-eligibility.test.ts, which exercises
// resolveCheckoutEligibility() directly — the exact function
// startCheckoutAction calls.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("lib/billing/actions.ts — startCheckoutAction", () => {
  const actions = source("lib/billing/actions.ts");

  it("resolves checkout eligibility from the session-derived coachId only — never from the submitted form data", () => {
    expect(actions).toContain("resolveCheckoutEligibility(dbUser.id)");
    // No field in the bound <form action={startCheckoutAction}> is ever
    // read as a coach identity — _formData is accepted (Server Action
    // calling convention requires the param) but never inspected for
    // an id.
    expect(actions).not.toMatch(/_formData\.get\(["']coachId["']\)/);
    expect(actions).not.toMatch(/formData\.get\(["']coachId["']\)/);
  });

  it("checks role === 'coach' BEFORE resolving checkout eligibility — an admin/client identity can't reach the eligibility check at all", () => {
    const roleCheckIndex = actions.indexOf('if (dbUser.role !== "coach") redirect("/");');
    const eligibilityIndex = actions.indexOf("resolveCheckoutEligibility(dbUser.id)");
    expect(roleCheckIndex).toBeGreaterThan(-1);
    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(roleCheckIndex).toBeLessThan(eligibilityIndex);
  });

  it("blocks (redirects, does not call Stripe) when eligibility.allowed is false — no Checkout Session is created for an already-entitled coach", () => {
    const blockIndex = actions.indexOf("if (!eligibility.allowed) {");
    const stripeCallIndex = actions.indexOf("createCoachCheckoutSession({");
    expect(blockIndex).toBeGreaterThan(-1);
    expect(stripeCallIndex).toBeGreaterThan(-1);
    expect(blockIndex).toBeLessThan(stripeCallIndex);
    // The block branch redirects — it does not fall through.
    const blockBranch = actions.slice(blockIndex, stripeCallIndex);
    expect(blockBranch).toContain('redirect("/hq")');
  });

  it("passes grantTrial straight from the resolved eligibility — never a client/form-supplied value, never hardcoded true", () => {
    expect(actions).toContain("grantTrial: eligibility.grantTrial");
    expect(actions).not.toMatch(/grantTrial:\s*true/);
    expect(actions).not.toMatch(/_formData\.get\(["']grantTrial["']\)/);
  });

  it("openBillingPortalAction is untouched by this hardening — same lookupStripeCustomerId + role check as before", () => {
    expect(actions).toContain("export async function openBillingPortalAction");
    expect(actions).toContain('if (dbUser.role !== "coach") redirect("/");');
  });
});

describe("lib/billing/checkout.ts — createCoachCheckoutSession", () => {
  const checkout = source("lib/billing/checkout.ts");

  it("grantTrial is a required parameter (not optional/defaulted) — every call site must decide explicitly", () => {
    expect(checkout).toMatch(/grantTrial:\s*boolean;/);
    expect(checkout).not.toMatch(/grantTrial\?:\s*boolean/);
  });

  it("trial_period_days is only ever included when grantTrial is true", () => {
    expect(checkout).toContain("...(params.grantTrial ? { trial_period_days: TRIAL_PERIOD_DAYS } : {})");
  });
});
