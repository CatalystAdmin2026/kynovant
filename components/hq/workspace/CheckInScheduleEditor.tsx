"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Check-In Schedule Editor
//
// The canonical Coach HQ surface for configuring which weekdays a
// client is required to submit a check-in. Writes exclusively
// through setCheckInScheduleAction (app/hq/clients/[clientId]/
// actions.ts), which derives coach identity from the session and
// calls the reviewed, transactional, effective-dated
// setClientSchedule() — this component holds no persistence logic
// of its own.
//
// Explicit-save, not auto-save: a coach can toggle days freely and
// nothing is written until "Save Check-In Schedule" is pressed. This
// matches the existing GoalManager pattern on this same page and
// avoids writing a schedule change from an accidental tap.
// ─────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setCheckInScheduleAction } from "@/app/hq/clients/[clientId]/actions";
import { WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS, normalizeWeekdays, type Weekday } from "@/lib/checkin/schedule";
import { Button } from "@/components/ui";

// Business-week (Monday-first) display order — matches how coaches
// think of the week, same convention describeSchedule already uses
// for its human-readable string. Internal weekday numbering stays
// 0=Sunday..6=Saturday everywhere else.
const DISPLAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  clientId: string;
  initialWeekdays: number[];
}

function sameSet(a: number[], b: number[]): boolean {
  const na = normalizeWeekdays(a);
  const nb = normalizeWeekdays(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

export default function CheckInScheduleEditor({ clientId, initialWeekdays }: Props) {
  const baseline = normalizeWeekdays(initialWeekdays);
  const [selected, setSelected] = useState<Weekday[]>(baseline);
  const [savedWeekdays, setSavedWeekdays] = useState<Weekday[]>(baseline);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = !sameSet(selected, savedWeekdays);

  function toggleDay(day: Weekday) {
    setJustSaved(false);
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function handleSave() {
    if (isPending || !dirty) return;
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await setCheckInScheduleAction(clientId, selected);
      if (result.ok) {
        setSavedWeekdays(normalizeWeekdays(selected));
        setJustSaved(true);
      } else {
        setError(result.error ?? "Failed to save check-in schedule. Please try again.");
      }
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
