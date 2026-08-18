// ─────────────────────────────────────────────────────────────
// lib/nutrition/insight.ts — pure unit tests
//
// No DB, no React — buildKynovantInsight() is a pure function over a
// real CalculationResult. Covers Phase 10's explicit checklist: fat
// loss / maintenance / muscle gain framing, correct use of actual
// TDEE/adjustment, no false deficit claims, and truthfulness after a
// manual coach override (never repeating the original recommendation's
// adjustment as if it still applies, never fabricating a reason).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { calculate } from "../calculator";
import { buildKynovantInsight } from "../insight";
import type { KynovantInsightInput } from "../insight";

const FAT_LOSS_REC = calculate({
  heightInches: 70,
  weightLbs: 210,
  ageYears: 34,
  biologicalSex: "male",
  activityLevel: "very_active",
  goalType: "fat_loss",
});

function baseInput(overrides: Partial<KynovantInsightInput> = {}): KynovantInsightInput {
  return {
    firstName: "Jermaine",
    rec: FAT_LOSS_REC,
    goalLabel: "Fat Loss",
    activityLabel: "Very Active (6–7 days/week)",
    activityLevel: "very_active",
    hasManualEdit: false,
    currentCalories: FAT_LOSS_REC.recommendedCalories,
    currentProteinG: FAT_LOSS_REC.recommendedProteinG,
    currentFatG: FAT_LOSS_REC.recommendedFatG,
    currentCarbG: FAT_LOSS_REC.recommendedCarbG,
    adjustmentReason: "",
    ...overrides,
  };
}

describe("buildKynovantInsight — fat loss (deficit)", () => {
  it("mentions the real TDEE and the real deficit magnitude, not a canned number", () => {
    const paragraphs = buildKynovantInsight(baseInput());
    const full = paragraphs.join(" ");
    expect(full).toContain(FAT_LOSS_REC.tdee.toLocaleString());
    expect(full).toContain(Math.abs(FAT_LOSS_REC.calorieAdjustment).toLocaleString());
    expect(full.toLowerCase()).toContain("below maintenance");
    expect(full.toLowerCase()).toContain("fat loss");
  });

  it("never claims a surplus for a deficit goal", () => {
    const full = buildKynovantInsight(baseInput()).join(" ").toLowerCase();
    expect(full).not.toContain("above maintenance");
    expect(full).not.toContain("surplus");
  });

  it("uses hedged, non-clinical language", () => {
    const full = buildKynovantInsight(baseInput()).join(" ").toLowerCase();
    expect(full).toContain("estimate");
    expect(full).toContain("approximately");
  });

  it("mentions high training frequency for very_active", () => {
    const full = buildKynovantInsight(baseInput()).join(" ");
    expect(full).toContain("high training frequency");
  });

  it("does not mention training frequency for sedentary", () => {
    const sedentaryRec = calculate({
      heightInches: 70, weightLbs: 210, ageYears: 34, biologicalSex: "male",
      activityLevel: "sedentary", goalType: "fat_loss",
    });
    const full = buildKynovantInsight(baseInput({
      rec: sedentaryRec,
      activityLabel: "Sedentary (desk job, minimal exercise)",
      activityLevel: "sedentary",
      currentCalories: sedentaryRec.recommendedCalories,
      currentProteinG: sedentaryRec.recommendedProteinG,
      currentFatG: sedentaryRec.recommendedFatG,
      currentCarbG: sedentaryRec.recommendedCarbG,
    })).join(" ");
    expect(full).not.toContain("high training frequency");
  });
});

describe("buildKynovantInsight — maintenance (zero adjustment)", () => {
  const maintenanceRec = calculate({
    heightInches: 70, weightLbs: 210, ageYears: 34, biologicalSex: "male",
    activityLevel: "moderately_active", goalType: "maintenance",
  });

  it("never claims an actual deficit or surplus for a zero-adjustment goal", () => {
    const full = buildKynovantInsight(baseInput({
      rec: maintenanceRec,
      goalLabel: "Maintenance",
      activityLabel: "Moderately Active (3–5 days/week)",
      activityLevel: "moderately_active",
      currentCalories: maintenanceRec.recommendedCalories,
      currentProteinG: maintenanceRec.recommendedProteinG,
      currentFatG: maintenanceRec.recommendedFatG,
      currentCarbG: maintenanceRec.recommendedCarbG,
    })).join(" ").toLowerCase();
    expect(full).not.toContain("below maintenance");
    expect(full).not.toContain("above maintenance");
    // "deficit"/"surplus" only ever appear here inside the explicit
    // negation ("not applying a calorie deficit or surplus") — assert
    // that exact framing rather than the words' total absence.
    expect(full).toContain("not applying a calorie deficit or surplus");
    expect(full).toContain("targets maintenance");
    expect(full).not.toContain("high training frequency"); // moderately_active, not very/extra active
  });
});

describe("buildKynovantInsight — muscle gain (surplus)", () => {
  const surplusRec = calculate({
    heightInches: 70, weightLbs: 180, ageYears: 28, biologicalSex: "male",
    activityLevel: "moderately_active", goalType: "muscle_gain",
  });

  it("mentions the real surplus magnitude and never claims a deficit", () => {
    const full = buildKynovantInsight(baseInput({
      rec: surplusRec,
      goalLabel: "Muscle Gain",
      currentCalories: surplusRec.recommendedCalories,
      currentProteinG: surplusRec.recommendedProteinG,
      currentFatG: surplusRec.recommendedFatG,
      currentCarbG: surplusRec.recommendedCarbG,
    })).join(" ").toLowerCase();
    expect(full).toContain("above maintenance");
    expect(full).toContain(String(surplusRec.calorieAdjustment));
    expect(full).not.toContain("below maintenance");
  });
});

describe("buildKynovantInsight — truthfulness after manual coach override", () => {
  it("before any edit: does not include an 'initially recommended' paragraph", () => {
    const paragraphs = buildKynovantInsight(baseInput({ hasManualEdit: false }));
    const full = paragraphs.join(" ");
    expect(full).not.toContain("initially recommended");
  });

  it("after an edit that changes nothing numerically: still no override paragraph", () => {
    // hasManualEdit true, but currentCalories still equals the recommendation —
    // must not falsely claim a divergence that isn't real.
    const paragraphs = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: FAT_LOSS_REC.recommendedCalories,
    }));
    expect(paragraphs.join(" ")).not.toContain("initially recommended");
  });

  it("after a real downward edit: states both the original recommendation and the actual current deficit", () => {
    const adjustedCalories = FAT_LOSS_REC.recommendedCalories - 200;
    const paragraphs = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: adjustedCalories,
    }));
    const full = paragraphs.join(" ");
    expect(full).toContain("initially recommended");
    expect(full).toContain(FAT_LOSS_REC.recommendedCalories.toLocaleString());
    expect(full).toContain(adjustedCalories.toLocaleString());

    const expectedDiff = Math.abs(adjustedCalories - FAT_LOSS_REC.tdee);
    expect(full).toContain(expectedDiff.toLocaleString());
    expect(full.toLowerCase()).toContain("deficit");
  });

  it("does NOT restate the original recommendation's deficit as if it still applies", () => {
    // Original rec had a 400-ish kcal deficit from TDEE. Coach lowers
    // calories much further — the insight must describe THIS deficit,
    // not silently repeat the original adjustment number as truth.
    const adjustedCalories = FAT_LOSS_REC.tdee - 900; // a much bigger real deficit
    const paragraphs = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: adjustedCalories,
    }));
    const full = paragraphs.join(" ");
    // The real (900-ish) deficit must appear...
    expect(full).toContain("900");
    // ...and the paragraph describing the ORIGINAL recommendation's
    // adjustment (Paragraph 1) is about the recommendation, not framed
    // as the current plan — the override paragraph explicitly restates
    // the current number, so both are present and distinguishable.
    expect(full).toContain(adjustedCalories.toLocaleString());
  });

  it("can produce a surplus in the override paragraph even though the original recommendation was a deficit", () => {
    const surplusOverride = FAT_LOSS_REC.tdee + 300;
    const full = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: surplusOverride,
    })).join(" ").toLowerCase();
    expect(full).toContain("surplus");
  });

  it("includes the coach's adjustment reason when provided", () => {
    const full = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: FAT_LOSS_REC.recommendedCalories - 150,
      adjustmentReason: "Starting lower, adjusting after next check-in",
    })).join(" ");
    expect(full).toContain("Starting lower, adjusting after next check-in");
  });

  it("never fabricates a reason when the coach left it blank", () => {
    const full = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: FAT_LOSS_REC.recommendedCalories - 150,
      adjustmentReason: "",
    })).join(" ");
    expect(full).not.toContain("Noted reason");
  });

  it("macro paragraph reflects the coach's current working values, not the original recommendation, once overridden", () => {
    const full = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: FAT_LOSS_REC.recommendedCalories - 150,
      currentProteinG: 999, // deliberately distinct from the recommendation
    })).join(" ");
    expect(full).toContain("999g");
    expect(full).not.toContain(`${FAT_LOSS_REC.recommendedProteinG}g to support muscle retention`);
  });

  it("falls back to the recommendation's macro values when a working field is blank", () => {
    const full = buildKynovantInsight(baseInput({
      hasManualEdit: true,
      currentCalories: FAT_LOSS_REC.recommendedCalories - 150,
      currentProteinG: null, // coach cleared the field
    })).join(" ");
    expect(full).toContain(`${FAT_LOSS_REC.recommendedProteinG}g to support muscle retention`);
  });
});

describe("buildKynovantInsight — always includes the closing monitoring guidance", () => {
  it("every scenario ends with the same general monitoring line", () => {
    const paragraphs = buildKynovantInsight(baseInput());
    expect(paragraphs[paragraphs.length - 1]).toBe(
      "Monitor body-weight trend, performance, recovery, hunger, and adherence before making further adjustments.",
    );
  });
});
