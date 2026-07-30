import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { healthProfiles } from "@/lib/db/schema-profile";
import { getCoachClientWorkspace } from "@/lib/db/coach-client-workspace-service";
import {
  getActiveTarget,
  getDraftTargets,
  getTargetHistory,
} from "@/lib/db/nutrition-target-service";
import { ageFromDob, suggestActivityLevel } from "@/lib/nutrition/calculator";
import NutritionTargetEditor from "@/components/hq/nutrition/NutritionTargetEditor";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  fat_loss:               "Fat Loss",
  muscle_gain:            "Muscle Gain",
  body_recomposition:     "Body Recomposition",
  strength:               "Strength",
  athletic_performance:   "Athletic Performance",
  general_health:         "General Health",
  mobility:               "Mobility",
  competition_prep:       "Competition Prep",
  reverse_diet:           "Reverse Diet",
  maintenance:            "Maintenance",
  executive_performance:  "Executive Performance",
  custom:                 "Custom",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d instanceof Date ? d : d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function ClientNutritionPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [workspace, activeTarget, draftTargets, history] = await Promise.all([
    getCoachClientWorkspace(clientId),
    getActiveTarget(clientId),
    getDraftTargets(clientId),
    getTargetHistory(clientId),
  ]);

  if (!workspace) notFound();

  const displayName = workspace.preferredName ?? workspace.fullName;
  const firstName   = displayName.split(" ")[0];

  const weightLbs = workspace.bodyComposition.latest?.weightPounds ?? null;
  const goalType  = workspace.goals[0]?.goalType ?? null;

  const db = getDb();
  const [health] = await db
    .select({
      heightInches: healthProfiles.heightInches,
      biologicalSex: healthProfiles.biologicalSex,
      dateOfBirth: healthProfiles.dateOfBirth,
    })
    .from(healthProfiles)
    .where(eq(healthProfiles.clientId, clientId))
    .limit(1);

  const heightInches = health?.heightInches ? parseFloat(String(health.heightInches)) : null;
  const ageYears     = ageFromDob(health?.dateOfBirth ?? null);
  const biologicalSex = (health?.biologicalSex as "male" | "female" | "unspecified" | null) ?? null;
  const suggestedActivityLevel = suggestActivityLevel(null);

  const calcProfile = {
    heightInches,
    weightLbs,
    ageYears,
    biologicalSex,
    suggestedActivityLevel,
    goalType,
  };

  const canCalculate = !!(heightInches && weightLbs && ageYears);

  const missingFields: string[] = [];
  if (!heightInches)        missingFields.push("height");
  if (!weightLbs)           missingFields.push("body weight");
  if (!ageYears)            missingFields.push("date of birth");

  const archivedTargets = history.filter((t) => t.status === "archived");

  return (
    <div className="min-h-screen bg-[#070809] text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Breadcrumbs */}
        <HQBreadcrumbs
          crumbs={[
            { label: "Mission Control", href: "/hq" },
            { label: "Clients", href: "/hq/clients" },
            { label: displayName, href: `/hq/clients/${clientId}` },
            { label: "Nutrition" },
          ]}
        />

        {/* ── Client Hero ──────────────────────────────────────────── */}
        <div className="mt-10 mb-10">

          {/* Back link */}
          <div className="flex items-center justify-between mb-8">
            <p className="text-[9px] text-white/18 uppercase tracking-[0.5em]">Nutrition</p>
            <Link
              href={`/hq/clients/${clientId}`}
              className="text-[10px] text-white/20 hover:text-white/45 transition-colors"
            >
              ← {firstName}&apos;s workspace
            </Link>
          </div>

          {/* Name */}
          <h1 className="text-3xl font-light tracking-tight text-white mb-5">
            {displayName}
          </h1>

          {/* Profile stats row */}
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 mb-6">
            {goalType && (
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-[3px] rounded-full bg-[#C9A24D]/50 shrink-0" />
                <p className="text-xs text-white/50">
                  {GOAL_LABELS[goalType] ?? goalType}
                </p>
              </div>
            )}
            {weightLbs && (
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-[3px] rounded-full bg-white/15 shrink-0" />
                <p className="text-xs text-white/35">
                  {Math.round(weightLbs)} lbs
                </p>
              </div>
            )}
            {heightInches && (
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-[3px] rounded-full bg-white/15 shrink-0" />
                <p className="text-xs text-white/35">
                  {Math.floor(heightInches / 12)}&prime; {Math.round(heightInches % 12)}&Prime;
                </p>
              </div>
            )}
            {ageYears && (
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-[3px] rounded-full bg-white/15 shrink-0" />
                <p className="text-xs text-white/35">{ageYears} yrs</p>
              </div>
            )}
          </div>

          {/* Nutrition status + profile completeness row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeTarget ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
                  <p className="text-[10px] text-emerald-400/50 uppercase tracking-[0.35em]">
                    Targets published
                  </p>
                  <p className="text-[10px] text-white/18">
                    · {activeTarget.calorieTarget.toLocaleString()} kcal &middot; {activeTarget.proteinGrams}g protein
                  </p>
                </>
              ) : draftTargets.length > 0 ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400/40" />
                  <p className="text-[10px] text-amber-400/45 uppercase tracking-[0.35em]">
                    Draft ready to review
                  </p>
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/12" />
                  <p className="text-[10px] text-white/22 uppercase tracking-[0.35em]">
                    No targets set
                  </p>
                </>
              )}
            </div>

            {/* Calculator completeness */}
            {!canCalculate && (
              <p className="text-[10px] text-amber-400/35 text-right">
                Missing {missingFields.join(", ")} ·{" "}
                <Link
                  href={`/hq/clients/${clientId}`}
                  className="underline underline-offset-2 hover:text-amber-400/60 transition-colors"
                >
                  complete profile
                </Link>{" "}
                to enable calculator
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.05] mb-10" />

        {/* Main editor */}
        <NutritionTargetEditor
          clientId={clientId}
          displayName={displayName ?? workspace.email}
          calcProfile={calcProfile}
          activeTarget={activeTarget}
          draftTargets={draftTargets}
        />

        {/* ── Archived history ─────────────────────────────────────── */}
        {archivedTargets.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center gap-4 mb-5">
              <p className="text-[9px] text-white/18 uppercase tracking-[0.45em] shrink-0">
                Archive
              </p>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>
            <div className="space-y-0">
              {archivedTargets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-5 py-3.5 border-b border-white/[0.04]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/32 tabular-nums">
                      {t.calorieTarget.toLocaleString()} kcal &middot; {t.proteinGrams}g protein
                    </p>
                    <p className="text-[10px] text-white/15 mt-0.5">
                      Effective {t.effectiveDate}
                      {t.archivedAt && ` · Archived ${fmtDate(t.archivedAt)}`}
                    </p>
                  </div>
                  {t.adjustmentReason && (
                    <p className="text-[10px] text-white/18 max-w-[220px] truncate shrink-0">
                      {t.adjustmentReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
