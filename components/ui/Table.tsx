// Kynovant Design System — Table
//
// Composable table primitives: Table, TableHeader, TableBody,
// TableRow, TableHead, TableCell. Light-surface only (data tables
// live in HQ/admin panels today) — hairline row dividers, subtle
// row hover, no zebra striping (Linear/Stripe convention).

import type { TableHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cx } from "./utils";

export function Table({ className, children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-card">
      <table className={cx("w-full border-collapse text-body-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cx("bg-gray-50/80 border-b border-gray-100", className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cx("divide-y divide-gray-100", className)} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
}

export function TableRow({ interactive = false, className, children, ...props }: TableRowProps) {
  return (
    <tr
      className={cx(
        interactive && "transition-colors duration-150 ease-out hover:bg-gray-50 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "text-left text-label font-semibold uppercase tracking-widest text-gray-400 px-4 py-3 whitespace-nowrap",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("px-4 py-3.5 text-gray-700 align-middle", className)} {...props}>
      {children}
    </td>
  );
}
