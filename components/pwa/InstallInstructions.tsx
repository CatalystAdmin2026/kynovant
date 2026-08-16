"use client";

// ─────────────────────────────────────────────────────────────
// Shared iOS Safari "Add to Home Screen" instructions sheet.
//
// Extracted from InstallKynovant.tsx so PortalInstallOnboarding.tsx can
// show the exact same, already-shipped instructions rather than a second,
// duplicated copy — there is only one iOS install-instructions surface
// in the app, reused by both entry points.
// ─────────────────────────────────────────────────────────────

import { PlusSquare, Share, X } from "lucide-react";

export default function InstallInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#080909] p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Add Kynovant to Home Screen</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              Safari handles installation from the browser share menu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.05] hover:text-white/75"
          >
            <X size={16} />
          </button>
        </div>
        <ol className="space-y-3 text-sm text-white/70">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#C9A24D]/25 text-[11px] text-[#C9A24D]">1</span>
            <span className="flex-1">Tap the <Share className="mx-1 inline size-4 text-[#C9A24D]" aria-label="Share" /> Share button in Safari.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#C9A24D]/25 text-[11px] text-[#C9A24D]">2</span>
            <span className="flex-1">Choose <span className="font-semibold text-white">Add to Home Screen</span>.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#C9A24D]/25 text-[11px] text-[#C9A24D]">3</span>
            <span className="flex-1">Tap <PlusSquare className="mx-1 inline size-4 text-[#C9A24D]" aria-hidden /> <span className="font-semibold text-white">Add</span>.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
