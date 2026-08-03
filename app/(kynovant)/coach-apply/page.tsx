"use client";

import { useState } from "react";
import Image from "next/image";

type Status = "idle" | "submitting" | "success" | "error";

const nextSteps = [
  {
    num: "01",
    title: "We review your application",
    body: "We review your coaching workflow, client load, and what you need from a system before scheduling next steps.",
  },
  {
    num: "02",
    title: "We schedule a short intro call",
    body: "A quick conversation to make sure Kynovant fits how you coach.",
  },
  {
    num: "03",
    title: "Your workspace is set up",
    body: "We set up your first client, your first program, and your first workout assignment together.",
  },
];

export default function CoachApplyPage() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setStatus("submitting");

    try {
      const formData = new FormData(formEl);
      const payload = Object.fromEntries(formData.entries());

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok || (data as { ok?: boolean }).ok !== true) throw new Error();

      setStatus("success");
      formEl.reset();
    } catch {
      setStatus("error");
    }
  }

  const input =
    "w-full bg-[#141618] border border-white/8 px-4 py-3 text-white text-sm placeholder:text-gray-700 focus:outline-none focus:border-[#C9A24D]/50 transition-colors rounded-none";

  const label =
    "block text-[11px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-2";

  return (
    <main>
      {/* ── PAGE HEADER ──────────────────────────────────── */}
      <section className="pt-36 pb-12 px-6 bg-[#0c0e0f] border-b border-white/5">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-3 uppercase">
            Kynovant Coach Access
          </p>
          <h1 className="font-headline text-5xl md:text-6xl font-bold uppercase text-white mb-4">
            Apply as a Coach
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-sm leading-relaxed">
            Tell us a bit about your coaching business. If it&apos;s a strong fit,
            we&apos;ll reach out to schedule a short intro call.
          </p>
        </div>
      </section>

      {/* ── FORM + TRUST SIDEBAR ─────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-12 items-start">
          {/* ── Left: Trust / What Happens Next ── */}
          <div className="lg:sticky lg:top-24 space-y-10">
            <div>
              <h2 className="font-headline text-2xl md:text-3xl font-bold uppercase text-white mb-8">
                What Happens After You Apply
              </h2>

              <div className="space-y-7">
                {nextSteps.map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <span className="font-headline text-2xl font-bold text-[#C9A24D]/25 leading-none mt-0.5 shrink-0 w-8">
                      {step.num}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">
                        {step.title}
                      </p>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust card */}
            <div className="border border-white/5 bg-[#141618] p-6">
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/logos/kynovant-mark.png"
                  alt="Kynovant"
                  width={20}
                  height={20}
                />
                <span className="text-[10px] tracking-[0.3em] font-semibold text-white/50 uppercase">
                  Kynovant
                </span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                Coach access starts with an application so we can understand
                your workflow before discussing setup. Applying is not a
                commitment — no payment is required to submit.
              </p>
            </div>
          </div>

          {/* ── Right: Form ── */}
          <div className="bg-[#0c0e0f] border border-white/5 p-8">
            {status === "success" ? (
              <div className="text-center py-10">
                <div className="w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
                  <span className="text-emerald-400 text-lg">✓</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">
                  Application received
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
                  Thanks for applying. We&apos;ll review your application and
                  follow up with the next step if Kynovant is a fit.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-white font-semibold text-base mb-7">
                  Coach Application
                </h3>

                <form
                  onSubmit={handleSubmit}
                  onChange={() => { if (status === "error") setStatus("idle"); }}
                  className="space-y-5"
                >
                  <div>
                    <label className={label}>Full Name</label>
                    <input name="name" required className={input} placeholder="Your name" />
                  </div>

                  <div>
                    <label className={label}>Email Address</label>
                    <input
                      name="email"
                      type="email"
                      required
                      className={input}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <label className={label}>
                      Phone{" "}
                      <span className="text-gray-700 normal-case font-normal tracking-normal">
                        (optional)
                      </span>
                    </label>
                    <input name="phone" className={input} placeholder="(555) 555-5555" />
                  </div>

                  <div>
                    <label className={label}>Where are you coaching today?</label>
                    <select name="business_stage" defaultValue="Just getting started" className={input}>
                      <option>Just getting started</option>
                      <option>Coaching a handful of clients informally</option>
                      <option>Running an active coaching business</option>
                      <option>Coaching at a gym or studio</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className={label}>
                      Roughly how many clients do you coach right now?
                    </label>
                    <select name="client_count" defaultValue="0–5" className={input}>
                      <option>0–5</option>
                      <option>6–15</option>
                      <option>16–30</option>
                      <option>30+</option>
                    </select>
                  </div>

                  <div>
                    <label className={label}>
                      What&apos;s held you back from a system like this?
                    </label>
                    <textarea
                      name="context"
                      rows={5}
                      className={input}
                      placeholder="Spreadsheets, PDFs, another platform that didn't fit — tell us what you're using today."
                    />
                  </div>

                  <div>
                    <label className={label}>How did you hear about Kynovant?</label>
                    <select
                      name="referral_source"
                      required
                      defaultValue=""
                      className={input}
                    >
                      <option value="" disabled>Select an option</option>
                      <option>Instagram</option>
                      <option>Facebook</option>
                      <option>TikTok</option>
                      <option>Google Search</option>
                      <option>Friend / Colleague Referral</option>
                      <option>Networking Event</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full bg-[#C9A24D] text-black py-4 font-semibold tracking-wide text-sm hover:bg-[#D4B56A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "submitting"
                      ? "Submitting…"
                      : status === "error"
                      ? "Try Again"
                      : "Submit Application"}
                  </button>

                  {status === "error" && (
                    <p className="text-red-400 text-sm text-center">
                      Something went wrong. Please try again.
                    </p>
                  )}

                  <p className="text-[11px] text-gray-700 text-center leading-relaxed">
                    By submitting, you agree to be contacted about your
                    application. No commitment required.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
