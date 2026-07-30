"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { PerMuscleWeeklyBriefData, PerMuscleWeekRow, MuscleGroup } from "@/lib/pil/types";

// ─── Muscle group metadata ────────────────────────────────────────────────────

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest",
  lats: "Lats",
  upper_back: "Upper Back",
  shoulders: "Shoulders",
  front_delts: "Front Delts",
  side_delts: "Side Delts",
  rear_delts: "Rear Delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quadriceps: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  hip_flexors: "Hip Flexors",
  adductors: "Adductors",
  abductors: "Abductors",
  core: "Core",
  obliques: "Obliques",
  lower_back: "Lower Back",
  neck: "Neck",
  tibialis: "Tibialis",
};

type FilterGroup = "all" | "upper" | "lower" | "core";

const UPPER_MUSCLES = new Set<string>([
  "chest", "lats", "upper_back", "shoulders", "front_delts", "side_delts",
  "rear_delts", "biceps", "triceps", "forearms", "neck",
]);
const LOWER_MUSCLES = new Set<string>([
  "quadriceps", "hamstrings", "glutes", "calves", "hip_flexors", "adductors",
  "abductors", "tibialis",
]);
const CORE_MUSCLES = new Set<string>(["core", "obliques", "lower_back"]);

function muscleCategory(muscleGroup: MuscleGroup): FilterGroup {
  if (UPPER_MUSCLES.has(muscleGroup)) return "upper";
  if (LOWER_MUSCLES.has(muscleGroup)) return "lower";
  if (CORE_MUSCLES.has(muscleGroup)) return "core";
  return "all";
}

const DAY_LABELS = ["Su", "M", "T", "W", "Th", "F", "Sa"];

// ─── Recovery status chip ─────────────────────────────────────────────────────

function RecoveryChip({ row }: { row: PerMuscleWeekRow }) {
  if (row.minRecoveryDays === null) return null;

  if (row.recoveryStatus === "same_day") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">
        Same day
      </span>
    );
  }
  if (row.recoveryStatus === "consecutive") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
        Back-to-back
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-400 tabular-nums">
      {row.minRecoveryDays}d
    </span>
  );
}

// ─── Sort control ─────────────────────────────────────────────────────────────

type SortKey = "muscle" | "direct" | "indirect" | "total" | "sessions" | "recovery";
type SortDir = "asc" | "desc";

function sortRows(rows: PerMuscleWeekRow[], key: SortKey, dir: SortDir): PerMuscleWeekRow[] {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "muscle":
        cmp = (MUSCLE_LABELS[a.muscleGroup] ?? a.muscleGroup).localeCompare(
          MUSCLE_LABELS[b.muscleGroup] ?? b.muscleGroup,
        );
        break;
      case "direct":
        cmp = a.directSetsPerWeek - b.directSetsPerWeek;
        break;
      case "indirect":
        cmp = a.indirectSetsPerWeek - b.indirectSetsPerWeek;
        break;
      case "total":
        cmp = a.totalSetsPerWeek - b.totalSetsPerWeek;
        break;
      case "sessions":
        cmp = a.sessionsPerWeek - b.sessionsPerWeek;
        break;
      case "recovery":
        cmp = (a.minRecoveryDays ?? 999) - (b.minRecoveryDays ?? 999);
        break;
    }
    return cmp * multiplier;
  });
}

// ─── Column header with sort ───────────────────────────────────────────────────

function SortableHeader({
  label,
  colKey,
  activeKey,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  colKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = colKey === activeKey;
  return (
    <th
      className={`text-right text-[10px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap pb-2 ${className}`}
      onClick={() => onSort(colKey)}
    >
      {label}
      {isActive && (
        <span className="ml-0.5 text-gray-300">{dir === "desc" ? " ↓" : " ↑"}</span>
      )}
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: PerMuscleWeeklyBriefData;
  highlightedMuscle?: string;
}

export default function PerMuscleWeeklyBrief({ data, highlightedMuscle }: Props) {
  const [filter, setFilter] = useState<FilterGroup>("all");
  const [sortKey, setSortKey] = useState<SortKey>("direct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(undefined);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When highlightedMuscle changes, set active highlight and auto-clear after 2s
  useEffect(() => {
    if (!highlightedMuscle) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setActiveHighlight(highlightedMuscle);
    highlightTimerRef.current = setTimeout(() => setActiveHighlight(undefined), 2000);
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [highlightedMuscle]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? data.rows
        : data.rows.filter((r) => muscleCategory(r.muscleGroup) === filter);
    return sortRows(base, sortKey, sortDir);
  }, [data.rows, filter, sortKey, sortDir]);

  if (data.rows.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-gray-400">
        No training data — add blueprints to program days to generate weekly brief.
      </div>
    );
  }

  const filterGroups: Array<{ key: FilterGroup; label: string }> = [
    { key: "all", label: "All" },
    { key: "upper", label: "Upper" },
    { key: "lower", label: "Lower" },
    { key: "core", label: "Core" },
  ];

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {filterGroups.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === key
                ? "bg-gray-900 text-white"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            <SortableHeader
              label="Muscle"
              colKey="muscle"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="text-left pr-3"
            />
            <SortableHeader
              label="Direct"
              colKey="direct"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="pr-3"
            />
            <SortableHeader
              label="Indirect"
              colKey="indirect"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="pr-3"
            />
            <SortableHeader
              label="Sessions"
              colKey="sessions"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="pr-3"
            />
            <th className="text-right text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-3 whitespace-nowrap">
              Days
            </th>
            <SortableHeader
              label="Recovery"
              colKey="recovery"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtered.map((row) => {
            const hasAlert =
              row.recoveryStatus === "same_day" || row.recoveryStatus === "consecutive";
            const isHighlighted = activeHighlight === row.muscleGroup;
            return (
              <tr
                key={row.muscleGroup}
                ref={(el) => {
                  if (isHighlighted && el) {
                    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }
                }}
                className={`transition-colors duration-200 ${
                  isHighlighted
                    ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                    : hasAlert
                    ? "bg-amber-50/40"
                    : ""
                } hover:bg-gray-50/60`}
              >
                {/* Muscle name */}
                <td className="py-2.5 pr-3 font-medium text-gray-800 text-xs whitespace-nowrap">
                  {hasAlert && row.recoveryStatus === "same_day" && (
                    <span className="inline-block w-1 h-1 rounded-full bg-red-400 mr-1.5 mb-0.5" />
                  )}
                  {hasAlert && row.recoveryStatus === "consecutive" && (
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-400 mr-1.5 mb-0.5" />
                  )}
                  {MUSCLE_LABELS[row.muscleGroup] ?? row.muscleGroup}
                </td>

                {/* Direct sets */}
                <td className="py-2.5 pr-3 text-right tabular-nums text-xs text-gray-700 font-medium">
                  {row.directSetsPerWeek % 1 === 0
                    ? row.directSetsPerWeek
                    : row.directSetsPerWeek.toFixed(1)}
                </td>

                {/* Indirect sets */}
                <td className="py-2.5 pr-3 text-right tabular-nums text-xs text-gray-400">
                  {row.indirectSetsPerWeek > 0
                    ? row.indirectSetsPerWeek % 1 === 0
                      ? row.indirectSetsPerWeek
                      : row.indirectSetsPerWeek.toFixed(1)
                    : "—"}
                </td>

                {/* Sessions per week */}
                <td className="py-2.5 pr-3 text-right tabular-nums text-xs text-gray-600">
                  {row.sessionsPerWeek % 1 === 0
                    ? row.sessionsPerWeek
                    : row.sessionsPerWeek.toFixed(1)}
                  ×
                </td>

                {/* Training days dot-map */}
                <td className="py-2.5 pr-3 text-right">
                  <span className="inline-flex gap-0.5">
                    {DAY_LABELS.map((label, idx) => (
                      <span
                        key={idx}
                        title={label}
                        className={`inline-block w-3.5 h-3.5 rounded-sm text-[7px] flex items-center justify-center font-medium ${
                          row.trainingDays.includes(idx)
                            ? "bg-gray-800 text-white"
                            : "bg-gray-100 text-gray-300"
                        }`}
                      >
                        {label[0]}
                      </span>
                    ))}
                  </span>
                </td>

                {/* Recovery */}
                <td className="py-2.5 text-right">
                  <RecoveryChip row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-4">
          No {filter} body muscles in this program.
        </p>
      )}

      {/* Footer metadata */}
      <div className="mt-3 flex gap-4 text-[10px] text-gray-300">
        <span>{data.weekCount} week{data.weekCount !== 1 ? "s" : ""}</span>
        <span>{data.distinctBlueprintsAnalyzed} blueprint{data.distinctBlueprintsAnalyzed !== 1 ? "s" : ""} analyzed</span>
        <span>Sets averaged per week</span>
      </div>
    </div>
  );
}
