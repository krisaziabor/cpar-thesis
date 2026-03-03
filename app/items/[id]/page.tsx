"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToItem,
  subscribeToItems,
  updateItem,
  deleteItem,
  subscribeToAudioVersions,
  addAudioVersion,
  createDeletionRequest,
  subscribeToItemConnections,
} from "@/lib/items";
import type { Item, AudioVersion, Connection } from "@/lib/types";
import AudioRecorder from "@/components/AudioRecorder";

const TYPES = ["book", "film", "article", "song", "podcast", "other"];

export default function ItemDetailPage() {
  const { loading: authLoading, user, role } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Item>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Audio versions
  const [versions, setVersions] = useState<AudioVersion[]>([]);
  const [addingVersion, setAddingVersion] = useState(false);
  const [versionBlob, setVersionBlob] = useState<Blob | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionsExpanded, setVersionsExpanded] = useState(false);

  // All items (for title lookup in connection rows)
  const [allItems, setAllItems] = useState<Item[]>([]);
  // Connections for this item
  const [connections, setConnections] = useState<Array<Connection & { itemIds: string[] }>>([]);

  // Connection check + deletion request
  const [hasConnections, setHasConnections] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [deletionSubmitted, setDeletionSubmitted] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToItem(id, (fetched) => setItem(fetched));
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const unsubscribe = subscribeToItems(setAllItems);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAudioVersions(id, setVersions);
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const unsub = subscribeToItemConnections(id, (conns) => {
      setConnections(conns);
      setHasConnections(conns.length > 0);
    });
    return unsub;
  }, [id]);

  if (authLoading || item === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  if (item === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
        <p className="text-sm text-zinc-500">Item not found.</p>
        <Link href="/" className="text-sm underline underline-offset-2">
          ← library
        </Link>
      </div>
    );
  }

  const isAuthor = item.added_by === user.email;
  const isAdmin = role === "admin";

  function startEdit() {
    setEditDraft({
      title: item!.title,
      type: item!.type,
      creator: item!.creator,
      link: item!.link ?? "",
      tags: item!.tags,
    });
    setSaveError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditDraft({});
    setSaveError("");
  }

  async function handleSave() {
    if (!editDraft.title || !editDraft.creator) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateItem(id, {
        title: editDraft.title,
        type: editDraft.type,
        creator: editDraft.creator,
        ...(editDraft.link ? { link: editDraft.link } : {}),
        tags: Array.isArray(editDraft.tags)
          ? editDraft.tags
          : (editDraft.tags as unknown as string)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
      });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    }
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteItem(item!);
      router.replace("/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSaveVersion() {
    if (!versionBlob || !user?.email) return;
    setSavingVersion(true);
    try {
      await addAudioVersion(id, versionBlob, user.email);
      setAddingVersion(false);
      setVersionBlob(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save version.");
    }
    setSavingVersion(false);
  }

  async function handleRequestDeletion() {
    if (!deletionReason.trim() || !user?.email) return;
    setRequestingDeletion(true);
    try {
      await createDeletionRequest(id, item!.title, user.email, deletionReason.trim());
      setDeletionSubmitted(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to submit request.");
    }
    setRequestingDeletion(false);
  }

  const tagsDisplay = Array.isArray(item.tags) ? item.tags : [];

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← library
          </Link>
          <div className="flex items-center gap-3">
            {!editing && (
              <button
                onClick={startEdit}
                className="text-sm text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                edit
              </button>
            )}
            <Link
              href={`/connect?itemId=${id}`}
              className="border border-zinc-900 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
            >
              + Connect
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* ── View mode ── */}
        {!editing && (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {item.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-zinc-500">
              <span>{item.type}</span>
              <span>·</span>
              <span>{item.creator}</span>
              {item.link && (
                <>
                  <span>·</span>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    external link ↗
                  </a>
                </>
              )}
            </div>
            {tagsDisplay.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tagsDisplay.map((tag) => (
                  <span
                    key={tag}
                    className="border border-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-500 dark:border-zinc-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Edit mode ── */}
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                type="text"
                value={editDraft.title ?? ""}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, title: e.target.value }))
                }
                className={inputCx}
              />
            </Field>
            <Field label="Type">
              <select
                value={editDraft.type ?? ""}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, type: e.target.value }))
                }
                className={inputCx}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Author / Creator">
              <input
                type="text"
                value={editDraft.creator ?? ""}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, creator: e.target.value }))
                }
                className={inputCx}
              />
            </Field>
            <Field label="External link (optional)">
              <input
                type="url"
                value={(editDraft.link as string) ?? ""}
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, link: e.target.value }))
                }
                placeholder="https://…"
                className={inputCx}
              />
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                type="text"
                value={
                  Array.isArray(editDraft.tags)
                    ? editDraft.tags.join(", ")
                    : (editDraft.tags as unknown as string) ?? ""
                }
                onChange={(e) =>
                  setEditDraft((d) => ({ ...d, tags: e.target.value as unknown as string[] }))
                }
                className={inputCx}
              />
            </Field>
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex gap-3">
              <button onClick={cancelEdit} className={ghostBtn}>
                cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editDraft.title || !editDraft.creator}
                className={primaryBtn}
              >
                {saving ? "saving…" : "save"}
              </button>
            </div>
          </div>
        )}

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {/* Narrative */}
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs text-zinc-400">narrative</p>
          {item.voice_recording_url ? (
            <audio
              src={item.voice_recording_url}
              controls
              className="w-full"
            />
          ) : (
            <p className="text-sm text-zinc-400">No audio recorded.</p>
          )}
          {item.transcript && (
            <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
              "{item.transcript}"
            </p>
          )}
          <p className="font-mono text-xs text-zinc-400">
            {item.added_by} · {formatDate(item.created_at)}
          </p>

          {/* Add new version — author only */}
          {isAuthor && !addingVersion && (
            <button
              onClick={() => setAddingVersion(true)}
              className="w-fit text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              add new version
            </button>
          )}
          {isAuthor && addingVersion && (
            <div className="flex flex-col gap-3">
              <AudioRecorder
                prompt="Record a new version of your narrative"
                onRecorded={(blob) => setVersionBlob(blob)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setAddingVersion(false);
                    setVersionBlob(null);
                  }}
                  className={ghostBtn}
                >
                  cancel
                </button>
                <button
                  onClick={handleSaveVersion}
                  disabled={savingVersion || !versionBlob}
                  className={primaryBtn}
                >
                  {savingVersion ? "saving…" : "save version"}
                </button>
              </div>
              {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            </div>
          )}

          {/* Past versions — collapsible */}
          {(() => {
            const pastVersions = versions.filter(v => v.url !== item.voice_recording_url);
            return pastVersions.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setVersionsExpanded((v) => !v)}
                className="font-mono text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                {versionsExpanded ? "hide" : `${pastVersions.length} past version${pastVersions.length !== 1 ? "s" : ""}`}
              </button>
              {versionsExpanded && (
                <div className="mt-3 flex flex-col gap-4">
                  {pastVersions.map((v) => (
                    <div key={v.id} className="flex flex-col gap-1">
                      <p className="font-mono text-xs text-zinc-400">
                        {v.created_by} · {formatDate(v.created_at)}
                      </p>
                      {v.url ? (
                        <audio src={v.url} controls className="w-full" />
                      ) : (
                        <p className="font-mono text-xs text-zinc-400">uploading…</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );})()}
        </div>

        {/* Content (image / PDF / video) */}
        {item.media_url && (
          <>
            <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs text-zinc-400">content</p>
              <ItemMedia url={item.media_url} title={item.title} />
            </div>
          </>
        )}

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {/* Connections */}
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs text-zinc-400">connections</p>
          {connections.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No connections yet.{" "}
              <Link href={`/connect?itemId=${id}`} className="underline underline-offset-2">
                Add one
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {connections.map((conn) => {
                const otherIds = conn.itemIds.filter((iid) => iid !== id);
                const otherTitles = otherIds.map(
                  (iid) => allItems.find((i) => i.id === iid)?.title ?? iid
                );
                return (
                  <Link
                    key={conn.id}
                    href={`/connections/${conn.id}`}
                    className="flex items-center justify-between border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {otherTitles.length > 0 ? otherTitles.join(" ↔ ") : "connection"}
                      </p>
                      <p className="font-mono text-xs text-zinc-500">
                        {conn.created_by} · {formatDate(conn.created_at)}
                      </p>
                    </div>
                    {conn.audio_url && (
                      <span className="font-mono text-xs text-zinc-400">♪</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {/* Delete */}
        <div className="flex flex-col gap-2">
          {/* Admin: always show direct delete */}
          {isAdmin && (
            <>
              {!confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-fit text-xs text-zinc-400 underline underline-offset-2 hover:text-red-500"
                >
                  delete item
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-zinc-500">
                    Delete this item and its audio permanently?
                  </p>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs font-medium text-red-500 underline underline-offset-2 hover:text-red-700"
                  >
                    {deleting ? "deleting…" : "yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-zinc-400 underline underline-offset-2"
                  >
                    cancel
                  </button>
                </div>
              )}
            </>
          )}

          {/* Non-admin author: direct delete if no connections, request if connections */}
          {!isAdmin && isAuthor && !hasConnections && (
            <>
              {!confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-fit text-xs text-zinc-400 underline underline-offset-2 hover:text-red-500"
                >
                  delete item
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-zinc-500">
                    Delete this item and its audio permanently?
                  </p>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs font-medium text-red-500 underline underline-offset-2 hover:text-red-700"
                  >
                    {deleting ? "deleting…" : "yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-zinc-400 underline underline-offset-2"
                  >
                    cancel
                  </button>
                </div>
              )}
            </>
          )}

          {!isAdmin && isAuthor && hasConnections && (
            <div className="flex flex-col gap-3">
              {deletionSubmitted ? (
                <p className="font-mono text-xs text-zinc-400">
                  deletion request submitted — an admin will review it
                </p>
              ) : (
                <>
                  <p className="font-mono text-xs text-zinc-400">
                    this item has connections — submit a deletion request for admin review
                  </p>
                  <textarea
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    placeholder="Why should this item be deleted?"
                    rows={3}
                    className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
                  />
                  <button
                    onClick={handleRequestDeletion}
                    disabled={requestingDeletion || !deletionReason.trim()}
                    className={primaryBtn + " w-fit"}
                  >
                    {requestingDeletion ? "submitting…" : "request deletion"}
                  </button>
                </>
              )}
            </div>
          )}

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </main>
    </div>
  );
}

function guessMediaType(url: string): "image" | "pdf" | "video" {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/o/")[1] ?? "");
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["mp4", "webm", "mov", "ogg"].includes(ext)) return "video";
  } catch {}
  return "image"; // safe fallback — browser will show broken image rather than hanging
}

function ItemMedia({ url, title }: { url: string; title: string }) {
  const type = guessMediaType(url);
  if (type === "image") {
    return (
      <img
        src={url}
        alt={title}
        className="max-w-full border border-zinc-200 dark:border-zinc-800"
      />
    );
  }
  if (type === "pdf") {
    return (
      <div className="flex flex-col gap-2">
        <iframe
          src={url}
          title={title}
          className="w-full border border-zinc-200 dark:border-zinc-800"
          style={{ height: "600px" }}
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit font-mono text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          open in new tab ↗
        </a>
      </div>
    );
  }
  // video
  return (
    <video
      src={url}
      controls
      className="w-full border border-zinc-200 dark:border-zinc-800"
    />
  );
}

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(ts);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

const inputCx =
  "border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const primaryBtn =
  "border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900";

const ghostBtn =
  "px-4 py-2 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200";
