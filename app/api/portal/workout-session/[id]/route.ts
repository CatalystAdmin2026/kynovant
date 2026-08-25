import { type NextRequest, NextResponse } from "next/server";
import {
  getWorkoutSession,
  updateWorkoutSession,
} from "@/lib/db/workout-session-service";
import { requireAuthenticatedUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const data = await getWorkoutSession(id, guard.authUser.id);
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireAuthenticatedUser();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const body = await req.json() as {
      status?: "completed" | "skipped";
      clientNotes?: string | null;
    };

    const session = await updateWorkoutSession(id, guard.authUser.id, {
      status: body.status,
      clientNotes: body.clientNotes,
    });

    // [Independent review remediation — P2 cross-client finish response]
    // A nonexistent session id and another client's session are
    // indistinguishable here — same 404, same message, no mutation
    // either way — matching the GET handler's own existing contract
    // just above.
    if (!session) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
