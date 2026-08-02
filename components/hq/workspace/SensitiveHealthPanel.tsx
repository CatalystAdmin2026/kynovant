"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { type Severity } from "@/lib/ui/status";
import type { InjurySummary } from "@/lib/db/coach-client-workspace-service";

interface Props {
  medicalClearanceRequired: boolean;
  medicalClearanceReceived: boolean;
  physicianRestrictions: string | null;
  activeInjuries: InjurySummary[];
}

const SEVERITY_LABEL: Record<number, string> = {
  1: "Mild", 2: "Mild", 3: "Mild",
  4: "Moderate", 5: "Moderate", 6: "Moderate",
  7: "Significant", 8: "Significant",
  9: "Severe", 10: "Severe",
};

// Buckets the 1-10 injury severity scale into the shared Severity
// vocabulary (matching the Mild/Moderate/Significant/Severe label
// groups above), then maps that onto whichever Badge variant reads
// closest — Badge has no dedicated "high" (orange) tone, so caution
// and high both render as "warning".
function injurySeverity(severity: number): Severity {
  if (severity >= 9) return "critical";
  if (severity >= 7) return "high";
  if (severity >= 4) return "caution";
  return "ok";
}

const SEVERITY_BADGE_VARIANT: Record<Severity, BadgeVariant> = {
  ok: "neutral",
  caution: "warning",
  high: "warning",
  critical: "danger",
  unknown: "neutral",
};

function severityBadgeVariant(severity: number): BadgeVariant {
  return SEVERITY_BADGE_VARIANT[injurySeverity(severity)];
}

export default function SensitiveHealthPanel({
  medicalClearanceRequired,
  medicalClearanceReceived,
  physicianRestrictions,
  activeInjuries,
}: Props) {
  const [open, setOpen] = useState(false);

  const hasContent =
    medicalClearanceRequired ||
    physicianRestrictions ||
    activeInjuries.length > 0;

  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="ds-focus-ring group flex w-full items-center gap-3 rounded-md text-left"
        aria-expanded={open}
      >
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">
          Health &amp; Limitations — Sensitive
        </h2>
        <div className="h-px flex-1 bg-white/[0.04]" />
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-white/30 transition-colors duration-150 group-hover:text-white/60">
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {!hasContent ? (
            <p className="px-1 text-xs text-white/30">No health restrictions or limitations on file.</p>
          ) : (
            <>
              {/* Medical clearance */}
              {medicalClearanceRequired && (
                <div
                  className={`rounded-lg border px-4 py-3 ${
                    medicalClearanceReceived
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : "border-amber-500/25 bg-amber-500/[0.05]"
                  }`}
                >
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
                    Medical Clearance Required
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      medicalClearanceReceived ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {medicalClearanceReceived ? "Clearance received" : "Awaiting clearance"}
                  </p>
                </div>
              )}

              {/* Physician restrictions */}
              {physicianRestrictions && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
                    Physician Restrictions
                  </p>
                  <p className="text-sm leading-relaxed text-red-400/80">{physicianRestrictions}</p>
                </div>
              )}

              {/* Active injuries */}
              {activeInjuries.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
                    Active Injuries / Limitations ({activeInjuries.length})
                  </p>
                  <div className="space-y-2">
                    {activeInjuries.map((injury) => (
                      <div
                        key={injury.id}
                        className="rounded-lg border border-white/[0.06] bg-[#0d0e0f] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white">
                              {injury.conditionName ?? injury.description}
                            </p>
                            <p className="mt-0.5 text-[10px] text-white/40">
                              {injury.bodyRegion}
                              {injury.status && (
                                <> · <span className="capitalize">{injury.status}</span></>
                              )}
                            </p>
                            {injury.exerciseRestrictions && (
                              <p className="mt-1 text-[10px] italic text-amber-400/70">
                                Restrictions: {injury.exerciseRestrictions}
                              </p>
                            )}
                          </div>
                          {injury.severity !== null && (
                            <Badge
                              variant={severityBadgeVariant(injury.severity)}
                              size="sm"
                              tone="dark"
                              className="shrink-0"
                            >
                              {SEVERITY_LABEL[injury.severity] ?? "Unknown"} ({injury.severity}/10)
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
