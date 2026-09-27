import { NextResponse } from "next/server";
import { getPortalWorkoutResult } from "@/lib/db/client-program-service";
import { requireAuthenticatedUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;

  try {
    const result = await getPortalWorkoutResult(guard.authUser.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
