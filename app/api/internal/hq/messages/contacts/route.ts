import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { listMessagingContacts } from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

// GET — this coach's own client roster, for the "new message" picker.
// Admin has no enrollments of its own, so it always returns empty —
// an honest empty state rather than a fabricated roster.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  if (guard.dbUser.role === "admin") {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  try {
    const contacts = await listMessagingContacts(guard.dbUser.id);
    return NextResponse.json({ ok: true, contacts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load contacts" },
      { status: 500 },
    );
  }
}
