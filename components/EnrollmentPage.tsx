import Link from "next/link";

interface TrustIndicator {
  label: string;
  body: string;
}

interface EnrollmentPageProps {
  eyebrow: string;
  headline: string;
  headlineGold?: string;
  subheadline: string;
  body: string;
  price: string;
  pricePeriod?: string;
  priceNote?: string;
  privateNote?: string;
  ctaLabel: string;
  ctaUrl: string;
  ctaFootnote?: string;
  includes: readonly string[];
  coachQuote?: string;
  trustIndicators?: readonly TrustIndicator[];
}

export default function EnrollmentPage({
  eyebrow,
  headline,
  headlineGold,
  subheadline,
  body,
  price,
  pricePeriod = "/mo",
  priceNote,
  privateNote,
  ctaLabel,
  ctaUrl,
  ctaFootnote = "Secure checkout · Powered by Stripe",
  includes,
  coachQuote,
  trustIndicators,
}: EnrollmentPageProps) {
  return (
    <main className="bg-[#080909] min-h-screen overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Ambient gold glow */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(201,162,77,0.07) 0%, transparent 70%)", filter: "blur(40px)" }} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-center">

            {/* Left — copy */}
            <div>
              <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.6em] mb-6 uppercase">
                {eyebrow}
              </p>

              <h1 className="font-headline font-bold uppercase leading-[0.88] tracking-tight text-white mb-6"
                style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)" }}>
                {headline}
                {headlineGold && (
                  <>
                    <br />
                    <span className="text-[#C9A24D]">{headlineGold}</span>
                  </>
                )}
              </h1>

              <div className="w-10 h-px bg-[#C9A24D]/40 mb-7" />

              <p className="text-gray-200 text-lg md:text-xl font-light leading-relaxed mb-4">
                {subheadline}
              </p>

              <p className="text-gray-500 text-sm leading-relaxed max-w-md mb-10">
                {body}
              </p>

              <div className="flex items-start gap-5">
                <div className="w-px bg-[#C9A24D]/25 self-stretch shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm tracking-wide italic mb-1">Kynovant</p>
                  <p className="text-[#C9A24D] text-[10px] tracking-[0.22em] uppercase mb-1">Coaching Operations Platform</p>
                  <p className="text-gray-600 text-[10px] tracking-wide">Built for client context, programming, check-ins, and progress review</p>
                </div>
              </div>
            </div>

            {/* Right — pricing card */}
            <div>
              <div className="border border-[#C9A24D]/20 bg-[#0b0c0d] relative overflow-hidden">
                {/* Gold top accent */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-[#C9A24D]/50 to-transparent" />

                <div className="px-8 py-10">
                  <p className="text-[#C9A24D] text-[10px] tracking-[0.5em] uppercase font-semibold mb-6">
                    Investment
                  </p>

                  {/* Price */}
                  <div className="flex items-end gap-2 mb-2">
                    <span className="font-headline font-bold text-white leading-none"
                      style={{ fontSize: "clamp(3rem, 10vw, 4.5rem)" }}>
                      {price}
                    </span>
                    <span className="text-gray-500 text-sm mb-3">{pricePeriod}</span>
                  </div>

                  {priceNote && (
                    <p className="text-gray-600 text-xs leading-relaxed mb-4">{priceNote}</p>
                  )}

                  {privateNote && (
                    <div className="bg-[#C9A24D]/[0.05] border border-[#C9A24D]/15 px-4 py-3 mb-6">
                      <p className="text-[#C9A24D] text-[10px] tracking-[0.3em] uppercase font-semibold mb-1">Private Rate</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{privateNote}</p>
                    </div>
                  )}

                  {!privateNote && <div className="mb-6" />}

                  {/* Includes list */}
                  <div className="space-y-2.5 mb-8">
                    {includes.map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M2.5 8.5l3.5 3.5 7-7" stroke="#C9A24D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-gray-400 text-xs leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={ctaUrl}
                    className="block w-full bg-[#C9A24D] text-black font-bold tracking-[0.18em] text-[11px] px-8 py-4 uppercase text-center hover:bg-[#D4B56A] transition-colors duration-200"
                  >
                    {ctaLabel}
                  </Link>

                  <p className="text-gray-700 text-[10px] text-center mt-4 tracking-wide">
                    {ctaFootnote}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT'S INCLUDED ──────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#0b0c0d]">
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-[#C9A24D] text-[10px] font-semibold tracking-[0.6em] mb-4 uppercase">
              Everything Included
            </p>
            <h2 className="font-headline text-4xl md:text-[52px] font-bold uppercase text-white leading-none">
              What You Get
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-0">
            {includes.map((item) => (
              <div key={item} className="flex items-center gap-4 py-4 border-b border-white/[0.05]">
                <div className="shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2.5 8.5l3.5 3.5 7-7" stroke="#C9A24D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-gray-300 text-sm leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST INDICATORS ─────────────────────────────────── */}
      {trustIndicators && trustIndicators.length > 0 && (
        <section className="py-20 px-6 bg-[#080909] border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {trustIndicators.map((item) => (
                <div key={item.label} className="text-center px-2">
                  <p className="text-[#C9A24D] text-[10px] tracking-[0.3em] uppercase font-semibold mb-2.5">
                    {item.label}
                  </p>
                  <p className="text-gray-500 text-xs leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── COACH QUOTE / CLOSING ─────────────────────────────── */}
      <section
        className="relative py-32 px-6 overflow-hidden"
        style={{
          background: [
            "radial-gradient(ellipse 55% 40% at 50% 90%, rgba(201,162,77,0.05) 0%, transparent 65%)",
            "#080909",
          ].join(", "),
        }}
      >
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mb-12" />

          {coachQuote ? (
            <>
              <p className="text-gray-300 text-lg md:text-xl font-light leading-relaxed italic mb-8">
                &ldquo;{coachQuote}&rdquo;
              </p>
              <p className="text-[#C9A24D] text-[10px] tracking-[0.45em] uppercase font-semibold mb-14">
                — Kynovant
              </p>
            </>
          ) : (
            <p className="text-gray-500 text-sm mb-14 leading-relaxed">
              Ready to start? Secure your spot below.
            </p>
          )}

          <Link
            href={ctaUrl}
            className="inline-block bg-[#C9A24D] text-black font-bold tracking-[0.22em] text-[11px] px-16 py-5 uppercase hover:bg-[#D4B56A] transition-colors duration-300"
          >
            {ctaLabel}
          </Link>

          <div className="w-8 h-px bg-[#C9A24D]/35 mx-auto mt-12" />
        </div>
      </section>
    </main>
  );
}
