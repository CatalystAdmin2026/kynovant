"use client";

// ─────────────────────────────────────────────────────────────
// Client Portal — mobile top app bar + account menu.
//
// Why this exists: on phone widths the desktop PortalSidebar
// (`hidden lg:flex`) is gone, and MobilePortalNav is a 7-item bottom
// tab bar with no room for account controls. Before this component,
// a client on a phone — or inside the installed PWA, which always
// runs at phone width — had NO navigational route to /account or to
// Sign Out at all (the only /account link in the whole Portal lived
// in the desktop-only sidebar). A real test client reported being
// unable to find Sign Out inside the installed Android PWA.
//
// Scope of this component: a small, `lg:hidden` fixed header with the
// Kynovant mark on the left and a circular account button on the
// right that opens a lightweight popover exposing exactly three
// things — Account, the existing Install affordance, and the
// existing Sign Out. It introduces NO new auth/session logic: Sign
// Out is the unchanged Portal `LogoutButton`, and install is the
// unchanged `InstallKynovant` "menu" variant. Desktop is untouched
// (this whole component is `lg:hidden`; PortalSidebar is unchanged).
//
// Deliberately a plain disclosure popover, not a `role="menu"`
// widget: the strict menu keyboard model (arrow-key roving focus) is
// easy to get subtly wrong, and this is three ordinary links/buttons.
// Tab moves through them natively; Escape and outside-click close and
// return focus to the trigger.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { User, X } from "lucide-react";
import InstallKynovant from "@/components/pwa/InstallKynovant";
import LogoutButton from "./LogoutButton";

interface Props {
  clientName: string;
}

function toInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PortalMobileHeader({ clientName }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Escape closes and returns focus to the trigger; outside pointer
  // interaction closes. Both only while the popover is open.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Move focus into the popover when it opens so keyboard users land
  // on the first action rather than having to tab from the trigger.
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  const initials = toInitials(clientName) || "C";

  return (
    <header className="lg:hidden fixed top-0 inset-x-0 z-50 h-[calc(3.25rem+env(safe-area-inset-top))] bg-[#0c0d0e]/95 backdrop-blur-md border-b border-white/[0.05] pt-[env(safe-area-inset-top)] flex items-center justify-between px-4">
      {/* Kynovant identity */}
      <div className="flex items-center gap-2.5">
        <Image
          src="/logos/kynovant-mark.png"
          alt="Kynovant"
          width={18}
          height={18}
          className="opacity-75"
        />
        <span className="text-[10px] font-semibold tracking-[0.28em] text-white/35 uppercase">
          Kynovant OS
        </span>
      </div>

      {/* Account control */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Account menu"
        className="flex h-11 w-11 -mr-2 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/80"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c9a24d]/25 bg-[#c9a24d]/10">
          {open ? (
            <X size={15} className="text-white/70" />
          ) : (
            <span className="text-[10px] font-bold leading-none text-[#c9a24d]/80">
              {initials}
            </span>
          )}
        </span>
      </button>

      {open && (
        <>
          {/* Non-visual outside-click catcher below the panel. Pointer
              handling above already closes on outside interaction; this
              keeps the tap from also hitting Portal content underneath. */}
          <div
            className="fixed inset-0 z-40 lg:hidden"
            aria-hidden
            onClick={close}
          />
          <div
            ref={panelRef}
            id={panelId}
            className="fixed right-3 top-[calc(3.25rem+env(safe-area-inset-top))] z-50 w-[calc(100vw-1.5rem)] max-w-xs rounded-xl border border-white/[0.08] bg-[#0b0c0d] p-2 shadow-2xl lg:hidden"
          >
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25 truncate">
              {clientName}
            </p>

            <Link
              ref={firstItemRef}
              href="/account"
              onClick={close}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <User size={15} className="text-white/35" />
              Account
            </Link>

            {/* Existing install affordance — "menu" variant renders
                nothing on browsers that can't install and once
                installed, so it self-hides where it has no purpose. */}
            <div className="px-1 py-1">
              <InstallKynovant variant="menu" scope="portal" />
            </div>

            <div className="my-1 h-px bg-white/[0.06]" />

            {/* Existing Portal sign-out — no duplicated auth logic. */}
            <div className="flex min-h-11 items-center px-3">
              <LogoutButton className="text-sm text-white/55 hover:text-white/80" />
            </div>
          </div>
        </>
      )}
    </header>
  );
}
