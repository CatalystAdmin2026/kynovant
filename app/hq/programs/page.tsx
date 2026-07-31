"use client";

// Catalyst HQ — Programs
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate needed.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HQPageHeader from "@/components/hq/HQPageHeader";
import {
  Search, LayoutGrid, List, MoreVertical, Plus,
  ClipboardList, Users, TrendingUp, Trophy,
  Flame, Dumbbell, RefreshCw, Zap, Heart, Briefcase,
  ChevronLeft, ChevronRight, X, PencilLine, Copy, Trash2,
} from "lucide-react";

interface ProgramRow {
  id:                     string;
  name:                   string;
  slug:                   string;
  status:                 string;
  category:               string;
  experienceLevel:        string;
  recommendedDaysPerWeek: number | null;
  defaultDurationWeeks:   number | null;
  createdAt:              string;
  updatedAt?:             string;
  activeClientCount?:     number;
  completedClientCount?:  number;
}

const CATEGORIES = [
  "fat_loss", "muscle_growth", "body_recomposition",
  "athletic_performance", "lifestyle", "competition_prep",
  "executive_performance",
] as const;

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "competitive", "mixed"] as const;

type StatusFilter = "all" | "draft" | "active" | "archived";
type CategoryFilter = "all" | (typeof CATEGORIES)[number];
type LevelFilter = "all" | (typeof EXPERIENCE_LEVELS)[number];
type ViewMode = "table" | "grid";

const PAGE_SIZE_OPTIONS = [8, 12, 24] as const;

function statusCls(s: string) {
  if (s === "active")   return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (s === "archived") return "bg-white/[0.04] text-white/25 border border-white/[0.06]";
  return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
}

function statusLabel(s: string) {
  if (s === "active") return "Published";
  if (s === "archived") return "Archived";
  return "Draft";
}

function fmtLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtRelative(iso: string | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Category → visual identity. Purely presentational — no data implied.
const CATEGORY_STYLE: Record<string, { Icon: typeof Flame; cls: string }> = {
  fat_loss:              { Icon: Flame,     cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  muscle_growth:          { Icon: Dumbbell,  cls: "bg-[#C9A24D]/10 text-[#C9A24D] border-[#C9A24D]/20" },
  body_recomposition:     { Icon: RefreshCw, cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  athletic_performance:   { Icon: Zap,       cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  lifestyle:              { Icon: Heart,     cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  competition_prep:       { Icon: Trophy,    cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  executive_performance:  { Icon: Briefcase, cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

function categoryStyle(category: string) {
  return CATEGORY_STYLE[category] ?? { Icon: ClipboardList, cls: "bg-white/[0.04] text-white/30 border-white/[0.08]" };
}

export default function HQProgramsPage() {
  const router = useRouter();
  const [programs,     setPrograms]     = useState<ProgramRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);
  const [cloning,      setCloning]      = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [levelFilter,  setLevelFilter]  = useState<LevelFilter>("all");
  const [search,       setSearch]       = useState("");
  const [view,         setView]         = useState<ViewMode>("table");
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [openMenuId,   setOpenMenuId]   = useState<string | null>(null);
  const [form, setForm] = useState({
    name:                   "",
    category:               "muscle_growth" as (typeof CATEGORIES)[number],
    experienceLevel:        "intermediate" as (typeof EXPERIENCE_LEVELS)[number],
    defaultDurationWeeks:   "12",
    recommendedDaysPerWeek: "4",
  });

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/internal/programs")
      .then((r) => r.json())
      .then((data: { ok: boolean; templates?: ProgramRow[]; error?: string }) => {
        if (!mounted) return;
        if (data.ok && data.templates) setPrograms(data.templates);
        else setError(data.error ?? "Failed to load");
        setLoading(false);
      })
      .catch(() => { if (mounted) { setError("Network error"); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  // Close the row action menu on outside click.
  useEffect(() => {
    if (!openMenuId) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenuId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setCreateError("Name is required"); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/internal/programs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:                   form.name.trim(),
          category:               form.category,
          experienceLevel:        form.experienceLevel,
          defaultDurationWeeks:   form.defaultDurationWeeks ? parseInt(form.defaultDurationWeeks, 10) : null,
          recommendedDaysPerWeek: form.recommendedDaysPerWeek ? parseInt(form.recommendedDaysPerWeek, 10) : null,
        }),
      });
      const data = await res.json() as { ok: boolean; template?: { id: string }; error?: string };
      if (data.ok && data.template) {
        router.push(`/hq/programs/${data.template.id}`);
      } else {
        setCreateError(data.error ?? "Failed to create");
        setCreating(false);
      }
    } catch {
      setCreateError("Network error");
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete program "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/internal/programs/${id}`, { method: "DELETE" });
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }

  const handleClone = useCallback(async (id: string) => {
    setCloning(id);
    try {
      const res  = await fetch(`/api/internal/programs/${id}/clone`, { method: "POST" });
      const data = await res.json() as { ok: boolean; template?: ProgramRow; error?: string };
      if (data.ok && data.template) {
        setPrograms((prev) => [data.template!, ...prev]);
      }
    } finally {
      setCloning(null);
      setOpenMenuId(null);
    }
  }, []);

  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
    setLevelFilter("all");
    setSearch("");
  }

  const filtered = useMemo(() => programs.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (levelFilter !== "all" && p.experienceLevel !== levelFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [programs, statusFilter, categoryFilter, levelFilter, search]);

  const filtersActive = statusFilter !== "all" || categoryFilter !== "all" || levelFilter !== "all" || search.trim() !== "";

  // Reset to page 1 whenever the filtered set changes shape.
  useEffect(() => { setPage(1); }, [statusFilter, categoryFilter, levelFilter, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);

  const counts = {
    all:      programs.length,
    draft:    programs.filter((p) => p.status === "draft").length,
    active:   programs.filter((p) => p.status === "active").length,
    archived: programs.filter((p) => p.status === "archived").length,
  };
  const totalActiveClients    = programs.reduce((sum, p) => sum + (p.activeClientCount ?? 0), 0);
  const totalCompletedClients = programs.reduce((sum, p) => sum + (p.completedClientCount ?? 0), 0);
  const activePct = counts.all > 0 ? Math.round((counts.active / counts.all) * 100) : 0;
  const maxActiveClients = Math.max(1, ...programs.map((p) => p.activeClientCount ?? 0));

  return (
    <div>
      <HQPageHeader
        title="Programs"
        subtitle="Build, manage, and deliver transformational training experiences."
        action={
          <button
            onClick={() => { setShowForm(true); setCreateError(null); }}
            className="group flex items-center gap-2 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-4 py-2.5 hover:bg-[#D4B56A] active:scale-[0.98] transition-all duration-150"
          >
            <Plus size={13} strokeWidth={2.5} className="transition-transform duration-200 group-hover:rotate-90" />
            New Program
          </button>
        }
      />

      {/* ── Summary metric cards ─────────────────────────────── */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<ClipboardList size={15} />}
            label="Total Programs"
            value={counts.all}
            sub={`${counts.draft} in draft`}
          />
          <MetricCard
            icon={<TrendingUp size={15} />}
            label="Active Programs"
            value={counts.active}
            sub={`${activePct}% of total`}
            bar={activePct}
          />
          <MetricCard
            icon={<Users size={15} />}
            label="Clients Enrolled"
            value={totalActiveClients}
            sub="Across active programs"
          />
          <MetricCard
            icon={<Trophy size={15} />}
            label="Completed"
            value={totalCompletedClients}
            sub="All-time client completions"
          />
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-8 bg-[#0d0e0f] border border-[#C9A24D]/30 p-6 animate-[ws-fade-up_0.25s_ease]">
          <div className="flex items-center justify-between mb-5">
            <p className="text-white font-semibold text-sm tracking-wide">New Training Program</p>
            <button
              onClick={() => setShowForm(false)}
              aria-label="Close"
              className="text-white/25 hover:text-white/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-[10px] text-white/25 uppercase tracking-[0.35em] mb-1.5">Program Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Hypertrophy Block A – 12 Week"
                  className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50 placeholder-white/15 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/25 uppercase tracking-[0.35em] mb-1.5">Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}
                  className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{fmtLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-white/25 uppercase tracking-[0.35em] mb-1.5">Experience Level *</label>
                <select
                  value={form.experienceLevel}
                  onChange={(e) => setForm((f) => ({ ...f, experienceLevel: e.target.value as typeof form.experienceLevel }))}
                  className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50"
                >
                  {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{fmtLabel(l)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-white/25 uppercase tracking-[0.35em] mb-1.5">Duration (weeks)</label>
                <input
                  type="number"
                  value={form.defaultDurationWeeks}
                  onChange={(e) => setForm((f) => ({ ...f, defaultDurationWeeks: e.target.value }))}
                  placeholder="12"
                  className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50 placeholder-white/15 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/25 uppercase tracking-[0.35em] mb-1.5">Days / Week</label>
                <input
                  type="number"
                  value={form.recommendedDaysPerWeek}
                  onChange={(e) => setForm((f) => ({ ...f, recommendedDaysPerWeek: e.target.value }))}
                  placeholder="4"
                  className="w-full bg-[#080909] border border-white/[0.08] text-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A24D]/50 placeholder-white/15 transition-colors"
                />
              </div>
            </div>
            {createError && <p className="text-red-400 text-xs">{createError}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors disabled:opacity-50">
                {creating ? "Creating…" : "Create Program"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-white/30 text-[11px] hover:text-white/50 transition-colors px-3">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Toolbar: search, filters, view toggle ─────────────── */}
      {!loading && !error && programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search programs…"
              className="w-full bg-[#0a0b0b] border border-white/[0.07] text-white/80 text-xs pl-8 pr-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/40 placeholder-white/20 transition-colors"
            />
          </div>

          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              ["all", `All Status`],
              ["draft", `Draft (${counts.draft})`],
              ["active", `Published (${counts.active})`],
              ["archived", `Archived (${counts.archived})`],
            ]}
          />
          <FilterSelect
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as CategoryFilter)}
            options={[["all", "All Categories"], ...CATEGORIES.map((c) => [c, fmtLabel(c)] as [string, string])]}
          />
          <FilterSelect
            value={levelFilter}
            onChange={(v) => setLevelFilter(v as LevelFilter)}
            options={[["all", "All Levels"], ...EXPERIENCE_LEVELS.map((l) => [l, fmtLabel(l)] as [string, string])]}
          />

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30 hover:text-[#C9A24D]/80 transition-colors px-2"
            >
              <X size={11} /> Clear
            </button>
          )}

          <div className="flex-1 min-w-0" />

          <div className="flex items-center border border-white/[0.08]">
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              title="Table view"
              className={`p-2 transition-colors ${view === "table" ? "bg-[#C9A24D]/10 text-[#C9A24D]" : "text-white/25 hover:text-white/50"}`}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              title="Grid view"
              className={`p-2 border-l border-white/[0.08] transition-colors ${view === "grid" ? "bg-[#C9A24D]/10 text-[#C9A24D]" : "text-white/25 hover:text-white/50"}`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Loading state ──────────────────────────────────────── */}
      {loading && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[92px] bg-white/[0.02] border border-white/[0.05] animate-pulse" />
            ))}
          </div>
          <div className="h-11 bg-white/[0.02] border border-white/[0.05] mb-5 animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[68px] bg-white/[0.02] border border-white/[0.05] animate-pulse"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-500/[0.04] border border-red-500/15 px-4 py-3 text-red-400 text-sm">{error}</div>}

      {/* ── Empty states ───────────────────────────────────────── */}
      {!loading && !error && programs.length === 0 && (
        <div className="border border-white/[0.06] border-dashed px-8 py-20 text-center">
          <div className="w-12 h-12 mx-auto mb-5 flex items-center justify-center bg-[#C9A24D]/[0.06] border border-[#C9A24D]/15">
            <ClipboardList size={20} className="text-[#C9A24D]/50" />
          </div>
          <p className="text-white/60 text-sm font-medium mb-2">No training programs yet</p>
          <p className="text-white/25 text-xs mb-6 max-w-sm mx-auto leading-relaxed">
            Build your first multi-week program to start assigning structured training to clients.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-[#C9A24D] text-black font-bold text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 hover:bg-[#D4B56A] transition-colors"
          >
            <Plus size={13} /> New Program
          </button>
        </div>
      )}

      {!loading && !error && programs.length > 0 && filtered.length === 0 && (
        <div className="border border-white/[0.05] border-dashed px-8 py-16 text-center">
          <div className="w-11 h-11 mx-auto mb-4 flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
            <Search size={17} className="text-white/20" />
          </div>
          <p className="text-white/40 text-sm mb-1">No programs match these filters</p>
          <p className="text-white/18 text-xs mb-5">Try adjusting your search or clearing filters.</p>
          <button
            onClick={clearFilters}
            className="text-[10px] uppercase tracking-[0.25em] font-semibold text-[#C9A24D]/70 hover:text-[#C9A24D] transition-colors border border-[#C9A24D]/20 hover:border-[#C9A24D]/40 px-4 py-2"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* ── Table view ─────────────────────────────────────────── */}
      {!loading && !error && paged.length > 0 && view === "table" && (
        <div className="border border-white/[0.06] overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Program", "Duration", "Active Clients", "Status", "Updated", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[9px] font-bold tracking-[0.3em] uppercase text-white/25 px-5 py-3.5 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const { Icon, cls } = categoryStyle(p.category);
                const activeClients = p.activeClientCount ?? 0;
                const barPct = Math.round((activeClients / maxActiveClients) * 100);
                return (
                  <tr
                    key={p.id}
                    className={`group border-b border-white/[0.04] last:border-b-0 transition-colors duration-150 hover:bg-white/[0.015] ${
                      p.status === "archived" ? "opacity-55 hover:opacity-80" : ""
                    }`}
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`shrink-0 w-9 h-9 flex items-center justify-center border ${cls}`}>
                          <Icon size={15} />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/hq/programs/${p.id}`}
                            className="text-sm font-semibold text-white hover:text-[#C9A24D] transition-colors block truncate"
                          >
                            {p.name}
                          </Link>
                          <p className="text-white/30 text-[11px] mt-0.5 truncate">
                            {fmtLabel(p.category)} · {fmtLabel(p.experienceLevel)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top whitespace-nowrap">
                      <span className="text-white/60 text-xs">
                        {p.defaultDurationWeeks ? `${p.defaultDurationWeeks} weeks` : "—"}
                      </span>
                      {p.recommendedDaysPerWeek && (
                        <span className="block text-white/22 text-[10px] mt-0.5">{p.recommendedDaysPerWeek}d/wk</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-2 w-32">
                        <span className="text-white/70 text-xs font-medium tabular-nums w-5 shrink-0">{activeClients}</span>
                        <div className="flex-1 h-1 bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full bg-[#C9A24D]/70 transition-all duration-500"
                            style={{ width: `${activeClients > 0 ? Math.max(barPct, 6) : 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top whitespace-nowrap">
                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-[0.3em] uppercase ${statusCls(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top whitespace-nowrap">
                      <span className="text-white/30 text-[11px]">{fmtRelative(p.updatedAt ?? p.createdAt)}</span>
                    </td>
                    <td className="px-5 py-4 align-top text-right relative">
                      <RowMenu
                        program={p}
                        open={openMenuId === p.id}
                        cloning={cloning === p.id}
                        menuRef={openMenuId === p.id ? menuRef : undefined}
                        onToggle={() => setOpenMenuId((cur) => (cur === p.id ? null : p.id))}
                        onClone={() => handleClone(p.id)}
                        onDelete={() => { setOpenMenuId(null); handleDelete(p.id, p.name); }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Grid view ──────────────────────────────────────────── */}
      {!loading && !error && paged.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {paged.map((p) => {
            const { Icon, cls } = categoryStyle(p.category);
            const activeClients = p.activeClientCount ?? 0;
            const barPct = Math.round((activeClients / maxActiveClients) * 100);
            return (
              <div
                key={p.id}
                className={`group relative bg-[#0d0e0f] border px-5 py-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
                  p.status === "archived" ? "border-white/[0.04] opacity-60 hover:opacity-90" : "border-white/[0.07] hover:border-[#C9A24D]/25"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 flex items-center justify-center border ${cls}`}>
                    <Icon size={17} />
                  </div>
                  <RowMenu
                    program={p}
                    open={openMenuId === p.id}
                    cloning={cloning === p.id}
                    menuRef={openMenuId === p.id ? menuRef : undefined}
                    onToggle={() => setOpenMenuId((cur) => (cur === p.id ? null : p.id))}
                    onClone={() => handleClone(p.id)}
                    onDelete={() => { setOpenMenuId(null); handleDelete(p.id, p.name); }}
                  />
                </div>

                <Link href={`/hq/programs/${p.id}`} className="block mb-1">
                  <span className="text-sm font-semibold text-white hover:text-[#C9A24D] transition-colors line-clamp-1">{p.name}</span>
                </Link>
                <p className="text-white/30 text-[11px] mb-4">{fmtLabel(p.category)} · {fmtLabel(p.experienceLevel)}</p>

                <div className="flex items-center gap-3 text-[11px] text-white/35 mb-4">
                  <span>{p.defaultDurationWeeks ? `${p.defaultDurationWeeks}w` : "—"}</span>
                  {p.recommendedDaysPerWeek && <><span className="text-white/12">·</span><span>{p.recommendedDaysPerWeek}d/wk</span></>}
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-white/60 text-[11px] tabular-nums shrink-0">{activeClients} active</span>
                  <div className="flex-1 h-1 bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-[#C9A24D]/70 transition-all duration-500"
                      style={{ width: `${activeClients > 0 ? Math.max(barPct, 6) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-[0.3em] uppercase ${statusCls(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                  <span className="text-white/20 text-[10px]">{fmtRelative(p.updatedAt ?? p.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <p className="text-white/25 text-[11px]">
            Showing {pageStart + 1} to {Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} programs
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                aria-label="Previous page"
                className="w-7 h-7 flex items-center justify-center border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 disabled:opacity-25 disabled:hover:text-white/40 disabled:hover:border-white/[0.08] transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - pageSafe) <= 1)
                .reduce<number[]>((acc, n) => {
                  if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1);
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === -1 ? (
                    <span key={`gap-${i}`} className="w-7 h-7 flex items-center justify-center text-white/15 text-xs">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-7 h-7 flex items-center justify-center text-xs font-medium transition-colors ${
                        n === pageSafe ? "bg-[#C9A24D] text-black" : "text-white/40 border border-white/[0.08] hover:text-white hover:border-white/20"
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                aria-label="Next page"
                className="w-7 h-7 flex items-center justify-center border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 disabled:opacity-25 disabled:hover:text-white/40 disabled:hover:border-white/[0.08] transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-[#0a0b0b] border border-white/[0.08] text-white/50 text-[11px] px-2.5 py-1.5 focus:outline-none focus:border-[#C9A24D]/40"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational helpers
// ─────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  bar?: number;
}) {
  return (
    <div className="bg-[#0d0e0f] border border-white/[0.06] px-5 py-4 transition-colors hover:border-white/[0.1]">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 flex items-center justify-center bg-[#C9A24D]/[0.08] text-[#C9A24D]/70 border border-[#C9A24D]/15">
          {icon}
        </div>
        <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/30">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-2xl font-bold text-white tabular-nums leading-none">{value}</span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-white/25 text-[10px] whitespace-nowrap">{sub}</span>
        {typeof bar === "number" && (
          <div className="flex-1 h-1 bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-[#C9A24D]/60 transition-all duration-500" style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0a0b0b] border border-white/[0.07] text-white/60 text-xs px-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/40 transition-colors"
    >
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

function RowMenu({
  program, open, cloning, menuRef, onToggle, onClone, onDelete,
}: {
  program: ProgramRow;
  open: boolean;
  cloning: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative inline-block text-left" ref={open ? menuRef : undefined}>
      <button
        onClick={onToggle}
        aria-label="Program actions"
        className="w-7 h-7 flex items-center justify-center text-white/25 hover:text-white hover:bg-white/[0.05] transition-colors"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-[#141618] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-10 animate-[ws-fade-up_0.15s_ease]">
          <Link
            href={`/hq/programs/${program.id}`}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <PencilLine size={12} /> Edit
          </Link>
          <button
            onClick={onClone}
            disabled={cloning}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-white/70 hover:text-[#C9A24D] hover:bg-white/[0.04] transition-colors disabled:opacity-40"
          >
            <Copy size={12} /> {cloning ? "Cloning…" : "Duplicate"}
          </button>
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-white/50 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors border-t border-white/[0.05]"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
