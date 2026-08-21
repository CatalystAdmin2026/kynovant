/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

const nextSteps = [
  {
    num: "01",
    title: "We review your application",
    body: "Every application is read personally — usually within 48 hours.",
  },
  {
    num: "02",
    title: "We reach out to schedule a call",
    body: "If it's a strong fit, we'll invite you to a 20-minute strategy call.",
  },
  {
    num: "03",
    title: "Your program is built",
    body: "After the call, your custom program is ready before you start day one.",
  },
];

export default function ApplyPage() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setStatus("submitting");

    try {
      const res = await fetch(
        "https://script.google.com/macros/s/AKfycbxf3VInd_v9ZJpIedP0fImdFedh-1xi9oBPA7dRKMATwLupMLdy41OmrRFwnIzYVqXd5w/exec",
        { method: "POST", body: new FormData(formEl) }
      );
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok || (data as { status?: string }).status !== "success") throw new Error();

      setStatus("success");
      formEl.reset();
      setTimeout(() => {
        window.location.href = "/thank-you";
      }, 500);
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
            Ready to Start?
          </p>
          <h1 className="font-headline text-5xl md:text-6xl font-bold uppercase text-white mb-4">
            Apply for Coaching
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-sm leading-relaxed">
            Complete the application below. If it looks like a strong fit,
            we'll reach out to schedule a strategy call.
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
                <span className="text-[10px] tracking-[0.3em] font-semibold text-white/50 uppercase">
                  Kept Performance
                </span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                We work with a limited number of clients at a time. Submitting
                an application is not a commitment — it's the first step to
                finding out if we're the right fit for your goals.
              </p>
            </div>
          </div>

          {/* ── Right: Form ── */}
          <div className="bg-[#0c0e0f] border border-white/5 p-8">
            <h3 className="text-white font-semibold text-base mb-7">
              Your Application
            </h3>

            <form
                onSubmit={handleSubmit}
                onChange={() => { if (status === "error") setStatus("idle"); }}
                className="space-y-5"
              >
              <div>
                <label className={label}>Full Name</label>
                <input
                  name="name"
                  required
                  className={input}
                  placeholder="Your name"
                />
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
                <input
                  name="phone"
                  className={input}
                  placeholder="(555) 555-5555"
                />
              </div>

              <div>
                <label className={label}>Primary Goal</label>
                <select name="goal" defaultValue="Fat loss" className={input}>
                  <option>Fat loss</option>
                  <option>Muscle gain</option>
                  <option>Strength + performance</option>
                  <option>Body recomposition</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className={label}>How soon are you ready to start?</label>
                <select
                  name="commitment"
                  defaultValue="Ready to start now"
                  className={input}
                >
                  <option>Ready to start now</option>
                  <option>Within 2–4 weeks</option>
                  <option>Exploring options</option>
                </select>
              </div>

              <div>
                <label className={label}>
                  Tell us about your goals and what's held you back
                </label>
                <textarea
                  name="goals_details"
                  rows={5}
                  className={input}
                  placeholder="Share your goals, current routine, and what you've tried before."
                />
              </div>

              <div>
                <label className={label}>
                  How did you hear about Kept Performance?
                </label>
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
                  <option>Friend / Family Referral</option>
                  <option>Current Client Referral</option>
                  <option>Gym Event</option>
                  <option>Networking Event</option>
                  <option>Med Spa Referral</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className={label}>
                  If someone referred you, who was it?{" "}
                  <span className="text-gray-700 normal-case font-normal tracking-normal">
                    (optional)
                  </span>
                </label>
                <input
                  name="referral_name"
                  className={input}
                  placeholder="Referral name or business name"
                />
              </div>

              <button
                type="submit"
                disabled={status === "submitting" || status === "success"}
                className="w-full bg-[#C9A24D] text-black py-4 font-semibold tracking-wide text-sm hover:bg-[#D4B56A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "submitting" ? "Submitting…" : status === "error" ? "Try Again" : "Submit Application"}
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
          </div>
        </div>
      </section>
    </main>
  );
}
