"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Check-In Schedule Editor
//
// The canonical Coach HQ surface for configuring which weekdays a
// client is required to submit a check-in, and — per selected
// weekday — whether progress photos are Required / Optional / Off,
// and (when Required) exactly which views (Front/Side/Back) count.
// Writes exclusively through setCheckInScheduleAction and
// setPhotoPolicyAction (app/hq/clients/[clientId]/actions.ts), which
// derive coach identity from the session and call the reviewed,
// transactional, effective-dated setClientSchedule() /
// setPhotoPolicy() — this component holds no persistence logic of its
// own.
//
// Explicit-save, not auto-save: a coach can toggle days and photo
// policies freely and nothing is written until "Save Check-In
// Schedule" is pressed. This matches the existing GoalManager pattern
// on this same page and avoids writing a schedule change from an
// accidental tap.
//
// A photo-policy control appears for every currently-selected day,
// including one toggled on in this same session before Save is
// pressed — setPhotoPolicyAction requires an already-active schedule
// row for that weekday, so handleSave always writes the weekday
// membership (setCheckInScheduleAction) FIRST and awaits it before
// attempting any photo-policy write, guaranteeing the row exists by
// the time it's needed.
//
// Required-views default: switching a day to "Required" defaults to
// Front + Side + Back all checked (the product default) — a coach
// narrows it by unchecking specific views. At least one view must
// stay checked while "Required" is active; unchecking the last one is
// a no-op here (the server independently rejects it too).
// ─────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setCheckInScheduleAction, setPhotoPolicyAction } from "@/app/hq/clients/[clientId]/actions";
import { WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, normalizeWeekdays, type Weekday } from "@/lib/checkin/schedule";
import type { CheckInPhotoRequirement } from "@/lib/db/schema-check-in";
import { Button } from "@/components/ui";

// Business-week (Monday-first) display order — matches how coaches
// think of the week, same convention describeSchedule already uses
// for its human-readable string. Internal weekday numbering stays
// 0=Sunday..6=Saturday everywhere else.
const DISPLAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const PHOTO_OPTIONS: { value: CheckInPhotoRequirement; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];

interface PhotoPolicyState {
  requirement: CheckInPhotoRequirement;
  requireFront: boolean;
  requireSide: boolean;
  requireBack: boolean;
}

const DEFAULT_REQUIRED_VIEWS = { requireFront: true, requireSide: true, requireBack: true };

interface Props {
  clientId: string;
  initialWeekdays: number[];
  initialPhotoPolicies: Partial<Record<number, PhotoPolicyState>>;
}

function sameSet(a: number[], b: number[]): boolean {
  const na = normalizeWeekdays(a);
  const nb = normalizeWeekdays(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

function samePolicy(a: PhotoPolicyState | undefined, b: PhotoPolicyState | undefined): boolean {
  const pa = a ?? { requirement: "off" as const, ...DEFAULT_REQUIRED_VIEWS };
  const pb = b ?? { requirement: "off" as const, ...DEFAULT_REQUIRED_VIEWS };
  if (pa.requirement !== pb.requirement) return false;
  if (pa.requirement !== "required") return true; // views are inert outside "required"
  return (
    pa.requireFront === pb.requireFront &&
    pa.requireSide === pb.requireSide &&
    pa.requireBack === pb.requireBack
  );
}

export default function CheckInScheduleEditor({ clientId, initialWeekdays, initialPhotoPolicies }: Props) {
  const baseline = normalizeWeekdays(initialWeekdays);
  const [selected, setSelected] = useState<Weekday[]>(baseline);
  const [savedWeekdays, setSavedWeekdays] = useState<Weekday[]>(baseline);
  const [photoPolicies, setPhotoPolicies] =
    useState<Partial<Record<Weekday, PhotoPolicyState>>>(initialPhotoPolicies);
  const [savedPhotoPolicies, setSavedPhotoPolicies] = useState(photoPolicies);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const normalizedSelected = normalizeWeekdays(selected);
  const dirty =
    !sameSet(selected, savedWeekdays) ||
    normalizedSelected.some((day) => !samePolicy(photoPolicies[day], savedPhotoPolicies[day]));

  function toggleDay(day: Weekday) {
    setJustSaved(false);
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function setPhotoRequirement(day: Weekday, requirement: CheckInPhotoRequirement) {
    setJustSaved(false);
    setPhotoPolicies((prev) => {
      const existing = prev[day];
      return {
        ...prev,
        [day]: {
          requirement,
          requireFront: existing?.requireFront ?? true,
          requireSide: existing?.requireSide ?? true,
          requireBack: existing?.requireBack ?? true,
        },
      };
    });
  }

  function toggleView(day: Weekday, view: "requireFront" | "requireSide" | "requireBack") {
    setJustSaved(false);
    setPhotoPolicies((prev) => {
      const existing = prev[day] ?? { requirement: "required" as const, ...DEFAULT_REQUIRED_VIEWS };
      const next = { ...existing, [view]: !existing[view] };
      const remainingTrue = [next.requireFront, next.requireSide, next.requireBack].filter(Boolean).length;
      // Refuse to leave "Required" with zero views checked — the
      // server rejects this too, but disallowing it here avoids a
      // round-trip error for what is never a meaningful state.
      if (remainingTrue === 0) return prev;
      return { ...prev, [day]: next };
    });
  }

  function handleSave() {
    if (isPending || !dirty) return;
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      // Weekday membership first — a freshly-added day must exist as
      // an active row before its photo policy can be set.
      const scheduleResult = await setCheckInScheduleAction(clientId, selected);
      if (!scheduleResult.ok) {
        setError(scheduleResult.error ?? "Failed to save check-in schedule. Please try again.");
        return;
      }

      for (const day of normalizedSelected) {
        const target = photoPolicies[day] ?? { requirement: "off" as const, ...DEFAULT_REQUIRED_VIEWS };
        if (samePolicy(target, savedPhotoPolicies[day])) continue;
        const photoResult = await setPhotoPolicyAction(clientId, day, {
          requirement: target.requirement,
          requireFront: target.requireFront,
          requireSide: target.requireSide,
          requireBack: target.requireBack,
        });
        if (!photoResult.ok) {
          setError(photoResult.error ?? "Failed to save photo requirement. Please try again.");
          return;
        }
      }

      setSavedWeekdays(normalizedSelected);
      setSavedPhotoPolicies({ ...photoPolicies });
      setJustSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 leading-relaxed">
        Choose the days this client is expected to submit a check-in.
      </p>

      <div
        role="group"
        aria-label="Required check-in days"
        className="flex flex-wrap gap-2"
      >
        {DISPLAY_ORDER.map((day) => {
          const isSelected = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              aria-label={WEEKDAY_LABELS[day]}
              onClick={() => toggleDay(day)}
              disabled={isPending}
              className={`ds-focus-ring flex min-w-[52px] items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors duration-150 disabled:opacity-50 ${
                isSelected
                  ? "border-[#C9A24D] bg-[#C9A24D]/15 text-[#C9A24D]"
                  : "border-white/[0.10] bg-[#0d0e0f] text-white/40 hover:border-white/20 hover:text-white/60"
              }`}
            >
              {isSelected && <Check size={12} aria-hidden />}
              {WEEKDAY_SHORT_LABELS[day]}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-[11px] text-white/30">No required check-in schedule.</p>
      )}

      {/* Per-day photo policy — shown for each currently-selected day.
          Saving always writes the weekday itself before any photo
          policy, so a day added and given a policy in the same
          session persists both correctly in one Save. */}
      {DISPLAY_ORDER.filter((day) => selected.includes(day)).length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-[10px] text-white/30 uppercase tracking-[0.25em]">Progress Photos</p>
          {DISPLAY_ORDER.filter((day) => selected.includes(day)).map((day) => {
            const policy = photoPolicies[day] ?? { requirement: "off" as const, ...DEFAULT_REQUIRED_VIEWS };
            return (
              <div key={day} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-white/50 w-20 shrink-0">{WEEKDAY_LABELS[day]}</span>
                  <div role="radiogroup" aria-label={`${WEEKDAY_LABELS[day]} photo requirement`} className="flex gap-1">
                    {PHOTO_OPTIONS.map((opt) => {
                      const isActive = policy.requirement === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          disabled={isPending}
                          onClick={() => setPhotoRequirement(day, opt.value)}
                          className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:opacity-50 ${
                            isActive
                              ? "border-[#C9A24D] bg-[#C9A24D]/15 text-[#C9A24D]"
                              : "border-white/[0.10] bg-[#0d0e0f] text-white/35 hover:border-white/20 hover:text-white/55"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Required-views checkboxes — only when this day's
                    requirement is "Required". Default (a fresh
                    switch to Required) is Front+Side+Back all
                    checked; the coach narrows from there. */}
                {policy.requirement === "required" && (
                  <div className="flex items-center gap-3 pl-[92px]">
                    {(
                      [
                        { key: "requireFront" as const, label: "Front" },
                        { key: "requireSide" as const, label: "Side" },
                        { key: "requireBack" as const, label: "Back" },
                      ]
                    ).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-1.5 text-[10px] text-white/45 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policy[key]}
                          disabled={isPending}
                          onChange={() => toggleView(day, key)}
                          className="h-3 w-3 rounded-sm border-white/20 bg-[#0d0e0f] accent-[#C9A24D]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-white/25 leading-relaxed">
            &quot;Required&quot; means the checked views above must be uploaded before a client can submit.
          </p>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400/70">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="button"
          variant="primary"
          tone="dark"
          size="sm"
          onClick={handleSave}
          disabled={isPending || !dirty}
          loading={isPending}
        >
          {isPending ? "Saving…" : "Save Check-In Schedule"}
        </Button>
        {!dirty && justSaved && (
          <span className="text-[10px] text-emerald-400/70">Saved</span>
        )}
        {dirty && !isPending && (
          <span className="text-[10px] text-white/25">Unsaved changes</span>
        )}
      </div>

      <p className="text-[10px] text-white/25 leading-relaxed">
        Changes apply going forward and won&apos;t rewrite past check-in history.
      </p>
    </div>
  );
}
