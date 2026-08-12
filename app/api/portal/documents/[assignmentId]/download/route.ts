import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { generateClientDocumentUrl, recordDocumentView } from "@/lib/db/document-service";

export const dynamic = "force-dynamic";

// GET — redirects to a short-lived signed URL for one of THIS
// client's own active document assignments, and stamps viewedAt.
//
// This was the one missing piece in the pre-existing portal Documents
// page: it listed assignments but had no way to actually open a
// file. generateClientDocumentUrl() already enforces that assignmentId
// belongs to this clientId and is not revoked — a client can never
// reach another client's document this way.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;
  if (guard.dbUser.role !== "client") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { assignmentId } = await params;

  try {
    const url = await generateClientDocumentUrl(assignmentId, guard.dbUser.id);
    void recordDocumentView(assignmentId, guard.dbUser.id);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}
