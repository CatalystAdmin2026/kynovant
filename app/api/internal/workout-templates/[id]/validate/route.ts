import { type NextRequest, NextResponse } from "next/server";
import { validateWorkoutTemplate } from "@/lib/db/workout-validator";
import { requireCoachOrAdmin, authorizeCoachWorkoutTemplateView } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachWorkoutTemplateView(guard.dbUser, id);
  if (deny) return deny;
  try {
    const result = await validateWorkoutTemplate(id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
