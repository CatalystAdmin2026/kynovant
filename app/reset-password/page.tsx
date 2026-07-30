"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type State = "idle" | "loading" | "done" | "error";

const INPUT_CLS =
  "w-full bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-[#c9a24d]/40 focus:bg-white/[0.06] transition-colors disabled:opacity-50";

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

function meetsAllRequirements(password: string): boolean {
  return REQUIREMENTS.every((r) => r.test(password));
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const passwordValid = meetsAllRequirements(password);
  const confirmMatch = password === confirm && confirm.length > 0;
  const canSubmit = passwordValid && confirmMatch && state !== "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState("loading");
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setState("error");
      // Do not expose the raw error — a password-link expiry is the most
      // common failure; guide the user to request a new link.
      setError("Unable to update password. Your reset link may have expired. Please request a new one.");
      return;
    }

    setState("done");
    // Redirect to login with success message after a brief delay.
    setTimeout(() => {
      window.location.href = "/login?message=password_updated";
    }, 1800);
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
              Create New Password
            </h1>
          </div>
        </div>

        <div className="h-px w-full bg-[#c9a24d]/14" />

        {state === "done" ? (
          <div className="flex flex-col gap-5 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
              <span className="text-emerald-400 text-lg">✓</span>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white/85">Password updated</p>
              <p className="text-xs text-white/40 leading-relaxed">
                Redirecting you to sign in…
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase"
                >
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={state === "loading"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
              </div>

              {/* Requirements checklist */}
              {password.length > 0 && (
                <div className="flex flex-col gap-1.5 px-1">
                  {REQUIREMENTS.map((r) => {
                    const met = r.test(password);
                    return (
                      <p
                        key={r.label}
                        className={`text-[10px] flex items-center gap-1.5 transition-colors ${
                          met ? "text-emerald-400" : "text-white/35"
                        }`}
                      >
                        <span>{met ? "✓" : "○"}</span>
                        {r.label}
                      </p>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="confirm"
                  className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={state === "loading"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
                {confirm.length > 0 && !confirmMatch && (
                  <p className="text-[10px] text-red-400">Passwords do not match.</p>
                )}
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-950/40 border border-red-800/30 rounded-sm">
                <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                <a
                  href="/forgot-password"
                  className="text-[10px] text-red-300 hover:text-red-200 mt-1 inline-block"
                >
                  Request a new reset link →
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {state === "loading" ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}

        <div className="h-px w-full bg-[#c9a24d]/8" />
      </div>
    </div>
  );
}
