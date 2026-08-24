"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Plus, Check, X, Search,
  Copy, Trash2, Clock, CalendarDays, Repeat, Dumbbell,
} from "lucide-react";
import { Badge } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ProgramTemplate {
  id:                     string;
  name:                   string;
  slug:                   string;
  status:                 string;
  category:               string;
  experienceLevel:        string;
  recommendedDaysPerWeek: number | null;
  defaultDurationWeeks:   number | null;
  description:            string | null;
  version:                number;
  createdAt:              string;
}

interface DaySlot {
  id:                  string;
  programWeekId:       string;
  dayOfWeek:           number;
  workoutTemplateId:   string | null;
  label:               string | null;
  notes:               string | null;
}

interface DayData {
  day:            DaySlot;
  workoutName:    string | null;
  workoutStatus:  string | null;
}

interface WeekData {
  week: {
    id:          string;
    weekNumber:  number;
    label:       string | null;
    notes:       string | null;
  };
  days: DayData[];
}

export interface ProgramBuilderData {
  template: ProgramTemplate;
  weeks:    WeekData[];
}

export interface BlueprintOption {
  id:                         string;
  name:                       string;
  status:                     string;
  primaryFocus:               string | null;
  estimatedDurationMinutes:   number | null;
  exerciseCount:              number;
  description:                string | null;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CATEGORIES = [
  ["fat_loss",              "Fat Loss"],
  ["muscle_growth",         "Muscle Growth"],
  ["body_recomposition",    "Body Recomposition"],
  ["athletic_performance",  "Athletic Performance"],
  ["lifestyle",              "Lifestyle"],
  ["competition_prep",      "Competition Prep"],
  ["executive_performance", "Executive Performance"],
] as const;

const EXPERIENCE_LEVELS = [
  ["beginner",     "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced",     "Advanced"],
  ["competitive",  "Competitive"],
  ["mixed",        "Mixed"],
] as const;

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active:   "success",
  draft:    "warning",
  archived: "neutral",
};

function statusLabel(s: string) {
  if (s === "active") return "Published";
  if (s === "archived") return "Archived";
  return "Draft";
}

// Dot-only variant of the status color mapping — used inside compact
// blueprint cards where a full pill badge would be too heavy.
function statusDotColor(s: string) {
  if (s === "active")   return "bg-emerald-400";
  if (s === "archived") return "bg-white/25";
  return "bg-amber-400";
}

// ─────────────────────────────────────────────────────────────
// BLUEPRINT PICKER
// ─────────────────────────────────────────────────────────────

function BlueprintPicker({
  blueprints,
  currentId,
  onSelect,
  onClear,
  onClose,
}: {
  blueprints:  BlueprintOption[];
  currentId:   string | null;
  onSelect:    (b: BlueprintOption) => void;
  onClear:     () => void;
  onClose:     () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = blueprints.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.primaryFocus ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div
      role="menu"
      className="animate-[ws-fade-up_0.15s_ease] absolute z-30 top-full left-0 mt-1 w-72 bg-[#111213] border border-white/[0.08] shadow-dropdown"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Search blueprints…"
            className="w-full bg-[#0a0b0b] border border-white/[0.06] text-white text-xs pl-7 pr-2.5 py-1.5 focus:outline-none focus:border-[#C9A24D]/40 placeholder-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Options list */}
      <div className="max-h-64 overflow-y-auto">
        {currentId && (
          <button
            role="menuitem"
            onClick={onClear}
            className="flex items-center gap-2 w-full text-left px-3 py-2.5 text-[11px] text-white/30 hover:text-red-400/80 hover:bg-red-500/[0.04] border-b border-white/[0.06] transition-colors"
          >
            <X size={11} /> Make rest day
          </button>
        )}

        {filtered.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-white/20 text-center">
            {blueprints.length === 0 ? "No published blueprints yet." : "No match."}
          </p>
        )}

        {filtered.map((b) => (
          <button
            role="menuitem"
            key={b.id}
            onClick={() => onSelect(b)}
            className={`w-full text-left px-3 py-2.5 border-b border-white/[0.06] last:border-0 transition-colors ${
              b.id === currentId
                ? "bg-[#C9A24D]/[0.08] hover:bg-[#C9A24D]/[0.12]"
                : "hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-start gap-1.5">
                {b.id === currentId && <Check size={12} className="text-[#C9A24D] shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className={`text-[11px] font-medium truncate leading-tight ${b.id === currentId ? "text-[#C9A24D]" : "text-white/75"}`}>
                    {b.name}
                  </p>
                  {b.primaryFocus && (
                    <p className="text-[10px] text-white/25 mt-0.5 truncate">{b.primaryFocus}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                {b.estimatedDurationMinutes && (
                  <span className="text-[9px] text-white/20 tabular-nums">~{b.estimatedDurationMinutes}m</span>
                )}
                {b.exerciseCount > 0 && (
                  <span className="text-[9px] text-white/15 tabular-nums">{b.exerciseCount}ex</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/[0.06] flex items-center justify-between">
        <Link
          href="/hq/blueprints"
          className="text-[10px] text-[#C9A24D]/50 hover:text-[#C9A24D]/80 transition-colors"
          onClick={onClose}
        >
          + New blueprint
        </Link>
        <button
          onClick={onClose}
          className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DAY CELL
// ─────────────────────────────────────────────────────────────

function DayCell({
  dow,
  data,
  weekId,
  templateId,
  blueprints,
  onUpdate,
}: {
  dow:         number;
  data:        DayData | undefined;
  weekId:      string;
  templateId:  string;
  blueprints:  BlueprintOption[];
  onUpdate:    (dow: number, result: DayData | null) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasWorkout = !!data?.day.workoutTemplateId;

  // Close picker on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function applySelection(workoutTemplateId: string | null, name: string | null) {
    setSaving(true);
    setOpen(false);
    try {
      const body = workoutTemplateId === null
        ? { dayOfWeek: dow, clear: true }
        : { dayOfWeek: dow, workoutTemplateId };

      const res = await fetch(`/api/internal/programs/${templateId}/weeks/${weekId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { ok: boolean; day?: DaySlot };
      if (json.ok) {
        if (workoutTemplateId === null) {
          onUpdate(dow, null);
        } else {
          const bp = blueprints.find((b) => b.id === workoutTemplateId);
          onUpdate(dow, {
            day: json.day ?? {
              id: "", programWeekId: weekId, dayOfWeek: dow,
              workoutTemplateId, label: null, notes: null,
            },
            workoutName:   name,
            workoutStatus: bp?.status ?? null,
          });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <div className="h-[88px] bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
        <div className="w-3 h-3 border border-[#C9A24D]/30 border-t-[#C9A24D]/70 rounded-full animate-spin" />
      </div>
    );
  }

  const bp = hasWorkout ? blueprints.find((b) => b.id === data?.day.workoutTemplateId) : null;

  return (
    <div ref={containerRef} className="relative">
      {hasWorkout ? (
        <button
          onClick={() => setOpen((x) => !x)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="group w-full h-[88px] bg-[#C9A24D]/[0.05] border border-[#C9A24D]/[0.18] border-t-2 border-t-[#C9A24D]/70 px-2.5 pt-2 pb-2 text-left flex flex-col justify-between hover:bg-[#C9A24D]/[0.09] hover:border-[#C9A24D]/35 hover:-translate-y-0.5 hover:shadow-card-hover transition-all duration-200 ease-out"
        >
          <div className="min-w-0">
            <p className="text-[#C9A24D]/90 text-[10.5px] font-semibold truncate leading-tight">
              {data?.workoutName}
            </p>
            {bp?.primaryFocus && (
              <p className="text-white/25 text-[9px] mt-0.5 truncate">{bp.primaryFocus}</p>
            )}
          </div>
          <p className="text-white/20 text-[9px] flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor(data?.workoutStatus ?? "draft")}`} />
            {bp?.estimatedDurationMinutes && <span>~{bp.estimatedDurationMinutes}m</span>}
            {bp && bp.exerciseCount > 0 && <span>{bp.exerciseCount}ex</span>}
          </p>
        </button>
      ) : (
        <button
          onClick={() => setOpen((x) => !x)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-full h-[88px] bg-transparent border border-dashed border-white/[0.06] flex flex-col items-center justify-center gap-1 hover:border-white/[0.14] hover:bg-white/[0.015] transition-all duration-200 ease-out group"
        >
          <Plus size={12} strokeWidth={2.5} className="text-white/12 group-hover:text-white/30 transition-colors" />
          <span className="text-white/10 text-[9px] font-semibold uppercase tracking-[0.25em] group-hover:text-white/25 transition-colors">Rest</span>
        </button>
      )}

      {open && (
        <BlueprintPicker
          blueprints={blueprints}
          currentId={data?.day.workoutTemplateId ?? null}
          onSelect={(b) => applySelection(b.id, b.name)}
          onClear={() => applySelection(null, null)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEEK ROW
// ─────────────────────────────────────────────────────────────

function WeekRow({
  weekData,
  templateId,
  blueprints,
  onUpdateDay,
  onDelete,
  onCopyWeek,
  onUpdateLabel,
}: {
  weekData:       WeekData;
  templateId:     string;
  blueprints:     BlueprintOption[];
  onUpdateDay:    (weekId: string, dow: number, data: DayData | null) => void;
  onDelete:       (weekId: string) => void;
  onCopyWeek:     (weekId: string, newWeek: WeekData["week"]) => void;
  onUpdateLabel:  (weekId: string, label: string) => void;
}) {
  const { week, days } = weekData;
  const [editLabel,   setEditLabel]   = useState(false);
  const [labelInput,  setLabelInput]  = useState(week.label ?? `Week ${week.weekNumber}`);
  const [savingLabel, setSavingLabel] = useState(false);
  const [copying,     setCopying]     = useState(false);

  const dayMap = new Map(days.map((d) => [d.day.dayOfWeek, d]));
  const trainingDayCount = days.filter((d) => d.day.workoutTemplateId).length;

  async function handleSaveLabel() {
    if (!labelInput.trim()) return;
    setSavingLabel(true);
    try {
      await fetch(`/api/internal/programs/${templateId}/weeks/${week.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ label: labelInput.trim() }),
      });
      onUpdateLabel(week.id, labelInput.trim());
      setEditLabel(false);
    } finally {
      setSavingLabel(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${week.label ?? `Week ${week.weekNumber}`}"? All workout assignments in this week will be lost.`)) return;
    await fetch(`/api/internal/programs/${templateId}/weeks/${week.id}`, { method: "DELETE" });
    onDelete(week.id);
  }

  async function handleCopy() {
    setCopying(true);
    try {
      const res = await fetch(
        `/api/internal/programs/${templateId}/weeks/${week.id}/copy`,
        { method: "POST" },
      );
      const data = await res.json() as { ok: boolean; week?: WeekData["week"] };
      if (data.ok && data.week) {
        onCopyWeek(week.id, data.week);
      }
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="border border-white/[0.08] bg-[#0c0d0e] group/week">
      {/* Week header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06]">
        <span className="text-[#C9A24D]/60 text-[9px] font-semibold tracking-[0.25em] uppercase shrink-0 tabular-nums">
          W{String(week.weekNumber).padStart(2, "0")}
        </span>

        {editLabel ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveLabel();
                if (e.key === "Escape") { setLabelInput(week.label ?? `Week ${week.weekNumber}`); setEditLabel(false); }
              }}
              className="flex-1 bg-[#080909] border border-white/[0.08] text-white/80 px-2 py-1 text-xs focus:outline-none focus:border-[#C9A24D]/40"
            />
            <button
              onClick={handleSaveLabel}
              disabled={savingLabel}
              className="text-[10px] bg-[#C9A24D] text-black font-bold px-2 py-1 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
            >
              {savingLabel ? "…" : "Save"}
            </button>
            <button
              onClick={() => { setLabelInput(week.label ?? `Week ${week.weekNumber}`); setEditLabel(false); }}
              className="text-[10px] text-white/25 hover:text-white/50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setEditLabel(true)}
              className="flex-1 text-left text-white/70 text-[13px] font-medium hover:text-white transition-colors truncate"
            >
              {week.label ?? `Week ${week.weekNumber}`}
            </button>
            {trainingDayCount > 0 && (
              <span className="text-white/20 text-[9px] shrink-0 tabular-nums">
                {trainingDayCount}/7 days
              </span>
            )}
          </>
        )}

        {/* Week actions */}
        {!editLabel && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleCopy}
              disabled={copying}
              aria-label={`Duplicate ${week.label ?? `Week ${week.weekNumber}`}`}
              title="Duplicate this week"
              className="w-6 h-6 flex items-center justify-center text-white/25 hover:text-[#C9A24D]/80 hover:bg-white/[0.04] transition-colors disabled:opacity-50"
            >
              {copying ? <span className="text-[10px]">…</span> : <Copy size={12} />}
            </button>
            <button
              onClick={handleDelete}
              aria-label={`Delete ${week.label ?? `Week ${week.weekNumber}`}`}
              title="Delete this week"
              className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400/80 hover:bg-red-500/[0.06] transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1.5 p-2 bg-[#0a0b0c]">
        {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
          <DayCell
            key={dow}
            dow={dow}
            data={dayMap.get(dow)}
            weekId={week.id}
            templateId={templateId}
            blueprints={blueprints}
            onUpdate={(d, updated) => onUpdateDay(week.id, d, updated)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROGRAM METRICS ROW — derived from already-loaded data, no new fetching
// ─────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.06] px-4 py-3.5 transition-colors hover:border-white/[0.14]">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 flex items-center justify-center bg-[#C9A24D]/[0.08] text-[#C9A24D]/70 border border-[#C9A24D]/15">
          {icon}
        </div>
        <span className="text-[9px] font-semibold tracking-[0.25em] uppercase text-white/30">{label}</span>
      </div>
      <span className="text-xl font-bold text-white tabular-nums leading-none">{value}</span>
      {sub && <p className="text-white/22 text-[10px] mt-1.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// METADATA PANEL
// ─────────────────────────────────────────────────────────────

function MetadataPanel({
  templateId,
  template,
  onChange,
}: {
  templateId: string;
  template:   ProgramTemplate;
  onChange:   (t: ProgramTemplate) => void;
}) {
  const [form, setForm] = useState({
    description:            template.description ?? "",
    category:               template.category,
    experienceLevel:        template.experienceLevel,
    recommendedDaysPerWeek: String(template.recommendedDaysPerWeek ?? ""),
    defaultDurationWeeks:   String(template.defaultDurationWeeks ?? ""),
  });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const dirty =
    form.description          !== (template.description ?? "") ||
    form.category             !== template.category ||
    form.experienceLevel      !== template.experienceLevel ||
    form.recommendedDaysPerWeek !== String(template.recommendedDaysPerWeek ?? "") ||
    form.defaultDurationWeeks   !== String(template.defaultDurationWeeks ?? "");

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/internal/programs/${templateId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          description:            form.description || null,
          category:               form.category,
          experienceLevel:        form.experienceLevel,
          recommendedDaysPerWeek: form.recommendedDaysPerWeek ? parseInt(form.recommendedDaysPerWeek, 10) : null,
          defaultDurationWeeks:   form.defaultDurationWeeks   ? parseInt(form.defaultDurationWeeks,   10) : null,
        }),
      });
      const data = await res.json() as { ok: boolean; template?: ProgramTemplate };
      if (data.ok && data.template) {
        onChange(data.template);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-[ws-fade-up_0.2s_ease] space-y-5 max-w-2xl">
      <div>
        <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="Describe this program's goals, methodology, and intended athlete…"
          className="w-full bg-[#080909] border border-white/[0.06] text-white/70 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors resize-none placeholder-white/15"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-[#080909] border border-white/[0.06] text-white/65 text-xs px-2.5 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors"
          >
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Experience</label>
          <select
            value={form.experienceLevel}
            onChange={(e) => setForm((f) => ({ ...f, experienceLevel: e.target.value }))}
            className="w-full bg-[#080909] border border-white/[0.06] text-white/65 text-xs px-2.5 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors"
          >
            {EXPERIENCE_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Duration (weeks)</label>
          <input
            type="number"
            min="1"
            value={form.defaultDurationWeeks}
            onChange={(e) => setForm((f) => ({ ...f, defaultDurationWeeks: e.target.value }))}
            placeholder="—"
            className="w-full bg-[#080909] border border-white/[0.06] text-white/65 text-xs px-2.5 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors placeholder-white/15"
          />
        </div>
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Days / week</label>
          <input
            type="number"
            min="1"
            max="7"
            value={form.recommendedDaysPerWeek}
            onChange={(e) => setForm((f) => ({ ...f, recommendedDaysPerWeek: e.target.value }))}
            placeholder="—"
            className="w-full bg-[#080909] border border-white/[0.06] text-white/65 text-xs px-2.5 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors placeholder-white/15"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 text-[10px] tracking-[0.3em] uppercase font-bold bg-white/[0.06] border border-white/[0.08] text-white/50 px-4 py-2 hover:bg-white/[0.07] hover:text-white/70 transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
            <Check size={11} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VALIDATION + PUBLISH PANEL
// ─────────────────────────────────────────────────────────────

function PublishPanel({
  templateId,
  onPublish,
}: {
  templateId: string;
  onPublish:  () => void;
}) {
  const [errors,     setErrors]     = useState<string[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  // [Program publish auto-dependency workflow] Publishing now silently
  // auto-publishes whichever draft blueprints this program references —
  // this just tells the coach it happened. Zero-dependency case is
  // untouched: autoPublishedCount stays 0, no message renders, existing
  // publish UX is unchanged.
  const [autoPublishedCount, setAutoPublishedCount] = useState(0);

  async function handlePublish() {
    setPublishing(true);
    setErrors(null);
    try {
      const res = await fetch(`/api/internal/programs/${templateId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ publish: true }),
      });
      const data = await res.json() as { ok: boolean; errors?: string[]; autoPublishedBlueprintIds?: string[] };
      if (data.ok) {
        setAutoPublishedCount(data.autoPublishedBlueprintIds?.length ?? 0);
        onPublish();
      } else {
        setErrors(data.errors ?? ["Validation failed."]);
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="border-t border-white/[0.06] mt-8 pt-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Publish Program</p>
          <p className="text-white/25 text-xs leading-relaxed max-w-md">
            Publishing validates that every assigned blueprint is finalized.
            Published programs can be assigned to clients. You can continue
            editing after publishing — each change increments the version.
          </p>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="shrink-0 flex items-center gap-1.5 text-[10px] tracking-[0.3em] uppercase font-bold bg-[#C9A24D] text-black px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
        >
          <Check size={12} strokeWidth={3} />
          {publishing ? "Validating…" : "Validate & Publish"}
        </button>
      </div>

      {errors && errors.length > 0 && (
        <div className="mt-5 space-y-2">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-3 bg-red-500/[0.04] border border-red-500/[0.12] px-3 py-2.5">
              <span className="text-red-400/60 text-[10px] mt-0.5 shrink-0">✕</span>
              <p className="text-red-400/70 text-xs">{e}</p>
            </div>
          ))}
        </div>
      )}

      {autoPublishedCount > 0 && (
        <div className="mt-5 flex items-start gap-3 bg-emerald-500/[0.04] border border-emerald-500/[0.12] px-3 py-2.5">
          <Check size={12} strokeWidth={3} className="text-emerald-400/70 mt-0.5 shrink-0" />
          <p className="text-emerald-400/70 text-xs">
            Program published — {autoPublishedCount} required blueprint{autoPublishedCount === 1 ? "" : "s"} {autoPublishedCount === 1 ? "was" : "were"} published along with it.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ASSIGN PANEL
// ─────────────────────────────────────────────────────────────

interface ClientOption { id: string; name: string }

function AssignPanel({ templateId }: { templateId: string }) {
  const [clients,       setClients]       = useState<ClientOption[]>([]);
  const [loadingC,      setLoadingC]      = useState(false);
  const [clientId,      setClientId]      = useState("");
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10));
  const [coachNotes,    setCoachNotes]    = useState("");
  const [override,      setOverride]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [result,        setResult]        = useState<{ ok: boolean; msg: string } | null>(null);

  const loadClients = useCallback(async () => {
    if (clients.length > 0) return;
    setLoadingC(true);
    try {
      const res  = await fetch("/api/internal/clients");
      const data = await res.json() as { ok: boolean; clients?: ClientOption[] };
      if (data.ok && data.clients) {
        setClients(data.clients);
      }
    } finally {
      setLoadingC(false);
    }
  }, [clients.length]);

  async function handleAssign() {
    if (!clientId.trim() || !startDate) {
      setResult({ ok: false, msg: "Select a client and start date." });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const res  = await fetch("/api/internal/client-programs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: clientId.trim(), programTemplateId: templateId, startDate, coachNotes: coachNotes || null, overrideAllowMultiple: override }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setResult({ ok: data.ok, msg: data.ok ? "Program assigned." : (data.error ?? "Failed.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-[ws-fade-up_0.2s_ease] space-y-5 max-w-2xl">
      <p className="text-white/25 text-xs leading-relaxed">
        Assign this program to a client. A deep copy of the schedule is created
        for the client at assignment time — future template edits won&apos;t affect
        in-progress assignments.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Client</label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onFocus={loadClients}
            placeholder="Search or paste client ID…"
            list="assign-client-list"
            className="w-full bg-[#080909] border border-white/[0.06] text-white/70 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors placeholder-white/15"
          />
          <datalist id="assign-client-list">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </datalist>
          {loadingC && <p className="text-white/20 text-[10px] mt-1">Loading clients…</p>}
        </div>
        <div>
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-[#080909] border border-white/[0.06] text-white/70 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[9px] font-semibold text-white/22 uppercase tracking-[0.25em] mb-1.5">Coach Notes</label>
          <input
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            placeholder="Internal notes for this assignment (optional)…"
            className="w-full bg-[#080909] border border-white/[0.06] text-white/70 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/35 transition-colors placeholder-white/15"
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-[#C9A24D]" />
        <span className="text-white/30 text-xs">Allow alongside an existing active program</span>
      </label>

      {result && (
        <p className={`text-xs flex items-center gap-1.5 ${result.ok ? "text-emerald-400/70" : "text-red-400/70"}`}>
          {result.ok && <Check size={12} />}
          {result.msg}
        </p>
      )}

      <button
        onClick={handleAssign}
        disabled={saving}
        className="flex items-center gap-1.5 text-[10px] tracking-[0.3em] uppercase font-bold bg-[#C9A24D] text-black px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
      >
        {saving ? "Assigning…" : "Assign Program →"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN BUILDER
// ─────────────────────────────────────────────────────────────

type Tab = "schedule" | "details" | "assign";

export default function ProgramBuilder({
  templateId,
  initialData,
  blueprints,
  backHref = "/hq/programs",
}: {
  templateId:   string;
  initialData:  ProgramBuilderData;
  blueprints:   BlueprintOption[];
  backHref?:    string;
}) {
  const [template,     setTemplate]     = useState(initialData.template);
  const [weeks,        setWeeks]        = useState(initialData.weeks);
  const [tab,          setTab]          = useState<Tab>("schedule");
  const [addingWeek,   setAddingWeek]   = useState(false);
  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState(initialData.template.name);
  const [savingName,   setSavingName]   = useState(false);
  const [archiving,    setArchiving]    = useState(false);
  const [viewedWeek,   setViewedWeek]   = useState(0);

  const badgeVariant = STATUS_BADGE_VARIANT[template.status] ?? "neutral";

  // ── Day update ──────────────────────────────────────────────
  function handleUpdateDay(weekId: string, dow: number, data: DayData | null) {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.week.id !== weekId) return w;
        const filtered = w.days.filter((d) => d.day.dayOfWeek !== dow);
        if (data === null) return { ...w, days: filtered };
        return { ...w, days: [...filtered, data] };
      }),
    );
  }

  // ── Week handlers ───────────────────────────────────────────
  function handleDeleteWeek(weekId: string) {
    setWeeks((prev) => prev.filter((w) => w.week.id !== weekId));
  }

  function handleCopyWeek(sourceWeekId: string, newWeek: WeekData["week"]) {
    const sourceWeekData = weeks.find((w) => w.week.id === sourceWeekId);
    if (!sourceWeekData) return;
    setWeeks((prev) => [
      ...prev,
      {
        week: newWeek,
        days: sourceWeekData.days.map((d) => ({
          ...d,
          day: { ...d.day, id: "", programWeekId: newWeek.id },
        })),
      },
    ]);
    setViewedWeek(weeks.length);
  }

  function handleUpdateLabel(weekId: string, label: string) {
    setWeeks((prev) =>
      prev.map((w) => w.week.id === weekId ? { ...w, week: { ...w.week, label } } : w),
    );
  }

  async function handleAddWeek() {
    const newIndex = weeks.length;
    setAddingWeek(true);
    try {
      const res  = await fetch(`/api/internal/programs/${templateId}/weeks`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      const data = await res.json() as { ok: boolean; week?: WeekData["week"] };
      if (data.ok && data.week) {
        setWeeks((prev) => [...prev, { week: data.week!, days: [] }]);
        setViewedWeek(newIndex);
      }
    } finally {
      setAddingWeek(false);
    }
  }

  // ── Name inline edit ────────────────────────────────────────
  async function handleSaveName() {
    if (!nameInput.trim() || nameInput === template.name) {
      setEditingName(false);
      setNameInput(template.name);
      return;
    }
    setSavingName(true);
    try {
      const res  = await fetch(`/api/internal/programs/${templateId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: nameInput.trim() }),
      });
      const data = await res.json() as { ok: boolean; template?: ProgramTemplate };
      if (data.ok && data.template) {
        setTemplate(data.template);
        setNameInput(data.template.name);
        setEditingName(false);
      }
    } finally {
      setSavingName(false);
    }
  }

  // ── Archive ─────────────────────────────────────────────────
  async function handleArchive() {
    if (!confirm("Archive this program? It will no longer be assignable to new clients.")) return;
    setArchiving(true);
    try {
      const res  = await fetch(`/api/internal/programs/${templateId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: "archived" }),
      });
      const data = await res.json() as { ok: boolean; template?: ProgramTemplate };
      if (data.ok && data.template) setTemplate(data.template);
    } finally {
      setArchiving(false);
    }
  }

  // ── Stats ───────────────────────────────────────────────────
  const trainingDays = weeks.reduce(
    (sum, w) => sum + w.days.filter((d) => d.day.workoutTemplateId).length,
    0,
  );
  const sortedWeeks = [...weeks].sort((a, b) => a.week.weekNumber - b.week.weekNumber);
  const safeWeekIndex = sortedWeeks.length === 0 ? 0 : Math.min(viewedWeek, sortedWeeks.length - 1);
  const activeWeek = sortedWeeks[safeWeekIndex];

  // Average scheduled minutes/week across the whole program — derived
  // purely from already-loaded weeks + blueprints, no new fetching.
  const totalAssignedMinutes = weeks.reduce((sum, w) => {
    return sum + w.days.reduce((daySum, d) => {
      if (!d.day.workoutTemplateId) return daySum;
      const bp = blueprints.find((b) => b.id === d.day.workoutTemplateId);
      return daySum + (bp?.estimatedDurationMinutes ?? 0);
    }, 0);
  }, 0);
  const avgWeeklyMinutes = weeks.length > 0 ? Math.round(totalAssignedMinutes / weeks.length) : 0;
  const timeLabel =
    avgWeeklyMinutes <= 0
      ? "—"
      : avgWeeklyMinutes >= 60
        ? `~${(avgWeeklyMinutes / 60).toFixed(1)}h`
        : `~${avgWeeklyMinutes}m`;

  return (
    <div className="min-h-screen bg-[#070809] text-white">

      {/* ── Sticky header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#070809]/95 backdrop-blur-sm border-b border-white/[0.06]">
        <div className="max-w-screen-lg mx-auto px-5 md:px-8">
          <div className="flex items-center h-13 gap-4 py-2">

            {/* Left: back + name */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Link
                href={backHref}
                className="text-white/25 hover:text-white/50 text-[10px] tracking-[0.3em] uppercase font-semibold transition-colors shrink-0"
              >
                ← Programs
              </Link>
              <div className="w-px h-4 bg-white/[0.08] shrink-0" />

              {editingName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") { setNameInput(template.name); setEditingName(false); }
                    }}
                    className="flex-1 bg-transparent border-b border-[#C9A24D]/40 text-white text-sm font-medium focus:outline-none py-0.5"
                  />
                  <button onClick={handleSaveName} disabled={savingName} className="text-[10px] text-[#C9A24D]/70 hover:text-[#C9A24D] disabled:opacity-50">
                    {savingName ? "…" : "Save"}
                  </button>
                  <button onClick={() => { setNameInput(template.name); setEditingName(false); }} className="text-[10px] text-white/25 hover:text-white/50">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-white/80 text-sm font-medium hover:text-white transition-colors truncate text-left"
                >
                  {template.name}
                </button>
              )}

              <Badge tone="dark" variant={badgeVariant} size="sm" className="shrink-0">
                <span className={`w-1 h-1 rounded-full ${statusDotColor(template.status)}`} />
                {statusLabel(template.status)}
              </Badge>

              {template.version > 1 && (
                <span className="text-white/18 text-[9px] shrink-0">v{template.version}</span>
              )}
            </div>

            {/* Right: actions + stats */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-white/18 text-[10px] hidden sm:block tabular-nums">
                {weeks.length}w · {trainingDays} workouts
              </span>

              {template.status === "active" && (
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="text-[9px] tracking-[0.25em] uppercase font-semibold text-white/25 border border-white/[0.08] px-3 py-1.5 hover:text-white/45 hover:border-white/[0.14] transition-colors disabled:opacity-40"
                >
                  {archiving ? "…" : "Archive"}
                </button>
              )}
            </div>
          </div>

          {/* Category / experience subline */}
          <p className="text-white/22 text-[10.5px] pb-2.5 -mt-0.5">
            {fmtLabel(template.category)} · {fmtLabel(template.experienceLevel)}
          </p>

          {/* Day-of-week legend (below header, above tabs) */}
          {tab === "schedule" && sortedWeeks.length > 0 && (
            <div className="grid grid-cols-7 gap-1.5 pb-1.5 -mx-0">
              {DAY_FULL.map((d, i) => (
                <p key={d} className="text-white/12 text-[9px] text-center font-semibold uppercase tracking-[0.25em]">
                  <span className="hidden sm:inline">{d.slice(0, 3)}</span>
                  <span className="sm:hidden">{DAY_SHORT[i]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-screen-lg mx-auto px-5 md:px-8 py-6">

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="flex gap-0 mb-6 border-b border-white/[0.06]">
          {(["schedule", "details", "assign"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-[9px] uppercase tracking-[0.25em] font-semibold transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "text-[#C9A24D] border-[#C9A24D]"
                  : "text-white/25 border-transparent hover:text-white/45"
              }`}
            >
              {t === "schedule" ? "Schedule" : t === "details" ? "Details" : "Assign"}
            </button>
          ))}
        </div>

        {/* ── Schedule tab ──────────────────────────────────── */}
        {tab === "schedule" && (
          <>
            {/* Program metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <MetricCard
                icon={<CalendarDays size={13} />}
                label="Duration"
                value={`${template.defaultDurationWeeks ?? weeks.length}w`}
              />
              <MetricCard
                icon={<Repeat size={13} />}
                label="Days / Week"
                value={template.recommendedDaysPerWeek ? String(template.recommendedDaysPerWeek) : "—"}
              />
              <MetricCard
                icon={<Dumbbell size={13} />}
                label="Workouts"
                value={String(trainingDays)}
              />
              <MetricCard
                icon={<Clock size={13} />}
                label="Est. Time / Week"
                value={timeLabel}
              />
            </div>

            {sortedWeeks.length === 0 ? (
              <div className="border border-dashed border-white/[0.08] px-6 py-12 text-center">
                <div className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] mx-auto mb-4">
                  <CalendarDays size={16} className="text-white/40" />
                </div>
                <p className="text-white/30 text-sm mb-4">This program doesn&apos;t have any weeks yet.</p>
                <button
                  onClick={handleAddWeek}
                  disabled={addingWeek}
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] font-bold bg-[#C9A24D] text-black px-4 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50"
                >
                  <Plus size={12} strokeWidth={3} />
                  {addingWeek ? "Adding…" : "Add Week"}
                </button>
              </div>
            ) : (
              <>
                {/* Week pager */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewedWeek((i) => Math.max(0, i - 1))}
                      disabled={safeWeekIndex === 0}
                      aria-label="Previous week"
                      className="w-7 h-7 flex items-center justify-center border border-white/[0.08] text-white/40 hover:text-white hover:border-white/[0.14] disabled:opacity-25 disabled:hover:text-white/40 disabled:hover:border-white/[0.08] transition-colors"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <select
                      value={safeWeekIndex}
                      onChange={(e) => setViewedWeek(Number(e.target.value))}
                      aria-label="Jump to week"
                      className="bg-[#0a0b0b] border border-white/[0.08] text-white/70 text-xs px-2.5 py-1.5 focus:outline-none focus:border-[#C9A24D]/40 transition-colors max-w-[170px]"
                    >
                      {sortedWeeks.map((w, i) => (
                        <option key={w.week.id} value={i}>
                          {w.week.label ?? `Week ${w.week.weekNumber}`}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setViewedWeek((i) => Math.min(sortedWeeks.length - 1, i + 1))}
                      disabled={safeWeekIndex >= sortedWeeks.length - 1}
                      aria-label="Next week"
                      className="w-7 h-7 flex items-center justify-center border border-white/[0.08] text-white/40 hover:text-white hover:border-white/[0.14] disabled:opacity-25 disabled:hover:text-white/40 disabled:hover:border-white/[0.08] transition-colors"
                    >
                      <ChevronRight size={13} />
                    </button>
                    <span className="text-white/18 text-[10px] uppercase tracking-[0.3em] font-semibold ml-1 hidden sm:inline">
                      Week {safeWeekIndex + 1} of {sortedWeeks.length}
                    </span>
                  </div>
                  <button
                    onClick={handleAddWeek}
                    disabled={addingWeek}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] font-semibold text-white/30 hover:text-[#C9A24D] border border-white/[0.08] hover:border-[#C9A24D]/30 px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <Plus size={12} />
                    {addingWeek ? "Adding…" : "Add Week"}
                  </button>
                </div>

                {/* Active week */}
                {activeWeek && (
                  <div key={activeWeek.week.id} className="animate-[ws-fade-up_0.2s_ease]">
                    <WeekRow
                      weekData={activeWeek}
                      templateId={templateId}
                      blueprints={blueprints}
                      onUpdateDay={handleUpdateDay}
                      onDelete={handleDeleteWeek}
                      onCopyWeek={handleCopyWeek}
                      onUpdateLabel={handleUpdateLabel}
                    />
                  </div>
                )}
              </>
            )}

            {/* Blueprints legend */}
            {blueprints.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/[0.06]">
                <p className="text-[9px] font-semibold text-white/18 uppercase tracking-[0.25em] mb-3">Blueprints in library</p>
                <div className="flex flex-wrap gap-1.5">
                  {blueprints.map((b) => (
                    <Link
                      key={b.id}
                      href={`/hq/blueprints/${b.id}`}
                      className="text-[10px] text-white/28 border border-white/[0.06] px-2 py-1 hover:text-white/50 hover:border-white/[0.14] transition-colors truncate max-w-[180px]"
                    >
                      {b.name}
                      {b.estimatedDurationMinutes && (
                        <span className="text-white/15 ml-1.5">~{b.estimatedDurationMinutes}m</span>
                      )}
                    </Link>
                  ))}
                  <Link
                    href="/hq/blueprints"
                    className="text-[10px] text-[#C9A24D]/35 border border-[#C9A24D]/[0.12] px-2 py-1 hover:text-[#C9A24D]/60 hover:border-[#C9A24D]/25 transition-colors"
                  >
                    + New blueprint
                  </Link>
                </div>
              </div>
            )}

            {/* Publish panel — only for drafts */}
            {template.status === "draft" && (
              <PublishPanel
                templateId={templateId}
                onPublish={() => setTemplate((t) => ({ ...t, status: "active" }))}
              />
            )}
          </>
        )}

        {/* ── Details tab ───────────────────────────────────── */}
        {tab === "details" && (
          <MetadataPanel
            templateId={templateId}
            template={template}
            onChange={setTemplate}
          />
        )}

        {/* ── Assign tab ────────────────────────────────────── */}
        {tab === "assign" && (
          <>
            {template.status !== "active" ? (
              <div className="border border-amber-500/20 bg-amber-500/10 px-5 py-4">
                <p className="text-amber-400 text-sm">
                  Publish this program before assigning it to clients.
                </p>
                <p className="text-amber-400/60 text-xs mt-1">
                  Go to the Schedule tab → Validate &amp; Publish.
                </p>
              </div>
            ) : (
              <AssignPanel templateId={templateId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
