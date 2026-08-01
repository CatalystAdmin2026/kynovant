// Kynovant Design System — StatusChip
//
// Dimension/analysis severity indicator. Implements the color
// system documented in docs/kynovant-insights-ui-principles.md
// Principle 4 exactly (OK/Caution/High/Critical/Unknown), so any
// PIL surface (Training, Nutrition, Recovery, Check-In) reads the
// same status language. For general-purpose tags, use Badge.
//
// `tone="light"` (default) matches the light data-panel mapping
// from the principles doc. `tone="dark"` swaps to translucent
// tinted backgrounds for HQ/portal dark chrome, preserving the same
// ok/caution/high/critical/unknown semantics and relative severity.

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type StatusChipStatus = "ok" | "caution" | "high" | "critical" | "unknown";
export type StatusChipTone = "light" | "dark";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusChipStatus;
  /** Defaults to the canonical label for the status if omitted. */
  label?: string;
  size?: "sm" | "md";
  tone?: StatusChipTone;
}

const DEFAULT_LABEL: Record<StatusChipStatus, string> = {
  ok: "OK",
  caution: "Caution",
  high: "High",
  critical: "Critical",
  unknown: "Unknown",
};

// Exact mapping from the UI principles doc's color table.
const STATUS_CLASSES: Record<StatusChipTone, Record<StatusChipStatus, string>> = {
  light: {
    ok: "bg-gray-100 text-gray-600",
    caution: "bg-amber-50 text-amber-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
    unknown: "bg-gray-50 text-gray-400",
  },
  dark: {
    ok: "bg-white/[0.06] text-white/45",
    caution: "bg-amber-500/10 text-amber-400",
    high: "bg-orange-500/10 text-orange-400",
    critical: "bg-red-500/10 text-red-400",
    unknown: "bg-white/[0.03] text-white/25",
  },
};

const SIZES: Record<NonNullable<StatusChipProps["size"]>, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-caption px-2.5 py-1",
};

export function StatusChip({ status, label, size = "md", tone = "light", className, ...props }: StatusChipProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md font-semibold uppercase tracking-wide whitespace-nowrap",
        STATUS_CLASSES[tone][status],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {label ?? DEFAULT_LABEL[status]}
    </span>
  );
}
