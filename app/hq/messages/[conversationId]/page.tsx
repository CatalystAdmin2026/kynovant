// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Message Thread
//
// Server Component shell (auth + ownership check only) — thread
// content, polling, and sending happen client-side in
// MessageThreadClient.
//
// Access is re-verified here via checkConversationAccess so a coach
// can never reach another coach's thread by guessing/pasting a URL —
// notFound() on any failure, matching this app's "Not found" (never
// "Forbidden") posture for cross-tenant resources.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import MessageThreadClient from "@/components/hq/messages/MessageThreadClient";
import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import { checkConversationAccess } from "@/lib/db/messaging-service";

export const dynamic = "force-dynamic";

export default async function HQMessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { dbUser } = await requireCoachOrAdminPage();
  const { conversationId } = await params;

  const role = dbUser.role === "admin" ? "admin" : "coach";
  const access = await checkConversationAccess(conversationId, dbUser.id, role);
  if (!access.ok) notFound();

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col lg:h-[calc(100vh-5rem)]">
      <HQBreadcrumbs
        crumbs={[{ label: "Overview", href: "/hq" }, { label: "Messages", href: "/hq/messages" }, { label: "Thread" }]}
      />
      <MessageThreadClient conversationId={conversationId} isAdmin={dbUser.role === "admin"} />
    </div>
  );
}
