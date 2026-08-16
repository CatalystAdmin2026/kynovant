import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { generateAdminCredentialProofUrl } from "@/lib/db/coach-credential-service";

export const dynamic = "force-dynamic";

// GET — admin-only signed URL for ANY coach's proof document, keyed
// by credentialId (admin has blanket review access by role — see
// lib/db/coach-credential-service.ts's header note). requireAdmin(),
// not requireCoachOrAdmin(): an ordinary coach must never reach this
// route at all, including for their own credential (they use
// /api/internal/hq/credentials/download instead, which cannot be
// pointed at another coach's row).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const url = await generateAdminCredentialProofUrl(id);
    if (!url) {
      return NextResponse.json({ ok: false, error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to generate download link" },
      { status: 500 },
    );
  }
}
