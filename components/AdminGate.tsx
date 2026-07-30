"use client";

// TODO: Replace this client-side password gate with real server-side authentication
// before deploying to production or sharing the URL externally. Recommended path:
//   1. Next.js middleware + signed httpOnly JWT cookie verified on every request, OR
//   2. NextAuth.js credentials provider backed by a hashed secret in env vars, OR
//   3. Clerk / WorkOS for zero-config auth with org-level access control.
// The current approach is security-by-obscurity only — it prevents casual access
// but does NOT protect against anyone who inspects the page source or network traffic.

import { useState, useEffect, useRef } from "react";

const SESSION_KEY    = "catalyst_admin_access";
const ADMIN_PASSWORD = "Catalyst2026!";

// Synchronous check during render — same pattern as AccessGuard to satisfy
// the react-hooks/set-state-in-effect lint rule (no setState inside useEffect).
function checkAdminAccess(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  // Set by handleSubmit (event handler) — never by an effect
  const [grantedManually, setGrantedManually] = useState(false);
  const [input, setInput]                     = useState("");
  const [error, setError]                     = useState(false);
  const [shake, setShake]                     = useState(false);
  const inputRef                              = useRef<HTMLInputElement>(null);

  const isGranted = grantedManually || checkAdminAccess();

  // Side-effect only — no setState — focuses the password field when the gate is shown
  useEffect(() => {
    if (!isGranted) inputRef.current?.focus();
  }, [isGranted]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setGrantedManually(true);
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 420);
    }
  };

  if (isGranted) return <>{children}</>;

  return (
    <>
      <style>{`
        @keyframes admin-shake {
          0%, 100% { transform: translateX(0); }
          18%       { transform: translateX(-7px); }
          36%       { transform: translateX(7px); }
          54%       { transform: translateX(-4px); }
          72%       { transform: translateX(4px); }
          88%       { transform: translateX(-2px); }
        }
        .admin-shake { animation: admin-shake 0.42s ease; }
      `}</style>

      <div className="min-h-screen bg-[#080909] flex items-center justify-center px-6">
        <div className="w-full max-w-[360px]">

          {/* Branding */}
          <div className="text-center mb-10">
            <div className="w-1.5 h-8 bg-[#C9A24D] rounded-sm mx-auto mb-7" />
            <p className="text-[10px] tracking-[0.65em] text-gray-600 uppercase font-semibold mb-3">
              Kynovant
            </p>
            <h1 className="text-white text-xl font-semibold tracking-wide">
              Command Center
            </h1>
            <p className="text-gray-700 text-xs mt-2 tracking-wide">
              Internal access only.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className={shake ? "admin-shake" : ""}>
            <div className="mb-3">
              <input
                ref={inputRef}
                type="password"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(false); }}
                placeholder="Access code"
                autoComplete="current-password"
                className={`w-full bg-[#0d0e0f] border text-white px-4 py-3.5 text-sm focus:outline-none transition-colors duration-150 placeholder-gray-700 ${
                  error
                    ? "border-red-500/50 focus:border-red-500/70"
                    : "border-white/[0.08] focus:border-[#C9A24D]/50"
                }`}
              />
              <div className="h-5 flex items-center mt-1.5 px-0.5">
                {error && (
                  <p className="text-red-400 text-[11px] tracking-wide">
                    Incorrect access code.
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.28em] uppercase py-4 hover:bg-[#D4B56A] transition-colors duration-200"
            >
              Access Dashboard
            </button>
          </form>

          <p className="text-gray-800 text-[10px] text-center mt-10 tracking-wide">
            Do not share this URL.
          </p>
        </div>
      </div>
    </>
  );
}
