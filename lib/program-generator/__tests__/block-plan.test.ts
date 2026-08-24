// ─────────────────────────────────────────────────────────────
// Phase C — block-plan.ts. Pure unit suite, no DB, no provider.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveBlockPlans, findBlockForWeek, resolveGenerationArchitecture, resolveEffectiveBlockGenerationVersion } from "../block-plan";
import { selectProgressionStrategy, type ExperienceLevel, type TemplateCategory } from "../strategy";

const SUPPORTED_GOALS: TemplateCategory[] = [
  "fat_loss",
  "muscle_growth",
  "body_recomposition",
  "lifestyle",
  "competition_prep",
  "executive_performance",
];
const ALL_EXPERIENCE: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "competitive", "mixed"];

describe("architectural boundary — pure logic only", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/program-generator/block-plan.ts"), "utf8");

  it("imports only from ./strategy and ./domain-enums — no DB/AI/network", () => {
    const forbidden = ["@/lib/db", "./contracts", "from \"./provider\"", "from \"ai\"", "@ai-sdk", "postgres", "drizzle", "server-only", "node:fs", "node:http", "fetch("];
    for (const pattern of forbidden) {
      expect(source, `block-plan.ts must not reference "${pattern}"`).not.toContain(pattern);
    }
    const fromClauses = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(fromClauses.length).toBeGreaterThan(0);
    for (const spec of fromClauses) {
      expect(["./strategy", "./domain-enums"]).toContain(spec);
    }
  });
});

describe("deriveBlockPlans", () => {
  it("athletic_performance fails closed, for every experience/length", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      for (const weeks of [4, 8, 12, 16]) {
        const result = deriveBlockPlans("athletic_performance", experienceLevel, weeks);
        expect(result.ok).toBe(false);
      }
    }
  });

  it("propagates pathological weeks failures from derivePhaseSequence unchanged", () => {
    for (const weeks of [0, -1, 17, 20, 52]) {
      const result = deriveBlockPlans("muscle_growth", "intermediate", weeks);
      expect(result.ok).toBe(false);
    }
  });

  it("blocks cover the whole program exactly once, contiguously, no gaps or overlaps — swept across every supported goal x experience x length", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (let weeks = 1; weeks <= 16; weeks++) {
          const result = deriveBlockPlans(goal, experienceLevel, weeks);
          expect(result.ok, `${goal}/${experienceLevel}/${weeks}wk`).toBe(true);
          if (!result.ok) continue;
          const blocks = result.blocks;
          expect(blocks.length).toBeGreaterThan(0);
          expect(blocks[0].weekStart).toBe(1);
          expect(blocks[blocks.length - 1].weekEnd).toBe(weeks);
          for (let i = 1; i < blocks.length; i++) {
            expect(blocks[i].weekStart).toBe(blocks[i - 1].weekEnd + 1);
          }
          for (const block of blocks) {
            expect(block.weekEnd).toBeGreaterThanOrEqual(block.weekStart);
            expect(block.blockLength).toBe(block.weekEnd - block.weekStart + 1);
            expect(block.canonicalWeekNumber).toBe(block.weekStart);
          }
          // Sequential block numbers starting at 1.
          expect(blocks.map((b) => b.blockNumber)).toEqual(blocks.map((_, i) => i + 1));
        }
      }
    }
  });

  it("every block's progressionStrategy matches strategy.ts's own selectProgressionStrategy for that goal/experience/phaseType", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        const result = deriveBlockPlans(goal, experienceLevel, 16);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        for (const block of result.blocks) {
          expect(block.progressionStrategy).toBe(selectProgressionStrategy(goal, experienceLevel, block.phaseType));
        }
      }
    }
  });

  it("competition_prep's final block is always its taper phase, at every length", () => {
    for (const experienceLevel of ALL_EXPERIENCE) {
      for (let weeks = 1; weeks <= 16; weeks++) {
        const result = deriveBlockPlans("competition_prep", experienceLevel, weeks);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const lastBlock = result.blocks[result.blocks.length - 1];
        expect(lastBlock.phaseType).toBe("taper");
        expect(lastBlock.progressionStrategy).toBe("taper");
      }
    }
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    for (const goal of SUPPORTED_GOALS) {
      const first = deriveBlockPlans(goal, "advanced", 12);
      const second = deriveBlockPlans(goal, "advanced", 12);
      expect(second).toEqual(first);
    }
  });

  it("no phase is ever starved to a 0-week allocation, even for phase sequences with many phases relative to short programs", () => {
    for (const goal of SUPPORTED_GOALS) {
      for (const experienceLevel of ALL_EXPERIENCE) {
        for (let weeks = 1; weeks <= 16; weeks++) {
          const result = deriveBlockPlans(goal, experienceLevel, weeks);
          if (!result.ok) continue;
          for (const block of result.blocks) {
            expect(block.blockLength).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it("a single-phase short program produces exactly one block spanning the whole program", () => {
    const result = deriveBlockPlans("lifestyle", "advanced", 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ weekStart: 1, weekEnd: 4, blockLength: 4 });
  });

  it("a long, multi-phase program can give a single phase more than one same-type block (never dumping the whole remainder onto one block)", () => {
    const result = deriveBlockPlans("muscle_growth", "advanced", 16);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Every individual block must still respect strategy.ts's own
    // PHASE_BLOCK_BOUNDS max (5 for accumulation, the widest) — proof
    // that a large allocation is carved into multiple blocks rather
    // than one oversized one exceeding the framework's own bounds.
    for (const block of result.blocks) {
      expect(block.blockLength).toBeLessThanOrEqual(5);
    }
  });
});

describe("findBlockForWeek", () => {
  it("resolves every week number in the program to exactly one block, with isCanonicalWeek true only at weekStart", () => {
    const result = deriveBlockPlans("muscle_growth", "advanced", 16);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let weekNumber = 1; weekNumber <= 16; weekNumber++) {
      const lookup = findBlockForWeek(result.blocks, weekNumber);
      expect(lookup).not.toBeNull();
      if (!lookup) continue;
      expect(weekNumber).toBeGreaterThanOrEqual(lookup.block.weekStart);
      expect(weekNumber).toBeLessThanOrEqual(lookup.block.weekEnd);
      expect(lookup.isCanonicalWeek).toBe(weekNumber === lookup.block.weekStart);
    }
  });

  it("returns null for a week number outside the program", () => {
    const result = deriveBlockPlans("muscle_growth", "advanced", 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findBlockForWeek(result.blocks, 0)).toBeNull();
    expect(findBlockForWeek(result.blocks, 9)).toBeNull();
  });
});

describe("resolveGenerationArchitecture", () => {
  // Review finding on Phase C candidate 5bfc4bc: this function no
  // longer takes a "hasAnyExistingProgress" flag at all — it only ever
  // answers "what would a genuinely NEW draft get." The
  // resume-with-null-architecture case (what "hasAnyExistingProgress"
  // used to gate) is now handled entirely by runStagedGeneration's own
  // isResume check, never by this function inferring anything from
  // content state — see staged-generation.test.ts's routing-lifecycle
  // tests (via the DB-backed integration suite) for that behavior.
  it("routes a genuinely fresh draft to 'block' for every supported goal", () => {
    for (const goal of SUPPORTED_GOALS) {
      expect(resolveGenerationArchitecture({ goal })).toBe("block");
    }
  });

  it("athletic_performance always routes to 'legacy_day'", () => {
    expect(resolveGenerationArchitecture({ goal: "athletic_performance" })).toBe("legacy_day");
  });
});

// ─────────────────────────────────────────────────────────────
// resolveEffectiveBlockGenerationVersion — Phase D review remediation
// (candidate 6734599, P1): the original inline
// `existingGenerationArchitectureVersion ?? CURRENT_BLOCK_GENERATION_VERSION`
// silently upgraded a RESUME of an existing "block" draft with a null
// persisted version (a real pre-Phase-D block draft) to the current
// default at runtime. This function is the one central resolver now.
// ─────────────────────────────────────────────────────────────
describe("resolveEffectiveBlockGenerationVersion", () => {
  const CURRENT_DEFAULT = 2 as const;

  it("legacy_day architecture always resolves to null, regardless of persistedVersion or isResume", () => {
    for (const persistedVersion of [null, 1, 2] as const) {
      for (const isResume of [true, false]) {
        expect(resolveEffectiveBlockGenerationVersion({ architecture: "legacy_day", persistedVersion, isResume }, CURRENT_DEFAULT)).toBeNull();
      }
    }
  });

  it("[B] a persisted version 2 is always honored on resume, never re-derived", () => {
    expect(resolveEffectiveBlockGenerationVersion({ architecture: "block", persistedVersion: 2, isResume: true }, CURRENT_DEFAULT)).toBe(2);
  });

  it("[C] a persisted version 1 is always honored on resume — runs v1 serial, never upgraded", () => {
    expect(resolveEffectiveBlockGenerationVersion({ architecture: "block", persistedVersion: 1, isResume: true }, CURRENT_DEFAULT)).toBe(1);
  });

  it("[D] the exact review-finding regression case: block architecture + NULL persisted version + isResume=true resolves to 1, NEVER the current default", () => {
    const result = resolveEffectiveBlockGenerationVersion({ architecture: "block", persistedVersion: null, isResume: true }, CURRENT_DEFAULT);
    expect(result).toBe(1);
    expect(result).not.toBe(CURRENT_DEFAULT);
  });

  it("[E] a malformed version (already sanitized to null by the caller) on resume is treated exactly like a genuine null — resolves to 1, not the current default", () => {
    // actions.ts's parseGenerationArchitectureVersion sanitizes any
    // value outside {1,2} to null before this function ever sees it —
    // this proves that once sanitized, it fails closed to version 1,
    // the same safe value a genuine historical null gets.
    expect(resolveEffectiveBlockGenerationVersion({ architecture: "block", persistedVersion: null, isResume: true }, CURRENT_DEFAULT)).toBe(1);
  });

  it("[A] a genuinely NEW block draft (isResume=false, no persisted version) gets the CURRENT default", () => {
    expect(resolveEffectiveBlockGenerationVersion({ architecture: "block", persistedVersion: null, isResume: false }, CURRENT_DEFAULT)).toBe(CURRENT_DEFAULT);
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    const ctx = { architecture: "block" as const, persistedVersion: null, isResume: true };
    expect(resolveEffectiveBlockGenerationVersion(ctx, CURRENT_DEFAULT)).toBe(resolveEffectiveBlockGenerationVersion(ctx, CURRENT_DEFAULT));
  });
});
