"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import MissionEntry from "@/components/portal/MissionEntry";
import PortalShell from "@/components/portal/PortalShell";
import MissionBriefing from "@/components/portal/MissionBriefing";
import MissionProgress from "@/components/portal/MissionProgress";
import MissionTile from "@/components/portal/MissionTile";
import MissionCompletePanel from "@/components/portal/MissionCompletePanel";
import MissionDebrief from "@/components/portal/MissionDebrief";
import PrototypeControls from "@/components/portal/PrototypeControls";
import { getScenarioData } from "@/lib/portal/mockData";
import type { PortalScenario } from "@/lib/portal/types";

type Phase = "entry" | "portal";

export default function PortalPreviewPage() {
  const [scenario, setScenario] = useState<PortalScenario>("default");
  const [phase, setPhase] = useState<Phase>("entry");

  // portalReady fires fresh each time the portal phase begins,
  // so dashboard entrance animations replay correctly after entry.
  const [portalReady, setPortalReady] = useState(false);

  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false
  );

  useEffect(() => {
    if (phase === "portal") {
      // rAF callback is async — fires after paint, triggering entrance animations
      requestAnimationFrame(() => setPortalReady(true));
    }
  }, [phase]);

  const data = getScenarioData(scenario);

  const allComplete = data.missions.every(
    (m) =>
      m.status === "completed" ||
      m.status === "not-scheduled" ||
      m.status === "locked"
  );

  function tileStyle(index: number): CSSProperties {
    if (reducedMotion) return {};
    return {
      opacity: portalReady ? 1 : 0,
      transform: portalReady ? "none" : "translateY(1rem)",
      transition: "opacity 350ms ease, transform 350ms ease",
      transitionDelay: `${index * 60 + 160}ms`,
    };
  }

  return (
    <>
      {/* ── Mission entry experience ───────────────────── */}
      {phase === "entry" && (
        <MissionEntry
          clientName={data.clientName}
          clientId="preview-dev-client"
          onComplete={() => setPhase("portal")}
        />
      )}

      {/* ── Portal dashboard ───────────────────────────── */}
      {phase === "portal" && (
        <PortalShell clientName={data.clientName}>
          {/* 1. Hero */}
          <MissionBriefing
            clientName={data.clientName}
            scenario={scenario}
            banner={data.banner}
            mounted={portalReady}
            reducedMotion={reducedMotion}
          />

          {/* 2. All-complete panel */}
          {allComplete && (
            <MissionCompletePanel
              stats={data.stats}
              clientName={data.clientName}
            />
          )}

          {/* 3. Mission tile grid */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
            aria-label="Today's missions"
          >
            {data.missions.map((mission, i) => (
              <div key={mission.id} style={tileStyle(i)}>
                <MissionTile mission={mission} />
              </div>
            ))}
          </div>

          {/* 4. Identity metrics + progress ring */}
          <MissionProgress missions={data.missions} stats={data.stats} />

          {/* 5. Coach debrief */}
          <MissionDebrief scenario={scenario} missions={data.missions} />

          {/* Prototype controls */}
          <PrototypeControls scenario={scenario} onScenarioChange={setScenario} />
        </PortalShell>
      )}
    </>
  );
}
