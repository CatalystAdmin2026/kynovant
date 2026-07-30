"use client";

import type { MovementAnalysis } from "@/lib/pil/types";

interface Props {
  analysis: MovementAnalysis;
}

const PUSH_PATTERNS = new Set(["push_horizontal", "push_vertical"]);
const PULL_PATTERNS = new Set(["pull_horizontal", "pull_vertical"]);

export default function MovementPatternChart({ analysis }: Props) {
  const { byPattern } = analysis;

  if (byPattern.length < 2) return null;

  const totalSets = byPattern.reduce((s, e) => s + e.sets, 0);
  if (totalSets === 0) return null;

  // Sort by sets descending for readability
  const sorted = [...byPattern].sort((a, b) => b.sets - a.sets);

  const { horizontal, vertical } = analysis.pushPullBalance;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {sorted.map((entry) => {
          const pct = (entry.sets / totalSets) * 100;
          const isPush = PUSH_PATTERNS.has(entry.pattern);
          const isPull = PULL_PATTERNS.has(entry.pattern);
          const barColor = isPush
            ? "bg-orange-300"
            : isPull
              ? "bg-blue-300"
              : "bg-gray-200";

          return (
            <div key={entry.pattern} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-gray-500 capitalize truncate">
                {entry.pattern.replace(/_/g, " ")}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className={`${barColor} h-2 rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-mono text-gray-400">
                {entry.sets}
              </span>
            </div>
          );
        })}
      </div>

      {/* Push/pull ratio annotations */}
      <div className="flex flex-wrap gap-4 pt-1">
        {horizontal.ratio !== null && (
          <span className="text-xs text-gray-500">
            Horizontal push:pull{" "}
            <span
              className={
                horizontal.ratio > 2
                  ? "font-semibold text-orange-600"
                  : "font-semibold text-gray-700"
              }
            >
              {horizontal.ratio.toFixed(1)}:1
            </span>
          </span>
        )}
        {vertical.ratio !== null && (
          <span className="text-xs text-gray-500">
            Vertical push:pull{" "}
            <span
              className={
                vertical.ratio > 2
                  ? "font-semibold text-yellow-600"
                  : "font-semibold text-gray-700"
              }
            >
              {vertical.ratio.toFixed(1)}:1
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
