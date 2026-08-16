"use client";

import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { usePwaInstallState } from "@/lib/pwa/use-install-state";
import InstallInstructions from "./InstallInstructions";

type Variant = "nav" | "menu" | "card";

interface Props {
  variant?: Variant;
  className?: string;
}

export default function InstallKynovant({ variant = "nav", className = "" }: Props) {
  const { mounted, surface, dismissed, install, dismiss } = usePwaInstallState();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const label = useMemo(() => {
    if (surface === "ios_instructions") return "Add to Home Screen";
    return "Install Kynovant";
  }, [surface]);

  if (!mounted || surface === "installed" || surface === "unsupported" || (variant === "card" && dismissed)) {
    return null;
  }

  async function handleInstall() {
    const outcome = await install();
    if (outcome === "ios_instructions") setInstructionsOpen(true);
  }

  function handleDismiss() {
    setInstructionsOpen(false);
    dismiss();
  }

  if (variant === "card") {
    return (
      <>
        <div className={`rounded-xl border border-[#C9A24D]/20 bg-[#0b0c0d] p-4 ${className}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C9A24D]/20 bg-[#C9A24D]/10 text-[#C9A24D]">
              <Download size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Install Kynovant</p>
              <p className="mt-1 text-xs leading-relaxed text-white/40">
                Add Kynovant to your home screen for a cleaner browser-based launch.
              </p>
              <button
                type="button"
                onClick={handleInstall}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#C9A24D] px-4 text-xs font-semibold text-black transition-colors hover:bg-[#D4B56A]"
              >
                {label}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {instructionsOpen && <InstallInstructions onClose={() => setInstructionsOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className={
          variant === "menu"
            ? `flex w-full items-center justify-center gap-2 border border-white/10 py-3 text-center text-sm font-semibold tracking-wide text-gray-300 transition-colors hover:border-white/25 hover:text-white ${className}`
            : `inline-flex min-h-11 items-center justify-center gap-2 border border-white/10 px-4 text-sm font-semibold tracking-wide text-gray-300 transition-colors hover:border-white/25 hover:text-white ${className}`
        }
      >
        <Download size={15} />
        {label}
      </button>
      {instructionsOpen && <InstallInstructions onClose={() => setInstructionsOpen(false)} />}
    </>
  );
}
