"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, Loader2, Search, X } from "lucide-react";

interface SearchResult {
  id: string;
  kind: "client" | "program" | "exercise";
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

interface CoachNotification {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

function resultKindLabel(kind: SearchResult["kind"]) {
  if (kind === "client") return "Client";
  if (kind === "program") return "Program";
  return "Exercise";
}

function fmtRelative(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HQMobileActions() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<CoachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasSearchQuery = query.trim().length >= 2;
  const groupedResults = useMemo(() => {
    return results.reduce<Record<SearchResult["kind"], SearchResult[]>>(
      (acc, result) => {
        acc[result.kind].push(result);
        return acc;
      },
      { client: [], program: [], exercise: [] },
    );
  }, [results]);

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/internal/hq/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (res.ok && json.ok) setResults(Array.isArray(json.results) ? json.results : []);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchOpen]);

  async function loadNotifications() {
    setNotificationsLoading(true);
    try {
      const res = await fetch("/api/internal/hq/notifications?limit=20");
      const json = await res.json();
      if (res.ok && json.ok) {
        setNotifications(Array.isArray(json.notifications) ? json.notifications : []);
        setUnreadCount(Number(json.unreadCount ?? 0));
      }
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const res = await fetch("/api/internal/hq/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setNotifications((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search HQ"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
      >
        <Search size={17} />
      </button>
      <button
        type="button"
        onClick={() => {
          setNotificationsOpen(true);
          void loadNotifications();
        }}
        aria-label="Open notifications"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
        )}
      </button>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-[#08090A] px-4 pb-6 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3">
            <Search size={17} className="text-[#C9A24D]/75" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients, programs, exercises"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/24 focus:outline-none"
            />
            {searchLoading && <Loader2 size={15} className="animate-spin text-white/35" />}
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.05] hover:text-white/80"
            >
              <X size={18} />
            </button>
          </div>

          <div className="max-h-[calc(100vh-6rem-env(safe-area-inset-top))] overflow-y-auto py-4">
            {!hasSearchQuery ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-white/45">Type at least two characters</p>
                <p className="mt-1 text-xs text-white/24">Results are scoped to your HQ access.</p>
              </div>
            ) : results.length > 0 ? (
              (["client", "program", "exercise"] as const).map((kind) => {
                const group = groupedResults[kind];
                if (group.length === 0) return null;
                return (
                  <div key={kind} className="mb-5 last:mb-0">
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/24">
                      {resultKindLabel(kind)}
                    </p>
                    <div className="space-y-2">
                      {group.map((result) => (
                        <Link
                          key={`${result.kind}-${result.id}`}
                          href={result.href}
                          onClick={() => setSearchOpen(false)}
                          className="block rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-3.5"
                        >
                          <span className="block truncate text-sm font-medium text-white/75">{result.title}</span>
                          <span className="mt-1 block truncate text-xs text-white/35">{result.subtitle}</span>
                          {result.meta && (
                            <span className="mt-2 inline-flex border border-white/[0.07] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/28">
                              {result.meta.replace(/_/g, " ")}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="border border-dashed border-white/[0.08] px-4 py-8 text-center">
                <p className="text-sm text-white/45">No results found</p>
                <p className="mt-1 text-xs text-white/24">Try a client, Program, or exercise name.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-white/[0.08] bg-[#08090A] pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Notifications</p>
                <p className="mt-0.5 text-[11px] text-white/30">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#C9A24D]/70 hover:bg-white/[0.05] hover:text-[#C9A24D] disabled:text-white/18"
                  aria-label="Mark all notifications read"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.05] hover:text-white/80"
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {notificationsLoading && notifications.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-white/35">
                  <Loader2 size={14} className="animate-spin" />
                  Loading notifications
                </div>
              ) : notifications.length > 0 ? (
                <div className="space-y-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`rounded-lg border px-3 py-3 ${
                        notification.readAt
                          ? "border-white/[0.045] bg-white/[0.015]"
                          : "border-[#C9A24D]/20 bg-[#C9A24D]/[0.045]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white/75">{notification.title}</p>
                          {notification.body && (
                            <p className="mt-1 text-xs leading-relaxed text-white/35">{notification.body}</p>
                          )}
                        </div>
                        {!notification.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A24D]" />}
                      </div>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/22">
                        {notification.eventType.replace(/_/g, " ")} · {fmtRelative(notification.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-white/[0.08] px-4 py-10 text-center">
                  <p className="text-sm text-white/45">No notifications yet</p>
                  <p className="mt-1 text-xs text-white/24">Future HQ events will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
