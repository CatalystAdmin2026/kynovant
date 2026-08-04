import { type NextRequest, NextResponse } from "next/server";
import { copyProgramWeek } from "@/lib/db/program-builder-service";
import { requireCoachOrAdmin, authorizeCoachProgramWeekMutation } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; weekId: string }> };

// POST /api/internal/programs/[id]/weeks/[weekId]/copy
// Appends a copy of the given week at the end of the program,
// preserving all day/blueprint assignments.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { weekId } = await params;
  const deny = await authorizeCoachProgramWeekMutation(guard.dbUser, weekId);
  if (deny) return deny;
  try {
    const week = await copyProgramWeek(weekId);
    return NextResponse.json({ ok: true, week }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Copy failed" },
      { status: 500 },
    );
  }
}
