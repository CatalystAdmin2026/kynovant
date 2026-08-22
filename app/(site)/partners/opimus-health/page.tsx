import type { Metadata } from "next";
import Link from "next/link";

// Kept Performance × Opimus Health strategic-partnership page.
//
// Publication status: intentionally NOT linked from primary navigation
// or the footer, and marked noindex/nofollow below. Reachable only at
// its direct URL. See the Kept Performance domain-cutover Phase 8
// decision for the reasoning — short version: we want reciprocal
// credibility once Opimus Health finishes their own site update, not
// a one-sided announcement that looks premature. Safe to promote to
// full publication (drop noindex, add nav link) once that's ready.
//
// Content boundaries (do not blur on edit):
//   - Opimus Health = clinical/medical weight-management care.
//   - Kept Performance = fitness coaching, training, nutrition
//     coaching within scope, accountability. NOT a medical provider.
//   - Kynovant = the software platform Kept coaching is delivered
//     through. NOT a medical provider, NOT part of Opimus Health, and
//     never described as diagnosing, prescribing, or supervising
//     medication.
// No efficacy claims, no invented pricing/discounts/eligibility
// guarantees/referral commissions/exclusivity/treatment protocols —
// only what's actually established.
export const metadata: Metadata = {
  title: "Opimus Health Partnership",
  description:
    "Kept Performance and Opimus Health — clinical weight-management care paired with performance coaching, training, and accountability.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Opimus Health Partnership | Kept Performance",
    description:
      "Clinical weight-management care paired with performance coaching, training, and accountability.",
    url: "https://www.keptperformance.com/partners/opimus-health",
    siteName: "Kept Performance",
  },
  alternates: {
    canonical: "https://www.keptperformance.com/partners/opimus-health",
  },
};

const pillars = [
  {
    title: "Progressive Resistance Training",
    body: "Programming built and adjusted around your actual training history, schedule, and recovery — not a generic template.",
  },
  {
    title: "Nutrition Coaching Within Scope",
    body: "Guidance on sustainable eating patterns that support your goals and complement any clinical care you're receiving.",
  },
  {
    title: "Habit & Adherence Support",
    body: "Weekly check-ins and direct coach access, built to keep consistency intact once the initial motivation fades.",
  },
  {
    title: "Body-Composition & Performance Focus",
    body: "Coaching aimed at building and maintaining lean tissue and long-term performance — not just a number on the scale.",
  },
];

const howItWorks = [
  {
    num: "01",
    title: "You start wherever you are",
    body: "Whether you're already working with Opimus Health, already coaching with Kept, or new to both, either team can point you to the other when it's a genuine fit.",
  },
  {
    num: "02",
    title: "Each side stays in its lane",
    body: "Opimus Health manages the clinical relationship. Kept Performance manages the training, nutrition coaching, and accountability side. Neither replaces the other.",
  },
  {
    num: "03",
    title: "You apply to Kept directly",
    body: "Coaching enrollment goes through Kept Performance's own application — the same process as any other Kept client.",
  },
];

export default function OpimusHealthPartnerPage() {
  return (
    <main className="bg-[#080909] overflow-x-hidden">
      {/* ════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════ */}
      <section className="relative pt-40 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px]"
            style={{
              background:
                "radial-gradient(ellipse, rgba(201,162,77,0.06) 0%, transparent 65%)",
              filter: "blur(60px)",
            }}
          />
        </div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A24D]/15 to-transparent" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.5em] uppercase mb-8">
            Kept Performance × Opimus Health
          </p>
          <h1
            className="font-headline font-bold uppercase leading-[0.9] tracking-tight text-white mb-8"
            style={{ fontSize: "clamp(2.6rem, 7vw, 5rem)" }}
          >
            Clinical Care Meets
            <br />
            <span className="text-[#C9A24D]">Performance Coaching.</span>
          </h1>
          <div className="flex justify-center mb-8">
            <div className="w-10 h-px bg-[#C9A24D]/40" />
          </div>
          <p className="text-gray-300 text-lg font-light leading-relaxed max-w-2xl mx-auto">
            Eligible clients can pair Opimus Health&apos;s clinician-supervised
            weight-management care with Kept Performance&apos;s coaching —
            training, nutrition guidance, and accountability built to support
            the work you&apos;re already doing.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          TWO SIDES OF THE SYSTEM
      ════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[#0b0c0d]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.55em] uppercase mb-4">
              Two Sides Of The System
            </p>
            <h2 className="font-headline text-3xl md:text-[44px] font-bold uppercase text-white leading-none">
              Two Teams. One Client.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0e0f10] border border-white/[0.07] p-8 xl:p-10">
              <p className="text-[10px] tracking-[0.5em] text-gray-600 uppercase font-semibold mb-5">
                Clinical Care
              </p>
              <h3 className="font-headline text-2xl md:text-3xl font-bold uppercase text-white leading-tight mb-5">
                Opimus Health
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                A clinician-supervised weight-management program. Opimus
                Health owns the medical relationship — evaluation, clinical
                oversight, and any medication where appropriate.
              </p>
            </div>

            <div className="bg-[#0e0f10] border border-[#C9A24D]/20 p-8 xl:p-10">
              <p className="text-[10px] tracking-[0.5em] text-[#C9A24D]/70 uppercase font-semibold mb-5">
                Coaching
              </p>
              <h3 className="font-headline text-2xl md:text-3xl font-bold uppercase text-white leading-tight mb-5">
                Kept Performance
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Training, nutrition coaching within scope, and accountability.
                Kept Performance owns the coaching relationship — not the
                medical one.
              </p>
            </div>
          </div>

          <p className="text-gray-600 text-xs leading-relaxed max-w-2xl mx-auto text-center mt-10">
            Kept Performance coaching is delivered through Kynovant, our
            coaching software platform. Kynovant is not a medical provider,
            is not part of Opimus Health, and does not diagnose, prescribe,
            or supervise medication.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          WHY THIS MATTERS
      ════════════════════════════════════════════════ */}
      <section className="py-28 px-6 bg-[#080909]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.55em] uppercase mb-4">
              Why This Matters
            </p>
            <h2 className="font-headline text-3xl md:text-[44px] font-bold uppercase text-white leading-none max-w-3xl mx-auto">
              Medical Care Alone Isn&apos;t A Training Program.
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed max-w-xl mx-auto mt-6">
              Clinical weight-management care addresses one part of the
              picture. It doesn&apos;t replace the work of building the
              training, nutrition habits, and consistency that support
              results over the long term.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {pillars.map((p) => (
              <div key={p.title} className="flex items-start gap-4">
                <svg
                  className="shrink-0 mt-1"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M2.5 8.5l3.5 3.5 7-7"
                    stroke="#C9A24D"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <p className="text-white text-sm font-semibold mb-1.5">
                    {p.title}
                  </p>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════ */}
      <section className="py-28 px-6 bg-[#0b0c0d]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.55em] uppercase mb-4">
              How It Works
            </p>
            <h2 className="font-headline text-3xl md:text-[44px] font-bold uppercase text-white leading-none">
              Two Paths That Meet.
            </h2>
          </div>

          <div className="space-y-10">
            {howItWorks.map((step) => (
              <div key={step.num} className="flex items-start gap-6">
                <span className="font-headline text-[#C9A24D]/30 font-bold text-2xl leading-none shrink-0 w-10">
                  {step.num}
                </span>
                <div>
                  <p className="text-white text-base font-semibold mb-2">
                    {step.title}
                  </p>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          OPIMUS HEALTH
      ════════════════════════════════════════════════ */}
      <section className="py-28 px-6 bg-[#080909]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.55em] uppercase mb-4">
            About Opimus Health
          </p>
          <h2 className="font-headline text-3xl md:text-[44px] font-bold uppercase text-white leading-none mb-6">
            The Clinical Side.
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xl mx-auto mb-10">
            Opimus Health is a clinician-supervised wellness platform. For
            details on their weight-management program, clinical process,
            and eligibility, visit their site directly — Kept Performance
            doesn&apos;t speak on their behalf.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://opimushealth.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-white/15 text-white font-semibold tracking-[0.18em] text-[11px] px-8 py-4 uppercase hover:border-white/30 hover:bg-white/[0.03] transition-all duration-200"
            >
              Visit Opimus Health ↗
            </a>
            <a
              href="https://opimushealth.com/programs/weight-loss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9A24D] text-sm hover:underline"
            >
              View their Weight-Loss Program ↗
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          CTA
      ════════════════════════════════════════════════ */}
      <section
        className="relative py-32 px-6 overflow-hidden"
        style={{
          background: [
            "radial-gradient(ellipse 55% 40% at 50% 100%, rgba(201,162,77,0.06) 0%, transparent 65%)",
            "#0b0c0d",
          ].join(", "),
        }}
      >
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mb-12" />
          <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.5em] uppercase mb-6">
            Ready For The Coaching Side?
          </p>
          <h2 className="font-headline font-bold uppercase leading-[0.9] tracking-tight text-white mb-10"
            style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)" }}>
            Let&apos;s Build The
            <br />
            <span className="text-[#C9A24D]">Other Half.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <Link
              href="/apply"
              className="inline-block bg-[#C9A24D] text-black font-bold tracking-[0.20em] text-[11px] px-12 py-4 uppercase hover:bg-[#D4B56A] transition-colors duration-200"
            >
              Apply for Coaching
            </Link>
            <a
              href="https://opimushealth.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 text-xs tracking-[0.15em] uppercase hover:text-white transition-colors"
            >
              Learn About Opimus Health ↗
            </a>
          </div>
          <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mt-14" />
        </div>
      </section>
    </main>
  );
}
