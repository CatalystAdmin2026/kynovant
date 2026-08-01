import { describe, it, expect } from "vitest";
import { analyzeFatigueAccumulation, type FatigueWeekInput } from "../modules/fatigue-accumulation";
import type { FatigueAnalysis } from "../types";

function fatigue(totalScore: number): FatigueAnalysis {
  return { totalScore, coveragePct: 100, contributors: [], unscored: [], findings: [] };
}

function week(
  weekNumber: number,
  totalScore: number | null,
  weekLabel: string | null = null,
): FatigueWeekInput {
  return {
    weekNumber,
    weekLabel,
    days: totalScore === null ? [] : [{ fatigueAnalysis: fatigue(totalScore) }],
  };
}

describe("analyzeFatigueAccumulation", () => {
  it("sums multiple training days into a single weekly total", () => {
    const result = analyzeFatigueAccumulation([
      {
        weekNumber: 1,
        weekLabel: null,
        days: [{ fatigueAnalysis: fatigue(20) }, { fatigueAnalysis: fatigue(15) }],
      },
    ]);
    expect(result.weeklyFatigue[0].totalScore).toBe(35);
  });

  it("treats rest days (null fatigueAnalysis) as 0 contribution", () => {
    const result = analyzeFatigueAccumulation([
      { weekNumber: 1, weekLabel: null, days: [{ fatigueAnalysis: null }] },
    ]);
    expect(result.weeklyFatigue[0].totalScore).toBe(0);
  });

  it("fires FATIGUE_ACCUMULATION_RISING for 3 consecutive strictly-increasing weeks", () => {
    const result = analyzeFatigueAccumulation([week(1, 10), week(2, 20), week(3, 30)]);
    const finding = result.findings.find((f) => f.code === "FATIGUE_ACCUMULATION_RISING");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
    expect(finding?.confidence).toBe("heuristic");
    expect(finding?.category).toBe("fatigue");
  });

  it("fires only once for a run longer than the threshold", () => {
    const result = analyzeFatigueAccumulation([
      week(1, 10),
      week(2, 20),
      week(3, 30),
      week(4, 40),
      week(5, 50),
    ]);
    const findings = result.findings.filter((f) => f.code === "FATIGUE_ACCUMULATION_RISING");
    expect(findings).toHaveLength(1);
  });

  it("does not fire for only 2 rising weeks", () => {
    const result = analyzeFatigueAccumulation([week(1, 10), week(2, 20)]);
    expect(result.findings).toHaveLength(0);
  });

  it("does not fire for a flat or decreasing series", () => {
    const result = analyzeFatigueAccumulation([week(1, 30), week(2, 20), week(3, 20)]);
    expect(result.findings).toHaveLength(0);
  });

  it("resets the streak at a deload-labeled week", () => {
    const result = analyzeFatigueAccumulation([
      week(1, 10),
      week(2, 20),
      week(3, 5, "Deload Week"),
      week(4, 15),
      week(5, 25),
    ]);
    // Two rising runs of length 2 (weeks 1-2 and 4-5), neither reaches the
    // threshold of 3, and the deload week breaks them from combining.
    expect(result.findings).toHaveLength(0);
  });

  it("detects the deload label case-insensitively", () => {
    const result = analyzeFatigueAccumulation([week(1, 10, "deload")]);
    expect(result.weeklyFatigue[0].isLabeledDeload).toBe(true);
  });

  it("sorts weeklyFatigue by weekNumber regardless of input order", () => {
    const result = analyzeFatigueAccumulation([week(3, 30), week(1, 10), week(2, 20)]);
    expect(result.weeklyFatigue.map((w) => w.weekNumber)).toEqual([1, 2, 3]);
  });
});
