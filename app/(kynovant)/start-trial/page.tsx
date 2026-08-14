"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Status = "idle" | "submitting" | "success" | "already_exists" | "error";

export default function StartTrialPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const formData = new FormData(formEl);
      const payload = Object.fromEntries(formData.entries());

      const res = await fetch("/api/coach-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };

      if (!res.ok || data.ok !== true) {
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      // "invited" (brand new) and "already_invited" (resent) both land
      // the visitor in their inbox — only "already_active" means "you
      // already finished setup, go sign in instead."
      setStatus(data.status === "already_active" ? "already_exists" : "success");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
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
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#C9A24D] text-[11px] font-semibold tracking-[0.45em] mb-3 uppercase">
            Kynovant for Coaches
          </p>
          <h1 className="font-headline text-5xl md:text-6xl font-bold uppercase text-white mb-4">
            Start Your 14-Day Free Trial
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto text-sm leading-relaxed">
            Create your coach workspace now. No application, no demo call, no
            waiting on anyone. Full pricing is shown before you&apos;re ever
            charged.
          </p>
        </div>
      </section>

      {/* ── FORM + TRUST SIDEBAR ─────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-start">
          {/* ── Left: What Happens Next ── */}
          <div className="lg:sticky lg:top-24 space-y-8">
            <div>
              <h2 className="font-headline text-2xl md:text-3xl font-bold uppercase text-white mb-8">
                How It Works
              </h2>

              <div className="space-y-7">
                {[
                  {
                    num: "01",
                    title: "Create your account",
                    body: "Tell us your name and email. We'll send a secure link to confirm it's really you.",
                  },
                  {
                    num: "02",
                    title: "Set your password",
                    body: "Click the link, set a password, and your coach workspace is live.",
                  },
                  {
                    num: "03",
                    title: "Start your 14-day trial",
                    body: "Activate billing when you're ready — you'll see the exact price before anything is charged.",
                  },
                ].map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <span className="font-headline text-2xl font-bold text-[#C9A24D]/25 leading-none mt-0.5 shrink-0 w-8">
                      {step.num}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">{step.title}</p>
                      <p className="text-gray-600 text-sm leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-white/5 bg-[#141618] p-6">
              <div className="flex items-center gap-3 mb-4">
                <Image src="/logos/kynovant-mark.png" alt="Kynovant" width={20} height={20} />
                <span className="text-[10px] tracking-[0.3em] font-semibold text-white/50 uppercase">
                  Kynovant
                </span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                Already coaching with Kynovant?{" "}
                <Link href="/login" className="text-[#C9A24D] hover:text-[#D4B56A]">
                  Sign in
                </Link>{" "}
                instead. Running a larger team and want to talk it through
                first? <Link href="/coach-apply" className="text-[#C9A24D] hover:text-[#D4B56A]">
                  Reach out here
                </Link>.
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
                <h3 className="text-white font-semibold text-lg mb-2">Check your inbox</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
                  We sent a secure link to confirm your email and set your
                  password. Click it to open your new coach workspace and
                  start your 14-day free trial.
                </p>
              </div>
            ) : status === "already_exists" ? (
              <div className="text-center py-10">
                <div className="w-11 h-11 rounded-full bg-[#C9A24D]/15 flex items-center justify-center mx-auto mb-5">
                  <span className="text-[#C9A24D] text-lg">i</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">You already have an account</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto mb-6">
                  An account already exists for that email.
                </p>
                <Link
                  href="/login"
                  className="inline-block bg-[#C9A24D] text-black px-6 py-3 font-semibold tracking-wide text-sm hover:bg-[#D4B56A] transition-colors"
                >
                  Go to Sign In
                </Link>
              </div>
            ) : (
              <>
                <h3 className="text-white font-semibold text-base mb-7">Create Your Coach Account</h3>

                <form
                  onSubmit={handleSubmit}
                  onChange={() => { if (status === "error") setStatus("idle"); }}
                  className="space-y-5"
                >
                  <div>
                    <label className={label}>Full Name</label>
                    <input name="name" required className={input} placeholder="Your name" maxLength={200} />
                  </div>

                  <div>
                    <label className={label}>Email Address</label>
                    <input
                      name="email"
                      type="email"
                      required
                      className={input}
                      placeholder="you@example.com"
                      maxLength={200}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full bg-[#C9A24D] text-black py-4 font-semibold tracking-wide text-sm hover:bg-[#D4B56A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "submitting" ? "Creating account…" : "Start 14-Day Free Trial"}
                  </button>

                  {status === "error" && (
                    <p className="text-red-400 text-sm text-center">{errorMessage}</p>
                  )}

                  <p className="text-[11px] text-gray-700 text-center leading-relaxed">
                    No payment required now. You&apos;ll enter billing details
                    only when you choose to start your trial from inside your
                    workspace.
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
