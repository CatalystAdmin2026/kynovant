"use client";

// Catalyst HQ — Blueprints
// Auth: HQ layout (requireCoachOrAdminPage) — no secondary gate needed.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import HQPageHeader from "@/components/hq/HQPageHeader";
import {
  Search, X, Plus, ClipboardList, CheckCircle2, PencilLine, Dumbbell,
  ChevronLeft, ChevronRight, MoreVertical, Trash2,
} from "lucide-react";
import {
  Button, Input, Select, Label,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dropdown, EmptyState, Skeleton, SkeletonTableRow,
} from "@/components/ui";

interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  recommendedExperienceLevel: string;
  primaryFocus: string | null;
  estimatedDurationMinutes: number | null;
  createdAt: string;
  // Additive optional fields — already returned by
  // listWorkoutTemplatesWithSummary() but not previously surfaced here.
  updatedAt?: string;
  exerciseCount?: number;
}

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;

type StatusFilter = "all" | "draft" | "active" | "archived";
type LevelFilter = "all" | (typeof EXPERIENCE_LEVELS)[number];

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

function expCls(e: string) {
  if (e === "advanced") return "text-red-400";
  if (e === "intermediate") return "text-amber-400";
  return "text-emerald-400";
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

interface NewTemplateForm {
  name: string;
  recommendedExperienceLevel: string;
}

export default function HQBlueprintsPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewTemplateForm>({
    name: "",
    recommendedExperienceLevel: "intermediate",
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/internal/workout-templates")
      .then((r) => r.json())
      .then((data: { ok: boolean; templates?: TemplateRow[]; error?: string }) => {
        if (!mounted) return;
        if (data.ok && data.templates) {
          setTemplates(data.templates);
        } else {
          setError(data.error ?? "Failed to load templates");
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) { setError("Network error"); setLoading(false); }
      });
    return () => { mounted = false; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim()) { setCreateError("Name is required"); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/internal/workout-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json() as { ok: boolean; template?: { id: string }; error?: string };
      if (data.ok && data.template) {
        window.location.href = `/hq/blueprints/${data.template.id}`;
      } else {
        setCreateError(data.error ?? "Failed to create template");
        setCreating(false);
      }
    } catch {
      setCreateError("Network error");
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete blueprint "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/internal/workout-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert("Failed to delete template");
    }
  }

  function clearFilters() {
    setStatusFilter("all");
    setLevelFilter("all");
    setSearch("");
  }

  const filtered = useMemo(() => templates.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (levelFilter !== "all" && t.recommendedExperienceLevel !== levelFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !(t.primaryFocus ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [templates, statusFilter, levelFilter, search]);

  const filtersActive = statusFilter !== "all" || levelFilter !== "all" || search.trim() !== "";

  // Reset to page 1 whenever the filtered set changes shape. Adjusted
  // during render (React's recommended pattern) rather than in an
  // effect, to avoid the extra render pass a setState-in-effect causes.
  const filterKey = `${statusFilter}|${levelFilter}|${search}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);

  const counts = {
    all:      templates.length,
    draft:    templates.filter((t) => t.status === "draft").length,
    active:   templates.filter((t) => t.status === "active").length,
    archived: templates.filter((t) => t.status === "archived").length,
  };
  const publishedPct = counts.all > 0 ? Math.round((counts.active / counts.all) * 100) : 0;
  const totalExercises = templates.reduce((sum, t) => sum + (t.exerciseCount ?? 0), 0);

  return (
    <div>
      <HQPageHeader
        title="Blueprints"
        subtitle="Reusable workout templates that power your coaching programs."
        action={
          <Button
            tone="dark"
            variant="primary"
            leftIcon={<Plus size={13} strokeWidth={2.5} />}
            onClick={() => { setShowNewForm(true); setCreateError(null); }}
          >
            New Blueprint
          </Button>
        }
      />

      {/* ── Summary metric cards ─────────────────────────────── */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<ClipboardList size={15} />}
            label="Total Blueprints"
            value={counts.all}
            sub={`${counts.draft} in draft`}
          />
          <MetricCard
            icon={<CheckCircle2 size={15} />}
            label="Published"
            value={counts.active}
            sub={`${publishedPct}% of total`}
            bar={publishedPct}
          />
          <MetricCard
            icon={<PencilLine size={15} />}
            label="Draft"
            value={counts.draft}
            sub="Awaiting publish"
          />
          <MetricCard
            icon={<Dumbbell size={15} />}
            label="Total Exercises"
            value={totalExercises}
            sub="Across all blueprints"
          />
        </div>
      )}

      {/* ── Create form ────────────────────────────────────────── */}
      {showNewForm && (
        <div className="mb-8 bg-[#0d0e0f] border border-[#C9A24D]/30 p-6 animate-[ws-fade-up_0.25s_ease]">
          <div className="flex items-center justify-between mb-5">
            <p className="text-white font-semibold text-sm tracking-wide">New Workout Blueprint</p>
            <button
              onClick={() => setShowNewForm(false)}
              aria-label="Close"
              className="text-white/25 hover:text-white/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label tone="dark">Template Name *</Label>
                <Input
                  tone="dark"
                  value={newForm.name}
                  onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Push / Pull / Legs – Hypertrophy"
                />
              </div>
              <div>
                <Label tone="dark">Experience Level *</Label>
                <Select
                  tone="dark"
                  value={newForm.recommendedExperienceLevel}
                  onChange={(e) => setNewForm((f) => ({ ...f, recommendedExperienceLevel: e.target.value }))}
                >
                  {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{fmtLabel(l)}</option>)}
                </Select>
              </div>
            </div>
            {createError && <p className="text-red-400 text-xs">{createError}</p>}
            <div className="flex gap-3">
              <Button type="submit" tone="dark" variant="primary" loading={creating}>
                {creating ? "Creating…" : "Create Blueprint"}
              </Button>
              <Button type="button" tone="dark" variant="ghost" onClick={() => setShowNewForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Toolbar: search, filters ───────────────────────────── */}
      {!loading && !error && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blueprints…"
              className="w-full bg-[#0a0b0b] border border-white/[0.07] text-white/80 text-xs pl-8 pr-3 py-2.5 focus:outline-none focus:border-[#C9A24D]/40 placeholder-white/20 transition-colors"
            />
          </div>

          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              ["all", "All Status"],
              ["draft", `Draft (${counts.draft})`],
              ["active", `Published (${counts.active})`],
              ["archived", `Archived (${counts.archived})`],
            ]}
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
        </div>
      )}

      {/* ── Loading state ──────────────────────────────────────── */}
      {loading && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} tone="dark" height="h-[92px]" rounded="sm" />
            ))}
          </div>
          <Skeleton tone="dark" height="h-11" rounded="sm" className="mb-5" />
          <table className="w-full">
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonTableRow key={i} tone="dark" columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="bg-red-500/[0.04] border border-red-500/15 px-4 py-3 text-red-400 text-sm">{error}</div>}

      {/* ── Empty states ───────────────────────────────────────── */}
      {!loading && !error && templates.length === 0 && (
        <EmptyState
          tone="dark"
          icon={<ClipboardList size={20} />}
          title="No workout blueprints yet"
          description="Build your first reusable workout template — a structured set of exercises with sets, reps, rest, and tempo — to power your coaching programs."
          action={
            <Button tone="dark" variant="primary" leftIcon={<Plus size={13} />} onClick={() => setShowNewForm(true)}>
              New Blueprint
            </Button>
          }
        />
      )}

      {!loading && !error && templates.length > 0 && filtered.length === 0 && (
        <EmptyState
          tone="dark"
          icon={<Search size={17} />}
          title="No blueprints match these filters"
          description="Try adjusting your search or clearing filters."
          action={
            <Button tone="dark" variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          }
        />
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      {!loading && !error && paged.length > 0 && (
        <Table tone="dark" className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Blueprint</TableHead>
              <TableHead>Experience</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Exercises</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((t) => (
              <TableRow key={t.id} className={t.status === "archived" ? "opacity-55 hover:opacity-80" : ""}>
                <TableCell>
                  <Link
                    href={`/hq/blueprints/${t.id}`}
                    className="text-sm font-semibold text-white hover:text-[#C9A24D] transition-colors block truncate max-w-xs"
                  >
                    {t.name}
                  </Link>
                  <p className="text-white/30 text-[11px] mt-0.5 truncate max-w-xs">
                    {t.primaryFocus ? `${t.primaryFocus} · ` : ""}{t.slug}
                  </p>
                </TableCell>
                <TableCell>
                  <span className={`text-xs font-medium ${expCls(t.recommendedExperienceLevel)}`}>
                    {fmtLabel(t.recommendedExperienceLevel)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="text-white/60 text-xs">
                    {t.estimatedDurationMinutes ? `${t.estimatedDurationMinutes} min` : "—"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="text-white/60 text-xs tabular-nums">
                    {t.exerciseCount ?? 0}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-[0.3em] uppercase ${statusCls(t.status)}`}>
                    {statusLabel(t.status)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="text-white/30 text-[11px]">{fmtRelative(t.updatedAt ?? t.createdAt)}</span>
                </TableCell>
                <TableCell className="text-right relative">
                  <RowMenu
                    template={t}
                    onDelete={() => handleDelete(t.id, t.name)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── Pagination ─────────────────────────────────────────── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <p className="text-white/25 text-[11px]">
            Showing {pageStart + 1} to {Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} blueprints
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
  template, onDelete,
}: {
  template: TemplateRow;
  onDelete: () => void;
}) {
  return (
    <Dropdown tone="dark">
      <Dropdown.Trigger
        aria-label="Blueprint actions"
        className="w-7 h-7 flex items-center justify-center text-white/25 hover:text-white hover:bg-white/[0.05] transition-colors"
      >
        <MoreVertical size={14} />
      </Dropdown.Trigger>
      <Dropdown.Content align="right">
        <Link
          href={`/hq/blueprints/${template.id}`}
          className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          <PencilLine size={12} /> Edit
        </Link>
        <Dropdown.Item destructive onSelect={onDelete}>
          <Trash2 size={12} /> Delete
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown>
  );
}
