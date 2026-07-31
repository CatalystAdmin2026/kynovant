// Kynovant Design System — Badge
//
// Small labeling pill for categories, counts, and tags. For
// dimension/analysis severity use StatusChip instead — it carries
// specific meaning (ok/caution/high/critical/unknown) tied to the
// PIL color system, while Badge is general-purpose.

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type BadgeVariant = "neutral" | "gold" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-bg text-neutral border border-neutral-border",
  gold: "bg-gold/10 text-gold-hover border border-gold/25",
  success: "bg-success-bg text-success border border-success-border",
  warning: "bg-warning-bg text-warning border border-warning-border",
  danger: "bg-danger-bg text-danger border border-danger-border",
  info: "bg-info-bg text-info border border-info-border",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-caption px-2 py-0.5 gap-1.5",
};

export function Badge({ variant = "neutral", size = "md", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-medium uppercase tracking-wide whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
