"use client";

// HQ Top Bar — right-side chrome only.
// Left side is intentionally blank (sidebar provides primary navigation).
// Disabled controls are visibly inert until real features ship.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  Loader2,
  MessageSquare,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import HQSignOutButton from "./HQSignOutButton";
import { useHQUnreadCount } from "./HQUnreadCountProvider";

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
  resourceType: string | null;
  resourceId: string | null;
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

// Where each notification's own detail page lives, keyed by the
// resourceType its producer set (see coach-notification-service.ts).
// coach_subscription has no per-subscription page — /hq/billing is the
// closest useful destination. Anything unrecognized renders inert
// rather than link to a guessed, possibly-wrong URL.
function notificationHref(notification: CoachNotification): string | null {
  if (!notification.resourceId) return null;
  switch (notification.resourceType) {
    case "conversation":
      return `/hq/messages/${notification.resourceId}`;
    case "program_draft":
      return `/hq/programs/generate/${notification.resourceId}`;
    case "check_in":
      return `/hq/check-ins/${notification.resourceId}`;
    case "coach_subscription":
      return "/hq/billing";
    default:
      return null;
  }
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

export default function HQTopBar() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<CoachNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const { unreadMessageCount } = useHQUnreadCount();
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

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

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

  function handleNotificationClick(notification: CoachNotification) {
    const href = notificationHref(notification);
    if (!href) return;
    setNotificationsOpen(false);
    if (!notification.readAt) {
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      void fetch("/api/internal/hq/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      });
    }
    router.push(href);
  }

  return (
    <header className="hidden lg:flex fixed top-0 left-64 right-0 z-20 h-12 bg-[#0b0c0d]/90 backdrop-blur-sm border-b border-white/[0.05] items-center justify-end px-6 gap-1">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search HQ"
        className="flex h-8 items-center gap-2 border border-white/[0.08] px-3 text-[10px] uppercase tracking-[0.2em] text-white/45 transition-colors hover:border-white/[0.16] hover:text-white/70"
      >
        <Search size={11} />
        <span>Search</span>
        <span className="ml-8 border border-white/[0.06] px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-white/22">
          Cmd K
        </span>
      </button>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setNotificationsOpen((open) => !open);
            if (!notificationsOpen) void loadNotifications();
          }}
          aria-label="Open notifications"
          className="relative flex h-8 w-8 items-center justify-center text-white/45 transition-colors hover:text-white/70"
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
          )}
        </button>

        {notificationsOpen && (
          <div className="absolute right-0 top-10 z-50 w-[360px] border border-white/[0.09] bg-[#08090A] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Notifications</p>
                <p className="mt-0.5 text-[11px] text-white/30">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[#C9A24D]/70 hover:text-[#C9A24D] disabled:text-white/18"
              >
                <Check size={12} />
                Read
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {notificationsLoading && notifications.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-white/35">
                  <Loader2 size={14} className="animate-spin" />
                  Loading notifications
                </div>
              ) : notifications.length > 0 ? (
                notifications.map((notification) => {
                  const href = notificationHref(notification);
                  return (
                    <div
                      key={notification.id}
                      role={href ? "button" : undefined}
                      tabIndex={href ? 0 : undefined}
                      onClick={href ? () => handleNotificationClick(notification) : undefined}
                      onKeyDown={
                        href
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleNotificationClick(notification);
                              }
                            }
                          : undefined
                      }
                      className={`border px-3 py-3 ${href ? "cursor-pointer hover:border-[#C9A24D]/30" : ""} ${
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
                  );
                })
              ) : (
                <div className="border border-dashed border-white/[0.08] px-4 py-8 text-center">
                  <p className="text-sm text-white/45">No notifications yet</p>
                  <p className="mt-1 text-xs text-white/24">Future HQ events will appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Link
        href="/hq/messages"
        aria-label="Open messages"
        title="Messages"
        className="relative flex h-8 w-8 items-center justify-center text-white/45 transition-colors hover:text-white/70"
      >
        <MessageSquare size={14} />
        {unreadMessageCount > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
        )}
      </Link>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      <div
        role="button" aria-disabled="true"
        aria-label="Coach profile unavailable"
        title="Coach profile is not available yet"
        className="flex h-8 cursor-not-allowed items-center gap-2 px-2.5 text-white/25"
      >
        <div className="w-5 h-5 rounded-sm bg-[#C9A24D]/10 border border-[#C9A24D]/20 flex items-center justify-center">
          <User size={10} className="text-[#C9A24D]/50" />
        </div>
      </div>

      <div
        role="button" aria-disabled="true"
        aria-label="Settings unavailable"
        title="Settings are not available yet"
        className="flex h-8 w-8 cursor-not-allowed items-center justify-center text-white/25"
      >
        <Settings size={14} />
      </div>

      <div className="w-px h-5 bg-white/[0.05] mx-1" />

      <HQSignOutButton />

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm">
          <div className="w-full max-w-2xl border border-white/[0.09] bg-[#08090A] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <Search size={16} className="text-[#C9A24D]/75" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients, programs, and shared exercises"
                className="h-9 flex-1 bg-transparent text-sm text-white placeholder:text-white/24 focus:outline-none"
              />
              {searchLoading && <Loader2 size={14} className="animate-spin text-white/30" />}
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="text-white/35 transition-colors hover:text-white/70"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[520px] overflow-y-auto p-3">
              {!hasSearchQuery ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm text-white/45">Type at least two characters</p>
                  <p className="mt-1 text-xs text-white/24">Results are scoped to your clients, Programs, and visible exercises.</p>
                </div>
              ) : results.length > 0 ? (
                (["client", "program", "exercise"] as const).map((kind) => {
                  const group = groupedResults[kind];
                  if (group.length === 0) return null;
                  return (
                    <div key={kind} className="mb-4 last:mb-0">
                      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/24">
                        {resultKindLabel(kind)}
                      </p>
                      <div className="space-y-1">
                        {group.map((result) => (
                          <Link
                            key={`${result.kind}-${result.id}`}
                            href={result.href}
                            onClick={() => setSearchOpen(false)}
                            className="flex items-center justify-between gap-4 border border-white/[0.055] bg-white/[0.02] px-3 py-3 transition-colors hover:border-[#C9A24D]/25 hover:bg-[#C9A24D]/[0.035]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white/75">{result.title}</span>
                              <span className="mt-0.5 block truncate text-xs text-white/32">{result.subtitle}</span>
                            </span>
                            {result.meta && (
                              <span className="shrink-0 border border-white/[0.07] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/28">
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
                  <p className="mt-1 text-xs text-white/24">Try a client name, Program title, or exercise name.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
