import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Mail, ClipboardList, Phone, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Executive Performance Confirmed | Kynovant",
  description:
    "Your Executive Performance program is now active. Welcome to the team.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Executive Performance Confirmed | Kynovant",
    description: "You're officially inside Executive Performance.",
    siteName: "Kynovant",
  },
};

/* ── Data ──────────────────────────────────────────────── */

type Step = { num: string; Icon: LucideIcon; title: string; desc: string };

const steps: Step[] = [
  {
    num: "01",
    Icon: Mail,
    title: "Check Your Email",
    desc: "You'll receive your Executive Welcome email within the next few minutes containing everything needed to begin.",
  },
  {
    num: "02",
    Icon: ClipboardList,
    title: "Complete Executive Onboarding",
    desc: "Complete your Executive Performance onboarding questionnaire so we can begin building every aspect of your customized coaching system.",
  },
  {
    num: "03",
    Icon: Phone,
    title: "Executive Strategy Call",
    desc: "We'll personally schedule your Executive Strategy Call to discuss goals, review your assessment, and map out your performance roadmap.",
  },
  {
    num: "04",
    Icon: Zap,
    title: "We Get to Work",
    desc: "Once onboarding is complete, your coaching team begins building your customized systems, nutrition strategy, training program, and ongoing optimization plan.",
  },
];

const perks: string[] = [
  "Unlimited Priority Concierge Support",
  "Unlimited Messaging",
  "Unlimited Program Updates",
  "Registered Dietitian Designed Nutrition",
  "Weekly InBody Reviews",
  "Bloodwork Analysis & Optimization",
  "Quarterly Executive Strategy Sessions",
  "Restaurant & Dining Strategy",
  "Travel Nutrition Planning",
  "Recovery & Lifestyle Optimization",
  "Priority Response Times",
  "Personalized Supplement Protocols",
  "InBody Dial H30 Included",
  "Legacy Loyalty Rewards",
];

/* ── Page ──────────────────────────────────────────────── */

export default async function ExecutivePerformanceConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string }>;
}) {
  const { access } = await searchParams;
  const showBlockedMessage = access === "required";

  return (
    <>
      <style>{`
        @keyframes ep-fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ep-shimmer {
          0%,100% { box-shadow: 0 0 0 0 rgba(201,164,76,0); }
          50%      { box-shadow: 0 0 36px 6px rgba(201,164,76,0.30), 0 0 72px 12px rgba(201,164,76,0.10); }
        }
        @keyframes ep-ring-pulse {
          0%,100% { opacity: 0.20; transform: scale(1); }
          50%      { opacity: 0.06; transform: scale(1.14); }
        }
        .ep-f0 { opacity:0; animation: ep-fade-up 1s ease forwards; }
        .ep-f1 { opacity:0; animation: ep-fade-up 1s 0.13s ease forwards; }
        .ep-f2 { opacity:0; animation: ep-fade-up 1s 0.26s ease forwards; }
        .ep-f3 { opacity:0; animation: ep-fade-up 1s 0.39s ease forwards; }
        .ep-f4 { opacity:0; animation: ep-fade-up 1s 0.52s ease forwards; }
        .ep-f5 { opacity:0; animation: ep-fade-up 1s 0.66s ease forwards; }
        .ep-shimmer { animation: ep-shimmer 4s ease-in-out 0.8s infinite; }
        .ep-ring    { animation: ep-ring-pulse 4s ease-in-out infinite; }

        /* Card hover — pure CSS so no client JS needed */
        .ep-card {
          border-top: 1.5px solid rgba(201,164,76,0.30);
          transition: background 320ms ease, box-shadow 320ms ease, transform 320ms ease;
        }
        .ep-card:hover {
          background: #0f1010 !important;
          box-shadow: 0 -2px 0 0 rgba(201,164,76,0.65), 0 16px 48px rgba(201,164,76,0.07);
          transform: translateY(-3px);
        }
        .ep-card:hover .ep-icon {
          border-color: rgba(201,164,76,0.40);
        }
        .ep-card:hover .ep-icon svg {
          color: #C9A44C !important;
        }
        .ep-icon { transition: border-color 320ms ease; }
        .ep-icon svg { transition: color 320ms ease; }
      `}</style>

      <main className="bg-[#080909] overflow-x-hidden">

        {showBlockedMessage && (
          <div className="fixed top-16 inset-x-0 z-40 bg-[#C9A44C]/[0.06] border-b border-[#C9A44C]/20 backdrop-blur-sm">
            <p className="text-[12px] text-[#C9A44C]/85 font-medium text-center px-6 py-3 tracking-wide">
              Onboarding access is available after payment is confirmed.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            HERO — cinematic split layout
        ══════════════════════════════════════════════════ */}
        <section className="relative min-h-screen flex bg-[#07060500]">

          {/* Deep matte black base */}
          <div className="absolute inset-0 bg-[#080706]" />

          {/* ── Right-side luxury architectural prism ── */}
          <div className="absolute inset-y-0 right-0 w-full lg:w-[50%] pointer-events-none overflow-hidden" aria-hidden="true">

            {/* Dark warm base */}
            <div className="absolute inset-0" style={{ background: "#0a0906" }} />

            {/* Ambient field — soft perimeter warmth */}
            <div className="absolute inset-0" style={{
              background: [
                "radial-gradient(ellipse 90% 70% at 80% 18%, rgba(201,164,76,0.22) 0%, rgba(201,164,76,0.06) 45%, transparent 68%)",
                "radial-gradient(ellipse 50% 80% at 100% 72%, rgba(201,164,76,0.12) 0%, transparent 50%)",
              ].join(", "),
            }} />

            {/* ── Facet A — large outer prism plane (sharp left edge) ── */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(122deg, transparent 0%, rgba(201,164,76,0.04) 18%, rgba(201,164,76,0.18) 44%, rgba(201,164,76,0.10) 62%, rgba(201,164,76,0.03) 78%, transparent 92%)",
              clipPath: "polygon(18% 0%, 100% 0%, 100% 100%, 8% 100%)",
            }} />

            {/* ── Facet B — inner bright plane, tighter angle ── */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(118deg, transparent 0%, rgba(201,164,76,0.08) 25%, rgba(201,164,76,0.28) 48%, rgba(201,164,76,0.12) 62%, transparent 80%)",
              clipPath: "polygon(32% 0%, 100% 0%, 100% 100%, 22% 100%)",
            }} />

            {/* ── Facet C — narrow highlight sliver (hardest edge, most defined) ── */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(115deg, transparent 0%, rgba(201,164,76,0.35) 48%, rgba(201,164,76,0.55) 52%, rgba(201,164,76,0.20) 58%, transparent 70%)",
              clipPath: "polygon(42% 0%, 52% 0%, 38% 100%, 28% 100%)",
            }} />

            {/* Hot spot — sharp concentrated source light */}
            <div className="absolute" style={{
              top: "8%", right: "8%", width: 420, height: 420,
              background: "radial-gradient(circle, rgba(201,164,76,0.48) 0%, rgba(201,164,76,0.20) 22%, rgba(201,164,76,0.06) 48%, transparent 68%)",
              filter: "blur(40px)",
            }} />

            {/* Tight core glow — unblurred centre point */}
            <div className="absolute" style={{
              top: "14%", right: "14%", width: 160, height: 160,
              background: "radial-gradient(circle, rgba(201,164,76,0.32) 0%, transparent 70%)",
              filter: "blur(18px)",
            }} />

            {/* Hard vertical edge A — primary reflective column */}
            <div className="absolute" style={{
              top: "6%", bottom: "12%", width: 1.5,
              left: "calc(100% - 42% - 1px)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(201,164,76,0.70) 20%, rgba(201,164,76,0.85) 52%, rgba(201,164,76,0.50) 78%, transparent 100%)",
            }} />

            {/* Hard vertical edge B — secondary inner column */}
            <div className="absolute" style={{
              top: "18%", bottom: "22%", width: 1,
              left: "calc(100% - 58%)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(201,164,76,0.35) 30%, rgba(201,164,76,0.45) 60%, transparent 100%)",
            }} />

            {/* Diagonal slash beam — architectural prism refraction */}
            <div className="absolute" style={{
              top: 0, bottom: 0, left: 0, right: 0,
              background: "linear-gradient(112deg, transparent 38%, rgba(201,164,76,0.06) 43%, rgba(201,164,76,0.14) 46%, rgba(201,164,76,0.06) 49%, transparent 54%)",
            }} />

            {/* Floor warmth */}
            <div className="absolute bottom-0 left-0 right-0 h-40" style={{
              background: "linear-gradient(to top, rgba(201,164,76,0.07) 0%, transparent 100%)",
            }} />

            {/* Left vignette — smooth blend into text area */}
            <div className="absolute inset-y-0 left-0 w-56" style={{
              background: "linear-gradient(to right, #080706 30%, rgba(8,7,6,0.80) 55%, transparent 100%)",
            }} />
          </div>

          {/* Text content area — left aligned on lg */}
          <div className="relative z-10 flex items-center min-h-screen w-full">
            <div className="w-full lg:w-[56%] px-6 md:px-12 lg:px-16 xl:px-24 2xl:px-32 pt-28 pb-20">

              {/* Checkmark */}
              <div className="ep-f0 flex lg:block justify-center mb-10">
                <div className="relative inline-flex">
                  <div className="ep-ring absolute inset-0 rounded-full border border-[#C9A44C]" style={{ inset: -16 }} />
                  <div className="ep-shimmer w-[76px] h-[76px] rounded-full border border-[#C9A44C]/55 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M5 14.5l5.5 5.5 12.5-12.5" stroke="#C9A44C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Eyebrow */}
              <p className="ep-f1 text-center lg:text-left text-[#C9A44C] text-[10px] font-semibold tracking-[0.70em] mb-5 uppercase">
                Welcome to
              </p>

              {/* Main headline */}
              <h1 className="ep-f2 font-headline text-center lg:text-left font-bold uppercase leading-[0.88] tracking-tight mb-8 text-white"
                style={{ fontSize: "clamp(3.5rem, 9vw, 7rem)" }}>
                Executive<br />
                <span className="text-[#C9A44C]">Performance</span>
              </h1>

              {/* Rule */}
              <div className="ep-f3 flex lg:block justify-center mb-7">
                <div className="w-12 h-px bg-[#C9A44C]/40" />
              </div>

              {/* Confirmed line */}
              <p className="ep-f3 text-center lg:text-left text-gray-200 text-lg md:text-xl font-light tracking-wide mb-5">
                Payment confirmed. You&apos;re officially inside.
              </p>

              {/* Body */}
              <p className="ep-f4 text-center lg:text-left text-gray-500 text-[14px] md:text-[15px] leading-relaxed max-w-lg mb-12 mx-auto lg:mx-0">
                Thank you for trusting Kynovant with your health,
                performance, and future. We&apos;re honored to build something
                extraordinary together.
              </p>

              {/* Signature */}
              <div className="ep-f5 flex lg:block justify-center">
                <div className="inline-block border-l-2 border-[#C9A44C]/28 pl-6">
                  <p className="text-white font-semibold text-sm tracking-wide italic mb-1">
                    Jermaine Jones
                  </p>
                  <p className="text-[#C9A44C] text-[11px] tracking-[0.22em] uppercase mb-1">
                    Founder &amp; Head Coach
                  </p>
                  <p className="text-gray-600 text-[11px] tracking-wide">
                    NFPT-CPT &nbsp;·&nbsp; NPC Competitive Bodybuilder
                  </p>
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
            WHAT HAPPENS NEXT
        ══════════════════════════════════════════════════ */}
        <section className="py-28 px-6 bg-[#0b0c0d]">
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-4 uppercase">
                Your Path Forward
              </p>
              <h2 className="font-headline text-4xl md:text-[56px] font-bold uppercase text-white leading-none">
                What Happens Next
              </h2>
            </div>

            {/* 4-column cards with gold top accent */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-white/[0.04]">
              {steps.map((step, i) => {
                const Icon = step.Icon;
                return (
                  <div
                    key={step.num}
                    className="ep-card group bg-[#0b0c0d] p-8 xl:p-10 flex flex-col"
                    style={{
                      borderRight: i < 3 ? "1px solid rgba(255,255,255,0.03)" : "none",
                    }}
                  >
                    {/* Icon circle */}
                    <div className="ep-icon w-11 h-11 rounded-full border border-white/[0.10] flex items-center justify-center mb-5">
                      <Icon size={18} style={{ color: "rgba(201,164,76,0.55)" }} />
                    </div>

                    {/* Ghost number */}
                    <p className="font-headline text-[68px] font-bold leading-none mb-4 -ml-1"
                      style={{ color: "rgba(201,164,76,0.18)" }}>
                      {step.num}
                    </p>

                    <h3 className="text-white font-semibold text-[13px] tracking-[0.05em] leading-snug mb-3 uppercase">
                      {step.title}
                    </h3>

                    <p className="text-gray-500 text-xs leading-relaxed mt-auto pt-3.5 border-t border-white/[0.04]">
                      {step.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            EXECUTIVE WELCOME KIT
        ══════════════════════════════════════════════════ */}
        <section className="py-24 px-6 bg-[#080909]">
          <div className="max-w-6xl mx-auto">

            <div className="text-center mb-16">
              <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-4 uppercase">
                Exclusive Member Benefit
              </p>
              <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
                Your Executive Welcome Kit
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-center">

              {/* InBody H30 — neutral dark panel so matte black product is visible */}
              <div>
                <div
                  className="relative overflow-hidden"
                  style={{
                    background: [
                      "radial-gradient(ellipse 70% 55% at 50% 65%, rgba(201,164,76,0.09) 0%, transparent 60%)",
                      "#252525",
                    ].join(", "),
                  }}
                >
                  {/* Product image */}
                  <div className="relative aspect-[3/4]">
                    <div className="absolute inset-2 md:inset-3">
                      <Image
                        src="/images/inbody-h30.png"
                        alt="InBody Dial H30 Body Composition Analyzer"
                        fill
                        priority
                        className="object-contain"
                        sizes="(max-width: 1024px) 90vw, 44vw"
                      />
                    </div>
                  </div>

                  {/* Floor gradient — depth */}
                  <div className="absolute bottom-0 left-0 right-0 h-20" style={{
                    background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent)",
                  }} />

                  {/* Branding strip */}
                  <div className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-center justify-between">
                    <span className="text-[9px] tracking-[0.4em] text-white/20 uppercase">Kynovant</span>
                    <span className="text-[9px] tracking-[0.3em] text-[#C9A44C]/30 uppercase">Executive Member</span>
                  </div>
                </div>

                {/* Product caption */}
                <div className="mt-4 px-1 flex items-baseline justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold tracking-wide">InBody Dial H30</p>
                    <p className="text-gray-600 text-[11px] mt-0.5">Body Composition Analyzer</p>
                  </div>
                  <p className="text-[#C9A44C] text-[10px] tracking-[0.3em] uppercase font-semibold">Complimentary</p>
                </div>
              </div>

              {/* Copy */}
              <div>
                <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-5 uppercase">
                  Shipment Confirmed
                </p>

                <h3 className="font-headline text-3xl md:text-[44px] font-bold uppercase text-white leading-none mb-8">
                  Your InBody Is<br />On the Way
                </h3>

                <p className="text-gray-400 text-sm leading-relaxed mb-8">
                  Your complimentary InBody Dial H30 has already been scheduled
                  for shipment. This device is included exclusively for Executive
                  Performance members.
                </p>

                {/* Delivery callout */}
                <div className="flex items-stretch gap-5 mb-8">
                  <div className="w-0.5 bg-[#C9A44C]/30 shrink-0 rounded-full" />
                  <div>
                    <p className="text-[10px] tracking-[0.4em] text-gray-600 uppercase mb-1">Estimated Delivery</p>
                    <p className="text-white font-bold text-xl tracking-wide">3–5 Business Days</p>
                  </div>
                </div>

                <div className="space-y-4 text-gray-500 text-sm leading-relaxed mb-8">
                  <p>
                    As soon as your device ships you&apos;ll automatically receive
                    tracking information by email.
                  </p>
                  <p>
                    Once it arrives, we&apos;ll use your weekly body composition
                    scans to guide precise adjustments to your nutrition, training,
                    and performance strategy every single week.
                  </p>
                </div>

                <div className="border border-[#C9A44C]/16 bg-[#C9A44C]/[0.03] px-6 py-4">
                  <p className="text-[#C9A44C] text-[10px] tracking-[0.4em] uppercase font-semibold">
                    Exclusive to Executive Performance Members
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            YOUR EXECUTIVE PERFORMANCE PACKAGE
        ══════════════════════════════════════════════════ */}
        <section className="py-24 px-6 bg-[#0b0c0d]">
          <div className="max-w-5xl mx-auto">

            <div className="text-center mb-14">
              <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-4 uppercase">
                Everything Included
              </p>
              <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
                Your Executive Performance Package
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-0">
              {perks.map((item) => (
                <div key={item} className="flex items-center gap-4 py-[15px] border-b border-white/[0.05]">
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
            THE LONG GAME — LEGACY REWARDS
        ══════════════════════════════════════════════════ */}
        <section className="py-28 px-6 bg-[#080909]">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 xl:gap-20 items-center">

              {/* Copy — left */}
              <div className="order-2 lg:order-1">
                <p className="text-[#C9A44C] text-[10px] font-semibold tracking-[0.6em] mb-5 uppercase">
                  Legacy Rewards
                </p>

                <h2 className="font-headline text-5xl md:text-6xl xl:text-[76px] font-bold uppercase text-white leading-none mb-8">
                  The Long Game
                </h2>

                <div className="space-y-5 text-gray-500 text-sm leading-relaxed mb-10">
                  <p>
                    Executive Performance was built for individuals committed to
                    elite performance over years—not weeks.
                  </p>
                  <p>
                    As a thank-you for your long-term commitment, members who
                    remain enrolled for{" "}
                    <span className="text-gray-200 font-semibold">24 consecutive months</span>{" "}
                    receive a complimentary{" "}
                    <span className="text-gray-200 font-semibold">
                      SaunaBox Solara Full Spectrum Infrared Sauna
                    </span>{" "}
                    as our anniversary gift.
                  </p>
                  <p>
                    This symbolizes our commitment to investing in your recovery,
                    longevity, and continued success. This benefit is exclusive
                    to Executive Performance members.
                  </p>
                </div>

                {/* 24-month callout */}
                <div className="flex items-center gap-5 border border-white/[0.06] bg-white/[0.015] px-6 py-5">
                  <p className="font-headline text-[42px] font-bold leading-none shrink-0"
                    style={{ color: "rgba(201,164,76,0.28)" }}>24</p>
                  <div className="border-l border-white/[0.06] pl-5">
                    <p className="text-[#C9A44C] text-[10px] tracking-[0.35em] uppercase font-semibold mb-1">Month Anniversary Gift</p>
                    <p className="text-gray-500 text-xs leading-relaxed">
                      Earned through 24 consecutive months of Executive Performance enrollment.
                    </p>
                  </div>
                </div>
              </div>

              {/* SaunaBox product — warm dark panel for contrast with matte black */}
              <div className="order-1 lg:order-2">
                <div
                  className="relative overflow-hidden"
                  style={{
                    background: [
                      "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(160,45,15,0.14) 0%, transparent 60%)",
                      "radial-gradient(ellipse 80% 70% at 50% 70%, rgba(201,164,76,0.05) 0%, transparent 55%)",
                      "#1e1b16",
                    ].join(", "),
                  }}
                >
                  <div className="relative aspect-[4/5]">
                    <div className="absolute inset-6 md:inset-10">
                      <Image
                        src="/images/saunabox-solara-product.png"
                        alt="SaunaBox Solara Full Spectrum Infrared Sauna — 24-Month Anniversary Gift"
                        fill
                        priority
                        className="object-contain drop-shadow-[0_0_48px_rgba(160,45,15,0.45)]"
                        sizes="(max-width: 1024px) 90vw, 44vw"
                      />
                    </div>
                  </div>

                  {/* Floor reflection — warm red echo */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none" style={{
                    background: "linear-gradient(to top, rgba(140,35,10,0.12), transparent)",
                  }} />

                  {/* Branding strip */}
                  <div className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-center justify-between">
                    <span className="text-[9px] tracking-[0.4em] text-white/15 uppercase">SaunaBox®</span>
                    <span className="text-[9px] tracking-[0.3em] text-[#C9A44C]/25 uppercase">Solara</span>
                  </div>
                </div>

                {/* Product caption */}
                <div className="mt-4 px-1 flex items-baseline justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold tracking-wide">SaunaBox Solara</p>
                    <p className="text-gray-600 text-[11px] mt-0.5">Full Spectrum Infrared Sauna</p>
                  </div>
                  <p className="text-[#C9A44C] text-[10px] tracking-[0.28em] uppercase font-semibold text-right">24-Month<br />Anniversary Gift</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            CLOSING — YOU DIDN'T COME THIS FAR TO BE AVERAGE
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
          {/* Ambient floor glow */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: 640, height: 220,
              background: "radial-gradient(ellipse, rgba(201,164,76,0.07) 0%, transparent 65%)",
              filter: "blur(48px)",
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <div className="w-8 h-px bg-[#C9A44C]/35 mx-auto mb-12" />

            <h2 className="font-headline font-bold uppercase leading-[0.88] tracking-tight mb-12">
              <span className="block text-white" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                You Didn&apos;t Come
              </span>
              <span className="block text-white" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                This Far
              </span>
              <span className="block text-[#C9A44C]" style={{ fontSize: "clamp(2.8rem, 8.5vw, 6.5rem)" }}>
                To Be Average.
              </span>
            </h2>

            <div className="space-y-2 text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-4">
              <p>Elite performance isn&apos;t built through motivation.</p>
              <p>It&apos;s built through consistency, precision, and relentless execution.</p>
            </div>

            <p className="text-gray-300 text-sm font-medium tracking-[0.18em] uppercase mb-14">
              Welcome to the team.
            </p>

            <div className="w-8 h-px bg-[#C9A44C]/35 mx-auto mb-12" />

            <Link
              href="/"
              className="inline-block bg-[#C9A44C] text-black font-bold tracking-[0.22em] text-[11px] px-16 py-5 uppercase hover:bg-[#D4B56A] transition-colors duration-300"
            >
              Return to Home
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
