import { redirect } from "next/navigation";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import { getPublishedTargetForClient } from "@/lib/db/nutrition-target-service";
import PortalShell from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const { dbUser } = await requireClientUser();
  if (dbUser.role !== "client") redirect("/admin");

  const [profile, activeTarget] = await Promise.all([
    getClientProfile(dbUser.id),
    getPublishedTargetForClient(dbUser.id),
  ]);

  const clientName = profile?.preferredName ?? profile?.fullName ?? "Client";

  function fmtEffectiveDate(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <PortalShell clientName={clientName}>
      <div className="max-w-lg">
        <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-8">
          Nutrition
        </p>

        {!activeTarget ? (
          // ── Empty state ──────────────────────────────────────────
          <div>
            <h1 className="text-3xl font-light text-white leading-snug mb-4">
              Your Nutrition Plan
            </h1>
            <p className="text-white/38 text-sm leading-relaxed mb-12 max-w-sm">
              Your coach builds a personalized daily plan based on your goals,
              training, and where you&apos;re starting.
            </p>

            <div className="mb-10">
              <p className="text-[9px] text-white/18 uppercase tracking-[0.5em] mb-6">
                What&apos;s included
              </p>
              <div className="space-y-5">
                {[
                  "Daily calorie target",
                  "Protein goal",
                  "Carbohydrates and fat targets",
                  "Coaching guidance and context",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-4">
                    <div className="w-[3px] h-[3px] rounded-full bg-[#C9A24D]/40 shrink-0" />
                    <p className="text-sm text-white/40">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-l border-white/[0.06] pl-5">
              <p className="text-xs text-white/22 leading-relaxed">
                Have nutrition questions? Bring them to your next coaching session.
              </p>
            </div>
          </div>
        ) : (
          // ── Published state ──────────────────────────────────────
          <div>
            <h1 className="text-3xl font-light text-white leading-snug mb-10">
              Your Nutrition Plan
            </h1>

            {/* Coach guidance — first and prominent */}
            {activeTarget.coachNotes && (
              <div className="mb-12">
                <p className="text-[9px] text-[#C9A24D]/45 uppercase tracking-[0.5em] mb-4">
                  From Your Coach
                </p>
                <p className="text-white/65 leading-relaxed" style={{ fontSize: "15px" }}>
                  {activeTarget.coachNotes}
                </p>
              </div>
            )}

            {/* Calorie hero — no card box, just the number */}
            <div className="pb-8 mb-8 border-b border-white/[0.05]">
              <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-3">
                Daily Calories
              </p>
              <div className="flex items-baseline gap-3">
                <p className="text-6xl font-bold text-[#C9A24D] tabular-nums leading-none">
                  {activeTarget.calorieTarget.toLocaleString()}
                </p>
                <p className="text-sm text-white/25">kcal / day</p>
              </div>
            </div>

            {/* Secondary macros — open layout, no card boxes */}
            <div className="flex flex-wrap gap-x-10 gap-y-7 mb-12">
              <div>
                <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-2">
                  Protein
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-white tabular-nums">
                    {activeTarget.proteinGrams}
                  </p>
                  <p className="text-sm text-white/28">g / day</p>
                </div>
              </div>

              {activeTarget.fatGrams != null && (
                <div>
                  <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-2">
                    Fat
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white/50 tabular-nums">
                      {activeTarget.fatGrams}
                    </p>
                    <p className="text-sm text-white/22">g / day</p>
                  </div>
                </div>
              )}

              {activeTarget.carbGrams != null && (
                <div>
                  <p className="text-[9px] text-white/22 uppercase tracking-[0.5em] mb-2">
                    Carbs
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white/50 tabular-nums">
                      {activeTarget.carbGrams}
                    </p>
                    <p className="text-sm text-white/22">g / day</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/15">
              Effective {fmtEffectiveDate(activeTarget.effectiveDate)}
            </p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
