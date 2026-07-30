"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Calendar, FileText, Layers, LayoutDashboard, Utensils } from "lucide-react";

const TABS = [
  { icon: LayoutDashboard, label: "Today",     href: "/portal",           exact: true },
  { icon: Layers,          label: "Program",   href: "/portal/program"                },
  { icon: Activity,        label: "Progress",  href: "/portal/progress"               },
  { icon: Calendar,        label: "Check-Ins", href: "/portal/check-ins"              },
  { icon: Utensils,        label: "Nutrition", href: "/portal/nutrition"              },
  { icon: FileText,        label: "Docs",      href: "/portal/documents"              },
];

export default function MobilePortalNav() {
  const pathname = usePathname();

  function isActive(tab: (typeof TABS)[number]): boolean {
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(tab.href + "/");
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c0d0e]/95 backdrop-blur-md border-t border-white/[0.05] h-[64px] flex items-stretch">
      {TABS.map((tab) => {
        const active = isActive(tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
              active ? "text-white" : "text-white/30 hover:text-white/50"
            }`}
          >
            {active && (
              <div className="absolute top-0 left-3 right-3 h-[1.5px] bg-[#c9a24d]/80" aria-hidden />
            )}
            <Icon size={19} className={active ? "text-white/80" : "text-white/30"} />
            <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
