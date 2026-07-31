"use client";

// Kynovant Design System — Tabs
//
// Underline-style tabs (Linear/Vercel convention) with roving-focus
// keyboard navigation (Left/Right/Home/End) per the ARIA APG tabs
// pattern. Compound API:
//
//   <Tabs defaultValue="training">
//     <Tabs.List aria-label="Insights dimensions">
//       <Tabs.Tab value="training">Training</Tabs.Tab>
//       <Tabs.Tab value="nutrition">Nutrition</Tabs.Tab>
//     </Tabs.List>
//     <Tabs.Panel value="training">...</Tabs.Panel>
//     <Tabs.Panel value="nutrition">...</Tabs.Panel>
//   </Tabs>

import { createContext, useContext, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type TabsTone = "light" | "dark";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  tone: TabsTone;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<Tabs.${component} /> must be used inside <Tabs>`);
  return ctx;
}

export interface TabsProps {
  children: ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  tone?: TabsTone;
  className?: string;
}

function TabsRoot({ children, defaultValue, value: controlledValue, onValueChange, tone = "light", className }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const baseId = useId();

  const value = controlledValue ?? uncontrolledValue;
  const setValue = (next: string) => {
    onValueChange?.(next);
    if (controlledValue === undefined) setUncontrolledValue(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, tone, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function TabsList({ children, className, ...props }: TabsListProps) {
  const { tone } = useTabsContext("List");
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const tabs = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])');
    if (!tabs || tabs.length === 0) return;
    const current = Array.from(tabs).indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;

    e.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cx(
        "flex items-center gap-1 border-b",
        tone === "dark" ? "border-white/[0.07]" : "border-gray-100",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function Tab({ value, className, children, ...props }: TabProps) {
  const { value: active, setValue, tone, baseId } = useTabsContext("Tab");
  const isActive = active === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setValue(value)}
      className={cx(
        "ds-focus-ring relative px-3.5 py-2.5 text-body-sm font-medium transition-colors duration-150 -mb-px border-b-2",
        isActive
          ? "border-gold " + (tone === "dark" ? "text-[#f0efeb]" : "text-gray-900")
          : cx(
              "border-transparent",
              tone === "dark" ? "text-white/45 hover:text-white/75" : "text-gray-500 hover:text-gray-800",
            ),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabPanel({ value, className, children, ...props }: TabPanelProps) {
  const { value: active, baseId } = useTabsContext("Panel");
  if (active !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cx("ds-animate-fade-in", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab,
  Panel: TabPanel,
});
