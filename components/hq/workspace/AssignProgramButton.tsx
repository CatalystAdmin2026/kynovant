"use client";

// Dispatches a custom event that AssignProgramModal listens for.
// Keeps the trigger decoupled from the modal so either can live
// anywhere in the component tree.

import { Button } from "@/components/ui";

const OPEN_EVENT = "hq:assign-program:open";

interface Props {
  hasActiveProgram: boolean;
  variant?: "header" | "primary" | "section";
}

// Gold pill/outline treatments aren't covered by the Button primitive's
// variant set, so these two smaller affordances are hand-rolled — but
// share Button's own interaction tokens (focus ring, radius, easing)
// so they still read as part of the same system.
const GOLD_INTERACTIVE =
  "ds-focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold " +
  "transition-all duration-150 ease-out whitespace-nowrap select-none active:scale-[0.98]";

export default function AssignProgramButton({
  hasActiveProgram,
  variant = "primary",
}: Props) {
  function open() {
    document.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }

  if (variant === "header") {
    return (
      <button
        onClick={open}
        className={`${GOLD_INTERACTIVE} h-9 border border-[#C9A24D]/40 px-4 text-xs text-[#C9A24D] hover:border-[#C9A24D]/60 hover:text-[#C9A24D]/80`}
      >
        {hasActiveProgram ? "Replace Program" : "Assign Program"}
      </button>
    );
  }

  if (variant === "section") {
    return (
      <button
        onClick={open}
        className={`${GOLD_INTERACTIVE} h-7 border border-[#C9A24D]/20 px-2.5 text-[11px] text-[#C9A24D]/70 hover:border-[#C9A24D]/40 hover:text-[#C9A24D]`}
      >
        {hasActiveProgram ? "Replace →" : "Assign →"}
      </button>
    );
  }

  // Primary — used in empty state
  return (
    <Button onClick={open} variant="primary" tone="dark" size="lg">
      Assign Program
    </Button>
  );
}
