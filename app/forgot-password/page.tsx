"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type State = "idle" | "loading" | "sent";

const INPUT_CLS =
  "w-full bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-[#c9a24d]/40 focus:bg-white/[0.06] transition-colors disabled:opacity-50";

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const prefill = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(prefill);
  const [state, setState] = useState<State>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;

    setState("loading");

    const supabase = createClient();
    // resetPasswordForEmail never reveals whether an email exists —
    // it returns no error for unknown addresses. This prevents enumeration.
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    // Always show the same neutral success state regardless of outcome.
    setState("sent");
  }

  return (
    <div className="min-h-screen bg-[#080909] flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm flex flex-col gap-10">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/logos/kynovant-mark.png"
            alt="Kynovant"
            width={36}
            height={36}
            priority
            style={{ filter: "drop-shadow(0 0 14px rgba(201,162,77,0.30))" }}
          />
          <div className="flex flex-col items-center gap-1">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-white/40 uppercase">
              Kynovant OS
            </p>
            <h1 className="text-lg font-semibold text-white/90 tracking-wide">
              Reset Password
            </h1>
          </div>
        </div>

        <div className="h-px w-full bg-[#c9a24d]/14" />

        {state === "sent" ? (
          <div className="flex flex-col gap-5 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#c9a24d]/10 border border-[#c9a24d]/25 flex items-center justify-center">
              <span className="text-[#c9a24d] text-lg">✓</span>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white/85">Check your inbox</p>
              <p className="text-xs text-white/40 leading-relaxed">
                If a Kynovant account exists for{" "}
                <span className="text-white/60">{email}</span>, a password reset
                link has been sent.
              </p>
              <p className="text-xs text-white/28 leading-relaxed mt-1">
                The link expires in 60 minutes. Check your spam folder if you
                don&apos;t see it.
              </p>
            </div>
            <Link
              href="/login"
              className="text-xs text-white/35 hover:text-white/55 transition-colors tracking-wide"
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <p className="text-xs text-white/45 leading-relaxed">
              Enter your email and we&apos;ll send a reset link if a Kynovant
              account exists for that address.
            </p>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                disabled={state === "loading"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT_CLS}
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={state === "loading" || !email.trim()}
                className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {state === "loading" ? "Sending…" : "Send Reset Link"}
              </button>

              <Link
                href="/login"
                className="text-center text-[10px] text-white/30 hover:text-white/50 transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}

        <div className="h-px w-full bg-[#c9a24d]/8" />
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  );
}
