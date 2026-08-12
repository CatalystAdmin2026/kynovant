import { type NextRequest, NextResponse } from "next/server";
import { authorizeCoachDocumentMutation, requireCoachOrAdmin } from "@/lib/auth/guards";
import { revokeAssignment } from "@/lib/db/document-service";

export const dynamic = "force-dynamic";

// DELETE — revoke a client's access to this document. The client
// immediately loses portal access; the source document is unaffected.
//
// documentId in the URL is authorized via authorizeCoachDocumentMutation
// (route-layer guard); revokeAssignment() ALSO independently re-verifies
// that assignmentId's own document belongs to this coach — so a coach
// can't revoke an assignment by pairing their own documentId in the URL
// with another coach's assignmentId in the path.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ documentId: string; assignmentId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: false, error: "Admin cannot revoke access" }, { status: 403 });
  }

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  const { assignmentId } = await params;
  const revoked = await revokeAssignment(assignmentId, guard.dbUser.id);
  if (!revoked) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
