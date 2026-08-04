import { type NextRequest, NextResponse } from "next/server";
import { importProgramSpec, type ImportProgramSpecInput } from "@/lib/db/program-builder-service";
import {
  requireCoachOrAdmin,
  authorizeCoachProgramMutation,
  resolveTenantScope,
} from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/internal/programs/[id]/import
//
// AI seam — accepts a declarative program spec and atomically writes
// the week/day structure. The data shape is identical to what the
// manual builder produces incrementally; this route lets an AI generator
// populate the same builder in one call with no architectural changes.
//
// Body: {
//   clearExisting?: boolean   — wipe current weeks before writing (default true)
//   weeks: {
//     weekNumber: number
//     label?: string
//     notes?: string
//     days: {
//       dayOfWeek: number          — 0=Sun … 6=Sat
//       workoutTemplateId: string  — must exist; null = rest day (can be omitted)
//       label?: string
//       notes?: string
//     }[]
//   }[]
// }
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const deny = await authorizeCoachProgramMutation(guard.dbUser, id);
  if (deny) return deny;
  try {
    const body = await req.json() as Partial<ImportProgramSpecInput>;

    if (!Array.isArray(body.weeks) || body.weeks.length === 0) {
      return NextResponse.json(
        { ok: false, error: "weeks array is required and must be non-empty" },
        { status: 400 },
      );
    }

    const { coachId } = resolveTenantScope(guard.dbUser);
    const result = await importProgramSpec(
      id,
      {
        clearExisting: body.clearExisting !== false, // default true
        weeks: body.weeks,
      },
      coachId,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
