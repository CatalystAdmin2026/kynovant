"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

type State = "idle" | "loading" | "done" | "error" | "session-ended";

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

function safeOverwatchNext(next: string | null): string {
  if (!next) return "/overwatch";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return "/overwatch";
  if (next === "/overwatch" || next.startsWith("/overwatch?")) return next;
  return "/overwatch";
}

function SetupPasswordContent() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const isOverwatch = searchParams.get("overwatch") === "1";
  const nextPath = safeOverwatchNext(searchParams.get("next"));

  const passwordValid = meetsAllRequirements(password);
  const confirmMatch = password === confirm && confirm.length > 0;
  const canSubmit = passwordValid && confirmMatch && state !== "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setState("loading");
    setError(null);

    // Server-verified: this endpoint independently re-checks the
    // onboarding-activation cookie against the current session before
    // touching the password — a direct/forged POST here without a
    // valid page visit is denied the same way a stale reopen is.
    let res: Response;
    try {
      res = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setState("error");
      setError("Network error. Please try again.");
      return;
    }

    const json = await res.json().catch(() => ({ ok: false }));

    if (!json.ok) {
      if (res.status === 403) {
        // Another tab already completed setup, or this authorization
        // expired — not a scary error, just a clear next step.
        setState("session-ended");
        return;
      }
      setState("error");
      setError(
        typeof json.error === "string"
          ? json.error
          : "Unable to set password. Your invite link may have expired. Contact your coach for a new invite.",
      );
      return;
    }

    setState("done");
    setTimeout(() => {
      window.location.href = isOverwatch
        ? `/auth/overwatch-redirect?next=${encodeURIComponent(nextPath)}`
        : "/auth/role-redirect";
    }, 1500);
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
              Create Your Password
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
              <p className="text-sm font-semibold text-white/85">Account ready</p>
              <p className="text-xs text-white/40 leading-relaxed">
                {isOverwatch ? "Taking you to Overwatch…" : "Taking you in…"}
              </p>
            </div>
          </div>
        ) : state === "session-ended" ? (
          <div className="flex flex-col gap-5 text-center">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white/85">This activation session has ended</p>
              <p className="text-xs text-white/40 leading-relaxed">
                If you already set your password, sign in below. Otherwise, ask your coach for a new invitation.
              </p>
            </div>
            <a
              href="/login"
              className="inline-block bg-[#C9A24D] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#d4b56a]"
            >
              Go to Sign In
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <p className="text-xs text-white/45 leading-relaxed">
              Welcome to Kynovant. Create a password to secure your account —
              you&apos;ll use it every time you sign in.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase"
                >
                  Password
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
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#c9a24d] text-black py-3.5 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {state === "loading" ? "Setting up…" : "Create Password & Enter Portal"}
            </button>

            <p className="text-[10px] text-white/22 text-center leading-relaxed">
              Your password is stored securely and is never visible to your coach.
            </p>
          </form>
        )}

        <div className="h-px w-full bg-[#c9a24d]/8" />
      </div>
    </div>
  );
}

export default function SetupPasswordClient() {
  return (
    <Suspense fallback={null}>
      <SetupPasswordContent />
    </Suspense>
  );
}
