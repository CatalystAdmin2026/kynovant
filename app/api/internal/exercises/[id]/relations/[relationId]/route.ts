import { type NextRequest, NextResponse } from "next/server";
import { deleteExerciseRelation } from "@/lib/db/exercise-admin-service";
import { requireCoachOrAdmin, authorizeExerciseMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; relationId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id, relationId } = await params;
  const deny = await authorizeExerciseMutation(guard.dbUser, id);
  if (deny) return deny;
  await deleteExerciseRelation(relationId, id);
  return NextResponse.json({ ok: true });
}
