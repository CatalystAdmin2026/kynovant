// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Program Timeline (Sprint 6.3A)
//
// Server component. Replaces the static CurrentProgramPanel.
// Shows:
//   - Week-by-week timeline (completed / current / upcoming)
//   - Overall progress bar
//   - Projected completion date
//   - Program assignment history below
//
// Empty state: EmptyState primitive + gold CTA (injected via prop)
// ─────────────────────────────────────────────────────────────

import { ClipboardList, Check } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import type { ActiveProgramInfo } from "@/lib/db/coach-client-workspace-service";
import type { ProgramHistoryItem } from "@/lib/db/coach-program-assignment-service";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  completed: "Completed",
  cancelled: "Archived",
};

// "completed" reads as a finished/successful program run — same
// emerald "success" language the timeline already uses for completed
// weeks — not an "info" (sky) state, which would introduce a 3rd hue
// into a list that's otherwise just emerald/neutral.
const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "neutral",
  completed: "success",
  cancelled: "neutral",
};

// ─────────────────────────────────────────────────────────────
// SECTION HEADER (local — matches page.tsx convention)
// ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40">
        {title}
      </h2>
      <div className="h-px flex-1 bg-white/[0.04]" />
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEEK ROW
// ─────────────────────────────────────────────────────────────

function WeekRow({
  weekNumber,
  status,
  totalWeeks,
}: {
  weekNumber: number;
  status: "completed" | "current" | "upcoming";
  totalWeeks: number;
}) {
  const isLast = weekNumber === totalWeeks;

  return (
    <div className="group flex items-center gap-3">
      {/* Timeline spine */}
      <div className="flex shrink-0 flex-col items-center">
        <div
          className={`h-3 w-3 rounded-full border-2 transition-colors duration-150 ${
            status === "completed"
              ? "border-emerald-500/40 bg-emerald-500/15"
              : status === "current"
              ? "border-[#C9A24D] bg-[#C9A24D]"
              : "border-white/[0.10] bg-transparent"
          }`}
          aria-hidden
        />
        {!isLast && (
          <div
            className={`mt-0.5 w-px ${
              status === "completed" ? "bg-emerald-500/20" : "bg-white/[0.04]"
            }`}
            style={{ height: "20px" }}
          />
        )}
      </div>

      {/* Row content */}
      <div
        className={`flex flex-1 items-center justify-between rounded-md px-3 py-1.5 transition-colors duration-150 ${
          status === "current"
            ? "border border-[#C9A24D]/20 bg-[#C9A24D]/[0.05]"
            : "border border-transparent"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-semibold ${
              status === "current"
                ? "text-[#C9A24D]"
                : status === "completed"
                ? "text-white/50"
                : "text-white/25"
            }`}
          >
            Week {weekNumber}
          </span>
          {status === "current" && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#C9A24D]/70">
              Current
            </span>
          )}
        </div>

        {status === "completed" && (
          <Check size={12} strokeWidth={3} className="text-emerald-400" />
        )}
        {status === "upcoming" && (
          <span className="text-[9px] uppercase tracking-[0.25em] text-white/25">Upcoming</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ACTIVE PROGRAM TIMELINE
// ─────────────────────────────────────────────────────────────

function ActiveTimeline({
  program,
  replaceAction,
}: {
  program: ActiveProgramInfo;
  replaceAction: React.ReactNode;
}) {
  const totalWeeks = program.totalWeeks ?? 0;
  const currentWeek = Math.min(program.currentWeek, totalWeeks > 0 ? totalWeeks : program.currentWeek);
  const completedWeeks = Math.max(0, currentWeek - 1);
  const upcomingWeeks = totalWeeks > 0 ? Math.max(0, totalWeeks - currentWeek) : 0;
  const completionEndDate = program.endDate ?? program.derivedEndDate;

  return (
    <section>
      <SectionHeader
        title="Active Program"
        action={replaceAction}
      />

      {/* Program header */}
      <Card tone="dark" className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-white">{program.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {program.startDate && (
                <span className="text-[10px] text-white/40">
                  Started {fmtDate(program.startDate)}
                </span>
              )}
              {completionEndDate && (
                <span className="text-[10px] text-white/40">
                  Ends {fmtDate(completionEndDate)}
                </span>
              )}
              {program.daysRemaining !== null && (
                <span
                  className={`text-[10px] font-semibold ${
                    program.daysRemaining <= 7 ? "text-amber-400" : "text-white/40"
                  }`}
                >
                  {program.daysRemaining}d remaining
                </span>
              )}
            </div>
          </div>
          {totalWeeks > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold leading-none text-[#C9A24D]">{currentWeek}</p>
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/30">
                / {totalWeeks} wks
              </p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {program.programCompletionPct !== null && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Progress</p>
              <p className="text-[10px] font-bold text-[#C9A24D]">
                {program.programCompletionPct}%
              </p>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#C9A24D]/70 transition-all duration-500"
                style={{ width: `${Math.min(100, program.programCompletionPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats row */}
        {totalWeeks > 0 && (
          <div className="mt-3 flex items-center gap-4 border-t border-white/[0.04] pt-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Completed</p>
              <p className="text-sm font-bold text-emerald-400">{completedWeeks}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Remaining</p>
              <p className="text-sm font-bold text-white/70">{upcomingWeeks}</p>
            </div>
            {program.recommendedDaysPerWeek && (
              <div>
                <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Days/Wk</p>
                <p className="text-sm font-bold text-white/70">{program.recommendedDaysPerWeek}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Week-by-week timeline */}
      {totalWeeks > 0 && (
        <Card tone="dark">
          <p className="mb-4 text-[9px] uppercase tracking-[0.3em] text-white/30">
            Program Timeline
          </p>
          <div className="space-y-0">
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((wk) => {
              const status =
                wk < currentWeek
                  ? ("completed" as const)
                  : wk === currentWeek
                  ? ("current" as const)
                  : ("upcoming" as const);
              return (
                <WeekRow
                  key={wk}
                  weekNumber={wk}
                  status={status}
                  totalWeeks={totalWeeks}
                />
              );
            })}
          </div>

          {completionEndDate && (
            <p className="mt-4 border-t border-white/[0.04] pt-3 text-[9px] text-white/25">
              Projected completion:{" "}
              <span className="text-white/50">{fmtDate(completionEndDate)}</span>
            </p>
          )}
        </Card>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PROGRAM HISTORY
// ─────────────────────────────────────────────────────────────

function ProgramHistory({ items }: { items: ProgramHistoryItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <SectionHeader title="Program History" />
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-white/[0.05] bg-[#0a0b0c] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-white">{item.programName}</p>
                  <Badge tone="dark" variant={STATUS_BADGE_VARIANT[item.status] ?? "neutral"} size="sm">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-white/40">
                    {fmtDateShort(item.startDate)}
                    {item.endDate ? ` → ${fmtDateShort(item.endDate)}` : " → present"}
                  </span>
                  {item.totalWeeks && (
                    <>
                      <span className="text-white/15">·</span>
                      <span className="text-[10px] text-white/30">{item.totalWeeks}w</span>
                    </>
                  )}
                </div>
                {item.coachNotes && (
                  <p className="mt-1 line-clamp-1 text-[10px] italic text-white/30">
                    {item.coachNotes}
                  </p>
                )}
              </div>
              <p className="shrink-0 text-[9px] text-white/25">
                Assigned {fmtDateShort(item.assignedAt.slice(0, 10))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

interface Props {
  activeProgram: ActiveProgramInfo | null;
  programHistory: ProgramHistoryItem[];
  emptyStateAction: React.ReactNode;
  replaceAction: React.ReactNode;
}

export default function ProgramTimeline({
  activeProgram,
  programHistory,
  emptyStateAction,
  replaceAction,
}: Props) {
  // Non-active programs for the history section
  const historyItems = programHistory.filter((p) => p.status !== "active");

  if (!activeProgram) {
    return (
      <section>
        <SectionHeader title="Active Program" action={null} />
        <div className="rounded-xl border border-dashed border-white/[0.08]">
          <EmptyState
            tone="dark"
            icon={<ClipboardList className="size-5" />}
            title="No Program Assigned"
            description="Assign a blueprint to begin this client's coaching journey. The program will appear here with full week-by-week tracking."
            action={emptyStateAction}
          />
        </div>
        <ProgramHistory items={historyItems} />
      </section>
    );
  }

  return (
    <div>
      <ActiveTimeline program={activeProgram} replaceAction={replaceAction} />
      <ProgramHistory items={historyItems} />
    </div>
  );
}
