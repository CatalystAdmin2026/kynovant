import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing - Kynovant",
  description:
    "Kynovant Professional is $99/month with a 14-day free trial. One plan for personal trainers and online coaches using Coach HQ, AI-assisted programming, client portal, messaging, scheduling, documents, and billing.",
};

const included = [
  "Coach HQ - client operations in one workspace",
  "AI Program Generator with coach review and approval",
  "Program Builder and Exercise Library",
  "Client portal for workouts, check-ins, documents, nutrition targets, and progress",
  "Check-in review queue with client context",
  "Coach-client messaging, native scheduling, and notifications",
  "Private document sharing and billing management",
  "Responsive web/PWA experience for coaches and clients",
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-ink px-6 pb-24 pt-36 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-gold">
          Pricing
        </p>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-5xl">
              One plan. Everything included.
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/50">
              Start Kynovant Professional with a 14-day free trial for personal trainers
              and online coaches. No tiers to compare, no required demo, and no application
              before trying the product.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gold/25 bg-mkt-surface-raised">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
            <div className="p-8">
              <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">
                Kynovant Professional
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold text-white">$99</span>
                <span className="text-sm text-white/40">/ month</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/50">
                Starts with a 14-day free trial. Billing starts only after authenticated
                trial activation through Stripe.
              </p>

              <div className="my-8 h-px bg-mkt-border" />

              <div className="space-y-3">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                    <span className="text-sm leading-snug text-white/65">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/start-trial"
                className="mt-9 flex items-center justify-center gap-2 rounded-md bg-white px-8 py-4 text-sm font-semibold text-[#0d0f11] transition-colors hover:bg-white/90"
              >
                Start 14-Day Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-4 text-center text-xs text-white/30">
                No payment required to create your coach account.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
