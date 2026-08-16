"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, MessageSquare, X } from "lucide-react";
import InstallKynovant from "@/components/pwa/InstallKynovant";
import HQMobileActions from "./HQMobileActions";
import HQSignOutButton from "./HQSignOutButton";
import {
  comingSoonHQNavItems,
  visibleHQNavItems,
} from "./HQNavItems";

export default function HQMobileNav({
  coachName,
}: {
  coachName: string;
}) {
  const [open, setOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const pathname = usePathname();
  const mainNav = visibleHQNavItems();
  const comingSoonNav = comingSoonHQNavItems();

  // Simple polling MVP — mirrors HQTopBar's own badge fetch (the
  // desktop top bar is `hidden lg:flex`, so mobile needs its own).
  useEffect(() => {
    async function loadUnreadMessageCount() {
      try {
        const res = await fetch("/api/internal/hq/messages/unread-count");
        const json = await res.json();
        if (res.ok && json.ok) setUnreadMessageCount(Number(json.unreadCount ?? 0));
      } catch {
        // Badge just stays at its last known value.
      }
    }
    void loadUnreadMessageCount();
    const interval = window.setInterval(loadUnreadMessageCount, 20000);
    return () => window.clearInterval(interval);
  }, []);

  function isActive(href: string, exact = false): boolean {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Top bar — mobile only */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-[calc(3rem+env(safe-area-inset-top))] bg-[#0b0c0d]/95 backdrop-blur-sm border-b border-white/[0.06] flex items-end px-3 pb-1.5 pt-[env(safe-area-inset-top)] gap-1">
        <Image src="/logos/kynovant-mark.png" alt="Kynovant HQ" width={14} height={14} className="opacity-80" />
        <span className="min-w-0 flex-1 truncate text-[9px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase">
          Kynovant HQ
        </span>
        <HQMobileActions />
        <Link
          href="/hq/messages"
          aria-label="Open messages"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          <MessageSquare size={17} />
          {unreadMessageCount > 0 && (
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
          )}
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-[18rem] max-w-[86vw] bg-[#0b0c0d] border-r border-white/[0.08] shadow-2xl flex flex-col h-full">
            <div className="flex items-center gap-2.5 px-5 h-12 border-b border-white/[0.06]">
              <Image src="/logos/kynovant-mark.png" alt="" width={14} height={14} className="opacity-80" />
              <span className="text-[9px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase flex-1">
                Kynovant HQ
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close navigation" className="text-white/40 hover:text-white/70">
                <X size={16} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {mainNav.map(({ icon: Icon, label, href, exact }) => {
                const active = isActive(href, exact);
                return (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#C9A24D]/10 text-[#C9A24D] border border-[#C9A24D]/15"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    <Icon size={15} className={active ? "text-[#C9A24D]" : "text-white/30"} />
                    {label}
                  </Link>
                );
              })}

              {comingSoonNav.length > 0 && (
                <>
                  <div className="h-px bg-white/[0.05] my-3" />

                  <div className="px-3 py-2 text-xs text-white/20 space-y-2">
                    {comingSoonNav.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2">
                        <Icon size={13} className="text-white/15" />
                        <span>{label}</span>
                        <span className="text-[9px] border border-white/10 px-1 text-white/15">Soon</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </nav>

            <div className="px-4 py-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/30 truncate">{coachName}</p>
              <InstallKynovant variant="card" className="mt-3" />
              <div className="mt-3">
                <HQSignOutButton compact />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
