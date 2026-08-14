import Link from "next/link";

const included = [
  "Coach HQ for client operations",
  "Program Builder and reusable workout blueprints",
  "Exercise Library foundation",
  "Client portal access",
  "Weekly check-in review workflow",
  "Nutrition target management",
  "14-day free trial, no commitment",
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#080909] px-6 pb-24 pt-36 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.5em] text-[#C9A24D]">
          Pricing
        </p>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h1 className="font-headline text-5xl font-bold uppercase leading-[0.9] tracking-tight text-white md:text-[74px]">
              One plan for coaching teams.
            </h1>
            <p className="mt-6 text-base leading-relaxed text-gray-500">
              Start a 14-day free trial in minutes — no application, no demo
              call required. Exact pricing is shown at checkout, inside your
              own workspace, before anything is charged.
            </p>
          </div>

          <div className="border border-[#C9A24D]/20 bg-[#0b0c0d]">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#C9A24D]/50 to-transparent" />
            <div className="p-8">
              <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.45em] text-[#C9A24D]">
                Founding Coach Access
              </p>
              <p className="font-headline text-5xl font-bold uppercase leading-none text-white">
                14 Days Free
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                Create your account now. Full pricing is shown at checkout
                before your trial starts — cancel anytime.
              </p>

              <div className="my-8 h-px bg-white/[0.06]" />

              <div className="space-y-3">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A24D]" />
                    <span className="text-sm leading-snug text-gray-400">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/start-trial"
                className="mt-9 block bg-[#C9A24D] px-8 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#D4B56A]"
              >
                Start 14-Day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
