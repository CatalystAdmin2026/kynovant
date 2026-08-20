"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst OS — Explicit-Action Invitation/Recovery Acceptance
//
// Root cause this exists to fix (proven on staging, not assumed):
// Supabase's invite/recovery/magic-link tokens are single-use and are
// consumed the INSTANT the emailed link is GET-requested — by anyone
// or anything, not only the intended human. Email security gateways
// (Microsoft Defender for Office 365 Safe Links, Google Workspace
// link scanning, and many consumer mail apps) routinely pre-fetch
// every link in an incoming email to scan its destination. Since the
// old flow emailed Supabase's own auto-consuming action_link
// directly, that automated pre-fetch silently burned the token before
// the real human ever clicked — and the human's own, genuinely first,
// click then failed with Supabase's own
// "Email link is invalid or has expired", surfaced by this app as
// "The sign-in link was invalid or expired." This reproduced
// identically and reliably in a controlled staging test: a bare
// second HTTP GET to the same action_link (no human involved) is
// sufficient to invalidate it for the real click that follows.
//
// Fix: never email a link that auto-consumes on GET. Email a link to
// THIS page instead — token_hash + type in a normal, static query
// string. A passive GET (by a scanner, a mail client's preview, or a
// search-engine bot) only renders inert HTML; nothing is verified
// until the human performs a real interaction (this button). Only
// THAT click redeems the token. Scanners don't click buttons.
//
// Activation-gate follow-up: the actual redemption now happens via a
// POST to /api/auth/verify-invite instead of calling
// supabase.auth.verifyOtp() directly from the browser. Functionally
// identical (same call, same Supabase mechanics, same resulting
// session) — moved server-side so that on success, for type=invite,
// the SAME response can also mint the short-lived onboarding-
// activation cookie /setup-password now requires. See
// lib/auth/onboarding-token.ts for why a client-side call couldn't do
// this (HttpOnly cookies can only be set from a server response).
//
// P0 FIX (production incident — Fiona Walczynski's real invitation:
// page loaded, "Accept Invitation" rendered, tap did nothing): proven
// live, not assumed — the URL-scrub effect below (added for a real,
// separate, legitimate reason: keeping token_hash out of the Referer
// header on any subsequent same-origin navigation) calls
// window.history.replaceState() to strip token_hash from the visible
// URL/history entry. Next.js's App Router patches
// history.pushState/replaceState to keep its own router state in
// sync, and that patched call turns out to trigger a re-render of
// this component via useSearchParams() using the NEW, now-
// token_hash-less URL — reproduced directly in Chrome via DOM
// inspection: seconds after mount, the rendered button carried
// disabled="" because the `!tokenHash` clause in its disabled
// condition had gone true. A disabled button doesn't fire onClick at
// all — exactly "it says accept invitation and it won't let me click
// it." Not Safari-specific: it's universal, just first reported by a
// real user completing the actual unauthenticated flow (the
// pre-deploy smoke test only exercised the already-authenticated
// "already-active" branch, which never reaches this button).
//
// Fix: read type/token_hash/overwatch/next from the URL exactly ONCE,
// via a useState lazy initializer seeded from useSearchParams() on
// this component's first render only (still SSR/hydration-safe,
// unlike reading window.location.search directly, since
// useSearchParams() is what makes the first server- and client-
// rendered pass agree). React never re-runs a useState initializer on
// later re-renders, so this captured value is permanently immune to
// whatever the router does afterward in reaction to the replaceState
// call below. The scrub itself is unchanged — still runs, still keeps
// the token out of the visible URL/history — it just no longer feeds
// back into anything this component reads.
// ─────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

type State = "ready" | "verifying" | "error" | "already-active";

const KNOWN_TYPES: EmailOtpType[] = ["invite", "recovery", "magiclink", "signup", "email_change", "email"];

interface AcceptParams {
  type: EmailOtpType | null;
  tokenHash: string | null;
  overwatch: string | null;
  next: string | null;
}

function safeOverwatchNext(next: string | null): string {
  if (!next) return "/overwatch";
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/overwatch";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://")) return "/overwatch";
  if (decoded === "/overwatch" || decoded.startsWith("/overwatch?")) return decoded;
  return "/overwatch";
}

function copyFor(type: EmailOtpType | null) {
  if (type === "recovery") {
    return {
      eyebrow: "Password Reset",
      title: "Confirm password reset",
      body: "Tap below to confirm it's you, then choose a new password.",
      cta: "Continue",
    };
  }
  return {
    eyebrow: "Kynovant OS",
    title: "You're invited to Kynovant",
    body: "Tap below to accept your invitation and set up your account.",
    cta: "Accept Invitation",
  };
}

function AcceptContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Captured exactly once, on this component's first render — see the
  // file header for why. searchParams itself is only ever read inside
  // this initializer, never again afterward.
  const [{ type, tokenHash, overwatch, next }] = useState<AcceptParams>(() => {
    const rawType = searchParams.get("type");
    return {
      type: rawType && (KNOWN_TYPES as string[]).includes(rawType) ? (rawType as EmailOtpType) : null,
      tokenHash: searchParams.get("token_hash"),
      overwatch: searchParams.get("overwatch"),
      next: searchParams.get("next"),
    };
  });

  // A returning, already-authenticated user who taps a stale invite/
  // recovery link from an old email (Phase 3 case E) shouldn't see an
  // error at all — they're already in. Send them straight to their
  // real destination instead of asking them to re-verify a token they
  // no longer need.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) setState("already-active");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Do not leave the one-time token in browser history after the inert
  // landing page has captured it. The token remains in component memory for
  // the explicit action, but same-origin navigation cannot inherit it via
  // the Referer header after this replacement.
  useEffect(() => {
    const cleanUrl = new URL(window.location.href);
    if (!cleanUrl.searchParams.has("token_hash")) return;
    cleanUrl.searchParams.delete("token_hash");
    window.history.replaceState(null, document.title, cleanUrl.toString());
  }, []);

  async function handleAccept() {
    if (!tokenHash || !type) {
      setState("error");
      setErrorMessage("This link is missing required information.");
      return;
    }
    setState("verifying");
    setErrorMessage(null);

    let ok = false;
    let message: string | null = null;
    try {
      const res = await fetch("/api/auth/verify-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type }),
      });
      const json = await res.json();
      ok = res.ok && json.ok === true;
      message = typeof json.error === "string" ? json.error : null;
    } catch {
      message = "Network error. Please try again.";
    }

    if (!ok) {
      setState("error");
      setErrorMessage(message);
      return;
    }

    if (type === "recovery") {
      window.location.replace(
        overwatch === "1"
          ? `/reset-password?overwatch=1&next=${encodeURIComponent(safeOverwatchNext(next))}`
          : "/reset-password",
      );
      return;
    }
    if (type === "invite") {
      window.location.replace(
        overwatch === "1"
          ? `/setup-password?overwatch=1&next=${encodeURIComponent(safeOverwatchNext(next))}`
          : "/setup-password",
      );
      return;
    }
    if (overwatch === "1") {
      window.location.replace(`/auth/overwatch-redirect?next=${encodeURIComponent(safeOverwatchNext(next))}`);
      return;
    }
    window.location.replace(next ? `/auth/role-redirect?next=${encodeURIComponent(next)}` : "/auth/role-redirect");
  }

  useEffect(() => {
    if (state !== "already-active") return;
    const timer = setTimeout(() => {
      if (overwatch === "1") {
        window.location.replace(`/auth/overwatch-redirect?next=${encodeURIComponent(safeOverwatchNext(next))}`);
      } else {
        window.location.replace(next ? `/auth/role-redirect?next=${encodeURIComponent(next)}` : "/auth/role-redirect");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [state, overwatch, next]);

  const copy = copyFor(type);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080909] px-5 text-[#f3f1ea]">
      <section className="flex w-full max-w-sm flex-col items-center gap-7 text-center">
        <Image
          src="/logos/kynovant-mark.png"
          alt="Kynovant"
          width={36}
          height={36}
          priority
          style={{ filter: "drop-shadow(0 0 14px rgba(201,162,77,0.30))" }}
        />

        {state === "already-active" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">Kynovant OS</p>
            <h1 className="text-lg font-semibold text-white/90">You&apos;re already signed in</h1>
            <p className="text-xs leading-6 text-white/42">Taking you in…</p>
          </div>
        ) : state === "error" ? (
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">{copy.eyebrow}</p>
            <h1 className="text-lg font-semibold text-white/90">Your link is no longer valid</h1>
            <p className="text-xs leading-6 text-white/42">
              {type === "recovery"
                ? "This password reset link has already been used or has expired. Request a new one from the sign-in page."
                : "This invitation link has already been used or has expired. Ask your coach to send you a new invitation."}
            </p>
            {errorMessage && (
              <p className="text-[10px] text-white/22" aria-hidden="true">
                {errorMessage}
              </p>
            )}
            <a
              href="/login"
              className="inline-block bg-[#C9A24D] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#d4b56a]"
            >
              Go to Sign In
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">{copy.eyebrow}</p>
              <h1 className="text-lg font-semibold text-white/90">{copy.title}</h1>
              <p className="text-xs leading-6 text-white/42">{copy.body}</p>
            </div>
            <button
              type="button"
              onClick={handleAccept}
              disabled={state === "verifying" || !tokenHash || !type}
              className="min-h-[44px] w-full bg-[#C9A24D] px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#d4b56a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "verifying" ? "Verifying…" : copy.cta}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function AcceptPage() {
  return (
    <Suspense fallback={null}>
      <AcceptContent />
    </Suspense>
  );
}
