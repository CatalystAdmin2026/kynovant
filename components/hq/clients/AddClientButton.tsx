"use client";

// Prominent "+ Add Client" trigger for the Clients page header.
// Owns its own modal open state — self-contained, drop in anywhere.

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddClientModal from "./AddClientModal";

export default function AddClientButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.2em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080909]"
      >
        + Add Client
      </button>
      <AddClientModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
