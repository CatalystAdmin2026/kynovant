// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Credential Detail & Review
//
// Server Component. Auth via app/admin/credentials/layout.tsx
// (requireAdminPage) — admin-only. Returns 404 if the credential ID
// does not exist. Shows ONLY this one coach's submitted credential
// metadata — no other client/coach PII is queried or rendered here.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { getCredentialById, isExpired } from "@/lib/db/coach-credential-service";
import { users, coachProfiles } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import CredentialReviewPanel from "@/components/admin/credentials/CredentialReviewPanel";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  rd: "Registered Dietitian (RD)",
  rdn: "Registered Dietitian Nutritionist (RDN)",
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
      <p className="text-[9px] text-gray-500 uppercase tracking-[0.25em] font-semibold">{label}</p>
      <p className={`text-sm leading-relaxed ${value ? "text-gray-200" : "text-gray-600 italic"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

export default async function AdminCredentialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const credential = await getCredentialById(id);
  if (!credential) notFound();

  const db = getDb();
  const [coach] = await db
    .select({ email: users.email, displayName: coachProfiles.displayName })
    .from(users)
    .leftJoin(coachProfiles, eq(coachProfiles.userId, users.id))
    .where(eq(users.id, credential.coachId))
    .limit(1);

  const expired = credential.status === "approved" && isExpired(credential.expirationDate);

  return (
    <div className="space-y-6">
      <HQBreadcrumbs
        crumbs={[
          { label: "Kynovant Admin" },
          { label: "RD/RDN Credentials", href: "/admin/credentials" },
          { label: coach?.displayName ?? coach?.email ?? "Coach" },
        ]}
      />

      <div>
        <h1 className="text-xl font-semibold text-white mb-1">
          {coach?.displayName ?? "Coach"}
        </h1>
        <p className="text-gray-500 text-sm">{coach?.email}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="bg-[#0d0e0f] border border-white/[0.06] p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Credential Type" value={TYPE_LABEL[credential.credentialType]} />
            <Field label="License / Credential Number" value={credential.licenseNumber} />
            <Field label="Issuing State / Jurisdiction" value={credential.issuingState} />
            <Field
              label="Expiration Date"
              value={
                new Date(credential.expirationDate + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }) + (expired ? " (expired)" : "")
              }
            />
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="grid grid-cols-2 gap-5">
            <Field label="Submitted" value={fmtDateTime(credential.submittedAt)} />
            <Field
              label="Resubmissions"
              value={credential.resubmissionCount > 0 ? String(credential.resubmissionCount) : "None"}
            />
            <Field label="Last Reviewed" value={fmtDateTime(credential.reviewedAt)} />
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-[0.25em] font-semibold mb-2">
              Proof Document
            </p>
            <a
              href={`/api/internal/admin/credentials/${credential.id}/download`}
              className="inline-block text-sm text-[#C9A24D] hover:text-[#D4B56A] underline underline-offset-2"
            >
              {credential.proofDocumentFilename}
            </a>
            <p className="text-xs text-gray-600 mt-1">
              Opens a short-lived signed link. Confirms the submission is complete and consistent — this
              is not an independent verification with the issuing licensing board.
            </p>
          </div>
        </div>

        <div className="bg-[#0d0e0f] border border-white/[0.06] p-6">
          <CredentialReviewPanel
            credentialId={credential.id}
            status={credential.status}
            initialNotes={credential.reviewNotes}
          />
        </div>
      </div>
    </div>
  );
}
