import Image from "next/image";
import type { Metadata } from "next";
import Button from "@/components/Button";

// Kept Performance homepage — the public root ("/") for the
// catalystcoachingelite.com domain (still the live domain today; see
// docs/domain-architecture.md for the keptperformance.com cutover
// plan) and the shared fallback for any unrecognized host
// (localhost, *.vercel.app previews) per proxy.ts's resolveBrand().
// Previously this route rendered KynovantHomeContent as a stand-in —
// see git history (bb7c792, afc73e8) for that earlier state. Now a
// real, complete Kept Performance homepage, matching the same
// "always show a finished page, never a stub" reasoning that
// justified the old fallback.
export const metadata: Metadata = {
  title: "Kept Performance",
  description:
    "You made the promise. Keep it. Precision coaching built around training, nutrition, accountability, and consistent execution.",
  openGraph: {
    title: "Kept Performance",
    description:
      "Precision coaching built around training, nutrition, accountability, and consistent execution.",
    siteName: "Kept Performance",
  },
};

const whoItsFor = [
  "You've set the goal — you need the structure to actually hit it",
  "You want a program built around your real schedule, not a template",
  "You know what consistency requires, and you want someone holding the line with you",
  "You're ready to commit to a process, not chase another 30-day reset",
];

const howItWorks = [
  {
    num: "01",
    title: "Apply",
    body: "Tell us where you are and where you're trying to go. Every application is read personally.",
  },
  {
    num: "02",
    title: "Strategy Call",
    body: "A short, direct conversation to confirm fit before anything is built.",
  },
  {
    num: "03",
    title: "Your Program",
    body: "Training, nutrition, and check-in structure built around your life — not repurposed from someone else's.",
  },
  {
    num: "04",
    title: "Keep It",
    body: "Weekly accountability, direct coach access, and a system built to survive the weeks motivation doesn't show up.",
  },
];

const whyKept = [
  {
    title: "Adherence Over Intensity",
    body: "The best program is the one you actually follow. Every plan is built to fit the life you have, not the one you wish you had.",
  },
  {
    title: "Accountability Is the Product",
    body: "Weekly check-ins and direct coach access aren't extras — they're the mechanism that turns a good plan into a kept promise.",
  },
  {
    title: "Measured, Not Guessed",
    body: "Progress is tracked, reviewed, and adjusted on a real cadence — not left to hope.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative pt-40 pb-28 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[#0c0e0f]" />
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(201,162,77,0.08) 0%, transparent 65%)",
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.5em] mb-6 uppercase">
            Kept Performance
          </p>
          <h1 className="font-headline text-5xl md:text-7xl font-bold uppercase text-white leading-[0.95] mb-8">
            You Made the Promise.
            <br />
            <span className="text-[#C9A24D]">Keep It.</span>
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-base md:text-lg leading-relaxed mb-12">
            Precision coaching built around training, nutrition support,
            accountability, and consistent execution — for people done
            starting over and ready to follow through.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/apply" size="lg">
              Apply for Coaching
            </Button>
            <Button href="/thank-you" variant="outline" size="lg">
              Book a Strategy Call
            </Button>
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f] border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
            Who This Is For
          </p>
          <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-12">
            Built For Follow-Through.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-3xl mx-auto">
            {whoItsFor.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <svg
                  className="shrink-0 mt-0.5"
                  width="14"
                  height="14"
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
                <p className="text-gray-300 text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW COACHING WORKS ───────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              The Process
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
              How Coaching Works.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {howItWorks.map((step) => (
              <div key={step.num} className="p-7 border border-white/5 bg-[#141618]">
                <span className="font-headline text-2xl font-bold text-[#C9A24D]/30 leading-none block mb-5">
                  {step.num}
                </span>
                <h3 className="text-white font-semibold text-base mb-3">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY KEPT ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              The Standard
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
              Why Kept.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {whyKept.map((item) => (
              <div key={item.title} className="p-8 border border-white/5 bg-[#141618]">
                <div className="w-6 h-0.5 bg-[#C9A24D] mb-6" />
                <h3 className="text-white font-semibold text-base mb-3">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KYNOVANT-POWERED COACHING ────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
            How It&apos;s Delivered
          </p>
          <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-6">
            Powered By Kynovant.
          </h2>
          <p className="text-gray-400 text-base leading-relaxed max-w-2xl mx-auto mb-4">
            Kept Performance clients get access to Kynovant, the coaching
            platform used to deliver your workouts, nutrition targets,
            check-ins, progress tracking, and direct communication with your
            coach — all in one place.
          </p>
          <p className="text-gray-600 text-sm leading-relaxed max-w-2xl mx-auto">
            Kynovant is a separate software product. Kept Performance uses it
            to run your coaching experience — it does not replace your coach
            or the relationship.
          </p>
        </div>
      </section>

      {/* ── FOUNDER ──────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f] border-t border-white/5">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 items-center">
          <div className="flex justify-center md:justify-start">
            <div className="relative w-56 md:w-full overflow-hidden aspect-[3/4]">
              <Image
                src="/images/jermaine-headshot.jpg"
                alt="Jermaine Jones — Founder & Head Coach, Kept Performance"
                fill
                className="object-cover object-top"
              />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-[#C9A24D]/30" />
            </div>
          </div>

          <div>
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              Founder &amp; Head Coach
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold uppercase text-white mb-5">
              Jermaine Jones
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 max-w-xl">
              Nearly two decades of training, competing on stage, and coaching
              real clients through the same principles he applies to his own
              physique every day. Kept Performance exists to give you a direct
              path to real, sustainable results — without the years of trial
              and error it took to find them.
            </p>
            <Button href="/about" variant="outline">
              Read the Full Story
            </Button>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#141618] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-8" />
          <h2 className="font-headline text-3xl md:text-4xl font-bold uppercase text-white mb-5">
            Ready to Keep the Promise?
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Submitting an application takes less than five minutes and has no
            commitment attached. We&apos;ll review it personally and follow up
            if it&apos;s a strong fit.
          </p>
          <Button href="/apply" size="lg">
            Apply for Coaching
          </Button>
        </div>
      </section>
    </main>
  );
}
