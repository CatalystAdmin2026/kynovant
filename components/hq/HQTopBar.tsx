"use client";

// HQ Top Bar — right-side chrome only.
// Left side is intentionally blank (sidebar provides primary navigation).
// Functionality placeholders: search, notifications, messages, profile, settings.
// Wire up actual features as they ship.

import { Search, Bell, MessageSquare, Settings, User } from "lucide-react";

export default function HQTopBar() {
  return (
    <header className="hidden lg:flex fixed top-0 left-64 right-0 z-20 h-12 bg-[#0b0c0d]/90 backdrop-blur-sm border-b border-white/[0.05] items-center justify-end px-6 gap-1">
      {/* Search placeholder */}
      <button
        disabled
        aria-label="Search (coming soon)"
        title="Search — coming soon"
        className="flex items-center gap-2 h-8 px-3 text-white/20 hover:text-white/35 border border-white/[0.05] text-[10px] uppercase tracking-[0.2em] cursor-default transition-colors"
      >
        <Search size={11} />
        <span>Search</span>
      </button>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      {/* Action icons */}
      {[
        { Icon: Bell,          label: "Notifications" },
        { Icon: MessageSquare, label: "Messages" },
      ].map(({ Icon, label }) => (
        <button
          key={label}
          disabled
          aria-label={`${label} (coming soon)`}
          title={`${label} — coming soon`}
          className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-white/35 cursor-default transition-colors"
        >
          <Icon size={14} />
        </button>
      ))}

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      {/* Coach profile placeholder */}
      <button
        disabled
        aria-label="Coach profile (coming soon)"
        title="Coach profile — coming soon"
        className="flex items-center gap-2 h-8 px-2.5 text-white/20 hover:text-white/35 cursor-default transition-colors"
      >
        <div className="w-5 h-5 rounded-sm bg-[#C9A24D]/10 border border-[#C9A24D]/20 flex items-center justify-center">
          <User size={10} className="text-[#C9A24D]/50" />
        </div>
      </button>

      <button
        disabled
        aria-label="Settings (coming soon)"
        title="Settings — coming soon"
        className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-white/35 cursor-default transition-colors"
      >
        <Settings size={14} />
      </button>
    </header>
  );
}
