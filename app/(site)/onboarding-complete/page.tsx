import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Onboarding Complete",
  robots: { index: false, follow: false },
};

export default function OnboardingCompletePage() {
  return (
    <main className="min-h-screen bg-[#080909] flex flex-col">
      <style>{`
        @keyframes oc-ring { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:0.8;transform:scale(1.06)} }
        @keyframes oc-fade-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .oc-ring  { animation: oc-ring 3.2s ease-in-out infinite; }
        .oc-f1    { animation: oc-fade-up 0.7s 0.1s ease both; }
        .oc-f2    { animation: oc-fade-up 0.7s 0.3s ease both; }
        .oc-f3    { animation: oc-fade-up 0.7s 0.5s ease both; }
        .oc-f4    { animation: oc-fade-up 0.7s 0.7s ease both; }
        .oc-f5    { animation: oc-fade-up 0.7s 0.9s ease both; }
      `}</style>

      {/* Navbar spacer */}
      <div className="h-16 shrink-0" />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center relative overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(201,164,76,0.06) 0%, transparent 70%)" }}
        />

        {/* Logo mark */}
        <div className="oc-f1 mb-10 relative">
          <div className="oc-ring absolute inset-0 rounded-full border border-[#C9A44C]/20" style={{ margin: "-12px" }} />
          <div className="w-16 h-16 rounded-full border border-[#C9A44C]/30 flex items-center justify-center">
            <Image
              src="/logos/kynovant-mark.png"
              alt="Kept Performance"
              width={32}
              height={32}
              className="opacity-90"
            />
          </div>
        </div>

        {/* Eyebrow */}
        <p className="oc-f2 text-[#C9A44C] text-[10px] font-semibold tracking-[0.7em] uppercase mb-6">
          Onboarding Complete
        </p>

        {/* Headline */}
        <h1 className="oc-f2 font-headline text-[48px] sm:text-[64px] md:text-[80px] font-bold uppercase leading-[0.92] tracking-tight text-white mb-6 max-w-2xl">
          Your Performance Blueprint Is&nbsp;Now Being&nbsp;Built.
        </h1>

        <div className="oc-f3 w-8 h-px bg-[#C9A44C]/40 mx-auto mb-8" />

        {/* Body */}
        <p className="oc-f3 text-gray-400 text-[14px] md:text-[15px] leading-relaxed max-w-md mb-4">
          Your onboarding questionnaire has been received. Over the next{" "}
          <span className="text-white font-medium">3–5 business days</span>, your
          custom coaching program, nutrition system, and accountability structure
          will be designed from the ground up.
        </p>
        <p className="oc-f3 text-gray-500 text-[13px] leading-relaxed max-w-md mb-12">
          You will be contacted directly once your program is ready for delivery.
          If you have not yet submitted your progress photos, please email them to{" "}
          <a
            href="mailto:catalyst.coaching.headcoach@gmail.com"
            className="text-[#C9A44C] hover:text-[#D4B56A] transition-colors"
          >
            catalyst.coaching.headcoach@gmail.com
          </a>{" "}
          with your full name in the subject line.
        </p>

        {/* What happens next */}
        <div className="oc-f4 max-w-lg w-full mb-14">
          <div className="bg-white/[0.025] border border-white/[0.07] px-6 py-7 text-left space-y-5">
            <p className="text-[9px] tracking-[0.5em] text-gray-600 uppercase mb-5">
              What Happens Next
            </p>
            {[
              {
                num: "01",
                text: "Your coach reviews your questionnaire in full detail.",
              },
              {
                num: "02",
                text: "Your custom training, nutrition, and accountability systems are built.",
              },
              {
                num: "03",
                text: "Your complete coaching package is delivered with onboarding instructions.",
              },
            ].map(item => (
              <div key={item.num} className="flex items-start gap-5">
                <span className="font-headline text-2xl font-bold text-[#C9A44C]/25 leading-none shrink-0 mt-0.5">
                  {item.num}
                </span>
                <p className="text-[13px] text-gray-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="oc-f5">
          <Link
            href="/"
            className="inline-block border border-white/[0.12] text-gray-300 hover:text-white hover:border-white/25 font-semibold tracking-[0.15em] text-[11px] px-10 py-4 uppercase transition-all duration-300"
          >
            Return Home
          </Link>
        </div>
      </section>

      {/* Footer strip */}
      <section className="py-12 px-6 border-t border-white/[0.05] text-center">
        <div className="w-8 h-px bg-[#C9A44C]/30 mx-auto mb-6" />
        <p className="font-headline text-lg font-bold uppercase text-white tracking-wide mb-2">
          The work starts now.
        </p>
        <p className="text-[#C9A44C] text-[11px] font-semibold tracking-[0.35em] uppercase">
          Kept Performance
        </p>
      </section>
    </main>
  );
}
