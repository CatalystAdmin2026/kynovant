"use client";

// HQ Message Thread — polls every 4s while mounted (simple polling
// MVP), marks the thread read on load and whenever a new incoming
// message arrives, and lets the coach send a reply.
//
// Admin (isAdmin) gets a read-only oversight view — see
// messaging-service.ts's sendMessage for why admin can never send
// as a conversation participant.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui";

interface ThreadMessage {
  id: string;
  senderId: string;
  isMine: boolean;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function fmtTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function MessageThreadClient({
  conversationId,
  isAdmin,
}: {
  conversationId: string;
  isAdmin: boolean;
}) {
  const [counterpartName, setCounterpartName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  const loadThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/internal/hq/messages/${conversationId}`);
      const json = await res.json();
      if (res.ok && json.ok) {
        setCounterpartName(json.conversation.counterpartName);
        setMessages(json.messages);
        const hasUnreadIncoming = json.messages.some((m: ThreadMessage) => !m.isMine && !m.readAt);
        if (hasUnreadIncoming && !isAdmin) {
          void fetch(`/api/internal/hq/messages/${conversationId}`, { method: "PATCH" });
        }
      } else if (res.status === 404) {
        setError("not_found");
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId, isAdmin]);

  useEffect(() => {
    void loadThread();
    const interval = setInterval(() => void loadThread(), 4000);
    return () => clearInterval(interval);
  }, [loadThread]);

  useEffect(() => {
    if (messages.length !== lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/internal/hq/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessages((current) => [...current, json.message]);
      } else {
        setDraft(trimmed); // restore on failure
      }
    } finally {
      setSending(false);
    }
  }

  if (error === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-white/50">This conversation isn&apos;t available.</p>
        <Link href="/hq/messages" className="text-xs uppercase tracking-[0.2em] text-[#C9A24D]/70 hover:text-[#C9A24D]">
          ← Back to Messages
        </Link>
      </div>
    );
  }

  let runningDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <Link href="/hq/messages" aria-label="Back to Messages" className="text-white/35 hover:text-white/70 lg:hidden">
          <ArrowLeft size={16} />
        </Link>
        {loading ? (
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
        ) : (
          <p className="truncate text-sm font-semibold text-white/85">{counterpartName ?? "Conversation"}</p>
        )}
        {isAdmin && (
          <span className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.18em] text-white/25">Read-only</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/35">
            <Loader2 size={14} className="animate-spin" />
            Loading messages
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm text-white/45">No messages yet</p>
              <p className="mt-1 text-xs text-white/24">
                {isAdmin ? "This thread is empty." : `Send ${counterpartName ?? "your client"} a message to get started.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => {
              const dayLabel = fmtDayLabel(message.createdAt);
              const showDayDivider = dayLabel !== runningDay;
              runningDay = dayLabel;
              return (
                <div key={message.id}>
                  {showDayDivider && (
                    <p className="my-4 text-center text-[9px] uppercase tracking-[0.2em] text-white/20">{dayLabel}</p>
                  )}
                  <div className={`flex ${message.isMine ? "justify-end" : "justify-start"} mb-2`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        message.isMine
                          ? "bg-[#C9A24D]/15 text-white/90 border border-[#C9A24D]/20"
                          : "bg-white/[0.05] text-white/80 border border-white/[0.06]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <p className="mt-1 text-[9px] text-white/25">{fmtTime(message.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      {!isAdmin && (
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a message…"
              rows={1}
              className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A24D]/30"
            />
            <Button
              tone="dark"
              size="sm"
              disabled={!draft.trim() || sending}
              onClick={() => void handleSend()}
              aria-label="Send message"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
