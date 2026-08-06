"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateProgramDraftAction } from "./actions";

const CATEGORIES = [
  "fat_loss", "muscle_growth", "body_recomposition",
  "athletic_performance", "lifestyle", "competition_prep",
  "executive_performance",
] as const;

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "competitive", "mixed"] as const;

const SPLITS = [
  { value: "full_body", label: "Full Body" },
  { value: "upper_lower", label: "Upper / Lower" },
  { value: "push_pull_legs", label: "Push / Pull / Legs" },
  { value: "body_part", label: "Body Part Split" },
  { value: "hybrid", label: "Hybrid" },
  { value: "coach_decides", label: "Coach Decides" },
] as const;

const EQUIPMENT_OPTIONS = [
  { value: "commercial_gym", label: "Commercial Gym" },
  { value: "home_gym", label: "Home Gym" },
  { value: "dumbbells_only", label: "Dumbbells Only" },
  { value: "bands_only", label: "Bands Only" },
  { value: "bodyweight", label: "Bodyweight Only" },
  { value: "custom", label: "Custom / Other" },
] as const;

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GenerateBriefForm({
  clientId,
  clientName,
}: {
  clientId: string | null;
  clientName: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    goal: "muscle_growth" as (typeof CATEGORIES)[number],
    weeks: "8",
    daysPerWeek: "4",
    preferredSplit: "coach_decides" as (typeof SPLITS)[number]["value"],
    experienceLevel: "intermediate" as (typeof EXPERIENCE_LEVELS)[number],
    equipmentAccess: "commercial_gym" as (typeof EQUIPMENT_OPTIONS)[number]["value"],
    targetSessionMinutes: "60",
    limitations: "",
    freeformInstructions: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await generateProgramDraftAction({
      clientId,
      brief: {
        goal: form.goal,
        weeks: Number(form.weeks),
        daysPerWeek: Number(form.daysPerWeek),
        preferredSplit: form.preferredSplit,
        experienceLevel: form.experienceLevel,
        equipmentAccess: form.equipmentAccess,
        targetSessionMinutes: Number(form.targetSessionMinutes),
        limitations: form.limitations || undefined,
        freeformInstructions: form.freeformInstructions || undefined,
      },
    });

    if (!result.ok || !result.data) {
      setSubmitting(false);
      setError(result.error ?? "Generation failed.");
      // Even on a provider failure, a draft row exists so the coach can
      // see the failure state and retry — send them there if we have an id.
      if (result.data && (result.data as { draftId?: string }).draftId) {
        router.push(`/hq/programs/generate/${(result.data as { draftId: string }).draftId}`);
      }
      return;
    }

    router.push(`/hq/programs/generate/${result.data.draftId}`);
  }

  const inputClass =
    "w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50 placeholder-white/15 transition-colors";
  const labelClass = "block text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-[#0d0e0f] border border-white/[0.08] p-6">
      {clientName && (
        <div className="text-[11px] text-[#C9A24D]/70 uppercase tracking-[0.25em]">
          Generating for {clientName}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="brief-goal">Goal *</label>
          <select
            id="brief-goal"
            required
            value={form.goal}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value as typeof form.goal }))}
            className={inputClass}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{fmtLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-experience-level">Experience Level *</label>
          <select
            id="brief-experience-level"
            required
            value={form.experienceLevel}
            onChange={(e) => setForm((f) => ({ ...f, experienceLevel: e.target.value as typeof form.experienceLevel }))}
            className={inputClass}
          >
            {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{fmtLabel(l)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-weeks">Weeks *</label>
          <input
            id="brief-weeks"
            required
            type="number" min={1} max={16}
            value={form.weeks}
            onChange={(e) => setForm((f) => ({ ...f, weeks: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-days-per-week">Days / Week *</label>
          <input
            id="brief-days-per-week"
            required
            type="number" min={1} max={7}
            value={form.daysPerWeek}
            onChange={(e) => setForm((f) => ({ ...f, daysPerWeek: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-preferred-split">Preferred Split *</label>
          <select
            id="brief-preferred-split"
            required
            value={form.preferredSplit}
            onChange={(e) => setForm((f) => ({ ...f, preferredSplit: e.target.value as typeof form.preferredSplit }))}
            className={inputClass}
          >
            {SPLITS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-equipment-access">Equipment Access *</label>
          <select
            id="brief-equipment-access"
            required
            value={form.equipmentAccess}
            onChange={(e) => setForm((f) => ({ ...f, equipmentAccess: e.target.value as typeof form.equipmentAccess }))}
            className={inputClass}
          >
            {EQUIPMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="brief-target-session-minutes">Target Session Length (minutes) *</label>
          <input
            id="brief-target-session-minutes"
            required
            type="number" min={10} max={240}
            value={form.targetSessionMinutes}
            onChange={(e) => setForm((f) => ({ ...f, targetSessionMinutes: e.target.value }))}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="brief-limitations">Limitations (honored exactly, not diagnosed)</label>
        <textarea
          id="brief-limitations"
          rows={2}
          value={form.limitations}
          onChange={(e) => setForm((f) => ({ ...f, limitations: e.target.value }))}
          placeholder="e.g. avoid overhead pressing, prior left knee surgery"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="brief-freeform-instructions">Freeform Instructions</label>
        <textarea
          id="brief-freeform-instructions"
          rows={3}
          value={form.freeformInstructions}
          onChange={(e) => setForm((f) => ({ ...f, freeformInstructions: e.target.value }))}
          placeholder="Anything else the generator should know about how you want this Program built."
          className={inputClass}
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
        >
          {submitting ? "Generating…" : "Generate Draft"}
        </button>
        <p className="text-white/25 text-[11px]">
          {submitting
            ? "This can take a minute or two — please don't close this tab."
            : "This creates a draft only — nothing is published or assigned until you approve it."}
        </p>
      </div>
    </form>
  );
}
