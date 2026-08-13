import { type NextRequest, NextResponse } from "next/server";
import { toggleExerciseFavorite } from "@/lib/db/exercise-service";
import { requireCoachOrAdmin, authorizeExerciseView } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseView(guard.dbUser, id);
  if (deny) return deny;

  try {
    const result = await toggleExerciseFavorite(id, guard.dbUser.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
