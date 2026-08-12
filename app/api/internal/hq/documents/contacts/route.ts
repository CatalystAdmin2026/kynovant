import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { listCoachClientsForSharing } from "@/lib/db/document-service";

export const dynamic = "force-dynamic";

// GET — this coach's own client roster, for the "share with" picker.
// Admin has no enrollments of its own, so it always returns empty —
// an honest empty state rather than a fabricated roster.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  try {
    const contacts = await listCoachClientsForSharing(guard.dbUser.id);
    return NextResponse.json({ ok: true, contacts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load clients" },
      { status: 500 },
    );
  }
}
