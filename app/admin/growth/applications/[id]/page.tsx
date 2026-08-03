// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Application Detail
//
// Server Component. Auth via app/admin/growth/layout.tsx
// (requireAdminPage) — admin-only. Returns 404 if the application
// ID does not exist.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { getApplicationById } from "@/lib/db/application-service";
import ApplicationReviewPanel from "@/components/admin/growth/ApplicationReviewPanel";

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

function Field({
  label,
  value,
  emptyLabel = "—",
}: {
  label: string;
  value: string | null;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] text-gray-500 uppercase tracking-[0.25em] font-semibold">
        {label}
      </p>
      <p className={`text-sm leading-relaxed ${value ? "text-gray-200" : "text-gray-600 italic"}`}>
        {value || emptyLabel}
      </p>
    </div>
  );
}

const LEGACY_FIELD_LABEL: Record<string, string> = {
  primaryGoal: "Primary Goal (fitness)",
  readiness: "Readiness (to start training)",
  goalsDetails: "Goals & Background",
  budgetRange: "Budget Range",
  referralName: "Referral Name",
};

export default async function AdminGrowthApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getApplicationById(id);

  if (!application) notFound();

  const isLegacy = application.source !== "coach_apply";
  const unavailableLabel = "Not available — legacy /apply submission";

  return (
    <div className="space-y-6">
      <HQBreadcrumbs
        crumbs={[
          { label: "Kynovant Admin" },
          { label: "Applications", href: "/admin/growth/applications" },
          { label: application.name },
        ]}
      />

      {isLegacy && (
        <div className="border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-[0.15em] mb-1">
            Legacy application — not a Kynovant coach application
          </p>
          <p className="text-amber-200/70 text-xs leading-relaxed">
            This row predates the /coach-apply intake (source: <code className="text-amber-300">{application.source}</code>).
            It was originally submitted as a personal coaching-client application, not a Kynovant SaaS
            application, so it does not appear in the main queue. Business Stage, Client Count, and Context
            are intentionally empty — this applicant was never asked those questions. Their original answers
            are preserved below under &quot;Archived Original Answers.&quot;
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold text-white mb-1">{application.name}</h1>
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
            <Field
              label="Business Stage"
              value={application.businessStage}
              emptyLabel={isLegacy ? unavailableLabel : "—"}
            />
            <Field
              label="Client Count"
              value={application.clientCount}
              emptyLabel={isLegacy ? unavailableLabel : "—"}
            />
            <Field label="Referral Source" value={application.referralSource} />
          </div>

          <div className="h-px bg-white/[0.06]" />

          <Field
            label="Context"
            value={application.context}
            emptyLabel={isLegacy ? unavailableLabel : "—"}
          />

          {isLegacy && application.legacyFields && (
            <>
              <div className="h-px bg-white/[0.06]" />
              <div className="space-y-3">
                <p className="text-[9px] text-amber-400/70 uppercase tracking-[0.25em] font-semibold">
                  Archived Original Answers
                </p>
                <div className="grid grid-cols-2 gap-5">
                  {Object.entries(application.legacyFields).map(([key, value]) => (
                    <Field
                      key={key}
                      label={LEGACY_FIELD_LABEL[key] ?? key}
                      value={typeof value === "string" ? value : String(value)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

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
