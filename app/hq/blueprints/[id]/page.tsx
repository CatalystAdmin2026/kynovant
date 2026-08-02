"use client";

// Catalyst HQ — Blueprint Editor
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate needed.

import { useState, useEffect } from "react";
import { use } from "react";
import BlueprintEditor from "@/components/BlueprintEditor";
import type { BlueprintData } from "@/components/BlueprintEditor";
import BlueprintAuditPanel from "@/components/pil/BlueprintAuditPanel";
import { Skeleton, EmptyState } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

export default function HQBlueprintEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<BlueprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/internal/workout-templates/${id}`)
      .then((r) => r.json())
      .then(
        (res: {
          ok: boolean;
          template?: BlueprintData["template"];
          sections?: BlueprintData["sections"];
          unsectioned?: BlueprintData["unsectioned"];
          error?: string;
        }) => {
          if (!mounted) return;
          if (res.ok && res.template) {
            setData({ template: res.template, sections: res.sections ?? [], unsectioned: res.unsectioned ?? [] });
          } else {
            setError(res.error ?? "Failed to load blueprint");
          }
          setLoading(false);
        },
      )
      .catch(() => {
        if (mounted) { setError("Network error loading blueprint"); setLoading(false); }
      });
    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080909]">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6 space-y-3">
          <Skeleton tone="dark" height="h-14" rounded="sm" />
          <Skeleton tone="dark" height="h-40" rounded="sm" />
          <Skeleton tone="dark" height="h-64" rounded="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080909] flex items-center justify-center py-32">
        <EmptyState
          tone="dark"
          icon={<AlertTriangle size={18} />}
          title="Couldn't load this blueprint"
          description={error}
        />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <BlueprintEditor templateId={id} initialData={data} backHref="/hq/blueprints" />
      <div className="max-w-4xl mx-auto px-4">
        <BlueprintAuditPanel templateId={id} />
      </div>
    </div>
  );
}
