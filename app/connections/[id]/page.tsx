"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToConnection,
  getConnectionItemIds,
  subscribeToResponses,
  subscribeToItems,
  deleteConnection,
} from "@/lib/items";
import { saveToKanon, removeFromKanon, subscribeToKanonSaveStatus } from "@/lib/kanon";
import type { Connection, Item, Response } from "@/lib/types";

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

export default function ConnectionDetailPage() {
  const { loading: authLoading, user, role } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [connection, setConnection] = useState<Connection | null | undefined>(undefined);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [kanonSaveId, setKanonSaveId] = useState<string | null>(null);
  const [savingKanon, setSavingKanon] = useState(false);

  useEffect(() => {
    const unsub = subscribeToConnection(id, setConnection);
    return unsub;
  }, [id]);

  useEffect(() => {
    getConnectionItemIds(id).then(setItemIds);
  }, [id]);

  useEffect(() => {
    const unsub = subscribeToItems(setAllItems);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToResponses(id, setResponses);
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeToKanonSaveStatus(user.email, "connection", id, setKanonSaveId);
    return unsub;
  }, [user?.email, id]);

  if (authLoading || connection === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  if (connection === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
        <p className="text-sm text-zinc-500">Connection not found.</p>
        <Link href="/" className="text-sm underline underline-offset-2">
          ← back
        </Link>
      </div>
    );
  }

  const connectedItems = itemIds
    .map((iid) => allItems.find((i) => i.id === iid))
    .filter(Boolean) as Item[];

  const canDelete = connection !== null && connection !== undefined &&
    (connection.created_by === user?.email || role === "admin");

  async function handleDelete() {
    if (!connection) return;
    setDeleting(true);
    try {
      await deleteConnection(connection);
      router.replace("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← back
          </button>
          <div className="flex items-center gap-3">
            <button
              disabled={savingKanon}
              onClick={async () => {
                if (!user?.email) return;
                setSavingKanon(true);
                try {
                  if (kanonSaveId) {
                    await removeFromKanon(kanonSaveId);
                  } else {
                    await saveToKanon(user.email, "connection", id);
                  }
                } finally {
                  setSavingKanon(false);
                }
              }}
              className="text-sm text-zinc-400 underline underline-offset-2 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
            >
              {kanonSaveId ? "saved ✓" : "save"}
            </button>
            <Link
              href={`/respond/${id}`}
              className="rounded border border-zinc-900 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
            >
              + Respond
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Connected items */}
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs text-zinc-400">connection</p>
          <div className="flex flex-wrap items-center gap-2">
            {connectedItems.map((item, i) => (
              <span key={item.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
                <Link
                  href={`/?item=${item.id}`}
                  className="text-xl font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {item.title}
                </Link>
              </span>
            ))}
          </div>
          <p className="font-mono text-xs text-zinc-400">
            by {connection.created_by} · {formatDate(connection.created_at)}
          </p>
        </div>

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {/* Connection audio */}
        {connection.audio_url ? (
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs text-zinc-400">connection audio</p>
            <audio src={connection.audio_url} controls className="w-full" />
            {connection.transcript && (
              <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                "{connection.transcript}"
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No audio for this connection.</p>
        )}

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {/* Responses */}
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs text-zinc-400">
            responses ({responses.length})
          </p>

          {responses.length === 0 && (
            <p className="text-sm text-zinc-400">
              No responses yet.{" "}
              <Link href={`/respond/${id}`} className="underline underline-offset-2">
                Be the first
              </Link>
            </p>
          )}

          <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {responses.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 py-4">
                <p className="font-mono text-xs text-zinc-500">
                  {r.created_by} · {formatDate(r.created_at)}
                </p>
                {r.audio_url && (
                  <audio src={r.audio_url} controls className="w-full" />
                )}
                {r.transcript && (
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                    "{r.transcript}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Delete */}
        {canDelete && (
          <>
            <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />
            <div className="flex flex-col gap-2">
              {!confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-fit text-xs text-zinc-400 underline underline-offset-2 hover:text-red-500"
                >
                  delete connection
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-zinc-500">
                    Delete this connection and its audio permanently?
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
              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
