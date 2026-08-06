"use client";

// HQ Top Bar — right-side chrome only.
// Left side is intentionally blank (sidebar provides primary navigation).
// Disabled controls are visibly inert until real features ship.

import { Search, Bell, MessageSquare, Settings, User } from "lucide-react";
import HQSignOutButton from "./HQSignOutButton";

export default function HQTopBar() {
  const disabledControls = [
    { Icon: Bell,          label: "Notifications" },
    { Icon: MessageSquare, label: "Messages" },
  ];

  return (
    <header className="hidden lg:flex fixed top-0 left-64 right-0 z-20 h-12 bg-[#0b0c0d]/90 backdrop-blur-sm border-b border-white/[0.05] items-center justify-end px-6 gap-1">
      <div
        role="button" aria-disabled="true"
        aria-label="Search unavailable"
        title="Search is not available yet"
        className="flex h-8 cursor-not-allowed items-center gap-2 border border-dashed border-white/[0.05] px-3 text-[10px] uppercase tracking-[0.2em] text-white/25"
      >
        <Search size={11} />
        <span>Search</span>
      </div>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      {disabledControls.map(({ Icon, label }) => (
        <div
          key={label}
          role="button" aria-disabled="true"
          aria-label={`${label} unavailable`}
          title={`${label} is not available yet`}
          className="flex h-8 w-8 cursor-not-allowed items-center justify-center text-white/25"
        >
          <Icon size={14} />
        </div>
      ))}

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      <div
        role="button" aria-disabled="true"
        aria-label="Coach profile unavailable"
        title="Coach profile is not available yet"
        className="flex h-8 cursor-not-allowed items-center gap-2 px-2.5 text-white/25"
      >
        <div className="w-5 h-5 rounded-sm bg-[#C9A24D]/10 border border-[#C9A24D]/20 flex items-center justify-center">
          <User size={10} className="text-[#C9A24D]/50" />
        </div>
      </div>

      <div
        role="button" aria-disabled="true"
        aria-label="Settings unavailable"
        title="Settings are not available yet"
        className="flex h-8 w-8 cursor-not-allowed items-center justify-center text-white/25"
      >
        <Settings size={14} />
      </div>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      <HQSignOutButton />
    </header>
  );
}
