"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { GeneratedProgramDraft, GeneratedPrescriptionDraft, ProgramGenerationBrief } from "@/lib/program-generator/contracts";
import type { DraftValidationResult, ValidationFinding } from "@/lib/program-generator/validation";
import {
  updatePrescriptionAction,
  replaceExerciseAction,
  reorderExercisesAction,
  moveWorkoutDayAction,
  regenerateDayAction,
  rerunValidationAction,
  acknowledgeWarningsAction,
  discardDraftAction,
  approveDraftAction,
} from "../actions";

interface Props {
  draftId: string;
  status: string;
  failureReason: string | null;
  draft: GeneratedProgramDraft | null;
  draftContentInvalid: boolean;
  brief: ProgramGenerationBrief | null;
  insights: DraftValidationResult | null;
  lastValidatedAt: string | null;
  warningsAcknowledgedAt: string | null;
  approvedAt: string | null;
  createdProgramTemplateId: string | null;
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

export default function DraftReviewClient(props: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);

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
  const warningsNeedAck =
    !!insights &&
    insights.warnings.length > 0 &&
    (!props.warningsAcknowledgedAt ||
      !props.lastValidatedAt ||
      new Date(props.warningsAcknowledgedAt) < new Date(props.lastValidatedAt));
  const hasBlockers = !!insights && insights.blockers.length > 0;
  const canApprove =
    props.status === "ready_for_review" && !!insights && !hasBlockers && !warningsNeedAck;

  return (
    <div className="space-y-6 pb-16">
      {/* Status + lifecycle actions */}
      <div className="bg-[#0d0e0f] border border-white/[0.08] p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-1">Status</p>
          <p className="text-white font-semibold text-sm">{STATUS_LABEL[props.status] ?? props.status}</p>
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
            {warningsNeedAck && (
              <button
                disabled={pending}
                onClick={() => runAction(() => acknowledgeWarningsAction(props.draftId), "Warnings acknowledged.")}
                className="border border-yellow-500/40 text-yellow-400 text-[10px] font-bold uppercase tracking-[0.25em] px-4 py-2.5 hover:bg-yellow-500/10 transition-colors disabled:opacity-40"
              >
                Acknowledge Warnings
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

      {/* Kynovant Insights summary */}
      {insights && (
        <div className="bg-[#0d0e0f] border border-white/[0.08] p-5">
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-3">
            Kynovant Insights — {fmtLabel(insights.status)}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <SummaryStat label="Blockers" count={insights.blockers.length} tone="error" />
            <SummaryStat label="Warnings" count={insights.warnings.length} tone="warning" />
            <SummaryStat label="Info" count={insights.info.length} tone="neutral" />
          </div>
          <div className="space-y-2">
            {[...insights.blockers, ...insights.warnings].map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </div>
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

function SummaryStat({ label, count, tone }: { label: string; count: number; tone: "error" | "warning" | "neutral" }) {
  const color = count === 0 ? "text-white/30" : tone === "error" ? "text-red-400" : tone === "warning" ? "text-yellow-400" : "text-white/60";
  return (
    <div className="text-center border border-white/[0.06] py-3">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{count}</p>
      <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.2em] mt-1">{label}</p>
    </div>
  );
}

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const color = finding.severity === "blocker" ? "border-red-500/30" : finding.severity === "warning" ? "border-yellow-500/30" : "border-white/10";
  return (
    <div className={`border ${color} px-3 py-2`}>
      <p className="text-white text-xs font-semibold">{finding.title}</p>
      <p className="text-white/40 text-[11px] mt-0.5">{finding.explanation}</p>
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
  const [replaceId, setReplaceId] = useState("");
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

  return (
    <div className="bg-[#080909] border border-white/[0.05] px-3 py-2">
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
        <div className="mt-2 flex items-center gap-2">
          <input
            value={replaceId}
            onChange={(e) => setReplaceId(e.target.value)}
            placeholder="Replacement exercise ID"
            className="bg-[#0d0e0f] border border-white/[0.08] text-white text-[10px] px-2 py-1.5 flex-1"
          />
          <button
            disabled={pending || !replaceId}
            onClick={() => {
              onRun(() => replaceExerciseAction({ draftId, dayId, sectionId, prescriptionId: prescription.id, exerciseId: replaceId }), "Exercise replaced.");
              setReplacing(false);
              setReplaceId("");
            }}
            className="text-[10px] text-[#C9A24D] uppercase tracking-[0.2em] disabled:opacity-40"
          >
            Go
          </button>
        </div>
      )}
    </div>
  );
}
