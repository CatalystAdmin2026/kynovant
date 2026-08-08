import { type NextRequest, NextResponse } from "next/server";
import { requireCoachOrAdmin } from "@/lib/auth/guards";
import { searchHq } from "@/lib/db/hq-search-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCoachOrAdmin();
  if (!guard.ok) return guard.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const result = await searchHq(guard.dbUser.id, query);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
