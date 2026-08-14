"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "error";

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

function FragmentCallbackContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;

    async function finishCallback() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = searchParams.get("type") ?? params.get("type");
      const overwatch = searchParams.get("overwatch");
      const next = searchParams.get("next");

      if (!accessToken || !refreshToken) {
        window.location.replace(
          overwatch === "1"
            ? `/overwatch/login?error=auth_callback_failed&next=${encodeURIComponent(safeOverwatchNext(next))}`
            : "/login?error=auth_callback_failed",
        );
        return;
      }

      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        window.location.replace(
          overwatch === "1"
            ? `/overwatch/login?error=auth_callback_failed&next=${encodeURIComponent(safeOverwatchNext(next))}`
            : "/login?error=auth_callback_failed",
        );
        return;
      }

      if (type === "recovery") {
        const destination = overwatch === "1"
          ? `/reset-password?overwatch=1&next=${encodeURIComponent(safeOverwatchNext(next))}`
          : "/reset-password";
        window.location.replace(destination);
        return;
      }

      if (type === "invite") {
        const destination = overwatch === "1"
          ? `/setup-password?overwatch=1&next=${encodeURIComponent(safeOverwatchNext(next))}`
          : "/setup-password";
        window.location.replace(destination);
        return;
      }

      if (overwatch === "1") {
        window.location.replace(`/auth/overwatch-redirect?next=${encodeURIComponent(safeOverwatchNext(next))}`);
        return;
      }

      window.location.replace(next ? `/auth/role-redirect?next=${encodeURIComponent(next)}` : "/auth/role-redirect");
    }

    finishCallback().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

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
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">
            Kynovant OS
          </p>
          <h1 className="text-lg font-semibold text-white/90">
            {state === "error" ? "Unable to complete sign in" : "Completing secure sign in"}
          </h1>
          <p className="text-xs leading-6 text-white/42">
            {state === "error"
              ? "The sign-in link could not be verified. Please request a new link."
              : "One moment while your browser verifies this secure link."}
          </p>
        </div>
      </section>
    </main>
  );
}

export default function FragmentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <FragmentCallbackContent />
    </Suspense>
  );
}
