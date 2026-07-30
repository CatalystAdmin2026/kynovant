"use client";

import { useState, useEffect, use } from "react";
import AdminGate from "@/components/AdminGate";
import ProgramBuilder from "@/components/ProgramBuilder";
import type { ProgramBuilderData, BlueprintOption } from "@/components/ProgramBuilder";

export default function ProgramEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<ProgramBuilderData | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch(`/api/internal/programs/${id}`).then((r) => r.json()),
      fetch("/api/internal/workout-templates").then((r) => r.json()),
    ])
      .then(([programData, templatesData]: [
        { ok: boolean; template?: ProgramBuilderData["template"]; weeks?: ProgramBuilderData["weeks"]; error?: string },
        { ok: boolean; templates?: BlueprintOption[]; error?: string },
      ]) => {
        if (!mounted) return;
        if (programData.ok && programData.template) {
          setData({
            template: programData.template,
            weeks: programData.weeks ?? [],
          });
        } else {
          setError(programData.error ?? "Failed to load program");
        }
        if (templatesData.ok && templatesData.templates) {
          // Only show published (active) blueprints for assignment
          setBlueprints(
            templatesData.templates.filter((t) => t.status === "active"),
          );
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) { setError("Network error loading program"); setLoading(false); }
      });

    return () => { mounted = false; };
  }, [id]);

  return (
    <AdminGate>
      {loading && (
        <div className="min-h-screen bg-[#080909] flex items-center justify-center">
          <div className="text-gray-600 text-xs tracking-widest uppercase animate-pulse">Loading…</div>
        </div>
      )}
      {error && (
        <div className="min-h-screen bg-[#080909] flex items-center justify-center">
          <div className="text-red-400 text-sm">{error}</div>
        </div>
      )}
      {data && (
        <ProgramBuilder
          templateId={id}
          initialData={data}
          blueprints={blueprints}
        />
      )}
    </AdminGate>
  );
}
