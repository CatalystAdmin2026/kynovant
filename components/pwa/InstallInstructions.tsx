"use client";

// ─────────────────────────────────────────────────────────────
// Shared iOS Safari "Add to Home Screen" instructions sheet.
//
// Extracted from InstallKynovant.tsx so PortalInstallOnboarding.tsx can
// show the exact same, already-shipped instructions rather than a second,
// duplicated copy — there is only one iOS install-instructions surface
// in the app, reused by both entry points.
//
// P0 FIX (real iPhone user report — Fiona Walczynski: tapping "Show Me
// How" / "Install Kynovant" on iOS Safari appeared to do nothing):
// proven via a direct visual reproduction of the exact class names
// used at the time — z-[80] here sat BELOW PortalInstallOnboarding's
// own bottom sheet (z-[90]), which never unmounted itself while this
// modal opened. Both are `fixed` and bottom-anchored on mobile
// (`items-end` here, `bottom-0` there), so the still-visible, higher-
// stacked sheet fully occluded this modal in the exact same screen
// region — internally `instructionsOpen` correctly became `true` and
// this component correctly mounted, but nothing new was visible or
// reachable, indistinguishable from the tap doing nothing at all.
// z-[95] — above every other install-surface z-index in this app
// (PortalInstallOnboarding's sheet is the highest of the rest, at
// z-[90]) — so this modal always wins the stacking order regardless of
// which caller opened it, present or future. PortalInstallOnboarding
// additionally stops rendering its own sheet while this is open (see
// that file) — belt-and-suspenders, not either-or: two overlapping
// "install Kynovant" surfaces at once is confusing even if correctly
// stacked.
// ─────────────────────────────────────────────────────────────

import { PlusSquare, Share, X } from "lucide-react";

export default function InstallInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
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
