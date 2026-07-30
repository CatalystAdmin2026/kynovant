"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────
// CLIENT-SIDE TYPES (mirror the API response shape)
// ─────────────────────────────────────────────────────────────

export interface TemplateData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  primaryFocus: string | null;
  recommendedExperienceLevel: string;
  estimatedDurationMinutes: number | null;
  status: string;
  objective: string | null;
  coachingMethodology: string | null;
  defaultSetStyle: string | null;
  minimumDaysPerWeek: number | null;
  maximumDaysPerWeek: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionData {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sectionId: string | null;
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  targetRpe: string | null;
  targetRir: string | null;
  setTechnique: string | null;
  groupId: string | null;
  groupPosition: number | null;
  coachNotes: string | null;
  isRequired: boolean;
  substitutionPolicy: string | null;
}

export interface SectionData {
  section: {
    id: string;
    name: string;
    sectionType: string;
    orderIndex: number;
    estimatedMinutes: number | null;
    notes: string | null;
  };
  prescriptions: PrescriptionData[];
}

export interface BlueprintData {
  template: TemplateData;
  sections: SectionData[];
  unsectioned: PrescriptionData[];
}

interface ExerciseResult {
  id: string;
  name: string;
  slug: string;
  classification: string;
  movementPattern: string;
  difficulty: string;
  resistanceType: string | null;
  primaryMuscleGroup: string | null;
  fatigueCost: number | null;
  defaultPrescription?: {
    sets?: number | null;
    repsMin?: number | null;
    repsMax?: number | null;
    targetRpe?: number | null;
    restSeconds?: number | null;
  } | null;
  // Coach override prescription resolved server-side; falls back to defaultPrescription.
  effectivePrescription?: {
    sets?: number | null;
    repsMin?: number | null;
    repsMax?: number | null;
    targetRpe?: number | null;
    restSeconds?: number | null;
  } | null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    templateId: string;
    templateName: string;
    sectionCount: number;
    exerciseCount: number;
    groupCount: number;
    estimatedMinutes: number | null;
  };
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const SECTION_TYPES = [
  "warmup", "activation", "potentiation", "main_lift",
  "accessory", "conditioning", "finisher", "cooldown",
  "rest_period",
] as const;

const SET_TECHNIQUES = [
  "straight_set", "superset", "triset", "giant_set",
  "drop_set", "mechanical_drop_set", "tension_drop_set",
  "rest_pause", "cluster_set", "myo_reps", "lengthened_partials",
  "stretch_mediated_finisher", "tempo_set", "isometric", "circuit",
] as const;

const GROUPED_TECHNIQUES = new Set([
  "superset", "triset", "giant_set", "circuit",
]);

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusCls(s: string) {
  if (s === "active") return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (s === "archived") return "bg-gray-500/10 text-gray-500 border border-gray-500/20";
  return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
}

// Group colors for superset/triset visualization
const GROUP_COLORS = [
  "border-l-violet-500", "border-l-cyan-500", "border-l-pink-500",
  "border-l-lime-500",   "border-l-orange-500", "border-l-sky-500",
];
function groupColor(groupId: string, groupIndex: number): string {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length];
}

// Exercise picker row — used in both Recently Used and search results
function ExercisePickerRow({
  exercise,
  onAdd,
}: {
  exercise: ExerciseResult;
  onAdd: (ex: ExerciseResult) => void;
}) {
  const fatigueDots = exercise.fatigueCost != null
    ? Math.round((exercise.fatigueCost / 10) * 5)
    : null;

  return (
    <button
      onClick={() => onAdd(exercise)}
      className="w-full text-left px-3 py-2 hover:bg-white/[0.03] transition-colors flex items-center gap-3 border-b border-white/[0.04] last:border-0"
    >
      <div className="flex-1 min-w-0">
        <span className="text-white text-xs font-medium block truncate">{exercise.name}</span>
        <span className="text-gray-600 text-[10px]">
          {exercise.primaryMuscleGroup ? fmtLabel(exercise.primaryMuscleGroup) + " · " : ""}
          {fmtLabel(exercise.classification)}
        </span>
      </div>
      {fatigueDots !== null && (
        <span className="flex gap-0.5 shrink-0" title={`Fatigue: ${exercise.fatigueCost}/10`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`w-1 h-1 rounded-full ${i < fatigueDots ? "bg-[#C9A24D]/60" : "bg-white/10"}`} />
          ))}
        </span>
      )}
      <a
        href={`/hq/exercises/${exercise.id}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-gray-700 hover:text-gray-400 text-[9px] uppercase tracking-[0.2em] shrink-0"
        title="Open in Library"
      >
        ↗
      </a>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700 resize-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRESCRIPTION ROW
// ─────────────────────────────────────────────────────────────

function PrescriptionRow({
  prescription,
  templateId,
  groupIndex,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
}: {
  prescription: PrescriptionData;
  templateId: string;
  groupIndex: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updated: PrescriptionData) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local form state
  const [form, setForm] = useState({
    sets: prescription.sets?.toString() ?? "",
    repsMin: prescription.repsMin?.toString() ?? "",
    repsMax: prescription.repsMax?.toString() ?? "",
    durationSeconds: prescription.durationSeconds?.toString() ?? "",
    restSeconds: prescription.restSeconds?.toString() ?? "",
    tempo: prescription.tempo ?? "",
    targetRpe: prescription.targetRpe ?? "",
    targetRir: prescription.targetRir ?? "",
    setTechnique: prescription.setTechnique ?? "",
    groupId: prescription.groupId ?? "",
    groupPosition: prescription.groupPosition?.toString() ?? "",
    coachNotes: prescription.coachNotes ?? "",
    isRequired: prescription.isRequired,
    substitutionPolicy: prescription.substitutionPolicy ?? "",
  });

  const isGrouped = GROUPED_TECHNIQUES.has(form.setTechnique);
  const groupColorClass = prescription.groupId ? groupColor(prescription.groupId, groupIndex) : "";

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/internal/workout-templates/${templateId}/exercises/${prescription.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sets: form.sets ? parseInt(form.sets, 10) : null,
            repsMin: form.repsMin ? parseInt(form.repsMin, 10) : null,
            repsMax: form.repsMax ? parseInt(form.repsMax, 10) : null,
            durationSeconds: form.durationSeconds ? parseInt(form.durationSeconds, 10) : null,
            restSeconds: form.restSeconds ? parseInt(form.restSeconds, 10) : null,
            tempo: form.tempo || null,
            targetRpe: form.targetRpe || null,
            targetRir: form.targetRir || null,
            setTechnique: form.setTechnique || null,
            groupId: isGrouped ? (form.groupId || crypto.randomUUID()) : null,
            groupPosition: form.groupPosition ? parseInt(form.groupPosition, 10) : null,
            coachNotes: form.coachNotes || null,
            isRequired: form.isRequired,
            substitutionPolicy: form.substitutionPolicy || null,
          }),
        },
      );
      const data = await res.json() as { ok: boolean; prescription?: PrescriptionData };
      if (data.ok && data.prescription) {
        onUpdate({ ...data.prescription, exerciseName: prescription.exerciseName });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove "${prescription.exerciseName}" from this blueprint?`)) return;
    await fetch(
      `/api/internal/workout-templates/${templateId}/exercises/${prescription.id}`,
      { method: "DELETE" },
    );
    onDelete(prescription.id);
  }

  return (
    <div className={`border-l-2 ${groupColorClass || "border-l-white/[0.08]"} bg-[#0a0b0c] border border-white/[0.05] border-l-0 mb-1`}>
      {/* Compact row */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((x) => !x)}
      >
        <div className="flex flex-col gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onMove(prescription.id, "up"); }}
            disabled={isFirst}
            className="text-gray-700 hover:text-gray-400 disabled:opacity-20 text-[10px] leading-none transition-colors"
          >
            ▲
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(prescription.id, "down"); }}
            disabled={isLast}
            className="text-gray-700 hover:text-gray-400 disabled:opacity-20 text-[10px] leading-none transition-colors"
          >
            ▼
          </button>
        </div>

        <span className="text-white text-xs font-medium flex-1 min-w-0 truncate">
          {prescription.exerciseName}
        </span>

        {/* Quick summary */}
        <div className="flex items-center gap-3 text-gray-500 text-[11px] shrink-0">
          {prescription.sets && (
            <span>{prescription.sets} × {prescription.repsMin ?? "?"}{prescription.repsMax ? `–${prescription.repsMax}` : ""}</span>
          )}
          {prescription.restSeconds && (
            <span>{prescription.restSeconds}s rest</span>
          )}
          {prescription.targetRpe && (
            <span>RPE {prescription.targetRpe}</span>
          )}
          {prescription.setTechnique && prescription.setTechnique !== "straight_set" && (
            <span className="text-[#C9A24D] text-[10px]">{fmtLabel(prescription.setTechnique)}</span>
          )}
        </div>

        <span className="text-gray-700 text-[10px]">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.04]">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
            <Input
              label="Sets"
              value={form.sets}
              onChange={(v) => setForm((f) => ({ ...f, sets: v }))}
              type="number"
              placeholder="3"
            />
            <Input
              label="Reps Min"
              value={form.repsMin}
              onChange={(v) => setForm((f) => ({ ...f, repsMin: v }))}
              type="number"
              placeholder="8"
            />
            <Input
              label="Reps Max"
              value={form.repsMax}
              onChange={(v) => setForm((f) => ({ ...f, repsMax: v }))}
              type="number"
              placeholder="12"
            />
            <Input
              label="Duration (s)"
              value={form.durationSeconds}
              onChange={(v) => setForm((f) => ({ ...f, durationSeconds: v }))}
              type="number"
              placeholder="60"
            />
            <Input
              label="Rest (s)"
              value={form.restSeconds}
              onChange={(v) => setForm((f) => ({ ...f, restSeconds: v }))}
              type="number"
              placeholder="90"
            />
            <Input
              label="Tempo"
              value={form.tempo}
              onChange={(v) => setForm((f) => ({ ...f, tempo: v }))}
              placeholder="3010"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <Input
              label="Target RPE"
              value={form.targetRpe}
              onChange={(v) => setForm((f) => ({ ...f, targetRpe: v }))}
              placeholder="8"
            />
            <Input
              label="Target RIR"
              value={form.targetRir}
              onChange={(v) => setForm((f) => ({ ...f, targetRir: v }))}
              placeholder="2"
            />
            <Select
              label="Set Technique"
              value={form.setTechnique}
              onChange={(v) => {
                const newGroupId = GROUPED_TECHNIQUES.has(v) && !form.groupId
                  ? crypto.randomUUID()
                  : form.groupId;
                setForm((f) => ({ ...f, setTechnique: v, groupId: newGroupId ?? "" }));
              }}
              options={[
                { value: "", label: "— None —" },
                ...SET_TECHNIQUES.map((t) => ({ value: t, label: fmtLabel(t) })),
              ]}
            />
            <Select
              label="Substitution"
              value={form.substitutionPolicy}
              onChange={(v) => setForm((f) => ({ ...f, substitutionPolicy: v }))}
              options={[
                { value: "", label: "— Default —" },
                { value: "flexible", label: "Flexible" },
                { value: "strict", label: "Strict" },
                { value: "coach_review", label: "Coach Review" },
                { value: "no_substitute", label: "No Substitute" },
              ]}
            />
          </div>

          {isGrouped && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-[0.35em] mb-1">
                  Group ID (shared with superset partners)
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.groupId}
                    onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
                    className="flex-1 bg-[#080909] border border-white/[0.08] text-gray-400 px-3 py-2 text-[10px] font-mono focus:outline-none focus:border-[#C9A24D]/40"
                    placeholder="auto-generated UUID"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, groupId: crypto.randomUUID() }))}
                    className="text-[10px] text-gray-600 border border-white/[0.06] px-2 hover:text-gray-400 transition-colors whitespace-nowrap"
                  >
                    New Group
                  </button>
                </div>
                <p className="text-gray-700 text-[10px] mt-1">
                  Copy this UUID to other exercises to group them into the same superset.
                </p>
              </div>
              <Input
                label="Position in Group"
                value={form.groupPosition}
                onChange={(v) => setForm((f) => ({ ...f, groupPosition: v }))}
                type="number"
                placeholder="1"
              />
            </div>
          )}

          <div className="mt-3">
            <Textarea
              label="Coach Notes"
              value={form.coachNotes}
              onChange={(v) => setForm((f) => ({ ...f, coachNotes: v }))}
              rows={2}
              placeholder="Internal coaching notes for this exercise…"
            />
          </div>

          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
                className="accent-[#C9A24D]"
              />
              <span className="text-gray-500 text-xs">Required (cannot be substituted)</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="text-[10px] text-gray-700 border border-white/[0.05] px-3 py-1.5 hover:text-red-400 hover:border-red-500/30 tracking-wide uppercase transition-colors"
              >
                Remove
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[10px] tracking-[0.25em] uppercase font-semibold bg-[#C9A24D] text-black px-4 py-1.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION CARD
// ─────────────────────────────────────────────────────────────

function SectionCard({
  section: sectionData,
  templateId,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
  onPrescriptionsChange,
}: {
  section: SectionData;
  templateId: string;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updated: SectionData) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onPrescriptionsChange: (sectionId: string, prescriptions: PrescriptionData[]) => void;
}) {
  const { section, prescriptions } = sectionData;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    name: section.name,
    sectionType: section.sectionType,
    estimatedMinutes: section.estimatedMinutes?.toString() ?? "",
    notes: section.notes ?? "",
  });

  // Exercise search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExerciseResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentlyUsed, setRecentlyUsed] = useState<ExerciseResult[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/internal/exercises/search?q=${encodeURIComponent(q)}&limit=20`,
      );
      const data = await res.json() as { ok: boolean; exercises?: ExerciseResult[] };
      if (data.ok) setSearchResults(data.exercises ?? []);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, doSearch]);

  // Fetch recently used when search panel opens
  useEffect(() => {
    if (!showSearch) return;
    let mounted = true;
    setRecentLoading(true);
    fetch("/api/internal/exercises/recently-used")
      .then((r) => r.json())
      .then((data: { ok: boolean; exercises?: ExerciseResult[] }) => {
        if (mounted && data.ok) setRecentlyUsed(data.exercises ?? []);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setRecentLoading(false); });
    return () => { mounted = false; };
  }, [showSearch]);

  async function handleSaveSection() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/internal/workout-templates/${templateId}/sections/${section.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            sectionType: editForm.sectionType,
            estimatedMinutes: editForm.estimatedMinutes
              ? parseInt(editForm.estimatedMinutes, 10)
              : null,
            notes: editForm.notes || null,
          }),
        },
      );
      const data = await res.json() as { ok: boolean; section?: SectionData["section"] };
      if (data.ok && data.section) {
        onUpdate({ section: data.section, prescriptions });
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSection() {
    if (!confirm(`Delete section "${section.name}"? Exercises inside will become unsectioned.`)) return;
    await fetch(`/api/internal/workout-templates/${templateId}/sections/${section.id}`, {
      method: "DELETE",
    });
    onDelete(section.id);
  }

  async function handleAddExercise(exercise: ExerciseResult) {
    const rx = exercise.effectivePrescription ?? exercise.defaultPrescription;
    const res = await fetch(
      `/api/internal/workout-templates/${templateId}/exercises`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          sectionId: section.id,
          // Apply defaultPrescription scaffold when present
          ...(rx ? {
            sets: rx.sets ?? null,
            repsMin: rx.repsMin ?? null,
            repsMax: rx.repsMax ?? null,
            targetRpe: rx.targetRpe != null ? String(rx.targetRpe) : null,
            restSeconds: rx.restSeconds ?? null,
          } : {}),
        }),
      },
    );
    const data = await res.json() as { ok: boolean; prescription?: PrescriptionData };
    if (data.ok && data.prescription) {
      const newPrescription: PrescriptionData = {
        ...data.prescription,
        exerciseName: exercise.name,
      };
      onPrescriptionsChange(section.id, [...prescriptions, newPrescription]);
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  }

  function handlePrescriptionUpdate(updated: PrescriptionData) {
    onPrescriptionsChange(
      section.id,
      prescriptions.map((p) => (p.id === updated.id ? updated : p)),
    );
  }

  function handlePrescriptionDelete(id: string) {
    onPrescriptionsChange(section.id, prescriptions.filter((p) => p.id !== id));
  }

  async function handlePrescriptionMove(id: string, dir: "up" | "down") {
    await fetch(
      `/api/internal/workout-templates/${templateId}/exercises/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: dir }),
      },
    );
    // Reorder locally
    const sorted = [...prescriptions].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((p) => p.id === id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const tmp = sorted[idx].orderIndex;
    sorted[idx] = { ...sorted[idx], orderIndex: sorted[swapIdx].orderIndex };
    sorted[swapIdx] = { ...sorted[swapIdx], orderIndex: tmp };
    sorted.sort((a, b) => a.orderIndex - b.orderIndex);
    onPrescriptionsChange(section.id, sorted);
  }

  // Build group index map for color assignment
  const groupIds = [...new Set(prescriptions.map((p) => p.groupId).filter(Boolean))];
  const groupIndexMap = new Map(groupIds.map((g, i) => [g, i]));

  const sorted = [...prescriptions].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="border border-white/[0.08] bg-[#0d0e0f] mb-3">
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove(section.id, "up")}
            disabled={isFirst}
            className="text-gray-700 hover:text-gray-400 disabled:opacity-20 text-[10px] leading-none transition-colors"
          >
            ▲
          </button>
          <button
            onClick={() => onMove(section.id, "down")}
            disabled={isLast}
            className="text-gray-700 hover:text-gray-400 disabled:opacity-20 text-[10px] leading-none transition-colors"
          >
            ▼
          </button>
        </div>

        {editing ? (
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="col-span-2 sm:col-span-1 bg-[#080909] border border-white/[0.08] text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#C9A24D]/40"
            />
            <select
              value={editForm.sectionType}
              onChange={(e) => setEditForm((f) => ({ ...f, sectionType: e.target.value }))}
              className="bg-[#080909] border border-white/[0.08] text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#C9A24D]/40"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>{fmtLabel(t)}</option>
              ))}
            </select>
            <input
              type="number"
              value={editForm.estimatedMinutes}
              onChange={(e) => setEditForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
              placeholder="Est. min"
              className="bg-[#080909] border border-white/[0.08] text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#C9A24D]/40"
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSaveSection}
                disabled={saving}
                className="text-[10px] bg-[#C9A24D] text-black font-bold px-3 py-1.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-[10px] text-gray-600 border border-white/[0.06] px-2 py-1.5 hover:text-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setExpanded((x) => !x)}
              className="flex-1 flex items-center gap-3 text-left"
            >
              <span className="text-white text-sm font-semibold">{section.name}</span>
              <span className="text-gray-600 text-[10px] border border-white/[0.08] px-1.5 py-0.5">
                {fmtLabel(section.sectionType)}
              </span>
              {section.estimatedMinutes && (
                <span className="text-gray-600 text-[11px]">{section.estimatedMinutes} min</span>
              )}
              <span className="text-gray-700 text-[11px] ml-auto">
                {prescriptions.length} {prescriptions.length === 1 ? "exercise" : "exercises"}
              </span>
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDeleteSection}
              className="text-[10px] text-gray-700 hover:text-red-400 transition-colors"
            >
              ×
            </button>
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-gray-700 text-[11px]"
            >
              {expanded ? "▲" : "▼"}
            </button>
          </>
        )}
      </div>

      {/* Section notes */}
      {expanded && section.notes && !editing && (
        <div className="px-4 py-2 border-b border-white/[0.04]">
          <p className="text-gray-600 text-xs italic">{section.notes}</p>
        </div>
      )}

      {/* Prescriptions */}
      {expanded && (
        <div className="px-3 pt-3">
          {sorted.map((p, idx) => (
            <PrescriptionRow
              key={p.id}
              prescription={p}
              templateId={templateId}
              groupIndex={groupIndexMap.get(p.groupId ?? "") ?? 0}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              onUpdate={handlePrescriptionUpdate}
              onDelete={handlePrescriptionDelete}
              onMove={handlePrescriptionMove}
            />
          ))}

          {/* Add exercise */}
          {showSearch ? (
            <div className="border border-white/[0.08] p-3 mb-3 bg-[#0a0b0c]">
              <div className="flex gap-2 mb-3">
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exercises by name…"
                  className="flex-1 bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
                />
                <button
                  onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}
                  className="text-gray-600 text-xs px-3 border border-white/[0.06] hover:text-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Recently Used — shown only when search is empty */}
              {!searchQuery && (
                <>
                  {recentLoading && (
                    <p className="text-gray-600 text-[10px] py-2 animate-pulse">Loading recent…</p>
                  )}
                  {!recentLoading && recentlyUsed.length > 0 && (
                    <>
                      <p className="text-[9px] text-white/20 uppercase tracking-[0.45em] mb-1.5 px-1">Recently Used</p>
                      {recentlyUsed.map((ex) => (
                        <ExercisePickerRow key={ex.id} exercise={ex} onAdd={handleAddExercise} />
                      ))}
                      <div className="h-px bg-white/[0.04] my-2" />
                      <p className="text-gray-700 text-[10px] py-1 px-1">Type to search the full library.</p>
                    </>
                  )}
                  {!recentLoading && recentlyUsed.length === 0 && (
                    <p className="text-gray-700 text-xs py-2">Type to search exercises.</p>
                  )}
                </>
              )}

              {/* Search results */}
              {searchLoading && (
                <p className="text-gray-600 text-xs py-2 animate-pulse">Searching…</p>
              )}
              {!searchLoading && searchQuery && searchResults.length === 0 && (
                <p className="text-gray-700 text-xs py-2">No active exercises found.</p>
              )}
              {searchQuery && searchResults.map((ex) => (
                <ExercisePickerRow key={ex.id} exercise={ex} onAdd={handleAddExercise} />
              ))}
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="w-full text-left text-[11px] text-gray-600 border border-dashed border-white/[0.06] px-4 py-2.5 hover:text-gray-400 hover:border-white/[0.12] transition-colors mb-3"
            >
              + Add Exercise
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// METADATA PANEL
// ─────────────────────────────────────────────────────────────

function MetadataPanel({
  template,
  templateId,
  onUpdate,
}: {
  template: TemplateData;
  templateId: string;
  onUpdate: (updated: TemplateData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: template.name,
    slug: template.slug,
    description: template.description ?? "",
    primaryFocus: template.primaryFocus ?? "",
    recommendedExperienceLevel: template.recommendedExperienceLevel,
    estimatedDurationMinutes: template.estimatedDurationMinutes?.toString() ?? "",
    status: template.status,
    objective: template.objective ?? "",
    coachingMethodology: template.coachingMethodology ?? "",
    defaultSetStyle: template.defaultSetStyle ?? "",
    minimumDaysPerWeek: template.minimumDaysPerWeek?.toString() ?? "",
    maximumDaysPerWeek: template.maximumDaysPerWeek?.toString() ?? "",
  });

  async function handleSave() {
    if (!form.name.trim()) { setSaveError("Name is required"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/internal/workout-templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          description: form.description || null,
          primaryFocus: form.primaryFocus || null,
          recommendedExperienceLevel: form.recommendedExperienceLevel,
          estimatedDurationMinutes: form.estimatedDurationMinutes
            ? parseInt(form.estimatedDurationMinutes, 10)
            : null,
          status: form.status,
          objective: form.objective || null,
          coachingMethodology: form.coachingMethodology || null,
          defaultSetStyle: form.defaultSetStyle || null,
          minimumDaysPerWeek: form.minimumDaysPerWeek
            ? parseInt(form.minimumDaysPerWeek, 10)
            : null,
          maximumDaysPerWeek: form.maximumDaysPerWeek
            ? parseInt(form.maximumDaysPerWeek, 10)
            : null,
        }),
      });
      const data = await res.json() as { ok: boolean; template?: TemplateData; error?: string };
      if (data.ok && data.template) {
        onUpdate(data.template);
        setOpen(false);
      } else {
        setSaveError(data.error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-white/[0.08] bg-[#0d0e0f] mb-6">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-white text-sm font-semibold">Template Metadata</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${statusCls(template.status)}`}>
            {template.status}
          </span>
          <span className="text-gray-600 text-xs">{template.recommendedExperienceLevel}</span>
          {template.primaryFocus && (
            <span className="text-gray-600 text-xs">· {template.primaryFocus}</span>
          )}
        </div>
        <span className="text-gray-600 text-xs">{open ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/[0.05]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <Input
              label="Name *"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Push / Pull / Legs – Hypertrophy"
            />
            <Input
              label="Slug"
              value={form.slug}
              onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
              placeholder="push-pull-legs-hypertrophy"
            />
            <Input
              label="Primary Focus"
              value={form.primaryFocus}
              onChange={(v) => setForm((f) => ({ ...f, primaryFocus: v }))}
              placeholder="Hypertrophy, Strength…"
            />
            <Select
              label="Experience Level"
              value={form.recommendedExperienceLevel}
              onChange={(v) => setForm((f) => ({ ...f, recommendedExperienceLevel: v }))}
              options={EXPERIENCE_LEVELS.map((l) => ({ value: l, label: fmtLabel(l) }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            />
            <Input
              label="Est. Duration (min)"
              value={form.estimatedDurationMinutes}
              onChange={(v) => setForm((f) => ({ ...f, estimatedDurationMinutes: v }))}
              type="number"
              placeholder="60"
            />
            <Input
              label="Min Days / Week"
              value={form.minimumDaysPerWeek}
              onChange={(v) => setForm((f) => ({ ...f, minimumDaysPerWeek: v }))}
              type="number"
              placeholder="3"
            />
            <Input
              label="Max Days / Week"
              value={form.maximumDaysPerWeek}
              onChange={(v) => setForm((f) => ({ ...f, maximumDaysPerWeek: v }))}
              type="number"
              placeholder="5"
            />
            <Input
              label="Default Set Style"
              value={form.defaultSetStyle}
              onChange={(v) => setForm((f) => ({ ...f, defaultSetStyle: v }))}
              placeholder="Straight sets, supersets…"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Textarea
              label="Description"
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder="Brief overview of this template…"
            />
            <Textarea
              label="Objective"
              value={form.objective}
              onChange={(v) => setForm((f) => ({ ...f, objective: v }))}
              placeholder="Primary training goal…"
            />
            <Textarea
              label="Coaching Methodology"
              value={form.coachingMethodology}
              onChange={(v) => setForm((f) => ({ ...f, coachingMethodology: v }))}
              placeholder="Describe the programming logic…"
            />
          </div>
          {saveError && (
            <p className="text-red-400 text-xs mt-3">{saveError}</p>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Metadata"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-600 text-[11px] hover:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VALIDATION PANEL
// ─────────────────────────────────────────────────────────────

function ValidationPanel({ templateId }: { templateId: string }) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/workout-templates/${templateId}/validate`,
        { method: "POST" },
      );
      const data = await res.json() as { ok: boolean; result?: ValidationResult; error?: string };
      if (data.ok && data.result) {
        setResult(data.result);
      } else {
        setError(data.error ?? "Validation failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="border border-white/[0.08] bg-[#0d0e0f] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.5em] text-gray-600 uppercase font-semibold">
          Blueprint Validation
        </p>
        <button
          onClick={handleValidate}
          disabled={running}
          className="text-[10px] tracking-[0.25em] uppercase font-semibold text-gray-400 border border-white/[0.1] px-4 py-2 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
        >
          {running ? "Running…" : "Run Validation"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          <div
            className={`flex items-center gap-3 px-4 py-3 border ${
              result.valid
                ? "bg-emerald-500/[0.04] border-emerald-500/20"
                : "bg-red-500/[0.04] border-red-500/20"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${result.valid ? "bg-emerald-400" : "bg-red-400"}`}
            />
            <p
              className={`text-sm font-semibold ${result.valid ? "text-emerald-300" : "text-red-300"}`}
            >
              {result.valid ? "Blueprint is valid" : `${result.errors.length} error${result.errors.length !== 1 ? "s" : ""} found`}
            </p>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sections", value: result.summary.sectionCount },
              { label: "Exercises", value: result.summary.exerciseCount },
              { label: "Groups", value: result.summary.groupCount },
              { label: "Est. Duration", value: result.summary.estimatedMinutes ? `${result.summary.estimatedMinutes} min` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#0a0b0c] border border-white/[0.05] px-3 py-3">
                <p className="text-white font-bold text-lg">{value}</p>
                <p className="text-gray-600 text-[10px] uppercase tracking-[0.3em]">{label}</p>
              </div>
            ))}
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div>
              <p className="text-[10px] text-red-500 uppercase tracking-[0.4em] font-semibold mb-2">
                Errors
              </p>
              <div className="space-y-1.5">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 bg-red-500/[0.04] border border-red-500/15 px-3 py-2">
                    <span className="text-red-400 text-xs shrink-0 mt-0.5">✗</span>
                    <p className="text-red-400/80 text-xs leading-relaxed">{e}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div>
              <p className="text-[10px] text-amber-500 uppercase tracking-[0.4em] font-semibold mb-2">
                Warnings
              </p>
              <div className="space-y-1.5">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-500/[0.04] border border-amber-500/15 px-3 py-2">
                    <span className="text-amber-400 text-xs shrink-0 mt-0.5">⚠</span>
                    <p className="text-amber-400/80 text-xs leading-relaxed">{w}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.valid && result.warnings.length === 0 && (
            <p className="text-emerald-400/70 text-xs">
              No issues found. Blueprint is ready to publish.
            </p>
          )}
        </div>
      )}

      {!result && !running && (
        <p className="text-gray-700 text-xs">
          Run validation to check this blueprint for structural errors before publishing.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADD SECTION FORM
// ─────────────────────────────────────────────────────────────

function AddSectionForm({
  templateId,
  onAdded,
  onCancel,
}: {
  templateId: string;
  onAdded: (section: SectionData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    sectionType: "main_lift",
    estimatedMinutes: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/workout-templates/${templateId}/sections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            sectionType: form.sectionType,
            estimatedMinutes: form.estimatedMinutes
              ? parseInt(form.estimatedMinutes, 10)
              : null,
            notes: form.notes || null,
          }),
        },
      );
      const data = await res.json() as { ok: boolean; section?: SectionData["section"]; error?: string };
      if (data.ok && data.section) {
        onAdded({ section: data.section, prescriptions: [] });
      } else {
        setError(data.error ?? "Failed to add section");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[#C9A24D]/20 bg-[#0d0e0f] p-4 mb-3">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Section name *"
            className="col-span-2 sm:col-span-1 bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
          />
          <select
            value={form.sectionType}
            onChange={(e) => setForm((f) => ({ ...f, sectionType: e.target.value }))}
            className="bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40"
          >
            {SECTION_TYPES.map((t) => (
              <option key={t} value={t}>{fmtLabel(t)}</option>
            ))}
          </select>
          <input
            type="number"
            value={form.estimatedMinutes}
            onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
            placeholder="Est. minutes"
            className="bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.2em] uppercase py-2 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
            >
              {saving ? "…" : "Add"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-600 text-xs border border-white/[0.06] px-3 hover:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        <input
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Section notes (optional)"
          className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2 text-xs focus:outline-none focus:border-[#C9A24D]/40 placeholder-gray-700"
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EDITOR
// ─────────────────────────────────────────────────────────────

export interface BlueprintEditorProps {
  templateId: string;
  initialData: BlueprintData;
  backHref?: string;
}

export default function BlueprintEditor({ templateId, initialData, backHref = "/admin/blueprints" }: BlueprintEditorProps) {
  const [template, setTemplate] = useState<TemplateData>(initialData.template);
  const [sections, setSections] = useState<SectionData[]>(
    [...initialData.sections].sort((a, b) => a.section.orderIndex - b.section.orderIndex),
  );
  const [unsectioned, setUnsectioned] = useState<PrescriptionData[]>(
    [...initialData.unsectioned].sort((a, b) => a.orderIndex - b.orderIndex),
  );
  const [showAddSection, setShowAddSection] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function handleSectionMove(id: string, dir: "up" | "down") {
    await fetch(`/api/internal/workout-templates/${templateId}/sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: dir }),
    });
    setSections((prev) => {
      const sorted = [...prev].sort((a, b) => a.section.orderIndex - b.section.orderIndex);
      const idx = sorted.findIndex((s) => s.section.id === id);
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const tmp = sorted[idx].section.orderIndex;
      sorted[idx] = { ...sorted[idx], section: { ...sorted[idx].section, orderIndex: sorted[swapIdx].section.orderIndex } };
      sorted[swapIdx] = { ...sorted[swapIdx], section: { ...sorted[swapIdx].section, orderIndex: tmp } };
      return sorted.sort((a, b) => a.section.orderIndex - b.section.orderIndex);
    });
  }

  function handleSectionUpdate(updated: SectionData) {
    setSections((prev) =>
      prev.map((s) => (s.section.id === updated.section.id ? updated : s)),
    );
  }

  function handleSectionDelete(id: string) {
    setSections((prev) => prev.filter((s) => s.section.id !== id));
  }

  function handleSectionAdded(section: SectionData) {
    setSections((prev) =>
      [...prev, section].sort((a, b) => a.section.orderIndex - b.section.orderIndex),
    );
    setShowAddSection(false);
  }

  function handlePrescriptionsChange(sectionId: string, prescriptions: PrescriptionData[]) {
    setSections((prev) =>
      prev.map((s) =>
        s.section.id === sectionId ? { ...s, prescriptions } : s,
      ),
    );
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/internal/workout-templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = await res.json() as { ok: boolean; template?: TemplateData; error?: string };
      if (data.ok && data.template) {
        setTemplate(data.template);
      } else {
        setPublishError(data.error ?? "Failed to publish");
      }
    } catch {
      setPublishError("Network error");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080909] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#080909]/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href={backHref}
                className="text-gray-600 hover:text-gray-400 text-xs tracking-widest uppercase font-semibold transition-colors shrink-0"
              >
                ← Blueprints
              </Link>
              <div className="w-px h-4 bg-white/10 shrink-0" />
              <h1 className="text-white font-semibold text-sm tracking-wide truncate">
                {template.name}
              </h1>
              <span className={`px-1.5 py-0.5 text-[10px] font-semibold tracking-wide shrink-0 ${statusCls(template.status)}`}>
                {template.status}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {publishError && (
                <span className="text-red-400 text-[11px]">{publishError}</span>
              )}
              {template.status !== "active" && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="text-[10px] tracking-[0.25em] uppercase font-semibold bg-[#C9A24D] text-black px-4 py-2 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Publish"}
                </button>
              )}
              {template.status === "active" && (
                <button
                  onClick={() => setTemplate((t) => ({ ...t, status: "draft" }))}
                  className="text-[10px] tracking-[0.25em] uppercase font-semibold text-gray-500 border border-white/[0.1] px-4 py-2 hover:text-white hover:border-white/20 transition-colors"
                  title="Revert to draft"
                >
                  Unpublish
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6">
        {/* Metadata panel */}
        <MetadataPanel
          template={template}
          templateId={templateId}
          onUpdate={setTemplate}
        />

        {/* Section builder */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[10px] tracking-[0.5em] text-gray-600 uppercase font-semibold">
            Sections & Exercises
          </h2>
          <span className="text-gray-700 text-[11px]">
            {sections.length} section{sections.length !== 1 ? "s" : ""}
            {" · "}
            {sections.reduce((s, sec) => s + sec.prescriptions.length, 0) + unsectioned.length} total exercises
          </span>
        </div>

        {/* Sections */}
        {sections.map((s, idx) => (
          <SectionCard
            key={s.section.id}
            section={s}
            templateId={templateId}
            isFirst={idx === 0}
            isLast={idx === sections.length - 1}
            onUpdate={handleSectionUpdate}
            onDelete={handleSectionDelete}
            onMove={handleSectionMove}
            onPrescriptionsChange={handlePrescriptionsChange}
          />
        ))}

        {/* Unsectioned exercises */}
        {unsectioned.length > 0 && (
          <div className="border border-white/[0.06] border-dashed bg-[#0d0e0f] mb-3">
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <span className="text-gray-600 text-xs">Unsectioned Exercises</span>
            </div>
            <div className="px-3 pt-2">
              {[...unsectioned]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((p, idx) => (
                  <PrescriptionRow
                    key={p.id}
                    prescription={p}
                    templateId={templateId}
                    groupIndex={0}
                    isFirst={idx === 0}
                    isLast={idx === unsectioned.length - 1}
                    onUpdate={(updated) =>
                      setUnsectioned((prev) =>
                        prev.map((x) => (x.id === updated.id ? updated : x)),
                      )
                    }
                    onDelete={(id) =>
                      setUnsectioned((prev) => prev.filter((x) => x.id !== id))
                    }
                    onMove={async (id, dir) => {
                      await fetch(
                        `/api/internal/workout-templates/${templateId}/exercises/${id}`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ move: dir }),
                        },
                      );
                      setUnsectioned((prev) => {
                        const sorted = [...prev].sort((a, b) => a.orderIndex - b.orderIndex);
                        const i = sorted.findIndex((x) => x.id === id);
                        const j = dir === "up" ? i - 1 : i + 1;
                        if (j < 0 || j >= sorted.length) return prev;
                        const tmp = sorted[i].orderIndex;
                        sorted[i] = { ...sorted[i], orderIndex: sorted[j].orderIndex };
                        sorted[j] = { ...sorted[j], orderIndex: tmp };
                        return sorted.sort((a, b) => a.orderIndex - b.orderIndex);
                      });
                    }}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Add section */}
        {showAddSection ? (
          <AddSectionForm
            templateId={templateId}
            onAdded={handleSectionAdded}
            onCancel={() => setShowAddSection(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddSection(true)}
            className="w-full border border-dashed border-white/[0.08] px-5 py-4 text-gray-600 text-xs hover:text-gray-400 hover:border-white/[0.15] transition-colors mb-6"
          >
            + Add Section
          </button>
        )}

        {/* Validation */}
        <ValidationPanel templateId={templateId} />
      </div>
    </div>
  );
}
