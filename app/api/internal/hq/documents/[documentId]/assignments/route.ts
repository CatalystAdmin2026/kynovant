import { type NextRequest, NextResponse } from "next/server";
import { authorizeCoachDocumentMutation, requireCoachOrAdmin } from "@/lib/auth/guards";
import { assignDocument, listDocumentAssignments } from "@/lib/db/document-service";

export const dynamic = "force-dynamic";

// GET — every assignment (active + revoked) for this document, for
// the "Manage Sharing" panel. 404s for a document this coach doesn't own.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  try {
    const assignments = await listDocumentAssignments(documentId);
    return NextResponse.json({ ok: true, assignments });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load assignments" },
      { status: 500 },
    );
  }
}

// POST — share this document with one or more clients. Each clientId
// is independently verified against this coach's own enrollments by
// assignDocument() itself — a clientId belonging to another coach is
// rejected, not silently ignored, so the caller can see exactly which
// shares succeeded and which didn't.
export async function POST(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: false, error: "Admin cannot share documents" }, { status: 403 });
  }

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  let body: { clientIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const clientIds = Array.isArray(body.clientIds)
    ? [...new Set(body.clientIds.filter((v): v is string => typeof v === "string"))]
    : [];
  if (clientIds.length === 0) {
    return NextResponse.json({ ok: false, error: "clientIds is required" }, { status: 400 });
  }

  const results: { clientId: string; ok: boolean; error?: string }[] = [];
  for (const clientId of clientIds) {
    try {
      await assignDocument(documentId, clientId, guard.dbUser.id);
      results.push({ clientId, ok: true });
    } catch (err) {
      results.push({ clientId, ok: false, error: err instanceof Error ? err.message : "Failed" });
    }
  }

  return NextResponse.json({ ok: true, results });
}
