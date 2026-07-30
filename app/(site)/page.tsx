import Image from "next/image";
import Button from "@/components/Button";
import { FEATURES } from "./features";

/* ── Static data ─────────────────────────────────────── */

const attributes = [
  "Custom Programming",
  "Nutrition Guidance",
  "Weekly Check-Ins",
  "Direct Coach Access",
  "RD Collaboration Available",
];

const whoItIsFor = [
  {
    heading: "You've been training for a while — but your physique doesn't show it.",
    body: "Consistency without strategy produces a plateau. You need programming that's actually designed around your goals.",
  },
  {
    heading: "You know what to do. You just can't stay consistent without structure.",
    body: "Accountability is a system, not willpower. That's exactly what this program is built around.",
  },
  {
    heading: "You're tired of cookie-cutter programs that weren't built for you.",
    body: "Everything here is custom — your schedule, your equipment, your starting point, your goal.",
  },
  {
    heading: "You're ready to invest in an outcome, not another PDF program.",
    body: "Coaching is a commitment. If you're serious about your physique, we'll match that energy completely.",
  },
];

const coachingIncludes = [
  "Custom training program built around your schedule and equipment",
  "Nutrition guidance — strategy and habits, not a rigid meal plan",
  "Weekly check-ins with progress review and real-time adjustments",
  "Direct messaging access to your coach throughout the week",
  "Form feedback and technique coaching",
  "Program updates every 4–6 weeks as you advance",
  "RD collaboration available when appropriate",
];

const processSteps = [
  {
    num: "01",
    title: "Apply Online",
    desc: "Complete a short application so we understand your goals, history, and what's held you back.",
  },
  {
    num: "02",
    title: "Strategy Call",
    desc: "If it's a strong fit, we'll schedule a 20-minute call to align on your program and expectations.",
  },
  {
    num: "03",
    title: "Begin Coaching",
    desc: "Your custom program is built before you start. You show up. We provide the structure.",
  },
];


const metrics = [
  { value: "17+",   label: "Years of Expertise" },
  { value: "1:1",   label: "Personalized Coaching" },
  { value: "NPC",   label: "Competitive Athlete" },
  { value: "100%",  label: "Custom Programming" },
];

/* ── Component ───────────────────────────────────────── */

export default function HomePage() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/images/jermaine-physique.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center scale-105"
        />
        {/* Multi-stop gradient: dark top for nav legibility → slight lift mid → full black at base */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-[#080909]" />
        <div className="absolute inset-0 bg-black/20" />

        <div className="relative z-10 text-center px-6 pt-16 max-w-4xl mx-auto w-full">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-7 uppercase">
            Application-Based Physique Coaching
          </p>

          <h1 className="font-headline text-6xl sm:text-7xl md:text-[90px] font-bold uppercase leading-none tracking-tight mb-8 text-white">
            Built to
            <br />
            <span className="text-[#C9A24D]">Get Results.</span>
          </h1>

          <p className="text-gray-300 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            Private physique coaching with custom programming, nutrition
            guidance, and the accountability that makes the difference.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button href="/apply" size="lg">
              Apply for Coaching
            </Button>
            <Button href="/about" size="lg" variant="outline">
              Meet Your Coach
            </Button>
          </div>

          <p className="mt-8 text-[11px] text-gray-600 tracking-[0.2em] uppercase">
            Limited spots available · Application required
          </p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
          <div className="w-px h-10 bg-white" />
          <p className="text-[9px] tracking-[0.4em] text-white">SCROLL</p>
        </div>
      </section>

      {/* ── ATTRIBUTES BAR ───────────────────────────────── */}
      <section className="bg-[#0c0e0f] border-y border-white/5 py-5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
            {attributes.map((attr) => (
              <span
                key={attr}
                className="flex items-center gap-2.5 text-sm text-gray-500"
              >
                <span className="w-1 h-1 rounded-full bg-[#C9A24D] shrink-0" />
                {attr}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESULTS ──────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#080909]">
        <div className="max-w-6xl mx-auto">

          {/* Section header */}
          <div className="text-center mb-16">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-4 uppercase">
              Real Results
            </p>
            <h2 className="font-headline text-4xl md:text-[56px] font-bold uppercase text-white leading-none mb-5">
              Transformations That Speak
            </h2>
            <p className="text-gray-400 text-base leading-relaxed max-w-xl mx-auto">
              Real clients. Real results. Real commitment.
            </p>
          </div>

          {/* 3-card grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Card 1: Maggie E. ── */}
            <div className="bg-[#141618] border border-white/5 flex flex-col">
              {/* Before / After side by side */}
              <div className="relative flex h-72 overflow-hidden">
                <div className="flex-1 relative">
                  <Image
                    src="/images/maggie_eaker_before.jpeg"
                    alt="Maggie E. — before"
                    fill
                    className="object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] tracking-[0.3em] font-semibold text-white/70 uppercase bg-black/55 py-1.5">
                    Before
                  </span>
                </div>
                <div className="flex-1 relative border-l border-black/50">
                  <Image
                    src="/images/maggie_eaker_after.jpeg"
                    alt="Maggie E. — after"
                    fill
                    className="object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] tracking-[0.3em] font-semibold text-[#C9A24D] uppercase bg-black/55 py-1.5">
                    After
                  </span>
                </div>
              </div>

              {/* Client identity */}
              <div className="px-5 py-3.5 border-t border-white/5 flex items-baseline justify-between gap-2">
                <p className="text-white font-semibold text-sm">Maggie E.</p>
                <p className="text-gray-500 text-[11px] shrink-0">Age 23 · Female · 12 months</p>
              </div>

              {/* Stats block */}
              <div className="flex border-t border-white/5">
                <div className="w-2/5 flex flex-col divide-y divide-white/5 border-r border-white/5">
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">Before</p>
                    <p className="text-white text-xs font-semibold">157 lbs</p>
                    <p className="text-gray-600 text-[11px]">27% body fat</p>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">After</p>
                    <p className="text-white text-xs font-semibold">128 lbs</p>
                    <p className="text-gray-600 text-[11px]">14% body fat</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-5">
                  <p className="font-headline text-2xl font-bold text-[#C9A24D] leading-none tracking-tight">
                    −29 LBS
                  </p>
                  <p className="text-[#C9A24D]/60 text-[10px] tracking-[0.25em] uppercase font-semibold mt-2">
                    Fat Loss
                  </p>
                </div>
              </div>

              {/* Card body */}
              <div className="p-6 flex flex-col gap-4 flex-1">
                <p className="text-gray-500 text-xs leading-relaxed flex-1">
                  Maggie came to Kynovant ready to lose body fat and improve her physique.
                  Halfway through her transformation, her confidence and results were so strong that
                  she decided to pursue competitive bodybuilding. Through consistent training, nutrition
                  structure, and accountability, she lost nearly 30 pounds while building visible muscle
                  definition and stepping into a completely new level of confidence.
                </p>
                <div className="border-t border-white/5 pt-4">
                  <p className="text-gray-400 text-xs leading-relaxed italic">
                    &ldquo;Working with Jermaine completely changed my approach to fitness. The
                    accountability, structure, and education helped me build habits that finally produced
                    lasting results. What started as a fat-loss goal eventually gave me the confidence to
                    pursue bodybuilding competition prep.&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* ── Card 2: Megi J. ── */}
            <div className="bg-[#141618] border border-white/5 flex flex-col">
              {/* Before / After side by side */}
              <div className="relative flex h-72 overflow-hidden">
                <div className="flex-1 relative">
                  <Image
                    src="/images/megi_jas_before.jpeg"
                    alt="Megi J. — before"
                    fill
                    className="object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] tracking-[0.3em] font-semibold text-white/70 uppercase bg-black/55 py-1.5">
                    Before
                  </span>
                </div>
                <div className="flex-1 relative border-l border-black/50">
                  <Image
                    src="/images/megi_jas_after.jpeg"
                    alt="Megi J. — after"
                    fill
                    className="object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] tracking-[0.3em] font-semibold text-[#C9A24D] uppercase bg-black/55 py-1.5">
                    After
                  </span>
                </div>
              </div>

              {/* Client identity */}
              <div className="px-5 py-3.5 border-t border-white/5 flex items-baseline justify-between gap-2">
                <p className="text-white font-semibold text-sm">Megi J.</p>
                <p className="text-gray-500 text-[11px] shrink-0">Age 27 · Female · 11 months</p>
              </div>

              {/* Stats block */}
              <div className="flex border-t border-white/5">
                <div className="w-2/5 flex flex-col divide-y divide-white/5 border-r border-white/5">
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">Before</p>
                    <p className="text-white text-xs font-semibold">Under 100 lbs</p>
                    <p className="text-gray-600 text-[11px]">low body weight</p>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">After</p>
                    <p className="text-white text-xs font-semibold">~110 lbs</p>
                    <p className="text-gray-600 text-[11px]">lean muscle gain</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-5">
                  <p className="font-headline text-2xl font-bold text-[#C9A24D] leading-none tracking-tight">
                    +10 LBS
                  </p>
                  <p className="text-[#C9A24D]/60 text-[10px] tracking-[0.25em] uppercase font-semibold mt-2">
                    Healthy Gain
                  </p>
                </div>
              </div>

              {/* Card body */}
              <div className="p-6 flex flex-col gap-4 flex-1">
                <p className="text-gray-500 text-xs leading-relaxed flex-1">
                  Megi&apos;s goal was to gain healthy weight and build lean muscle, but the biggest
                  transformation happened beyond the scale. Together, we rebuilt her relationship with
                  food, created consistent gym routines, prioritized hydration, improved sleep, and
                  managed stress. The result: a stronger body, more energy, and a completely different
                  level of confidence.
                </p>
                <div className="border-t border-white/5 pt-4">
                  <p className="text-gray-400 text-xs leading-relaxed italic">
                    &ldquo;Jermaine helped me completely fix my relationship with food, training, and
                    myself. I learned how to fuel my body, stay consistent in the gym, and take care of
                    my mental health. I gained healthy weight, built confidence, and finally created
                    routines I can stick to long-term.&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* ── Card 3: Joel R. — 2×3 before/after gallery ── */}
            <div className="bg-[#141618] border border-white/5 flex flex-col">
              {/* BEFORE row */}
              <div>
                <p className="text-[9px] tracking-[0.35em] font-semibold text-white/40 uppercase bg-[#0c0e0f] px-4 py-2 border-b border-white/5">
                  Before
                </p>
                <div className="grid grid-cols-3 h-36">
                  <div className="relative border-r border-black/50">
                    <Image
                      src="/images/joel_resto_before.jpeg"
                      alt="Joel R. — before 1"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                  <div className="relative border-r border-black/50">
                    <Image
                      src="/images/joel_resto_before2.jpeg"
                      alt="Joel R. — before 2"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                  <div className="relative">
                    <Image
                      src="/images/joel_resto_before3.jpeg"
                      alt="Joel R. — before 3"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                </div>
              </div>

              {/* AFTER row — slightly more visual weight than BEFORE */}
              <div className="border-t-2 border-[#C9A24D]/55">
                <p className="text-[9px] tracking-[0.35em] font-semibold text-[#C9A24D] uppercase bg-[#0c0e0f] px-4 py-2 border-b border-[#C9A24D]/15">
                  After
                </p>
                <div className="grid grid-cols-3 h-36 bg-[#C9A24D]/[0.03]">
                  <div className="relative border-r border-black/50">
                    <Image
                      src="/images/joel_resto_after.jpeg"
                      alt="Joel R. — after 1"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                  <div className="relative border-r border-black/50">
                    <Image
                      src="/images/joel_resto_after2.jpeg"
                      alt="Joel R. — after 2"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                  <div className="relative">
                    <Image
                      src="/images/joel_resto_after3.jpeg"
                      alt="Joel R. — after 3"
                      fill
                      className="object-cover object-center"
                    />
                  </div>
                </div>
              </div>

              {/* Client identity */}
              <div className="px-5 py-3.5 border-t border-white/5 flex items-baseline justify-between gap-2">
                <p className="text-white font-semibold text-sm">Joel R.</p>
                <p className="text-gray-500 text-[11px] shrink-0">Age 44 · Male · 6 months</p>
              </div>

              {/* Stats block */}
              <div className="flex border-t border-white/5">
                <div className="w-2/5 flex flex-col divide-y divide-white/5 border-r border-white/5">
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">Before</p>
                    <p className="text-white text-xs font-semibold">Higher</p>
                    <p className="text-gray-600 text-[11px]">body fat</p>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] mb-1">After</p>
                    <p className="text-white text-xs font-semibold">Lean</p>
                    <p className="text-gray-600 text-[11px]">+ stronger</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-5">
                  <p className="font-headline text-2xl font-bold text-[#C9A24D] leading-none tracking-tight">
                    STRONGER
                  </p>
                  <p className="text-[#C9A24D]/60 text-[10px] tracking-[0.25em] uppercase font-semibold mt-2">
                    Leaner
                  </p>
                </div>
              </div>

              {/* Card body */}
              <div className="p-6 flex flex-col gap-4 flex-1">
                <p className="text-gray-500 text-xs leading-relaxed flex-1">
                  At 44 years old, Joel wanted to get stronger, leaner, and feel better in his own
                  skin. We built a plan that fit his busy work schedule and focused on sustainable
                  habits, progressive training, and smart nutrition. The result was a stronger
                  physique, better confidence, and a body he feels proud of.
                </p>
                <div className="border-t border-white/5 pt-4">
                  <p className="text-gray-400 text-xs leading-relaxed italic">
                    &ldquo;Jermaine has amazing knowledge on fitness. He got me into a diet plan and
                    workout plan that works for my work schedule and helped me get stronger from where
                    I was before. I&apos;m 44 years old and feel and look great for my age.&rdquo;
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── WHO IS THIS FOR ──────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              Is This For You?
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
              Built for People Ready to Commit.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {whoItIsFor.map((item) => (
              <div
                key={item.heading}
                className="border-l-2 border-[#C9A24D]/40 pl-6 py-5 pr-6 bg-[#141618]/60"
              >
                <h3 className="text-white font-semibold leading-snug mb-2 text-[15px]">
                  {item.heading}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button href="/apply" size="lg">
              Apply for Coaching
            </Button>
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              The Program
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-6">
              One Program.
              <br />
              Everything You Need.
            </h2>
            <p className="text-gray-400 leading-relaxed mb-8 text-sm">
              We don't sell modules, tiers, or add-ons. When you're accepted
              into Kynovant, you get the full program — built around
              you, not a template someone else used.
            </p>
            <Button href="/apply">Apply for Coaching</Button>
          </div>

          {/* Right: checklist */}
          <div className="space-y-4">
            {coachingIncludes.map((item) => (
              <div key={item} className="flex items-start gap-3.5">
                <svg
                  className="shrink-0 mt-0.5"
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M2.5 8.5l3.5 3.5 7-7"
                    stroke="#C9A24D"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-gray-300 text-sm leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COACH CREDENTIALS / METRICS ─────────────────── */}
      <section className="py-20 px-6 bg-[#0c0e0f] border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {metrics.map((metric, i) => (
              <div
                key={metric.label}
                className={[
                  "flex flex-col items-center text-center px-8 py-10 gap-4",
                  // mobile 2-col: right border on left column, top border on bottom row
                  i % 2 === 0 ? "border-r border-white/[0.07]" : "",
                  i >= 2     ? "border-t border-white/[0.07]" : "",
                  // desktop 4-col: right border on first 3, clear top borders
                  i < 3  ? "md:border-r md:border-white/[0.07]" : "md:border-r-0",
                  i >= 2 ? "md:border-t-0" : "",
                ].filter(Boolean).join(" ")}
              >
                <p className="font-headline text-5xl md:text-6xl lg:text-7xl font-bold leading-none tracking-tight text-[#C9A24D]">
                  {metric.value}
                </p>
                <div className="w-6 h-px bg-[#C9A24D]/35" />
                <p className="text-gray-400 text-[11px] md:text-xs font-semibold tracking-[0.2em] leading-snug uppercase">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MEET THE COACH ───────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Photo */}
          <div className="flex justify-center md:justify-start">
            <div className="relative w-72 md:w-80 lg:w-[340px] overflow-hidden aspect-[3/4]">
              <Image
                src="/images/jermaine-headshot.jpg"
                alt="Jermaine Jones — Founder & Head Coach, Kynovant"
                fill
                className="object-cover object-top"
              />
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              Founder & Head Coach
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-1">
              Jermaine Jones
            </h2>
            <p className="text-[#C9A24D] text-sm tracking-wide mb-7">
              NFPT-CPT · NPC Competitive Bodybuilder
            </p>

            <div className="space-y-4 text-gray-400 text-sm leading-relaxed mb-8">
              <p>
                My approach to coaching comes from a simple observation: most
                people already know what they should be doing. The real gap is
                structure, accountability, and a program that actually fits
                their life.
              </p>
              <p>
                As an NPC competitive bodybuilder, I understand physique
                transformation at every level — from first-time fat loss to
                stage-ready conditioning. That experience is what I bring to
                every client I coach.
              </p>
            </div>

            <Button href="/about" variant="outline">
              Full Bio
            </Button>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              The Process
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
              How It Works.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
            {processSteps.map((step, i) => (
              <div
                key={step.num}
                className="relative p-8 border border-white/5 bg-[#141618]"
              >
                {/* Connector line between steps */}
                {i < processSteps.length - 1 && (
                  <div className="hidden md:block absolute top-10 -right-2.5 w-5 h-px bg-[#C9A24D]/25 z-10" />
                )}
                <p className="font-headline text-5xl font-bold text-[#C9A24D]/15 mb-5 leading-none">
                  {step.num}
                </p>
                <h3 className="text-white font-semibold text-lg mb-3">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Button href="/apply" size="lg">
              Start Your Application
            </Button>
          </div>
        </div>
      </section>

      {/* ── CLIENT RESULTS ── hidden until FEATURES.CLIENT_RESULTS = true ── */}
      {FEATURES.CLIENT_RESULTS && (
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
                Client Results
              </p>
              <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
                Real People. Real Transformations.
              </h2>
            </div>
            {/* TODO: Replace placeholders with real testimonials */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="border border-white/5 bg-[#141618] p-8 flex flex-col gap-6"
                >
                  <p className="text-gray-400 text-sm leading-relaxed flex-1">
                    "Replace this with a real client testimonial. Keep it
                    specific — mention the goal, the timeframe, and what
                    changed."
                  </p>
                  <div className="border-t border-white/5 pt-5">
                    <p className="text-white text-sm font-semibold">Client Name</p>
                    <p className="text-gray-600 text-xs mt-1">Goal · Timeframe</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#141618] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-10" />
          <h2 className="font-headline text-4xl md:text-6xl font-bold uppercase text-white mb-6">
            Ready to Stop{" "}
            <span className="text-[#C9A24D]">Guessing?</span>
          </h2>
          <p className="text-gray-400 text-base leading-relaxed mb-10">
            Spots are limited. If you're serious about your physique and ready
            to commit, submit your application and we'll be in touch within 48
            hours.
          </p>
          <Button href="/apply" size="lg">
            Apply for Coaching
          </Button>
          <p className="mt-5 text-[11px] text-gray-700 tracking-wide">
            No commitment required to apply · Every application reviewed personally
          </p>
        </div>
      </section>
    </main>
  );
}
