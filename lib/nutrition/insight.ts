// ─────────────────────────────────────────────────────────────
// Catalyst OS — Kynovant Insight (Nutrition explanation layer)
//
// PURE MODULE — no database calls, no server-only imports, no LLM/API
// call. The nutrition equivalent of the deterministic explanation
// layers already used elsewhere in Kynovant (see lib/pil/ — the
// Programming Intelligence Layer's recommendations/explanations are
// all pure functions over real calculated facts, never generated
// text). Every sentence here is built from the exact CalculationResult
// lib/nutrition/calculator.ts already produced, plus the coach's
// current working values — never invented, never LLM-generated.
//
// Two states this has to stay truthful across (see buildKynovantInsight
// below):
//   A. The coach hasn't touched the working targets yet — Insight
//      describes Kynovant's own recommendation in the present tense.
//   B. The coach has manually adjusted the working targets — Insight
//      states what Kynovant originally recommended AND what the plan
//      actually is now, computing the real deficit/surplus from the
//      coach's own numbers rather than repeating the original
//      recommendation's adjustment as if it still applied. Never
//      fabricates a reason for the override — only surfaces
//      adjustmentReason if the coach actually wrote one.
//
// This is coach-facing decision support, not something the client
// portal renders — see app/portal/nutrition/page.tsx and
// getPublishedTargetForClient()'s projection, both unchanged by this
// module's existence.
// ─────────────────────────────────────────────────────────────

import type { CalculationResult } from "./calculator";

export interface KynovantInsightInput {
  firstName: string;
  rec: CalculationResult;
  /** Display label, e.g. "Fat Loss" — caller resolves via its own GOAL_LABELS. */
  goalLabel: string;
  /** Display label, e.g. "Very Active (6–7 days/week)" — caller resolves via ACTIVITY_LABELS. */
  activityLabel: string;
  /** Raw activityLevel key (e.g. "very_active") — drives the training-frequency clause. */
  activityLevel: string;
  /** True once the coach has edited any working target away from the recommendation. */
  hasManualEdit: boolean;
  /** Parsed current working values — null when blank/invalid (never guessed). */
  currentCalories: number | null;
  currentProteinG: number | null;
  currentFatG: number | null;
  currentCarbG: number | null;
  /** Coach's own adjustment note, if any — never fabricated when absent. */
  adjustmentReason: string;
}

const HIGH_FREQUENCY_ACTIVITY_LEVELS = new Set(["very_active", "extra_active"]);

function stripParenthetical(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// ─────────────────────────────────────────────────────────────
// Builds the Insight as an ordered list of paragraphs. Callers render
// each string as its own <p>. Always at least 3 paragraphs when a
// CalculationResult exists; there is nothing to explain otherwise —
// callers gate rendering on having a `rec` in the first place.
// ─────────────────────────────────────────────────────────────

export function buildKynovantInsight(input: KynovantInsightInput): string[] {
  const {
    firstName,
    rec,
    goalLabel,
    activityLabel,
    activityLevel,
    hasManualEdit,
    currentCalories,
    currentProteinG,
    currentFatG,
    currentCarbG,
    adjustmentReason,
  } = input;

  const goalLower = goalLabel.toLowerCase();
  const activityLower = stripParenthetical(activityLabel).toLowerCase();
  const paragraphs: string[] = [];

  // ── Paragraph 1 — maintenance estimate + deficit/surplus framing ──
  let p1 =
    `Kynovant estimates ${firstName}'s maintenance intake at approximately ` +
    `${rec.tdee.toLocaleString()} calories, based on an estimated BMR of ` +
    `${rec.bmr.toLocaleString()} and a ${activityLower} activity level.`;

  if (rec.calorieAdjustment === 0) {
    p1 += ` This plan targets maintenance for ${goalLower} — Kynovant is not applying a calorie deficit or surplus.`;
  } else if (rec.calorieAdjustment < 0) {
    p1 +=
      ` The recommended starting target is approximately ${Math.abs(rec.calorieAdjustment).toLocaleString()} ` +
      `calories below maintenance to support ${goalLower}.`;
  } else {
    p1 +=
      ` The recommended starting target is approximately ${rec.calorieAdjustment.toLocaleString()} ` +
      `calories above maintenance to support ${goalLower}.`;
  }
  paragraphs.push(p1);

  // ── Paragraph 2 — override tracking (only when it actually diverges) ──
  // "diverges" is checked against the coach's CURRENT calorie value, not
  // just hasManualEdit — a coach who ticks hasManualEdit but then types
  // the exact recommended number back in should not see a false
  // "initially recommended X, now Y" when X === Y.
  if (
    hasManualEdit &&
    currentCalories !== null &&
    currentCalories !== rec.recommendedCalories
  ) {
    const actualDiff = currentCalories - rec.tdee;
    let p2 =
      `Kynovant initially recommended ${rec.recommendedCalories.toLocaleString()} calories. ` +
      `The current plan is set at ${currentCalories.toLocaleString()} calories`;
    if (actualDiff === 0) {
      p2 += " — approximately maintenance.";
    } else {
      const diffWord = actualDiff < 0 ? "deficit" : "surplus";
      p2 += ` — approximately a ${Math.abs(actualDiff).toLocaleString()}-calorie ${diffWord} from estimated maintenance.`;
    }
    if (adjustmentReason.trim()) {
      p2 += ` Noted reason: "${adjustmentReason.trim()}"`;
    }
    paragraphs.push(p2);
  }

  // ── Paragraph 3 — macros, described from the coach's actual current
  //    working values (falls back to the recommendation's own numbers
  //    when a field is blank/invalid, since that's what would publish). ──
  const proteinG = currentProteinG ?? rec.recommendedProteinG;
  const fatG = currentFatG ?? rec.recommendedFatG;
  const carbG = currentCarbG ?? rec.recommendedCarbG;
  let p3 =
    `Protein is set at ${proteinG}g to support muscle retention and recovery. ` +
    `Fat is set at ${fatG}g to support normal physiological function, with the ` +
    `remaining calories allocated to ${carbG}g of carbohydrates`;
  p3 += HIGH_FREQUENCY_ACTIVITY_LEVELS.has(activityLevel)
    ? ` to support ${firstName}'s high training frequency.`
    : ".";
  paragraphs.push(p3);

  // ── Paragraph 4 — constant closing guidance. General coaching
  //    practice, not tied to any specific computed value, so it's safe
  //    as fixed text (not "the exact paragraph" the calorie/macro
  //    reasoning above is required to avoid hardcoding). ──
  paragraphs.push(
    "Monitor body-weight trend, performance, recovery, hunger, and adherence before making further adjustments.",
  );

  return paragraphs;
}
