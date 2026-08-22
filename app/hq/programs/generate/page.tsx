// Kynovant HQ — AI Program Generator: Program Brief
// Auth: requireCoachOrAdminPage(). Entry point G — reachable from the
// Programs page ("Generate with AI") and from a client workspace with
// the client preselected via ?clientId=.

import { eq } from "drizzle-orm";
import { requireCoachOrAdminPage, assertCoachOwnsClient } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { clientProfiles } from "@/lib/db/schema";
import HQPageHeader from "@/components/hq/HQPageHeader";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import GenerateBriefForm from "./GenerateBriefForm";

// Explicit, not load-bearing on its own: Vercel Hobby's function
// duration default already equals its hard maximum (300s — verified
// against Vercel's docs, not assumed), so this can't raise the real
// ceiling on this plan. Set anyway so the number driving
// staged-generation.ts's GENERATION_TIME_BUDGET_MS is documented in
// the one place a future Pro-plan upgrade would actually need to
// reconsider it, rather than left as an implicit platform default.
export const maxDuration = 300;

export default async function GenerateProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { dbUser } = await requireCoachOrAdminPage();
  const { clientId: rawClientId } = await searchParams;

  let clientId: string | null = null;
  let clientName: string | null = null;

  if (rawClientId) {
    const ownership = await assertCoachOwnsClient(dbUser, rawClientId);
    if (ownership.ok) {
      clientId = rawClientId;
      const db = getDb();
      const rows = await db
        .select({ fullName: clientProfiles.fullName })
        .from(clientProfiles)
        .where(eq(clientProfiles.userId, rawClientId))
        .limit(1);
      clientName = rows[0]?.fullName ?? null;
    }
    // Ownership failure silently drops the preselection rather than
    // erroring the page — the coach can still generate a library-level
    // draft with no client attached.
  }

  return (
    <div className="max-w-3xl">
      <HQBreadcrumbs
        crumbs={[
          { label: "Overview", href: "/hq" },
          { label: "Programs", href: "/hq/programs" },
          { label: "Generate with AI" },
        ]}
      />
      <HQPageHeader
        title="Generate Program"
        subtitle={
          clientName
            ? `Drafting for ${clientName}. Kynovant Insights and your review still gate everything before it becomes a real Program.`
            : "Kynovant AI drafts a starting point. Nothing is created until you review, edit, and explicitly approve it."
        }
      />
      <GenerateBriefForm clientId={clientId} clientName={clientName} />
    </div>
  );
}
