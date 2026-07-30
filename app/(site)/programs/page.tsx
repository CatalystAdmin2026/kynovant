import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Programs | Kynovant",
  description:
    "Two coaching experiences built around you — Kynovant Elite and Executive Performance. Every journey begins with a complimentary Strategy Call.",
  openGraph: {
    title: "Programs | Kynovant",
    description:
      "Two coaching experiences built around you. Discover which path is right for you.",
    siteName: "Kynovant",
  },
};

/* ── Static data ──────────────────────────────────────────── */

const eliteIncludes = [
  "Customized Training Program",
  "Personalized Nutrition Guidance",
  "Weekly Check-ins",
  "Progress Tracking",
  "Habit Coaching",
  "Program Adjustments",
  "Exercise Library",
  "Direct Coach Support",
  "Accountability System",
  "3–5 Business Day Program Delivery",
] as const;

const execAdditional = [
  "Concierge-Level Coaching",
  "Unlimited Messaging Support",
  "Registered Dietitian Nutrition Planning",
  "Bloodwork Review & Optimization",
  "Weekly InBody Analysis",
  "Unlimited Program Updates",
  "Quarterly Executive Strategy Sessions",
  "Travel Nutrition Planning",
  "Restaurant Strategy",
  "Recovery Optimization",
  "Personalized Supplement Protocols",
  "Complimentary InBody Dial H30",
] as const;

/* ── Page ─────────────────────────────────────────────────── */

export default function ProgramsPage() {
  return (
    <>
      <style>{`
        @keyframes pg-fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pg-shimmer-border {
          0%,100% { opacity: 0.25; }
          50%      { opacity: 0.55; }
        }
        @keyframes pg-glow-pulse {
          0%,100% { opacity: 0; }
          50%      { opacity: 1; }
        }
        .pg-f0 { opacity:0; animation: pg-fade-up 0.9s ease forwards; }
        .pg-f1 { opacity:0; animation: pg-fade-up 0.9s 0.12s ease forwards; }
        .pg-f2 { opacity:0; animation: pg-fade-up 0.9s 0.24s ease forwards; }
        .pg-f3 { opacity:0; animation: pg-fade-up 0.9s 0.38s ease forwards; }
        .pg-f4 { opacity:0; animation: pg-fade-up 0.9s 0.52s ease forwards; }
        .exec-card-border { animation: pg-shimmer-border 5s ease-in-out infinite; }
        .exec-glow        { animation: pg-glow-pulse 5s ease-in-out infinite; }

        .elite-card:hover {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.07), 0 24px 64px rgba(0,0,0,0.35);
          transform: translateY(-4px);
        }
        .exec-card:hover {
          box-shadow: 0 0 0 1px rgba(201,164,76,0.45), 0 24px 64px rgba(201,164,76,0.08), 0 8px 32px rgba(0,0,0,0.5);
          transform: translateY(-4px);
        }
        .elite-card, .exec-card {
          transition: box-shadow 360ms ease, transform 360ms ease;
        }
      `}</style>

      <main className="bg-[#080909] overflow-x-hidden">

        {/* ════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════ */}
        <section className="relative min-h-screen flex items-center overflow-hidden">

          {/* Background texture */}
          <div className="absolute inset-0 bg-[#080909]" />

          {/* Subtle centered ambient */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px]"
              style={{
                background: "radial-gradient(ellipse, rgba(201,162,77,0.06) 0%, transparent 65%)",
                filter: "blur(60px)",
              }} />
          </div>

          {/* Thin horizontal rule at very top */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A24D]/15 to-transparent" />

          <div className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-28 pb-20 text-center">

            {/* Eyebrow */}
            <p className="pg-f0 text-[#C9A24D] text-[10px] font-semibold tracking-[0.65em] uppercase mb-8">
              Kynovant
            </p>

            {/* Headline */}
            <h1 className="pg-f1 font-headline font-bold uppercase leading-[0.88] tracking-tight text-white mb-10"
              style={{ fontSize: "clamp(3.2rem, 9vw, 7.5rem)" }}>
              Choose Your<br />
              <span className="text-[#C9A24D]">Coaching</span><br />
              Experience.
            </h1>

            {/* Divider */}
            <div className="pg-f2 flex justify-center mb-9">
              <div className="w-10 h-px bg-[#C9A24D]/40" />
            </div>

            {/* Subheadline */}
            <p className="pg-f2 text-gray-200 text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto mb-5">
              Every coaching journey begins with a complimentary Strategy Call.
            </p>
            <p className="pg-f3 text-gray-500 text-sm md:text-[15px] leading-relaxed max-w-2xl mx-auto mb-14">
              During that conversation we&apos;ll learn about your goals, lifestyle, training history, and
              long-term vision before recommending the coaching experience that&apos;s the best fit for you.
            </p>

            {/* CTA */}
            <div className="pg-f4">
              <Link
                href="/apply"
                className="inline-block bg-[#C9A24D] text-black font-bold tracking-[0.20em] text-[11px] px-14 py-4 uppercase hover:bg-[#D4B56A] transition-colors duration-200"
              >
                Apply for Coaching
              </Link>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-25" aria-hidden="true">
            <div className="w-px h-10 bg-[#C9A24D]" />
            <p className="text-[9px] tracking-[0.55em] text-[#C9A24D]">SCROLL</p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            TWO COACHING EXPERIENCES
        ════════════════════════════════════════════════ */}
        <section className="py-28 px-6 bg-[#0b0c0d]">
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.6em] uppercase mb-4">
                The Experiences
              </p>
              <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
                Two Paths. One Standard.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-8 items-start">

              {/* ── Card 1: Catalyst Coaching Elite ── */}
              <div className="elite-card bg-[#0e0f10] border border-white/[0.07] flex flex-col">
                {/* Top accent */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                <div className="flex flex-col flex-1 p-8 xl:p-10">
                  {/* Label */}
                  <p className="text-[10px] tracking-[0.5em] text-gray-600 uppercase font-semibold mb-5">
                    Flagship Program
                  </p>

                  {/* Headline */}
                  <h3 className="font-headline text-3xl md:text-[40px] font-bold uppercase text-white leading-none mb-6">
                    Kynovant<br />Elite
                  </h3>

                  {/* Copy */}
                  <p className="text-gray-400 text-sm leading-relaxed mb-8">
                    Our flagship personalized online coaching experience designed for individuals committed
                    to building a stronger, healthier, and more confident version of themselves.
                  </p>

                  {/* Divider */}
                  <div className="w-8 h-px bg-white/10 mb-8" />

                  {/* Includes */}
                  <div className="space-y-3 mb-10 flex-1">
                    {eliteIncludes.map((item) => (
                      <div key={item} className="flex items-start gap-3.5">
                        <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M2.5 8.5l3.5 3.5 7-7" stroke="rgba(201,162,77,0.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-gray-400 text-sm leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <Link
                    href="/apply"
                    className="block w-full border border-white/15 text-white font-semibold tracking-[0.18em] text-[11px] px-8 py-4 uppercase text-center hover:border-white/30 hover:bg-white/[0.03] transition-all duration-200"
                  >
                    Apply for Coaching
                  </Link>
                </div>
              </div>

              {/* ── Card 2: Executive Performance ── */}
              <div className="exec-card relative bg-[#09080600] flex flex-col overflow-hidden"
                style={{ background: "linear-gradient(160deg, #0d0b08 0%, #080909 60%, #09080a 100%)" }}>

                {/* Animated top border */}
                <div className="exec-card-border h-px w-full bg-gradient-to-r from-transparent via-[#C9A24D] to-transparent" />

                {/* Corner ambient glow */}
                <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none" aria-hidden="true"
                  style={{
                    background: "radial-gradient(ellipse at top right, rgba(201,164,76,0.12) 0%, transparent 65%)",
                  }} />
                <div className="exec-glow absolute top-0 right-0 w-48 h-48 pointer-events-none" aria-hidden="true"
                  style={{
                    background: "radial-gradient(ellipse at top right, rgba(201,164,76,0.08) 0%, transparent 55%)",
                  }} />

                <div className="relative flex flex-col flex-1 p-8 xl:p-10">
                  {/* Label */}
                  <p className="text-[10px] tracking-[0.5em] text-[#C9A24D]/70 uppercase font-semibold mb-5">
                    Highest Level
                  </p>

                  {/* Headline */}
                  <h3 className="font-headline text-3xl md:text-[40px] font-bold uppercase leading-none mb-6">
                    <span className="text-white">Executive</span><br />
                    <span className="text-[#C9A24D]">Performance</span>
                  </h3>

                  {/* Copy */}
                  <p className="text-gray-300 text-sm leading-relaxed mb-2">
                    Our highest level of personalized coaching.
                  </p>
                  <p className="text-gray-500 text-sm leading-relaxed mb-8">
                    Designed for executives, entrepreneurs, professionals, and individuals seeking
                    concierge-level performance optimization.
                  </p>

                  {/* Divider */}
                  <div className="w-8 h-px bg-[#C9A24D]/30 mb-8" />

                  {/* Everything in Elite, plus */}
                  <p className="text-[10px] tracking-[0.4em] text-gray-600 uppercase font-semibold mb-5">
                    Everything in Kynovant Elite, plus:
                  </p>

                  <div className="space-y-3 mb-10 flex-1">
                    {execAdditional.map((item) => (
                      <div key={item} className="flex items-start gap-3.5">
                        <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M2.5 8.5l3.5 3.5 7-7" stroke="#C9A24D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-gray-300 text-sm leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <Link
                    href="/apply"
                    className="block w-full bg-[#C9A24D] text-black font-bold tracking-[0.18em] text-[11px] px-8 py-4 uppercase text-center hover:bg-[#D4B56A] transition-colors duration-200"
                  >
                    Apply for Coaching
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            LEGACY CIRCLE — editorial, no program details
        ════════════════════════════════════════════════ */}
        <section className="py-32 px-6 bg-[#080909] overflow-hidden">
          <div className="max-w-5xl mx-auto">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 xl:gap-24 items-center">

              {/* Left — typographic statement */}
              <div>
                {/* Decorative rule */}
                <div className="flex items-center gap-5 mb-12">
                  <div className="w-10 h-px bg-[#C9A24D]/40" />
                  <p className="text-[#C9A24D] text-[10px] tracking-[0.6em] uppercase font-semibold">
                    Recognition
                  </p>
                </div>

                <h2 className="font-headline font-bold uppercase leading-[0.88] tracking-tight mb-10"
                  style={{ fontSize: "clamp(3.8rem, 9vw, 7rem)" }}>
                  <span className="text-white">Legacy</span><br />
                  <span className="text-[#C9A24D]">Circle</span>
                </h2>

                <div className="w-10 h-px bg-[#C9A24D]/30 mb-10" />

                <p className="text-gray-200 text-xl font-light leading-relaxed mb-6">
                  Extraordinary commitment deserves extraordinary recognition.
                </p>

                <p className="text-gray-500 text-sm leading-relaxed max-w-md">
                  Executive Performance members who remain enrolled for twenty-four consecutive months
                  become eligible for Legacy Circle recognition and exclusive anniversary rewards
                  reserved only for our longest-standing members.
                </p>
              </div>

              {/* Right — minimal graphic element */}
              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  {/* Outer ring */}
                  <div className="w-56 h-56 md:w-72 md:h-72 rounded-full border border-[#C9A24D]/12 flex items-center justify-center">
                    {/* Middle ring */}
                    <div className="w-44 h-44 md:w-56 md:h-56 rounded-full border border-[#C9A24D]/20 flex items-center justify-center">
                      {/* Inner ring */}
                      <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-[#C9A24D]/35 flex items-center justify-center"
                        style={{
                          background: "radial-gradient(circle, rgba(201,164,76,0.05) 0%, transparent 70%)",
                        }}>
                        {/* Center mark */}
                        <div className="text-center">
                          <p className="font-headline font-bold text-[#C9A24D] leading-none mb-1"
                            style={{ fontSize: "clamp(2.4rem, 6vw, 3.2rem)" }}>
                            24
                          </p>
                          <p className="text-[9px] tracking-[0.4em] text-[#C9A24D]/50 uppercase font-semibold">
                            Months
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ambient glow behind rings */}
                  <div className="absolute inset-0 rounded-full pointer-events-none" aria-hidden="true"
                    style={{
                      background: "radial-gradient(circle, rgba(201,164,76,0.06) 0%, transparent 65%)",
                      filter: "blur(20px)",
                    }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            CLOSING — WHICH IS RIGHT FOR YOU?
        ════════════════════════════════════════════════ */}
        <section
          className="relative py-36 px-6 overflow-hidden"
          style={{
            background: [
              "radial-gradient(ellipse 55% 40% at 50% 100%, rgba(201,162,77,0.06) 0%, transparent 65%)",
              "#0b0c0d",
            ].join(", "),
          }}
        >
          {/* Floor ambient */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none" aria-hidden="true"
            style={{
              width: 700, height: 250,
              background: "radial-gradient(ellipse, rgba(201,162,77,0.05) 0%, transparent 65%)",
              filter: "blur(50px)",
            }} />

          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mb-14" />

            <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.6em] uppercase mb-7">
              Your Next Step
            </p>

            <h2 className="font-headline font-bold uppercase leading-[0.88] tracking-tight text-white mb-12"
              style={{ fontSize: "clamp(2.6rem, 7.5vw, 5.5rem)" }}>
              Which Coaching<br />Experience Is<br />
              <span className="text-[#C9A24D]">Right For You?</span>
            </h2>

            <div className="space-y-5 text-gray-500 text-sm leading-relaxed max-w-lg mx-auto mb-14">
              <p>
                Every client begins with a complimentary Strategy Call.
              </p>
              <p>
                We don&apos;t believe in forcing clients into pre-built programs. Instead, we learn
                about your goals, lifestyle, schedule, and vision before recommending the coaching
                experience that&apos;s the best fit for you.
              </p>
              <p>
                This allows us to provide personalized guidance from the very beginning.
              </p>
            </div>

            <Link
              href="/apply"
              className="inline-block bg-[#C9A24D] text-black font-bold tracking-[0.22em] text-[11px] px-16 py-5 uppercase hover:bg-[#D4B56A] transition-colors duration-300"
            >
              Apply for Coaching
            </Link>

            <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mt-14" />
          </div>
        </section>
      </main>
    </>
  );
}
