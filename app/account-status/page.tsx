// ─────────────────────────────────────────────────────────────
// Catalyst OS — Locked Account Screen
//
// Server Component. The redirect target for a coach whose entitlement
// check fails inside requireCoachOrAdminPage() (lib/auth/guards.ts).
// Also the Stripe Checkout success_url / cancel_url target — see the
// "CHECKOUT RETURN — SYNCHRONOUS FAST PATH" section below.
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
import { retrieveCheckoutSession } from "@/lib/billing/checkout";
import { syncCoachSubscriptionFromStripeSubscription } from "@/lib/billing/sync";
import { startCheckoutAction, openBillingPortalAction } from "@/lib/billing/actions";
import LogoutButton from "@/components/portal/LogoutButton";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  none: {
    title: "Activate your Kynovant subscription.",
    body: "Your coach account is ready — start your 14-day free trial to unlock HQ.",
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
    title: "Your Kynovant subscription has ended.",
    body: "Your HQ access ended with your subscription. Start a new subscription any time to pick up where you left off.",
  },
};

const ERROR_COPY: Record<string, string> = {
  checkout_failed: "We couldn't start checkout. Please try again, or contact Kynovant if this continues.",
  portal_failed: "We couldn't open the billing portal. Please try again, or contact Kynovant if this continues.",
  no_billing_account: "There's no billing account on file yet — start a subscription first.",
  missing_email: "Your account is missing a verified email address — contact Kynovant to resolve this.",
};

// ─────────────────────────────────────────────────────────────
// CHECKOUT RETURN — SYNCHRONOUS FAST PATH
//
// Stripe Checkout's success_url includes {CHECKOUT_SESSION_ID} (see
// lib/billing/actions.ts's startCheckoutAction). Rather than making the
// coach wait on webhook delivery to see their account activated, this
// retrieves the session directly from Stripe and syncs it right here —
// the webhook (app/api/stripe/webhook/route.ts) still fires afterward
// and calls the identical sync function again; upsertCoachSubscriptionFromStripe
// is idempotent, so processing the same subscription state twice is
// always safe. If the fast path fails for any reason (transient Stripe
// API error, session not yet fully processed), this fails silently and
// the page falls back to showing current entitlement status — the
// webhook remains the authoritative path regardless.
//
// session.metadata.coachId is checked against the signed-in coach
// before syncing anything — without this, a coach could supply another
// coach's checkout_session_id in the URL and trigger a sync for an
// account that isn't theirs.
// ─────────────────────────────────────────────────────────────
async function trySyncFromCheckoutSession(sessionId: string, coachId: string): Promise<void> {
  const session = await retrieveCheckoutSession(sessionId);
  if (!session || session.metadata?.coachId !== coachId) return;
  if (!session.subscription || typeof session.subscription === "string") return;

  await syncCoachSubscriptionFromStripeSubscription(session.subscription, `checkout_fastpath_${session.id}`);
}

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_session_id?: string; checkout?: string; error?: string }>;
}) {
  const { authUser, dbUser } = await requireAuthenticatedPage();
  const { checkout_session_id: checkoutSessionId, checkout, error } = await searchParams;

  // Only a coach can be locked out by entitlement — anyone else landing
  // here (client, admin, or a coach whose entitlement is actually fine)
  // gets redirected to where they belong instead of a confusing screen.
  if (dbUser.role !== "coach") {
    redirect(dbUser.role === "admin" ? "/admin" : "/portal");
  }

  if (checkoutSessionId) {
    await trySyncFromCheckoutSession(checkoutSessionId, dbUser.id);
  }

  const entitlement = await getCoachEntitlement(dbUser.id);
  if (entitlement.allowed) {
    redirect("/hq");
  }

  const copy = STATUS_COPY[entitlement.status] ?? STATUS_COPY.suspended;
  const errorMessage = error ? ERROR_COPY[error] ?? null : null;

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

        {checkoutSessionId && (
          <p className="text-xs text-white/40">
            Payment received — activating your account now. If HQ doesn&apos;t open automatically within a
            minute, refresh this page.
          </p>
        )}
        {checkout === "cancelled" && (
          <p className="text-xs text-white/40">Checkout was cancelled — no charge was made.</p>
        )}
        {errorMessage && (
          <p className="text-xs text-[#e0a15c]">{errorMessage}</p>
        )}

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

        {entitlement.status === "none" && (
          <form action={startCheckoutAction}>
            <button
              type="submit"
              className="w-full bg-[#c9a24d] text-[#080909] text-sm font-semibold uppercase tracking-[0.08em] py-3 hover:bg-[#d4b56a] transition-colors"
            >
              Start 14-Day Free Trial
            </button>
          </form>
        )}

        {entitlement.status === "cancelled" && (
          <form action={startCheckoutAction}>
            <button
              type="submit"
              className="w-full bg-[#c9a24d] text-[#080909] text-sm font-semibold uppercase tracking-[0.08em] py-3 hover:bg-[#d4b56a] transition-colors"
            >
              Subscribe Again
            </button>
          </form>
        )}

        {entitlement.status === "past_due" && (
          <form action={openBillingPortalAction}>
            <button
              type="submit"
              className="w-full bg-[#c9a24d] text-[#080909] text-sm font-semibold uppercase tracking-[0.08em] py-3 hover:bg-[#d4b56a] transition-colors"
            >
              Update Billing
            </button>
          </form>
        )}

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
