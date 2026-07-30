"use client";

import { useState } from "react";
import MissionEntry from "@/components/portal/MissionEntry";
import { SCENARIO_LABELS } from "@/lib/portal/mockData";
import { getScenarioData } from "@/lib/portal/mockData";
import type { PortalScenario } from "@/lib/portal/types";

type Phase = "entry" | "arrived";

const SCENARIOS = Object.keys(SCENARIO_LABELS) as PortalScenario[];

export default function MissionEntryPreviewPage() {
  const [scenario, setScenario] = useState<PortalScenario>("default");
  const [phase, setPhase] = useState<Phase>("entry");

  const data = getScenarioData(scenario);

  function replay() {
    setPhase("entry");
  }

  return (
    <>
      {/* ── Entry flow ──────────────────────────────────── */}
      {phase === "entry" && (
        <MissionEntry
          clientName={data.clientName}
          clientId="preview-dev-client"
          onComplete={() => setPhase("arrived")}
        />
      )}

      {/* ── Post-entry: portal arrived confirmation ─────── */}
      {phase === "arrived" && (
        <div className="min-h-screen bg-[#080909] flex flex-col items-center justify-center px-6 gap-10">
          {/* Confirmation */}
          <div className="flex flex-col items-center text-center gap-4 max-w-sm">
            <div className="w-6 h-[2px] bg-[#c9a24d]/50" aria-hidden />
            <h2 className="font-headline text-4xl uppercase tracking-[0.06em] text-white leading-none">
              Portal Reached
            </h2>
            <p className="text-sm text-white/40 leading-relaxed">
              {data.clientName} entered the dashboard. In production, the portal
              dashboard would render here.
            </p>
            <button
              type="button"
              onClick={replay}
              className="mt-2 px-6 py-3 text-[11px] font-bold tracking-[0.14em] uppercase text-black bg-[#c9a24d] hover:bg-[#d4b56a] transition-colors min-h-[44px]"
            >
              Replay Entry &rarr;
            </button>
          </div>

          {/* Scenario switcher */}
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <p className="text-[10px] text-white/25 font-semibold tracking-[0.14em] uppercase">
              Test Scenario
            </p>
            <div className="flex flex-col gap-1 w-full">
              {SCENARIOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setScenario(s);
                    setPhase("entry");
                  }}
                  className={`w-full px-4 py-2.5 text-left text-xs rounded-sm transition-colors ${
                    s === scenario
                      ? "bg-[#c9a24d]/12 text-[#c9a24d] font-semibold"
                      : "text-white/40 hover:text-white/65 hover:bg-white/[0.04]"
                  }`}
                >
                  {SCENARIO_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
