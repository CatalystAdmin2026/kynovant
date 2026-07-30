import Image from "next/image";
import Button from "@/components/Button";
import CalendlyEmbed from "@/components/CalendlyEmbed";

const nextSteps = [
  {
    num: "01",
    title: "We review your application",
    body: "Every application is read personally — usually within 48 hours of your strategy call being scheduled.",
  },
  {
    num: "02",
    title: "Strategy call: we align on your goals",
    body: "We use the call to understand where you are, where you want to go, and whether Kynovant is the right fit.",
  },
  {
    num: "03",
    title: "Your program is built before day one",
    body: "If accepted, your fully custom program is ready and waiting before you start.",
  },
];

export default function ThankYouPage() {
  return (
    <main className="px-6 py-24">

      {/* ── CONFIRMATION ─────────────────────────────────── */}
      <div className="max-w-xl mx-auto text-center mb-16">
        <div className="flex justify-center mb-8">
          <Image
            src="/logos/kynovant-mark.png"
            alt="Kynovant"
            width={44}
            height={44}
            className="opacity-80"
          />
        </div>

        <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-10" />

        <h1 className="font-headline text-5xl md:text-6xl font-bold uppercase text-white mb-6">
          Application
          <br />
          <span className="text-[#C9A24D]">Received.</span>
        </h1>

        <p className="text-gray-300 text-base leading-relaxed mb-3">
          Your application is in. We review every submission personally and
          will be in touch within{" "}
          <span className="text-white font-medium">48 hours</span>.
        </p>

        <p className="text-gray-600 text-sm leading-relaxed">
          Check your inbox for a confirmation. If you don't see it, check
          your spam folder.
        </p>
      </div>

      {/* ── BOOK YOUR CALL ───────────────────────────────── */}
      <div className="max-w-3xl mx-auto mb-20">

        {/* Section header */}
        <div className="text-center mb-10">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-4 uppercase">
            Your Next Step
          </p>
          <h2 className="font-headline text-4xl md:text-5xl font-bold uppercase text-white leading-none mb-5">
            Schedule Your
            <br />
            <span className="text-[#C9A24D]">Strategy Call.</span>
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-lg mx-auto">
            Book your Kynovant Strategy Call below. This is a
            personalized session — not a sales call — where we align on your
            goals and determine whether the program is the right fit.
            Scheduling your call now secures your place in the review process.
          </p>
        </div>

        {/* Calendly inline embed */}
        <CalendlyEmbed />

        {/* Fallback link for accessibility / script-off environments */}
        <p className="text-center mt-4 text-gray-700 text-xs">
          Scheduler not loading?{" "}
          <a
            href="https://calendly.com/catalyst-coaching-headcoach/catalyst-coaching-strategy-call"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A24D] hover:underline"
          >
            Open Calendly in a new tab →
          </a>
        </p>
      </div>

      {/* ── WHAT COMES NEXT ──────────────────────────────── */}
      <div className="max-w-xl mx-auto">
        <div className="border border-white/5 bg-[#141618] p-8 mb-10">
          <p className="text-white font-semibold text-sm tracking-wide mb-6">
            After You Book
          </p>
          <div className="space-y-6">
            {nextSteps.map((step) => (
              <div key={step.num} className="flex items-start gap-4">
                <span className="font-headline text-[#C9A24D]/30 font-bold text-sm leading-relaxed shrink-0 w-6">
                  {step.num}
                </span>
                <div>
                  <p className="text-white text-sm font-semibold mb-1">
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

        <div className="text-center">
          <Button href="/" variant="outline">
            Back to Home
          </Button>
        </div>
      </div>

    </main>
  );
}
