import { type NextRequest, NextResponse } from "next/server";
import { deleteExerciseMuscle } from "@/lib/db/exercise-admin-service";
import { requireCoachOrAdmin, authorizeExerciseMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; muscleId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id, muscleId } = await params;
  const deny = await authorizeExerciseMutation(guard.dbUser, id);
  if (deny) return deny;
  const result = await deleteExerciseMuscle(id, muscleId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
