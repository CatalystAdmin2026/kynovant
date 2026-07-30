import type { Metadata } from "next";
import Link from "next/link";
import { STRIPE_LINKS, EXECUTIVE_INCLUDES } from "@/lib/enrollment";

export const metadata: Metadata = {
  title: "Executive Performance Enrollment — Kynovant",
  description: "Enter Executive Performance. Elite, concierge-level coaching for high-performance individuals.",
  robots: { index: false, follow: false },
};

export default function ExecutivePerformanceEnrollPage() {
  return (
    <>
      <style>{`
        @keyframes ep-fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ep-shimmer {
          0%,100% { box-shadow: 0 0 0 0 rgba(201,164,76,0); }
          50%      { box-shadow: 0 0 36px 6px rgba(201,164,76,0.28), 0 0 72px 12px rgba(201,164,76,0.09); }
        }
        @keyframes ep-ring-pulse {
          0%,100% { opacity: 0.18; transform: scale(1); }
          50%      { opacity: 0.05; transform: scale(1.14); }
        }
        .ep-f0 { opacity:0; animation: ep-fade-up 1s ease forwards; }
        .ep-f1 { opacity:0; animation: ep-fade-up 1s 0.13s ease forwards; }
        .ep-f2 { opacity:0; animation: ep-fade-up 1s 0.26s ease forwards; }
        .ep-f3 { opacity:0; animation: ep-fade-up 1s 0.39s ease forwards; }
        .ep-f4 { opacity:0; animation: ep-fade-up 1s 0.52s ease forwards; }
        .ep-f5 { opacity:0; animation: ep-fade-up 1s 0.66s ease forwards; }
        .ep-shimmer { animation: ep-shimmer 4s ease-in-out 0.8s infinite; }
        .ep-ring    { animation: ep-ring-pulse 4s ease-in-out infinite; }
        .ep-include-row {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 240ms ease;
        }
        .ep-include-row:hover {
          background: rgba(201,164,76,0.03);
        }
      `}</style>

      <main className="bg-[#080909] overflow-x-hidden">

        {/* ══════════════════════════════════════════════════
            HERO — cinematic split layout
        ══════════════════════════════════════════════════ */}
        <section className="relative min-h-screen flex bg-[#080706]">

          <div className="absolute inset-0 bg-[#080706]" />

          {/* Right-side luxury architectural prism */}
          <div className="absolute inset-y-0 right-0 w-full lg:w-[50%] pointer-events-none overflow-hidden" aria-hidden="true">
            <div className="absolute inset-0" style={{ background: "#0a0906" }} />
            <div className="absolute inset-0" style={{
              background: [
                "radial-gradient(ellipse 90% 70% at 80% 18%, rgba(201,164,76,0.22) 0%, rgba(201,164,76,0.06) 45%, transparent 68%)",
                "radial-gradient(ellipse 50% 80% at 100% 72%, rgba(201,164,76,0.12) 0%, transparent 50%)",
              ].join(", "),
            }} />
            <div className="absolute inset-0" style={{
              background: "linear-gradient(122deg, transparent 0%, rgba(201,164,76,0.04) 18%, rgba(201,164,76,0.18) 44%, rgba(201,164,76,0.10) 62%, rgba(201,164,76,0.03) 78%, transparent 92%)",
              clipPath: "polygon(18% 0%, 100% 0%, 100% 100%, 8% 100%)",
            }} />
            <div className="absolute inset-0" style={{
              background: "linear-gradient(118deg, transparent 0%, rgba(201,164,76,0.08) 25%, rgba(201,164,76,0.28) 48%, rgba(201,164,76,0.12) 62%, transparent 80%)",
              clipPath: "polygon(32% 0%, 100% 0%, 100% 100%, 22% 100%)",
            }} />
            <div className="absolute inset-0" style={{
              background: "linear-gradient(115deg, transparent 0%, rgba(201,164,76,0.35) 48%, rgba(201,164,76,0.55) 52%, rgba(201,164,76,0.20) 58%, transparent 70%)",
              clipPath: "polygon(42% 0%, 52% 0%, 38% 100%, 28% 100%)",
            }} />
            <div className="absolute" style={{
              top: "8%", right: "8%", width: 420, height: 420,
              background: "radial-gradient(circle, rgba(201,164,76,0.48) 0%, rgba(201,164,76,0.20) 22%, rgba(201,164,76,0.06) 48%, transparent 68%)",
              filter: "blur(40px)",
            }} />
            <div className="absolute" style={{
              top: "14%", right: "14%", width: 160, height: 160,
              background: "radial-gradient(circle, rgba(201,164,76,0.32) 0%, transparent 70%)",
              filter: "blur(18px)",
            }} />
            <div className="absolute" style={{
              top: "6%", bottom: "12%", width: 1.5,
              left: "calc(100% - 42% - 1px)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(201,164,76,0.70) 20%, rgba(201,164,76,0.85) 52%, rgba(201,164,76,0.50) 78%, transparent 100%)",
            }} />
            <div className="absolute" style={{
              top: "18%", bottom: "22%", width: 1,
              left: "calc(100% - 58%)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(201,164,76,0.35) 30%, rgba(201,164,76,0.45) 60%, transparent 100%)",
            }} />
            <div className="absolute" style={{
              top: 0, bottom: 0, left: 0, right: 0,
              background: "linear-gradient(112deg, transparent 38%, rgba(201,164,76,0.06) 43%, rgba(201,164,76,0.14) 46%, rgba(201,164,76,0.06) 49%, transparent 54%)",
            }} />
            <div className="absolute bottom-0 left-0 right-0 h-40" style={{
              background: "linear-gradient(to top, rgba(201,164,76,0.07) 0%, transparent 100%)",
            }} />
            <div className="absolute inset-y-0 left-0 w-56" style={{
              background: "linear-gradient(to right, #080706 30%, rgba(8,7,6,0.80) 55%, transparent 100%)",
            }} />
          </div>

          {/* Text content */}
          <div className="relative z-10 flex items-center min-h-screen w-full">
            <div className="w-full lg:w-[56%] px-6 md:px-12 lg:px-16 xl:px-24 2xl:px-32 pt-28 pb-20">

              {/* Diamond icon */}
              <div className="ep-f0 flex lg:block justify-center mb-10">
                <div className="relative inline-flex">
                  <div className="ep-ring absolute inset-0 rounded-full border border-[#C9A44C]" style={{ inset: -16 }} />
                  <div className="ep-shimmer w-[76px] h-[76px] rounded-full border border-[#C9A44C]/55 flex items-center justify-center">
                    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                      <path d="M13 3L22 10L13 23L4 10Z" stroke="#C9A44C" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M4 10H22" stroke="#C9A44C" strokeWidth="1.4" />
                    </svg>
                  </div>
                </div>
              </div>

              <p className="ep-f1 text-center lg:text-left text-[#C9A44C] text-[10px] font-semibold tracking-[0.70em] mb-5 uppercase">
                Enrollment
              </p>

              <h1 className="ep-f2 font-headline text-center lg:text-left font-bold uppercase leading-[0.88] tracking-tight mb-8 text-white"
                style={{ fontSize: "clamp(3.5rem, 9vw, 7rem)" }}>
                Executive<br />
                <span className="text-[#C9A44C]">Performance</span>
              </h1>

              <div className="ep-f3 flex lg:block justify-center mb-7">
                <div className="w-12 h-px bg-[#C9A44C]/40" />
              </div>

              <p className="ep-f3 text-center lg:text-left text-gray-200 text-lg md:text-xl font-light tracking-wide mb-5">
                Elite, concierge-level coaching for high-performance individuals.
              </p>

              <p className="ep-f4 text-center lg:text-left text-gray-500 text-[14px] md:text-[15px] leading-relaxed max-w-lg mb-12 mx-auto lg:mx-0">
                Reserved for executives, founders, and driven professionals who
                demand results that match their standards — and are ready to
                invest at that level.
              </p>

              <div className="ep-f5 flex lg:block justify-center">
                <div className="inline-block border-l-2 border-[#C9A44C]/28 pl-6">
                  <p className="text-white font-semibold text-sm tracking-wide italic mb-1">Jermaine Jones</p>
                  <p className="text-[#C9A44C] text-[11px] tracking-[0.22em] uppercase mb-1">Founder &amp; Head Coach</p>
                  <p className="text-gray-600 text-[11px] tracking-wide">NFPT-CPT &nbsp;·&nbsp; NPC Competitive Bodybuilder</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 lg:left-16 lg:translate-x-0 xl:left-24 flex flex-col items-center gap-2 opacity-25" aria-hidden="true">
            <div className="w-px h-10 bg-[#C9A44C]" />
            <p className="text-[9px] tracking-[0.55em] text-[#C9A44C]">SCROLL</p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            PRICING & CTA
        ══════════════════════════════════════════════════ */}
        <section className="py-28 px-6 bg-[#0b0c0d]">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-start">

              {/* Left — what this is */}
              <div>
                <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-6 uppercase">
                  The Program
                </p>
                <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none mb-8">
                  Everything You Need.<br />
                  <span className="text-[#C9A44C]">Nothing Left Out.</span>
                </h2>
                <div className="space-y-4 text-gray-500 text-sm leading-relaxed mb-10">
                  <p>
                    Executive Performance is the most complete coaching system we offer.
                    Every service, every capability, and every resource — fully activated
                    from day one.
                  </p>
                  <p>
                    You also receive an InBody Dial H30 body composition analyzer shipped
                    directly to you at no additional cost. Weekly scans drive precise
                    adjustments to your nutrition, training, and performance strategy.
                  </p>
                  <p>
                    Members who remain enrolled for 24 consecutive months receive a
                    complimentary SaunaBox Solara Full Spectrum Infrared Sauna as a
                    Legacy anniversary gift.
                  </p>
                </div>

                {/* Trust signals */}
                <div className="space-y-3">
                  {[
                    "InBody Dial H30 — shipped upon enrollment",
                    "Concierge-level priority response",
                    "No long-term contract required",
                    "Secure checkout via Stripe",
                  ].map((line) => (
                    <div key={line} className="flex items-center gap-3">
                      <div className="w-px h-4 bg-[#C9A44C]/30 shrink-0" />
                      <p className="text-gray-500 text-xs tracking-wide">{line}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — pricing card */}
              <div>
                <div className="border border-[#C9A44C]/25 bg-[#080909] relative overflow-hidden">
                  {/* Gold top accent */}
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-[#C9A44C]/60 to-transparent" />

                  <div className="px-8 py-10">
                    <p className="text-[#C9A44C] text-[10px] tracking-[0.5em] uppercase font-semibold mb-4">
                      Investment
                    </p>

                    <div className="flex items-end gap-2 mb-1">
                      <span className="font-headline font-bold text-white leading-none"
                        style={{ fontSize: "clamp(3.2rem, 10vw, 5rem)" }}>
                        $1,500
                      </span>
                      <span className="text-gray-500 text-sm mb-3">/mo</span>
                    </div>

                    <p className="text-gray-600 text-xs mb-8 leading-relaxed">
                      Includes InBody Dial H30. Cancel anytime.
                    </p>

                    <Link
                      href={STRIPE_LINKS.executive}
                      className="block w-full bg-[#C9A44C] text-black font-bold tracking-[0.18em] text-[11px] px-8 py-5 uppercase text-center hover:bg-[#D4B56A] transition-colors duration-200"
                    >
                      Enter Executive Performance
                    </Link>

                    <p className="text-gray-700 text-[10px] text-center mt-4 tracking-wide">
                      Secure checkout · Powered by Stripe
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            EVERYTHING INCLUDED
        ══════════════════════════════════════════════════ */}
        <section className="py-24 px-6 bg-[#080909]">
          <div className="max-w-5xl mx-auto">

            <div className="text-center mb-14">
              <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-4 uppercase">
                Full Scope
              </p>
              <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
                Everything Included
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-0">
              {EXECUTIVE_INCLUDES.map((item) => (
                <div key={item} className="ep-include-row flex items-center gap-4 py-[15px]">
                  <div className="shrink-0">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2.5 8.5l3.5 3.5 7-7" stroke="#C9A44C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-gray-300 text-sm leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            CLOSING
        ══════════════════════════════════════════════════ */}
        <section
          className="relative py-36 px-6 overflow-hidden"
          style={{
            background: [
              "radial-gradient(ellipse 60% 40% at 50% 90%, rgba(201,164,76,0.06) 0%, transparent 65%)",
              "#080909",
            ].join(", "),
          }}
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none" style={{
            width: 640, height: 220,
            background: "radial-gradient(ellipse, rgba(201,164,76,0.07) 0%, transparent 65%)",
            filter: "blur(48px)",
          }} aria-hidden="true" />

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <div className="w-8 h-px bg-[#C9A44C]/35 mx-auto mb-12" />

            <h2 className="font-headline font-bold uppercase leading-[0.88] tracking-tight mb-12">
              <span className="block text-white" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                Performance
              </span>
              <span className="block text-white" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                at Every
              </span>
              <span className="block text-[#C9A44C]" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                Level.
              </span>
            </h2>

            <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-14">
              This program exists for people who refuse to leave anything to chance.
              If that&apos;s you — the spot is yours.
            </p>

            <Link
              href={STRIPE_LINKS.executive}
              className="inline-block bg-[#C9A44C] text-black font-bold tracking-[0.22em] text-[11px] px-16 py-5 uppercase hover:bg-[#D4B56A] transition-colors duration-300"
            >
              Enter Executive Performance
            </Link>

            <div className="w-8 h-px bg-[#C9A44C]/35 mx-auto mt-12" />
          </div>
        </section>
      </main>
    </>
  );
}
