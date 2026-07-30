import { describe, it, expect } from "vitest";
import { validateProgramStructureFromData } from "../modules/program-structure";
import type { EnrichedProgramWeek } from "../types";

function makeDay(dayOfWeek: number, workoutTemplateId: string | null = "tmpl-1") {
  return {
    dayOfWeek,
    workoutTemplateId,
    templateName: workoutTemplateId ? "Push Day" : null,
    templateStatus: workoutTemplateId ? "active" : null,
  };
}

function makeWeek(
  weekNumber: number,
  days: EnrichedProgramWeek["days"] = [makeDay(1)],
): EnrichedProgramWeek {
  return {
    weekId: `week-${weekNumber}`,
    weekNumber,
    label: null,
    days,
  };
}

describe("validateProgramStructureFromData", () => {
  describe("PROGRAM_NO_WEEKS", () => {
    it("fires and returns early when weeks array is empty", () => {
      const result = validateProgramStructureFromData([]);
      expect(result.valid).toBe(false);
      expect(result.weekCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("PROGRAM_NO_WEEKS");
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors[0].confidence).toBe("certain");
    });

    it("returns no other findings when PROGRAM_NO_WEEKS fires", () => {
      const result = validateProgramStructureFromData([]);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("PROGRAM_ALL_REST", () => {
    it("fires when all days across all weeks are rest days (null templateId)", () => {
      const weeks = [
        makeWeek(1, [makeDay(1, null), makeDay(3, null)]),
        makeWeek(2, [makeDay(2, null)]),
      ];
      const result = validateProgramStructureFromData(weeks);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "PROGRAM_ALL_REST")).toBe(true);
    });

    it("fires when weeks have no day rows at all (only empty weeks)", () => {
      const weeks = [makeWeek(1, []), makeWeek(2, [])];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_ALL_REST")).toBe(true);
    });

    it("does not fire when at least one day has a templateId", () => {
      const weeks = [makeWeek(1, [makeDay(1, null), makeDay(3, "tmpl-1")])];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_ALL_REST")).toBe(false);
    });

    it("returns early after PROGRAM_ALL_REST — no other errors added", () => {
      const weeks = [makeWeek(1, [makeDay(1, null)])];
      const result = validateProgramStructureFromData(weeks);
      const codes = result.errors.map((e) => e.code);
      expect(codes).not.toContain("PROGRAM_WEEK_GAP");
    });
  });

  describe("PROGRAM_WEEK_GAP", () => {
    it("fires when weekNumbers are not contiguous from 1 (missing week 3)", () => {
      const weeks = [makeWeek(1), makeWeek(2), makeWeek(4)];
      const result = validateProgramStructureFromData(weeks);
      const gapError = result.errors.find((e) => e.code === "PROGRAM_WEEK_GAP");
      expect(gapError).toBeDefined();
      expect(gapError?.title).toContain("3");
    });

    it("fires when the first week is not week 1", () => {
      const weeks = [makeWeek(2), makeWeek(3)];
      const result = validateProgramStructureFromData(weeks);
      const gapError = result.errors.find((e) => e.code === "PROGRAM_WEEK_GAP");
      expect(gapError).toBeDefined();
      expect(gapError?.title).toContain("1");
    });

    it("reports only the first gap, not all gaps", () => {
      // weeks 1, 3, 5 → gaps at 2 and 4; only gap at 2 should appear
      const weeks = [makeWeek(1), makeWeek(3), makeWeek(5)];
      const result = validateProgramStructureFromData(weeks);
      const gapErrors = result.errors.filter((e) => e.code === "PROGRAM_WEEK_GAP");
      expect(gapErrors).toHaveLength(1);
    });

    it("does not fire for a contiguous 4-week program", () => {
      const weeks = [makeWeek(1), makeWeek(2), makeWeek(3), makeWeek(4)];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_WEEK_GAP")).toBe(false);
    });
  });

  describe("PROGRAM_EMPTY_WEEK", () => {
    it("fires as a warning when a week has no day rows", () => {
      const weeks = [makeWeek(1), makeWeek(2, [])];
      const result = validateProgramStructureFromData(weeks);
      const emptyWarning = result.warnings.find((w) => w.code === "PROGRAM_EMPTY_WEEK");
      expect(emptyWarning).toBeDefined();
      expect(emptyWarning?.severity).toBe("warning");
    });

    it("includes the week number in the finding title", () => {
      const weeks = [makeWeek(1), makeWeek(2, [])];
      const result = validateProgramStructureFromData(weeks);
      const emptyWarning = result.warnings.find((w) => w.code === "PROGRAM_EMPTY_WEEK");
      expect(emptyWarning?.title).toContain("2");
    });

    it("fires for each empty week independently", () => {
      const weeks = [makeWeek(1, []), makeWeek(2), makeWeek(3, [])];
      const result = validateProgramStructureFromData(weeks);
      const emptyWarnings = result.warnings.filter((w) => w.code === "PROGRAM_EMPTY_WEEK");
      expect(emptyWarnings).toHaveLength(2);
    });

    it("does not fire for a week that has only rest days (null templateId)", () => {
      const weeks = [makeWeek(1, [makeDay(1, null)]), makeWeek(2)];
      const result = validateProgramStructureFromData(weeks);
      expect(result.warnings.some((w) => w.code === "PROGRAM_EMPTY_WEEK")).toBe(false);
    });
  });

  describe("PROGRAM_ARCHIVED_BLUEPRINT", () => {
    it("fires when a day references a template with status != active", () => {
      const weeks = [
        makeWeek(1, [
          {
            dayOfWeek: 1,
            workoutTemplateId: "tmpl-archived",
            templateName: "Old Push Day",
            templateStatus: "archived",
          },
        ]),
      ];
      const result = validateProgramStructureFromData(weeks);
      const archivedError = result.errors.find((e) => e.code === "PROGRAM_ARCHIVED_BLUEPRINT");
      expect(archivedError).toBeDefined();
      expect(archivedError?.severity).toBe("error");
    });

    it("fires for draft templates too", () => {
      const weeks = [
        makeWeek(1, [
          {
            dayOfWeek: 2,
            workoutTemplateId: "tmpl-draft",
            templateName: "Draft Blueprint",
            templateStatus: "draft",
          },
        ]),
      ];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_ARCHIVED_BLUEPRINT")).toBe(true);
    });

    it("does not fire for active templates", () => {
      const weeks = [makeWeek(1)];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_ARCHIVED_BLUEPRINT")).toBe(false);
    });

    it("does not fire for rest days (null workoutTemplateId)", () => {
      const weeks = [makeWeek(1, [makeDay(1, null)])];
      const result = validateProgramStructureFromData(weeks);
      expect(result.errors.some((e) => e.code === "PROGRAM_ARCHIVED_BLUEPRINT")).toBe(false);
    });

    it("includes the template name in the finding explanation", () => {
      const weeks = [
        makeWeek(1, [
          {
            dayOfWeek: 1,
            workoutTemplateId: "tmpl-arc",
            templateName: "My Old Blueprint",
            templateStatus: "archived",
          },
        ]),
      ];
      const result = validateProgramStructureFromData(weeks);
      const finding = result.errors.find((e) => e.code === "PROGRAM_ARCHIVED_BLUEPRINT");
      expect(finding?.explanation).toContain("My Old Blueprint");
    });
  });

  describe("clean program", () => {
    it("returns valid=true and no findings for a well-formed 4-week program", () => {
      const weeks = [
        makeWeek(1, [makeDay(1), makeDay(3), makeDay(5)]),
        makeWeek(2, [makeDay(1), makeDay(3), makeDay(5)]),
        makeWeek(3, [makeDay(1), makeDay(3), makeDay(5)]),
        makeWeek(4, [makeDay(1), makeDay(3), makeDay(5)]),
      ];
      const result = validateProgramStructureFromData(weeks);
      expect(result.valid).toBe(true);
      expect(result.weekCount).toBe(4);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
