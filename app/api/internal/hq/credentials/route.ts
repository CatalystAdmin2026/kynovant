import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import {
  submitCredential,
  uploadCredentialProof,
  validateCredentialSubmission,
  MAX_PROOF_DOCUMENT_SIZE_BYTES,
} from "@/lib/db/coach-credential-service";

export const dynamic = "force-dynamic";

// POST — submit (or resubmit/renew) this coach's own RD/RDN
// credential. multipart/form-data: credentialType, licenseNumber,
// issuingState, expirationDate, file.
//
// coachId is taken ONLY from the authenticated guard — never from the
// request body. There is no field in this route's input shape a
// caller could use to submit a credential on another coach's behalf.
export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin has no coach identity to submit a credential for." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Proof of credential is required" }, { status: 400 });
  }

  const input = {
    credentialType: String(formData.get("credentialType") ?? ""),
    licenseNumber: String(formData.get("licenseNumber") ?? "").trim(),
    issuingState: String(formData.get("issuingState") ?? "").trim(),
    expirationDate: String(formData.get("expirationDate") ?? ""),
  };

  const validation = validateCredentialSubmission(input, {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (fileBytes.byteLength > MAX_PROOF_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json({ ok: false, error: "Proof document must be 10MB or smaller." }, { status: 400 });
    }

    const proof = await uploadCredentialProof(guard.dbUser.id, {
      bytes: fileBytes,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: fileBytes.byteLength,
    });

    const result = await submitCredential(guard.dbUser.id, input, proof);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, credentialId: result.credentialId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to submit credential" },
      { status: 500 },
    );
  }
}
