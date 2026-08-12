import { type NextRequest, NextResponse } from "next/server";
import { authorizeCoachDocumentMutation, requireCoachOrAdmin } from "@/lib/auth/guards";
import { archiveDocument, deleteDocument, updateDocument } from "@/lib/db/document-service";
import { documentCategoryEnum, type DocumentCategory } from "@/lib/db/schema-documents";

export const dynamic = "force-dynamic";

// PATCH — update title/description/category, or archive (status:
// "archived"). 404s for a document this coach doesn't own — never
// distinguishes "doesn't exist" from "not yours".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  let body: { title?: string; description?: string | null; category?: string; archive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (body.category !== undefined && !documentCategoryEnum.enumValues.includes(body.category as DocumentCategory)) {
    return NextResponse.json({ ok: false, error: `Invalid category: ${body.category}` }, { status: 400 });
  }
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ ok: false, error: "Title cannot be empty" }, { status: 400 });
  }

  try {
    if (body.archive) {
      await archiveDocument(documentId);
    } else {
      await updateDocument(documentId, {
        title: body.title,
        description: body.description,
        category: body.category as DocumentCategory | undefined,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update document" },
      { status: 500 },
    );
  }
}

// DELETE — hard delete. Only succeeds when the document has zero
// assignment history (document-service.ts's deleteDocument() throws
// otherwise) — the client should archive instead in that case.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { documentId } = await params;
  const deny = await authorizeCoachDocumentMutation(guard.dbUser, documentId);
  if (deny) return deny;

  try {
    await deleteDocument(documentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete document" },
      { status: 400 },
    );
  }
}
