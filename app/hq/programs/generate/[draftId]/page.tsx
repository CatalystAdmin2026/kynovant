// Kynovant HQ — AI Program Generator: Draft Review
// Auth: requireCoachOrAdminPage() + tenant-scoped ownership check via
// getOwnedDraft() — a coach who doesn't own this draft gets the same
// "not found" page as a nonexistent draftId (locked rule #10).

import { notFound } from "next/navigation";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getOwnedDraft } from "@/lib/db/program-generation-service";
import { parseGeneratedProgramDraft, parseProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import DraftReviewClient from "./DraftReviewClient";

export default async function DraftReviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const { dbUser } = await requireCoachOrAdminPage();
  const scope = resolveTenantScope(dbUser);

  const access = await getOwnedDraft(draftId, scope);
  if (!access.ok) notFound();

  const draft = access.draft;
  const parsedDraft = draft.draftJson ? parseGeneratedProgramDraft(draft.draftJson) : null;
  const parsedBrief = parseProgramGenerationBrief(draft.briefJson);

  return (
    <div className="max-w-5xl">
      <HQBreadcrumbs
        crumbs={[
          { label: "Overview", href: "/hq" },
          { label: "Programs", href: "/hq/programs" },
          { label: "Generate with AI", href: "/hq/programs/generate" },
          { label: parsedDraft?.ok ? parsedDraft.data.name : "Draft" },
        ]}
      />
      <DraftReviewClient
        draftId={draftId}
        status={draft.status}
        failureReason={draft.failureReason}
        draft={parsedDraft?.ok ? parsedDraft.data : null}
        draftContentInvalid={parsedDraft != null && !parsedDraft.ok}
        brief={parsedBrief.ok ? parsedBrief.data : null}
        insights={(draft.insightsJson as DraftValidationResult | null) ?? null}
        lastValidatedAt={draft.lastValidatedAt ? draft.lastValidatedAt.toISOString() : null}
        warningsAcknowledgedAt={draft.warningsAcknowledgedAt ? draft.warningsAcknowledgedAt.toISOString() : null}
        approvedAt={draft.approvedAt ? draft.approvedAt.toISOString() : null}
        createdProgramTemplateId={draft.createdProgramTemplateId}
      />
    </div>
  );
}
