import { type NextRequest, NextResponse } from "next/server";
import { updateExerciseCue, deleteExerciseCue } from "@/lib/db/exercise-admin-service";
import type { ExerciseCueType } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cueId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id, cueId } = await params;

  try {
    const body = await req.json() as { content?: string; cueType?: string; isPublic?: boolean };
    const cue = await updateExerciseCue(cueId, id, {
      content: body.content?.trim(),
      cueType: body.cueType as ExerciseCueType | undefined,
      isPublic: body.isPublic,
    });
    return cue
      ? NextResponse.json({ ok: true, cue })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cueId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id, cueId } = await params;
  await deleteExerciseCue(cueId, id);
  return NextResponse.json({ ok: true });
}
