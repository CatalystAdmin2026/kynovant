"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type State = "idle" | "loading" | "sent" | "error";

const inputClass =
  "w-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/85 placeholder:text-white/20 transition-colors focus:border-[#c9a24d]/45 focus:bg-white/[0.06] focus:outline-none disabled:opacity-50";

const ERROR_COPY: Record<string, string> = {
  authentication_required: "Founder authorization is required to open Overwatch.",
  forbidden: "This signed-in account is not authorized for Kynovant Overwatch.",
  inactive: "This administrator account is not currently available for Overwatch access.",
  auth_callback_failed: "The sign-in link was invalid or expired. Request a new one.",
};

export default function OverwatchLoginClient({
  initialError,
  nextPath,
}: {
  initialError: string | null;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? ERROR_COPY[initialError] ?? ERROR_COPY.forbidden : null,
  );

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || state === "loading") return;

    setState("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setState("error");
      setErrorMessage("Invalid credentials or unauthorized account.");
      return;
    }

    window.location.href = `/auth/overwatch-redirect?next=${encodeURIComponent(nextPath)}`;
  }

  async function handleMagicLink() {
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?overwatch=1&next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setState("error");
      setErrorMessage(
        error.code === "over_email_send_rate_limit"
          ? "Too many sign-in links requested. Wait a while and try again."
          : "Unable to send a founder sign-in link for that account.",
      );
      return;
    }

    setState("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080909] px-5 py-12 text-[#f3f1ea]">
      <section className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <Image
              src="/logos/kynovant-mark.png"
              alt="Kynovant"
              width={34}
              height={34}
              priority
              className="h-8 w-8"
            />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#c9a24d]/80">
                Kynovant Overwatch
              </p>
              <p className="text-xs text-white/34">Founder access</p>
            </div>
          </div>

          <div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Founder command requires administrator authorization.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/46">
              This surface controls Kynovant business visibility and is restricted to verified administrator accounts.
            </p>
          </div>

          <div className="grid gap-3 text-xs text-white/38 sm:grid-cols-3">
            <div className="border border-white/[0.08] bg-white/[0.025] p-4">Server-verified session</div>
            <div className="border border-white/[0.08] bg-white/[0.025] p-4">Role-based authorization</div>
            <div className="border border-white/[0.08] bg-white/[0.025] p-4">Kynovant-only route</div>
          </div>
        </div>

        <div className="border border-white/[0.08] bg-[#101113] p-6 sm:p-8">
          <div className="mb-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#c9a24d]/70">
              Secure Sign In
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Overwatch Access</h2>
          </div>

          {state === "sent" ? (
            <div className="space-y-5 text-sm">
              <p className="text-white/78">Check your inbox.</p>
              <p className="leading-6 text-white/42">
                If this address belongs to a Kynovant administrator, a secure sign-in link has been sent.
              </p>
              <button
                type="button"
                onClick={() => setState("idle")}
                className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a24d]/80 hover:text-[#d4b56a]"
              >
                Back to password sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordSignIn} className="space-y-5">
              {errorMessage && (
                <div className="border border-red-300/20 bg-red-300/[0.06] px-4 py-3">
                  <p className="text-xs leading-relaxed text-red-100/80">{errorMessage}</p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="overwatch-email" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Administrator Email
                </label>
                <input
                  id="overwatch-email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={state === "loading"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className={inputClass}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="overwatch-password" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Password
                </label>
                <input
                  id="overwatch-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={state === "loading"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={state === "loading" || !email.trim() || !password}
                className="min-h-[46px] w-full bg-[#c9a24d] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#d4b56a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "loading" ? "Verifying..." : "Enter Overwatch"}
              </button>

              <button
                type="button"
                disabled={state === "loading" || !email.trim()}
                onClick={handleMagicLink}
                className="w-full border border-white/[0.08] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/44 transition-colors hover:border-white/[0.16] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Email Secure Link
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
