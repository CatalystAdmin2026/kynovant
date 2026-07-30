import Image from "next/image";
import Button from "@/components/Button";

const philosophy = [
  {
    title: "Everything Is Custom",
    body: "No templates. Your training and nutrition guidance are built from scratch around your goals, schedule, and equipment — not repurposed from someone else's program.",
  },
  {
    title: "Accountability Is the System",
    body: "Weekly check-ins, progress tracking, and direct coach access aren't add-ons. They're the foundation that turns a good program into actual results.",
  },
  {
    title: "Physique-Focused Expertise",
    body: "Fat loss, muscle building, recomposition — every aspect of programming is designed around physique outcomes. Not general fitness. Not just feeling better.",
  },
];

const whoItIsFor = [
  "You have specific physique goals — fat loss, muscle gain, or body recomposition",
  "You've tried working out on your own and hit a ceiling you can't break through",
  "You want programming built around your actual life and schedule",
  "You're ready to commit to a structured process, not just try another program",
  "You understand that real results come from consistency and the right guidance",
  "You're looking for a coach — not a content creator with a PDF to sell",
];

const competitions = [
  "NPC Wisconsin State Championships",
  "NPC Mid-American Winter Classic",
  "NPC Shredded Cheddar",
];

export default function AboutPage() {
  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative pt-36 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[#0c0e0f]" />

        {/* Atmospheric background */}
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-[0.07] pointer-events-none">
          <Image
            src="/images/jermaine-headshot.jpg"
            alt=""
            fill
            className="object-cover object-left"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e0f] via-[#0c0e0f]/90 to-transparent" />

        <div className="relative z-10 max-w-6xl mx-auto">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-4 uppercase">
            About Kynovant
          </p>
          <h1 className="font-headline text-5xl md:text-7xl font-bold uppercase text-white leading-none mb-6">
            Coaching Built
            <br />
            <span className="text-[#C9A24D]">Around Results.</span>
          </h1>
          <p className="text-gray-400 max-w-lg text-base leading-relaxed">
            Not a fitness app. Not a template library. A one-on-one coaching
            program for people who are serious about transforming their physique
            and done doing it alone.
          </p>
        </div>
      </section>

      {/* ── COACH BIO ────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          {/* Photo */}
          <div className="flex justify-center md:justify-start">
            <div className="relative w-72 md:w-80 lg:w-[340px] overflow-hidden aspect-[3/4]">
              <Image
                src="/images/jermaine-headshot.jpg"
                alt="Jermaine Jones — Founder & Head Coach, Kynovant"
                fill
                priority
                className="object-cover object-top"
              />
              {/* Gold accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-[#C9A24D]/30" />
            </div>
          </div>

          {/* Bio */}
          <div className="pt-2">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              Founder & Head Coach
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-1">
              Jermaine Jones
            </h2>
            <p className="text-[#C9A24D] text-sm tracking-wide mb-8">
              NFPT-CPT · NPC Competitive Bodybuilder
            </p>

            <div className="space-y-5 text-gray-400 text-sm leading-relaxed mb-10">
              <p>
                I started lifting because I was the skinny kid who got picked
                on in middle school. I didn't have a coach, a program, or any
                idea what I was doing — I just knew I needed to feel different
                about myself. What I didn't expect was how completely it would
                change my life. As I got stronger, my confidence grew, the way
                people treated me shifted, and eventually the way I saw myself
                changed entirely. I never stopped chasing that.
              </p>
              <p>
                After nearly 18 years of training, I've watched too many people
                get hurt doing the wrong exercises, quit because they weren't
                seeing results, or get completely misled by what they found
                online. I've made most of those mistakes myself. The gap between
                where I started and where I am now isn't talent — it's finding
                the right information and building habits I could actually
                sustain. Kynovant exists to give you a direct path to
                that same outcome, without the years of trial and error it took
                me.
              </p>
              <p>
                The fitness industry is oversaturated with shortcuts — steroids,
                GLP-1s, peptides, programs that promise transformation in 30
                days. Most people are being sold quick fixes instead of the one
                thing that actually produces long-term results: consistency. My
                job as a coach is to build you a custom program that fits your
                real life, hold you accountable when motivation fades, and give
                you the education to make this sustainable for years — not just
                until the next reset.
              </p>
              <p>
                None of that means much if the person coaching you isn't living
                it themselves. Too many trainers tell clients to stay consistent
                while quietly failing to hold themselves to the same standard.
                For nearly two decades I've trained consistently, competed on
                stage, and applied the same principles I teach to my own
                physique every day. When you work with me, you're getting
                attention to detail, customized coaching, and accountability
                from someone who isn't advising from the sidelines. That
                distinction matters.
              </p>
            </div>

            <Button href="/apply">Apply to Work With Me</Button>
          </div>
        </div>
      </section>

      {/* ── COMPETITIVE EXPERIENCE ───────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-start">
          {/* Left: Copy */}
          <div>
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              Competitive Bodybuilding Experience
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-6">
              Proven
              <br />
              On Stage.
            </h2>

            <div className="space-y-4 text-gray-400 text-sm leading-relaxed mb-10">
              <p>
                Jermaine has competed in multiple NPC bodybuilding
                competitions, bringing elite stage conditioning to every show
                he's entered — including top finishes at the NPC Wisconsin
                State Championships and NPC Mid-American Winter Classic.
              </p>
              <p>
                Most clients have no interest in competing — and that's
                completely fine. But working with a coach who has dialed in
                stage-ready condition means working with someone who
                understands physique transformation at its highest level of
                precision. That depth of knowledge translates directly into
                getting you leaner, more muscular, and further than you'd get
                on your own.
              </p>
            </div>

            {/* Competition list */}
            <div className="space-y-3 mb-10">
              <p className="text-[11px] font-semibold tracking-[0.3em] text-gray-600 uppercase mb-4">
                NPC Competition History
              </p>
              {competitions.map((comp) => (
                <div key={comp} className="flex items-center gap-3">
                  <span className="w-1 h-1 rounded-full bg-[#C9A24D] shrink-0" />
                  <span className="text-gray-300 text-sm">{comp}</span>
                </div>
              ))}
            </div>

            <Button href="/apply" variant="outline">
              Work With Jermaine
            </Button>
          </div>

          {/* Right: Photos */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 h-auto md:h-[560px]">
            {/* Wisconsin State — winner ceremony, most impactful */}
            <div className="relative flex-1 overflow-hidden min-h-[220px]">
              <Image
                src="/images/jermaine-wisconsinstate.jpg"
                alt="Jermaine Jones — NPC Wisconsin State Championships"
                fill
                className="object-cover object-top"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-3 px-4">
                <p className="text-white text-xs font-semibold tracking-wide">
                  NPC Wisconsin State Championships
                </p>
              </div>
            </div>

            {/* Side-by-side row for the other two */}
            <div className="flex gap-3 flex-1 min-h-[220px] md:min-h-0">
              {/* Winter Classic */}
              <div className="relative flex-1 overflow-hidden">
                <Image
                  src="/images/jermaine-winterclassic.jpg"
                  alt="Jermaine Jones — NPC Mid-American Winter Classic"
                  fill
                  className="object-cover"
                  style={{ objectPosition: "40% 15%" }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 px-3">
                  <p className="text-white text-[10px] font-semibold tracking-wide leading-tight">
                    NPC Mid-American
                    <br />Winter Classic
                  </p>
                </div>
              </div>

              {/* Shredded Cheddar */}
              <div className="relative flex-1 overflow-hidden">
                <Image
                  src="/images/jermaine-shreddedcheddar.jpg"
                  alt="Jermaine Jones — NPC Shredded Cheddar"
                  fill
                  className="object-cover object-top"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 px-3">
                  <p className="text-white text-[10px] font-semibold tracking-wide leading-tight">
                    NPC Shredded Cheddar
                  </p>
                  <p className="text-gray-500 text-[9px] mt-0.5">
                    © Demba Mbow
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY ───────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
              The Approach
            </p>
            <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white">
              What Makes This Different.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {philosophy.map((item) => (
              <div
                key={item.title}
                className="p-8 border border-white/5 bg-[#141618]"
              >
                <div className="w-6 h-0.5 bg-[#C9A24D] mb-6" />
                <h3 className="text-white font-semibold text-base mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHO WE WORK WITH ─────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0c0e0f]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
            Who This Is For
          </p>
          <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white mb-6">
            Who We Work With.
          </h2>
          <p className="text-gray-400 text-base leading-relaxed mb-12 max-w-2xl mx-auto">
            Kynovant is application-based. We work with a limited
            number of clients at a time — and we only take on clients we're
            confident we can get results with.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-3xl mx-auto mb-12">
            {whoItIsFor.map((item) => (
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

          <Button href="/apply" size="lg">
            Apply for Coaching
          </Button>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#141618] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-8" />
          <h2 className="font-headline text-3xl md:text-4xl font-bold uppercase text-white mb-5">
            Ready to Apply?
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Submitting an application takes less than five minutes and has no
            commitment attached. We'll review it personally and follow up if
            it's a strong fit.
          </p>
          <Button href="/apply" size="lg">
            Start Your Application
          </Button>
        </div>
      </section>
    </main>
  );
}
