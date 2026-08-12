import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { createDocumentWithUpload, listDocumentsWithStats } from "@/lib/db/document-service";
import { documentCategoryEnum, type DocumentCategory } from "@/lib/db/schema-documents";

export const dynamic = "force-dynamic";

// GET — this coach's own documents with assignment stats. Admin sees
// every document, unscoped (see listDocumentsWithStats's doc comment).
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    const coachId = guard.dbUser.role === "admin" ? null : guard.dbUser.id;
    const documents = await listDocumentsWithStats(coachId);
    return NextResponse.json({ ok: true, documents });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load documents" },
      { status: 500 },
    );
  }
}

// POST — upload a new document (multipart/form-data) and optionally
// share it with one or more of this coach's own clients in the same
// request. All server-side validated: title/category/file MIME/size
// (createDocumentWithUpload -> validateDocumentUpload), and every
// clientId is re-verified against this coach's own enrollments
// (assignDocument's own coachOwnsClient check) — a spoofed clientId
// in the request body is silently skipped, never honored.
export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin cannot upload documents (no coach identity to attribute them to)" },
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
    return NextResponse.json({ ok: false, error: "A file is required" }, { status: 400 });
  }

  const title = String(formData.get("title") ?? "");
  const description = formData.get("description");
  const category = String(formData.get("category") ?? "");

  if (!documentCategoryEnum.enumValues.includes(category as DocumentCategory)) {
    return NextResponse.json({ ok: false, error: `Invalid category: ${category}` }, { status: 400 });
  }

  let shareWithClientIds: string[] = [];
  const clientIdsRaw = formData.get("clientIds");
  if (typeof clientIdsRaw === "string" && clientIdsRaw.length > 0) {
    try {
      const parsed = JSON.parse(clientIdsRaw);
      if (Array.isArray(parsed)) {
        shareWithClientIds = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid clientIds" }, { status: 400 });
    }
  }

  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const result = await createDocumentWithUpload(
      {
        title,
        description: typeof description === "string" ? description : null,
        category: category as DocumentCategory,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBytes,
        shareWithClientIds,
      },
      guard.dbUser.id,
    );
    return NextResponse.json({
      ok: true,
      document: result.document,
      sharedCount: result.sharedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to upload document" },
      { status: 400 },
    );
  }
}
