"use client";

// Catalyst HQ — Program Builder
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate needed.

import { useState, useEffect, use } from "react";
import ProgramBuilder from "@/components/ProgramBuilder";
import type { ProgramBuilderData, BlueprintOption } from "@/components/ProgramBuilder";
import ProgramAuditPanel from "@/components/pil/ProgramAuditPanel";

export default function HQProgramEditorPage({
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
          setData({ template: programData.template, weeks: programData.weeks ?? [] });
        } else {
          setError(programData.error ?? "Failed to load program");
        }
        if (templatesData.ok && templatesData.templates) {
          setBlueprints(templatesData.templates.filter((t) => t.status === "active"));
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) { setError("Network error loading program"); setLoading(false); }
      });

    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-gray-600 text-xs tracking-widest uppercase animate-pulse">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <ProgramBuilder templateId={id} initialData={data} blueprints={blueprints} backHref="/hq/programs" />
      <div className="max-w-3xl">
        <ProgramAuditPanel programTemplateId={id} />
      </div>
    </div>
  );
}
