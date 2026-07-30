"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  ClipboardCheck,
  Calendar,
  Folder,
  Dumbbell,
} from "lucide-react";

interface NavItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  exact?: boolean;
  comingSoon?: boolean;
}

const NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Mission Control", href: "/hq",            exact: true },
  { icon: Users,           label: "Clients",         href: "/hq/clients"                 },
  { icon: BookOpen,        label: "Programs",        href: "/hq/programs"                },
  { icon: FileText,        label: "Blueprints",      href: "/hq/blueprints"              },
  { icon: Dumbbell,        label: "Exercise Library", href: "/hq/exercises"              },
  { icon: ClipboardCheck,  label: "Check-Ins",       href: "/hq/check-ins"               },
  { icon: Calendar,        label: "Schedule",        href: "/hq/schedule",   comingSoon: true },
  { icon: Folder,          label: "Documents",       href: "/hq/documents",  comingSoon: true },
];

export default function HQSidebar({ coachName }: { coachName: string }) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.comingSoon) return false;
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  const initials = coachName
    .split("@")[0]
    .split(/[\s._-]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 fixed top-0 left-0 h-full bg-[#0b0c0d] border-r border-white/[0.06] z-30">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-12 border-b border-white/[0.06] shrink-0">
        <Image
          src="/logos/mark-gold.png"
          alt="Catalyst"
          width={16}
          height={16}
          className="opacity-80"
        />
        <div>
          <p className="text-[8px] font-bold tracking-[0.4em] text-white/40 uppercase leading-tight">
            Catalyst
          </p>
          <p className="text-[10px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase leading-tight">
            HQ
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1 overflow-y-auto">
        <p className="text-[9px] text-white/20 uppercase tracking-[0.5em] px-3 pb-2 font-semibold">
          Coaching
        </p>

        {NAV.filter((i) => !i.comingSoon).map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-xs font-medium tracking-wide transition-colors ${
                active
                  ? "bg-[#C9A24D]/10 text-[#C9A24D] border border-[#C9A24D]/15"
                  : "text-white/45 hover:text-white/70 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              <Icon size={13} className={active ? "text-[#C9A24D]" : "text-white/30"} />
              {item.label}
            </Link>
          );
        })}

        <div className="h-px bg-white/[0.05] my-3 mx-3" />

        <p className="text-[9px] text-white/20 uppercase tracking-[0.5em] px-3 pb-2 font-semibold">
          Coming Soon
        </p>

        {NAV.filter((i) => i.comingSoon).map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3 py-2.5 text-xs font-medium tracking-wide text-white/20 cursor-default select-none border border-transparent"
            >
              <Icon size={13} className="text-white/15" />
              {item.label}
              <span className="ml-auto text-[9px] text-white/20 border border-white/10 px-1.5 py-0.5 leading-tight">
                Soon
              </span>
            </div>
          );
        })}
      </nav>

      {/* Coach identity */}
      <div className="px-4 py-4 border-t border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-sm bg-[#C9A24D]/15 border border-[#C9A24D]/25 flex items-center justify-center shrink-0">
            <span className="text-[9px] font-bold text-[#C9A24D] leading-none">{initials}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[10px] font-medium text-white/60 truncate">Coach</span>
            <span className="text-[9px] text-white/30 truncate">{coachName}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
