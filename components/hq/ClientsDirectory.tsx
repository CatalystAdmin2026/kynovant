"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronRight,
  Users as UsersIcon,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  Card,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from "@/components/ui";
import type { CoachClientSummary, AttentionLevel } from "@/lib/db/coach-dashboard-service";

// ─────────────────────────────────────────────────────────────
// HELPERS (unchanged business logic — presentation lookups only)
// ─────────────────────────────────────────────────────────────

const ATTENTION_ORDER: Record<AttentionLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  healthy: 3,
};

const ATTENTION_META: Record<AttentionLevel, { dot: string; pill: string; label: string }> = {
  critical: { dot: "bg-red-500", pill: "bg-red-500/10 text-red-400 border-red-500/20", label: "Critical" },
  high: { dot: "bg-amber-400", pill: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "High" },
  medium: { dot: "bg-yellow-400", pill: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", label: "Medium" },
  healthy: { dot: "bg-emerald-400", pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Healthy" },
};

function fmtRelative(d: Date | null): string {
  if (!d) return "Never";
  const diffMs = Date.now() - new Date(d).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SortKey = "name" | "attention" | "lastWorkout" | "compliance";
type AttentionFilter = AttentionLevel | "all";

// ─────────────────────────────────────────────────────────────
// PRESENTATIONAL SUBCOMPONENTS
// ─────────────────────────────────────────────────────────────

function MetricTile({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone?: "neutral" | "critical" | "warn" | "healthy";
}) {
  const toneCls: Record<string, string> = {
    neutral: "bg-gold/10 text-gold/80 border-gold/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  return (
    <Card tone="dark" padding="sm" className="transition-colors duration-200 hover:border-white/[0.12]">
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${toneCls[tone]}`} aria-hidden>
          {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/30">{label}</span>
      </div>
      <p className="text-2xl font-bold leading-none tabular-nums text-white">{value}</p>
      <p className="mt-2 text-[10px] text-white/25">{sub}</p>
    </Card>
  );
}

function SortableHead({
  active,
  onClick,
  align = "left",
  children,
}: {
  active: boolean;
  onClick: () => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-focus-ring inline-flex items-center gap-1 rounded transition-colors ${
        align === "right" ? "flex-row-reverse" : ""
      } ${active ? "text-gold" : "text-white/30 hover:text-white/60"}`}
    >
      {children}
      <span className={`h-1 w-1 rounded-full ${active ? "bg-gold" : "bg-transparent"}`} aria-hidden />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ClientsDirectory({ clients }: { clients: CoachClientSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");

  const filtered = useMemo(() => {
    let result = clients;

    // Search by name or email
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.preferredName ?? "").toLowerCase().includes(q),
      );
    }

    // Filter by attention level
    if (attentionFilter !== "all") {
      result = result.filter((c) => c.attentionLevel === attentionFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortKey === "attention") {
        const cmp = ATTENTION_ORDER[a.attentionLevel] - ATTENTION_ORDER[b.attentionLevel];
        if (cmp !== 0) return cmp;
        return a.fullName.localeCompare(b.fullName);
      }
      if (sortKey === "name") return a.fullName.localeCompare(b.fullName);
      if (sortKey === "lastWorkout") {
        const aMs = a.lastCompletedAt ? new Date(a.lastCompletedAt).getTime() : 0;
        const bMs = b.lastCompletedAt ? new Date(b.lastCompletedAt).getTime() : 0;
        return bMs - aMs;
      }
      if (sortKey === "compliance") {
        const aPct = a.compliancePct ?? -1;
        const bPct = b.compliancePct ?? -1;
        return bPct - aPct;
      }
      return 0;
    });

    return result;
  }, [clients, query, sortKey, attentionFilter]);

  const counts: Record<AttentionFilter, number> = useMemo(() => {
    const all = clients.length;
    const critical = clients.filter((c) => c.attentionLevel === "critical").length;
    const high = clients.filter((c) => c.attentionLevel === "high").length;
    const medium = clients.filter((c) => c.attentionLevel === "medium").length;
    const healthy = clients.filter((c) => c.attentionLevel === "healthy").length;
    return { all, critical, high, medium, healthy };
  }, [clients]);

  // Presentational-only derived value (sum of two already-computed counts).
  const needsAttention = counts.high + counts.medium;
  const filtersActive = query.trim() !== "" || attentionFilter !== "all";

  function clearFilters() {
    setQuery("");
    setAttentionFilter("all");
  }

  return (
    <div className="space-y-6">
      {/* ── Summary metric row ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile icon={<UsersIcon size={13} />} label="Total Clients" value={counts.all} sub="Across your roster" />
        <MetricTile
          icon={<AlertOctagon size={13} />}
          label="Critical"
          value={counts.critical}
          sub="Immediate action needed"
          tone="critical"
        />
        <MetricTile
          icon={<AlertTriangle size={13} />}
          label="Needs Attention"
          value={needsAttention}
          sub="High + medium priority"
          tone="warn"
        />
        <MetricTile icon={<CheckCircle2 size={13} />} label="Healthy" value={counts.healthy} sub="On track" tone="healthy" />
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search */}
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" aria-hidden />
          <Input
            tone="dark"
            type="search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 text-sm"
            aria-label="Search clients"
          />
        </div>

        {/* Sort */}
        <Select
          tone="dark"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort clients by"
          className="text-sm sm:w-56"
        >
          <option value="attention">Sort: Attention</option>
          <option value="name">Sort: Name</option>
          <option value="lastWorkout">Sort: Last Workout</option>
          <option value="compliance">Sort: Compliance</option>
        </Select>
      </div>

      {/* ── Attention filter pills ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "critical", "high", "medium", "healthy"] as const).map((level) => {
          const active = attentionFilter === level;
          const meta = level === "all" ? null : ATTENTION_META[level];
          return (
            <button
              key={level}
              type="button"
              onClick={() => setAttentionFilter(level)}
              aria-pressed={active}
              className={`ds-focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors ${
                active
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/[0.08] text-white/40 hover:border-white/[0.16] hover:text-white/70"
              }`}
            >
              {meta && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />}
              {level === "all" ? "All" : meta!.label}
              <span className={active ? "text-gold/70" : "text-white/25"}>{counts[level]}</span>
            </button>
          );
        })}
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="ds-focus-ring ml-1 inline-flex items-center gap-1 rounded text-[10px] uppercase tracking-[0.2em] text-white/30 transition-colors hover:text-gold"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* ── Results summary ───────────────────────────────────── */}
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">
        {filtered.length} of {clients.length} clients
      </p>

      {/* ── Client table ───────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          tone="dark"
          icon={<Search className="size-5" />}
          title={clients.length === 0 ? "No clients yet" : "No clients match your search"}
          description={
            clients.length === 0
              ? "Clients will appear here once they're enrolled."
              : "Try adjusting your search or filters."
          }
          action={
            filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ds-focus-ring text-[10px] font-semibold uppercase tracking-[0.25em] text-gold/70 transition-colors hover:text-gold"
              >
                Clear Filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <Table tone="dark">
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHead active={sortKey === "name"} onClick={() => setSortKey("name")}>
                  Client
                </SortableHead>
              </TableHead>
              <TableHead className="hidden md:table-cell">Program</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                <SortableHead active={sortKey === "compliance"} onClick={() => setSortKey("compliance")} align="right">
                  Compliance
                </SortableHead>
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                <SortableHead active={sortKey === "lastWorkout"} onClick={() => setSortKey("lastWorkout")} align="right">
                  Last Workout
                </SortableHead>
              </TableHead>
              <TableHead className="hidden text-right xl:table-cell">Sessions</TableHead>
              <TableHead className="w-8">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => {
              const meta = ATTENTION_META[client.attentionLevel];
              const href = `/hq/clients/${client.userId}`;
              const displayName = client.preferredName ?? client.fullName;

              return (
                <TableRow
                  key={client.userId}
                  interactive
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(href);
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`View ${displayName}`}
                  className="ds-focus-ring cursor-pointer group"
                >
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${meta.pill}`}
                        aria-hidden
                      >
                        {initials(displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="ds-focus-ring truncate rounded text-sm font-semibold text-white transition-colors hover:text-gold"
                          >
                            {displayName}
                          </Link>
                          {client.preferredName && client.preferredName !== client.fullName && (
                            <span className="text-[10px] text-white/25">({client.fullName})</span>
                          )}
                          <span
                            className={`hidden items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] sm:inline-flex ${meta.pill}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-white/35">{client.email}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    {client.activeProgramName ? (
                      <div className="min-w-0">
                        <p className="max-w-[180px] truncate text-xs text-white/70">{client.activeProgramName}</p>
                        {client.currentWeek !== null && client.totalWeeks !== null && (
                          <p className="text-[10px] text-white/30">
                            Wk {client.currentWeek}/{client.totalWeeks}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-red-400/80">
                        No program
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="hidden text-right sm:table-cell">
                    {client.compliancePct !== null ? (
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          client.compliancePct >= 75
                            ? "text-emerald-400"
                            : client.compliancePct >= 50
                            ? "text-amber-400"
                            : "text-red-400"
                        }`}
                      >
                        {client.compliancePct}%
                      </span>
                    ) : (
                      <span className="text-xs text-white/20">—</span>
                    )}
                  </TableCell>

                  <TableCell className="hidden text-right text-xs text-white/50 lg:table-cell">
                    {fmtRelative(client.lastCompletedAt)}
                  </TableCell>

                  <TableCell className="hidden text-right text-xs tabular-nums text-white/50 xl:table-cell">
                    {client.completedTotal}
                  </TableCell>

                  <TableCell className="text-right">
                    <ChevronRight
                      size={14}
                      className="inline-block text-white/15 transition-colors group-hover:text-white/40"
                      aria-hidden
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
