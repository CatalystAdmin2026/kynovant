// Kynovant Design System — Card
//
// Composable card primitive: Card, CardHeader, CardTitle,
// CardDescription, CardContent, CardFooter. `tone` selects the
// light data-panel surface (default — matches existing HQ/PIL
// panels) or the dark chrome surface (matches portal/HQ shell).

import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export type CardTone = "light" | "dark";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Adds a hover elevation + border transition for clickable cards. */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const TONE_CLASSES: Record<CardTone, string> = {
  light: "bg-white border border-gray-100 shadow-card",
  dark: "bg-[var(--surface)] border border-white/[0.07] shadow-card",
};

const INTERACTIVE_CLASSES: Record<CardTone, string> = {
  light: "hover:shadow-card-hover hover:border-gray-200 transition-all duration-200 ease-out cursor-pointer",
  dark: "hover:border-white/[0.14] hover:bg-[var(--surface-raised)] transition-all duration-200 ease-out cursor-pointer",
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  tone = "light",
  interactive = false,
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cx(
        "rounded-xl overflow-hidden",
        TONE_CLASSES[tone],
        interactive && INTERACTIVE_CLASSES[tone],
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("flex items-start justify-between gap-3 mb-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  tone = "light",
  className,
  children,
  ...props
}: CardSectionProps) {
  return (
    <h3
      className={cx(
        "text-h4 font-semibold",
        tone === "light" ? "text-gray-900" : "text-[#f0efeb]",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  tone = "light",
  className,
  children,
  ...props
}: CardSectionProps) {
  return (
    <p
      className={cx(
        "text-body-sm mt-1",
        tone === "light" ? "text-gray-500" : "text-white/50",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  tone = "light",
  className,
  children,
  ...props
}: CardSectionProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 mt-6 pt-4 border-t",
        tone === "light" ? "border-gray-100" : "border-white/[0.07]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
