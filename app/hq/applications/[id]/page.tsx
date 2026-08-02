// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Application Detail
//
// Server Component. Auth via HQ layout (requireCoachOrAdminPage).
// Returns 404 if the application ID does not exist.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { getApplicationById } from "@/lib/db/application-service";
import ApplicationReviewPanel from "@/components/hq/applications/ApplicationReviewPanel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  demo_scheduled: "Demo Scheduled",
  demo_complete: "Demo Complete",
  accepted: "Accepted",
  declined: "Declined",
};

const STATUS_COLOR: Record<string, string> = {
  new: "text-blue-400 border-blue-500/30",
  qualified: "text-sky-400 border-sky-500/30",
  demo_scheduled: "text-violet-400 border-violet-500/30",
  demo_complete: "text-amber-400 border-amber-500/30",
  accepted: "text-emerald-400 border-emerald-500/30",
  declined: "text-red-400 border-red-500/30",
};

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] text-gray-500 uppercase tracking-[0.25em] font-semibold">
        {label}
      </p>
      <p className="text-sm text-gray-200 leading-relaxed">{value || "—"}</p>
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getApplicationById(id);

  if (!application) notFound();

  return (
    <div className="space-y-6">
      <HQBreadcrumbs
        crumbs={[
          { label: "Mission Control", href: "/hq" },
          { label: "Applications", href: "/hq/applications" },
          { label: application.fullName },
        ]}
      />

      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">{application.fullName}</h1>
          <p className="text-gray-500 text-sm">{application.email}</p>
        </div>
        <span
          className={`text-[10px] border px-2.5 py-1 uppercase tracking-[0.2em] shrink-0 ${STATUS_COLOR[application.status]}`}
        >
          {STATUS_LABEL[application.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* Application detail */}
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Phone" value={application.phone} />
            <Field label="Primary Goal" value={application.primaryGoal} />
            <Field label="Readiness" value={application.readiness} />
            <Field label="Budget Range" value={application.budgetRange} />
            <Field label="Referral Source" value={application.referralSource} />
            <Field label="Referral Name" value={application.referralName} />
          </div>

          <div className="h-px bg-white/[0.06]" />

          <Field label="Goals & Background" value={application.goalsDetails} />

          <div className="h-px bg-white/[0.06]" />

          <div className="grid grid-cols-2 gap-5">
            <Field label="Submitted" value={fmtDateTime(application.createdAt)} />
            <Field label="Last Updated" value={fmtDateTime(application.updatedAt)} />
            <Field
              label="Google Sheet Sync"
              value={application.sheetSyncedAt ? `Synced ${fmtDateTime(application.sheetSyncedAt)}` : "Not synced"}
            />
            <Field label="Reviewed By" value={application.reviewedByName} />
            <Field
              label="Resubmissions"
              value={
                application.resubmissionCount > 0
                  ? `${application.resubmissionCount} — same open application updated in place, not duplicated`
                  : "None"
              }
            />
          </div>
        </div>

        {/* Review panel */}
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-6">
          <ApplicationReviewPanel
            applicationId={application.id}
            status={application.status}
            initialNotes={application.reviewNotes}
          />
        </div>
      </div>
    </div>
  );
}
