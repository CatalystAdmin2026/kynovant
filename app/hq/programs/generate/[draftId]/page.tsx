// Kynovant HQ — AI Program Generator: Draft Review
// Auth: requireCoachOrAdminPage() + tenant-scoped ownership check via
// getOwnedDraft() — a coach who doesn't own this draft gets the same
// "not found" page as a nonexistent draftId (locked rule #10).

import { notFound } from "next/navigation";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import { getOwnedDraft, getLatestRun, listGenerationWeeks } from "@/lib/db/program-generation-service";
import { parseGeneratedProgramDraft, parseProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";
import { groupDraftFindings } from "@/lib/program-generator/findings-grouping";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import DraftReviewClient from "./DraftReviewClient";

// See app/hq/programs/generate/page.tsx's identical export for why
// this is explicit despite Hobby's default already sitting at its
// hard 300s maximum — resumeGenerationAction (this page's Retry
// button) runs the same staged generation loop as a fresh generation.
export const maxDuration = 300;

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

  // Staged-generation progress — only meaningful while status is
  // 'running' or 'failed' (a completed draft's weeks are already folded
  // into draftJson, but the per-week breakdown is still shown so the
  // coach can see how the draft was built and what, if anything, needed
  // a retry along the way).
  const [latestRun, generationWeeks] = await Promise.all([
    getLatestRun(draftId),
    listGenerationWeeks(draftId),
  ]);

  // Grouping is a pure, deterministic, in-memory transform over the same
  // insightsJson/draftJson this page already fetched — computed once
  // server-side per request, never per-finding, per review triage
  // requirement #8. See lib/program-generator/findings-grouping.ts.
  const insights = (draft.insightsJson as DraftValidationResult | null) ?? null;
  const grouped = groupDraftFindings(insights, parsedDraft?.ok ? parsedDraft.data : null);

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
        insights={insights}
        grouped={grouped}
        acknowledgedFindingKeys={Array.isArray(draft.acknowledgedFindingKeys) ? (draft.acknowledgedFindingKeys as string[]) : []}
        lastValidatedAt={draft.lastValidatedAt ? draft.lastValidatedAt.toISOString() : null}
        warningsAcknowledgedAt={draft.warningsAcknowledgedAt ? draft.warningsAcknowledgedAt.toISOString() : null}
        approvedAt={draft.approvedAt ? draft.approvedAt.toISOString() : null}
        createdProgramTemplateId={draft.createdProgramTemplateId}
        progress={
          latestRun
            ? {
                totalWeeks: latestRun.totalWeeks,
                completedWeeks: latestRun.completedWeeks,
                currentWeek: latestRun.currentWeek,
                currentDay: latestRun.currentDay,
                completedDays: latestRun.completedDays,
              }
            : null
        }
        generationWeeks={generationWeeks.map((w) => ({
          weekNumber: w.weekNumber,
          status: w.status,
        }))}
      />
    </div>
  );
}
