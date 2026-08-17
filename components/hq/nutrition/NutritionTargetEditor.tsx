"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Flame, Beef, Droplet, Wheat,
  CheckCircle2, AlertCircle,
  MessageSquare, FileEdit, Send, Plus, Salad, Calculator, Ruler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { calculate, ageFromDob, ACTIVITY_LABELS } from "@/lib/nutrition/calculator";
import type { CalculationResult } from "@/lib/nutrition/calculator";
import type { ClientNutritionTarget, ActivityLevel } from "@/lib/db/schema-nutrition";
import {
  createDraftAction,
  updateDraftAction,
  publishTargetAction,
  archiveTargetAction,
  saveClientMetricsAction,
} from "@/app/hq/clients/[clientId]/nutrition/actions";
import { Card, CardFooter, Button, Input, Textarea, Select, Label, EmptyState, cx } from "@/components/ui";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CalcProfile {
  heightInches: number | null;
  weightLbs: number | null;
  ageYears: number | null;
  dateOfBirth: string | null;
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

// The Height ft/in inputs (ClientMetricsPanel) share a single compact
// row with two unit labels, so each Input renders far narrower
// (~46px) than the shared Input primitive's default px-3.5 (14px)
// horizontal padding was ever sized for — 28px of a 46px box was pure
// padding, clipping a typed digit to a sliver. Chrome's native
// number-input spinner arrows (on by default) then ate further into
// the little that was left. `!` overrides FIELD_BASE's px-3.5 per
// this file's established convention for overriding Input's shared
// classes (see the gold/amber button overrides elsewhere in this
// file); the [&::-webkit-*-spin-button] + [appearance:textfield] pair
// removes the native spinners only on these two narrow inputs —
// every other number input in this file (Weight, Calories, Protein,
// Fat, Carbs) has ample width and keeps its spinners untouched.
const COMPACT_NUMBER_INPUT =
  "!px-2 [appearance:textfield] " +
  "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 " +
  "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0";

const GOAL_LABELS: Record<string, string> = {
  fat_loss:               "Fat Loss",
  muscle_gain:            "Muscle Gain",
  body_recomposition:     "Body Recomposition",
  strength:                "Strength",
  athletic_performance:   "Athletic Performance",
  general_health:         "General Health",
  mobility:                "Mobility",
  competition_prep:       "Competition Prep",
  reverse_diet:            "Reverse Diet",
  maintenance:             "Maintenance",
  executive_performance:  "Executive Performance",
  custom:                  "Custom",
};

// ─────────────────────────────────────────────────────────────
// SMALL COMPONENTS (presentational only)
// ─────────────────────────────────────────────────────────────

function MacroTile({
  icon: Icon,
  label,
  value,
  unit,
  accent = false,
  valueClassName,
  size = "md",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  accent?: boolean;
  valueClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const numClass = size === "lg" ? "text-4xl" : size === "md" ? "text-3xl" : "text-2xl";
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon size={11} className={accent ? "text-gold/70" : "text-white/25"} aria-hidden />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/30">{label}</p>
      </div>
      <p className={cx(numClass, "font-bold tabular-nums leading-none", valueClassName ?? (accent ? "text-gold" : "text-white"))}>
        {value}
      </p>
      {unit && <p className="mt-1.5 text-[10px] text-white/22">{unit}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CLIENT METRICS — the calculator's missing inputs
//
// health_profiles (height / biological sex / date of birth) and
// body_composition_records (weight) previously had no coach-facing
// write path anywhere in the app — only scripts/seed-demo-client.ts
// ever populated them. For a real client those tables are empty, so
// the calculator can never activate and there was nowhere on this
// page (or anywhere in HQ) to fix that. This panel is the smallest
// correct UI: it writes straight through to those same canonical
// tables via saveClientMetricsAction (lib/db/client-metrics-service.ts)
// rather than inventing nutrition-only duplicate columns.
//
// Only rendered while canCalculate is false. Each field prefills from
// whatever calcProfile already has (partial-metrics case) — a coach
// only needs to fill in what's actually missing.
// ─────────────────────────────────────────────────────────────

function ClientMetricsPanel({
  clientId,
  calcProfile,
  firstName,
}: {
  clientId: string;
  calcProfile: CalcProfile;
  firstName: string;
}) {
  const router = useRouter();
  const initialFeet = calcProfile.heightInches != null ? Math.floor(calcProfile.heightInches / 12) : "";
  const initialInches = calcProfile.heightInches != null ? Math.round(calcProfile.heightInches % 12) : "";

  const [heightFeet, setHeightFeet] = useState(String(initialFeet));
  const [heightIn, setHeightIn]     = useState(String(initialInches));
  const [weightLbs, setWeightLbs]   = useState(calcProfile.weightLbs != null ? String(calcProfile.weightLbs) : "");
  const [dob, setDob]               = useState(calcProfile.dateOfBirth ?? "");
  const [sex, setSex]               = useState<"male" | "female" | "unspecified">(
    calcProfile.biologicalSex ?? "unspecified",
  );
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const heightMissing = calcProfile.heightInches == null;
  const weightMissing = calcProfile.weightLbs == null;
  const dobMissing    = calcProfile.ageYears == null;

  const heightProvided = heightFeet.trim() !== "" || heightIn.trim() !== "";
  const weightProvided = weightLbs.trim() !== "";
  const dobProvided    = dob.trim() !== "";

  const combinedHeightInches = heightProvided
    ? (Number(heightFeet) || 0) * 12 + (Number(heightIn) || 0)
    : null;
  const parsedWeight = weightProvided ? Number(weightLbs) : null;
  const parsedAge = dobProvided ? ageFromDob(dob) : null;

  // Height/weight/DOB save independently — a coach with only the
  // client's weight on hand right now can save that alone and come
  // back for the rest; the calculator activates once all three exist
  // in the profile (across however many saves that takes).
  const heightValid = !heightProvided || (!!combinedHeightInches && combinedHeightInches > 0 && combinedHeightInches <= 120);
  const weightValid = !weightProvided || (!!parsedWeight && parsedWeight > 0 && parsedWeight <= 2000);
  const dobValid = !dobProvided || (!!parsedAge && parsedAge >= 13 && parsedAge <= 120);

  const canSave = (heightProvided || weightProvided || dobProvided) && heightValid && weightValid && dobValid;

  async function handleSave() {
    setStatus({ type: "saving" });
    const result = await saveClientMetricsAction(clientId, {
      heightInches: heightProvided ? combinedHeightInches ?? undefined : undefined,
      weightLbs: weightProvided ? parsedWeight ?? undefined : undefined,
      dateOfBirth: dobProvided ? dob.trim() : undefined,
      biologicalSex: sex,
    });
    if (result.ok) {
      setStatus({ type: "success", message: `Saved. ${firstName}'s calculator is ready.` });
      // The action revalidates the server page, but this client component
      // remains mounted until the new RSC payload arrives. Refresh so the
      // calculator receives persisted metrics without a manual reload.
      router.refresh();
    } else {
      setStatus({ type: "error", message: result.error ?? "Failed to save metrics." });
    }
  }

  return (
    <div id="client-metrics" className="rounded-lg border border-white/[0.06] bg-black/20 p-6">
      <p className="mb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-white/30">
        <Ruler size={11} className="text-amber-400/60" aria-hidden /> Client Metrics
      </p>
      <p className="mb-5 text-xs leading-relaxed text-white/35">
        The calculator needs {firstName}&apos;s height, weight, and date of birth.
        Enter whatever&apos;s missing below — this saves to {firstName}&apos;s profile,
        not just this page.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Label tone="dark" className={heightMissing ? "!text-amber-400/60" : undefined}>
            Height
          </Label>
          <div className="flex items-center gap-2">
            <Input
              tone="dark"
              type="number"
              inputMode="numeric"
              aria-label="Height — feet"
              value={heightFeet}
              onChange={(e) => setHeightFeet(e.target.value)}
              min={1}
              max={8}
              className={cx("min-w-0 flex-1 tabular-nums text-center", COMPACT_NUMBER_INPUT)}
            />
            <span className="shrink-0 text-xs text-white/25">ft</span>
            <Input
              tone="dark"
              type="number"
              inputMode="numeric"
              aria-label="Height — inches"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              min={0}
              max={11}
              className={cx("min-w-0 flex-1 tabular-nums text-center", COMPACT_NUMBER_INPUT)}
            />
            <span className="shrink-0 text-xs text-white/25">in</span>
          </div>
        </div>
        <div>
          <Label tone="dark" className={weightMissing ? "!text-amber-400/60" : undefined}>
            Weight (lbs)
          </Label>
          <Input
            tone="dark"
            type="number"
            inputMode="numeric"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            min={1}
            max={2000}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label tone="dark" className={dobMissing ? "!text-amber-400/60" : undefined}>
            Date of Birth
          </Label>
          <Input
            tone="dark"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
        <div>
          <Label tone="dark">Biological Sex</Label>
          <Select
            tone="dark"
            value={sex}
            onChange={(e) => setSex(e.target.value as "male" | "female" | "unspecified")}
          >
            <option value="unspecified">Unspecified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </div>
      </div>

      {!heightValid && (
        <p className="mb-3 text-xs text-red-400/70">Height must be between 1 and 120 inches.</p>
      )}
      {!weightValid && (
        <p className="mb-3 text-xs text-red-400/70">Weight must be between 1 and 2000 lbs.</p>
      )}
      {!dobValid && (
        <p className="mb-3 text-xs text-red-400/70">Date of birth must result in an age between 13 and 120.</p>
      )}
      {status.type === "error" && (
        <p className="mb-4 text-xs text-red-400/70">{status.message}</p>
      )}
      {status.type === "success" && (
        <p className="mb-4 text-xs text-emerald-400/70">{status.message}</p>
      )}

      <Button
        tone="dark"
        variant="outline"
        size="sm"
        type="button"
        onClick={handleSave}
        disabled={!canSave || status.type === "saving"}
        loading={status.type === "saving"}
        className="!border-amber-400/30 !text-amber-400/70 hover:!bg-amber-400/[0.08] hover:!text-amber-400"
      >
        {status.type === "saving" ? "Saving…" : "Save Metrics"}
      </Button>
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
          className={cx(
            "flex items-center gap-2.5 rounded-lg border px-5 py-3.5 text-sm mb-8",
            status.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300/80"
              : "border-red-500/20 bg-red-500/[0.06] text-red-300/80",
          )}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={15} className="shrink-0" aria-hidden />
          ) : (
            <AlertCircle size={15} className="shrink-0" aria-hidden />
          )}
          {status.message}
        </div>
      )}

      {/* ── Active published target ─────────────────────────────── */}
      {activeTarget && (
        <Card tone="dark" padding="lg" className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-7">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.3em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Published
            </span>
            <div className="flex items-center gap-2">
              <Button tone="dark" variant="outline" size="sm" onClick={openForNewTarget}>
                Adjust Targets
              </Button>
              <Button
                tone="dark"
                variant="ghost"
                size="sm"
                onClick={() => handleArchive(activeTarget.id)}
                disabled={isBusy}
                loading={status.type === "archiving"}
                className="!text-white/35 hover:!text-red-400 hover:!bg-red-500/[0.08]"
              >
                Archive
              </Button>
            </div>
          </div>

          {/* Coaching guidance — first and prominent */}
          {activeTarget.coachNotes && (
            <div className="mb-8">
              <p className="mb-3 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.4em] text-gold/45">
                <MessageSquare size={11} aria-hidden /> Guidance — {firstName} sees this
              </p>
              <p className="max-w-prose text-sm leading-relaxed text-white/50">
                {activeTarget.coachNotes}
              </p>
            </div>
          )}

          {/* Published macro numbers */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <MacroTile icon={Flame} label="Calories" value={activeTarget.calorieTarget.toLocaleString()} unit="kcal / day" accent size="lg" />
            <MacroTile icon={Beef} label="Protein" value={activeTarget.proteinGrams} unit="g / day" size="lg" />
            <MacroTile
              icon={Droplet}
              label="Fat"
              value={activeTarget.fatGrams ?? "—"}
              unit={activeTarget.fatGrams != null ? "g / day" : undefined}
              valueClassName="text-white/40"
              size="lg"
            />
            <MacroTile
              icon={Wheat}
              label="Carbs"
              value={activeTarget.carbGrams ?? "—"}
              unit={activeTarget.carbGrams != null ? "g / day" : undefined}
              valueClassName="text-white/40"
              size="lg"
            />
          </div>

          <CardFooter tone="dark">
            <p className="text-[10px] text-white/25">
              Effective {activeTarget.effectiveDate}
              {activeTarget.publishedAt && (
                <> · {new Date(activeTarget.publishedAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric",
                })}</>
              )}
            </p>
          </CardFooter>
        </Card>
      )}

      {/* ── Draft queue ─────────────────────────────────────────── */}
      {draftTargets.length > 0 && !showForm && (
        <div className="mb-8">
          <p className="mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.4em] text-white/25">
            <FileEdit size={11} aria-hidden /> Saved Drafts
          </p>
          <div className="space-y-2">
            {draftTargets.map((draft) => (
              <Card key={draft.id} tone="dark" padding="sm" className="flex items-center gap-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/55 tabular-nums">
                    {draft.calorieTarget.toLocaleString()} kcal &middot; {draft.proteinGrams}g protein
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/25">
                    Effective {draft.effectiveDate}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button tone="dark" variant="ghost" size="sm" onClick={() => openForEditDraft(draft)}>
                    Edit
                  </Button>
                  <Button
                    tone="dark"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePublishDraft(draft.id)}
                    disabled={isBusy}
                    loading={status.type === "publishing"}
                    className="!border-gold/30 !text-gold/70 hover:!bg-gold/[0.08] hover:!text-gold"
                  >
                    {status.type === "publishing" ? "Publishing…" : "Publish"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!showForm && !activeTarget && draftTargets.length === 0 && (
        <EmptyState
          tone="dark"
          icon={<Salad className="size-5" aria-hidden />}
          title={`No targets set for ${firstName} yet`}
          description={`Generate a recommendation from ${firstName}'s profile, review and adjust, then publish their first plan.`}
          action={
            <Button tone="dark" variant="outline" className="!border-gold/30 !text-gold/70 hover:!bg-gold/[0.08] hover:!text-gold" onClick={openForNewTarget}>
              Set Nutrition Targets
            </Button>
          }
        />
      )}

      {/* ── "Set new targets" link when published or drafts exist ── */}
      {!showForm && (activeTarget || draftTargets.length > 0) && (
        <Button
          tone="dark"
          variant="ghost"
          size="sm"
          onClick={openForNewTarget}
          leftIcon={<Plus size={12} aria-hidden />}
          className="!text-white/30 hover:!text-white/60"
        >
          Set new targets
        </Button>
      )}

      {/* ─────────────────────────────────────────────────────────
          FORM
      ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div>

          {/* Form header */}
          <div className="mb-8 flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.4em] text-white/30">
              {editingDraftId ? "Edit Draft" : `New Targets · ${firstName}`}
            </p>
            <Button
              tone="dark"
              variant="ghost"
              size="sm"
              onClick={() => { setShowForm(false); setStatus({ type: "idle" }); }}
              className="!text-white/25 hover:!text-white/55"
            >
              Cancel
            </Button>
          </div>

          {/* ════════════════════════════════════════════════════
              SECTION 1: RECOMMENDATION
          ════════════════════════════════════════════════════ */}
          <Card tone="dark" padding="lg" className="mb-8">
            <p className="mb-6 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.4em] text-white/30">
              <Calculator size={11} className="text-gold/60" aria-hidden /> Recommended Targets
            </p>

            {/* Activity Level + Goal selects */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label tone="dark">Activity Level</Label>
                <Select tone="dark" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
                  {Object.entries(ACTIVITY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label tone="dark">Goal</Label>
                <Select tone="dark" value={goalType} onChange={(e) => setGoalType(e.target.value)}>
                  {Object.entries(GOAL_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Recommendation display */}
            {canCalculate && rec ? (
              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <p className="text-[10px] leading-snug text-white/30">
                    BMR {rec.bmr.toLocaleString()} &middot; TDEE {rec.tdee.toLocaleString()}
                    {rec.calorieAdjustment !== 0 && (
                      <> &middot; {rec.calorieAdjustment > 0 ? "+" : ""}{rec.calorieAdjustment} ({GOAL_LABELS[goalType] ?? goalType})</>
                    )}
                  </p>
                  <Button
                    tone="dark"
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={applyRecommendation}
                    className="!border-gold/30 !text-gold/65 hover:!bg-gold/[0.08] hover:!text-gold shrink-0"
                  >
                    Apply
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                  <MacroTile icon={Flame} label="Calories" value={rec.recommendedCalories.toLocaleString()} unit="kcal" accent size="md" />
                  <MacroTile icon={Beef} label="Protein" value={rec.recommendedProteinG.toLocaleString()} unit="g" valueClassName="text-white/65" size="md" />
                  <MacroTile icon={Droplet} label="Fat" value={rec.recommendedFatG.toLocaleString()} unit="g" valueClassName="text-white/65" size="md" />
                  <MacroTile icon={Wheat} label="Carbs" value={rec.recommendedCarbG.toLocaleString()} unit="g" valueClassName="text-white/65" size="md" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-5 py-4">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-400/50" aria-hidden />
                  <p className="text-xs leading-relaxed text-amber-400/50">
                    The calculator needs {firstName}&apos;s height, weight, and date of
                    birth to auto-fill targets. Add them below, or enter Calories,
                    Protein, Fat, and Carbs manually in Daily Targets further down.
                  </p>
                </div>
                <ClientMetricsPanel clientId={clientId} calcProfile={calcProfile} firstName={firstName} />
              </div>
            )}
          </Card>

          {/* ════════════════════════════════════════════════════
              SECTION 2: TARGET VALUES
          ════════════════════════════════════════════════════ */}
          <Card tone="dark" padding="lg" className="mb-8">
            <p className="mb-6 text-[9px] font-bold uppercase tracking-[0.4em] text-white/30">
              {canCalculate ? "Your Decision" : "Daily Targets"}
            </p>

            <div className="mb-5 grid grid-cols-2 gap-5">
              <div>
                <Label tone="dark">Calories (kcal)</Label>
                <Input
                  tone="dark"
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  min={800}
                  max={8000}
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label tone="dark">Protein (g)</Label>
                <Input
                  tone="dark"
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  min={1}
                  max={500}
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label tone="dark">
                  Fat (g) <span className="normal-case tracking-normal text-white/20">(optional)</span>
                </Label>
                <Input
                  tone="dark"
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  min={0}
                  max={500}
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label tone="dark">
                  Carbs (g) <span className="normal-case tracking-normal text-white/20">(optional)</span>
                </Label>
                <Input
                  tone="dark"
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  min={0}
                  max={1200}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <Label tone="dark">Effective Date</Label>
                <Input
                  tone="dark"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <Label tone="dark" className="!text-white/25">
                  Adjustment Note{" "}
                  <span className="normal-case tracking-normal">
                    (if diverging from recommendation)
                  </span>
                </Label>
                <Input
                  tone="dark"
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Starting lower, adjusting after next check-in"
                />
              </div>
            </div>
          </Card>

          {/* ════════════════════════════════════════════════════
              SECTION 3: COACHING GUIDANCE
          ════════════════════════════════════════════════════ */}
          <Card tone="dark" padding="lg" className="mb-8">
            <div className="mb-6 flex items-baseline justify-between">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.4em] text-white/30">
                <MessageSquare size={11} className="text-gold/60" aria-hidden /> Coaching Guidance
              </p>
              <p className="text-[10px] text-gold/35">
                {firstName} will read this
              </p>
            </div>

            {/* Gold border-left treatment — guidance as a letter, not a form field.
                Custom hand-rolled textarea (not the Input/Textarea primitive):
                the transparent, borderless "letter" look is a deliberate one-off
                visual the boxed field primitive doesn't cover. */}
            <div className="mb-6 border-l-2 border-gold/20 pl-6">
              <textarea
                rows={5}
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                placeholder={`Context for ${firstName} — what do these targets mean for their goal? What should they prioritize? Clients who understand the why are far more consistent.`}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-white/65 placeholder:text-white/14 focus:outline-none"
              />
            </div>

            <div>
              <Label tone="dark" className="!text-white/18">Internal Notes — coach only</Label>
              <Textarea
                tone="dark"
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Notes for your reference. Not visible to the client."
                className="text-xs leading-relaxed"
              />
            </div>
          </Card>

          {/* ════════════════════════════════════════════════════
              SECTION 4: REVIEW + PUBLISH
          ════════════════════════════════════════════════════ */}
          <Card tone="dark" padding="lg" className="mb-6">
            <p className="mb-5 flex items-center gap-2 text-[9px] uppercase tracking-[0.4em] text-white/25">
              <Send size={11} aria-hidden /> Publishing
            </p>

            {/* Macro preview */}
            <div className="mb-5 grid grid-cols-4 gap-5">
              <MacroTile icon={Flame} label="Calories" value={calories || "—"} accent size="sm" />
              <MacroTile icon={Beef} label="Protein" value={protein || "—"} size="sm" />
              <MacroTile icon={Droplet} label="Fat" value={fat || "—"} valueClassName="text-white/40" size="sm" />
              <MacroTile icon={Wheat} label="Carbs" value={carbs || "—"} valueClassName="text-white/40" size="sm" />
            </div>

            {/* Guidance preview */}
            {coachNotes.trim() && (
              <div className="mb-4 border-t border-white/[0.05] pt-4">
                <p className="mb-2 text-[9px] uppercase tracking-[0.3em] text-gold/28">
                  Guidance
                </p>
                <p className="line-clamp-2 text-xs leading-relaxed text-white/28">
                  {coachNotes}
                </p>
              </div>
            )}

            <div className="border-t border-white/[0.05] pt-4">
              <p className="text-[10px] text-white/25">Effective {effectiveDate}</p>
            </div>
          </Card>

          {/* Publish button — full width, conclusive */}
          <Button
            tone="dark"
            variant="primary"
            size="lg"
            onClick={handlePublishFromForm}
            disabled={isBusy || !canSubmit}
            loading={status.type === "publishing"}
            className="mb-4 !h-14 w-full text-sm font-bold uppercase tracking-[0.2em]"
          >
            {status.type === "publishing"
              ? "Publishing…"
              : `Publish ${firstName}'s Nutrition Plan`}
          </Button>

          {/* Save draft — secondary */}
          <div className="mb-5 text-center">
            <Button
              tone="dark"
              variant="ghost"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isBusy || !canSubmit}
              loading={status.type === "saving"}
              className="!text-white/30 hover:!text-white/60"
            >
              {status.type === "saving" ? "Saving…" : "Save as draft instead"}
            </Button>
          </div>

          <p className="text-center text-[9px] leading-relaxed text-white/16">
            {firstName} will immediately see these targets and any coaching guidance.
            <br />
            Any previously published plan is archived automatically.
          </p>
        </div>
      )}
    </div>
  );
}
