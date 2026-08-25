"use client";

import { useState, useEffect, useMemo } from "react";
import { lbsToKg, kgToLbs } from "@/lib/portal/units";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ExerciseItem {
  id: string;
  exerciseName: string;
  orderIndex: number;
  groupId: string | null;
  groupPosition: number | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null;
  targetRir: string | null;
  setTechnique: string | null;
  coachNotes: string | null;
}

interface SectionItem {
  id: string;
  name: string;
  sectionType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
  exercises: ExerciseItem[];
}

export interface WorkoutSnapshot {
  templateId: string;
  templateName: string;
  estimatedDurationMinutes: number | null;
  sections: SectionItem[];
  unsectioned: ExerciseItem[];
}

export interface Props {
  sessionId: string;
  snapshot: WorkoutSnapshot;
  programWeekNumber: number | null;
  scheduledDate: string | null;
  onComplete: (pct: number) => void;
  onCancel: () => void;
}

type SetStatus = "idle" | "pending" | "done" | "editing" | "error";

interface SetData {
  status: SetStatus;
  weightLbs: string;
  reps: string;
  duration: string;
  rpe: string;
  loggedWeightLbs: number | null;
  loggedReps: number | null;
  loggedDuration: number | null;
  loggedRpe: number | null;
  errorMsg: string;
}

interface RestTimer {
  exerciseName: string;
  totalSeconds: number;
  remaining: number;
  done: boolean;
}

const DEFAULT_SET: SetData = {
  status: "idle",
  weightLbs: "",
  reps: "",
  duration: "",
  rpe: "",
  loggedWeightLbs: null,
  loggedReps: null,
  loggedDuration: null,
  loggedRpe: null,
  errorMsg: "",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function sKey(exerciseId: string, setNum: number) {
  return `${exerciseId}::${setNum}`;
}

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function repRange(ex: ExerciseItem): string {
  if (ex.durationSeconds) return `${ex.durationSeconds}s`;
  if (ex.repsMin && ex.repsMax && ex.repsMin !== ex.repsMax)
    return `${ex.repsMin}–${ex.repsMax}`;
  if (ex.repsMin) return `${ex.repsMin}`;
  if (ex.repsMax) return `${ex.repsMax}`;
  return "—";
}

function validateSetData(data: SetData): string | null {
  const weight = data.weightLbs ? parseFloat(data.weightLbs) : null;
  const reps = data.reps ? parseInt(data.reps, 10) : null;
  const duration = data.duration ? parseInt(data.duration, 10) : null;
  const rpe = data.rpe ? parseFloat(data.rpe) : null;
  if (weight !== null && weight < 0) return "Weight cannot be negative";
  if (reps !== null && reps < 0) return "Reps cannot be negative";
  if (duration !== null && duration < 0) return "Duration cannot be negative";
  if (rpe !== null && (rpe < 0 || rpe > 10)) return "RPE must be 0–10";
  return null;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

const TECHNIQUE_COLORS: Record<string, string> = {
  superset: "text-violet-400",
  triset: "text-cyan-400",
  giant_set: "text-pink-400",
  drop_set: "text-orange-400",
  rest_pause: "text-lime-400",
  stretch_mediated_finisher: "text-sky-400",
  lengthened_partials: "text-amber-400",
};

// ─────────────────────────────────────────────────────────────
// REST TIMER PANEL — fixed bottom, persists while scrolling
// ─────────────────────────────────────────────────────────────

function RestTimerPanel({
  timer,
  onDismiss,
  rm,
}: {
  timer: RestTimer;
  onDismiss: () => void;
  rm: boolean;
}) {
  const pct =
    timer.totalSeconds > 0
      ? Math.max(0, Math.round((timer.remaining / timer.totalSeconds) * 100))
      : 0;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 bg-[#0c0d0e]/[0.97] border-t border-white/[0.08] px-5 pt-3 pb-[env(safe-area-inset-bottom,12px)]"
      style={rm ? {} : { animation: "ws-fade-up 200ms ease-out both" }}
      role="timer"
      aria-live="polite"
      aria-label={
        timer.done ? "Rest complete" : `Rest: ${timer.remaining} seconds remaining`
      }
    >
      {timer.done ? (
        <div className="flex items-center justify-between max-w-2xl mx-auto py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
            <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-[0.18em]">
              Rest Complete
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-500 text-[10px] hover:text-gray-300 transition-colors uppercase tracking-widest"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto pb-2">
          <div className="flex items-center justify-between mb-2.5">
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="text-[9px] text-gray-400 uppercase tracking-[0.2em] shrink-0">
                Rest
              </span>
              <span className="text-[9px] text-gray-500 truncate max-w-[140px] sm:max-w-none">
                {timer.exerciseName}
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span
                className="text-white font-bold text-xl leading-none tabular-nums"
                aria-atomic="true"
              >
                {timer.remaining}s
              </span>
              <button
                onClick={onDismiss}
                className="text-gray-500 text-[10px] hover:text-gray-300 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
          <div className="h-px bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C9A24D] rounded-full origin-left"
              style={{
                width: `${pct}%`,
                transition: rm ? "none" : "width 950ms linear",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NUM INPUT
// ─────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  width,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number | string;
  width: string;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${width} bg-[#080909] border border-white/[0.15] text-white text-[11px] px-2 py-1.5 text-center focus:outline-none focus:border-[#C9A24D]/50 placeholder:text-gray-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// SET DONE ROW — fades in on mount to mark completion
// ─────────────────────────────────────────────────────────────

function SetDoneRow({
  setNum,
  parts,
  onCorrect,
  rm,
}: {
  setNum: number;
  parts: string[];
  onCorrect: () => void;
  rm: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-b-0"
      style={rm ? {} : { animation: "ws-fade-up 280ms ease-out both" }}
    >
      <span className="text-[10px] text-gray-500 w-12 shrink-0 font-mono">Set {setNum}</span>
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" aria-hidden />
      <span className="text-emerald-400 text-[10px] font-semibold uppercase tracking-[0.1em]">
        Promise Kept
      </span>
      {parts.length > 0 && (
        <span className="text-gray-400 text-[10px] hidden sm:block">{parts.join(" · ")}</span>
      )}
      <button
        onClick={onCorrect}
        aria-label={`Correct set ${setNum}`}
        className="ml-auto text-gray-500 text-[10px] hover:text-gray-300 transition-colors shrink-0"
      >
        Correct
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SET ROW
// ─────────────────────────────────────────────────────────────

function SetRow({
  setNum,
  isTimeBased,
  data,
  onUpdate,
  onLog,
  onCorrect,
  rm,
}: {
  setNum: number;
  isTimeBased: boolean;
  data: SetData;
  onUpdate: (patch: Partial<SetData>) => void;
  onLog: () => void;
  onCorrect: () => void;
  rm: boolean;
}) {
  const isPending = data.status === "pending";

  if (data.status === "done") {
    const parts: string[] = [];
    if (data.loggedWeightLbs !== null) parts.push(`${data.loggedWeightLbs} lb`);
    if (data.loggedReps !== null) parts.push(`${data.loggedReps} reps`);
    if (data.loggedDuration !== null) parts.push(`${data.loggedDuration}s`);
    if (data.loggedRpe !== null) parts.push(`RPE ${data.loggedRpe}`);
    return <SetDoneRow setNum={setNum} parts={parts} onCorrect={onCorrect} rm={rm} />;
  }

  return (
    <div className="border-b border-white/[0.03] last:border-b-0 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500 w-12 shrink-0 font-mono">
          {data.status === "editing" ? `✎ ${setNum}` : `Set ${setNum}`}
        </span>

        {!isTimeBased && (
          <>
            <div className="flex items-center gap-1">
              <NumInput
                value={data.weightLbs}
                onChange={(v) => onUpdate({ weightLbs: v, status: "idle", errorMsg: "" })}
                placeholder="—"
                min={0}
                step={0.5}
                width="w-16"
                disabled={isPending}
                ariaLabel="Weight in pounds"
              />
              <span className="text-gray-400 text-[10px] shrink-0">lb</span>
            </div>

            <div className="flex items-center gap-1">
              <NumInput
                value={data.reps}
                onChange={(v) => onUpdate({ reps: v, status: "idle", errorMsg: "" })}
                placeholder="—"
                min={0}
                step={1}
                width="w-12"
                disabled={isPending}
                ariaLabel="Reps completed"
              />
              <span className="text-gray-400 text-[10px] shrink-0">reps</span>
            </div>
          </>
        )}

        {isTimeBased && (
          <div className="flex items-center gap-1">
            <NumInput
              value={data.duration}
              onChange={(v) => onUpdate({ duration: v, status: "idle", errorMsg: "" })}
              placeholder="—"
              min={0}
              step={1}
              width="w-16"
              disabled={isPending}
              ariaLabel="Duration in seconds"
            />
            <span className="text-gray-400 text-[10px] shrink-0">sec</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <NumInput
            value={data.rpe}
            onChange={(v) => onUpdate({ rpe: v, status: "idle", errorMsg: "" })}
            placeholder="RPE"
            min={0}
            max={10}
            step={0.5}
            width="w-14"
            disabled={isPending}
            ariaLabel="RPE (rate of perceived exertion, 0–10)"
          />
        </div>

        <button
          onClick={onLog}
          disabled={isPending}
          aria-label={`Log set ${setNum}`}
          className="bg-[#C9A24D]/10 border border-[#C9A24D]/20 text-[#C9A24D] text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 hover:bg-[#C9A24D]/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {isPending ? "…" : "Log"}
        </button>
      </div>

      {data.errorMsg && (
        <p className="text-red-400 text-[10px] mt-1 pl-14" role="alert">
          {data.errorMsg}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXERCISE ROW
// ─────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  setStates,
  onUpdate,
  onLog,
  onCorrect,
  rm,
}: {
  exercise: ExerciseItem;
  setStates: Map<string, SetData>;
  onUpdate: (exerciseId: string, setNum: number, patch: Partial<SetData>) => void;
  onLog: (exerciseId: string, setNum: number) => void;
  onCorrect: (exerciseId: string, setNum: number) => void;
  rm: boolean;
}) {
  const totalSets = exercise.sets ?? 1;
  const isTimeBased = exercise.durationSeconds != null;
  const techniqueClass = exercise.setTechnique
    ? TECHNIQUE_COLORS[exercise.setTechnique] ?? "text-gray-500"
    : "";

  // Build prescription chips
  const chips: Array<{ text: string; mono?: boolean; className?: string }> = [];
  if (exercise.setTechnique && exercise.setTechnique !== "straight_set") {
    chips.push({ text: fmtLabel(exercise.setTechnique), className: techniqueClass + " font-bold" });
  }
  if (exercise.tempo) chips.push({ text: exercise.tempo, mono: true });
  if (exercise.restSeconds) chips.push({ text: `${exercise.restSeconds}s rest` });
  if (exercise.targetRpe) chips.push({ text: `RPE ${exercise.targetRpe}` });
  if (exercise.targetRir) chips.push({ text: `${exercise.targetRir} RIR` });

  return (
    <div className="border border-white/[0.05] bg-[#0a0b0c] mb-3 overflow-hidden">
      {/* Exercise header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-white text-[15px] font-semibold leading-snug">
              {exercise.exerciseName}
            </p>
            {chips.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {chips.map((chip, i) => (
                  <span
                    key={i}
                    className={`text-[9px] tracking-[0.06em] px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.07] ${chip.mono ? "font-mono" : ""} ${chip.className ?? "text-gray-400"}`}
                  >
                    {chip.text}
                  </span>
                ))}
              </div>
            )}
            {exercise.coachNotes && (
              <p className="text-gray-400 text-[11px] italic mt-2 leading-relaxed">
                {exercise.coachNotes}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[#C9A24D] font-bold text-lg leading-tight">
              {totalSets}×{repRange(exercise)}
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.04] mx-4" />

      {/* Set rows */}
      <div className="px-4 pb-2 pt-0.5">
        {Array.from({ length: totalSets }, (_, i) => i + 1).map((setNum) => (
          <SetRow
            key={setNum}
            setNum={setNum}
            isTimeBased={isTimeBased}
            data={setStates.get(sKey(exercise.id, setNum)) ?? DEFAULT_SET}
            onUpdate={(patch) => onUpdate(exercise.id, setNum, patch)}
            onLog={() => onLog(exercise.id, setNum)}
            onCorrect={() => onCorrect(exercise.id, setNum)}
            rm={rm}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION BLOCK
// ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  setStates,
  onUpdate,
  onLog,
  onCorrect,
  rm,
}: {
  section: SectionItem;
  setStates: Map<string, SetData>;
  onUpdate: (exerciseId: string, setNum: number, patch: Partial<SetData>) => void;
  onLog: (exerciseId: string, setNum: number) => void;
  onCorrect: (exerciseId: string, setNum: number) => void;
  rm: boolean;
}) {
  const sortedExercises = [...section.exercises].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[9px] text-gray-400 uppercase tracking-[0.5em] font-semibold">
          {section.name}
        </p>
        {section.estimatedMinutes && (
          <span className="text-gray-500 text-[10px]">{section.estimatedMinutes} min</span>
        )}
        <div className="flex-1 h-px bg-white/[0.04]" aria-hidden />
      </div>
      {sortedExercises.map((ex) => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          setStates={setStates}
          onUpdate={onUpdate}
          onLog={onLog}
          onCorrect={onCorrect}
          rm={rm}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WORKOUT SESSION
// ─────────────────────────────────────────────────────────────

export default function WorkoutSession({
  sessionId,
  snapshot,
  programWeekNumber,
  scheduledDate,
  onComplete,
  onCancel,
}: Props) {
  const [setStates, setSetStates] = useState<Map<string, SetData>>(new Map());
  const [finishing, setFinishing] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null);
  // [In-progress workout session resilience] Whether already-persisted
  // set results (workout_set_logs) have finished loading — see the
  // hydration effect below. Gates only "Finish" (so a resumed session
  // can't be completed before its true progress is known), never
  // logging new sets — per this remediation's own instruction not to
  // block interaction for longer than necessary.
  const [hydrating, setHydrating] = useState(true);

  // Detect reduced motion once on mount — stable for session lifetime
  const [rm] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  // Capture session start time on mount
  const [startedAt] = useState<Date>(() => new Date());

  const allExercises = useMemo(
    () => [
      ...snapshot.sections.flatMap((s) => s.exercises),
      ...snapshot.unsectioned,
    ],
    [snapshot.sections, snapshot.unsectioned],
  );

  const totalSets = useMemo(
    () => allExercises.reduce((s, ex) => s + (ex.sets ?? 1), 0),
    [allExercises],
  );

  const doneSets = useMemo(
    () => [...setStates.values()].filter((d) => d.status === "done").length,
    [setStates],
  );

  const pct = totalSets > 0 ? Math.min(100, Math.round((doneSets / totalSets) * 100)) : 0;

  const completedExerciseCount = useMemo(() => {
    return allExercises.filter((ex) => {
      const total = ex.sets ?? 1;
      for (let n = 1; n <= total; n++) {
        if ((setStates.get(sKey(ex.id, n))?.status ?? "idle") !== "done") return false;
      }
      return true;
    }).length;
  }, [allExercises, setStates]);

  const estimatedFinish = useMemo(() => {
    if (!snapshot.estimatedDurationMinutes) return null;
    return new Date(startedAt.getTime() + snapshot.estimatedDurationMinutes * 60 * 1000);
  }, [startedAt, snapshot.estimatedDurationMinutes]);

  // ── Hydrate already-persisted set results on mount/remount ──
  // [In-progress workout session resilience] Root cause A from the
  // investigation: this component previously never fetched
  // workout_set_logs at all, so any refresh/remount showed a blank
  // slate even though the server had every logged set intact. Wired
  // to the ALREADY-EXISTING, already-correct GET /api/portal/
  // workout-session/{id} (getWorkoutSession()) — no new endpoint, no
  // new table.
  //
  // Stale-response / race safety (Part 5): the merge below only ADDS
  // an entry for a set key the user has NOT already touched locally
  // since mount (typed into, or logged) — setStates starts empty and
  // is otherwise only ever written by direct user action, so "already
  // has an entry" is a precise, sufficient test for "the user did
  // something with this set before hydration resolved." A slow/older
  // hydration response can therefore never clobber newer client state;
  // it only ever fills in gaps the user hasn't reached yet. No setState
  // call sits in this effect's synchronous body — every one is inside
  // the deferred .then()/.catch() callbacks, consistent with this
  // codebase's established debounced-effect pattern elsewhere (e.g.
  // ExercisePicker in DraftReviewClient.tsx).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/workout-session/${sessionId}`)
      .then((r) => r.json())
      .then(
        (data: {
          ok: boolean;
          sets?: Array<{
            workoutTemplateExerciseId: string;
            setNumber: number;
            actualReps: number | null;
            actualWeightKg: string | null;
            actualDurationSeconds: number | null;
            actualRpe: string | null;
          }>;
        }) => {
          if (cancelled) return;
          if (data.ok && data.sets) {
            const persistedSets = data.sets;
            setSetStates((prev) => {
              let changed = false;
              const next = new Map(prev);
              for (const s of persistedSets) {
                const key = sKey(s.workoutTemplateExerciseId, s.setNumber);
                if (next.has(key)) continue; // never overwrite newer local state
                changed = true;
                next.set(key, {
                  status: "done",
                  weightLbs: "",
                  reps: "",
                  duration: "",
                  rpe: "",
                  loggedWeightLbs: s.actualWeightKg !== null ? kgToLbs(parseFloat(s.actualWeightKg)) : null,
                  loggedReps: s.actualReps,
                  loggedDuration: s.actualDurationSeconds,
                  loggedRpe: s.actualRpe !== null ? parseFloat(s.actualRpe) : null,
                  errorMsg: "",
                });
              }
              return changed ? next : prev;
            });
          }
          setHydrating(false);
        },
      )
      .catch(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Rest timer countdown ──────────────────────────────────
  useEffect(() => {
    if (!restTimer || restTimer.done) return;
    if (restTimer.remaining <= 0) {
      setRestTimer((t) => (t ? { ...t, done: true } : null));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([100, 60, 200]);
      }
      return;
    }
    const id = setTimeout(() => {
      setRestTimer((t) => (t && !t.done ? { ...t, remaining: t.remaining - 1 } : t));
    }, 1000);
    return () => clearTimeout(id);
  }, [restTimer]);

  // ── Auto-dismiss 3 s after rest completes ────────────────
  const timerDone = restTimer?.done ?? false;
  useEffect(() => {
    if (!timerDone) return;
    const id = setTimeout(() => setRestTimer(null), 3000);
    return () => clearTimeout(id);
  }, [timerDone]);

  // ── State helpers ────────────────────────────────────────
  function updateSetState(exerciseId: string, setNum: number, patch: Partial<SetData>) {
    const key = sKey(exerciseId, setNum);
    setSetStates((prev) => {
      const next = new Map(prev);
      next.set(key, { ...(prev.get(key) ?? DEFAULT_SET), ...patch });
      return next;
    });
  }

  // ── Log a set ────────────────────────────────────────────
  async function handleLog(exerciseId: string, setNum: number) {
    const data = setStates.get(sKey(exerciseId, setNum)) ?? DEFAULT_SET;

    const err = validateSetData(data);
    if (err) {
      updateSetState(exerciseId, setNum, { status: "error", errorMsg: err });
      return;
    }

    const weightNum = data.weightLbs ? parseFloat(data.weightLbs) : null;
    const repsNum = data.reps ? parseInt(data.reps, 10) : null;
    const durationNum = data.duration ? parseInt(data.duration, 10) : null;
    const rpeNum = data.rpe ? parseFloat(data.rpe) : null;

    updateSetState(exerciseId, setNum, { status: "pending", errorMsg: "" });

    try {
      const res = await fetch(`/api/portal/workout-session/${sessionId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutTemplateExerciseId: exerciseId,
          setNumber: setNum,
          actualReps: repsNum,
          actualWeightKg: weightNum !== null ? lbsToKg(weightNum).toFixed(4) : null,
          actualDurationSeconds: durationNum,
          actualRpe: rpeNum !== null ? String(rpeNum) : null,
        }),
      });

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!json.ok) {
        updateSetState(exerciseId, setNum, {
          status: "error",
          errorMsg: json.error ?? "Failed to log set — try again",
        });
        return;
      }

      updateSetState(exerciseId, setNum, {
        status: "done",
        loggedWeightLbs: weightNum,
        loggedReps: repsNum,
        loggedDuration: durationNum,
        loggedRpe: rpeNum,
        errorMsg: "",
      });

      // Start rest timer if this exercise has a prescribed rest period
      const exercise = allExercises.find((e) => e.id === exerciseId);
      if (exercise?.restSeconds) {
        setRestTimer({
          exerciseName: exercise.exerciseName,
          totalSeconds: exercise.restSeconds,
          remaining: exercise.restSeconds,
          done: false,
        });
      }
    } catch {
      updateSetState(exerciseId, setNum, {
        status: "error",
        errorMsg: "Network error — try again",
      });
    }
  }

  function handleCorrect(exerciseId: string, setNum: number) {
    const data = setStates.get(sKey(exerciseId, setNum)) ?? DEFAULT_SET;
    updateSetState(exerciseId, setNum, {
      status: "editing",
      weightLbs: data.loggedWeightLbs !== null ? String(data.loggedWeightLbs) : "",
      reps: data.loggedReps !== null ? String(data.loggedReps) : "",
      duration: data.loggedDuration !== null ? String(data.loggedDuration) : "",
      rpe: data.loggedRpe !== null ? String(data.loggedRpe) : "",
      errorMsg: "",
    });
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await fetch(`/api/portal/workout-session/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      onComplete(pct);
    } finally {
      setFinishing(false);
    }
  }

  const sortedSections = useMemo(
    () => [...snapshot.sections].sort((a, b) => a.orderIndex - b.orderIndex),
    [snapshot.sections],
  );
  const sortedUnsectioned = useMemo(
    () => [...snapshot.unsectioned].sort((a, b) => a.orderIndex - b.orderIndex),
    [snapshot.unsectioned],
  );

  return (
    <>
      {/* Rest timer — fixed bottom, above mobile nav */}
      {restTimer && (
        <RestTimerPanel timer={restTimer} onDismiss={() => setRestTimer(null)} rm={rm} />
      )}

      <div
        className="max-w-2xl mx-auto px-4 py-6"
        style={restTimer ? { paddingBottom: "5rem" } : undefined}
      >
        {/* ── Workout header ──────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] text-gray-400 uppercase tracking-[0.5em] mb-1">
                {programWeekNumber ? `Week ${programWeekNumber}` : "Today's Workout"}
                {scheduledDate &&
                  ` · ${new Date(scheduledDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}`}
              </p>
              <h2 className="text-white text-xl font-bold tracking-wide leading-tight">
                {snapshot.templateName}
              </h2>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-500 text-[10px] hover:text-gray-300 transition-colors uppercase tracking-widest shrink-0 mt-1"
            >
              ✕ Close
            </button>
          </div>

          {/* Started · Est. Finish */}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
            <span>Started {fmtTime(startedAt)}</span>
            {estimatedFinish && (
              <>
                <span aria-hidden>·</span>
                <span>Est. finish {fmtTime(estimatedFinish)}</span>
              </>
            )}
          </div>

          {/* Progress */}
          <div className="mt-4" role="region" aria-label="Workout progress">
            <div className="h-0.5 bg-white/[0.07] rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-[#C9A24D] rounded-full"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Completion percentage"
                style={{
                  width: `${pct}%`,
                  transition: rm ? "none" : "width 500ms ease-out",
                }}
              />
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-[#C9A24D] font-bold">{pct}%</span>
              <span className="text-gray-400">
                {doneSets} / {totalSets} sets
              </span>
              {allExercises.length > 0 && (
                <span className="text-gray-500">
                  {completedExerciseCount} / {allExercises.length} exercises
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        {totalSets > 0 && (
          <p className="text-[10px] text-gray-500 mb-5">
            Weight · Reps · RPE are optional — log what you tracked.
          </p>
        )}

        {/* Sections */}
        {sortedSections.map((sec) => (
          <SectionBlock
            key={sec.id}
            section={sec}
            setStates={setStates}
            onUpdate={updateSetState}
            onLog={handleLog}
            onCorrect={handleCorrect}
            rm={rm}
          />
        ))}

        {/* Unsectioned */}
        {sortedUnsectioned.length > 0 && (
          <div className="mb-5">
            {sortedUnsectioned.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                setStates={setStates}
                onUpdate={updateSetState}
                onLog={handleLog}
                onCorrect={handleCorrect}
                rm={rm}
              />
            ))}
          </div>
        )}

        {/* Finish */}
        <div className="mt-8 border-t border-white/[0.06] pt-6">
          <button
            onClick={handleFinish}
            disabled={finishing || hydrating}
            className="w-full bg-[#C9A24D] text-black font-bold text-[11px] tracking-[0.3em] uppercase py-4 hover:bg-[#D4B56A] transition-colors disabled:opacity-50 min-h-[52px]"
          >
            {finishing ? "Saving…" : hydrating ? "Loading progress…" : `Finish Workout${pct > 0 ? ` — ${pct}%` : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}
