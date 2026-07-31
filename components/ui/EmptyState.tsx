// Kynovant Design System — EmptyState
//
// Consistent, non-alarming empty/zero-data state: icon, title,
// one-line description, optional action. Matches the existing
// product philosophy of graceful, non-shaming empty states (locked
// achievements, "no program yet") rather than error-styled voids.

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cx } from "./utils";

export type EmptyStateTone = "light" | "dark";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}

export function EmptyState({ icon, title, description, action, tone = "light", className }: EmptyStateProps) {
  const isDark = tone === "dark";

  return (
    <div className={cx("flex flex-col items-center justify-center text-center px-6 py-14", className)}>
      <div
        className={cx(
          "mb-4 flex size-12 items-center justify-center rounded-full",
          isDark ? "bg-white/[0.04] text-white/30" : "bg-gray-50 text-gray-300",
        )}
        aria-hidden
      >
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className={cx("text-body font-semibold", isDark ? "text-white/80" : "text-gray-800")}>{title}</p>
      {description && (
        <p className={cx("mt-1.5 max-w-sm text-body-sm", isDark ? "text-white/40" : "text-gray-500")}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
