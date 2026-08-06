import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Folder,
  LayoutDashboard,
  Rocket,
  Users,
} from "lucide-react";

export interface HQNavItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  exact?: boolean;
  comingSoon?: boolean;
}

export const HQ_NAV_ITEMS: HQNavItem[] = [
  { icon: LayoutDashboard, label: "Overview", href: "/hq", exact: true },
  { icon: Rocket, label: "Get Started", href: "/hq/get-started" },
  { icon: Users, label: "Clients", href: "/hq/clients" },
  { icon: BookOpen, label: "Programs", href: "/hq/programs" },
  { icon: FileText, label: "Blueprints", href: "/hq/blueprints" },
  { icon: Dumbbell, label: "Exercise Library", href: "/hq/exercises" },
  { icon: ClipboardCheck, label: "Check-Ins", href: "/hq/check-ins" },
  { icon: Calendar, label: "Schedule", href: "/hq/schedule", comingSoon: true },
  { icon: Folder, label: "Documents", href: "/hq/documents", comingSoon: true },
];

export function visibleHQNavItems(onboardingComplete: boolean): HQNavItem[] {
  return HQ_NAV_ITEMS.filter(
    (item) => !item.comingSoon && (!onboardingComplete || item.href !== "/hq/get-started"),
  );
}

export function setupHQNavItems(onboardingComplete: boolean): HQNavItem[] {
  return onboardingComplete
    ? HQ_NAV_ITEMS.filter((item) => !item.comingSoon && item.href === "/hq/get-started")
    : [];
}

export function comingSoonHQNavItems(): HQNavItem[] {
  return HQ_NAV_ITEMS.filter((item) => item.comingSoon);
}
