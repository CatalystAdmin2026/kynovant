import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Circle, Archive } from "lucide-react";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  fat_loss:               "Fat Loss",
  muscle_gain:            "Muscle Gain",
  body_recomposition:     "Body Recomposition",
  strength:                "Strength",
  athletic_performance:   "Athletic Performance",
  general_health:         "General Health",
  mobility:                "Mobility",
  competition_prep:       "Competition Prep",
  reverse_diet:            "Reverse Diet",
  maintenance:             "Maintenance",
  executive_performance:  "Executive Performance",
  custom:                  "Custom",
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
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);

  const [workspace, activeTarget, draftTargets, history] = await Promise.all([
    getCoachClientWorkspace(clientId, coachId),
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
    <div className="min-h-screen text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Breadcrumbs */}
        <HQBreadcrumbs
          crumbs={[
            { label: "Overview", href: "/hq" },
            { label: "Clients", href: "/hq/clients" },
            { label: displayName, href: `/hq/clients/${clientId}` },
            { label: "Nutrition" },
          ]}
        />

        {/* ── Client Hero ──────────────────────────────────────────── */}
        <div className="mt-10 mb-10">

          {/* Back link */}
          <div className="flex items-center justify-between mb-8">
            <p className="text-[9px] text-white/18 uppercase tracking-[0.3em]">Nutrition</p>
            <Link
              href={`/hq/clients/${clientId}`}
              className="inline-flex items-center gap-1.5 text-[10px] text-white/20 hover:text-white/45 transition-colors"
            >
              <ArrowLeft size={11} aria-hidden />
              {firstName}&apos;s workspace
            </Link>
          </div>

          {/* Name — matches the "client name" weight/size used on the
              client detail and session-history pages. */}
          <h1 className="text-2xl font-bold tracking-wide text-white mb-5">
            {displayName}
          </h1>

          {/* Profile stats row */}
          <div className="flex flex-wrap items-center gap-2 mb-7">
            {goalType && (
              <span className="inline-flex items-center rounded-full border border-gold/20 bg-gold/[0.06] px-3 py-1 text-[11px] text-gold/70">
                {GOAL_LABELS[goalType] ?? goalType}
              </span>
            )}
            {weightLbs && (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-white/40">
                {Math.round(weightLbs)} lbs
              </span>
            )}
            {heightInches && (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-white/40">
                {Math.floor(heightInches / 12)}&prime; {Math.round(heightInches % 12)}&Prime;
              </span>
            )}
            {ageYears && (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-white/40">
                {ageYears} yrs
              </span>
            )}
          </div>

          {/* Nutrition status + profile completeness row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              {activeTarget ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                  <CheckCircle2 size={11} aria-hidden />
                  Targets Published
                </span>
              ) : draftTargets.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-amber-400">
                  <Clock size={11} aria-hidden />
                  Draft Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-white/25">
                  <Circle size={11} aria-hidden />
                  No Targets Set
                </span>
              )}
              {activeTarget && (
                <p className="text-[10px] text-white/18">
                  {activeTarget.calorieTarget.toLocaleString()} kcal &middot; {activeTarget.proteinGrams}g protein
                </p>
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
              <p className="flex items-center gap-2 text-[9px] text-white/20 uppercase tracking-[0.3em] shrink-0">
                <Archive size={11} aria-hidden />
                Archive
              </p>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>
            <Table tone="dark">
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Archived</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedTargets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="tabular-nums text-white/45 whitespace-nowrap">
                      {t.calorieTarget.toLocaleString()} kcal &middot; {t.proteinGrams}g protein
                    </TableCell>
                    <TableCell className="text-white/30 text-xs whitespace-nowrap">
                      {t.effectiveDate}
                    </TableCell>
                    <TableCell className="text-white/30 text-xs whitespace-nowrap">
                      {t.archivedAt ? fmtDate(t.archivedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-white/30 text-xs max-w-[220px] truncate">
                      {t.adjustmentReason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
