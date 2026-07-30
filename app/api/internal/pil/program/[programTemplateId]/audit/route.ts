// POST /api/internal/pil/program/[programTemplateId]/audit
//
// Runs the full Program audit (M15–M17, M32) for a given Program Template.
// Auth: requireCoachOrAdmin — coachId from session, not request body.
// Returns ProgramAuditResult.

import { NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { getProgramAudit } from "@/lib/pil/program-audit";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ programTemplateId: string }> },
) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const { programTemplateId } = await params;
  const coachId = guard.dbUser.id;

  try {
    const result = await getProgramAudit(programTemplateId, coachId);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
