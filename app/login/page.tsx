"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic";
type State = "idle" | "loading" | "sent" | "error";

const OPERATIONAL_ERROR_CODES = new Set([
  "over_email_send_rate_limit",
  "otp_expired",
  "flow_state_expired",
]);

const INPUT_CLS =
  "w-full bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-[#c9a24d]/40 focus:bg-white/[0.06] transition-colors disabled:opacity-50";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = searchParams.get("message");
  const next = searchParams.get("next");

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const systemError =
    error === "access_denied"
      ? "Your account is not currently active. Contact your coach."
      : error === "auth_callback_failed"
        ? "The sign-in link was invalid or expired. Please request a new one."
        : error === "account_not_ready"
          ? "Your account is being set up. Please try again in a moment."
          : null;

  const systemMessage =
    message === "password_updated"
      ? "Password updated. Sign in with your new password."
      : null;

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || state === "loading") return;

    setState("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setState("error");
      // Generic message — never distinguish wrong email from wrong password
      setErrorMessage("Invalid email or password. Please try again.");
      return;
    }

    // Session established. Navigate server-side to resolve role and redirect.
    const roleRedirectUrl = "/auth/role-redirect" + (next ? `?next=${encodeURIComponent(next)}` : "");
    window.location.href = roleRedirectUrl;
  }

  async function handleMagicLinkSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Prevents creating new users — only existing invited accounts receive a link
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      },
    });

    if (authError) {
      const code = authError.code ?? "";
      if (OPERATIONAL_ERROR_CODES.has(code)) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[login] auth operational error:", code);
        }
      } else {
        console.error("[login] signInWithOtp unexpected error:", code);
      }
      setState("error");
      setErrorMessage(
        code === "over_email_send_rate_limit"
          ? "Too many sign-in links requested. Please wait a while and try again."
          : "Something went wrong. Please try again or contact your coach.",
      );
      return;
    }

    setState("sent");
  }

  return (
    <div className="min-h-screen bg-[#080909] flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm flex flex-col gap-10">
        {/* Kynovant mark */}
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
              Kynovant Secure Access
            </h1>
          </div>
        </div>

        <div className="h-px w-full bg-[#c9a24d]/14" />

        {/* System message (password updated, etc.) */}
        {systemMessage && (
          <div className="px-4 py-3 bg-emerald-950/40 border border-emerald-800/30 rounded-sm">
            <p className="text-xs text-emerald-400 leading-relaxed">{systemMessage}</p>
          </div>
        )}

        {/* System error */}
        {systemError && (
          <div className="px-4 py-3 bg-red-950/40 border border-red-800/30 rounded-sm">
            <p className="text-xs text-red-400 leading-relaxed">{systemError}</p>
          </div>
        )}

        {/* Mode: magic link sent */}
        {mode === "magic" && state === "sent" ? (
          <div className="flex flex-col gap-5 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#c9a24d]/10 border border-[#c9a24d]/25 flex items-center justify-center">
              <span className="text-[#c9a24d] text-lg">✓</span>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white/85">Check your inbox</p>
              <p className="text-xs text-white/40 leading-relaxed">
                If an active Kynovant account exists for{" "}
                <span className="text-white/60">{email}</span>, a secure sign-in
                link has been sent.
              </p>
              <p className="text-xs text-white/28 leading-relaxed mt-1">
                The link expires in 60 minutes. Check your spam folder if you
                don&apos;t see it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setState("idle"); setEmail(""); setMode("password"); }}
              className="text-xs text-white/35 hover:text-white/55 transition-colors tracking-wide"
            >
              ← Back to sign in
            </button>
          </div>
        ) : mode === "password" ? (
          /* ── Email + Password (default) ─────────────────── */
          <form onSubmit={handlePasswordSignIn} className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">
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
              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={state === "loading"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {errorMessage && (
              <p className="text-xs text-red-400 leading-relaxed">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={state === "loading" || !email.trim() || !password}
                className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {state === "loading" ? "Signing in…" : "Sign In"}
              </button>

              <div className="flex items-center justify-between">
                <Link
                  href="/forgot-password"
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Forgot password?
                </Link>
                <button
                  type="button"
                  onClick={() => { setMode("magic"); setState("idle"); setErrorMessage(null); }}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Email me a sign-in link
                </button>
              </div>
            </div>

            <p className="text-[10px] text-white/22 text-center leading-relaxed">
              Client access is by coach invitation.
              <br />
              New coach?{" "}
              <Link href="/start-trial" className="text-white/40 hover:text-white/60 transition-colors">
                Start your free trial
              </Link>
            </p>
          </form>
        ) : (
          /* ── Magic Link ──────────────────────────────────── */
          <form onSubmit={handleMagicLinkSignIn} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="email-magic" className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">
                Email Address
              </label>
              <input
                id="email-magic"
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

            {errorMessage && (
              <p className="text-xs text-red-400 leading-relaxed">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={state === "loading" || !email.trim()}
                className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {state === "loading" ? "Sending…" : "Send Secure Sign-In Link"}
              </button>

              <button
                type="button"
                onClick={() => { setMode("password"); setState("idle"); setErrorMessage(null); }}
                className="text-[10px] text-white/30 hover:text-white/50 transition-colors text-center"
              >
                ← Sign in with password
              </button>
            </div>

            <p className="text-[10px] text-white/22 text-center leading-relaxed">
              Client access is by coach invitation.
              <br />
              New coach?{" "}
              <Link href="/start-trial" className="text-white/40 hover:text-white/60 transition-colors">
                Start your free trial
              </Link>
            </p>
          </form>
        )}

        <div className="h-px w-full bg-[#c9a24d]/8" />

        <Link
          href="/"
          className="text-center text-[10px] text-white/25 hover:text-white/45 tracking-[0.1em] uppercase transition-colors"
        >
          ← Kynovant
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
