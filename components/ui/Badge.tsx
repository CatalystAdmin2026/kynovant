// Kynovant Design System — Badge
//
// Small labeling pill for categories, counts, and tags. For
// dimension/analysis severity use StatusChip instead — it carries
// specific meaning (ok/caution/high/critical/unknown) tied to the
// PIL color system, while Badge is general-purpose.
//
// `tone="light"` (default) uses the opaque pastel backgrounds meant
// for white data panels. `tone="dark"` uses translucent tinted
// backgrounds (bg-X-500/10, text-X-400) for HQ/portal dark chrome —
// the same idiom already hand-rolled as statusCls()/statusBadge()
// across the Programs and Program Builder screens.

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type BadgeVariant = "neutral" | "gold" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md";
export type BadgeTone = "light" | "dark";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  tone?: BadgeTone;
}

const VARIANTS: Record<BadgeTone, Record<BadgeVariant, string>> = {
  light: {
    neutral: "bg-neutral-bg text-neutral border border-neutral-border",
    gold: "bg-gold/10 text-gold-hover border border-gold/25",
    success: "bg-success-bg text-success border border-success-border",
    warning: "bg-warning-bg text-warning border border-warning-border",
    danger: "bg-danger-bg text-danger border border-danger-border",
    info: "bg-info-bg text-info border border-info-border",
  },
  dark: {
    neutral: "bg-white/[0.06] text-white/50 border border-white/[0.1]",
    gold: "bg-gold/10 text-gold-hover border border-gold/25",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20",
    info: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  },
};

const SIZES: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-caption px-2 py-0.5 gap-1.5",
};

export function Badge({ variant = "neutral", size = "md", tone = "light", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-medium uppercase tracking-wide whitespace-nowrap",
        VARIANTS[tone][variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
