import { NextResponse } from "next/server";
import { getRecentlyUsedExercises } from "@/lib/db/exercise-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  try {
    const exercises = await getRecentlyUsedExercises(12);
    return NextResponse.json({ ok: true, exercises });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
