"use client";

// Kynovant Design System — Modal
//
// Generalizes the dialog pattern already established in
// components/hq/workspace/AssignProgramModal.tsx (backdrop blur,
// focus trap, ESC-to-close, gold-tinted elevated shadow) into a
// reusable primitive. `tone="dark"` (default) matches that existing
// pattern; `tone="light"` renders a white panel for light-surface
// contexts.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./utils";

export type ModalTone = "light" | "dark";
export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: ModalTone;
  size?: ModalSize;
  ariaLabel?: string;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = "dark",
  size = "md",
  ariaLabel,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.querySelectorAll<HTMLElement>(FOCUSABLE)[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const els = panel!.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDark = tone === "dark";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : "Dialog")}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm ds-animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        className={cx(
          "relative w-full flex flex-col max-h-[90vh] rounded-xl overflow-hidden ds-animate-scale-in",
          SIZES[size],
          isDark
            ? "bg-[#0f1011] border border-white/[0.08] text-[#f0efeb] shadow-modal"
            : "bg-white border border-gray-100 text-gray-900 shadow-elevated",
        )}
      >
        {(title || description) && (
          <div
            className={cx(
              "flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b shrink-0",
              isDark ? "border-white/[0.06]" : "border-gray-100",
            )}
          >
            <div className="min-w-0">
              {title && (
                <h2
                  className={cx(
                    "text-h4 font-semibold",
                    isDark ? "text-[#f0efeb]" : "text-gray-900",
                  )}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className={cx("text-body-sm mt-1", isDark ? "text-white/50" : "text-gray-500")}>
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className={cx(
                "ds-focus-ring shrink-0 rounded-md p-1 transition-colors duration-150",
                isDark ? "text-white/40 hover:text-white hover:bg-white/5" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
              )}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div
            className={cx(
              "flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0",
              isDark ? "border-white/[0.06]" : "border-gray-100",
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
