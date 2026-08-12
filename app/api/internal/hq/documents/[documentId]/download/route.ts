import { type NextRequest, NextResponse } from "next/server";
import { authorizeCoachDocumentMutation, requireCoachOrAdmin, resolveTenantScope } from "@/lib/auth/guards";
import { generateCoachDocumentUrl } from "@/lib/db/document-service";

export const dynamic = "force-dynamic";

// GET — redirects to a short-lived signed URL for this coach's own
// document. 404s (not 403) for a document this coach doesn't own.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  try {
    const { coachId } = resolveTenantScope(guard.dbUser);
    const url = await generateCoachDocumentUrl(documentId, coachId);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to generate download link" },
      { status: 500 },
    );
  }
}
