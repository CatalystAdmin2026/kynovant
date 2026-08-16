"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import { Input, Select, Label, HelperText, FieldError, Button } from "@/components/ui";
import type { CoachCredential } from "@/lib/db/schema-coach-credentials";

interface Props {
  credential: CoachCredential | null;
  isExpired: boolean;
}

const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  rd: "Registered Dietitian (RD)",
  rdn: "Registered Dietitian Nutritionist (RDN)",
};

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────
// STATUS SUMMARY — read-only display of the coach's current record.
// ─────────────────────────────────────────────────────────────

function StatusSummary({ credential, isExpired: expired }: { credential: CoachCredential; isExpired: boolean }) {
  if (credential.status === "approved" && !expired) {
    return (
      <div className="flex items-start gap-3 border border-emerald-500/20 bg-emerald-500/[0.06] rounded-lg p-5">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-emerald-400">Verified</p>
          <p className="text-xs text-white/50 mt-1">
            {CREDENTIAL_TYPE_LABELS[credential.credentialType]} · {credential.issuingState} · expires{" "}
            {fmtDate(credential.expirationDate)}
          </p>
          <a
            href="/api/internal/hq/credentials/download"
            className="inline-block mt-2 text-xs text-white/40 underline underline-offset-2 hover:text-white/60"
          >
            View submitted proof
          </a>
        </div>
      </div>
    );
  }

  if (credential.status === "approved" && expired) {
    return (
      <div className="flex items-start gap-3 border border-amber-500/20 bg-amber-500/[0.06] rounded-lg p-5">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-amber-400">Credential expired</p>
          <p className="text-xs text-white/50 mt-1">
            Your {CREDENTIAL_TYPE_LABELS[credential.credentialType]} expired {fmtDate(credential.expirationDate)}.
            Submit an updated credential below to restore verified status.
          </p>
        </div>
      </div>
    );
  }

  if (credential.status === "pending") {
    return (
      <div className="flex items-start gap-3 border border-white/[0.08] bg-white/[0.03] rounded-lg p-5">
        <Clock className="w-4 h-4 text-white/40 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-white/70">Submitted — under review</p>
          <p className="text-xs text-white/40 mt-1">
            {CREDENTIAL_TYPE_LABELS[credential.credentialType]} · {credential.issuingState} · submitted{" "}
            {fmtDate(credential.submittedAt)}
          </p>
          <a
            href="/api/internal/hq/credentials/download"
            className="inline-block mt-2 text-xs text-white/40 underline underline-offset-2 hover:text-white/60"
          >
            View submitted proof
          </a>
        </div>
      </div>
    );
  }

  // rejected
  return (
    <div className="flex items-start gap-3 border border-red-500/20 bg-red-500/[0.06] rounded-lg p-5">
      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-red-400">Not approved</p>
        {credential.reviewNotes && (
          <p className="text-xs text-white/50 mt-1">{credential.reviewNotes}</p>
        )}
        <p className="text-xs text-white/40 mt-2">Submit an updated credential below to try again.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FORM
// ─────────────────────────────────────────────────────────────

export default function CredentialSubmissionForm({ credential, isExpired }: Props) {
  const router = useRouter();
  const [credentialType, setCredentialType] = useState("rd");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canResubmit =
    !credential || credential.status === "rejected" || (credential.status === "approved" && isExpired);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please attach proof of your credential.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("credentialType", credentialType);
      formData.set("licenseNumber", licenseNumber);
      formData.set("issuingState", issuingState);
      formData.set("expirationDate", expirationDate);
      formData.set("file", file);

      const res = await fetch("/api/internal/hq/credentials", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {credential && <StatusSummary credential={credential} isExpired={isExpired} />}

      {canResubmit && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label tone="dark" htmlFor="credentialType" required>
              Credential Type
            </Label>
            <Select
              id="credentialType"
              tone="dark"
              value={credentialType}
              onChange={(e) => setCredentialType(e.target.value)}
              required
            >
              <option value="rd">Registered Dietitian (RD)</option>
              <option value="rdn">Registered Dietitian Nutritionist (RDN)</option>
            </Select>
          </div>

          <div>
            <Label tone="dark" htmlFor="licenseNumber" required>
              License / Credential Number
            </Label>
            <Input
              id="licenseNumber"
              tone="dark"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="e.g. RD123456"
              required
              maxLength={100}
            />
          </div>

          <div>
            <Label tone="dark" htmlFor="issuingState" required>
              Issuing State / Jurisdiction
            </Label>
            <Input
              id="issuingState"
              tone="dark"
              value={issuingState}
              onChange={(e) => setIssuingState(e.target.value)}
              placeholder="e.g. Texas"
              required
              maxLength={100}
            />
          </div>

          <div>
            <Label tone="dark" htmlFor="expirationDate" required>
              Expiration Date
            </Label>
            <Input
              id="expirationDate"
              tone="dark"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              required
            />
          </div>

          <div>
            <Label tone="dark" htmlFor="proofFile" required>
              Proof of Credential
            </Label>
            <input
              id="proofFile"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-white/60 file:mr-4 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white/80 hover:file:bg-white/[0.12]"
              required
            />
            <HelperText tone="dark">PDF, PNG, JPEG, or WebP. Max 10MB.</HelperText>
          </div>

          <FieldError>{error}</FieldError>

          <Button type="submit" loading={submitting} disabled={submitting}>
            {credential ? "Resubmit for Review" : "Submit for Review"}
          </Button>

          <p className="text-xs text-white/25 leading-relaxed">
            Kynovant reviews submitted credentials before granting access to any future RD/RDN-restricted
            feature. We do not independently verify your license with the issuing board — review confirms
            the submission is complete and consistent, not that the license itself is currently active.
          </p>
        </form>
      )}
    </div>
  );
}
