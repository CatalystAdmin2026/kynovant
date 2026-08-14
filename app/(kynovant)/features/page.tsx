import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  KYNOVANT_FEATURE_GROUPS,
  KYNOVANT_NOT_CLAIMED,
  KYNOVANT_PUBLIC_CTA,
} from "@/lib/marketing/kynovant-public-content";

export const metadata: Metadata = {
  title: "Features - Kynovant",
  description:
    "A factual overview of Kynovant's shipped product for personal trainers and coaches: AI-assisted program drafting, Exercise Library, clients, check-ins, messaging, documents, schedule, search, notifications, billing, client portal, and PWA experience.",
};

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-ink px-6 pb-24 pt-36 text-white">
      <section className="mx-auto max-w-6xl">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-gold">
          Features
        </p>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl">
              What Kynovant actually does.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/50 md:text-lg">
              Kynovant is coaching operations software for professional personal trainers
              and online coaches who need one place to manage programming, client context,
              weekly review, documents, communication, scheduling, and billing. This page
              describes shipped product behavior, not roadmap promises.
            </p>
          </div>

          <div className="rounded-2xl border border-mkt-border bg-mkt-surface-raised p-6">
            <p className="text-sm leading-relaxed text-white/50">
              AI assists the coach. It drafts from a bounded brief and exercise catalog, then
              waits for coach review, editing, and approval before anything becomes client-facing.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={KYNOVANT_PUBLIC_CTA.href}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#0d0f11] transition-colors hover:bg-white/90"
              >
                {KYNOVANT_PUBLIC_CTA.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-md border border-mkt-border-strong px-5 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
        {KYNOVANT_FEATURE_GROUPS.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-mkt-border bg-mkt-surface-raised p-6"
          >
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-signal">
              {feature.eyebrow}
            </p>
            <h2 className="text-xl font-semibold leading-tight text-white">{feature.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/50">{feature.summary}</p>
            <div className="mt-6 space-y-3 border-t border-mkt-border pt-5">
              {feature.proofPoints.map((point) => (
                <div key={point} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <p className="text-xs leading-relaxed text-white/45">{point}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-16 max-w-6xl rounded-2xl border border-gold/20 bg-mkt-surface-raised p-6 md:p-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
          Claim Boundaries
        </p>
        <h2 className="text-2xl font-semibold text-white">What this release does not claim</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {KYNOVANT_NOT_CLAIMED.map((item) => (
            <div key={item} className="rounded-lg border border-mkt-border bg-mkt-surface px-4 py-3">
              <p className="text-xs leading-relaxed text-white/45">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
