"use client";

// Founder/operator action trigger for the Overwatch header — deliberately
// placed in the persistent top bar (see app/overwatch/page.tsx), not
// inside the Executive Pulse KPI section, so it reads as an operator
// action rather than an analytics element. Self-contained (owns its
// own modal open state), same shape as
// components/hq/clients/AddClientButton.tsx.

import { useState } from "react";
import { UserPlus } from "lucide-react";
import InviteCoachModal from "./InviteCoachModal";

export default function InviteCoachButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Invite Coach"
        className="flex shrink-0 items-center gap-2 bg-[#C9A24D] px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-black transition-colors hover:bg-[#D4B56A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080909] sm:px-4"
      >
        <UserPlus size={14} />
        <span className="hidden sm:inline">Invite Coach</span>
      </button>
      <InviteCoachModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
