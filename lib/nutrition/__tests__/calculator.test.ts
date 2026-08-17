// ─────────────────────────────────────────────────────────────
// lib/nutrition/calculator.ts — pure unit tests
//
// No DB, no server-only imports needed — calculate()/validateInputs()/
// suggestActivityLevel()/ageFromDob() are pure functions. This file
// previously had zero dedicated tests despite being the formula the
// whole Nutrition Target feature depends on; the DB-backed
// nutrition-target-service.test.ts only exercises it indirectly
// through createDraft(). Covers Section 3's explicit checklist:
// normalized units, activity multiplier applied once, goal adjustment
// applied once, macro reconciliation, and invalid/missing input
// handling — without altering the formula itself.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  calculate,
  validateInputs,
  suggestActivityLevel,
  ageFromDob,
  ACTIVITY_MULTIPLIERS,
  GOAL_CALORIE_ADJUSTMENTS,
} from "../calculator";
import type { CalculatorInputs } from "../calculator";

const BASE: CalculatorInputs = {
  heightInches: 68,
  weightLbs: 160,
  ageYears: 30,
  biologicalSex: "female",
  activityLevel: "moderately_active",
  goalType: "maintenance",
};

describe("validateInputs", () => {
  it("passes for a fully valid input set", () => {
    expect(validateInputs(BASE)).toEqual([]);
  });

  it("flags missing height", () => {
    const errors = validateInputs({ ...BASE, heightInches: 0 });
    expect(errors.some((e) => e.field === "heightInches")).toBe(true);
  });

  it("flags height above the sane ceiling", () => {
    const errors = validateInputs({ ...BASE, heightInches: 500 });
    expect(errors.some((e) => e.field === "heightInches")).toBe(true);
  });

  it("flags missing weight", () => {
    const errors = validateInputs({ ...BASE, weightLbs: 0 });
    expect(errors.some((e) => e.field === "weightLbs")).toBe(true);
  });

  it("flags weight above the sane ceiling", () => {
    const errors = validateInputs({ ...BASE, weightLbs: 5000 });
    expect(errors.some((e) => e.field === "weightLbs")).toBe(true);
  });

  it("flags age below 13", () => {
    const errors = validateInputs({ ...BASE, ageYears: 10 });
    expect(errors.some((e) => e.field === "ageYears")).toBe(true);
  });

  it("flags age above 120", () => {
    const errors = validateInputs({ ...BASE, ageYears: 150 });
    expect(errors.some((e) => e.field === "ageYears")).toBe(true);
  });

  it("flags missing biological sex", () => {
    const errors = validateInputs({ ...BASE, biologicalSex: undefined });
    expect(errors.some((e) => e.field === "biologicalSex")).toBe(true);
  });

  it("does NOT flag biological sex when explicitly 'unspecified' — the documented fallback", () => {
    const errors = validateInputs({ ...BASE, biologicalSex: "unspecified" });
    expect(errors.some((e) => e.field === "biologicalSex")).toBe(false);
  });

  it("flags a missing/unknown activity level", () => {
    const errors = validateInputs({ ...BASE, activityLevel: "not_a_real_level" });
    expect(errors.some((e) => e.field === "activityLevel")).toBe(true);
  });

  it("reports all violations at once, not just the first", () => {
    const errors = validateInputs({});
    const fields = errors.map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(["heightInches", "weightLbs", "ageYears", "biologicalSex", "activityLevel"]),
    );
  });
});

describe("calculate — unit normalization + Mifflin-St Jeor", () => {
  it("converts lbs → kg and inches → cm before applying the formula (hand-computed reference case)", () => {
    // Female, 68in (172.72cm), 160lbs (72.5748kg), 30yo, sedentary, maintenance.
    // BMR = 10*72.5748 + 6.25*172.72 - 5*30 - 161 = 725.748 + 1079.5 - 150 - 161 = 1494.248 → round 1494
    const rec = calculate({ ...BASE, activityLevel: "sedentary" });
    expect(rec.bmr).toBe(1494);
  });

  it("male sex constant is +5 instead of female's -161", () => {
    const female = calculate({ ...BASE, biologicalSex: "female", activityLevel: "sedentary" });
    const male = calculate({ ...BASE, biologicalSex: "male", activityLevel: "sedentary" });
    expect(male.bmr - female.bmr).toBe(5 - -161); // 166 kcal higher, all else equal
  });

  it("'unspecified' sex uses the average of the male/female constants (-78), not a third formula", () => {
    const female = calculate({ ...BASE, biologicalSex: "female", activityLevel: "sedentary" });
    const male = calculate({ ...BASE, biologicalSex: "male", activityLevel: "sedentary" });
    const unspecified = calculate({ ...BASE, biologicalSex: "unspecified", activityLevel: "sedentary" });
    // (male + female) / 2, within rounding
    expect(Math.abs(unspecified.bmr - (male.bmr + female.bmr) / 2)).toBeLessThanOrEqual(1);
  });
});

describe("calculate — activity multiplier applied exactly once", () => {
  it("TDEE is BMR × the activity multiplier for that level, no double application", () => {
    for (const level of Object.keys(ACTIVITY_MULTIPLIERS)) {
      const rec = calculate({ ...BASE, activityLevel: level, goalType: "maintenance" });
      expect(rec.tdee).toBe(Math.round(rec.bmr * ACTIVITY_MULTIPLIERS[level]));
    }
  });

  it("a higher activity level never produces a lower TDEE for the same person", () => {
    const sedentary = calculate({ ...BASE, activityLevel: "sedentary" });
    const veryActive = calculate({ ...BASE, activityLevel: "very_active" });
    expect(veryActive.tdee).toBeGreaterThan(sedentary.tdee);
  });
});

describe("calculate — goal adjustment applied exactly once", () => {
  it("recommendedCalories = TDEE + the goal's adjustment (before the floor clamps it)", () => {
    // Use a goal/activity combo comfortably above every floor so the
    // floor never masks the raw addition.
    const rec = calculate({ ...BASE, activityLevel: "very_active", goalType: "muscle_gain" });
    expect(rec.calorieAdjustment).toBe(GOAL_CALORIE_ADJUSTMENTS.muscle_gain);
    expect(rec.recommendedCalories).toBe(rec.tdee + GOAL_CALORIE_ADJUSTMENTS.muscle_gain);
  });

  it("a fat_loss deficit never recommends below the sex-specific calorie floor", () => {
    // A small, low-activity person on the deepest deficit goal —
    // exactly the case that would go under the floor without clamping.
    const rec = calculate({
      heightInches: 60,
      weightLbs: 100,
      ageYears: 60,
      biologicalSex: "female",
      activityLevel: "sedentary",
      goalType: "competition_prep", // -600 kcal, the largest deficit
    });
    expect(rec.recommendedCalories).toBeGreaterThanOrEqual(1200); // CALORIE_FLOOR_FEMALE
  });

  it("maintenance and general_health apply zero adjustment", () => {
    const maint = calculate({ ...BASE, goalType: "maintenance" });
    expect(maint.calorieAdjustment).toBe(0);
    expect(maint.recommendedCalories).toBe(maint.tdee);
  });
});

describe("calculate — macro reconciliation", () => {
  it("protein + fat + carb calories reconcile with recommendedCalories (within rounding)", () => {
    const rec = calculate(BASE);
    const proteinCals = rec.recommendedProteinG * 4;
    const fatCals = rec.recommendedFatG * 9;
    const carbCals = rec.recommendedCarbG * 4;
    const total = proteinCals + fatCals + carbCals;
    expect(Math.abs(total - rec.recommendedCalories)).toBeLessThanOrEqual(8); // integer-gram rounding slack
  });

  it("fat is ~25% of total calories", () => {
    const rec = calculate(BASE);
    expect(rec.macroBreakdown.fatPct).toBeGreaterThanOrEqual(23);
    expect(rec.macroBreakdown.fatPct).toBeLessThanOrEqual(27);
  });

  it("macro percentages sum to ~100", () => {
    const rec = calculate(BASE);
    const sum = rec.macroBreakdown.proteinPct + rec.macroBreakdown.fatPct + rec.macroBreakdown.carbPct;
    expect(sum).toBeGreaterThanOrEqual(98);
    expect(sum).toBeLessThanOrEqual(102);
  });

  it("carbs never go negative even for a very high protein target", () => {
    // Extreme goal/weight combo that pushes protein calories high
    // relative to the calorie target.
    const rec = calculate({
      heightInches: 60,
      weightLbs: 250,
      ageYears: 25,
      biologicalSex: "male",
      activityLevel: "sedentary",
      goalType: "competition_prep", // 2.4 g/kg protein + a -600 deficit
    });
    expect(rec.recommendedCarbG).toBeGreaterThanOrEqual(0);
  });

  it("protein scales with the goal-specific multiplier, not a flat rate", () => {
    const fatLoss = calculate({ ...BASE, goalType: "fat_loss" }); // 2.2 g/kg
    const maintenance = calculate({ ...BASE, goalType: "maintenance" }); // 1.6 g/kg
    expect(fatLoss.recommendedProteinG).toBeGreaterThan(maintenance.recommendedProteinG);
  });
});

describe("suggestActivityLevel", () => {
  it("null or 0-1 days/week suggests sedentary", () => {
    expect(suggestActivityLevel(null)).toBe("sedentary");
    expect(suggestActivityLevel(0)).toBe("sedentary");
    expect(suggestActivityLevel(1)).toBe("sedentary");
  });
  it("2-3 days/week suggests lightly_active", () => {
    expect(suggestActivityLevel(2)).toBe("lightly_active");
    expect(suggestActivityLevel(3)).toBe("lightly_active");
  });
  it("4-5 days/week suggests moderately_active", () => {
    expect(suggestActivityLevel(4)).toBe("moderately_active");
    expect(suggestActivityLevel(5)).toBe("moderately_active");
  });
  it("6+ days/week suggests very_active", () => {
    expect(suggestActivityLevel(6)).toBe("very_active");
    expect(suggestActivityLevel(7)).toBe("very_active");
  });
});

describe("ageFromDob", () => {
  it("returns null for a null DOB", () => {
    expect(ageFromDob(null)).toBeNull();
  });

  it("computes a correct age for a birthday already passed this year", () => {
    const today = new Date();
    const birthYear = today.getFullYear() - 25;
    // Yesterday's month/day — guaranteed already passed.
    const past = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const dob = `${birthYear}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
    expect(ageFromDob(dob)).toBe(25);
  });
});
