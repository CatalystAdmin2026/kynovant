// ─────────────────────────────────────────────────────────────
// Catalyst OS — Account Page
//
// Server Component — auth and DB queries run server-side.
// Shows identity information, onboarding status, active goals
// summary, training availability, and nutrition completion.
// No medical details, injury details, bloodwork, internal notes,
// raw JSON, or internal IDs are displayed.
// ─────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import {
  getClientGoals,
  getClientTrainingProfile,
  getClientNutritionProfile,
  getLatestOnboardingSubmission,
} from "@/lib/db/profile-service";
import LogoutButton from "@/components/portal/LogoutButton";
import InstallKynovant from "@/components/pwa/InstallKynovant";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  invited: "text-[#c9a24d]/80",
  active: "text-emerald-400/80",
  suspended: "text-red-400/80",
  archived: "text-white/30",
};

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  body_recomposition: "Body Recomposition",
  strength: "Strength",
  athletic_performance: "Athletic Performance",
  general_health: "General Health",
  mobility: "Mobility",
  competition_prep: "Competition Prep",
  reverse_diet: "Reverse Diet",
  maintenance: "Maintenance",
  executive_performance: "Executive Performance",
  custom: "Custom",
};

export default async function AccountPage() {
  const { authUser, dbUser } = await requireClientUser();
  const profile = await getClientProfile(dbUser.id);

  // Profile data — all wrapped in safeQuery inside each helper,
  // so these return gracefully before the migration is applied.
  const [latestSubmission, activeGoals, trainingProfile, nutritionProfile] =
    await Promise.all([
      getLatestOnboardingSubmission(dbUser.id),
      getClientGoals(dbUser.id),
      getClientTrainingProfile(dbUser.id),
      getClientNutritionProfile(dbUser.id),
    ]);

  const initials = (profile?.fullName || authUser.email || "C")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusLabel = STATUS_LABELS[dbUser.status] ?? dbUser.status;
  const statusColor = STATUS_COLORS[dbUser.status] ?? "text-white/40";

  // Onboarding status
  const onboardingLabel = latestSubmission
    ? latestSubmission.status === "processed"
      ? "Profile imported"
      : "Submitted — processing"
    : "Not yet submitted";
  const onboardingColor = latestSubmission
    ? latestSubmission.status === "processed"
      ? "text-emerald-400/80"
      : "text-[#c9a24d]/80"
    : "text-white/30";

  // Training availability
  const trainingLabel = trainingProfile?.availableDaysPerWeek
    ? `${trainingProfile.availableDaysPerWeek} day${trainingProfile.availableDaysPerWeek !== 1 ? "s" : ""} per week`
    : null;

  // Nutrition completion
  const nutritionComplete =
    nutritionProfile !== null &&
    (nutritionProfile.dietaryPattern !== null ||
      nutritionProfile.allergies !== null);

  return (
    <div className="min-h-screen bg-[#080909] text-[#f0efeb]">
      {/* Minimal header */}
      <header className="border-b border-white/[0.06] px-6 h-16 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logos/kynovant-mark.png"
            alt="Kynovant"
            width={20}
            height={20}
            className="opacity-75"
          />
          <span className="text-[10px] font-semibold tracking-[0.26em] text-white/45 uppercase">
            Kynovant OS
          </span>
        </div>
        <Link
          href="/portal"
          className="text-xs text-white/35 hover:text-white/60 transition-colors"
        >
          ← Back to Portal
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-10">
        {/* Page title */}
        <div className="flex flex-col gap-1">
          <div className="w-6 h-[2px] bg-[#c9a24d] mb-3" aria-hidden />
          <h1 className="font-headline text-3xl uppercase tracking-[0.06em] text-white">
            Account
          </h1>
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#c9a24d]/10 border border-[#c9a24d]/25 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-[#c9a24d]">{initials}</span>
          </div>
          <div className="flex flex-col">
            {profile?.fullName && (
              <p className="text-base font-semibold text-white/85">
                {profile.fullName}
              </p>
            )}
            <p className="text-sm text-white/40">{authUser.email}</p>
          </div>
        </div>

        {/* Gold rule */}
        <div className="h-px w-full bg-[#c9a24d]/10" />

        {/* Identity fields */}
        <div className="flex flex-col gap-6">
          <Field label="Full Name" value={profile?.fullName ?? "—"} />
          <Field
            label="Preferred Name"
            value={profile?.preferredName ?? "—"}
          />
          <Field label="Email" value={authUser.email ?? "—"} />
          <Field label="Timezone" value={profile?.timezone ?? "—"} />
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              Account Status
            </p>
            <p className={`text-sm font-medium ${statusColor}`}>
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Gold rule */}
        <div className="h-px w-full bg-[#c9a24d]/10" />

        {/* Onboarding & profile section */}
        <div className="flex flex-col gap-6">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/25 uppercase">
            Onboarding Profile
          </p>

          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              Onboarding Status
            </p>
            <p className={`text-sm font-medium ${onboardingColor}`}>
              {onboardingLabel}
            </p>
            {!latestSubmission && (
              <p className="text-xs text-white/25 mt-0.5">
                Your onboarding profile has not been imported yet.
              </p>
            )}
          </div>

          {/* Active goals */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              Active Goals
            </p>
            {activeGoals.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {activeGoals.map((goal) => (
                  <li key={goal.id} className="text-sm text-white/70">
                    {GOAL_LABELS[goal.goalType] ?? goal.goalType}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/30">No active goals on file.</p>
            )}
          </div>

          {/* Training availability */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              Training Availability
            </p>
            {trainingLabel ? (
              <p className="text-sm text-white/70">{trainingLabel}</p>
            ) : (
              <p className="text-sm text-white/30">Not yet configured.</p>
            )}
          </div>

          {/* Nutrition preferences */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              Nutrition Preferences
            </p>
            <p
              className={`text-sm font-medium ${nutritionComplete ? "text-emerald-400/80" : "text-white/30"}`}
            >
              {nutritionComplete ? "Preferences on file" : "Not yet configured."}
            </p>
          </div>
        </div>

        {/* Gold rule */}
        <div className="h-px w-full bg-[#c9a24d]/10" />

        {/* App — the intentional "install later" affordance. Never nags:
            InstallKynovant's "menu" variant only checks
            mounted/installed/unsupported, never `dismissed` (unlike
            "card"), so it stays available here even after a client has
            dismissed the Portal's own onboarding sheet — a small,
            always-reachable way to install later without repeating the
            unprompted sheet. Renders nothing once actually installed or
            on a browser that can't install at all. */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-white/25 uppercase">
            App
          </p>
          <InstallKynovant variant="nav" scope="portal" className="w-fit" />
        </div>

        {/* Sign out */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-white/25 uppercase">
            Session
          </p>
          <LogoutButton className="w-fit text-sm px-0 py-0" />
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
        {label}
      </p>
      <p className="text-sm text-white/70">{value}</p>
    </div>
  );
}
