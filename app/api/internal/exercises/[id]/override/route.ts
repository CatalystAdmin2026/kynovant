import { type NextRequest, NextResponse } from "next/server";
import { upsertCoachOverride } from "@/lib/db/exercise-service";
import { requireCoachOrAdmin, authorizeExerciseView } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeExerciseView(guard.dbUser, id);
  if (deny) return deny;

  try {
    const body = await req.json() as { defaultPrescription?: unknown; privateNotes?: string | null };
    const override = await upsertCoachOverride(id, guard.dbUser.id, {
      defaultPrescription: body.defaultPrescription,
      privateNotes: body.privateNotes,
    });
    return NextResponse.json({ ok: true, override });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
