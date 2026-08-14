import Button from "@/components/Button";
import PaidAccessButton from "@/components/PaidAccessButton";

const steps = [
  {
    num: "01",
    title: "Complete Your Onboarding Questionnaire",
    desc: "Provide your goals, training history, nutrition background, schedule, injuries, lifestyle habits, and any additional information needed to build your custom coaching plan.",
  },
  {
    num: "02",
    title: "Program Buildout Begins",
    desc: "Once your onboarding questionnaire is complete, your custom training, nutrition, accountability, and progress-tracking system will be built.",
  },
  {
    num: "03",
    title: "Program Delivery",
    desc: "Your coaching materials, instructions, and next steps will be delivered through the approved coaching platform.",
  },
  {
    num: "04",
    title: "Start Executing",
    desc: "Begin your program, submit check-ins, track progress, and receive ongoing accountability, coaching, and support.",
  },
];

export default async function PaymentConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string }>;
}) {
  const { access } = await searchParams;
  const showBlockedMessage = access === "required";

  return (
    <main className="bg-[#080909] min-h-screen">
      {showBlockedMessage && (
        <div className="fixed top-16 inset-x-0 z-40 bg-[#C9A24D]/[0.06] border-b border-[#C9A24D]/20 backdrop-blur-sm">
          <p className="text-[12px] text-[#C9A24D]/85 font-medium text-center px-6 py-3 tracking-wide">
            Onboarding access is available after payment is confirmed.
          </p>
        </div>
      )}
      {/* ── HERO / CONFIRMATION ────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 text-center overflow-hidden">
        {/* Subtle gold radial glow behind headline */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-[#C9A24D]/5 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Success indicator */}
          <div className="flex justify-center mb-8">
            <div className="w-14 h-14 rounded-full border border-[#C9A24D]/40 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12.5l5 5 11-11"
                  stroke="#C9A24D"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-6 uppercase">
            Welcome to Catalyst Coaching Elite
          </p>

          <h1 className="font-headline text-5xl sm:text-6xl md:text-[80px] font-bold uppercase leading-none tracking-tight mb-6 text-white">
            Payment Confirmed.
          </h1>

          <p className="text-gray-300 text-lg md:text-xl max-w-xl mx-auto mb-6 leading-relaxed">
            Your Catalyst Coaching Elite subscription has been successfully activated.
          </p>

          <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-8" />

          <div className="text-gray-400 text-sm leading-relaxed max-w-2xl mx-auto space-y-3">
            <p>
              Your payment has been received and your onboarding process is now underway.
            </p>
            <p>
              We&apos;re excited to help you build a stronger, healthier, and more confident version of yourself.
            </p>
            <p>
              The next step is completing your onboarding questionnaire so we can begin building your customized coaching program.
            </p>
          </div>
        </div>
      </section>

      {/* ── WHAT HAPPENS NEXT ─────────────────────────── */}
      <section className="py-20 px-6 bg-[#0c0e0f]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-4 uppercase">
              Your Path Forward
            </p>
            <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
              What Happens Next
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="relative p-8 border border-white/5 bg-[#141618]"
              >
                <p className="font-headline text-5xl font-bold text-[#C9A24D]/15 mb-5 leading-none">
                  {step.num}
                </p>
                <h3 className="text-white font-semibold text-base mb-3 leading-snug">
                  {step.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPORTANT NOTICE ──────────────────────────── */}
      <section className="py-14 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="border border-[#C9A24D]/30 bg-[#C9A24D]/[0.04] p-8 md:p-10">
            <div className="flex items-start gap-5">
              <div className="shrink-0 mt-0.5">
                <div className="w-8 h-8 border border-[#C9A24D]/50 flex items-center justify-center">
                  <span className="text-[#C9A24D] text-xs font-bold tracking-wide">!</span>
                </div>
              </div>
              <div>
                <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.4em] mb-3 uppercase">
                  Important
                </p>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Please complete your onboarding questionnaire within{" "}
                  <span className="text-white font-semibold">48 hours</span> so we can begin
                  building your coaching program as quickly as possible.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section className="pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <PaidAccessButton
              sessionKey="catalyst_standard_paid_access"
              href="/onboarding"
              className="inline-block bg-[#C9A24D] text-black hover:bg-[#D4B56A] px-10 py-4 text-sm font-semibold tracking-wide transition-colors duration-200 text-center leading-none"
            >
              Complete Onboarding Questionnaire
            </PaidAccessButton>
            <Button href="/" size="lg" variant="outline">
              Return Home
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER STRIP ──────────────────────────────── */}
      <section className="py-16 px-6 bg-[#141618] border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/40 mx-auto mb-8" />

          <p className="text-gray-500 text-sm mb-2">Questions?</p>
          <a
            href="mailto:catalyst.coaching.headcoach@gmail.com"
            className="text-[#C9A24D] text-sm hover:text-[#D4B56A] transition-colors duration-200 tracking-wide"
          >
            catalyst.coaching.headcoach@gmail.com
          </a>

          <div className="mt-10 pt-10 border-t border-white/5">
            <p className="font-headline text-xl font-bold uppercase text-white tracking-wide mb-2">
              Thank you for trusting Catalyst Coaching Elite with your transformation journey.
            </p>
            <p className="text-[#C9A24D] font-semibold tracking-[0.3em] text-sm uppercase">
              Let&apos;s get to work.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
