// ─────────────────────────────────────────────────────────────
// Catalyst OS — Locked Account Screen
//
// Server Component. The redirect target for a coach whose entitlement
// check fails inside requireCoachOrAdminPage() (lib/auth/guards.ts).
//
// Deliberately lives OUTSIDE app/hq/** — app/hq/layout.tsx wraps every
// nested HQ route with the same entitlement-gated guard, so a locked
// screen placed under /hq would redirect to itself. Gated here by
// requireAuthenticatedPage() instead: authenticated only, no role or
// entitlement check, so this page can never redirect-loop into itself.
//
// A visitor who lands here without actually being locked (wrong role,
// or a coach whose entitlement is fine) is redirected away rather than
// shown a confusing screen.
// ─────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireAuthenticatedPage } from "@/lib/auth/guards";
import { getCoachEntitlement } from "@/lib/db/coach-subscription-service";
import LogoutButton from "@/components/portal/LogoutButton";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  none: {
    title: "Your Kynovant access hasn't been activated yet.",
    body: "Your coach account exists, but no subscription or manual activation has been applied. Reach out to Kynovant to get set up.",
  },
  past_due: {
    title: "There's a billing issue on your account.",
    body: "Your last payment didn't go through. You still have access during a short grace period — update your billing to avoid losing access.",
  },
  suspended: {
    title: "Your Kynovant access is currently suspended.",
    body: "This may be due to an unresolved billing issue or an administrative hold. Contact Kynovant to resolve this and restore access.",
  },
  cancelled: {
    title: "Your Kynovant subscription has been cancelled.",
    body: "Your HQ access ended with your subscription. Contact Kynovant if you'd like to reactivate.",
  },
};

export default async function AccountStatusPage() {
  const { authUser, dbUser } = await requireAuthenticatedPage();

  // Only a coach can be locked out by entitlement — anyone else landing
  // here (client, admin, or a coach whose entitlement is actually fine)
  // gets redirected to where they belong instead of a confusing screen.
  if (dbUser.role !== "coach") {
    redirect(dbUser.role === "admin" ? "/admin" : "/portal");
  }

  const entitlement = await getCoachEntitlement(dbUser.id);
  if (entitlement.allowed) {
    redirect("/hq");
  }

  const copy = STATUS_COPY[entitlement.status] ?? STATUS_COPY.suspended;

  return (
    <div className="min-h-screen bg-[#080909] text-[#f0efeb] flex items-center justify-center px-6">
      <main className="max-w-lg w-full flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="w-6 h-[2px] bg-[#c9a24d]" aria-hidden />
          <h1 className="font-headline text-2xl uppercase tracking-[0.06em] text-white">
            {copy.title}
          </h1>
          <p className="text-sm leading-relaxed text-white/50">{copy.body}</p>
        </div>

        <div className="h-px w-full bg-[#c9a24d]/10" />

        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
            Account
          </p>
          <p className="text-sm text-white/60">{authUser.email}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
            Status
          </p>
          <p className="text-sm font-medium text-[#c9a24d]/80">
            {entitlement.status === "none" ? "Not activated" : entitlement.status.replace("_", " ")}
          </p>
        </div>

        <div className="h-px w-full bg-[#c9a24d]/10" />

        <div className="flex items-center gap-6">
          <a
            href="mailto:catalyst.coaching.headcoach@gmail.com"
            className="text-sm font-medium text-[#c9a24d] hover:text-[#d4b56a] transition-colors"
          >
            Contact Kynovant
          </a>
          <LogoutButton className="text-sm text-white/35 hover:text-white/60 px-0 py-0" />
        </div>
      </main>
    </div>
  );
}
