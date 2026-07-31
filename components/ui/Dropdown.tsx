"use client";

// Kynovant Design System — Dropdown
//
// Lightweight menu primitive: trigger + positioned panel, closes on
// click-outside or ESC. Compound API:
//
//   <Dropdown>
//     <Dropdown.Trigger>Actions</Dropdown.Trigger>
//     <Dropdown.Content>
//       <Dropdown.Item onSelect={...}>Edit</Dropdown.Item>
//       <Dropdown.Separator />
//       <Dropdown.Item destructive onSelect={...}>Delete</Dropdown.Item>
//     </Dropdown.Content>
//   </Dropdown>

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type DropdownTone = "light" | "dark";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  tone: DropdownTone;
  menuId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext(component: string): DropdownContextValue {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error(`<Dropdown.${component} /> must be used inside <Dropdown>`);
  return ctx;
}

export interface DropdownProps {
  children: ReactNode;
  tone?: DropdownTone;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function DropdownRoot({ children, tone = "light", open: controlledOpen, onOpenChange }: DropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, tone, menuId }}>
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

function DropdownTrigger({ children, className, ...props }: DropdownTriggerProps) {
  const { open, setOpen, menuId } = useDropdownContext("Trigger");
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen(!open)}
      className={cx("ds-focus-ring", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export interface DropdownContentProps {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

function DropdownContent({ children, align = "left", className }: DropdownContentProps) {
  const { open, tone, menuId } = useDropdownContext("Content");
  if (!open) return null;

  const isDark = tone === "dark";

  return (
    <div
      id={menuId}
      role="menu"
      className={cx(
        "absolute z-40 mt-1.5 min-w-[12rem] rounded-lg py-1.5 shadow-dropdown ds-animate-slide-down",
        align === "right" ? "right-0" : "left-0",
        isDark
          ? "bg-[#16181a] border border-white/[0.08]"
          : "bg-white border border-gray-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface DropdownItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
  onSelect?: () => void;
}

function DropdownItem({ destructive = false, onSelect, onClick, className, children, ...props }: DropdownItemProps) {
  const { setOpen, tone } = useDropdownContext("Item");
  const isDark = tone === "dark";

  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e);
        onSelect?.();
        setOpen(false);
      }}
      className={cx(
        "ds-focus-ring flex w-full items-center gap-2 px-3.5 py-2 text-left text-body-sm transition-colors duration-100",
        destructive
          ? "text-danger hover:bg-danger-bg"
          : isDark
            ? "text-white/80 hover:bg-white/[0.06] hover:text-white"
            : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownSeparator() {
  const { tone } = useDropdownContext("Separator");
  return <div className={cx("my-1.5 h-px", tone === "dark" ? "bg-white/[0.07]" : "bg-gray-100")} role="separator" />;
}

export const Dropdown = Object.assign(DropdownRoot, {
  Trigger: DropdownTrigger,
  Content: DropdownContent,
  Item: DropdownItem,
  Separator: DropdownSeparator,
});
