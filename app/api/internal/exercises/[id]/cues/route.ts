import { type NextRequest, NextResponse } from "next/server";
import { getExerciseCues } from "@/lib/db/exercise-service";
import { addExerciseCue } from "@/lib/db/exercise-admin-service";
import type { ExerciseCueType } from "@/lib/db/schema-exercise";
import { requireCoachOrAdmin, authorizeExerciseMutation, authorizeExerciseView } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseView(guard.dbUser, id);
  if (deny) return deny;
  const cues = await getExerciseCues(id, false); // coaches see all cues including non-public
  return NextResponse.json({ ok: true, cues });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseMutation(guard.dbUser, id);
  if (deny) return deny;

  try {
    const body = await req.json() as { cueType?: string; content?: string; isPublic?: boolean };
    if (!body.cueType) return NextResponse.json({ ok: false, error: "cueType is required" }, { status: 400 });
    if (!body.content?.trim()) return NextResponse.json({ ok: false, error: "content is required" }, { status: 400 });

    const cue = await addExerciseCue(id, {
      cueType: body.cueType as ExerciseCueType,
      content: body.content.trim(),
      isPublic: body.isPublic ?? true,
    });
    return NextResponse.json({ ok: true, cue }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
