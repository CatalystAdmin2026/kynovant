"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { resolveInstallSurface, type InstallSurface } from "@/lib/pwa/install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Variant = "nav" | "menu" | "card";

interface Props {
  variant?: Variant;
  className?: string;
}

const DISMISSED_KEY = "kynovant:pwa-install-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean) {
  try {
    if (value) window.localStorage.setItem(DISMISSED_KEY, "true");
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Storage can be unavailable in some private browsing contexts.
  }
}

function getEnvironment(hasNativePrompt: boolean) {
  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
    displayModeStandalone: Boolean(standaloneQuery?.matches),
    navigatorStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    hasNativePrompt,
  };
}

export default function InstallKynovant({ variant = "nav", className = "" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [surface, setSurface] = useState<InstallSurface>("unsupported");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function update(nextPrompt: BeforeInstallPromptEvent | null = null) {
      setSurface(resolveInstallSurface(getEnvironment(Boolean(nextPrompt))));
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      setPromptEvent(installEvent);
      setDismissed(false);
      writeDismissed(false);
      update(installEvent);
    }

    function onAppInstalled() {
      setPromptEvent(null);
      setInstructionsOpen(false);
      setSurface("installed");
    }

    const initTimer = window.setTimeout(() => {
      setMounted(true);
      setDismissed(readDismissed());
      update(null);
    }, 0);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const onStandaloneChange = () => update(null);
    standaloneQuery?.addEventListener?.("change", onStandaloneChange);

    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      standaloneQuery?.removeEventListener?.("change", onStandaloneChange);
    };
  }, []);

  const label = useMemo(() => {
    if (surface === "ios_instructions") return "Add to Home Screen";
    return "Install Kynovant";
  }, [surface]);

  if (!mounted || surface === "installed" || surface === "unsupported" || (variant === "card" && dismissed)) {
    return null;
  }

  async function install() {
    if (surface === "ios_instructions") {
      setInstructionsOpen(true);
      return;
    }

    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "dismissed") {
      setDismissed(true);
      writeDismissed(true);
    }
    setSurface(resolveInstallSurface(getEnvironment(false)));
  }

  function dismiss() {
    setDismissed(true);
    setInstructionsOpen(false);
    writeDismissed(true);
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
                onClick={install}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#C9A24D] px-4 text-xs font-semibold text-black transition-colors hover:bg-[#D4B56A]"
              >
                {label}
              </button>
            </div>
            <button
              type="button"
              onClick={dismiss}
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
        onClick={install}
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

function InstallInstructions({ onClose }: { onClose: () => void }) {
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
