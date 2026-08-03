"use client";

// ─────────────────────────────────────────────────────────────
// Catalyst HQ — Program Assignment Modal (Sprint 6.3A)
//
// Three-step flow:
//   Step 1 — Choose Program (searchable list)
//   Step 2 — Set Schedule (start date, auto end date)
//   Step 3 — Preview & Confirm (week 1 schedule + warnings)
//
// Opens when it receives the custom event "hq:assign-program:open".
// Closes on: backdrop click, ESC key, or successful assignment.
// Focus trap + ESC-to-close + body scroll lock are handled by the
// Modal primitive (components/ui/Modal.tsx) — it generalizes the
// exact dialog pattern this component used to hand-roll.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Modal, Button, Badge, Input, Label, HelperText } from "@/components/ui";
import type { BlueprintForAssignment } from "@/lib/db/coach-program-assignment-service";
import { assignProgramAction } from "@/app/hq/clients/[clientId]/actions";

const OPEN_EVENT = "hq:assign-program:open";
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

function nextMonday(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const daysUntil = dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + daysUntil);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addWeeks(startDate: string, weeks: number): string {
  const d = new Date(startDate + "T12:00:00");
  d.setDate(d.getDate() + weeks * 7 - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_growth: "Muscle Growth",
  body_recomposition: "Recomposition",
  athletic_performance: "Athletic",
  lifestyle: "Lifestyle",
  competition_prep: "Competition Prep",
  executive_performance: "Executive",
};

const EXP_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  competitive: "Competitive",
  mixed: "Mixed",
};

// ─────────────────────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Program" },
    { n: 2, label: "Schedule" },
    { n: 3, label: "Confirm" },
  ];
  return (
    <div className="mb-8 flex items-center">
      {steps.map((s, i) => (
        <div key={s.n} className="flex min-w-0 items-center" style={{ flex: i < steps.length - 1 ? "1 1 0" : undefined }}>
          <div className="flex flex-col items-center">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-150 ${
                step === s.n
                  ? "bg-[#C9A24D] text-black"
                  : step > s.n
                  ? "bg-[#C9A24D]/20 text-[#C9A24D]"
                  : "bg-white/[0.06] text-white/30"
              }`}
            >
              {step > s.n ? <Check size={12} strokeWidth={3} /> : s.n}
            </div>
            <p
              className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] transition-colors duration-150 ${
                step === s.n ? "text-[#C9A24D]" : step > s.n ? "text-[#C9A24D]/50" : "text-white/25"
              }`}
            >
              {s.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-3 mb-4 h-px flex-1 transition-colors duration-150 ${
                step > s.n ? "bg-[#C9A24D]/30" : "bg-white/[0.06]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  hasActiveProgram: boolean;
  activeProgramName: string | null;
  blueprints: BlueprintForAssignment[];
}

export default function AssignProgramModal({
  clientId,
  hasActiveProgram,
  activeProgramName,
  blueprints,
}: Props) {
  const router = useRouter();

  // Modal open state
  const [isOpen, setIsOpen] = useState(false);

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Step 2 state
  const [startDate, setStartDate] = useState(nextMonday);

  // Step 3 state
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected program derived value
  const selected = blueprints.find((b) => b.id === selectedId) ?? null;
  const endDate = selected?.defaultDurationWeeks && startDate
    ? addWeeks(startDate, selected.defaultDurationWeeks)
    : null;

  // ── Handlers (declared before effects that reference them)
  const resetState = useCallback(() => {
    setStep(1);
    setSearch("");
    setSelectedId(null);
    setStartDate(nextMonday());
    setConfirmReplace(false);
    setLoading(false);
    setSuccess(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    setIsOpen(false);
    setTimeout(resetState, 300);
  }, [loading, resetState]);

  // ── Event listener — opens modal on custom event
  useEffect(() => {
    function handleOpen() {
      setIsOpen(true);
    }
    document.addEventListener(OPEN_EVENT, handleOpen);
    return () => document.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  // ── Filtered program list
  const filtered = search.trim()
    ? blueprints.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.category.toLowerCase().includes(search.toLowerCase()),
      )
    : blueprints;

  function handleNext() {
    if (step === 1 && selectedId) setStep(2);
    else if (step === 2 && startDate) setStep(3);
  }

  function handleBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  async function handleAssign() {
    if (!selectedId || !startDate) return;
    if (hasActiveProgram && !confirmReplace) return;

    setLoading(true);
    setError(null);

    try {
      const result = await assignProgramAction({
        clientId,
        programTemplateId: selectedId,
        startDate,
        coachNotes: null,
      });

      if (result.ok) {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setTimeout(() => {
            resetState();
            router.refresh();
          }, 150);
        }, 1200);
      } else {
        setError(result.error ?? "Assignment failed. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 1 — CHOOSE PROGRAM
  // ─────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="flex flex-col gap-0">
        {blueprints.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-white/60">No published programs</p>
            <p className="mt-1 text-xs text-white/30">
              Create and publish a multi-week program in HQ → Programs first.
            </p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="mb-4">
              <Input
                type="text"
                tone="dark"
                placeholder="Search programs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search programs"
              />
            </div>

            {/* List */}
            <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 && search ? (
                <p className="py-8 text-center text-xs text-white/30">
                  No programs match &ldquo;{search}&rdquo;
                </p>
              ) : (
                filtered.map((bp) => {
                  const isSelected = selectedId === bp.id;
                  return (
                    <button
                      key={bp.id}
                      onClick={() => setSelectedId(bp.id)}
                      aria-pressed={isSelected}
                      className={`ds-focus-ring w-full rounded-lg border px-4 py-4 text-left transition-all duration-150 ${
                        isSelected
                          ? "border-[#C9A24D]/50 bg-[#C9A24D]/[0.06]"
                          : "border-white/[0.06] bg-[#0d0e0f] hover:border-white/[0.14] hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold leading-tight text-white">
                              {bp.name}
                            </span>
                            {isSelected && <Check size={12} strokeWidth={3} className="text-[#C9A24D]" />}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone="dark" variant="gold" size="sm">
                              {CATEGORY_LABEL[bp.category] ?? bp.category}
                            </Badge>
                            <span className="text-[10px] text-white/40">
                              {EXP_LABEL[bp.experienceLevel] ?? bp.experienceLevel}
                            </span>
                            {bp.recommendedDaysPerWeek && (
                              <>
                                <span className="text-white/15">·</span>
                                <span className="text-[10px] text-white/40">
                                  {bp.recommendedDaysPerWeek}d/wk
                                </span>
                              </>
                            )}
                          </div>
                          {bp.description && (
                            <p className="mt-1.5 line-clamp-1 text-[10px] leading-relaxed text-white/30">
                              {bp.description}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {bp.defaultDurationWeeks && (
                            <p className="text-sm font-bold leading-tight text-[#C9A24D]">
                              {bp.defaultDurationWeeks}w
                            </p>
                          )}
                          {bp.estimatedWeeklyMinutes && (
                            <p className="mt-0.5 text-[9px] text-white/30">
                              ~{bp.estimatedWeeklyMinutes}m/wk
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // STEP 2 — SET SCHEDULE
  // ─────────────────────────────────────────────────────────

  function renderStep2() {
    if (!selected) return null;
    return (
      <div className="space-y-6">
        {/* Selected program summary */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0c] px-4 py-3">
          <p className="text-sm font-semibold text-white">{selected.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="dark" variant="gold" size="sm">
              {CATEGORY_LABEL[selected.category] ?? selected.category}
            </Badge>
            <span className="text-[10px] text-white/40">
              {EXP_LABEL[selected.experienceLevel] ?? selected.experienceLevel}
            </span>
            {selected.defaultDurationWeeks && (
              <>
                <span className="text-white/15">·</span>
                <span className="text-[10px] text-white/40">
                  {selected.defaultDurationWeeks} weeks
                </span>
              </>
            )}
          </div>
        </div>

        {/* Start date */}
        <div>
          <Label htmlFor="assign-start-date" tone="dark">
            Start Date
          </Label>
          <Input
            id="assign-start-date"
            type="date"
            tone="dark"
            value={startDate}
            min={today()}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <HelperText tone="dark">Default: next Monday</HelperText>
        </div>

        {/* Calculated end date */}
        {startDate && (
          <div className="grid grid-cols-2 gap-4">
            {selected.defaultDurationWeeks && (
              <div className="rounded-lg border border-white/[0.05] bg-[#0a0b0c] px-4 py-3">
                <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Duration</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {selected.defaultDurationWeeks} weeks
                </p>
              </div>
            )}
            {endDate && (
              <div className="rounded-lg border border-white/[0.05] bg-[#0a0b0c] px-4 py-3">
                <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">
                  Projected End
                </p>
                <p className="mt-1 text-sm font-bold text-white">{fmtDate(endDate)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3 — PREVIEW & CONFIRM
  // ─────────────────────────────────────────────────────────

  function renderStep3() {
    if (!selected) return null;

    const trainingDays = selected.week1Preview;
    const trainingDayCount = trainingDays.length;

    return (
      <div className="space-y-6">
        {/* Assignment summary */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0b0c] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold leading-tight text-white">{selected.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone="dark" variant="gold" size="sm">
                  {CATEGORY_LABEL[selected.category] ?? selected.category}
                </Badge>
                <span className="text-[10px] text-white/40">
                  {EXP_LABEL[selected.experienceLevel] ?? selected.experienceLevel}
                </span>
              </div>
            </div>
            {selected.defaultDurationWeeks && (
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold text-[#C9A24D]">{selected.defaultDurationWeeks}</p>
                <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">weeks</p>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Starts</p>
              <p className="mt-0.5 text-xs font-semibold text-white">{fmtDate(startDate)}</p>
            </div>
            {endDate && (
              <div>
                <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Ends</p>
                <p className="mt-0.5 text-xs font-semibold text-white">{fmtDate(endDate)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Week 1 schedule */}
        <div>
          <p className="mb-3 text-[9px] uppercase tracking-[0.25em] text-white/30">
            Week 1 Schedule
          </p>
          <div className="grid grid-cols-7 gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
              const day = trainingDays.find((d) => d.dayOfWeek === dow);
              return (
                <div
                  key={dow}
                  className={`flex min-h-[68px] flex-col rounded-md border px-1 py-2.5 text-center ${
                    day
                      ? "border-[#C9A24D]/25 bg-[#C9A24D]/[0.05]"
                      : "border-white/[0.04] bg-[#0a0b0c]"
                  }`}
                >
                  <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">
                    {DAY_LETTER[dow]}
                  </p>
                  <div className="mt-1 flex flex-1 items-center justify-center">
                    {day ? (
                      <p className="line-clamp-3 break-all text-center text-[8px] leading-tight text-white/70">
                        {day.workoutName}
                      </p>
                    ) : (
                      <p className="text-[8px] text-white/15">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-4">
            <p className="text-[10px] text-white/40">
              {trainingDayCount} training day{trainingDayCount !== 1 ? "s" : ""} / week
            </p>
            {selected.estimatedWeeklyMinutes && (
              <>
                <span className="text-[10px] text-white/15">·</span>
                <p className="text-[10px] text-white/40">
                  ~{selected.estimatedWeeklyMinutes} min/week
                </p>
              </>
            )}
          </div>

          {trainingDays.length === 0 && (
            <p className="mt-2 text-[10px] text-amber-400/70">
              Week 1 has no workouts assigned yet. You can still assign the program.
            </p>
          )}
        </div>

        {/* Replace warning */}
        {hasActiveProgram && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-400">
                  Replacing Current Program
                </p>
                {activeProgramName && (
                  <p className="mt-0.5 text-[10px] text-white/40">
                    Current: <span className="text-white">{activeProgramName}</span>
                  </p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-white/40">
                  The active program will be archived. Historical workouts remain intact.
                </p>
                <label className="group mt-3 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-[#C9A24D]"
                  />
                  <span className="text-xs text-white/40 transition-colors duration-150 group-hover:text-white/70">
                    I understand — proceed with replacement
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] px-4 py-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // BOTTOM NAVIGATION
  // ─────────────────────────────────────────────────────────

  function renderNav() {
    const canProceed1 = !!selectedId && blueprints.length > 0;
    const canProceed2 = !!startDate;
    const canConfirm = !hasActiveProgram || confirmReplace;

    return (
      <div className="flex w-full items-center justify-between">
        {step > 1 ? (
          <Button variant="ghost" tone="dark" size="sm" onClick={handleBack} disabled={loading}>
            ← Back
          </Button>
        ) : (
          <Button variant="ghost" tone="dark" size="sm" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        )}

        <div className="flex items-center gap-3">
          {step < 3 && (
            <Button
              variant="secondary"
              tone="dark"
              onClick={handleNext}
              disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2) || loading}
            >
              {step === 1 ? "Next — Schedule" : "Next — Preview"}
            </Button>
          )}

          {step === 3 && (
            <Button
              variant="primary"
              tone="dark"
              onClick={handleAssign}
              disabled={!canConfirm || loading}
              loading={loading}
            >
              {loading ? "Assigning…" : "Assign Program"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // SUCCESS STATE
  // ─────────────────────────────────────────────────────────

  function renderSuccess() {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Check size={20} strokeWidth={3} className="text-emerald-400" />
        </div>
        <p className="mb-1 text-base font-bold text-white">Program Assigned</p>
        <p className="text-sm text-white/40">
          {selected?.name} starts {fmtDate(startDate)}.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      tone="dark"
      size="md"
      ariaLabel="Assign Program"
      title={hasActiveProgram ? "Replace Program" : "Assign Program"}
      description={
        success
          ? undefined
          : step === 1
          ? "Choose a program to assign"
          : step === 2
          ? "Set the program start date"
          : "Review and confirm the assignment"
      }
      footer={success ? undefined : renderNav()}
    >
      {success ? (
        renderSuccess()
      ) : (
        <>
          <StepIndicator step={step} />
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// DAY NAME EXPORT (used by ProgramTimeline)
// ─────────────────────────────────────────────────────────────
export { DAY_ABBR };
