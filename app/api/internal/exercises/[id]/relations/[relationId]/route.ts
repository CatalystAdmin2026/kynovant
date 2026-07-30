import { type NextRequest, NextResponse } from "next/server";
import { deleteExerciseRelation } from "@/lib/db/exercise-admin-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; relationId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id, relationId } = await params;
  await deleteExerciseRelation(relationId, id);
  return NextResponse.json({ ok: true });
}
