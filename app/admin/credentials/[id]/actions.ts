"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Credential Review Actions
//
// Server Actions bypass middleware/layouts, so auth is re-validated
// independently here — same pattern as
// app/admin/growth/applications/[id]/actions.ts. requireAdmin(), not
// requireCoachOrAdmin(): a coach must never reach these, including
// approving/rejecting their OWN submission by calling this action
// directly (Server Actions are reachable by ID even without a UI
// affordance — the guard, not the missing button, is what stops
// that).
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { reviewCredential } from "@/lib/db/coach-credential-service";

export async function reviewCredentialAction(
  credentialId: string,
  decision: "approved" | "rejected",
  reviewNotes: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };

  // reviewedBy is ALWAYS the authenticated admin's own id — never a
  // value the caller supplies. There is no parameter here a caller
  // could use to attribute a review to a different admin.
  const result = await reviewCredential(
    credentialId,
    guard.dbUser.id,
    decision,
    reviewNotes.trim() || null,
  );

  if (result.ok) {
    revalidatePath(`/admin/credentials/${credentialId}`);
    revalidatePath("/admin/credentials");
  }

  return result;
}
