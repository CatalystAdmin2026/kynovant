// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Documents
//
// Server Component shell (auth only) — all data fetching, upload,
// and sharing happen client-side in DocumentsClient so the list can
// refresh without a full page reload.
//
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate here.
// Every document-level operation is still independently authorized
// per-request by guards.ts's authorizeCoachDocumentMutation() in the
// API routes — this page's guard only confirms "a coach/admin is
// signed in," not which documents they may act on.
// ─────────────────────────────────────────────────────────────

import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import DocumentsClient from "@/components/hq/documents/DocumentsClient";
import { requireCoachOrAdminPage } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function HQDocumentsPage() {
  const { dbUser } = await requireCoachOrAdminPage();

  return (
    <div className="space-y-8">
      <HQBreadcrumbs crumbs={[{ label: "Overview", href: "/hq" }, { label: "Documents" }]} />
      <DocumentsClient isAdmin={dbUser.role === "admin"} />
    </div>
  );
}
