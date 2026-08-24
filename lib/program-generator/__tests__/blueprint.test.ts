// ─────────────────────────────────────────────────────────────
// Phase D — blueprint.ts. Pure unit suite, no DB, no provider.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveCanonicalWeekBlueprint,
  validateCanonicalWeekBlueprint,
  summarizeSiblingAllocationsForPrompt,
  type BlueprintShellDay,
} from "../blueprint";
import { deriveBlockPlans, type BlockPlan } from "../block-plan";
import type { ExperienceLevel } from "../strategy";

function block(overrides: Partial<BlockPlan> = {}): BlockPlan {
  const result = deriveBlockPlans("muscle_growth", "advanced", 12);
  if (!result.ok) throw new Error("fixture setup failed");
  return { ...result.blocks[0], ...overrides };
}

describe("architectural boundary — pure logic only", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/program-generator/blueprint.ts"), "utf8");

  it("imports only from ./strategy and ./block-plan — no DB/AI/network", () => {
    const forbidden = ["@/lib/db", "./contracts", "from \"./provider\"", "from \"ai\"", "@ai-sdk", "postgres", "drizzle", "server-only", "node:fs", "node:http", "fetch("];
    for (const pattern of forbidden) {
      expect(source, `blueprint.ts must not reference "${pattern}"`).not.toContain(pattern);
    }
    const fromClauses = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(fromClauses.length).toBeGreaterThan(0);
    for (const spec of fromClauses) {
      expect(["./strategy", "./block-plan"]).toContain(spec);
    }
  });
});

const FIVE_DAY_SPLIT: BlueprintShellDay[] = [
  { dayOfWeek: 1, label: "Push", targetMuscleGroups: ["chest", "front_deltoid", "triceps"] },
  { dayOfWeek: 2, label: "Pull", targetMuscleGroups: ["lats", "upper_back", "biceps"] },
  { dayOfWeek: 3, label: "Legs A", targetMuscleGroups: ["quadriceps", "glutes"] },
  { dayOfWeek: 5, label: "Upper Accessory", targetMuscleGroups: ["lateral_deltoid", "triceps"] },
  { dayOfWeek: 6, label: "Legs B", targetMuscleGroups: ["hamstrings", "glutes"] },
];

describe("deriveCanonicalWeekBlueprint", () => {
  it("[A] every shell day is mapped exactly once", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    expect(blueprint.days).toHaveLength(FIVE_DAY_SPLIT.length);
    expect(blueprint.days.map((d) => d.dayOfWeek).sort()).toEqual(FIVE_DAY_SPLIT.map((d) => d.dayOfWeek).sort());
  });

  it("[B] no duplicate slots", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const dows = blueprint.days.map((d) => d.dayOfWeek);
    expect(new Set(dows).size).toBe(dows.length);
  });

  it("[C] sibling movement allocations are coherent — the two overlapping 'legs' days get DIFFERENT pattern emphasis", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const legsA = blueprint.days.find((d) => d.label === "Legs A")!;
    const legsB = blueprint.days.find((d) => d.label === "Legs B")!;
    expect(legsA.primaryPatternEmphasis).not.toBeNull();
    expect(legsB.primaryPatternEmphasis).not.toBeNull();
    expect(legsA.primaryPatternEmphasis).not.toBe(legsB.primaryPatternEmphasis);
  });

  it("a day with no muscle-group overlap with any sibling gets no pattern constraint at all", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    // Pull (lats/upper_back/biceps) shares nothing with any other day
    // in FIVE_DAY_SPLIT — the one genuinely non-overlapping day.
    const pull = blueprint.days.find((d) => d.label === "Pull")!;
    expect(pull.primaryPatternEmphasis).toBeNull();
  });

  it("Push and Upper Accessory correctly overlap via a shared muscle group (triceps) and get diversified", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const push = blueprint.days.find((d) => d.label === "Push")!;
    const upperAccessory = blueprint.days.find((d) => d.label === "Upper Accessory")!;
    expect(push.primaryPatternEmphasis).not.toBeNull();
    expect(upperAccessory.primaryPatternEmphasis).not.toBeNull();
    expect(push.primaryPatternEmphasis).not.toBe(upperAccessory.primaryPatternEmphasis);
  });

  it("a day with no targetMuscleGroups at all (shell predates the field) gets no constraint, never a crash", () => {
    const days: BlueprintShellDay[] = [{ dayOfWeek: 1, label: "Full Body" }, { dayOfWeek: 3, label: "Full Body 2" }];
    const blueprint = deriveCanonicalWeekBlueprint(block(), days, "advanced");
    expect(blueprint.days.every((d) => d.primaryPatternEmphasis === null)).toBe(true);
  });

  it("three overlapping days cycle through three distinct patterns, not just two", () => {
    const days: BlueprintShellDay[] = [
      { dayOfWeek: 1, label: "Legs A", targetMuscleGroups: ["quadriceps"] },
      { dayOfWeek: 2, label: "Legs B", targetMuscleGroups: ["quadriceps"] },
      { dayOfWeek: 3, label: "Legs C", targetMuscleGroups: ["quadriceps"] },
    ];
    const blueprint = deriveCanonicalWeekBlueprint(block(), days, "advanced");
    const patterns = blueprint.days.map((d) => d.primaryPatternEmphasis);
    expect(new Set(patterns).size).toBe(3);
  });

  it("[overlap grouping P2, candidate 6734599] a BRIDGING day that overlaps two otherwise-separate days transitively merges them into one component", () => {
    // A=[chest] and C=[back] do NOT directly overlap each other, but
    // B=[chest,back] overlaps BOTH — all three must end up in the SAME
    // connected component (3 distinct pattern emphases), not two
    // separate components where A/B merge but C is left alone (the
    // exact bug: Array.find stopped at the FIRST matching group).
    const days: BlueprintShellDay[] = [
      { dayOfWeek: 1, label: "A", targetMuscleGroups: ["chest"] },
      { dayOfWeek: 3, label: "C", targetMuscleGroups: ["upper_back"] },
      { dayOfWeek: 5, label: "B (bridge)", targetMuscleGroups: ["chest", "upper_back"] },
    ];
    const blueprint = deriveCanonicalWeekBlueprint(block(), days, "advanced");
    const patterns = blueprint.days.map((d) => d.primaryPatternEmphasis);
    expect(patterns.every((p) => p !== null)).toBe(true);
    expect(new Set(patterns).size).toBe(3); // all three in one component, all distinct
  });

  it("[overlap grouping] two truly separate components remain separate, even with a bridging day present for a THIRD component", () => {
    const days: BlueprintShellDay[] = [
      { dayOfWeek: 1, label: "Push A", targetMuscleGroups: ["chest"] },
      { dayOfWeek: 2, label: "Push B", targetMuscleGroups: ["chest"] },
      { dayOfWeek: 3, label: "Legs A", targetMuscleGroups: ["quadriceps"] },
      { dayOfWeek: 4, label: "Legs B", targetMuscleGroups: ["quadriceps"] },
    ];
    const blueprint = deriveCanonicalWeekBlueprint(block(), days, "advanced");
    const pushPattern1 = blueprint.days.find((d) => d.label === "Push A")!.primaryPatternEmphasis;
    const pushPattern2 = blueprint.days.find((d) => d.label === "Push B")!.primaryPatternEmphasis;
    const legsPattern1 = blueprint.days.find((d) => d.label === "Legs A")!.primaryPatternEmphasis;
    const legsPattern2 = blueprint.days.find((d) => d.label === "Legs B")!.primaryPatternEmphasis;
    // Within each component, the two days differ from each other...
    expect(pushPattern1).not.toBe(pushPattern2);
    expect(legsPattern1).not.toBe(legsPattern2);
    // ...but the two components are independently assigned (both start
    // the SAME pattern cycle from its own beginning, since they never
    // interact) — the push component and leg component are NOT one
    // shared 4-way-distinct component.
    expect(new Set([pushPattern1, pushPattern2])).toEqual(new Set([legsPattern1, legsPattern2]));
  });

  it("[G/H/I] technique eligibility respects the experience ceiling: beginner never eligible, intermediate exactly one slot, advanced up to two", () => {
    const beginner = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "beginner");
    expect(beginner.days.every((d) => d.techniqueEligibility === null)).toBe(true);

    const intermediate = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "intermediate");
    expect(intermediate.days.filter((d) => d.techniqueEligibility !== null)).toHaveLength(1);

    const advanced = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    expect(advanced.days.filter((d) => d.techniqueEligibility !== null).length).toBeLessThanOrEqual(2);
    expect(advanced.days.filter((d) => d.techniqueEligibility !== null).length).toBeGreaterThan(0);
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    const first = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const second = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    expect(second).toEqual(first);
  });

  it("technique eligibility rotates by block number — different blocks don't always land on the same day", () => {
    const b1 = deriveCanonicalWeekBlueprint(block({ blockNumber: 1 }), FIVE_DAY_SPLIT, "intermediate");
    const b2 = deriveCanonicalWeekBlueprint(block({ blockNumber: 2 }), FIVE_DAY_SPLIT, "intermediate");
    const eligibleDay1 = b1.days.find((d) => d.techniqueEligibility !== null)?.dayOfWeek;
    const eligibleDay2 = b2.days.find((d) => d.techniqueEligibility !== null)?.dayOfWeek;
    expect(eligibleDay1).not.toBe(eligibleDay2);
  });
});

describe("validateCanonicalWeekBlueprint", () => {
  it("accepts a well-formed blueprint", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    expect(validateCanonicalWeekBlueprint(blueprint, FIVE_DAY_SPLIT, "advanced").ok).toBe(true);
  });

  it("rejects a blueprint missing a shell day", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const broken = { ...blueprint, days: blueprint.days.slice(0, 3) };
    expect(validateCanonicalWeekBlueprint(broken, FIVE_DAY_SPLIT, "advanced").ok).toBe(false);
  });

  it("rejects a blueprint with a duplicate dayOfWeek slot", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const broken = { ...blueprint, days: [...blueprint.days.slice(0, 4), { ...blueprint.days[4], dayOfWeek: blueprint.days[0].dayOfWeek }] };
    expect(validateCanonicalWeekBlueprint(broken, FIVE_DAY_SPLIT, "advanced").ok).toBe(false);
  });

  it("rejects a blueprint slot whose dayOfWeek doesn't match any real shell day", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const broken = { ...blueprint, days: [...blueprint.days.slice(0, 4), { ...blueprint.days[4], dayOfWeek: 99 }] };
    expect(validateCanonicalWeekBlueprint(broken, FIVE_DAY_SPLIT, "advanced").ok).toBe(false);
  });

  it("[I] rejects a beginner blueprint with ANY technique-eligible day", () => {
    const advancedBlueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    // Simulate a defect: an advanced-shaped blueprint mistakenly
    // validated against beginner.
    expect(validateCanonicalWeekBlueprint(advancedBlueprint, FIVE_DAY_SPLIT, "beginner").ok).toBe(false);
  });

  it("rejects a blueprint exceeding the experience-appropriate technique-eligible slot count", () => {
    const advancedBlueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    // advanced can have up to 2 eligible; validate against intermediate's ceiling of 1.
    const eligibleCount = advancedBlueprint.days.filter((d) => d.techniqueEligibility !== null).length;
    if (eligibleCount > 1) {
      expect(validateCanonicalWeekBlueprint(advancedBlueprint, FIVE_DAY_SPLIT, "intermediate").ok).toBe(false);
    }
  });
});

describe("summarizeSiblingAllocationsForPrompt", () => {
  it("[18] describes every OTHER day, never the day itself, and never any generated content", () => {
    const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, "advanced");
    const summary = summarizeSiblingAllocationsForPrompt(blueprint, 3); // "Legs A"
    expect(summary).not.toBeNull();
    expect(summary).not.toContain("Legs A");
    expect(summary).toContain("Push");
    expect(summary).toContain("Pull");
    expect(summary).toContain("Legs B");
  });

  it("returns null for a single-day week (no siblings to summarize)", () => {
    const oneDay: BlueprintShellDay[] = [{ dayOfWeek: 1, label: "Full Body" }];
    const blueprint = deriveCanonicalWeekBlueprint(block(), oneDay, "advanced");
    expect(summarizeSiblingAllocationsForPrompt(blueprint, 1)).toBeNull();
  });
});

describe("technique eligibility across experience levels — full sweep", () => {
  const ALL_EXPERIENCE: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "competitive", "mixed"];
  it("[J] taper phase: technique eligibility derivation is independent of phaseType — taper's own strip-to-straight-set rule lives entirely in Phase B (progression.ts), never duplicated here", () => {
    // This module has no phaseType branch in deriveTechniqueEligibility
    // at all — documented by construction: verify a taper-phase block
    // still gets the same experience-driven eligibility any other
    // phase would, since Phase B's own applyTaperProgression is what
    // actually strips high-fatigue techniques during taper, not this
    // module pretending to know about taper.
    const taperBlockResult = deriveBlockPlans("competition_prep", "advanced", 8);
    expect(taperBlockResult.ok).toBe(true);
    if (!taperBlockResult.ok) return;
    const taperBlock = taperBlockResult.blocks[taperBlockResult.blocks.length - 1];
    expect(taperBlock.phaseType).toBe("taper");
    const blueprint = deriveCanonicalWeekBlueprint(taperBlock, FIVE_DAY_SPLIT, "advanced");
    expect(blueprint.days.filter((d) => d.techniqueEligibility !== null).length).toBeGreaterThan(0);
  });

  it("never assigns a technique-eligible slot beyond the experience-appropriate ceiling, for every experience level", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      const blueprint = deriveCanonicalWeekBlueprint(block(), FIVE_DAY_SPLIT, experienceLevel);
      const eligibleCount = blueprint.days.filter((d) => d.techniqueEligibility !== null).length;
      const ceiling = experienceLevel === "beginner" ? 0 : experienceLevel === "advanced" || experienceLevel === "competitive" ? 2 : 1;
      expect(eligibleCount).toBeLessThanOrEqual(ceiling);
    }
  });
});
