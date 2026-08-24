// ─────────────────────────────────────────────────────────────
// [Monday-first scheduling remediation] Narrow, targeted coverage for
// buildShellGenerationPrompt's new dayOfWeek instruction — the "hint"
// half of the hybrid fix (provider.ts's normalizeAmbiguousShellSchedule
// is the deterministic "guard" half, covered in provider.test.ts).
//
// This only asserts the PROMPT TEXT itself, which is fully
// deterministic and safe to test directly — whether the model actually
// complies is not something a pure unit test can guarantee (see this
// remediation's own report: that's exactly why the deterministic guard
// exists as a backstop rather than relying on this alone).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { buildShellGenerationPrompt } from "../prompt";
import type { ProgramGenerationBrief } from "../contracts";

const VALID_BRIEF: ProgramGenerationBrief = {
  goal: "muscle_growth",
  weeks: 8,
  daysPerWeek: 5,
  preferredSplit: "coach_decides",
  experienceLevel: "intermediate",
  equipmentAccess: "commercial_gym",
  targetSessionMinutes: 60,
  excludedExerciseIds: [],
  allowedTechniques: ["straight_set"],
  avoidedTechniques: [],
  hardSessionCap: false,
  warmupIncluded: true,
  musclePriorities: [],
};

describe("buildShellGenerationPrompt — dayOfWeek convention instruction", () => {
  it("explicitly documents the 0=Sunday...6=Saturday convention", () => {
    const prompt = buildShellGenerationPrompt(VALID_BRIEF, null);
    expect(prompt).toContain("0=Sunday");
    expect(prompt).toContain("1=Monday");
    expect(prompt).toContain("2=Tuesday");
    expect(prompt).toContain("3=Wednesday");
    expect(prompt).toContain("4=Thursday");
    expect(prompt).toContain("5=Friday");
    expect(prompt).toContain("6=Saturday");
  });

  it("instructs a Monday-first default unless the brief/notes say otherwise", () => {
    const prompt = buildShellGenerationPrompt(VALID_BRIEF, null);
    expect(prompt).toMatch(/training week should begin on Monday/i);
    expect(prompt).toContain("dayOfWeek=1");
    expect(prompt).toMatch(/unless the brief or its additional notes explicitly requests/i);
  });

  it("still includes the pre-existing days-count/split instruction (regression guard — this remediation only adds to the prompt, never removes)", () => {
    const prompt = buildShellGenerationPrompt(VALID_BRIEF, null);
    expect(prompt).toContain("days must have exactly 5 entries");
  });
});
