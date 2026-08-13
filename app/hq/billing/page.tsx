// ─────────────────────────────────────────────────────────────
// Kynovant HQ — Billing
//
// Server Component, gated by app/hq/layout.tsx's requireCoachOrAdminPage()
// like every other /hq route — only reachable by an already-entitled
// coach (or an admin), which is exactly right: a coach who isn't
// entitled yet is redirected to /account-status before ever reaching
// this layout, and that's where their subscription actually starts
// (see lib/billing/actions.ts's startCheckoutAction). This page is for
// managing an existing subscription, not starting one.
// ─────────────────────────────────────────────────────────────

import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/client";
import { coachSubscriptions } from "@/lib/db/schema-billing";
import { eq } from "drizzle-orm";
import { openBillingPortalAction } from "@/lib/billing/actions";
import { refreshCoachSubscriptionFromStripe } from "@/lib/billing/sync";
import HQPageHeader from "@/components/hq/HQPageHeader";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  manually_activated: "Manually activated",
  trialing: "Free trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BillingPage() {
  const { dbUser } = await requireCoachOrAdminPage();

  // Admins have no personal subscription row — this page has nothing
  // to show them (they aren't billed). Coaches always have a row here:
  // app/hq/layout.tsx's guard already required entitlement to reach
  // this page, and "none" (no row) is never an allowed status.
  if (dbUser.role !== "coach") {
    return (
      <div>
        <HQPageHeader title="Billing" />
        <p className="text-sm text-white/50">Billing is managed per-coach — there&apos;s nothing to show here for an admin account.</p>
      </div>
    );
  }

  const db = getDb();
  const [initialSubscription] = await db
    .select()
    .from(coachSubscriptions)
    .where(eq(coachSubscriptions.coachId, dbUser.id))
    .limit(1);

  // Re-sync from Stripe directly before rendering — this is the page a
  // coach lands on immediately after the Billing Portal's return_url,
  // and unlike Checkout's success_url there's no session token to
  // synchronously resync from there, only the webhook. Re-fetching here
  // means this page never shows stale cancellation/plan-change state
  // just because a webhook hasn't arrived yet (or, in a local/preview
  // deployment with no reachable webhook endpoint, never will). See
  // lib/billing/sync.ts's refreshCoachSubscriptionFromStripe() for the
  // full rationale. No-op for a manually_activated coach (no real
  // subscription to refresh) or one with none yet.
  if (initialSubscription?.stripeSubscriptionId) {
    await refreshCoachSubscriptionFromStripe(initialSubscription.stripeSubscriptionId);
  }

  const [subscription] = initialSubscription?.stripeSubscriptionId
    ? await db
        .select()
        .from(coachSubscriptions)
        .where(eq(coachSubscriptions.coachId, dbUser.id))
        .limit(1)
    : [initialSubscription];

  const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);

  return (
    <div>
      <HQPageHeader
        title="Billing"
        subtitle="Your Kynovant subscription."
        action={
          hasStripeCustomer ? (
            <form action={openBillingPortalAction}>
              <button
                type="submit"
                className="bg-[#c9a24d] text-[#080909] text-sm font-semibold uppercase tracking-[0.08em] px-5 py-2.5 hover:bg-[#d4b56a] transition-colors"
              >
                Manage Billing
              </button>
            </form>
          ) : undefined
        }
      />

      <div className="max-w-lg border border-[#c9a24d]/10 bg-white/[0.02] p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">Status</p>
          <p className="text-sm font-medium text-[#c9a24d]/80">
            {subscription ? STATUS_LABEL[subscription.status] ?? subscription.status : "—"}
          </p>
        </div>

        {subscription?.currentPeriodEnd && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
              {subscription.status === "trialing" ? "Trial ends" : "Current period ends"}
            </p>
            <p className="text-sm text-white/60">{formatDate(subscription.currentPeriodEnd)}</p>
          </div>
        )}

        {subscription?.cancelAtPeriodEnd && (
          <p className="text-xs text-[#e0a15c]">
            Your subscription is scheduled to cancel at the end of the current period. You can undo this
            from Manage Billing.
          </p>
        )}

        {!hasStripeCustomer && (
          <p className="text-xs text-white/40">
            {subscription?.status === "manually_activated"
              ? "Your access was activated manually — there's no billing account to manage here."
              : "No billing account on file."}
          </p>
        )}
      </div>
    </div>
  );
}
