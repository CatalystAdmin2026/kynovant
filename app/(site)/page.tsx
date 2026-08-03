import Image from "next/image";
import Link from "next/link";

const productPillars = [
  {
    title: "Client Workspace",
    body: "Keep client context, readiness, profile details, active program status, and attention signals in one coach-facing view.",
  },
  {
    title: "Program Builder",
    body: "Build multi-week programs from reusable workout blueprints and keep programming structure tied to the client assignment workflow.",
  },
  {
    title: "Check-In Review",
    body: "Review weekly client check-ins from a dedicated HQ queue built around coach action, not scattered notes.",
  },
  {
    title: "Nutrition Targets",
    body: "Manage client nutrition targets alongside training and progress context without splitting the workflow across tools.",
  },
];

const workflow = [
  "Invite the client",
  "Build or assign the program",
  "Review check-ins",
  "Adjust what comes next",
];

const platformSections = [
  "Coach HQ",
  "Client Portal",
  "Exercise Library",
  "Kynovant Insights",
];

export default function HomePage() {
  return (
    <main className="bg-[#080909] text-white">
      <section className="relative flex min-h-screen items-center overflow-hidden px-6 pt-24">
        <div className="absolute inset-0" aria-hidden="true">
          <Image
            src="/kynovant_primary.png"
            alt=""
            fill
            priority
            className="object-cover opacity-[0.06]"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(201,162,77,0.12),transparent_52%),linear-gradient(180deg,rgba(8,9,9,0.45),#080909_82%)]" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.5em] text-[#C9A24D]">
              Kynovant Coaching OS
            </p>
            <h1 className="font-headline text-5xl font-bold uppercase leading-[0.9] tracking-tight text-white sm:text-6xl md:text-[82px]">
              The operating system for serious coaching.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-gray-400 md:text-lg">
              Kynovant gives coaches one focused place to manage clients,
              programs, check-ins, nutrition targets, and progress context.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/coach-apply"
                className="bg-[#C9A24D] px-8 py-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#D4B56A]"
              >
                Request Demo / Apply
              </Link>
              <Link
                href="/for-coaches"
                className="border border-white/[0.12] px-8 py-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-white transition-colors hover:border-white/25"
              >
                For Coaches
              </Link>
            </div>
          </div>

          <div className="border border-white/[0.07] bg-[#0b0c0d]/80">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/35">
                Coach HQ
              </p>
            </div>
            <div className="space-y-4 p-5">
              {workflow.map((item, index) => (
                <div key={item} className="flex items-center gap-4 border border-white/[0.05] bg-[#101213] px-4 py-4">
                  <span className="font-headline text-2xl font-bold text-[#C9A24D]/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium text-gray-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-white/[0.05] bg-[#0b0c0d] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-2xl">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.45em] text-[#C9A24D]">
              Product
            </p>
            <h2 className="font-headline text-4xl font-bold uppercase leading-none text-white md:text-[56px]">
              Built around the daily coaching loop.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {productPillars.map((pillar) => (
              <article key={pillar.title} className="border border-white/[0.06] bg-[#080909] p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                  {pillar.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-gray-500">{pillar.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.45em] text-[#C9A24D]">
              Platform
            </p>
            <h2 className="font-headline text-4xl font-bold uppercase leading-none text-white md:text-[52px]">
              One system. Clear boundaries.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-gray-500">
              Kynovant separates coach operations, client experience, exercise
              data, and programming analysis so each part can stay focused.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {platformSections.map((section) => (
              <div key={section} className="border border-white/[0.06] bg-[#0d0e0f] px-5 py-5">
                <p className="text-sm font-semibold text-white">{section}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.05] bg-[#0b0c0d] px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.45em] text-[#C9A24D]">
            Access
          </p>
          <h2 className="font-headline text-4xl font-bold uppercase leading-none text-white md:text-[56px]">
            Request access to Kynovant.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-gray-500">
            Apply as a coach and tell us how your business works today. The
            application keeps the onboarding conversation grounded in your real
            workflow.
          </p>
          <Link
            href="/coach-apply"
            className="mt-9 inline-block bg-[#C9A24D] px-10 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#D4B56A]"
          >
            Request Demo / Apply
          </Link>
        </div>
      </section>
    </main>
  );
}
