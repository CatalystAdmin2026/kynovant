// ─────────────────────────────────────────────────────────────
// Catalyst OS — Nutrition Calculator (Nutrition Foundation)
//
// PURE MODULE — no database calls, no server-only imports.
// Importable from both server components and client components.
//
// Formula: Mifflin-St Jeor BMR (most accurate for general population).
//   formulaVersion: "mifflin-st-jeor-v1"
//
// To replace the formula in a future sprint:
//   1. Add a new version constant
//   2. Export a new calculate() overload or replace the implementation
//   3. All historical targets retain their original rec_formula_version
//
// ADR-014: The calculator is a decision-support tool, not a source of truth.
//   The recommendation is never automatically published.
//   The coach always makes the final target decision.
// ─────────────────────────────────────────────────────────────

export const FORMULA_VERSION = "mifflin-st-jeor-v1" as const;

// ── Activity multipliers (standard Harris-Benedict scale) ─────

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary:          1.2,
  lightly_active:     1.375,
  moderately_active:  1.55,
  very_active:        1.725,
  extra_active:       1.9,
};

export const ACTIVITY_LABELS: Record<string, string> = {
  sedentary:          "Sedentary (desk job, minimal exercise)",
  lightly_active:     "Lightly Active (1–3 days/week)",
  moderately_active:  "Moderately Active (3–5 days/week)",
  very_active:        "Very Active (6–7 days/week)",
  extra_active:       "Extra Active (twice/day or physical job)",
};

// ── Goal-based calorie adjustments from TDEE ─────────────────
// Values are in kcal. Negative = deficit. Positive = surplus.
// All adjustments are moderate and within evidence-based ranges.

export const GOAL_CALORIE_ADJUSTMENTS: Record<string, number> = {
  fat_loss:               -400,
  competition_prep:       -600,
  reverse_diet:            150,
  muscle_gain:             300,
  body_recomposition:     -150,
  strength:                200,
  maintenance:               0,
  general_health:            0,
  athletic_performance:    150,
  mobility:                  0,
  executive_performance:     0,
  custom:                    0,
};

// ── Minimum safe calorie floor ────────────────────────────────
// The calculator never recommends below these floors.
// Coaches may set lower targets manually when clinically indicated,
// but the automated recommendation will not go below these values.
const CALORIE_FLOOR_MALE        = 1500;
const CALORIE_FLOOR_FEMALE      = 1200;
const CALORIE_FLOOR_UNSPECIFIED = 1350; // midpoint, matching the averaged BMR sex constant

// ── Protein multipliers (g per kg body weight) ────────────────
// Based on ISSN position stand on protein and exercise.
const PROTEIN_MULTIPLIERS: Record<string, number> = {
  fat_loss:               2.2,  // high protein to preserve lean mass in deficit
  competition_prep:       2.4,  // aggressive deficit requires maximum protein
  body_recomposition:     2.0,
  muscle_gain:            1.8,
  strength:               1.8,
  reverse_diet:           1.8,
  athletic_performance:   1.8,
  maintenance:            1.6,
  general_health:         1.6,
  executive_performance:  1.6,
  mobility:               1.6,
  custom:                 1.8,
};

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface CalculatorInputs {
  heightInches: number;
  weightLbs: number;
  ageYears: number;
  // 'unspecified' falls back to averaging male and female BMR constants.
  biologicalSex: "male" | "female" | "unspecified";
  activityLevel: string;
  goalType: string;
}

export interface CalculationResult {
  bmr: number;
  tdee: number;
  calorieAdjustment: number;
  recommendedCalories: number;
  recommendedProteinG: number;
  recommendedFatG: number;
  recommendedCarbG: number;
  formulaVersion: typeof FORMULA_VERSION;
  macroBreakdown: {
    proteinPct: number;
    fatPct: number;
    carbPct: number;
  };
}

export interface InputValidationError {
  field: keyof CalculatorInputs;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

export function validateInputs(
  inputs: Partial<CalculatorInputs>,
): InputValidationError[] {
  const errors: InputValidationError[] = [];

  if (!inputs.heightInches || inputs.heightInches <= 0 || inputs.heightInches > 120) {
    errors.push({ field: "heightInches", message: "Height must be between 1 and 120 inches." });
  }
  if (!inputs.weightLbs || inputs.weightLbs <= 0 || inputs.weightLbs > 2000) {
    errors.push({ field: "weightLbs", message: "Weight must be between 1 and 2000 lbs." });
  }
  if (!inputs.ageYears || inputs.ageYears < 13 || inputs.ageYears > 120) {
    errors.push({ field: "ageYears", message: "Age must be between 13 and 120." });
  }
  if (!inputs.biologicalSex) {
    errors.push({ field: "biologicalSex", message: "Biological sex is required for BMR calculation." });
  }
  if (!inputs.activityLevel || !ACTIVITY_MULTIPLIERS[inputs.activityLevel]) {
    errors.push({ field: "activityLevel", message: "A valid activity level is required." });
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────
// MAIN CALCULATOR
// ─────────────────────────────────────────────────────────────

export function calculate(inputs: CalculatorInputs): CalculationResult {
  const weightKg = inputs.weightLbs / 2.20462;
  const heightCm = inputs.heightInches * 2.54;

  // Mifflin-St Jeor BMR
  // Male:   10 × weight_kg + 6.25 × height_cm − 5 × age + 5
  // Female: 10 × weight_kg + 6.25 × height_cm − 5 × age − 161
  // Unspecified: average of male and female constants
  const baseBmr = 10 * weightKg + 6.25 * heightCm - 5 * inputs.ageYears;
  const sexConstant =
    inputs.biologicalSex === "male"
      ? 5
      : inputs.biologicalSex === "female"
      ? -161
      : -78; // average of 5 and -161

  const bmr = Math.round(baseBmr + sexConstant);

  const multiplier = ACTIVITY_MULTIPLIERS[inputs.activityLevel] ?? 1.375;
  const tdee = Math.round(bmr * multiplier);

  const calorieAdjustment = GOAL_CALORIE_ADJUSTMENTS[inputs.goalType] ?? 0;

  const calorieFloor =
    inputs.biologicalSex === "male"
      ? CALORIE_FLOOR_MALE
      : inputs.biologicalSex === "female"
      ? CALORIE_FLOOR_FEMALE
      : CALORIE_FLOOR_UNSPECIFIED;
  const recommendedCalories = Math.max(calorieFloor, tdee + calorieAdjustment);

  // Protein: g per kg body weight, goal-dependent
  const proteinMultiplier = PROTEIN_MULTIPLIERS[inputs.goalType] ?? 1.8;
  const recommendedProteinG = Math.round(weightKg * proteinMultiplier);

  // Fat: 25% of total calories (minimum for hormonal health)
  const recommendedFatG = Math.round((recommendedCalories * 0.25) / 9);

  // Carbs: remaining calories
  const proteinCals = recommendedProteinG * 4;
  const fatCals     = recommendedFatG * 9;
  const carbCals    = Math.max(0, recommendedCalories - proteinCals - fatCals);
  const recommendedCarbG = Math.round(carbCals / 4);

  // Macro percentages for display
  const proteinPct = Math.round((proteinCals / recommendedCalories) * 100);
  const fatPct     = Math.round((fatCals     / recommendedCalories) * 100);
  const carbPct    = Math.max(0, 100 - proteinPct - fatPct);

  return {
    bmr,
    tdee,
    calorieAdjustment,
    recommendedCalories,
    recommendedProteinG,
    recommendedFatG,
    recommendedCarbG,
    formulaVersion: FORMULA_VERSION,
    macroBreakdown: { proteinPct, fatPct, carbPct },
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Suggests an activity level from training days per week.
// Used to pre-select the activity level dropdown from the client's training profile.
export function suggestActivityLevel(daysPerWeek: number | null): string {
  if (daysPerWeek === null || daysPerWeek <= 1) return "sedentary";
  if (daysPerWeek <= 3) return "lightly_active";
  if (daysPerWeek <= 5) return "moderately_active";
  return "very_active";
}

// Derives age in years from a date-of-birth string ("YYYY-MM-DD").
// Returns null if DOB is not available.
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return null;
  }
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return age > 0 ? age : null;
}
