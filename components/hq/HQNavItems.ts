import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Folder,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";

export interface HQNavItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  exact?: boolean;
  comingSoon?: boolean;
}

// No "Get Started" entry — that page and its onboarding-gated nav
// section were eliminated in favor of a contextual onboarding card on
// the Overview page itself (see app/hq/page.tsx) that hides once a
// coach has both a client and a program.
export const HQ_NAV_ITEMS: HQNavItem[] = [
  { icon: LayoutDashboard, label: "Overview", href: "/hq", exact: true },
  { icon: Users, label: "Clients", href: "/hq/clients" },
  { icon: BookOpen, label: "Programs", href: "/hq/programs" },
  { icon: FileText, label: "Blueprints", href: "/hq/blueprints" },
  { icon: Dumbbell, label: "Exercise Library", href: "/hq/exercises" },
  { icon: ClipboardCheck, label: "Check-Ins", href: "/hq/check-ins" },
  { icon: Calendar, label: "Schedule", href: "/hq/schedule" },
  { icon: Folder, label: "Documents", href: "/hq/documents" },
  { icon: ShieldCheck, label: "RD/RDN Verification", href: "/hq/credentials" },
];

export function visibleHQNavItems(): HQNavItem[] {
  return HQ_NAV_ITEMS.filter((item) => !item.comingSoon);
}

export function comingSoonHQNavItems(): HQNavItem[] {
  return HQ_NAV_ITEMS.filter((item) => item.comingSoon);
}
