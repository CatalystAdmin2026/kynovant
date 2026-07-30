"use client";

import { useState } from "react";
import { calculate, ACTIVITY_LABELS } from "@/lib/nutrition/calculator";
import type { CalculationResult } from "@/lib/nutrition/calculator";
import type { ClientNutritionTarget, ActivityLevel } from "@/lib/db/schema-nutrition";
import {
  createDraftAction,
  updateDraftAction,
  publishTargetAction,
  archiveTargetAction,
} from "@/app/hq/clients/[clientId]/nutrition/actions";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CalcProfile {
  heightInches: number | null;
  weightLbs: number | null;
  ageYears: number | null;
  biologicalSex: "male" | "female" | "unspecified" | null;
  suggestedActivityLevel: string;
  goalType: string | null;
}

interface Props {
  clientId: string;
  displayName: string;
  calcProfile: CalcProfile;
  activeTarget: ClientNutritionTarget | null;
  draftTargets: ClientNutritionTarget[];
}

type Status =
  | { type: "idle" }
  | { type: "saving" }
  | { type: "publishing" }
  | { type: "archiving" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  fat_loss:               "Fat Loss",
  muscle_gain:            "Muscle Gain",
  body_recomposition:     "Body Recomposition",
  strength:               "Strength",
  athletic_performance:   "Athletic Performance",
  general_health:         "General Health",
  mobility:               "Mobility",
  competition_prep:       "Competition Prep",
  reverse_diet:           "Reverse Diet",
  maintenance:            "Maintenance",
  executive_performance:  "Executive Performance",
  custom:                 "Custom",
};

// ─────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  unit,
  accent,
  size = "md",
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  accent?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const numClass =
    size === "lg"
      ? "text-5xl font-bold"
      : size === "md"
      ? "text-4xl font-bold"
      : "text-2xl font-bold";

  return (
    <div>
      <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-2">{label}</p>
      <p className={`${numClass} tabular-nums leading-none ${accent ? "text-[#C9A24D]" : "text-white"}`}>
        {value ?? "—"}
      </p>
      {unit && <p className="text-[10px] text-white/20 mt-1.5">{unit}</p>}
    </div>
  );
}

function RecBlock({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] text-white/20 uppercase tracking-[0.4em] mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums leading-none ${accent ? "text-[#C9A24D]" : "text-white/65"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] text-white/18 mt-1.5">{unit}</p>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type,
  min,
  max,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[9px] text-white/28 uppercase tracking-[0.35em] mb-1.5">
        {label}
        {hint && (
          <span className="text-white/15 normal-case tracking-normal ml-1.5">
            ({hint})
          </span>
        )}
      </label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="w-full bg-[#0c0d0e] border border-white/[0.07] text-white/70 text-sm px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/30 tabular-nums"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function NutritionTargetEditor({
  clientId,
  displayName,
  calcProfile,
  activeTarget,
  draftTargets,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const firstName = displayName.split(" ")[0];

  // ── Calculator state ─────────────────────────────────────────
  const [activityLevel, setActivityLevel] = useState<string>(
    calcProfile.suggestedActivityLevel,
  );
  const [goalType, setGoalType] = useState<string>(
    calcProfile.goalType ?? "fat_loss",
  );

  // ── Form state ───────────────────────────────────────────────
  const [calories, setCalories]           = useState("");
  const [protein, setProtein]             = useState("");
  const [fat, setFat]                     = useState("");
  const [carbs, setCarbs]                 = useState("");
  const [coachNotes, setCoachNotes]       = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [adjustReason, setAdjustReason]   = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);

  // ── UI state ─────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(
    !activeTarget && draftTargets.length === 0,
  );
  const [editingDraftId, setEditingDraftId] = useState<string | null>(
    draftTargets[0]?.id ?? null,
  );
  const [status, setStatus] = useState<Status>({ type: "idle" });

  // ── Recommendation (pure, computed inline) ───────────────────
  const canCalculate = !!(
    calcProfile.heightInches &&
    calcProfile.weightLbs &&
    calcProfile.ageYears
  );

  function computeRec(): CalculationResult | null {
    if (!canCalculate) return null;
    return calculate({
      heightInches: calcProfile.heightInches!,
      weightLbs: calcProfile.weightLbs!,
      ageYears: calcProfile.ageYears!,
      biologicalSex: calcProfile.biologicalSex ?? "unspecified",
      activityLevel,
      goalType,
    });
  }

  const rec = computeRec();

  // ── Helpers ──────────────────────────────────────────────────

  function applyRecommendation() {
    if (!rec) return;
    setCalories(String(rec.recommendedCalories));
    setProtein(String(rec.recommendedProteinG));
    setFat(String(rec.recommendedFatG));
    setCarbs(String(rec.recommendedCarbG));
  }

  function openForNewTarget() {
    setEditingDraftId(null);
    if (rec) {
      setCalories(String(rec.recommendedCalories));
      setProtein(String(rec.recommendedProteinG));
      setFat(String(rec.recommendedFatG));
      setCarbs(String(rec.recommendedCarbG));
    } else {
      setCalories(""); setProtein(""); setFat(""); setCarbs("");
    }
    setCoachNotes("");
    setInternalNotes("");
    setAdjustReason("");
    setEffectiveDate(today);
    setStatus({ type: "idle" });
    setShowForm(true);
  }

  function openForEditDraft(draft: ClientNutritionTarget) {
    setEditingDraftId(draft.id);
    setCalories(String(draft.calorieTarget));
    setProtein(String(draft.proteinGrams));
    setFat(draft.fatGrams != null ? String(draft.fatGrams) : "");
    setCarbs(draft.carbGrams != null ? String(draft.carbGrams) : "");
    setCoachNotes(draft.coachNotes ?? "");
    setInternalNotes(draft.internalNotes ?? "");
    setAdjustReason(draft.adjustmentReason ?? "");
    setEffectiveDate(draft.effectiveDate ?? today);
    setActivityLevel(draft.calcActivityLevel ?? calcProfile.suggestedActivityLevel);
    setGoalType(draft.calcGoalType ?? calcProfile.goalType ?? "fat_loss");
    setStatus({ type: "idle" });
    setShowForm(true);
  }

  function buildUpdates() {
    return {
      effectiveDate,
      calorieTarget: Number(calories),
      proteinGrams: Number(protein),
      fatGrams: fat.trim() !== "" ? Number(fat) : null,
      carbGrams: carbs.trim() !== "" ? Number(carbs) : null,
      adjustmentReason: adjustReason.trim() || null,
      coachNotes: coachNotes.trim() || null,
      internalNotes: internalNotes.trim() || null,
    };
  }

  function buildCreateData() {
    return {
      effectiveDate,
      heightInches: calcProfile.heightInches ?? 0,
      weightLbs: calcProfile.weightLbs ?? 0,
      ageYears: calcProfile.ageYears ?? 0,
      biologicalSex: (calcProfile.biologicalSex ?? "unspecified") as
        | "male"
        | "female"
        | "unspecified",
      activityLevel: activityLevel as ActivityLevel,
      goalType,
      calorieTarget: Number(calories),
      proteinGrams: Number(protein),
      fatGrams: fat.trim() !== "" ? Number(fat) : undefined,
      carbGrams: carbs.trim() !== "" ? Number(carbs) : undefined,
      adjustmentReason: adjustReason.trim() || undefined,
      coachNotes: coachNotes.trim() || undefined,
      internalNotes: internalNotes.trim() || undefined,
    };
  }

  // ── Actions ──────────────────────────────────────────────────

  async function handleSaveDraft() {
    setStatus({ type: "saving" });
    if (editingDraftId) {
      const result = await updateDraftAction(editingDraftId, clientId, buildUpdates());
      if (result.ok) {
        setStatus({ type: "success", message: "Draft saved." });
      } else {
        setStatus({ type: "error", message: result.error ?? "Failed to save draft." });
      }
    } else {
      const result = await createDraftAction(clientId, buildCreateData());
      if (result.ok) {
        if (result.targetId) setEditingDraftId(result.targetId);
        setStatus({ type: "success", message: "Draft saved." });
      } else {
        setStatus({ type: "error", message: result.error ?? "Failed to save draft." });
      }
    }
  }

  async function handlePublishFromForm() {
    setStatus({ type: "publishing" });
    let targetId: string;

    if (editingDraftId) {
      const updateResult = await updateDraftAction(editingDraftId, clientId, buildUpdates());
      if (!updateResult.ok) {
        setStatus({ type: "error", message: updateResult.error ?? "Failed to save changes." });
        return;
      }
      targetId = editingDraftId;
    } else {
      const createResult = await createDraftAction(clientId, buildCreateData());
      if (!createResult.ok || !createResult.targetId) {
        setStatus({ type: "error", message: createResult.error ?? "Failed to create target." });
        return;
      }
      targetId = createResult.targetId;
      setEditingDraftId(targetId);
    }

    const result = await publishTargetAction(targetId, clientId);
    if (result.ok) {
      setStatus({
        type: "success",
        message: `${firstName}'s nutrition targets are now live.`,
      });
      setShowForm(false);
      setEditingDraftId(null);
    } else {
      setStatus({ type: "error", message: result.error ?? "Failed to publish target." });
    }
  }

  async function handlePublishDraft(draftId: string) {
    setStatus({ type: "publishing" });
    const result = await publishTargetAction(draftId, clientId);
    if (result.ok) {
      setStatus({
        type: "success",
        message: `${firstName}'s nutrition targets are now live.`,
      });
    } else {
      setStatus({ type: "error", message: result.error ?? "Failed to publish." });
    }
  }

  async function handleArchive(targetId: string) {
    setStatus({ type: "archiving" });
    const result = await archiveTargetAction(targetId, clientId);
    if (result.ok) {
      setStatus({ type: "success", message: "Target archived." });
    } else {
      setStatus({ type: "error", message: result.error ?? "Failed to archive." });
    }
  }

  const isBusy =
    status.type === "saving" ||
    status.type === "publishing" ||
    status.type === "archiving";

  const canSubmit =
    calories.trim() !== "" &&
    protein.trim() !== "" &&
    Number(calories) > 0 &&
    Number(protein) > 0;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Status banner ──────────────────────────────────────── */}
      {(status.type === "success" || status.type === "error") && (
        <div
          className={`px-5 py-3.5 text-sm mb-8 ${
            status.type === "success"
              ? "bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-300/75"
              : "bg-red-500/[0.06] border border-red-500/15 text-red-300/75"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* ── Active published target ─────────────────────────────── */}
      {activeTarget && (
        <div className="mb-10">
          {/* Coaching guidance — first and prominent */}
          {activeTarget.coachNotes && (
            <div className="mb-8">
              <p className="text-[9px] text-[#C9A24D]/40 uppercase tracking-[0.45em] mb-4">
                Guidance → {firstName} sees this
              </p>
              <p className="text-white/50 leading-relaxed text-sm max-w-prose">
                {activeTarget.coachNotes}
              </p>
            </div>
          )}

          {/* Published macro numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <StatBlock label="Calories" value={activeTarget.calorieTarget.toLocaleString()} unit="kcal / day" accent size="md" />
            <StatBlock label="Protein"  value={activeTarget.proteinGrams} unit="g / day" size="md" />
            <div>
              <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-2">Fat</p>
              <p className="text-4xl font-bold tabular-nums leading-none text-white/40">
                {activeTarget.fatGrams ?? "—"}
              </p>
              {activeTarget.fatGrams != null && <p className="text-[10px] text-white/18 mt-1.5">g / day</p>}
            </div>
            <div>
              <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-2">Carbs</p>
              <p className="text-4xl font-bold tabular-nums leading-none text-white/40">
                {activeTarget.carbGrams ?? "—"}
              </p>
              {activeTarget.carbGrams != null && <p className="text-[10px] text-white/18 mt-1.5">g / day</p>}
            </div>
          </div>

          {/* Published metadata + actions */}
          <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/45" />
              <div>
                <p className="text-[9px] text-emerald-400/45 uppercase tracking-[0.35em]">
                  Published
                </p>
                <p className="text-[10px] text-white/18 mt-0.5">
                  Effective {activeTarget.effectiveDate}
                  {activeTarget.publishedAt && (
                    <> · {new Date(activeTarget.publishedAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <button
                onClick={openForNewTarget}
                className="text-[10px] text-white/40 hover:text-white/65 transition-colors border border-white/[0.07] px-4 py-1.5"
              >
                Adjust Targets
              </button>
              <button
                onClick={() => handleArchive(activeTarget.id)}
                disabled={isBusy}
                className="text-[10px] text-white/18 hover:text-red-400/50 transition-colors disabled:opacity-40"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft queue ─────────────────────────────────────────── */}
      {draftTargets.length > 0 && !showForm && (
        <div className="mb-8">
          <p className="text-[9px] text-white/20 uppercase tracking-[0.45em] mb-4">
            Saved Drafts
          </p>
          <div className="space-y-1">
            {draftTargets.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center gap-5 px-5 py-4 bg-[#0a0b0b] border border-white/[0.04]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/50 tabular-nums">
                    {draft.calorieTarget.toLocaleString()} kcal &middot; {draft.proteinGrams}g protein
                  </p>
                  <p className="text-[10px] text-white/20 mt-0.5">
                    Effective {draft.effectiveDate}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => openForEditDraft(draft)}
                    className="text-[10px] text-white/35 hover:text-white/60 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handlePublishDraft(draft.id)}
                    disabled={isBusy}
                    className="text-[10px] border border-[#C9A24D]/30 text-[#C9A24D]/70 px-3 py-1.5 hover:bg-[#C9A24D]/[0.08] hover:text-[#C9A24D] transition-colors disabled:opacity-40"
                  >
                    {status.type === "publishing" ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!showForm && !activeTarget && draftTargets.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-white/35 text-base mb-2">
            No targets set for {firstName} yet.
          </p>
          <p className="text-white/18 text-xs mb-8 max-w-xs mx-auto leading-relaxed">
            Generate a recommendation from {firstName}&apos;s profile, review and
            adjust, then publish their first plan.
          </p>
          <button
            onClick={openForNewTarget}
            className="text-[11px] border border-[#C9A24D]/30 text-[#C9A24D]/70 px-7 py-3 hover:bg-[#C9A24D]/[0.07] hover:text-[#C9A24D]/90 transition-colors uppercase tracking-[0.2em]"
          >
            Set Nutrition Targets
          </button>
        </div>
      )}

      {/* ── "Set new targets" link when published or drafts exist ── */}
      {!showForm && (activeTarget || draftTargets.length > 0) && (
        <button
          onClick={openForNewTarget}
          className="text-[10px] text-white/20 hover:text-white/45 transition-colors"
        >
          + Set new targets
        </button>
      )}

      {/* ─────────────────────────────────────────────────────────
          FORM
      ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div>

          {/* Form header */}
          <div className="flex items-center justify-between mb-10">
            <p className="text-[9px] text-white/28 uppercase tracking-[0.45em]">
              {editingDraftId ? "Edit Draft" : `New Targets · ${firstName}`}
            </p>
            <button
              onClick={() => { setShowForm(false); setStatus({ type: "idle" }); }}
              className="text-[10px] text-white/20 hover:text-white/45 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* ════════════════════════════════════════════════════
              SECTION 1: RECOMMENDATION
          ════════════════════════════════════════════════════ */}
          <div className="mb-10">
            <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-6">
              Recommended Targets
            </p>

            {/* Activity Level + Goal selects */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-[9px] text-white/25 uppercase tracking-[0.35em] mb-1.5">
                  Activity Level
                </label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full bg-[#0c0d0e] border border-white/[0.07] text-white/60 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/25"
                >
                  {Object.entries(ACTIVITY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-white/25 uppercase tracking-[0.35em] mb-1.5">
                  Goal
                </label>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value)}
                  className="w-full bg-[#0c0d0e] border border-white/[0.07] text-white/60 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/25"
                >
                  {Object.entries(GOAL_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Recommendation display */}
            {canCalculate && rec ? (
              <div className="bg-[#0a0b0b] border border-white/[0.05] p-6">
                <div className="flex items-start justify-between mb-6">
                  <p className="text-[10px] text-white/18 leading-snug">
                    BMR {rec.bmr.toLocaleString()} &middot; TDEE {rec.tdee.toLocaleString()}
                    {rec.calorieAdjustment !== 0 && (
                      <> &middot; {rec.calorieAdjustment > 0 ? "+" : ""}{rec.calorieAdjustment} ({GOAL_LABELS[goalType] ?? goalType})</>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={applyRecommendation}
                    className="text-xs border border-[#C9A24D]/30 text-[#C9A24D]/65 px-4 py-2 hover:bg-[#C9A24D]/[0.08] hover:text-[#C9A24D] transition-colors shrink-0 ml-4"
                  >
                    Apply
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <RecBlock label="Calories" value={rec.recommendedCalories} unit="kcal" accent />
                  <RecBlock label="Protein"  value={rec.recommendedProteinG}  unit="g" />
                  <RecBlock label="Fat"      value={rec.recommendedFatG}       unit="g" />
                  <RecBlock label="Carbs"    value={rec.recommendedCarbG}      unit="g" />
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/[0.03] border border-amber-500/10 px-5 py-4">
                <p className="text-xs text-amber-400/45 leading-relaxed">
                  The calculator requires height, weight, and date of birth from the
                  client profile. You can still enter targets manually below.
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════
              SECTION 2: TARGET VALUES
          ════════════════════════════════════════════════════ */}
          <div className="pt-10 border-t border-white/[0.05] mb-10">
            <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-6">
              {canCalculate ? "Your Decision" : "Daily Targets"}
            </p>

            <div className="grid grid-cols-2 gap-5 mb-5">
              <FieldInput
                label="Calories (kcal)"
                value={calories}
                onChange={setCalories}
                type="number"
                min={800}
                max={8000}
              />
              <FieldInput
                label="Protein (g)"
                value={protein}
                onChange={setProtein}
                type="number"
                min={1}
                max={500}
              />
              <FieldInput
                label="Fat (g)"
                value={fat}
                onChange={setFat}
                type="number"
                min={0}
                max={500}
                hint="optional"
              />
              <FieldInput
                label="Carbs (g)"
                value={carbs}
                onChange={setCarbs}
                type="number"
                min={0}
                max={1200}
                hint="optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[9px] text-white/25 uppercase tracking-[0.35em] mb-1.5">
                  Effective Date
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full bg-[#0c0d0e] border border-white/[0.07] text-white/55 text-sm px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/25"
                />
              </div>
              <div>
                <label className="block text-[9px] text-white/18 uppercase tracking-[0.35em] mb-1.5">
                  Adjustment Note{" "}
                  <span className="normal-case tracking-normal">
                    (if diverging from recommendation)
                  </span>
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Starting lower, adjusting after next check-in"
                  className="w-full bg-[#0c0d0e] border border-white/[0.05] text-white/40 text-xs px-3 py-2.5 focus:outline-none focus:border-white/[0.10] placeholder:text-white/12"
                />
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SECTION 3: COACHING GUIDANCE
          ════════════════════════════════════════════════════ */}
          <div className="pt-10 border-t border-white/[0.05] mb-10">
            <div className="flex items-baseline justify-between mb-6">
              <p className="text-[9px] text-white/22 uppercase tracking-[0.5em]">
                Coaching Guidance
              </p>
              <p className="text-[10px] text-[#C9A24D]/35">
                {firstName} will read this
              </p>
            </div>

            {/* Gold border-left treatment — guidance as a letter, not a form field */}
            <div className="border-l-2 border-[#C9A24D]/20 pl-6 mb-6">
              <textarea
                rows={5}
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                placeholder={`Context for ${firstName} — what do these targets mean for their goal? What should they prioritize? Clients who understand the why are far more consistent.`}
                className="w-full bg-transparent text-white/65 text-sm leading-relaxed focus:outline-none placeholder:text-white/14 resize-none"
              />
            </div>

            <div>
              <label className="block text-[9px] text-white/15 uppercase tracking-[0.35em] mb-1.5">
                Internal Notes — coach only
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Notes for your reference. Not visible to the client."
                className="w-full bg-[#090a0a] border border-white/[0.04] text-white/28 text-xs px-4 py-3 focus:outline-none focus:border-white/[0.08] placeholder:text-white/10 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              SECTION 4: REVIEW + PUBLISH
          ════════════════════════════════════════════════════ */}
          <div className="pt-10 border-t border-white/[0.06]">

            {/* Preview summary */}
            <div className="bg-[#0a0b0b] border border-white/[0.04] p-6 mb-6">
              <p className="text-[9px] text-white/18 uppercase tracking-[0.45em] mb-5">
                Publishing
              </p>

              {/* Macro preview */}
              <div className="grid grid-cols-4 gap-5 mb-5">
                <div>
                  <p className="text-[9px] text-white/18 uppercase tracking-[0.35em] mb-1">Calories</p>
                  <p className="text-2xl font-bold text-[#C9A24D] tabular-nums">{calories || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/18 uppercase tracking-[0.35em] mb-1">Protein</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{protein || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/18 uppercase tracking-[0.35em] mb-1">Fat</p>
                  <p className="text-2xl font-bold text-white/40 tabular-nums">{fat || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/18 uppercase tracking-[0.35em] mb-1">Carbs</p>
                  <p className="text-2xl font-bold text-white/40 tabular-nums">{carbs || "—"}</p>
                </div>
              </div>

              {/* Guidance preview */}
              {coachNotes.trim() && (
                <div className="pt-4 border-t border-white/[0.04] mb-4">
                  <p className="text-[9px] text-[#C9A24D]/28 uppercase tracking-[0.35em] mb-2">
                    Guidance
                  </p>
                  <p className="text-xs text-white/28 leading-relaxed line-clamp-2">
                    {coachNotes}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-white/[0.04]">
                <p className="text-[10px] text-white/18">Effective {effectiveDate}</p>
              </div>
            </div>

            {/* Publish button — full width, conclusive */}
            <button
              onClick={handlePublishFromForm}
              disabled={isBusy || !canSubmit}
              className="w-full bg-[#C9A24D] text-black text-sm font-bold uppercase tracking-[0.2em] py-4 hover:bg-[#d4af63] transition-colors disabled:opacity-35 disabled:cursor-not-allowed mb-4"
            >
              {status.type === "publishing"
                ? "Publishing…"
                : `Publish ${firstName}'s Nutrition Plan`}
            </button>

            {/* Save draft — secondary */}
            <div className="text-center mb-5">
              <button
                onClick={handleSaveDraft}
                disabled={isBusy || !canSubmit}
                className="text-xs text-white/25 hover:text-white/50 transition-colors disabled:opacity-40"
              >
                {status.type === "saving" ? "Saving…" : "Save as draft instead"}
              </button>
            </div>

            <p className="text-center text-[9px] text-white/14 leading-relaxed">
              {firstName} will immediately see these targets and any coaching guidance.
              <br />
              Any previously published plan is archived automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
