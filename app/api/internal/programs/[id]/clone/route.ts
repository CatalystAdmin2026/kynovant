import { type NextRequest, NextResponse } from "next/server";
import { cloneProgramTemplate } from "@/lib/db/program-builder-service";
import { requireCoachOrAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/internal/programs/[id]/clone
// Deep-copies the program template (all weeks + day slots) as a new draft.
// The human builder and AI generator both produce identical on-disk structures;
// clone gives both a base to start from.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  try {
    const coachId = guard.ok ? guard.dbUser.id : null;
    const clone = await cloneProgramTemplate(id, coachId);
    return NextResponse.json({ ok: true, template: clone }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Clone failed" },
      { status: 500 },
    );
  }
}
