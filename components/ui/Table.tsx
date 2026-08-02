"use client";

// Kynovant Design System — Table
//
// Composable table primitives: Table, TableHeader, TableBody,
// TableRow, TableHead, TableCell — hairline row dividers, subtle
// row hover, no zebra striping (Linear/Stripe convention).
// `tone="light"` (default) matches the existing light data-panel
// surface; `tone="dark"` matches HQ/portal chrome, following the
// same tone pattern as Card/Button/Input/Modal/Dropdown.

import { createContext, useContext } from "react";
import type { TableHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cx } from "./utils";

export type TableTone = "light" | "dark";

const TableToneContext = createContext<TableTone>("light");

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  tone?: TableTone;
}

export function Table({ tone = "light", className, children, ...props }: TableProps) {
  const isDark = tone === "dark";
  return (
    <TableToneContext.Provider value={tone}>
      <div
        className={cx(
          "w-full overflow-x-auto rounded-xl border",
          isDark ? "border-white/[0.07]" : "border-gray-100 shadow-card",
        )}
      >
        <table className={cx("w-full border-collapse text-body-sm", className)} {...props}>
          {children}
        </table>
      </div>
    </TableToneContext.Provider>
  );
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  const isDark = useContext(TableToneContext) === "dark";
  return (
    <thead
      className={cx(isDark ? "bg-white/[0.02] border-b border-white/[0.07]" : "bg-gray-50/80 border-b border-gray-100", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  const isDark = useContext(TableToneContext) === "dark";
  return (
    <tbody className={cx(isDark ? "divide-y divide-white/[0.05]" : "divide-y divide-gray-100", className)} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
}

export function TableRow({ interactive = false, className, children, ...props }: TableRowProps) {
  const isDark = useContext(TableToneContext) === "dark";
  return (
    <tr
      className={cx(
        interactive && (isDark
          ? "transition-colors duration-150 ease-out hover:bg-white/[0.02] cursor-pointer"
          : "transition-colors duration-150 ease-out hover:bg-gray-50 cursor-pointer"),
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  const isDark = useContext(TableToneContext) === "dark";
  return (
    <th
      className={cx(
        "text-left text-label font-semibold uppercase tracking-widest px-4 py-3 whitespace-nowrap",
        isDark ? "text-white/30" : "text-gray-400",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  const isDark = useContext(TableToneContext) === "dark";
  return (
    <td className={cx("px-4 py-3.5 align-middle", isDark ? "text-white/70" : "text-gray-700", className)} {...props}>
      {children}
    </td>
  );
}
