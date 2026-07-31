// Kynovant Design System — form primitives
//
// Input, Textarea, Select, Label, and HelperText/FieldError. Builds
// on the visual language already established in dark-surface forms
// (app/login, onboarding — subtle bg fill, gold focus border) and
// extends it with a light-surface variant, consistent error states,
// and a refined radius (rounded-lg vs. the ad-hoc rounded-sm used
// today) for a crisper, more premium feel.

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, LabelHTMLAttributes, HTMLAttributes } from "react";
import { cx } from "./utils";

export type FieldTone = "light" | "dark";

const FIELD_BASE =
  "ds-focus-ring w-full rounded-lg px-3.5 py-2.5 text-body transition-colors duration-150 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const FIELD_TONE: Record<FieldTone, string> = {
  light:
    "bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 " +
    "hover:border-gray-300 focus:border-gold focus:ring-2 focus:ring-gold/15",
  dark:
    "bg-white/[0.04] border border-white/10 text-white/90 placeholder:text-white/25 " +
    "hover:border-white/20 focus:border-gold/50 focus:bg-white/[0.06]",
};

const FIELD_ERROR: Record<FieldTone, string> = {
  light: "border-danger focus:border-danger focus:ring-danger/15",
  dark: "border-red-400/50 focus:border-red-400/60",
};

interface FieldStateProps {
  tone?: FieldTone;
  error?: boolean;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldStateProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { tone = "light", error = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(FIELD_BASE, FIELD_TONE[tone], error && FIELD_ERROR[tone], className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldStateProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { tone = "light", error = false, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cx(FIELD_BASE, FIELD_TONE[tone], error && FIELD_ERROR[tone], "min-h-24 resize-y", className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldStateProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { tone = "light", error = false, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(FIELD_BASE, FIELD_TONE[tone], error && FIELD_ERROR[tone], "pr-9", className)}
      aria-invalid={error || undefined}
      {...props}
    >
      {children}
    </select>
  );
});

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  tone?: FieldTone;
  required?: boolean;
}

export function Label({ tone = "light", required = false, className, children, ...props }: LabelProps) {
  return (
    <label
      className={cx(
        "mb-1.5 inline-block text-caption font-semibold uppercase tracking-wider",
        tone === "light" ? "text-gray-500" : "text-white/40",
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
  );
}

export function HelperText({ tone = "light", className, children, ...props }: HTMLAttributes<HTMLParagraphElement> & { tone?: FieldTone }) {
  return (
    <p className={cx("mt-1.5 text-caption", tone === "light" ? "text-gray-500" : "text-white/40", className)} {...props}>
      {children}
    </p>
  );
}

export function FieldError({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null;
  return (
    <p className={cx("mt-1.5 text-caption text-danger", className)} role="alert" {...props}>
      {children}
    </p>
  );
}
