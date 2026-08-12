"use client";

// Portal Messages — single thread with the client's coach.
//
// Polls every 4s while mounted (simple polling MVP). Lazily creates
// the conversation on first load/send via the API — a client never
// picks a coach, there's exactly one (see messaging-service.ts's
// getOrCreateConversationForClient).

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareOff, Send } from "lucide-react";

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
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function PortalMessagesClient() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasCoach, setHasCoach] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  const loadThread = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/messages");
      const json = await res.json();
      if (res.ok && json.ok) {
        if (!json.conversation) {
          setHasCoach(false);
          return;
        }
        setConversationId(json.conversation.id);
        setMessages(json.messages);
        const hasUnreadIncoming = json.messages.some((m: ThreadMessage) => !m.isMine && !m.readAt);
        if (hasUnreadIncoming) {
          void fetch("/api/portal/messages", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: json.conversation.id }),
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessages((current) => [...current, json.message]);
      } else {
        setDraft(trimmed);
      }
    } finally {
      setSending(false);
    }
  }

  if (!loading && !hasCoach) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] px-6 py-16 text-center">
        <MessageSquareOff size={20} className="text-white/25" />
        <div>
          <p className="text-sm text-white/45">No coach assigned yet</p>
          <p className="mt-1 text-xs text-white/24">Once you&apos;re enrolled with a coach, you can message them here.</p>
        </div>
      </div>
    );
  }

  let runningDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/[0.06] bg-white/[0.015]">
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
              <p className="mt-1 text-xs text-white/24">Send your coach a message to get started.</p>
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
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        message.isMine
                          ? "bg-[#c9a24d]/15 text-white/90 border border-[#c9a24d]/20"
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
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#c9a24d]/30"
          />
          <button
            type="button"
            disabled={!draft.trim() || sending || !conversationId}
            onClick={() => void handleSend()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#c9a24d] text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
