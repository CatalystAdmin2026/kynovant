// ─────────────────────────────────────────────────────────────
// Catalyst Portal — Messages
//
// A client has exactly one active thread: the conversation with
// their current coach (resolved the same way the rest of the portal
// resolves "my coach" — most recent coaching_enrollments row). No
// conversation list is shown because there is never more than one.
//
// Server Component shell (auth only) — thread content/polling/
// sending happens client-side in PortalMessagesClient.
// ─────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import PortalShell from "@/components/portal/PortalShell";
import PortalMessagesClient from "@/components/portal/PortalMessagesClient";

export const dynamic = "force-dynamic";

export default async function PortalMessagesPage() {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") redirect("/admin");

  const profile = await getClientProfile(dbUser.id);
  const clientName = profile?.preferredName ?? profile?.fullName ?? "Client";

  return (
    <PortalShell clientName={clientName}>
      <div className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col">
        <p className="mb-4 text-[9px] text-white/22 uppercase tracking-[0.45em]">Messages</p>
        <PortalMessagesClient />
      </div>
    </PortalShell>
  );
}
