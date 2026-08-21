"use client";

// HQ Messages — conversation list.
//
// Polls the list every 15s (simple polling MVP — see the messaging
// service's top-of-file comment for why no realtime infra was added).
// "New Message" opens a picker scoped to this coach's own client
// roster (GET /api/internal/hq/messages/contacts) — a coach can only
// ever start a thread with a client they actually own.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Plus, Search } from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";
import { Button, Card, EmptyState, Modal } from "@/components/ui";
import { useHQUnreadCount } from "@/components/hq/HQUnreadCountProvider";

interface ConversationSummary {
  id: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageIsMine: boolean;
  unreadCount: number;
}

interface MessagingContact {
  clientId: string;
  name: string;
  hasConversation: boolean;
}

function fmtRelative(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

export default function MessagesListClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const { refreshUnreadMessageCount } = useHQUnreadCount();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [contacts, setContacts] = useState<MessagingContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [startingClientId, setStartingClientId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/internal/hq/messages");
      const json = await res.json();
      if (res.ok && json.ok) setConversations(json.conversations);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    refreshUnreadMessageCount();
    const interval = setInterval(() => void loadConversations(), 15000);
    return () => clearInterval(interval);
  }, [loadConversations, refreshUnreadMessageCount]);

  async function openCompose() {
    setComposeOpen(true);
    setContactsLoading(true);
    try {
      const res = await fetch("/api/internal/hq/messages/contacts");
      const json = await res.json();
      if (res.ok && json.ok) setContacts(json.contacts);
    } finally {
      setContactsLoading(false);
    }
  }

  async function startConversation(clientId: string) {
    setStartingClientId(clientId);
    try {
      const res = await fetch("/api/internal/hq/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setComposeOpen(false);
        router.push(`/hq/messages/${json.conversationId}`);
      }
    } finally {
      setStartingClientId(null);
    }
  }

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, contactQuery]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <HQPageHeader
          title="Messages"
          subtitle={
            isAdmin
              ? "Every coach↔client conversation on the platform (read-only oversight)."
              : totalUnread > 0
                ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}`
                : conversations.length > 0
                  ? "All caught up"
                  : "Direct messages with your enrolled clients."
          }
        />
        {!isAdmin && (
          <Button tone="dark" size="sm" leftIcon={<Plus size={14} />} onClick={() => void openCompose()}>
            New Message
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/35">
          <Loader2 size={14} className="animate-spin" />
          Loading conversations
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          tone="dark"
          icon={<MessageSquare className="size-5" />}
          title="No conversations yet"
          description={
            isAdmin
              ? "No coach has started a conversation with a client yet."
              : "Start a conversation with an enrolled client — they'll see it in their portal."
          }
          action={
            !isAdmin && (
              <Button tone="dark" size="sm" leftIcon={<Plus size={14} />} onClick={() => void openCompose()}>
                New Message
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <Link key={conversation.id} href={`/hq/messages/${conversation.id}`} className="block rounded-xl">
              <Card tone="dark" interactive padding="sm" className="flex items-center gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C9A24D]/10 border border-[#C9A24D]/20">
                  <span className="text-[10px] font-bold text-[#C9A24D]/80">{initials(conversation.counterpartName)}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate text-sm font-semibold ${conversation.unreadCount > 0 ? "text-white" : "text-white/75"}`}>
                      {conversation.counterpartName}
                    </p>
                  </div>
                  <p className="truncate text-[12px] text-white/35">
                    {conversation.lastMessagePreview
                      ? `${conversation.lastMessageIsMine ? "You: " : ""}${conversation.lastMessagePreview}`
                      : "No messages yet"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {conversation.lastMessageAt && (
                    <p className="text-[10px] text-white/25">{fmtRelative(conversation.lastMessageAt)}</p>
                  )}
                  {conversation.unreadCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C9A24D] px-1 text-[9px] font-bold text-black">
                      {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        tone="dark"
        size="sm"
        title="New Message"
        description="Choose a client to message."
      >
        <div className="space-y-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              autoFocus
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder="Search clients"
              className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#C9A24D]/30"
            />
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {contactsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/35">
                <Loader2 size={14} className="animate-spin" />
                Loading clients
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-white/35">
                {contacts.length === 0 ? "You don't have any enrolled clients yet." : "No clients match your search."}
              </p>
            ) : (
              filteredContacts.map((contact) => (
                <button
                  key={contact.clientId}
                  type="button"
                  disabled={startingClientId === contact.clientId}
                  onClick={() => void startConversation(contact.clientId)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors hover:border-white/[0.08] hover:bg-white/[0.03] disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.08]">
                      <span className="text-[9px] font-bold text-white/60">{initials(contact.name)}</span>
                    </span>
                    <span className="truncate text-sm text-white/80">{contact.name}</span>
                  </span>
                  {startingClientId === contact.clientId ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-white/35" />
                  ) : contact.hasConversation ? (
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-white/25">Open</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
