"use server";

// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Application Review Actions
//
// Server actions run on the server and can be called from Client
// Components. Auth is re-validated independently here because
// Server Actions bypass middleware/layouts — same pattern as
// app/hq/check-ins/[checkInId]/actions.ts, but requireAdmin()
// (not requireCoachOrAdmin()) since this pipeline is admin-only.
// ─────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  updateApplicationStatus,
  saveApplicationNotes,
} from "@/lib/db/application-service";
import type { ApplicationStatus } from "@/lib/db/schema-applications";

export async function updateApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };

  const result = await updateApplicationStatus(applicationId, status, guard.dbUser.id);

  if (result.ok) {
    revalidatePath(`/admin/growth/applications/${applicationId}`);
    revalidatePath("/admin/growth/applications");
  }

  return result;
}

export async function saveApplicationNotesAction(
  applicationId: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: "Unauthorized" };

  const result = await saveApplicationNotes(applicationId, notes, guard.dbUser.id);

  if (result.ok) {
    revalidatePath(`/admin/growth/applications/${applicationId}`);
  }

  return result;
}
