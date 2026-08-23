// ─────────────────────────────────────────────────────────────
// domain-enums.ts drift detection.
//
// domain-enums.ts is deliberately dependency-free (zero imports) so
// pure logic modules like strategy.ts can consume TemplateCategory/
// ExperienceLevel/program-length bounds without pulling in lib/db or
// the AI/provider surface. That purity means domain-enums.ts itself
// cannot import the real DB enum or the real brief schema to check
// itself against them — so THIS file does that job instead. It is a
// test, not a pure module, so it's allowed to import lib/db/schema.ts
// and contracts.ts directly. If either canonical source ever changes
// without domain-enums.ts being updated to match, this file fails.
//
// Review finding (independent review of Phase A, candidate 6df43c1):
// strategy.ts previously hand-mirrored TemplateCategory/ExperienceLevel
// itself with nothing to catch drift against the real DB enum. Fixing
// that meant hoisting the values into domain-enums.ts — but a second
// hand-mirrored copy is still a hand-mirrored copy unless something
// proves it matches. This file is that proof.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { templateCategoryEnum, experienceLevelEnum } from "@/lib/db/schema";
import { ProgramGenerationBriefSchema } from "../contracts";
import { TEMPLATE_CATEGORY_VALUES, EXPERIENCE_LEVEL_VALUES, MIN_PROGRAM_WEEKS, MAX_PROGRAM_WEEKS } from "../domain-enums";

describe("domain-enums.ts — architectural boundary", () => {
  it("has zero import statements — it is the one dependency-free source of these values for pure-logic consumers", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/program-generator/domain-enums.ts"), "utf8");
    const importLines = source.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(importLines).toEqual([]);
  });
});

describe("domain-enums.ts — drift detection against the real DB enum", () => {
  it("TEMPLATE_CATEGORY_VALUES is byte-for-byte identical to templateCategoryEnum.enumValues (lib/db/schema.ts), same order", () => {
    expect(TEMPLATE_CATEGORY_VALUES).toEqual(templateCategoryEnum.enumValues);
  });

  it("EXPERIENCE_LEVEL_VALUES is byte-for-byte identical to experienceLevelEnum.enumValues (lib/db/schema.ts), same order", () => {
    expect(EXPERIENCE_LEVEL_VALUES).toEqual(experienceLevelEnum.enumValues);
  });
});

describe("domain-enums.ts — drift detection against the real brief schema's weeks bound", () => {
  // Behavior-based, not structure-based: rather than reaching into
  // ProgramGenerationBriefSchema's internal Zod representation (which
  // is itself an implementation detail that could change independently
  // of the actual validated bound), build a minimal otherwise-valid
  // brief and vary only `weeks`, proving the schema's real accepted
  // range is exactly [MIN_PROGRAM_WEEKS, MAX_PROGRAM_WEEKS].
  function minimalBrief(weeks: number) {
    return {
      goal: TEMPLATE_CATEGORY_VALUES[0],
      weeks,
      daysPerWeek: 3,
      preferredSplit: "coach_decides" as const,
      experienceLevel: EXPERIENCE_LEVEL_VALUES[0],
      equipmentAccess: "commercial_gym" as const,
      targetSessionMinutes: 60,
    };
  }

  it(`accepts weeks=${MIN_PROGRAM_WEEKS} and weeks=${MAX_PROGRAM_WEEKS} (the domain-enums.ts bounds, inclusive)`, () => {
    expect(ProgramGenerationBriefSchema.safeParse(minimalBrief(MIN_PROGRAM_WEEKS)).success).toBe(true);
    expect(ProgramGenerationBriefSchema.safeParse(minimalBrief(MAX_PROGRAM_WEEKS)).success).toBe(true);
  });

  it(`rejects weeks=${MIN_PROGRAM_WEEKS - 1} and weeks=${MAX_PROGRAM_WEEKS + 1} — one step outside the domain-enums.ts bounds on each side`, () => {
    expect(ProgramGenerationBriefSchema.safeParse(minimalBrief(MIN_PROGRAM_WEEKS - 1)).success).toBe(false);
    expect(ProgramGenerationBriefSchema.safeParse(minimalBrief(MAX_PROGRAM_WEEKS + 1)).success).toBe(false);
  });
});
