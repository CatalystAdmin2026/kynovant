"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GeneratedProgramDraft, GeneratedPrescriptionDraft, ProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult } from "@/lib/program-generator/validation";
import type { FindingGroup, GroupedDraftFindings } from "@/lib/program-generator/findings-grouping";
import {
  updatePrescriptionAction,
  replaceExerciseAction,
  replaceAllOccurrencesAction,
  searchReplacementExercisesAction,
  reorderExercisesAction,
  moveWorkoutDayAction,
  regenerateDayAction,
  resumeGenerationAction,
  rerunValidationAction,
  acknowledgeFindingsAction,
  discardDraftAction,
  approveDraftAction,
} from "../actions";
import type { ReplacementExerciseSearchResult } from "../actions";

interface GenerationProgress {
  totalWeeks: number | null;
  completedWeeks: number | null;
  currentWeek: number | null;
  // P0 day-level architecture change — see staged-generation.ts. Null
  // for a run that predates this change (nothing to show, falls back
  // to the week-only line below) or for a single_day-scope run.
  currentDay: number | null;
  completedDays: number | null;
}

interface GenerationWeekSummary {
  weekNumber: number;
  status: "completed" | "failed";
}

interface Props {
  draftId: string;
  status: string;
  failureReason: string | null;
  draft: GeneratedProgramDraft | null;
  draftContentInvalid: boolean;
  brief: ProgramGenerationBrief | null;
  insights: DraftValidationResult | null;
  grouped: GroupedDraftFindings;
  acknowledgedFindingKeys: string[];
  lastValidatedAt: string | null;
  warningsAcknowledgedAt: string | null;
  approvedAt: string | null;
  createdProgramTemplateId: string | null;
  progress: GenerationProgress | null;
  generationWeeks: GenerationWeekSummary[];
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Generating…",
  ready_for_review: "Ready for Review",
  failed: "Generation Failed",
  approved: "Approved",
  discarded: "Discarded",
};

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors lib/program-generator/findings-grouping.ts's occurrenceAckKey/
// groupAckKey exactly (same string format — must stay in lockstep with
// the server-side versions the acknowledgement service actually checks
// against). Duplicated here, not imported, because that module
// transitively imports exercise-resolution.ts (server-only, pulls in
// the Postgres driver) — importing any runtime symbol from it, even an
// unrelated one-line helper, breaks the client bundle. The exported
// TYPES from that module (FindingGroup, GroupedDraftFindings above) are
// erased at build time and carry no such risk.
function occurrenceAckKey(findingId: string): string {
  return `finding:${findingId}`;
}
function groupAckKey(groupKey: string): string {
  return `group:${groupKey}`;
}

function scrollToPrescription(prescriptionId: string) {
  const el = document.getElementById(`prescription-${prescriptionId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-1", "ring-[#C9A24D]/60");
  setTimeout(() => el.classList.remove("ring-1", "ring-[#C9A24D]/60"), 1600);
}

export default function DraftReviewClient(props: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (props.status !== "running") return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [props.status, router]);

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>, successMessage?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setNotice({ tone: "error", message: result.error ?? "Something went wrong." });
      } else if (successMessage) {
        setNotice({ tone: "success", message: successMessage });
      } else {
        setNotice(null);
      }
    });
  }

  const insights = props.insights;
  const { hierarchy, summary } = props.grouped;
  const ackedKeys = useMemo(() => new Set(props.acknowledgedFindingKeys), [props.acknowledgedFindingKeys]);

  const warningsNeedAck =
    !!insights &&
    insights.warnings.length > 0 &&
    (!props.warningsAcknowledgedAt ||
      !props.lastValidatedAt ||
      new Date(props.warningsAcknowledgedAt) < new Date(props.lastValidatedAt));
  const hasBlockers = !!insights && insights.blockers.length > 0;
  const canApprove =
    props.status === "ready_for_review" && !!insights && !hasBlockers && !warningsNeedAck;

  const allWarningGroupKeys = hierarchy.warnings.map((g) => groupAckKey(g.groupKey));
  const allWarningsAlreadyAcked = allWarningGroupKeys.length > 0 && allWarningGroupKeys.every((k) => ackedKeys.has(k));

  return (
    <div className="space-y-6 pb-16">
      {/* Status + lifecycle actions */}
      <div className="bg-[#0d0e0f] border border-white/[0.08] p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-1">Status</p>
          <p className="text-white font-semibold text-sm">{STATUS_LABEL[props.status] ?? props.status}</p>
          {props.status === "running" && props.progress?.totalWeeks != null && (
            <p className="text-[#C9A24D] text-xs mt-1">
              {props.progress.currentWeek === 0
                ? "Designing program structure…"
                : `Generating Week ${props.progress.currentWeek ?? 1} of ${props.progress.totalWeeks}${
                    props.progress.currentDay != null ? `, Day ${props.progress.currentDay}` : ""
                  }`}
            </p>
          )}
          {props.status === "failed" && props.failureReason && (
            <p className="text-red-400 text-xs mt-1">{props.failureReason}</p>
          )}
          {props.status === "approved" && props.createdProgramTemplateId && (
            <Link
              href={`/hq/programs/${props.createdProgramTemplateId}`}
              className="text-[#C9A24D] text-xs mt-1 inline-block hover:text-[#D4B56A]"
            >
              View created Program →
            </Link>
          )}
        </div>

        {(props.status === "ready_for_review" || props.status === "failed") && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {props.status === "ready_for_review" && (
              <button
                disabled={pending}
                onClick={() => runAction(() => rerunValidationAction(props.draftId), "Validation re-run.")}
                className="border border-white/15 text-white/70 text-[10px] font-bold uppercase tracking-[0.25em] px-4 py-2.5 hover:border-white/30 hover:text-white transition-colors disabled:opacity-40"
              >
                Rerun Validation
              </button>
            )}
            {props.status === "failed" && (
              <button
                disabled={pending}
                onClick={() => runAction(() => resumeGenerationAction(props.draftId), "Retrying generation…")}
                className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-40"
              >
                Retry
              </button>
            )}
            <button
              disabled={pending}
              onClick={() => {
                if (confirm("Discard this draft? This cannot be undone.")) {
                  runAction(() => discardDraftAction(props.draftId), "Draft discarded.");
                }
              }}
              className="border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-[0.25em] px-4 py-2.5 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              Discard
            </button>
            {props.status === "ready_for_review" && (
              <button
                disabled={pending || !canApprove}
                onClick={() => runAction(() => approveDraftAction(props.draftId), "Draft approved.")}
                title={
                  hasBlockers
                    ? "Resolve blocking Kynovant Insights findings first."
                    : warningsNeedAck
                      ? "Acknowledge warnings first."
                      : undefined
                }
                className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Approve &amp; Create
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`text-xs px-4 py-2.5 border ${
            notice.tone === "error" ? "border-red-500/30 text-red-400" : "border-emerald-500/30 text-emerald-400"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Week-by-week generation progress */}
      {props.generationWeeks.length > 0 && (
        <div className="bg-[#0d0e0f] border border-white/[0.08] p-5">
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-3">
            Generation Progress
          </p>
          <div className="flex flex-wrap gap-1.5">
            {props.generationWeeks.map((w) => (
              <span
                key={w.weekNumber}
                title={w.status === "completed" ? `Week ${w.weekNumber} completed` : `Week ${w.weekNumber} failed`}
                className={`text-[10px] font-semibold px-2 py-1 border ${
                  w.status === "completed"
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-red-500/30 text-red-400"
                }`}
              >
                W{w.weekNumber} {w.status === "completed" ? "✓" : "✗"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Review Summary — requirement #7 */}
      {insights && (
        <ReviewSummaryPanel summary={summary} status={insights.status} canApprove={canApprove} />
      )}

      {/* Findings hierarchy — requirement #4 */}
      {insights && (
        <div className="space-y-4">
          {hierarchy.blockers.length > 0 && (
            <FindingSection
              title="Approval Blockers"
              subtitle="Must be resolved — approval is not possible until every group here is gone."
              tone="blocker"
              groups={hierarchy.blockers}
              draftId={props.draftId}
              editable={props.status === "ready_for_review"}
              pending={pending}
              ackedKeys={ackedKeys}
              onRun={runAction}
            />
          )}

          {hierarchy.warnings.length > 0 && (
            <FindingSection
              title="Warnings Requiring Acknowledgement"
              subtitle="Can be approved once acknowledged — nothing here blocks approval on its own."
              tone="warning"
              groups={hierarchy.warnings}
              draftId={props.draftId}
              editable={props.status === "ready_for_review"}
              pending={pending}
              ackedKeys={ackedKeys}
              onRun={runAction}
              headerAction={
                hierarchy.warnings.length > 1 && (
                  <button
                    disabled={pending || allWarningsAlreadyAcked}
                    onClick={() =>
                      runAction(
                        () => acknowledgeFindingsAction(props.draftId, allWarningGroupKeys),
                        "All visible warnings acknowledged.",
                      )
                    }
                    className="border border-yellow-500/40 text-yellow-400 text-[9px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 hover:bg-yellow-500/10 transition-colors disabled:opacity-30"
                  >
                    {allWarningsAlreadyAcked ? "All Acknowledged" : "Acknowledge All Visible"}
                  </button>
                )
              }
            />
          )}

          {hierarchy.info.length > 0 && (
            <InfoSection groups={hierarchy.info} />
          )}
        </div>
      )}

      {/* Draft content */}
      {props.draftContentInvalid && (
        <div className="text-red-400 text-xs">Draft content failed schema validation and cannot be displayed.</div>
      )}

      {props.draft && props.brief && (
        <div className="space-y-6">
          <div className="bg-[#0d0e0f] border border-white/[0.08] p-5">
            <p className="text-white font-semibold text-lg">{props.draft.name}</p>
            {props.draft.description && <p className="text-white/40 text-sm mt-1">{props.draft.description}</p>}
            <p className="text-white/25 text-[11px] mt-2 uppercase tracking-[0.2em]">
              {fmtLabel(props.draft.category)} · {fmtLabel(props.draft.experienceLevel)} · {props.draft.defaultDurationWeeks}{" "}
              weeks · {props.draft.recommendedDaysPerWeek}x/week
            </p>
          </div>

          {props.draft.weeks.map((week) => (
            <div key={week.id} className="bg-[#0d0e0f] border border-white/[0.08] p-5">
              <p className="text-white/70 font-semibold text-sm uppercase tracking-[0.2em] mb-4">
                Week {week.weekNumber}
                {week.label ? ` — ${week.label}` : ""}
              </p>
              <div className="space-y-5">
                {week.days.map((day) => (
                  <div key={day.id} className="border border-white/[0.06] p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <select
                          disabled={pending || props.status !== "ready_for_review"}
                          value={day.dayOfWeek}
                          onChange={(e) =>
                            runAction(() =>
                              moveWorkoutDayAction({
                                draftId: props.draftId,
                                weekId: week.id,
                                dayId: day.id,
                                newDayOfWeek: Number(e.target.value),
                              }),
                            )
                          }
                          className="bg-[#080909] border border-white/[0.08] text-white text-xs px-2 py-1"
                        >
                          {DAY_NAMES.map((name, idx) => (
                            <option key={idx} value={idx}>{name}</option>
                          ))}
                        </select>
                        <p className="text-white font-semibold text-sm">
                          {day.workout ? day.workout.name : "Rest Day"}
                        </p>
                      </div>
                      {day.workout && props.status === "ready_for_review" && (
                        <RegenerateDayControl
                          draftId={props.draftId}
                          dayId={day.id}
                          pending={pending}
                          onRun={(fn) => runAction(fn, "Day regenerated.")}
                        />
                      )}
                    </div>

                    {day.workout?.sections.map((section) => (
                      <div key={section.id} className="mb-3 last:mb-0">
                        <p className="text-white/40 text-[10px] font-semibold uppercase tracking-[0.2em] mb-1.5">
                          {section.name} · {fmtLabel(section.sectionType)}
                        </p>
                        <div className="space-y-1.5">
                          {section.prescriptions.map((prescription, idx) => (
                            <PrescriptionRow
                              key={prescription.id}
                              draftId={props.draftId}
                              dayId={day.id}
                              sectionId={section.id}
                              prescription={prescription}
                              index={idx}
                              count={section.prescriptions.length}
                              allIds={section.prescriptions.map((p) => p.id)}
                              editable={props.status === "ready_for_review"}
                              pending={pending}
                              onRun={runAction}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REVIEW SUMMARY — requirement #7
// ─────────────────────────────────────────────────────────────

function ReviewSummaryPanel({
  summary,
  status,
  canApprove,
}: {
  summary: GroupedDraftFindings["summary"];
  status: DraftValidationResult["status"];
  canApprove: boolean;
}) {
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.08] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em]">
          Kynovant Insights — {fmtLabel(status)}
        </p>
        <span
          className={`text-[9px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 border ${
            canApprove
              ? "border-emerald-500/40 text-emerald-400"
              : "border-white/15 text-white/40"
          }`}
        >
          {canApprove ? "Approval Available" : "Approval Not Yet Available"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryStat label="Unresolved Names" count={summary.unresolvedExerciseNameCount} tone="error" />
        <SummaryStat label="Ambiguous Names" count={summary.ambiguousExerciseNameCount} tone="error" />
        <SummaryStat label="Affected Prescriptions" count={summary.totalAffectedPrescriptions} tone="neutral" />
        <SummaryStat label="Structural Blockers" count={summary.blockingStructuralIssueCount} tone="error" />
        <SummaryStat label="Warning Categories" count={summary.warningCategoryCount} tone="warning" />
      </div>
    </div>
  );
}

function SummaryStat({ label, count, tone }: { label: string; count: number; tone: "error" | "warning" | "neutral" }) {
  const color = count === 0 ? "text-white/30" : tone === "error" ? "text-red-400" : tone === "warning" ? "text-yellow-400" : "text-white/60";
  return (
    <div className="text-center border border-white/[0.06] py-3">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{count}</p>
      <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.2em] mt-1">{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FINDINGS HIERARCHY — requirement #4
// ─────────────────────────────────────────────────────────────

function FindingSection({
  title,
  subtitle,
  tone,
  groups,
  draftId,
  editable,
  pending,
  ackedKeys,
  onRun,
  headerAction,
}: {
  title: string;
  subtitle: string;
  tone: "blocker" | "warning";
  groups: FindingGroup[];
  draftId: string;
  editable: boolean;
  pending: boolean;
  ackedKeys: Set<string>;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage?: string) => void;
  headerAction?: React.ReactNode;
}) {
  const borderColor = tone === "blocker" ? "border-red-500/20" : "border-yellow-500/20";
  return (
    <div className={`bg-[#0d0e0f] border ${borderColor} p-5`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-white font-semibold text-sm">
          {title} <span className="text-white/30 font-normal">({groups.length})</span>
        </p>
        {headerAction}
      </div>
      <p className="text-white/30 text-[11px] mb-3">{subtitle}</p>
      <div className="space-y-2">
        {groups.map((group) => (
          <FindingGroupCard
            key={group.groupKey}
            group={group}
            tone={tone}
            draftId={draftId}
            editable={editable}
            pending={pending}
            acknowledged={ackedKeys.has(groupAckKey(group.groupKey))}
            onRun={onRun}
          />
        ))}
      </div>
    </div>
  );
}

function InfoSection({ groups }: { groups: FindingGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.06] p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <p className="text-white/50 font-semibold text-sm">
          Informational Observations <span className="text-white/25 font-normal">({groups.length})</span>
        </p>
        <span className="text-white/30 text-[10px] uppercase tracking-[0.2em]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-2 mt-3">
          {groups.map((group) => (
            <div key={group.groupKey} className="border border-white/[0.06] px-3 py-2">
              <p className="text-white/70 text-xs font-semibold">
                {group.title}
                {group.occurrenceCount > 1 && (
                  <span className="text-white/30 font-normal"> — {group.occurrenceCount} occurrences</span>
                )}
              </p>
              <p className="text-white/30 text-[11px] mt-0.5">{group.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// [Draft Review exercise search/replacement UX] Replaces the old raw
// "Replacement exercise ID" text field — a UUID no coach should be
// expected to know — with a searchable-by-name picker. Debounced
// (300ms), server-backed via searchReplacementExercisesAction (never
// ships the Exercise Library to the browser — mirrors the same
// debounce/loading/empty-state pattern components/BlueprintEditor.tsx's
// own exercise search already established elsewhere in the app).
//
// Two-step by design: selecting a result only stages it (`selected`
// state) — it does NOT call the replace action. A separate, explicit
// "Replace" click (or Enter while already on the confirm step is
// intentionally NOT wired to re-trigger it — see handleKeyDown) is
// required, so arrowing through results and hitting Enter to "just see
// what's there" can never accidentally fire a real replacement.
//
// The server action is the ONLY place a UUID actually flows — this
// component never displays one; only human-readable names ever appear.
function ExercisePicker({
  draftId,
  excludeExerciseId,
  pending,
  onConfirm,
  onClose,
}: {
  draftId: string;
  excludeExerciseId?: string | null;
  pending: boolean;
  onConfirm: (exercise: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReplacementExerciseSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<ReplacementExerciseSearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const trimmedQuery = query.trim();

  useEffect(() => {
    // An empty query intentionally does nothing here — the render
    // below already treats an empty trimmedQuery as "show nothing,"
    // regardless of whatever stale results/searched/loading state is
    // still sitting around from an earlier, now-cleared query.
    if (!trimmedQuery) return;
    // No setState directly in the effect body — mirrors
    // components/BlueprintEditor.tsx's own existing debounced-search
    // effect: the effect body only ever schedules the timer; every
    // state update happens inside the (async, deferred) timeout
    // callback below, including the loading flag itself.
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      const result = await searchReplacementExercisesAction({ draftId, query: trimmedQuery });
      // Stale-response guard: if the query changed again while this
      // request was in flight (a slower earlier keystroke resolving
      // after a faster later one), never let it overwrite what the
      // coach is now looking at.
      if (cancelled) return;
      setLoading(false);
      setSearched(true);
      if (result.ok) {
        const found = result.data?.exercises ?? [];
        const filtered = excludeExerciseId ? found.filter((e) => e.id !== excludeExerciseId) : found;
        setResults(filtered);
        setHighlighted(0);
      } else {
        setResults([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmedQuery, draftId, excludeExerciseId]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (selected) return; // confirming step — arrow/Enter no longer navigate a list
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlighted]) setSelected(results[highlighted]);
    }
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="mt-2 bg-[#0d0e0f] border border-white/[0.08] p-2.5"
    >
      {selected ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-white text-[11px]">
            Replace with <span className="text-[#C9A24D]">{selected.name}</span>?
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button
              disabled={pending}
              onClick={() => setSelected(null)}
              className="text-[10px] text-white/40 hover:text-white uppercase tracking-[0.15em] disabled:opacity-40"
            >
              Change
            </button>
            <button
              disabled={pending}
              onClick={() => onConfirm(selected)}
              className="text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] disabled:opacity-40"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            aria-label="Search exercises"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={trimmedQuery.length > 0}
            aria-autocomplete="list"
            className="w-full bg-[#080909] border border-white/[0.08] text-white text-[11px] px-2 py-1.5 placeholder:text-white/25"
          />
          {trimmedQuery.length > 0 && (
            <div id={listboxId} role="listbox" className="mt-1.5 max-h-52 overflow-y-auto">
              {loading && <p className="text-white/25 text-[10px] py-1.5 px-1">Searching…</p>}
              {!loading && searched && results.length === 0 && (
                <p className="text-white/25 text-[10px] py-1.5 px-1">No exercises found.</p>
              )}
              {!loading &&
                results.map((ex, i) => (
                  <button
                    key={ex.id}
                    role="option"
                    aria-selected={i === highlighted}
                    onClick={() => setSelected(ex)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`w-full text-left px-2 py-1.5 text-[11px] transition-colors ${
                      i === highlighted ? "bg-[#C9A24D]/15 text-white" : "text-white/70"
                    }`}
                  >
                    {ex.name}
                    {ex.primaryMuscleGroup && (
                      <span className="text-white/30 ml-2 text-[9px] uppercase tracking-[0.1em]">
                        {ex.primaryMuscleGroup.replace(/_/g, " ")}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FindingGroupCard({
  group,
  tone,
  draftId,
  editable,
  pending,
  acknowledged,
  onRun,
}: {
  group: FindingGroup;
  tone: "blocker" | "warning";
  draftId: string;
  editable: boolean;
  pending: boolean;
  acknowledged: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchingReplacement, setSearchingReplacement] = useState(false);
  const color = tone === "blocker" ? "border-red-500/30" : "border-yellow-500/30";

  return (
    <div className={`border ${color} px-3 py-2.5`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white text-xs font-semibold">
            {group.title}
            {group.occurrenceCount > 1 && (
              <span className="text-white/35 font-normal"> — {group.occurrenceCount} occurrences</span>
            )}
            {acknowledged && (
              <span className="ml-2 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-400">Acknowledged</span>
            )}
          </p>
          <p className="text-white/40 text-[11px] mt-0.5">{group.explanation}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-white/40 hover:text-white uppercase tracking-[0.15em]"
          >
            {expanded ? "Hide Occurrences" : "Review Occurrences Individually"}
          </button>
          {tone === "warning" && (
            <button
              disabled={pending || acknowledged}
              onClick={() =>
                onRun(
                  () => acknowledgeFindingsAction(draftId, [groupAckKey(group.groupKey)]),
                  "Issue acknowledged.",
                )
              }
              className="text-[10px] text-yellow-400 hover:text-yellow-300 uppercase tracking-[0.15em] disabled:opacity-30"
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>

      {/* Used-in occurrence list — requirement #5 navigation */}
      {expanded && (
        <div className="mt-2.5 space-y-1">
          {group.occurrences.map((occ) => (
            <div key={occ.findingId} className="flex items-center justify-between gap-2 bg-[#080909] px-2.5 py-1.5">
              <span className="text-white/50 text-[11px]">
                {occ.weekNumber != null ? `Week ${occ.weekNumber}` : "Program-wide"}
                {occ.weekLabel ? ` — ${occ.weekLabel}` : ""}
                {occ.dayLabel ? `, ${occ.dayLabel}` : ""}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {tone === "warning" && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      onRun(
                        () => acknowledgeFindingsAction(draftId, [occurrenceAckKey(occ.findingId)]),
                        "Occurrence acknowledged.",
                      )
                    }
                    className="text-[9px] text-yellow-400/80 hover:text-yellow-300 uppercase tracking-[0.15em]"
                  >
                    Ack
                  </button>
                )}
                {occ.prescriptionId && (
                  <button
                    onClick={() => scrollToPrescription(occ.prescriptionId!)}
                    className="text-[9px] text-[#C9A24D] hover:text-[#D4B56A] uppercase tracking-[0.15em]"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Replace All Occurrences — only for unresolved/ambiguous exercise groups */}
      {editable && group.isReplaceableExerciseGroup && group.exerciseName && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.06]">
          {group.candidates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {group.candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={pending}
                  onClick={() =>
                    onRun(
                      () =>
                        replaceAllOccurrencesAction({
                          draftId,
                          normalizedName: group.exerciseName!,
                          exerciseId: c.id,
                        }),
                      `Replaced all ${group.occurrenceCount} occurrence(s) with "${c.name}".`,
                    )
                  }
                  className="text-[10px] text-white/70 hover:text-black hover:bg-[#C9A24D] border border-white/15 hover:border-[#C9A24D] px-2 py-1 transition-colors disabled:opacity-40"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {searchingReplacement ? (
            <ExercisePicker
              draftId={draftId}
              pending={pending}
              onConfirm={(ex) => {
                onRun(
                  () =>
                    replaceAllOccurrencesAction({
                      draftId,
                      normalizedName: group.exerciseName!,
                      exerciseId: ex.id,
                    }),
                  `Replaced all ${group.occurrenceCount} occurrence(s) with "${ex.name}".`,
                );
                setSearchingReplacement(false);
              }}
              onClose={() => setSearchingReplacement(false)}
            />
          ) : (
            <button
              disabled={pending}
              onClick={() => setSearchingReplacement(true)}
              className="text-[10px] text-white/40 hover:text-[#C9A24D] uppercase tracking-[0.15em] disabled:opacity-40"
            >
              Search for a different exercise…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RegenerateDayControl({
  draftId,
  dayId,
  pending,
  onRun,
}: {
  draftId: string;
  dayId: string;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        disabled={pending}
        onClick={() => setOpen(true)}
        className="text-[10px] text-white/40 hover:text-[#C9A24D] uppercase tracking-[0.2em] transition-colors disabled:opacity-40"
      >
        Regenerate Day
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Optional instruction"
        className="bg-[#080909] border border-white/[0.08] text-white text-xs px-2 py-1.5 w-48"
      />
      <button
        disabled={pending}
        onClick={() => {
          onRun(() => regenerateDayAction({ draftId, dayId, instruction: instruction || undefined }));
          setOpen(false);
          setInstruction("");
        }}
        className="text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] disabled:opacity-40"
      >
        Go
      </button>
      <button onClick={() => setOpen(false)} className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
        Cancel
      </button>
    </div>
  );
}

function PrescriptionRow({
  draftId,
  dayId,
  sectionId,
  prescription,
  index,
  count,
  allIds,
  editable,
  pending,
  onRun,
}: {
  draftId: string;
  dayId: string;
  sectionId: string;
  prescription: GeneratedPrescriptionDraft;
  index: number;
  count: number;
  allIds: string[];
  editable: boolean;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>, successMessage?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [fields, setFields] = useState({
    sets: prescription.sets?.toString() ?? "",
    repsMin: prescription.repsMin?.toString() ?? "",
    repsMax: prescription.repsMax?.toString() ?? "",
    restSeconds: prescription.restSeconds?.toString() ?? "",
    tempo: prescription.tempo ?? "",
    targetRpe: prescription.targetRpe?.toString() ?? "",
    targetRir: prescription.targetRir?.toString() ?? "",
  });

  function move(delta: number) {
    const idx = allIds.indexOf(prescription.id);
    const target = idx + delta;
    if (target < 0 || target >= allIds.length) return;
    const next = [...allIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    onRun(() => reorderExercisesAction({ draftId, dayId, sectionId, orderedPrescriptionIds: next }));
  }

  const needsResolution = prescription.exerciseId === null;

  return (
    <div
      id={`prescription-${prescription.id}`}
      className={`bg-[#080909] border px-3 py-2 transition-shadow ${
        needsResolution ? "border-red-500/20" : "border-white/[0.05]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-white text-xs">
          {prescription.exerciseName}
          <span className="text-white/30 ml-2">
            {prescription.sets ?? "–"} × {prescription.repsMin ?? "–"}–{prescription.repsMax ?? "–"}
            {prescription.restSeconds != null ? ` · ${prescription.restSeconds}s rest` : ""}
          </span>
        </div>
        {editable && (
          <div className="flex items-center gap-2 shrink-0">
            <button disabled={pending || index === 0} onClick={() => move(-1)} className="text-white/30 hover:text-white text-[10px] disabled:opacity-20">↑</button>
            <button disabled={pending || index === count - 1} onClick={() => move(1)} className="text-white/30 hover:text-white text-[10px] disabled:opacity-20">↓</button>
            <button disabled={pending} onClick={() => setEditing((v) => !v)} className="text-[10px] text-white/40 hover:text-[#C9A24D] uppercase tracking-[0.15em]">
              Edit
            </button>
            <button disabled={pending} onClick={() => setReplacing((v) => !v)} className="text-[10px] text-white/40 hover:text-[#C9A24D] uppercase tracking-[0.15em]">
              Replace
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-2 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {(["sets", "repsMin", "repsMax", "restSeconds", "tempo", "targetRpe", "targetRir"] as const).map((key) => (
            <input
              key={key}
              value={fields[key]}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={key}
              className="bg-[#0d0e0f] border border-white/[0.08] text-white text-[10px] px-1.5 py-1 w-full"
            />
          ))}
          <button
            disabled={pending}
            onClick={() => {
              const patch: Record<string, number | string | undefined> = {
                sets: fields.sets ? Number(fields.sets) : undefined,
                repsMin: fields.repsMin ? Number(fields.repsMin) : undefined,
                repsMax: fields.repsMax ? Number(fields.repsMax) : undefined,
                restSeconds: fields.restSeconds ? Number(fields.restSeconds) : undefined,
                tempo: fields.tempo || undefined,
                targetRpe: fields.targetRpe ? Number(fields.targetRpe) : undefined,
                targetRir: fields.targetRir ? Number(fields.targetRir) : undefined,
              };
              onRun(() => updatePrescriptionAction({ draftId, dayId, sectionId, prescriptionId: prescription.id, patch }), "Prescription updated.");
              setEditing(false);
            }}
            className="col-span-4 sm:col-span-7 text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] text-left mt-1"
          >
            Save
          </button>
        </div>
      )}

      {replacing && (
        <ExercisePicker
          draftId={draftId}
          excludeExerciseId={prescription.exerciseId}
          pending={pending}
          onConfirm={(ex) => {
            onRun(
              () => replaceExerciseAction({ draftId, dayId, sectionId, prescriptionId: prescription.id, exerciseId: ex.id }),
              `Replaced with "${ex.name}".`,
            );
            setReplacing(false);
          }}
          onClose={() => setReplacing(false)}
        />
      )}
    </div>
  );
}
