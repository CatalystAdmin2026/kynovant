import { type NextRequest, NextResponse } from "next/server";
import {
  updateProgramWeek,
  deleteProgramWeek,
  setDayWorkout,
  clearDayWorkout,
} from "@/lib/db/program-builder-service";
import {
  requireCoachOrAdmin,
  authorizeCoachProgramWeekMutation,
  resolveTenantScope,
} from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; weekId: string }> };

// PUT /api/internal/programs/[id]/weeks/[weekId]
// Body: { label?, notes? }            → update week metadata
// Body: { dayOfWeek, workoutTemplateId, label?, notes? } → set day slot
// Body: { dayOfWeek, clear: true }    → clear day slot
export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { weekId } = await params;
  const deny = await authorizeCoachProgramWeekMutation(guard.dbUser, weekId);
  if (deny) return deny;
  try {
    const body = await req.json() as {
      label?: string;
      notes?: string | null;
      dayOfWeek?: number;
      workoutTemplateId?: string | null;
      clear?: boolean;
    };

    if (body.dayOfWeek !== undefined) {
      if (body.clear) {
        await clearDayWorkout(weekId, body.dayOfWeek);
        return NextResponse.json({ ok: true });
      }
      const { coachId } = resolveTenantScope(guard.dbUser);
      const day = await setDayWorkout(
        weekId,
        body.dayOfWeek,
        body.workoutTemplateId ?? null,
        body.label,
        body.notes,
        coachId,
      );
      return NextResponse.json({ ok: true, day });
    }

    const week = await updateProgramWeek(weekId, {
      label: body.label,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, week });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { weekId } = await params;
  const deny = await authorizeCoachProgramWeekMutation(guard.dbUser, weekId);
  if (deny) return deny;
  try {
    await deleteProgramWeek(weekId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
