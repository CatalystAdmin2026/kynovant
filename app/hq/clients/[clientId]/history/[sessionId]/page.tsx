// Catalyst HQ — Coach Session Review (read-only)
// Server component. Auth via layout.tsx (coach or admin only).
// Non-disclosing 404: returns notFound() if session doesn't belong to clientId.

import { notFound } from "next/navigation";
import { requireCoachOrAdminPage, resolveTenantScope } from "@/lib/auth/guards";
import {
  getCoachClientSessionDetail,
  type HistoricalSetLog,
} from "@/lib/db/coach-dashboard-service";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { Card, EmptyState, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// SNAPSHOT TYPES (mirrors portal history page)
// ─────────────────────────────────────────────────────────────

interface SnapshotExercise {
  id: string;
  exerciseName: string;
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null;
  targetRir: string | null;
  coachNotes: string | null;
}

interface SnapshotSection {
  id: string;
  name: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  exercises: SnapshotExercise[];
}

interface ParsedSnapshot {
  templateName: string;
  estimatedDurationMinutes: number | null;
  sections: SnapshotSection[];
  unsectioned: SnapshotExercise[];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function parseSnapshot(raw: Record<string, unknown> | null): ParsedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.sections)) return null;
  return raw as unknown as ParsedSnapshot;
}

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d instanceof Date ? d : d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function repRange(ex: SnapshotExercise): string {
  if (ex.durationSeconds) return `${ex.durationSeconds}s`;
  if (ex.repsMin && ex.repsMax && ex.repsMin !== ex.repsMax) return `${ex.repsMin}–${ex.repsMax}`;
  if (ex.repsMin) return `${ex.repsMin}`;
  if (ex.repsMax) return `${ex.repsMax}`;
  return "—";
}

const STATUS_PILL: Record<string, string> = {
  completed: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400",
  skipped: "border-white/10 bg-white/[0.04] text-gray-400",
};

function statusBadge(status: string) {
  const cls = STATUS_PILL[status] ?? "border-amber-500/25 bg-amber-500/[0.06] text-amber-400";
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em]",
        cls,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// EXERCISE BLOCK
// ─────────────────────────────────────────────────────────────

function ExerciseBlock({
  exercise,
  logs,
}: {
  exercise: SnapshotExercise;
  logs: HistoricalSetLog[];
}) {
  const totalSets = exercise.sets ?? 1;

  return (
    <Card tone="dark" padding="none" className="mb-2">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{exercise.exerciseName}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {exercise.tempo && (
                <span className="text-gray-400 text-[10px] font-mono">{exercise.tempo}</span>
              )}
              {exercise.restSeconds && (
                <span className="text-gray-400 text-[10px]">{exercise.restSeconds}s rest</span>
              )}
              {exercise.targetRpe && (
                <span className="text-gray-400 text-[10px]">Target RPE {exercise.targetRpe}</span>
              )}
              {exercise.targetRir && (
                <span className="text-gray-400 text-[10px]">{exercise.targetRir} RIR</span>
              )}
            </div>
            {exercise.coachNotes && (
              <p className="text-gray-400 text-[11px] italic mt-1.5 leading-relaxed">
                {exercise.coachNotes}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[#C9A24D] font-bold text-base leading-tight">
              {totalSets}×{repRange(exercise)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        {Array.from({ length: totalSets }, (_, i) => i + 1).map((setNum) => {
          const log = logs.find((l) => l.setNumber === setNum) ?? null;
          return (
            <SetRow
              key={setNum}
              setNum={setNum}
              log={log}
              isTimeBased={!!exercise.durationSeconds}
            />
          );
        })}
      </div>
    </Card>
  );
}

function SetRow({
  setNum,
  log,
  isTimeBased,
}: {
  setNum: number;
  log: HistoricalSetLog | null;
  isTimeBased: boolean;
}) {
  if (!log) {
    return (
      <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.03] last:border-b-0">
        <span className="text-[10px] text-gray-500 w-12 shrink-0 font-mono">Set {setNum}</span>
        <span className="text-gray-600 text-[10px] italic">not logged</span>
      </div>
    );
  }

  const parts: string[] = [];
  if (!isTimeBased && log.actualWeightLbs !== null) parts.push(`${log.actualWeightLbs} lb`);
  if (!isTimeBased && log.actualReps !== null) parts.push(`${log.actualReps} reps`);
  if (isTimeBased && log.actualDurationSeconds !== null) parts.push(`${log.actualDurationSeconds}s`);
  if (log.actualRpe !== null) parts.push(`RPE ${log.actualRpe}`);

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.03] last:border-b-0">
      <span className="text-[10px] text-gray-500 w-12 shrink-0 font-mono">Set {setNum}</span>
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
      {parts.length > 0 ? (
        <span className="text-white text-[11px] font-medium">{parts.join(" · ")}</span>
      ) : (
        <span className="text-emerald-400 text-[10px] font-semibold uppercase tracking-[0.25em]">
          Done
        </span>
      )}
      {log.notes && (
        <span className="text-gray-400 text-[10px] italic ml-auto truncate max-w-[200px]">
          {log.notes}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default async function CoachSessionReviewPage({
  params,
}: {
  params: Promise<{ clientId: string; sessionId: string }>;
}) {
  const { clientId, sessionId } = await params;
  const { dbUser } = await requireCoachOrAdminPage();
  const { coachId } = resolveTenantScope(dbUser);

  const detail = await getCoachClientSessionDetail(clientId, sessionId, coachId);
  if (!detail) notFound();

  const snapshot = parseSnapshot(detail.snapshot);

  const logsByExercise = new Map<string, HistoricalSetLog[]>();
  for (const log of detail.setLogs) {
    const list = logsByExercise.get(log.workoutTemplateExerciseId) ?? [];
    list.push(log);
    logsByExercise.set(log.workoutTemplateExerciseId, list);
  }

  const allExercises: SnapshotExercise[] = snapshot
    ? [...snapshot.sections.flatMap((s) => s.exercises), ...snapshot.unsectioned]
    : [];

  const sortedSections = snapshot
    ? [...snapshot.sections].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const sortedUnsectioned = snapshot
    ? [...snapshot.unsectioned].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const hasSnapshot = snapshot !== null && allExercises.length > 0;
  const hasLogs = detail.setLogs.length > 0;

  return (
    <div className="max-w-2xl">
      <HQBreadcrumbs crumbs={[
        { label: "Overview", href: "/hq" },
        { label: "Clients",         href: "/hq/clients" },
        { label: detail.clientName, href: `/hq/clients/${clientId}` },
        { label: "Workout Review" },
      ]} />

      {/* ── Read-only badge ───────────────────────────────────── */}
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24D]/60" />
        <span className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-semibold">
          Coach View · Read Only
        </span>
      </div>

      {/* ── Session header ────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              {statusBadge(detail.status)}
              {detail.completionPercent > 0 && (
                <span className="text-[#C9A24D] text-[10px] font-bold">
                  {detail.completionPercent}%
                </span>
              )}
            </div>
            <h1 className="text-white text-xl font-bold tracking-wide leading-tight">
              {detail.workoutName}
            </h1>
            {detail.programName && (
              <p className="text-gray-400 text-xs mt-1">{detail.programName}</p>
            )}
          </div>
          {detail.programWeekNumber && (
            <div className="shrink-0 text-right">
              <p className="text-[#C9A24D] text-lg font-bold leading-tight">
                {detail.programWeekNumber}
              </p>
              <p className="text-gray-500 text-[9px] uppercase tracking-[0.3em]">week</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-0.5 mt-3">
          {detail.scheduledDate && (
            <p className="text-gray-400 text-xs">
              <span className="text-gray-600 uppercase tracking-[0.25em] text-[9px] mr-2">
                Scheduled
              </span>
              {fmtDate(detail.scheduledDate)}
            </p>
          )}
          {detail.completedAt && (
            <p className="text-gray-400 text-xs">
              <span className="text-gray-600 uppercase tracking-[0.25em] text-[9px] mr-2">
                Completed
              </span>
              {fmtDate(detail.completedAt)}
            </p>
          )}
        </div>
      </div>

      {/* ── Skipped ───────────────────────────────────────────── */}
      {detail.status === "skipped" && (
        <div className="mb-6">
          <EmptyState
            tone="dark"
            title="Client skipped this session."
            description={detail.clientNotes ?? undefined}
          />
        </div>
      )}

      {/* ── Workout structure ─────────────────────────────────── */}
      {detail.status !== "skipped" && (
        <>
          {hasSnapshot ? (
            <>
              {sortedSections.map((sec) => (
                <div key={sec.id} className="mb-5">
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-[9px] text-gray-400 uppercase tracking-[0.3em] font-semibold">
                      {sec.name}
                    </p>
                    {sec.estimatedMinutes && (
                      <span className="text-gray-500 text-[10px]">{sec.estimatedMinutes} min</span>
                    )}
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                  {[...sec.exercises]
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((ex) => (
                      <ExerciseBlock
                        key={ex.id}
                        exercise={ex}
                        logs={logsByExercise.get(ex.id) ?? []}
                      />
                    ))}
                </div>
              ))}

              {sortedUnsectioned.length > 0 && (
                <div className="mb-5">
                  {sortedUnsectioned.map((ex) => (
                    <ExerciseBlock
                      key={ex.id}
                      exercise={ex}
                      logs={logsByExercise.get(ex.id) ?? []}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mb-6">
              <EmptyState
                tone="dark"
                title="Workout structure unavailable for this session."
                description={
                  hasLogs
                    ? `${detail.setLogs.length} set${detail.setLogs.length !== 1 ? "s" : ""} were logged.`
                    : undefined
                }
              />
            </div>
          )}

          {hasSnapshot && !hasLogs && detail.status === "completed" && (
            <div className="mb-6">
              <EmptyState tone="dark" title="No performance data was logged." />
            </div>
          )}

          {/* Client notes — visible to coach */}
          {detail.clientNotes && detail.status !== "skipped" && (
            <div className="border-t border-white/[0.06] pt-4 mt-4">
              <p className="text-gray-500 text-[9px] uppercase tracking-[0.3em] mb-1.5">
                Client Notes
              </p>
              <p className="text-gray-400 text-sm leading-relaxed">{detail.clientNotes}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
