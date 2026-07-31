// Kynovant Design System — loading skeletons
//
// Shimmer-based placeholders (see .ds-skeleton / .ds-skeleton-dark
// in app/globals.css). Skeleton is the base block; SkeletonText,
// SkeletonAvatar, SkeletonCard, and SkeletonTableRow are common
// composites so call sites rarely need to hand-build a skeleton
// from scratch.

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type SkeletonTone = "light" | "dark";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SkeletonTone;
  /** Tailwind width class, e.g. "w-32" or "w-full". */
  width?: string;
  /** Tailwind height class, e.g. "h-4". */
  height?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export function Skeleton({
  tone = "light",
  width = "w-full",
  height = "h-4",
  rounded = "md",
  className,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cx(
        tone === "light" ? "ds-skeleton" : "ds-skeleton-dark",
        width,
        height,
        ROUNDED[rounded],
        className,
      )}
      {...props}
    />
  );
}

export interface SkeletonTextProps {
  tone?: SkeletonTone;
  lines?: number;
  className?: string;
}

export function SkeletonText({ tone = "light", lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          tone={tone}
          height="h-3.5"
          width={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ tone = "light", size = "size-10" }: { tone?: SkeletonTone; size?: string }) {
  return <Skeleton tone={tone} width={size} height={size} rounded="full" />;
}

export function SkeletonCard({ tone = "light", className }: { tone?: SkeletonTone; className?: string }) {
  const isDark = tone === "dark";
  return (
    <div
      className={cx(
        "rounded-xl p-6 border",
        isDark ? "bg-[var(--surface)] border-white/[0.07]" : "bg-white border-gray-100 shadow-card",
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3 mb-5">
        <SkeletonAvatar tone={tone} />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton tone={tone} height="h-3.5" width="w-1/3" />
          <Skeleton tone={tone} height="h-3" width="w-1/4" />
        </div>
      </div>
      <SkeletonText tone={tone} lines={3} />
    </div>
  );
}

export function SkeletonTableRow({ tone = "light", columns = 4 }: { tone?: SkeletonTone; columns?: number }) {
  return (
    <tr aria-hidden>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton tone={tone} height="h-3.5" width={i === 0 ? "w-3/4" : "w-1/2"} />
        </td>
      ))}
    </tr>
  );
}
