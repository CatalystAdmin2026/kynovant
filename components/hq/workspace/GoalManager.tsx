"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { saveGoalAction, archiveGoalAction } from "@/app/hq/clients/[clientId]/actions";
import type { WorkspaceGoal } from "@/lib/db/coach-client-workspace-service";
import type { GoalType } from "@/lib/db/schema-profile";
import { Button, Select, Textarea, Input, Label } from "@/components/ui";

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "fat_loss",              label: "Fat Loss" },
  { value: "muscle_gain",           label: "Muscle Gain" },
  { value: "body_recomposition",    label: "Body Recomposition" },
  { value: "strength",              label: "Strength" },
  { value: "athletic_performance",  label: "Athletic Performance" },
  { value: "general_health",        label: "General Health" },
  { value: "mobility",              label: "Mobility" },
  { value: "competition_prep",      label: "Competition Prep" },
  { value: "reverse_diet",          label: "Reverse Diet" },
  { value: "maintenance",           label: "Maintenance" },
  { value: "executive_performance", label: "Executive Performance" },
  { value: "custom",                label: "Custom" },
];

function fmtGoalType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(str: string): string {
  return new Date(str + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

interface Props {
  goals: WorkspaceGoal[];
  clientId: string;
}

export default function GoalManager({ goals, clientId }: Props) {
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>("fat_loss");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveGoalAction({
        clientId,
        goalType,
        description,
        targetDate: targetDate || null,
      });
      if (result.ok) {
        setAdding(false);
        setDescription("");
        setTargetDate("");
        setGoalType("fat_loss");
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleArchive(goalId: string) {
    setError(null);
    startTransition(async () => {
      const result = await archiveGoalAction(goalId, clientId);
      if (!result.ok) setError(result.error ?? "Archive failed.");
    });
  }

  return (
    <div className="space-y-2">
      {goals.length === 0 && !adding && (
        <p className="py-1 text-xs text-white/30">No active goals on file.</p>
      )}

      {goals.map((g) => (
        <div
          key={g.id}
          className="rounded-lg border border-white/[0.06] bg-[#0d0e0f] px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white">{g.description}</p>
              <p className="text-[9px] text-white/30">
                {fmtGoalType(g.goalType)}
                {g.targetDate && ` · ${fmtDate(g.targetDate)}`}
                {g.priority !== null && ` · Priority ${g.priority}`}
              </p>
            </div>
            <button
              onClick={() => handleArchive(g.id)}
              disabled={isPending}
              className="ds-focus-ring shrink-0 rounded-md pt-0.5 text-[9px] text-white/30 transition-colors duration-150 hover:text-red-400/70 disabled:opacity-40"
            >
              Archive
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-2.5 rounded-lg border border-white/[0.06] bg-[#0d0e0f] p-3"
        >
          <div>
            <Label tone="dark" htmlFor="goal-type">Goal Type</Label>
            <Select
              id="goal-type"
              tone="dark"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
            >
              {GOAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label tone="dark" htmlFor="goal-description">Description</Label>
            <Textarea
              id="goal-description"
              tone="dark"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Lose 20 lbs"
              required
              rows={2}
            />
          </div>

          <div>
            <Label tone="dark" htmlFor="goal-target-date">Target Date (optional)</Label>
            <Input
              id="goal-target-date"
              type="date"
              tone="dark"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-[10px] text-red-400/70">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="submit"
              variant="primary"
              tone="dark"
              size="sm"
              disabled={isPending || !description.trim()}
              loading={isPending}
            >
              {isPending ? "Saving…" : "Save Goal"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              tone="dark"
              size="sm"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          tone="dark"
          size="sm"
          onClick={() => setAdding(true)}
          leftIcon={<Plus size={12} />}
        >
          Add Goal
        </Button>
      )}
    </div>
  );
}
