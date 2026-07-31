"use client";

// Kynovant Design System — Button
//
// A single primitive covering both surface contexts already in use
// across the app: light data panels (HQ/admin cards, white bg) and
// dark chrome (portal/HQ shell, marketing). Pass `tone="dark"` when
// rendering on a dark background.

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonTone = "light" | "dark";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const BASE =
  "ds-focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-all duration-150 ease-out whitespace-nowrap select-none " +
  "disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

const VARIANTS: Record<ButtonTone, Record<ButtonVariant, string>> = {
  light: {
    primary: "bg-gold text-black hover:bg-gold-hover shadow-sm hover:shadow-card-hover",
    secondary: "bg-gray-900 text-white hover:bg-gray-800",
    outline: "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    destructive: "bg-danger text-white hover:bg-red-800",
    link: "text-gold hover:text-gold-hover underline-offset-4 hover:underline h-auto px-0",
  },
  dark: {
    primary: "bg-gold text-black hover:bg-gold-hover shadow-sm",
    secondary: "bg-white/[0.06] text-[#f0efeb] border border-white/[0.08] hover:bg-white/[0.1]",
    outline: "border border-white/15 text-[#f0efeb] hover:bg-white/5 hover:border-white/25",
    ghost: "text-white/70 hover:bg-white/5 hover:text-white",
    destructive: "bg-red-500/90 text-white hover:bg-red-500",
    link: "text-gold hover:text-gold-hover underline-offset-4 hover:underline h-auto px-0",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    tone = "light",
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(BASE, variant !== "link" && SIZES[size], VARIANTS[tone][variant], className)}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        leftIcon && <span className="inline-flex shrink-0 [&_svg]:size-3.5">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && (
        <span className="inline-flex shrink-0 [&_svg]:size-3.5">{rightIcon}</span>
      )}
    </button>
  );
});
