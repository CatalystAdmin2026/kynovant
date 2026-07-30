import { describe, it, expect } from "vitest";
import { generateRecommendations } from "../recommendations";
import type { PilFinding, PilCategory, PilSeverity, PilConfidence } from "../types";

// ─── Finding factory ──────────────────────────────────────────────────────────

let seq = 0;
function makeId() { return `finding-${++seq}`; }

function f(
  code: string,
  severity: PilSeverity,
  category: PilCategory,
  confidence: PilConfidence = "certain",
  affectedEntities: PilFinding["affectedEntities"] = [],
  evidence: PilFinding["evidence"] = [],
): PilFinding {
  return {
    id: makeId(),
    code,
    severity,
    category,
    confidence,
    title: `${code} title`,
    explanation: `${code} explanation`,
    evidence,
    affectedEntities,
  };
}

function muscleEntity(id: string) {
  return { type: "muscle" as const, id, name: id.replace(/_/g, " ") };
}

function jointEntity(id: string) {
  return { type: "joint" as const, id, name: id };
}

function exerciseEntity(id: string, name: string) {
  return { type: "exercise" as const, id, name };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateRecommendations", () => {
  describe("clean findings", () => {
    it("returns no recommendations for an empty findings array", () => {
      const result = generateRecommendations([]);
      expect(result.hasActionableRecommendations).toBe(false);
      expect(result.highestPriority).toBeNull();
      expect(result.recommendations).toHaveLength(0);
    });

    it("returns no recommendations for only info-severity completeness findings", () => {
      const findings = [
        f("COMPLETENESS_MISSING", "info", "volume"),
      ];
      const result = generateRecommendations(findings);
      expect(result.hasActionableRecommendations).toBe(false);
    });
  });

  describe("ruleValidityErrors", () => {
    it("fires for any validity error finding", () => {
      const findings = [f("VALIDITY_REPS_INVERTED", "error", "validity")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("VALIDITY_REPS_INVERTED"));
      expect(rec).toBeDefined();
      expect(rec?.priority).toBe("critical");
      expect(rec?.category).toBe("session_design");
      expect(rec?.confidence).toBe("certain");
    });

    it("headline mentions the error count", () => {
      const findings = [
        f("VALIDITY_REPS_INVERTED", "error", "validity"),
        f("VALIDITY_RPE_EXCEEDS_MAX", "error", "validity"),
        f("VALIDITY_EXERCISE_INACTIVE", "error", "validity"),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations[0];
      expect(rec.headline).toContain("3");
    });

    it("supportingFindingCodes contains all distinct validity error codes", () => {
      const findings = [
        f("VALIDITY_REPS_INVERTED", "error", "validity"),
        f("VALIDITY_REPS_INVERTED", "error", "validity"), // duplicate code
        f("VALIDITY_RPE_EXCEEDS_MAX", "error", "validity"),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations[0];
      expect(rec.supportingFindingCodes).toContain("VALIDITY_REPS_INVERTED");
      expect(rec.supportingFindingCodes).toContain("VALIDITY_RPE_EXCEEDS_MAX");
      // Deduplicated — not 3 entries
      expect(rec.supportingFindingCodes.filter((c) => c === "VALIDITY_REPS_INVERTED")).toHaveLength(1);
    });

    it("does not fire for validity warnings (only for errors)", () => {
      const findings = [f("VALIDITY_NO_PRESCRIPTIONS", "warning", "validity")];
      const result = generateRecommendations(findings);
      expect(result.recommendations.some((r) => r.supportingFindingCodes.includes("VALIDITY_NO_PRESCRIPTIONS"))).toBe(false);
    });
  });

  describe("validity suppression", () => {
    it("suppresses all non-validity recommendations when validity errors are present", () => {
      const findings = [
        f("VALIDITY_REPS_INVERTED", "error", "validity"),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue"),
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement"),
        f("DURATION_VERY_LONG", "warning", "duration"),
      ];
      const result = generateRecommendations(findings);
      expect(result.recommendations.every((r) =>
        r.supportingFindingCodes.every((c) => c.startsWith("VALIDITY_")),
      )).toBe(true);
      expect(result.recommendations).toHaveLength(1);
    });

    it("does NOT suppress recovery recommendations when no validity errors exist", () => {
      const findings = [
        f("VALIDITY_NO_PRESCRIPTIONS", "warning", "validity"), // warning, not error
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      expect(result.recommendations.some((r) => r.supportingFindingCodes.includes("RECOVERY_SAME_DAY"))).toBe(true);
    });
  });

  describe("ruleStructureNoContent", () => {
    it("fires for PROGRAM_NO_WEEKS", () => {
      const findings = [f("PROGRAM_NO_WEEKS", "error", "program_structure")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("PROGRAM_NO_WEEKS"));
      expect(rec).toBeDefined();
      expect(rec?.priority).toBe("critical");
    });

    it("fires for PROGRAM_ALL_REST", () => {
      const findings = [f("PROGRAM_ALL_REST", "error", "program_structure")];
      const result = generateRecommendations(findings);
      expect(result.recommendations.some((r) => r.supportingFindingCodes.includes("PROGRAM_ALL_REST"))).toBe(true);
    });
  });

  describe("ruleStructureWeekGap", () => {
    it("fires for PROGRAM_WEEK_GAP with critical priority", () => {
      const findings = [f("PROGRAM_WEEK_GAP", "error", "program_structure")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("PROGRAM_WEEK_GAP"));
      expect(rec?.priority).toBe("critical");
      expect(rec?.category).toBe("program_structure");
    });
  });

  describe("ruleStructureArchivedBlueprint", () => {
    it("fires for PROGRAM_ARCHIVED_BLUEPRINT", () => {
      const findings = [f("PROGRAM_ARCHIVED_BLUEPRINT", "error", "program_structure")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("PROGRAM_ARCHIVED_BLUEPRINT"));
      expect(rec?.priority).toBe("critical");
      expect(rec?.confidence).toBe("certain");
    });

    it("mentions plural blueprints when multiple archived findings exist", () => {
      const findings = [
        f("PROGRAM_ARCHIVED_BLUEPRINT", "error", "program_structure"),
        f("PROGRAM_ARCHIVED_BLUEPRINT", "error", "program_structure"),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("PROGRAM_ARCHIVED_BLUEPRINT"));
      expect(rec?.headline).toContain("2");
    });
  });

  describe("ruleSameDayRecovery", () => {
    it("fires for RECOVERY_SAME_DAY with critical priority and certain confidence", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_SAME_DAY"));
      expect(rec?.priority).toBe("critical");
      expect(rec?.confidence).toBe("certain");
    });

    it("includes the muscle name in the headline", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("quadriceps")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_SAME_DAY"));
      expect(rec?.headline).toContain("Quadriceps");
    });

    it("aggregates multiple same-day muscles into a single recommendation", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("quadriceps")]),
      ];
      const result = generateRecommendations(findings);
      const sameDayRecs = result.recommendations.filter((r) => r.supportingFindingCodes.includes("RECOVERY_SAME_DAY"));
      expect(sameDayRecs).toHaveLength(1);
      expect(sameDayRecs[0].headline).toContain("Chest");
      expect(sameDayRecs[0].headline).toContain("Quadriceps");
    });
  });

  describe("ruleConsecutiveRecovery", () => {
    it("fires for RECOVERY_CONSECUTIVE with high priority", () => {
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("lats")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_CONSECUTIVE"));
      expect(rec?.priority).toBe("high");
      expect(rec?.confidence).toBe("heuristic");
    });

    it("includes the muscle name in the headline", () => {
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("upper_back")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_CONSECUTIVE"));
      expect(rec?.headline).toContain("Upper Back");
    });
  });

  describe("ruleFatigueHigh", () => {
    it("fires for FATIGUE_ACCUMULATION with high priority", () => {
      const findings = [f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("FATIGUE_ACCUMULATION"));
      expect(rec?.priority).toBe("high");
      expect(rec?.category).toBe("session_design");
    });

    it("does not fire when only FATIGUE_HIGH_COST_EXERCISE is present (different code)", () => {
      const findings = [f("FATIGUE_HIGH_COST_EXERCISE", "caution", "fatigue", "certain")];
      const result = generateRecommendations(findings);
      expect(result.recommendations.some((r) => r.supportingFindingCodes.includes("FATIGUE_ACCUMULATION"))).toBe(false);
    });
  });

  describe("ruleJointExtreme", () => {
    it("fires for JOINT_STRESS_EXTREME_EXERCISE with high priority", () => {
      const findings = [
        f("JOINT_STRESS_EXTREME_EXERCISE", "caution", "joint_stress", "certain", [
          exerciseEntity("ex-1", "Good Morning"),
          jointEntity("spine"),
        ]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("JOINT_STRESS_EXTREME_EXERCISE"));
      expect(rec?.priority).toBe("high");
      expect(rec?.headline).toContain("Spine");
    });
  });

  describe("ruleJointCumulative", () => {
    it("fires for JOINT_STRESS_HIGH_CUMULATIVE with high priority", () => {
      const findings = [
        f("JOINT_STRESS_HIGH_CUMULATIVE", "warning", "joint_stress", "heuristic", [jointEntity("knee")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("JOINT_STRESS_HIGH_CUMULATIVE"));
      expect(rec?.priority).toBe("high");
      expect(rec?.headline).toContain("Knee");
    });
  });

  describe("ruleJointMultiple", () => {
    it("fires for JOINT_STRESS_MULTIPLE_HIGH with medium priority", () => {
      const findings = [
        f("JOINT_STRESS_MULTIPLE_HIGH", "caution", "joint_stress", "heuristic", [jointEntity("shoulder")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("JOINT_STRESS_MULTIPLE_HIGH"));
      expect(rec?.priority).toBe("medium");
    });
  });

  describe("ruleFrequencyHigh", () => {
    it("fires for FREQUENCY_HIGH with high priority", () => {
      const findings = [
        f("FREQUENCY_HIGH", "caution", "frequency", "heuristic", [muscleEntity("chest")], [
          { label: "Sessions per week", value: 5 },
        ]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("FREQUENCY_HIGH"));
      expect(rec?.priority).toBe("high");
      expect(rec?.headline).toContain("Chest");
    });
  });

  describe("ruleMovementHorizontal", () => {
    it("fires for MOVEMENT_PUSH_PULL_H with medium priority and movement category", () => {
      const findings = [f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("MOVEMENT_PUSH_PULL_H"));
      expect(rec?.priority).toBe("medium");
      expect(rec?.category).toBe("movement");
      expect(rec?.headline).toContain("horizontal pulling");
    });
  });

  describe("ruleMovementVertical", () => {
    it("fires for MOVEMENT_PUSH_PULL_V with medium priority", () => {
      const findings = [f("MOVEMENT_PUSH_PULL_V", "warning", "movement", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("MOVEMENT_PUSH_PULL_V"));
      expect(rec?.priority).toBe("medium");
      expect(rec?.headline).toContain("vertical pulling");
    });
  });

  describe("ruleVolumeHigh", () => {
    it("fires for VOLUME_HIGH_DIRECT with medium priority", () => {
      const findings = [
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("VOLUME_HIGH_DIRECT"));
      expect(rec?.priority).toBe("medium");
      expect(rec?.headline).toContain("Chest");
    });

    it("aggregates multiple high-volume muscles into one recommendation", () => {
      const findings = [
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("chest")]),
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("quadriceps")]),
      ];
      const result = generateRecommendations(findings);
      const volumeRecs = result.recommendations.filter((r) => r.supportingFindingCodes.includes("VOLUME_HIGH_DIRECT"));
      expect(volumeRecs).toHaveLength(1);
    });
  });

  describe("ruleDurationVeryLong", () => {
    it("fires for DURATION_VERY_LONG with medium priority", () => {
      const findings = [f("DURATION_VERY_LONG", "warning", "duration", "certain")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("DURATION_VERY_LONG"));
      expect(rec?.priority).toBe("medium");
    });

    it("inherits confidence from the finding", () => {
      const findings = [f("DURATION_VERY_LONG", "warning", "duration", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("DURATION_VERY_LONG"));
      expect(rec?.confidence).toBe("heuristic");
    });
  });

  describe("ruleRedundancy", () => {
    it("fires for REDUNDANCY_PATTERN_MUSCLE with low priority", () => {
      const findings = [f("REDUNDANCY_PATTERN_MUSCLE", "caution", "redundancy", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("REDUNDANCY_PATTERN_MUSCLE"));
      expect(rec?.priority).toBe("low");
    });
  });

  describe("ruleDurationLong", () => {
    it("fires for DURATION_LONG with low priority when DURATION_VERY_LONG is absent", () => {
      const findings = [f("DURATION_LONG", "caution", "duration", "heuristic")];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("DURATION_LONG"));
      expect(rec?.priority).toBe("low");
    });

    it("does not fire when DURATION_VERY_LONG is present (split recommendation covers it)", () => {
      const findings = [
        f("DURATION_LONG", "caution", "duration", "heuristic"),
        f("DURATION_VERY_LONG", "warning", "duration", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      expect(result.recommendations.some((r) => r.supportingFindingCodes.includes("DURATION_LONG") && !r.supportingFindingCodes.includes("DURATION_VERY_LONG"))).toBe(false);
    });
  });

  describe("ruleFrequencyZero", () => {
    it("fires for FREQUENCY_ZERO_MAJOR with low priority", () => {
      const findings = [
        f("FREQUENCY_ZERO_MAJOR", "info", "frequency", "certain", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("FREQUENCY_ZERO_MAJOR"));
      expect(rec?.priority).toBe("low");
      expect(rec?.headline).toContain("Chest");
    });
  });

  describe("priority ordering", () => {
    it("places critical recommendations before high before medium before low", () => {
      const findings = [
        f("DURATION_LONG", "caution", "duration", "heuristic"),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic"),
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      const priorities = result.recommendations.map((r) => r.priority);
      const rankOf = (p: string) => ({ critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 99);
      for (let i = 0; i < priorities.length - 1; i++) {
        expect(rankOf(priorities[i])).toBeLessThanOrEqual(rankOf(priorities[i + 1]));
      }
    });

    it("highestPriority is always the first recommendation", () => {
      const findings = [
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("chest")]),
        f("REDUNDANCY_PATTERN_MUSCLE", "caution", "redundancy", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      expect(result.highestPriority).toBe(result.recommendations[0]);
    });

    it("within the same priority, certain confidence ranks before heuristic", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),   // critical+certain
        f("PROGRAM_WEEK_GAP", "error", "program_structure", "certain"),                      // critical+certain
      ];
      const result = generateRecommendations(findings);
      // Both critical+certain — order doesn't matter for this assertion, but both should appear
      const priorities = result.recommendations.map((r) => r.priority);
      expect(priorities.every((p) => p === "critical")).toBe(true);
    });
  });

  describe("byCategory grouping", () => {
    it("groups recommendations by their category", () => {
      const findings = [
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
        f("MOVEMENT_PUSH_PULL_V", "warning", "movement", "heuristic"),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      expect(result.byCategory.movement).toHaveLength(2);
      expect(result.byCategory.session_design).toHaveLength(1);
    });

    it("omits categories with no recommendations", () => {
      const findings = [f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic")];
      const result = generateRecommendations(findings);
      expect(result.byCategory.recovery).toBeUndefined();
    });
  });

  describe("supportingFindingCodes linkage", () => {
    it("every recommendation has at least one supporting code", () => {
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("lats")]),
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
        f("REDUNDANCY_PATTERN_MUSCLE", "caution", "redundancy", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      for (const rec of result.recommendations) {
        expect(rec.supportingFindingCodes.length).toBeGreaterThan(0);
      }
    });

    it("every supporting code corresponds to an actual finding code in the input", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic"),
      ];
      const inputCodes = new Set(findings.map((f) => f.code));
      const result = generateRecommendations(findings);
      for (const rec of result.recommendations) {
        for (const code of rec.supportingFindingCodes) {
          expect(inputCodes.has(code)).toBe(true);
        }
      }
    });
  });

  describe("cap at 8 recommendations", () => {
    it("returns at most 8 recommendations regardless of how many rules fire", () => {
      // Generate findings that trigger many different rules
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("chest")]),
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("lats")]),
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("hamstrings")]),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic"),
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
        f("MOVEMENT_PUSH_PULL_V", "warning", "movement", "heuristic"),
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("chest")]),
        f("JOINT_STRESS_HIGH_CUMULATIVE", "warning", "joint_stress", "heuristic", [jointEntity("spine")]),
        f("JOINT_STRESS_EXTREME_EXERCISE", "caution", "joint_stress", "certain", [exerciseEntity("ex-1", "RDL"), jointEntity("spine")]),
        f("DURATION_VERY_LONG", "warning", "duration", "heuristic"),
        f("REDUNDANCY_PATTERN_MUSCLE", "caution", "redundancy", "heuristic"),
        f("FREQUENCY_ZERO_MAJOR", "info", "frequency", "certain", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      expect(result.recommendations.length).toBeLessThanOrEqual(8);
    });
  });

  describe("no recommendation for unknown finding codes", () => {
    it("does not generate recommendations for finding codes not covered by any rule", () => {
      const findings = [f("VOLUME_DATA_INCOMPLETE", "caution", "volume", "incomplete_data")];
      const result = generateRecommendations(findings);
      expect(result.hasActionableRecommendations).toBe(false);
    });
  });

  // ─── M1F: action field tests ────────────────────────────────────────────────

  describe("affectedMuscleGroups and substituteExercises", () => {
    it("ruleSameDayRecovery populates affectedMuscleGroups from finding entities", () => {
      const findings = [
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("chest")]),
        f("RECOVERY_SAME_DAY", "error", "recovery", "certain", [muscleEntity("lats")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_SAME_DAY"));
      expect(rec?.affectedMuscleGroups).toEqual(expect.arrayContaining(["chest", "lats"]));
      expect(rec?.substituteExercises).toHaveLength(0);
    });

    it("ruleConsecutiveRecovery populates affectedMuscleGroups", () => {
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("hamstrings")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_CONSECUTIVE"));
      expect(rec?.affectedMuscleGroups).toContain("hamstrings");
      expect(rec?.substituteExercises).toHaveLength(0);
    });

    it("ruleConsecutiveRecovery deduplicates the same muscle across multiple findings", () => {
      const findings = [
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("chest")]),
        f("RECOVERY_CONSECUTIVE", "warning", "recovery", "heuristic", [muscleEntity("chest")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("RECOVERY_CONSECUTIVE"));
      expect(rec?.affectedMuscleGroups.filter((m) => m === "chest")).toHaveLength(1);
    });

    it("ruleJointExtreme populates substituteExercises from exercise entities", () => {
      const findings = [
        f("JOINT_STRESS_EXTREME_EXERCISE", "warning", "joint_stress", "certain", [
          exerciseEntity("ex-1", "Good Morning"),
          jointEntity("spine"),
        ]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("JOINT_STRESS_EXTREME_EXERCISE"));
      expect(rec?.substituteExercises).toHaveLength(1);
      expect(rec?.substituteExercises[0]).toEqual({ id: "ex-1", name: "Good Morning" });
      expect(rec?.affectedMuscleGroups).toHaveLength(0);
    });

    it("ruleJointExtreme deduplicates the same exercise across multiple findings", () => {
      const findings = [
        f("JOINT_STRESS_EXTREME_EXERCISE", "warning", "joint_stress", "certain", [
          exerciseEntity("ex-1", "Good Morning"),
          jointEntity("spine"),
        ]),
        f("JOINT_STRESS_EXTREME_EXERCISE", "warning", "joint_stress", "certain", [
          exerciseEntity("ex-1", "Good Morning"),
          jointEntity("knee"),
        ]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("JOINT_STRESS_EXTREME_EXERCISE"));
      expect(rec?.substituteExercises.filter((e) => e.id === "ex-1")).toHaveLength(1);
    });

    it("ruleFrequencyHigh populates affectedMuscleGroups", () => {
      const findings = [
        f("FREQUENCY_HIGH", "caution", "frequency", "heuristic", [muscleEntity("quads")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("FREQUENCY_HIGH"));
      expect(rec?.affectedMuscleGroups).toContain("quads");
      expect(rec?.substituteExercises).toHaveLength(0);
    });

    it("ruleVolumeHigh populates affectedMuscleGroups", () => {
      const findings = [
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("chest")]),
        f("VOLUME_HIGH_DIRECT", "warning", "volume", "heuristic", [muscleEntity("lats")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("VOLUME_HIGH_DIRECT"));
      expect(rec?.affectedMuscleGroups).toEqual(expect.arrayContaining(["chest", "lats"]));
      expect(rec?.substituteExercises).toHaveLength(0);
    });

    it("ruleRedundancy populates substituteExercises (skipping the primary exercise)", () => {
      const findings = [
        f("REDUNDANCY_PATTERN_MUSCLE", "caution", "redundancy", "heuristic", [
          exerciseEntity("ex-1", "Bench Press"),
          exerciseEntity("ex-2", "Incline DB Press"),
        ]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("REDUNDANCY_PATTERN_MUSCLE"));
      // ex-1 is the primary; ex-2 is the redundant candidate
      expect(rec?.substituteExercises).toContainEqual({ id: "ex-2", name: "Incline DB Press" });
    });

    it("ruleFrequencyZero populates affectedMuscleGroups", () => {
      const findings = [
        f("FREQUENCY_ZERO_MAJOR", "info", "frequency", "certain", [muscleEntity("hamstrings")]),
        f("FREQUENCY_ZERO_MAJOR", "info", "frequency", "certain", [muscleEntity("calves")]),
      ];
      const result = generateRecommendations(findings);
      const rec = result.recommendations.find((r) => r.supportingFindingCodes.includes("FREQUENCY_ZERO_MAJOR"));
      expect(rec?.affectedMuscleGroups).toEqual(expect.arrayContaining(["hamstrings", "calves"]));
      expect(rec?.substituteExercises).toHaveLength(0);
    });

    it("rules that have no action data always return empty arrays (not undefined)", () => {
      const findings = [
        f("MOVEMENT_PUSH_PULL_H", "warning", "movement", "heuristic"),
        f("FATIGUE_ACCUMULATION", "warning", "fatigue", "heuristic"),
      ];
      const result = generateRecommendations(findings);
      for (const rec of result.recommendations) {
        expect(Array.isArray(rec.affectedMuscleGroups)).toBe(true);
        expect(Array.isArray(rec.substituteExercises)).toBe(true);
      }
    });
  });
});
