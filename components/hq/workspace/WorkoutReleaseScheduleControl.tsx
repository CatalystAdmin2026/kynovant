"use client";

import { useState, useTransition } from "react";
import { setWorkoutReleasePolicyAction } from "@/app/hq/clients/[clientId]/actions";
import type { WorkoutReleasePolicy } from "@/lib/workout-release-policy";

const OPTIONS: Array<{ value: WorkoutReleasePolicy; label: string; description: string }> = [
  {
    value: "daily",
    label: "Daily",
    description: "Clients access workouts according to the current daily release behavior.",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Every Sunday, clients can access all workouts scheduled through Saturday.",
  },
];

export default function WorkoutReleaseScheduleControl({
  clientId,
  assignmentId,
  initialPolicy,
}: {
  clientId: string;
  assignmentId: string;
  initialPolicy: WorkoutReleasePolicy;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function select(nextPolicy: WorkoutReleasePolicy) {
    if (nextPolicy === policy || pending) return;
    const previous = policy;
    setPolicy(nextPolicy);
    setError(null);
    startTransition(async () => {
      const result = await setWorkoutReleasePolicyAction({ clientId, assignmentId, policy: nextPolicy });
      if (!result.ok) {
        setPolicy(previous);
        setError(result.error ?? "Could not update workout release schedule.");
      }
    });
  }

  return (
    <fieldset className="mt-5 border-t border-white/[0.06] pt-4" disabled={pending}>
      <legend className="text-[9px] uppercase tracking-[0.25em] text-white/35">
        Workout Release Schedule
      </legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = policy === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => select(option.value)}
              className={`border p-3 text-left transition-colors ${selected ? "border-[#C9A24D]/50 bg-[#C9A24D]/[0.07]" : "border-white/[0.07] hover:border-white/20"}`}
            >
              <span className={selected ? "text-sm font-bold text-[#C9A24D]" : "text-sm font-bold text-white/70"}>
                {option.label}
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-white/35">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      {pending && <p className="mt-2 text-[10px] text-white/30">Saving…</p>}
      {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}
    </fieldset>
  );
}
