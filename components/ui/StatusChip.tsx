// Kynovant Design System — StatusChip
//
// Dimension/analysis severity indicator. Implements the color
// system documented in docs/kynovant-insights-ui-principles.md
// Principle 4 exactly (OK/Caution/High/Critical/Unknown), so any
// PIL surface (Training, Nutrition, Recovery, Check-In) reads the
// same status language. For general-purpose tags, use Badge.

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type StatusChipStatus = "ok" | "caution" | "high" | "critical" | "unknown";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusChipStatus;
  /** Defaults to the canonical label for the status if omitted. */
  label?: string;
  size?: "sm" | "md";
}

const DEFAULT_LABEL: Record<StatusChipStatus, string> = {
  ok: "OK",
  caution: "Caution",
  high: "High",
  critical: "Critical",
  unknown: "Unknown",
};

// Exact mapping from the UI principles doc's color table.
const STATUS_CLASSES: Record<StatusChipStatus, string> = {
  ok: "bg-gray-100 text-gray-600",
  caution: "bg-amber-50 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
  unknown: "bg-gray-50 text-gray-400",
};

const SIZES: Record<NonNullable<StatusChipProps["size"]>, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-caption px-2.5 py-1",
};

export function StatusChip({ status, label, size = "md", className, ...props }: StatusChipProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md font-semibold uppercase tracking-wide whitespace-nowrap",
        STATUS_CLASSES[status],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {label ?? DEFAULT_LABEL[status]}
    </span>
  );
}
