"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Dumbbell,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import { Badge } from "@/components/ui";
import type {
  GeneratedBlueprintDraft,
  GeneratedPrescriptionDraft,
  GeneratedProgramDraft,
  GeneratedProgramDayDraft,
  ProgramGenerationBrief,
  ProgramGenerationClientOption,
} from "@/lib/program-generator/types";
import type { ExperienceLevel } from "@/lib/db/schema";

const EXPERIENCE_LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "competitive", "mixed"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SPLITS = ["Full body", "Upper / Lower", "Push / Pull / Legs", "Body part split", "Athletic performance", "Coach preference"];
const GENERATION_STAGES = [
  "Reading the Program brief",
  "Selecting existing Blueprint source material",
  "Building the weekly calendar",
  "Running Kynovant Insights preflight",
];

interface Props {
  clients: ProgramGenerationClientOption[];
}

interface ExerciseSearchResult {
  id: string;
  name: string;
}

type Step = "brief" | "generating" | "review" | "approved";

function fmtLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function prescriptionLabel(p: GeneratedPrescriptionDraft): string {
  const reps = p.repsMin && p.repsMax
    ? p.repsMin === p.repsMax ? `${p.repsMin}` : `${p.repsMin}-${p.repsMax}`
    : p.durationSeconds
      ? `${Math.round(p.durationSeconds / 60)} min`
      : "As written";
  const sets = p.sets ? `${p.sets} x ` : "";
  const rest = p.restSeconds ? `, ${p.restSeconds}s rest` : "";
  const effort = p.targetRpe ? `, RPE ${p.targetRpe}` : p.targetRir ? `, RIR ${p.targetRir}` : "";
  return `${sets}${reps}${rest}${effort}`;
}

function blankBrief(client?: ProgramGenerationClientOption | null): ProgramGenerationBrief {
  return {
    clientId: client?.id ?? null,
    clientName: client?.name ?? null,
    goal: "",
    weeks: 4,
    daysPerWeek: 3,
    preferredSplit: "Full body",
    experience: "intermediate",
    musclePriorities: [],
    equipment: [],
    limitations: [],
    excludedExercises: [],
    techniques: [],
    sessionDurationMinutes: 60,
    freeformInstructions: "",
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-[0.3em] text-white/35 font-semibold">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/[0.035] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-white/18 focus:outline-none focus:border-[#C9A24D]/45 ${props.className ?? ""}`}
    />
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <TextInput
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              e.preventDefault();
              onChange([...value, text.trim()]);
              setText("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) return;
            onChange([...value, text.trim()]);
            setText("");
          }}
          className="w-10 border border-white/[0.08] text-white/50 hover:text-[#C9A24D] hover:border-[#C9A24D]/30 transition-colors flex items-center justify-center"
          aria-label="Add item"
        >
          <Plus size={14} />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="inline-flex items-center gap-1 border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-white/55 hover:text-white/80"
            >
              {item}
              <X size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function findBlueprint(draft: GeneratedProgramDraft, id: string | null): GeneratedBlueprintDraft | null {
  if (!id) return null;
  return draft.blueprints.find((b) => b.id === id) ?? null;
}

function allPrescriptions(blueprint: GeneratedBlueprintDraft): GeneratedPrescriptionDraft[] {
  return [
    ...blueprint.sections.flatMap((section) => section.prescriptions),
    ...blueprint.unsectioned,
  ];
}

export default function ProgramGeneratorFlow({ clients }: Props) {
  const searchParams = useSearchParams();
  const initialClient = clients.find((c) => c.id === searchParams.get("clientId")) ?? null;
  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState<ProgramGenerationBrief>(() => blankBrief(initialClient));
  const [draft, setDraft] = useState<GeneratedProgramDraft | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<{ programId: string; programName: string; blueprintIds: string[] } | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [approvedName, setApprovedName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState<{
    blueprintId: string;
    prescriptionId: string;
    query: string;
    results: ExerciseSearchResult[];
    loading: boolean;
  } | null>(null);

  const selectedClient = clients.find((c) => c.id === brief.clientId) ?? null;
  const currentWeek = draft?.weeks.find((w) => w.weekNumber === selectedWeek) ?? draft?.weeks[0] ?? null;
  const blockers = draft?.findings.filter((f) => f.severity === "blocker") ?? [];
  const warnings = draft?.findings.filter((f) => f.severity === "warning") ?? [];
  const assignedDays = draft?.weeks.flatMap((w) => w.days).filter((d) => d.blueprintId).length ?? 0;
  const exerciseCount = draft?.blueprints.reduce((sum, b) => sum + allPrescriptions(b).length, 0) ?? 0;

  const canGenerate = brief.goal.trim().length > 0;
  const canApprove = !!draft && blockers.length === 0 && approvalChecked && !approving;

  const updateBrief = <K extends keyof ProgramGenerationBrief>(key: K, value: ProgramGenerationBrief[K]) => {
    setBrief((prev) => ({ ...prev, [key]: value }));
  };

  async function generateDraft() {
    if (!canGenerate) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("generating");
    setError(null);
    setStageIndex(0);
    const timer = window.setInterval(() => {
      setStageIndex((idx) => Math.min(idx + 1, GENERATION_STAGES.length - 1));
    }, 700);

    try {
      const res = await fetch("/api/internal/program-generator/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Generation failed.");
      setDraft(json.draft);
      setApprovedName(json.draft.name);
      setSelectedWeek(1);
      setStep("review");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Generation failed.");
      setStep("brief");
    } finally {
      window.clearInterval(timer);
      abortRef.current = null;
    }
  }

  function cancelGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("brief");
  }

  function mutateDraft(mutator: (draft: GeneratedProgramDraft) => GeneratedProgramDraft) {
    setDraft((prev) => (prev ? mutator(prev) : prev));
  }

  function updatePrescription(blueprintId: string, prescriptionId: string, patch: Partial<GeneratedPrescriptionDraft>) {
    mutateDraft((prev) => ({
      ...prev,
      blueprints: prev.blueprints.map((bp) => {
        if (bp.id !== blueprintId) return bp;
        return {
          ...bp,
          sections: bp.sections.map((section) => ({
            ...section,
            prescriptions: section.prescriptions.map((p) => p.id === prescriptionId ? { ...p, ...patch } : p),
          })),
          unsectioned: bp.unsectioned.map((p) => p.id === prescriptionId ? { ...p, ...patch } : p),
        };
      }),
      auditTrail: [...prev.auditTrail, `Coach edited prescription ${prescriptionId}.`],
    }));
  }

  function reorderPrescription(blueprintId: string, prescriptionId: string, direction: "up" | "down") {
    mutateDraft((prev) => ({
      ...prev,
      blueprints: prev.blueprints.map((bp) => {
        if (bp.id !== blueprintId) return bp;
        return {
          ...bp,
          sections: bp.sections.map((section) => {
            const idx = section.prescriptions.findIndex((p) => p.id === prescriptionId);
            if (idx === -1) return section;
            const swapIdx = direction === "up" ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= section.prescriptions.length) return section;
            const next = [...section.prescriptions];
            [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
            return { ...section, prescriptions: next };
          }),
        };
      }),
      auditTrail: [...prev.auditTrail, `Coach reordered prescription ${prescriptionId}.`],
    }));
  }

  function moveWorkoutDay(weekNumber: number, day: GeneratedProgramDayDraft, targetDayOfWeek: number) {
    mutateDraft((prev) => ({
      ...prev,
      weeks: prev.weeks.map((week) => {
        if (week.weekNumber !== weekNumber) return week;
        const moving = week.days.find((d) => d.id === day.id);
        const target = week.days.find((d) => d.dayOfWeek === targetDayOfWeek);
        if (!moving || !target || moving.dayOfWeek === target.dayOfWeek) return week;
        return {
          ...week,
          days: week.days.map((d) => {
            if (d.id === moving.id) {
              return { ...d, blueprintId: target.blueprintId, restDay: !target.blueprintId, notes: target.notes, label: target.label };
            }
            if (d.id === target.id) {
              return { ...d, blueprintId: moving.blueprintId, restDay: !moving.blueprintId, notes: moving.notes, label: moving.label };
            }
            return d;
          }),
        };
      }),
      auditTrail: [...prev.auditTrail, `Coach moved Week ${weekNumber} workout from ${DAYS[day.dayOfWeek - 1]} to ${DAYS[targetDayOfWeek - 1]}.`],
    }));
  }

  async function runExerciseSearch() {
    if (!exerciseSearch?.query.trim()) return;
    setExerciseSearch((prev) => prev ? { ...prev, loading: true } : prev);
    try {
      const res = await fetch(`/api/internal/exercises/search?q=${encodeURIComponent(exerciseSearch.query)}&limit=8`);
      const json = await res.json();
      setExerciseSearch((prev) => prev ? {
        ...prev,
        loading: false,
        results: Array.isArray(json.exercises) ? json.exercises.map((e: ExerciseSearchResult) => ({ id: e.id, name: e.name })) : [],
      } : prev);
    } catch {
      setExerciseSearch((prev) => prev ? { ...prev, loading: false, results: [] } : prev);
    }
  }

  async function approveDraft() {
    if (!draft || !canApprove) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/program-generator/drafts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, approvedName }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Approval failed.");
      setApproved(json.result);
      setStep("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  }

  const reviewSummary = useMemo(() => {
    if (!draft) return [];
    return [
      { label: "Weeks", value: draft.brief.weeks },
      { label: "Training Days", value: assignedDays },
      { label: "Draft Blueprints", value: draft.blueprints.length },
      { label: "Exercises", value: exerciseCount },
    ];
  }, [draft, assignedDays, exerciseCount]);

  return (
    <div className="max-w-[1280px] space-y-8">
      <HQBreadcrumbs crumbs={[
        { label: "Overview", href: "/hq" },
        { label: "Programs", href: "/hq/programs" },
        { label: "AI Generator" },
      ]} />

      <HQPageHeader
        title="AI Program Generator"
        subtitle="Create a multi-week draft from a coach brief, review every Blueprint, then approve it into the manual Program workflow."
        action={
          <Link
            href="/hq/programs"
            className="inline-flex items-center gap-2 border border-white/[0.08] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45 hover:text-white/70 hover:border-white/[0.16] transition-colors"
          >
            <ArrowLeft size={13} />
            Programs
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <aside className="space-y-2">
          {[
            ["brief", "Program Brief"],
            ["generating", "Generation"],
            ["review", "Draft Review"],
            ["approved", "Approval"],
          ].map(([key, label], idx) => {
            const active = step === key;
            const complete = (idx === 0 && draft) || (idx === 1 && draft) || (idx === 2 && step === "approved");
            return (
              <div
                key={key}
                className={`border px-3 py-3 text-xs ${active ? "border-[#C9A24D]/35 bg-[#C9A24D]/[0.06] text-white" : complete ? "border-emerald-500/15 bg-emerald-500/[0.03] text-white/55" : "border-white/[0.06] text-white/25"}`}
              >
                <div className="flex items-center gap-2">
                  {complete ? <CheckCircle2 size={14} className="text-emerald-400/70" /> : <span className="w-3.5 h-3.5 border border-current" />}
                  <span className="font-semibold">{label}</span>
                </div>
              </div>
            );
          })}
        </aside>

        <main className="min-w-0">
          {error && (
            <div className="mb-5 border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-300 flex items-center gap-2">
              <AlertTriangle size={15} />
              {error}
            </div>
          )}

          {step === "brief" && (
            <section className="border border-white/[0.07] bg-white/[0.025]">
              <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-white text-lg font-semibold">Program Brief</h2>
                  <p className="text-white/35 text-sm mt-1">Program means the multi-week plan. Blueprint means one reusable workout template.</p>
                </div>
                <Badge tone="dark" variant="warning" size="sm">Coach review required</Badge>
              </div>

              <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <FieldLabel>Client</FieldLabel>
                    <div className="relative">
                      <select
                        value={brief.clientId ?? ""}
                        onChange={(e) => {
                          const client = clients.find((c) => c.id === e.target.value) ?? null;
                          updateBrief("clientId", client?.id ?? null);
                          updateBrief("clientName", client?.name ?? null);
                        }}
                        className="w-full appearance-none bg-white/[0.035] border border-white/[0.08] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C9A24D]/45"
                      >
                        <option value="">No client selected</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>{client.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-white/25 pointer-events-none" />
                    </div>
                    {selectedClient?.activeProgramName && (
                      <p className="text-[11px] text-white/30">Active Program: {selectedClient.activeProgramName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <FieldLabel>Goal</FieldLabel>
                    <TextInput
                      value={brief.goal}
                      placeholder="Strength base, hypertrophy, return to training..."
                      onChange={(e) => updateBrief("goal", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <FieldLabel>Weeks</FieldLabel>
                      <TextInput
                        type="number"
                        min={1}
                        max={16}
                        value={brief.weeks}
                        onChange={(e) => updateBrief("weeks", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Days / Week</FieldLabel>
                      <TextInput
                        type="number"
                        min={1}
                        max={7}
                        value={brief.daysPerWeek}
                        onChange={(e) => updateBrief("daysPerWeek", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <FieldLabel>Preferred Split</FieldLabel>
                      <select
                        value={brief.preferredSplit ?? ""}
                        onChange={(e) => updateBrief("preferredSplit", e.target.value)}
                        className="w-full bg-white/[0.035] border border-white/[0.08] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C9A24D]/45"
                      >
                        {SPLITS.map((split) => <option key={split}>{split}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Experience</FieldLabel>
                      <select
                        value={brief.experience}
                        onChange={(e) => updateBrief("experience", e.target.value as ExperienceLevel)}
                        className="w-full bg-white/[0.035] border border-white/[0.08] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C9A24D]/45"
                      >
                        {EXPERIENCE_LEVELS.map((level) => <option key={level} value={level}>{fmtLabel(level)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FieldLabel>Session Duration</FieldLabel>
                    <TextInput
                      type="number"
                      min={20}
                      max={150}
                      value={brief.sessionDurationMinutes ?? ""}
                      onChange={(e) => updateBrief("sessionDurationMinutes", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <FieldLabel>Muscle Priorities</FieldLabel>
                    <TagInput value={brief.musclePriorities} onChange={(v) => updateBrief("musclePriorities", v)} placeholder="Add priority" />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Equipment</FieldLabel>
                    <TagInput value={brief.equipment} onChange={(v) => updateBrief("equipment", v)} placeholder="Add equipment" />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Limitations</FieldLabel>
                    <TagInput value={brief.limitations} onChange={(v) => updateBrief("limitations", v)} placeholder="Add limitation" />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Excluded Exercises</FieldLabel>
                    <TagInput value={brief.excludedExercises} onChange={(v) => updateBrief("excludedExercises", v)} placeholder="Add excluded exercise" />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Techniques</FieldLabel>
                    <TagInput value={brief.techniques} onChange={(v) => updateBrief("techniques", v)} placeholder="Tempo, supersets, top sets..." />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Freeform Instructions</FieldLabel>
                    <textarea
                      value={brief.freeformInstructions ?? ""}
                      onChange={(e) => updateBrief("freeformInstructions", e.target.value)}
                      className="min-h-[112px] w-full resize-y bg-white/[0.035] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-white/18 focus:outline-none focus:border-[#C9A24D]/45"
                      placeholder="Add context, progression preferences, recovery constraints, or client-specific coaching notes."
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-white/30">No Program or Blueprint records are created until coach approval.</p>
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={!canGenerate}
                  className="inline-flex items-center justify-center gap-2 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.28em] uppercase px-5 py-3 hover:bg-[#D4B56A] disabled:opacity-35 disabled:hover:bg-[#C9A24D] transition-colors"
                >
                  <Sparkles size={14} />
                  Generate Draft
                </button>
              </div>
            </section>
          )}

          {step === "generating" && (
            <section className="border border-white/[0.07] bg-white/[0.025] p-8">
              <div className="flex items-center gap-3 mb-6">
                <Loader2 size={22} className="text-[#C9A24D] animate-spin" />
                <div>
                  <h2 className="text-white text-lg font-semibold">Preparing Program draft</h2>
                  <p className="text-white/35 text-sm">The provider is generating a reviewable draft. Nothing will be published or assigned.</p>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {GENERATION_STAGES.map((stage, idx) => (
                  <div key={stage} className={`border px-3 py-3 text-sm ${idx <= stageIndex ? "border-[#C9A24D]/25 bg-[#C9A24D]/[0.04] text-white/70" : "border-white/[0.06] text-white/25"}`}>
                    {stage}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={cancelGeneration}
                className="border border-white/[0.08] px-4 py-2 text-[10px] uppercase tracking-[0.28em] text-white/45 hover:text-white/70 hover:border-white/[0.16]"
              >
                Cancel
              </button>
            </section>
          )}

          {step === "review" && draft && currentWeek && (
            <section className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {reviewSummary.map((item) => (
                  <div key={item.label} className="border border-white/[0.07] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-white/28">{item.label}</p>
                    <p className="text-2xl text-white font-semibold mt-2">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
                <div className="space-y-5 min-w-0">
                  <div className="border border-white/[0.07] bg-white/[0.025]">
                    <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-white font-semibold">{draft.name}</h2>
                        <p className="text-xs text-white/30">{draft.modelLabel} · {new Date(draft.generatedAt).toLocaleString()}</p>
                      </div>
                      <Badge tone="dark" variant={draft.validationState === "blocked" ? "danger" : draft.validationState === "warnings" ? "warning" : "success"} size="sm">
                        {draft.validationState}
                      </Badge>
                    </div>

                    <div className="p-4">
                      <div className="flex gap-2 overflow-x-auto pb-3">
                        {draft.weeks.map((week) => (
                          <button
                            key={week.id}
                            type="button"
                            onClick={() => setSelectedWeek(week.weekNumber)}
                            className={`shrink-0 px-3 py-2 text-[10px] uppercase tracking-[0.25em] border ${selectedWeek === week.weekNumber ? "border-[#C9A24D]/35 bg-[#C9A24D]/[0.06] text-[#C9A24D]" : "border-white/[0.08] text-white/35 hover:text-white/60"}`}
                          >
                            Week {week.weekNumber}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                        {currentWeek.days.map((day) => {
                          const blueprint = findBlueprint(draft, day.blueprintId);
                          return (
                            <div key={day.id} className={`min-h-[128px] border p-3 ${blueprint ? "border-white/[0.09] bg-white/[0.035]" : "border-white/[0.045] bg-black/10"}`}>
                              <p className="text-[10px] uppercase tracking-[0.25em] text-white/25 mb-2">{DAYS[day.dayOfWeek - 1]}</p>
                              {blueprint ? (
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-sm text-white font-medium leading-snug">{blueprint.name}</p>
                                    <p className="text-[11px] text-white/35 mt-1">{blueprint.primaryFocus || "Workout"} · {blueprint.estimatedDurationMinutes ?? "TBD"} min</p>
                                  </div>
                                  <select
                                    value={day.dayOfWeek}
                                    onChange={(e) => moveWorkoutDay(currentWeek.weekNumber, day, Number(e.target.value))}
                                    className="w-full bg-black/30 border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/55"
                                    aria-label="Move workout day"
                                  >
                                    {DAYS.map((label, idx) => <option key={label} value={idx + 1}>Move to {label}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    disabled
                                    title="Regeneration requires an AI provider connection."
                                    className="w-full border border-white/[0.06] px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/18 cursor-not-allowed"
                                  >
                                    Regenerate Day
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm text-white/20">Rest</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 space-y-2">
                        <FieldLabel>Progression Notes</FieldLabel>
                        <textarea
                          value={currentWeek.notes ?? ""}
                          onChange={(e) => mutateDraft((prev) => ({
                            ...prev,
                            weeks: prev.weeks.map((week) => week.weekNumber === currentWeek.weekNumber ? { ...week, notes: e.target.value } : week),
                            auditTrail: [...prev.auditTrail, `Coach modified Week ${currentWeek.weekNumber} progression notes.`],
                          }))}
                          className="min-h-[76px] w-full bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A24D]/40"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentWeek.days.map((day) => {
                      const blueprint = findBlueprint(draft, day.blueprintId);
                      if (!blueprint) return null;
                      return (
                        <div key={day.id} className="border border-white/[0.07] bg-white/[0.025]">
                          <div className="border-b border-white/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <p className="text-white font-semibold">{DAYS[day.dayOfWeek - 1]} · {blueprint.name}</p>
                              <p className="text-xs text-white/30">{blueprint.sections.length} sections · {allPrescriptions(blueprint).length} exercises</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-white/30">
                              <Clock size={13} />
                              {blueprint.estimatedDurationMinutes ?? "TBD"} min
                            </div>
                          </div>

                          <div className="p-4 space-y-4">
                            {blueprint.sections.map((section) => (
                              <div key={section.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Dumbbell size={14} className="text-[#C9A24D]/70" />
                                  <p className="text-sm text-white/75 font-medium">{section.name}</p>
                                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">{fmtLabel(section.sectionType)}</span>
                                </div>
                                <div className="space-y-2">
                                  {section.prescriptions.map((p, idx) => (
                                    <div key={p.id} className="border border-white/[0.055] bg-black/15 p-3">
                                      <div className="flex flex-col xl:flex-row xl:items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-white/80 font-medium">{p.exerciseName}</p>
                                          <p className="text-xs text-white/30 mt-1">{prescriptionLabel(p)}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          <button type="button" onClick={() => reorderPrescription(blueprint.id, p.id, "up")} disabled={idx === 0} className="border border-white/[0.08] px-2 py-1 text-[10px] text-white/40 disabled:opacity-25">Up</button>
                                          <button type="button" onClick={() => reorderPrescription(blueprint.id, p.id, "down")} disabled={idx === section.prescriptions.length - 1} className="border border-white/[0.08] px-2 py-1 text-[10px] text-white/40 disabled:opacity-25">Down</button>
                                          <button type="button" onClick={() => setExerciseSearch({ blueprintId: blueprint.id, prescriptionId: p.id, query: "", results: [], loading: false })} className="border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:text-[#C9A24D]">Replace</button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
                                        <TextInput type="number" value={p.sets ?? ""} placeholder="Sets" onChange={(e) => updatePrescription(blueprint.id, p.id, { sets: e.target.value ? Number(e.target.value) : null })} />
                                        <TextInput type="number" value={p.repsMin ?? ""} placeholder="Min reps" onChange={(e) => updatePrescription(blueprint.id, p.id, { repsMin: e.target.value ? Number(e.target.value) : null })} />
                                        <TextInput type="number" value={p.repsMax ?? ""} placeholder="Max reps" onChange={(e) => updatePrescription(blueprint.id, p.id, { repsMax: e.target.value ? Number(e.target.value) : null })} />
                                        <TextInput type="number" value={p.restSeconds ?? ""} placeholder="Rest sec" onChange={(e) => updatePrescription(blueprint.id, p.id, { restSeconds: e.target.value ? Number(e.target.value) : null })} />
                                        <TextInput value={p.targetRpe ?? ""} placeholder="RPE" onChange={(e) => updatePrescription(blueprint.id, p.id, { targetRpe: e.target.value || null })} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside className="space-y-5">
                  <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck size={16} className="text-[#C9A24D]/70" />
                      <h3 className="text-sm text-white font-semibold">Kynovant Insights</h3>
                    </div>
                    <div className="space-y-2">
                      {draft.findings.map((finding) => (
                        <div key={finding.id} className={`border px-3 py-2.5 ${finding.severity === "blocker" ? "border-red-500/20 bg-red-500/[0.04]" : finding.severity === "warning" ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-white/[0.06] bg-black/10"}`}>
                          <p className="text-sm text-white/75 font-medium">{finding.title}</p>
                          <p className="text-xs text-white/35 mt-1 leading-relaxed">{finding.detail}</p>
                          {finding.evidence && <p className="text-[11px] text-white/25 mt-1">{finding.evidence}</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-white/[0.07] bg-white/[0.025] p-4">
                    <h3 className="text-sm text-white font-semibold mb-3">Version & Audit</h3>
                    <div className="space-y-2 text-xs text-white/35">
                      <p>Generated by: {draft.generatedBy.slice(0, 8)}</p>
                      <p>Provider: {draft.provider}</p>
                      <p>Generated: {new Date(draft.generatedAt).toLocaleString()}</p>
                    </div>
                    <div className="mt-4 space-y-2">
                      {draft.auditTrail.slice(-5).map((item, idx) => (
                        <div key={`${item}-${idx}`} className="border-l border-[#C9A24D]/25 pl-3 text-xs text-white/35">{item}</div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-white/[0.07] bg-white/[0.025] p-4 space-y-3">
                    <h3 className="text-sm text-white font-semibold">Approval</h3>
                    <div className="space-y-2">
                      <FieldLabel>Program Name</FieldLabel>
                      <TextInput value={approvedName} onChange={(e) => setApprovedName(e.target.value)} />
                    </div>
                    <label className="flex items-start gap-2 text-xs text-white/45 leading-relaxed">
                      <input
                        type="checkbox"
                        checked={approvalChecked}
                        onChange={(e) => setApprovalChecked(e.target.checked)}
                        className="mt-0.5"
                      />
                      I reviewed this generated draft and approve creating draft Program and Blueprint records.
                    </label>
                    <button
                      type="button"
                      disabled={!canApprove}
                      onClick={approveDraft}
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.24em] uppercase px-4 py-3 hover:bg-[#D4B56A] disabled:opacity-35 transition-colors"
                    >
                      {approving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Approve Draft
                    </button>
                    <p className="text-[11px] text-white/25 leading-relaxed">Client assignment remains available after publishing because existing assignment rules require published Programs.</p>
                  </div>
                </aside>
              </div>
            </section>
          )}

          {step === "approved" && approved && (
            <section className="border border-emerald-500/20 bg-emerald-500/[0.035] p-8">
              <CheckCircle2 size={26} className="text-emerald-400/75 mb-4" />
              <h2 className="text-white text-xl font-semibold">Draft Program created</h2>
              <p className="text-white/40 text-sm mt-2 max-w-2xl">
                {approved.programName} is now a normal Kynovant draft Program with {approved.blueprintIds.length} draft Blueprint{approved.blueprintIds.length === 1 ? "" : "s"}. Publish from Program Builder before assigning it to a client.
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <Link href={`/hq/programs/${approved.programId}`} className="inline-flex items-center gap-2 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.25em] uppercase px-4 py-3">
                  Open Program Builder
                  <ArrowRight size={13} />
                </Link>
                <Link href="/hq/programs/generate" className="inline-flex items-center gap-2 border border-white/[0.08] text-white/45 hover:text-white/70 px-4 py-3 text-[10px] tracking-[0.25em] uppercase">
                  New Draft
                </Link>
              </div>
            </section>
          )}
        </main>
      </div>

      {exerciseSearch && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg border border-white/[0.09] bg-[#08090A] shadow-2xl">
            <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
              <h3 className="text-white font-semibold">Replace Exercise</h3>
              <button type="button" onClick={() => setExerciseSearch(null)} className="text-white/35 hover:text-white/65">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <TextInput
                  value={exerciseSearch.query}
                  onChange={(e) => setExerciseSearch({ ...exerciseSearch, query: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runExerciseSearch();
                  }}
                  placeholder="Search exercise library"
                />
                <button type="button" onClick={runExerciseSearch} className="w-11 border border-white/[0.08] flex items-center justify-center text-white/45 hover:text-[#C9A24D]">
                  {exerciseSearch.loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {exerciseSearch.results.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => {
                      updatePrescription(exerciseSearch.blueprintId, exerciseSearch.prescriptionId, {
                        exerciseId: exercise.id,
                        exerciseName: exercise.name,
                      });
                      setExerciseSearch(null);
                    }}
                    className="w-full text-left border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-sm text-white/65 hover:border-[#C9A24D]/30 hover:text-white"
                  >
                    {exercise.name}
                  </button>
                ))}
                {!exerciseSearch.loading && exerciseSearch.query && exerciseSearch.results.length === 0 && (
                  <p className="text-sm text-white/30 py-4 text-center">No matching active exercises found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
