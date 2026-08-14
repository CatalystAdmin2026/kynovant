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

describe("Catalyst public brand isolation", () => {
  it("does not reuse Kynovant public chrome for the Catalyst route group", () => {
    expect(source("components/Navbar.tsx")).not.toContain("KynovantNavbar");
    expect(source("components/Footer.tsx")).not.toContain("KynovantFooter");
    expect(source("app/(site)/layout.tsx")).not.toContain("@/components/kynovant");
  });

  it("keeps Catalyst-owned public pages out of the Kynovant SaaS funnel", () => {
    for (const file of catalystPublicFiles) {
      const text = source(file);
      expect(text, file).not.toMatch(/\bKynovant\b/);
      expect(text, file).not.toMatch(/Start (Free|14-Day Free) Trial/);
      expect(text, file).not.toContain("Install Kynovant");
      expect(text, file).not.toContain('href="/start-trial"');
      expect(text, file).not.toContain('href="/pricing"');
      expect(text, file).not.toContain('href="/features"');
      expect(text, file).not.toContain('href="/login"');
    }
  });

  it("brands the Catalyst root landing target as Catalyst", () => {
    const about = source("app/(site)/about/page.tsx");
    expect(about).toContain("About Catalyst Coaching Elite");
    expect(about).toContain("siteName: \"Catalyst Coaching Elite\"");
    expect(about).not.toContain("About Kynovant");
  });
});
