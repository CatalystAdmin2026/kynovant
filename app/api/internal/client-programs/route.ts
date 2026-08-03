import { type NextRequest, NextResponse } from "next/server";
import {
  assignProgram,
  listAllActiveAssignments,
} from "@/lib/db/client-program-service";
import { requireCoachOrAdmin, resolveTenantScope, authorizeCoachClientAccess } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { coachId } = resolveTenantScope(guard.dbUser);
    const assignments = await listAllActiveAssignments(coachId);
    return NextResponse.json({ ok: true, assignments });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json() as {
      clientId?: string;
      programTemplateId?: string;
      startDate?: string;
      enrollmentId?: string | null;
      coachNotes?: string | null;
      overrideAllowMultiple?: boolean;
    };

    if (!body.clientId) {
      return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    }
    if (!body.programTemplateId) {
      return NextResponse.json(
        { ok: false, error: "programTemplateId is required" },
        { status: 400 },
      );
    }
    if (!body.startDate) {
      return NextResponse.json({ ok: false, error: "startDate is required" }, { status: 400 });
    }

    const deny = await authorizeCoachClientAccess(guard.dbUser, body.clientId);
    if (deny) return deny;

    const { coachId } = resolveTenantScope(guard.dbUser);
    const result = await assignProgram({
      clientId: body.clientId,
      programTemplateId: body.programTemplateId,
      startDate: body.startDate,
      enrollmentId: body.enrollmentId,
      coachNotes: body.coachNotes,
      overrideAllowMultiple: body.overrideAllowMultiple,
      coachId,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, assignment: result.assignment }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
