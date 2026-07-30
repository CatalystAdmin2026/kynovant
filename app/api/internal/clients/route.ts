import { NextResponse } from "next/server";
import { listActiveClients } from "@/lib/db/client-program-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

// GET /api/internal/clients
// Returns all active/invited clients for the program Assign panel.
// Deliberately minimal — id + display name only.
export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const clients = await listActiveClients();
    return NextResponse.json({ ok: true, clients });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
