"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface HQUnreadCountContextValue {
  unreadMessageCount: number;
  refreshUnreadMessageCount: () => void;
}

const HQUnreadCountContext = createContext<HQUnreadCountContextValue | null>(null);

export function HQUnreadCountProvider({ children }: { children: React.ReactNode }) {
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const inFlightRef = useRef<AbortController | null>(null);

  const loadUnreadMessageCount = useCallback(async (force = false) => {
    if (!force && document.visibilityState !== "visible") return;
    if (inFlightRef.current) return;

    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const res = await fetch("/api/internal/hq/messages/unread-count", {
        signal: controller.signal,
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.ok) setUnreadMessageCount(Number(json.unreadCount ?? 0));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Keep the last known badge value when the request is unavailable.
      }
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  const refreshUnreadMessageCount = useCallback(() => {
    void loadUnreadMessageCount();
  }, [loadUnreadMessageCount]);

  const contextValue = useMemo(
    () => ({ unreadMessageCount, refreshUnreadMessageCount }),
    [refreshUnreadMessageCount, unreadMessageCount],
  );

  useEffect(() => {
    const interval = window.setInterval(() => void loadUnreadMessageCount(), 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadUnreadMessageCount(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void loadUnreadMessageCount();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [loadUnreadMessageCount]);

  return (
    <HQUnreadCountContext.Provider value={contextValue}>
      {children}
    </HQUnreadCountContext.Provider>
  );
}

export function useHQUnreadCount() {
  const context = useContext(HQUnreadCountContext);
  if (!context) throw new Error("useHQUnreadCount must be used within HQUnreadCountProvider");
  return context;
}
