import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { generateCoachCredentialProofUrl } from "@/lib/db/coach-credential-service";

export const dynamic = "force-dynamic";

// GET — redirects to a short-lived signed URL for the AUTHENTICATED
// coach's own proof document. No ID in the path — "my own credential"
// is the only thing this route can ever return, derived entirely from
// the session. There is nothing here for a coach to spoof to reach
// another coach's document.
export async function GET(_req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    const url = await generateCoachCredentialProofUrl(guard.dbUser.id);
    if (!url) {
      return NextResponse.json({ ok: false, error: "No credential on file" }, { status: 404 });
    }
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to generate download link" },
      { status: 500 },
    );
  }
}
