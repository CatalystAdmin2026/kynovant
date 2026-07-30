import { redirect } from "next/navigation";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import { listClientDocuments } from "@/lib/db/document-service";
import PortalShell from "@/components/portal/PortalShell";
import type { DocumentCategory } from "@/lib/db/schema-documents";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  meal_plan: "Meal Plan",
  training_guide: "Training Guide",
  technique_reference: "Technique Reference",
  posing_material: "Posing Material",
  progress_report: "Progress Report",
  educational: "Educational",
  agreement: "Agreement",
  other: "Resource",
};

export default async function DocumentsPage() {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") redirect("/admin");

  const [profile, assignments] = await Promise.all([
    getClientProfile(dbUser.id),
    listClientDocuments(dbUser.id),
  ]);

  const clientName = profile?.preferredName ?? profile?.fullName ?? "Client";

  return (
    <PortalShell clientName={clientName}>
      <div>
        <p className="text-[9px] text-white/22 uppercase tracking-[0.45em] mb-4">
          Resources
        </p>
        <h1
          className="text-white font-bold leading-tight mb-4"
          style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}
        >
          Your Coaching Library
        </h1>
        <p className="text-white/28 text-sm leading-relaxed max-w-sm mb-10">
          Your coach curates resources specific to where you are in your
          program — Meal Plans, training guides, technique references, and
          posing materials. Each one is shared at the right moment, not all at
          once.
        </p>

        {assignments.length === 0 ? (
          <div className="border-l-2 border-white/[0.07] pl-5 py-1">
            <p className="text-white/38 text-sm font-medium mb-2">
              No resources shared yet.
            </p>
            <p className="text-white/20 text-xs leading-relaxed max-w-xs">
              All coaching materials will appear here as your program
              progresses. Your library typically begins building in the first
              week of training.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {assignments.map((item) => (
              <li key={item.assignmentId}>
                <div className="border border-white/[0.07] rounded-lg px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-1">
                      {CATEGORY_LABELS[item.category]}
                      {item.required && (
                        <span className="ml-2 text-[#C9A24D]/70">Required</span>
                      )}
                    </p>
                    <p className="text-white text-sm font-medium truncate">
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-white/38 text-xs leading-relaxed mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-white/20 text-[10px]">
                        {item.originalFilename}
                      </span>
                      {item.viewedAt && (
                        <span className="text-white/20 text-[10px]">
                          Viewed
                        </span>
                      )}
                      {item.dueAt && (
                        <span className="text-white/20 text-[10px]">
                          Due{" "}
                          {new Date(item.dueAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
