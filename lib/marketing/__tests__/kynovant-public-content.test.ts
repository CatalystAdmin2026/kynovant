import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KYNOVANT_FEATURE_GROUPS,
  KYNOVANT_NOT_CLAIMED,
  KYNOVANT_PROFESSIONAL_PRICE,
  KYNOVANT_PUBLIC_CTA,
} from "../kynovant-public-content";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

const promotionalCopy = [
  KYNOVANT_PROFESSIONAL_PRICE.planName,
  KYNOVANT_PROFESSIONAL_PRICE.amount,
  KYNOVANT_PROFESSIONAL_PRICE.period,
  KYNOVANT_PROFESSIONAL_PRICE.trial,
  ...KYNOVANT_FEATURE_GROUPS.flatMap((group) => [
    group.eyebrow,
    group.title,
    group.summary,
    ...group.proofPoints,
  ]),
].join("\n");

describe("Kynovant public feature content", () => {
  it("uses the launch Professional price and trial", () => {
    expect(KYNOVANT_PROFESSIONAL_PRICE).toEqual({
      planName: "Kynovant Professional",
      amount: "$99",
      period: "/month",
      trial: "14-day free trial",
    });
  });

  it("uses the self-service launch CTA", () => {
    expect(KYNOVANT_PUBLIC_CTA).toEqual({
      label: "Start 14-Day Free Trial",
      href: "/start-trial",
      note: "No payment required to create your coach account",
    });
  });

  it("documents every public feature group with concrete proof points", () => {
    expect(KYNOVANT_FEATURE_GROUPS.length).toBeGreaterThanOrEqual(10);
    for (const group of KYNOVANT_FEATURE_GROUPS) {
      expect(group.title.trim()).not.toHaveLength(0);
      expect(group.summary.trim()).not.toHaveLength(0);
      expect(group.proofPoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not reintroduce stale demo-gated pricing or unsupported hype", () => {
    expect(promotionalCopy).not.toMatch(/\bprivate rate\b/i);
    expect(promotionalCopy).not.toMatch(/\bfounding coach\b/i);
    expect(promotionalCopy).not.toMatch(/\brequest demo\b/i);
    expect(promotionalCopy).not.toMatch(/\brequest access\b/i);
    expect(promotionalCopy).not.toMatch(/\bapply first\b/i);
    expect(promotionalCopy).not.toMatch(/\brevolutionize\b/i);
    expect(promotionalCopy).not.toMatch(/\bguarantee outcomes\b/i);
    expect(promotionalCopy).not.toMatch(/\bnative ios\b/i);
  });

  it("keeps explicit boundaries around medical, nutrition, mobile, and calendar claims", () => {
    expect(KYNOVANT_NOT_CLAIMED).toContain(
      "Autonomous medical advice, diagnosis, treatment, or injury rehabilitation decisions.",
    );
    expect(KYNOVANT_NOT_CLAIMED).toContain(
      "Autonomous nutrition prescribing beyond coach-managed nutrition targets and context.",
    );
    expect(KYNOVANT_NOT_CLAIMED).toContain("External calendar synchronization.");
    expect(KYNOVANT_NOT_CLAIMED).toContain("Native iOS or Android app store apps.");
  });

  it("includes the Kynovant Promise brand layer on the public homepage", () => {
    const homepage = source("components/kynovant/KynovantHomeContent.tsx");

    expect(homepage).toContain("Your clients made the promise. Help them keep it.");
    expect(homepage).toContain("The Reason Behind The Software");
    expect(homepage).toContain("Build the system behind the follow-through.");
  });
});
