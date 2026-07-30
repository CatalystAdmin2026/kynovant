"use client";

import { useState } from "react";
import type { PilFinding } from "@/lib/pil/types";

interface Props {
  finding: PilFinding;
}

const SEVERITY_BORDER: Record<string, string> = {
  error: "border-l-red-400",
  warning: "border-l-orange-400",
  caution: "border-l-amber-400",
  info: "border-l-gray-200",
};

const SEVERITY_DOT: Record<string, string> = {
  error: "bg-red-400",
  warning: "bg-orange-400",
  caution: "bg-amber-400",
  info: "bg-gray-200",
};

export default function PilFindingCard({ finding }: Props) {
  const [expanded, setExpanded] = useState(false);

  const borderClass = SEVERITY_BORDER[finding.severity] ?? "border-l-gray-200";
  const hasExpandable = finding.evidence.length > 0 || finding.confidence !== "certain";

  return (
    <div className={`border-l-2 ${borderClass} bg-white pl-3.5 pr-3.5 py-2.5 rounded-r-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800 leading-snug">{finding.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{finding.explanation}</p>
        </div>
        {hasExpandable && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-gray-400 hover:text-gray-600 shrink-0 mt-0.5 transition-colors"
            aria-label={expanded ? "Collapse evidence" : "Show evidence"}
          >
            {expanded ? "Less" : "Evidence"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-50 space-y-1">
          {finding.evidence.map((fact, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-28 shrink-0">{fact.label}</span>
              <span className="font-mono text-gray-700">{fact.value}</span>
            </div>
          ))}

          {finding.confidence === "heuristic" && (
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              Based on general training guidelines — coaches with specific rationale may reasonably differ.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
