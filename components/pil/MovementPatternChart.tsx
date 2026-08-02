"use client";

import type { MovementAnalysis } from "@/lib/pil/types";
import { SEVERITY_TEXT } from "@/lib/ui/status";

interface Props {
  analysis: MovementAnalysis;
}

const PUSH_PATTERNS = new Set(["push_horizontal", "push_vertical"]);
const PULL_PATTERNS = new Set(["pull_horizontal", "pull_vertical"]);

// Push/pull are categorical, not a severity concept, so bars converge
// to the single gold accent (push) + neutral white opacities (pull /
// other) rather than the retired blue/orange hue pair.
function barColorFor(isPush: boolean, isPull: boolean): string {
  if (isPush) return "bg-[#C9A24D]/70";
  if (isPull) return "bg-white/30";
  return "bg-white/15";
}

export default function MovementPatternChart({ analysis }: Props) {
  const { byPattern } = analysis;

  if (byPattern.length < 2) return null;

  const totalSets = byPattern.reduce((s, e) => s + e.sets, 0);
  if (totalSets === 0) return null;

  // Sort by sets descending for readability
  const sorted = [...byPattern].sort((a, b) => b.sets - a.sets);

  const { horizontal, vertical } = analysis.pushPullBalance;
  const horizontalFlagged = horizontal.ratio !== null && horizontal.ratio > 2;
  const verticalFlagged = vertical.ratio !== null && vertical.ratio > 2;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {sorted.map((entry) => {
          const pct = (entry.sets / totalSets) * 100;
          const isPush = PUSH_PATTERNS.has(entry.pattern);
          const isPull = PULL_PATTERNS.has(entry.pattern);
          const barColor = barColorFor(isPush, isPull);

          return (
            <div key={entry.pattern} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-white/40 capitalize truncate">
                {entry.pattern.replace(/_/g, " ")}
              </span>
              <div className="flex-1 bg-white/[0.06] rounded-full h-2">
                <div
                  className={`${barColor} h-2 rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-mono text-white/40">
                {entry.sets}
              </span>
            </div>
          );
        })}
      </div>

      {/* Push/pull ratio annotations */}
      <div className="flex flex-wrap gap-4 pt-1">
        {horizontal.ratio !== null && (
          <span className="text-xs text-white/40">
            Horizontal push:pull{" "}
            <span
              className={`font-semibold ${horizontalFlagged ? SEVERITY_TEXT.high : "text-white/70"}`}
            >
              {horizontal.ratio.toFixed(1)}:1
            </span>
          </span>
        )}
        {vertical.ratio !== null && (
          <span className="text-xs text-white/40">
            Vertical push:pull{" "}
            <span
              className={`font-semibold ${verticalFlagged ? SEVERITY_TEXT.high : "text-white/70"}`}
            >
              {vertical.ratio.toFixed(1)}:1
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
