"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X, LayoutDashboard, Users, BookOpen, FileText, ClipboardCheck, Dumbbell, Rocket } from "lucide-react";
import HQSignOutButton from "./HQSignOutButton";

const MAIN_NAV = [
  { icon: LayoutDashboard, label: "Overview",         href: "/hq",             exact: true },
  { icon: Rocket,          label: "Get Started",      href: "/hq/get-started"              },
  { icon: Users,           label: "Clients",          href: "/hq/clients"                  },
  { icon: BookOpen,        label: "Programs",         href: "/hq/programs"                 },
  { icon: FileText,        label: "Blueprints",       href: "/hq/blueprints"               },
  { icon: Dumbbell,        label: "Exercise Library", href: "/hq/exercises"                },
  { icon: ClipboardCheck,  label: "Check-Ins",        href: "/hq/check-ins"                },
];

export default function HQMobileNav({
  coachName,
  onboardingComplete,
}: {
  coachName: string;
  onboardingComplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mainNav = MAIN_NAV.filter((item) => !onboardingComplete || item.href !== "/hq/get-started");
  const setupNav = onboardingComplete
    ? MAIN_NAV.filter((item) => item.href === "/hq/get-started")
    : [];

  function isActive(href: string, exact = false): boolean {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Top bar — mobile only */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-12 bg-[#0b0c0d]/95 backdrop-blur-sm border-b border-white/[0.06] flex items-center px-4 gap-3">
        <Image src="/logos/kynovant-mark.png" alt="Kynovant HQ" width={14} height={14} className="opacity-80" />
        <span className="text-[9px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase flex-1">
          Kynovant HQ
        </span>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="text-white/50 hover:text-white/80 transition-colors"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-64 bg-[#0b0c0d] border-r border-white/[0.08] flex flex-col h-full">
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
                    className={`flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#C9A24D]/10 text-[#C9A24D]"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon size={15} className={active ? "text-[#C9A24D]" : "text-white/30"} />
                    {label}
                  </Link>
                );
              })}

              {setupNav.length > 0 && (
                <>
                  <div className="h-px bg-white/[0.05] my-3" />

                  <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.35em] text-white/20">
                    Setup
                  </p>

                  {setupNav.map(({ icon: Icon, label, href, exact }) => {
                    const active = isActive(href, exact);
                    return (
                      <Link
                        key={label}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors ${
                          active
                            ? "bg-white/[0.04] text-white/55"
                            : "text-white/30 hover:text-white/55 hover:bg-white/[0.03]"
                        }`}
                      >
                        <Icon size={15} className={active ? "text-white/45" : "text-white/20"} />
                        {label}
                      </Link>
                    );
                  })}
                </>
              )}

              <div className="h-px bg-white/[0.05] my-3" />

              <div className="px-3 py-2 text-xs text-white/20 space-y-2">
                {["Schedule", "Documents"].map((label) => (
                  <div key={label} className="flex items-center gap-2">
                    <span>{label}</span>
                    <span className="text-[9px] border border-white/10 px-1 text-white/15">Soon</span>
                  </div>
                ))}
              </div>
            </nav>

            <div className="px-4 py-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/30 truncate">{coachName}</p>
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
