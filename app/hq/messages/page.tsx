// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Messages (conversation list)
//
// Server Component shell (auth only) — all data fetching/polling
// happens client-side in MessagesListClient so the list can refresh
// without a full page reload.
//
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate.
// ─────────────────────────────────────────────────────────────

import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import MessagesListClient from "@/components/hq/messages/MessagesListClient";
import { requireCoachOrAdminPage } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function HQMessagesPage() {
  const { dbUser } = await requireCoachOrAdminPage();

  return (
    <div className="space-y-8">
      <HQBreadcrumbs crumbs={[{ label: "Overview", href: "/hq" }, { label: "Messages" }]} />
      <MessagesListClient isAdmin={dbUser.role === "admin"} />
    </div>
  );
}
