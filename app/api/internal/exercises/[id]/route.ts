import { type NextRequest, NextResponse } from "next/server";
import { getExerciseWithDetails } from "@/lib/db/exercise-service";
import { updateExercise, publishExercise, archiveExercise, restoreExercise, deleteExercise } from "@/lib/db/exercise-admin-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  try {
    const exercise = await getExerciseWithDetails(id, {
      id: guard.dbUser.id,
      role: guard.dbUser.role === "admin" ? "admin" : "coach",
    });
    if (!exercise) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, exercise });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load exercise",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const body = await req.json() as { action?: string } & Record<string, unknown>;

    if (body.action === "publish") {
      const exercise = await publishExercise(id);
      return exercise
        ? NextResponse.json({ ok: true, exercise })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (body.action === "archive") {
      const exercise = await archiveExercise(id);
      return exercise
        ? NextResponse.json({ ok: true, exercise })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (body.action === "restore") {
      const exercise = await restoreExercise(id);
      return exercise
        ? NextResponse.json({ ok: true, exercise })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { action: _action, ...patch } = body;
    const exercise = await updateExercise(id, patch);
    return exercise
      ? NextResponse.json({ ok: true, exercise })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const result = await deleteExercise(id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
