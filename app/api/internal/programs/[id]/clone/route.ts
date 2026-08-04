import { type NextRequest, NextResponse } from "next/server";
import { cloneProgramTemplate } from "@/lib/db/program-builder-service";
import {
  requireCoachOrAdmin,
  authorizeCoachProgramView,
  resolveTenantScope,
} from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/internal/programs/[id]/clone
// Deep-copies the program template (all weeks + day slots) as a new draft.
// Cloning only requires view rights on the source — own template, or any
// published (shared-library) template — never mutation rights, since the
// clone itself is a brand-new resource owned by the requesting coach.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachProgramView(guard.dbUser, id);
  if (deny) return deny;
  try {
    const { coachId } = resolveTenantScope(guard.dbUser);
    const clone = await cloneProgramTemplate(id, coachId);
    return NextResponse.json({ ok: true, template: clone }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Clone failed" },
      { status: 500 },
    );
  }
}
