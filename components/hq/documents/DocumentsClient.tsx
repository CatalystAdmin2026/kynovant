"use client";

// HQ Documents — list, upload, and share management.
//
// A single-page experience (list + two modals) rather than a nested
// list/detail route — unlike Messages' conversation threads, a
// document doesn't need its own large scrollable canvas; "who has
// access" fits comfortably in a modal. Keeps this proportionate to
// the feature rather than adding "unnecessary enterprise file-
// management complexity" per the product brief.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import HQPageHeader from "@/components/hq/HQPageHeader";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Textarea } from "@/components/ui";

interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  activeAssignmentCount: number;
  totalAssignmentCount: number;
}

interface ShareContact {
  clientId: string;
  name: string;
}

interface AssignmentRow {
  id: string;
  clientId: string;
  clientName: string;
  required: boolean;
  dueAt: string | null;
  viewedAt: string | null;
  revokedAt: string | null;
  assignedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  meal_plan: "Meal Plan",
  training_guide: "Training Guide",
  technique_reference: "Technique Reference",
  posing_material: "Posing Material",
  progress_report: "Progress Report",
  educational: "Educational",
  agreement: "Agreement",
  other: "Other",
};

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DocumentsClient({ isAdmin }: { isAdmin: boolean }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareDocId, setShareDocId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/internal/hq/documents");
      const json = await res.json();
      if (res.ok && json.ok) {
        setDocuments(json.documents);
        setError(null);
      } else {
        setError(json.error ?? "Failed to load documents");
      }
    } catch {
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const activeDocuments = useMemo(() => documents.filter((d) => d.status !== "archived"), [documents]);
  const archivedDocuments = useMemo(() => documents.filter((d) => d.status === "archived"), [documents]);
  const shareDoc = documents.find((d) => d.id === shareDocId) ?? null;

  async function handleArchive(documentId: string) {
    const res = await fetch(`/api/internal/hq/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    if (res.ok) void loadDocuments();
  }

  async function handleDelete(documentId: string) {
    const res = await fetch(`/api/internal/hq/documents/${documentId}`, { method: "DELETE" });
    if (res.ok) {
      void loadDocuments();
    } else {
      const json = await res.json().catch(() => null);
      window.alert(json?.error ?? "Failed to delete document");
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <HQPageHeader
          title="Documents"
          subtitle={
            isAdmin
              ? "Every document on the platform (read-only oversight)."
              : documents.length > 0
                ? `${documents.length} document${documents.length === 1 ? "" : "s"}`
                : "Meal plans, training guides, and resources you share with clients."
          }
        />
        {!isAdmin && (
          <Button tone="dark" size="sm" leftIcon={<Plus size={14} />} onClick={() => setUploadOpen(true)}>
            Upload Document
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/35">
          <Loader2 size={14} className="animate-spin" />
          Loading documents
        </div>
      ) : error ? (
        <EmptyState
          tone="dark"
          icon={<FileText className="size-5" />}
          title="Couldn't load documents"
          description={error}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          tone="dark"
          icon={<FileText className="size-5" />}
          title="No documents yet"
          description={
            isAdmin
              ? "No coach has uploaded a document yet."
              : "Upload a meal plan, training guide, or reference document to share with your clients."
          }
          action={
            !isAdmin && (
              <Button tone="dark" size="sm" leftIcon={<Plus size={14} />} onClick={() => setUploadOpen(true)}>
                Upload Document
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-8">
          <DocumentList
            title="Active"
            rows={activeDocuments}
            isAdmin={isAdmin}
            onShare={setShareDocId}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
          {archivedDocuments.length > 0 && (
            <DocumentList
              title="Archived"
              rows={archivedDocuments}
              isAdmin={isAdmin}
              onShare={setShareDocId}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {!isAdmin && uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void loadDocuments();
          }}
        />
      )}

      {!isAdmin && shareDoc && (
        <ShareModal
          document={shareDoc}
          onClose={() => setShareDocId(null)}
          onChanged={() => void loadDocuments()}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────

function DocumentList({
  title,
  rows,
  isAdmin,
  onShare,
  onArchive,
  onDelete,
}: {
  title: string;
  rows: DocumentRow[];
  isAdmin: boolean;
  onShare: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <p className="mb-3 text-[9px] uppercase tracking-[0.3em] text-white/30">{title}</p>
      <div className="space-y-2">
        {rows.map((doc) => (
          <Card key={doc.id} tone="dark" padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#C9A24D]/10 border border-[#C9A24D]/20">
              <FileText size={15} className="text-[#C9A24D]/75" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-white/85">{doc.title}</p>
                <Badge tone="dark" variant="neutral" size="sm">
                  {CATEGORY_LABELS[doc.category] ?? doc.category}
                </Badge>
                {doc.status === "archived" && (
                  <Badge tone="dark" variant="warning" size="sm">
                    Archived
                  </Badge>
                )}
              </div>
              {doc.description && (
                <p className="mt-1 truncate text-xs text-white/35">{doc.description}</p>
              )}
              <p className="mt-1 text-[10px] text-white/25">
                {doc.originalFilename} · {fmtSize(doc.fileSizeBytes)} · Uploaded {fmtDate(doc.createdAt)}
              </p>
            </div>

            {!isAdmin && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onShare(doc.id)}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/50 transition-colors hover:border-[#C9A24D]/30 hover:text-white/80"
                >
                  <Users size={12} />
                  Share
                  {doc.activeAssignmentCount > 0 && (
                    <span className="text-[#C9A24D]/70">({doc.activeAssignmentCount})</span>
                  )}
                </button>
                <a
                  href={`/api/internal/hq/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/45 transition-colors hover:border-white/20 hover:text-white/80"
                >
                  <Download size={12} />
                </a>
                {doc.status !== "archived" && (
                  <button
                    type="button"
                    onClick={() => onArchive(doc.id)}
                    aria-label="Archive"
                    title="Archive"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/45 transition-colors hover:border-amber-400/30 hover:text-amber-400/80"
                  >
                    <Archive size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (doc.totalAssignmentCount > 0) {
                      window.alert(
                        "This document has assignment history and can't be permanently deleted — archive it instead.",
                      );
                      return;
                    }
                    if (window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) onDelete(doc.id);
                  }}
                  aria-label="Delete"
                  title={doc.totalAssignmentCount > 0 ? "Has assignment history — archive instead" : "Delete"}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/45 transition-colors hover:border-red-400/30 hover:text-red-400/80 disabled:opacity-30"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// UPLOAD MODAL
// ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("training_guide");
  const [description, setDescription] = useState("");
  const [contacts, setContacts] = useState<ShareContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/internal/hq/documents/contacts");
        const json = await res.json();
        if (res.ok && json.ok) setContacts(json.contacts);
      } finally {
        setContactsLoading(false);
      }
    })();
  }, []);

  function toggleClient(clientId: string) {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!file || !title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", title.trim());
      formData.set("category", category);
      if (description.trim()) formData.set("description", description.trim());
      if (selectedClientIds.size > 0) {
        formData.set("clientIds", JSON.stringify([...selectedClientIds]));
      }

      const res = await fetch("/api/internal/hq/documents", { method: "POST", body: formData });
      const json = await res.json();
      if (res.ok && json.ok) {
        onUploaded();
      } else {
        setError(json.error ?? "Failed to upload document");
      }
    } catch {
      setError("Failed to upload document");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      tone="dark"
      size="md"
      title="Upload Document"
      description="PDF, image, Word, Excel, or text — up to 25MB."
      footer={
        <>
          <Button tone="dark" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            tone="dark"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!file || !title.trim() || submitting}
            loading={submitting}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        <div>
          <Label tone="dark" required>
            File
          </Label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-white/60 file:mr-3 file:rounded-md file:border file:border-white/10 file:bg-white/[0.04] file:px-3 file:py-1.5 file:text-[10px] file:uppercase file:tracking-[0.14em] file:text-white/60 hover:file:border-white/20"
          />
        </div>

        <div>
          <Label tone="dark" required>
            Title
          </Label>
          <Input
            tone="dark"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Week 1-4 Meal Plan"
            maxLength={200}
          />
        </div>

        <div>
          <Label tone="dark">Category</Label>
          <Select tone="dark" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label tone="dark">Description</Label>
          <Textarea
            tone="dark"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — a short note about what this is"
            rows={2}
          />
        </div>

        <div>
          <Label tone="dark">Share with (optional)</Label>
          {contactsLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-white/35">
              <Loader2 size={13} className="animate-spin" />
              Loading clients
            </div>
          ) : contacts.length === 0 ? (
            <p className="py-2 text-xs text-white/35">You don&apos;t have any enrolled clients yet.</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/[0.06] p-1.5">
              {contacts.map((contact) => {
                const checked = selectedClientIds.has(contact.clientId);
                return (
                  <button
                    key={contact.clientId}
                    type="button"
                    onClick={() => toggleClient(contact.clientId)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/[0.04]"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked ? "border-[#C9A24D] bg-[#C9A24D]" : "border-white/20"
                      }`}
                    >
                      {checked && <Check size={11} className="text-black" />}
                    </span>
                    {contact.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARE / MANAGE ACCESS MODAL
// ─────────────────────────────────────────────────────────────

function ShareModal({
  document,
  onClose,
  onChanged,
}: {
  document: DocumentRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [contacts, setContacts] = useState<ShareContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyClientId, setBusyClientId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignmentsRes, contactsRes] = await Promise.all([
        fetch(`/api/internal/hq/documents/${document.id}/assignments`),
        fetch("/api/internal/hq/documents/contacts"),
      ]);
      const assignmentsJson = await assignmentsRes.json();
      const contactsJson = await contactsRes.json();
      if (assignmentsRes.ok && assignmentsJson.ok) setAssignments(assignmentsJson.assignments);
      if (contactsRes.ok && contactsJson.ok) setContacts(contactsJson.contacts);
    } finally {
      setLoading(false);
    }
  }, [document.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAssignments = assignments.filter((a) => !a.revokedAt);
  const sharedClientIds = new Set(activeAssignments.map((a) => a.clientId));
  const unsharedContacts = contacts.filter((c) => !sharedClientIds.has(c.clientId));

  async function handleShare(clientId: string) {
    setBusyClientId(clientId);
    try {
      const res = await fetch(`/api/internal/hq/documents/${document.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [clientId] }),
      });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setBusyClientId(null);
    }
  }

  async function handleRevoke(assignmentId: string, clientId: string) {
    setBusyClientId(clientId);
    try {
      const res = await fetch(`/api/internal/hq/documents/${document.id}/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setBusyClientId(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      tone="dark"
      size="md"
      title="Manage Sharing"
      description={document.title}
    >
      <div className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/35">
            <Loader2 size={14} className="animate-spin" />
            Loading
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
                Shared with {activeAssignments.length > 0 ? `(${activeAssignments.length})` : ""}
              </p>
              {activeAssignments.length === 0 ? (
                <p className="text-xs text-white/35">Not shared with anyone yet.</p>
              ) : (
                <div className="space-y-1">
                  {activeAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-white/75">{a.clientName}</span>
                      <button
                        type="button"
                        disabled={busyClientId === a.clientId}
                        onClick={() => void handleRevoke(a.id, a.clientId)}
                        className="shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-white/35 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {busyClientId === a.clientId ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <X size={11} />
                        )}
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/30">Add a client</p>
              {unsharedContacts.length === 0 ? (
                <p className="text-xs text-white/35">
                  {contacts.length === 0
                    ? "You don't have any enrolled clients yet."
                    : "Already shared with all of your clients."}
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {unsharedContacts.map((contact) => (
                    <button
                      key={contact.clientId}
                      type="button"
                      disabled={busyClientId === contact.clientId}
                      onClick={() => void handleShare(contact.clientId)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-white/[0.08] hover:bg-white/[0.03] disabled:opacity-50"
                    >
                      <span className="truncate text-sm text-white/70">{contact.name}</span>
                      {busyClientId === contact.clientId ? (
                        <Loader2 size={12} className="shrink-0 animate-spin text-white/35" />
                      ) : (
                        <Plus size={12} className="shrink-0 text-white/35" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
