"use client";

// Catches an error thrown by any HQ page below this segment (never by
// app/hq/layout.tsx itself, which is why the sidebar/top bar stay
// mounted and visible around this — see Next.js error boundary scoping).
// Mirrors app/portal/error.tsx's pattern, adapted for a coach audience.

import { useEffect } from "react";
import Link from "next/link";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function HQError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[hq-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-5">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 text-center">
        <div className="w-10 h-10 rounded-sm bg-red-950/40 border border-red-800/30 flex items-center justify-center">
          <span className="text-red-400 text-sm">!</span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-white/80 text-sm font-semibold">Something went wrong</p>
          <p className="text-white/40 text-xs leading-relaxed max-w-xs">
            An unexpected error occurred loading this page. Nothing was lost — try again, or head
            back to your overview.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <button
            type="button"
            onClick={reset}
            className="w-full bg-[#c9a24d] text-black py-3 text-[11px] font-bold tracking-[0.14em] uppercase hover:bg-[#d4b56a] transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/hq"
            className="text-xs text-white/30 hover:text-white/55 transition-colors"
          >
            ← Back to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
