"use client";

import { useState } from "react";
import type { PilFinding } from "@/lib/pil/types";
import { SEVERITY_DOT, type Severity } from "@/lib/ui/status";

interface Props {
  finding: PilFinding;
}

// Maps this card's own finding-severity vocabulary onto the shared
// canonical Severity scale (lib/ui/status.ts).
function findingSeverity(severity: PilFinding["severity"]): Severity {
  switch (severity) {
    case "error":
      return "critical";
    case "warning":
      return "high";
    case "caution":
      return "caution";
    default:
      return "ok"; // info
  }
}

export default function PilFindingCard({ finding }: Props) {
  const [expanded, setExpanded] = useState(false);

  const sev = findingSeverity(finding.severity);
  const borderClass = SEVERITY_DOT[sev].replace("bg-", "border-l-");
  const hasExpandable = finding.evidence.length > 0 || finding.confidence !== "certain";

  return (
    <div className={`border-l-2 ${borderClass} bg-[var(--surface)] pl-3.5 pr-3.5 py-2.5 rounded-r-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white/70 leading-snug">{finding.title}</p>
          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{finding.explanation}</p>
        </div>
        {hasExpandable && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-white/40 hover:text-white/70 shrink-0 mt-0.5 transition-colors"
            aria-label={expanded ? "Collapse evidence" : "Show evidence"}
          >
            {expanded ? "Less" : "Evidence"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1">
          {finding.evidence.map((fact, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-white/40 w-28 shrink-0">{fact.label}</span>
              <span className="font-mono text-white/70">{fact.value}</span>
            </div>
          ))}

          {finding.confidence === "heuristic" && (
            <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
              Based on general training guidelines — coaches with specific rationale may reasonably differ.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
