import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const catalystPublicFiles = [
  "components/Navbar.tsx",
  "components/Footer.tsx",
  "app/(site)/layout.tsx",
  "app/(site)/about/page.tsx",
  "app/(site)/programs/page.tsx",
  "app/(site)/apply/page.tsx",
  "app/(site)/thank-you/page.tsx",
  "app/(site)/payment-confirmed/page.tsx",
  "app/(site)/onboarding/page.tsx",
  "app/(site)/onboarding-complete/page.tsx",
  "app/(site)/executive-onboarding/page.tsx",
  "app/(site)/executive-performance-confirmed/page.tsx",
  "app/(site)/enroll/standard/page.tsx",
  "app/(site)/enroll/founding-member/page.tsx",
  "app/(site)/enroll/legacy/page.tsx",
  "app/(site)/enroll/executive-performance/page.tsx",
] as const;

// app/(site)/page.tsx (the Kept Performance homepage) is deliberately
// NOT in catalystPublicFiles above — Phase 9 of the rebrand requires
// it to explain the Kynovant-powered coaching platform by name (see
// its own "Powered By Kynovant" section), so the blanket \bKynovant\b
// ban below would produce a false failure on required, correct copy.
// It still gets every OTHER isolation check (no Kynovant SaaS CTAs,
// no Kynovant nav links, no Kynovant taglines) via its own describe
// block below, just not the "never says the word Kynovant" one.
const KYNOVANT_SAAS_LEAKS = [
  /Start (Free|14-Day Free) Trial/,
  "Your clients made the promise. Help them keep it.",
  "The Reason Behind The Software",
  "Install Kynovant",
  'href="/start-trial"',
  'href="/pricing"',
  'href="/features"',
  'href="/login"',
] as const;

function expectNoKynovantSaasLeak(text: string, file: string) {
  for (const leak of KYNOVANT_SAAS_LEAKS) {
    if (typeof leak === "string") {
      expect(text, `${file} — ${leak}`).not.toContain(leak);
    } else {
      expect(text, `${file} — ${leak}`).not.toMatch(leak);
    }
  }
}

describe("Kept Performance public brand isolation", () => {
  it("does not reuse Kynovant public chrome for the Catalyst route group", () => {
    expect(source("components/Navbar.tsx")).not.toContain("KynovantNavbar");
    expect(source("components/Footer.tsx")).not.toContain("KynovantFooter");
    expect(source("app/(site)/layout.tsx")).not.toContain("@/components/kynovant");
  });

  it("keeps Catalyst-owned public pages out of the Kynovant SaaS funnel", () => {
    for (const file of catalystPublicFiles) {
      const text = source(file);
      expect(text, file).not.toMatch(/\bKynovant\b/);
      expectNoKynovantSaasLeak(text, file);
    }
  });

  it("the Kept Performance homepage explains Kynovant by name, but stays out of the Kynovant SaaS funnel", () => {
    const home = source("app/(site)/page.tsx");
    // Required, correct content — Phase 9 of the rebrand.
    expect(home).toMatch(/\bKynovant\b/);
    expect(home).toContain("Powered By Kynovant");
    // Still never claims ownership of Kynovant, and still never leaks
    // a Kynovant SaaS CTA/nav link.
    expect(home).not.toContain("Kept Performance owns Kynovant");
    expectNoKynovantSaasLeak(home, "app/(site)/page.tsx");
  });

  it("brands the Catalyst root landing target as Kept Performance", () => {
    const about = source("app/(site)/about/page.tsx");
    expect(about).toContain("About Kept Performance");
    expect(about).toContain('siteName: "Kept Performance"');
    expect(about).not.toContain("About Kynovant");
    expect(about).not.toMatch(/\bKynovant\b/);

    const home = source("app/(site)/page.tsx");
    expect(home).toContain('title: "Kept Performance"');
    expect(home).toContain('siteName: "Kept Performance"');
  });
});
