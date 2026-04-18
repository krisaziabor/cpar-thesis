"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import {
  subscribeToConnection,
  getConnectionItemIds,
  getConnectionResponse,
  subscribeToItems,
  addConnectionResponse,
} from "@/lib/items";
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

export default function RespondPage() {
  const { loading, user } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const connectionId = params.connectionId as string;
  const parentResponseId = searchParams.get("parentResponseId");

  const [connection, setConnection] = useState<Connection | null | undefined>(undefined);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [parentResponse, setParentResponse] = useState<Response | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeToConnection(connectionId, setConnection), [connectionId]);
  useEffect(() => {
    getConnectionItemIds(connectionId).then(setItemIds);
  }, [connectionId]);
  useEffect(() => subscribeToItems(setAllItems), []);
  useEffect(() => {
    if (!parentResponseId) return;
    let cancelled = false;
    getConnectionResponse(connectionId, parentResponseId).then((r) => {
      if (!cancelled) setParentResponse(r);
    });
    return () => {
      cancelled = true;
    };
  }, [connectionId, parentResponseId]);

  if (loading || connection === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  if (connection === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
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

  const respondingLabel = parentResponseId
    ? parentResponse
      ? `reply to ${parentResponse.created_by}`
      : "reply to response"
    : "respond to connection";

  async function handleSubmit() {
    if (!user?.email || !blob) return;
    setSaving(true);
    setError("");
    try {
      await addConnectionResponse(
        connectionId,
        blob,
        user.email,
        parentResponseId || null
      );
      router.push(`/connections/${connectionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link
            href={`/connections/${connectionId}`}
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← cancel
          </Link>
          <span className="font-mono text-xs text-zinc-400">{respondingLabel}</span>
          <span />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {parentResponseId ? "Reply to this response" : "Add your response"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Audio is required for responses.
            </p>
          </div>

          {/* Context summary */}
          <div className="border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="font-mono text-xs text-zinc-400">
              {parentResponseId ? "replying to response on" : "responding to"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {connectedItems.map((item, i) => (
                <span key={item.id} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  )}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {item.title}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              by {connection.created_by} · {formatDate(connection.created_at)}
            </p>
            {connection.transcript && (
              <p className="mt-2 text-sm italic text-zinc-500 dark:text-zinc-400">
                &ldquo;{connection.transcript}&rdquo;
              </p>
            )}

            {parentResponseId && parentResponse && (
              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="font-mono text-xs text-zinc-400">
                  response by {parentResponse.created_by} ·{" "}
                  {formatDate(parentResponse.created_at)}
                </p>
                {parentResponse.audio_url && (
                  <audio
                    src={parentResponse.audio_url}
                    controls
                    className="mt-2 w-full"
                  />
                )}
                {parentResponse.transcript && (
                  <p className="mt-2 text-sm italic text-zinc-500 dark:text-zinc-400">
                    &ldquo;{parentResponse.transcript}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>

          <AudioRecorder
            onRecorded={(b) => setBlob(b)}
            prompt={
              parentResponseId
                ? "What do you want to say back?"
                : "What does this connection bring up for you?"
            }
          />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => void handleSubmit()}
              disabled={!blob || saving}
              className="border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
            >
              {saving
                ? "submitting…"
                : parentResponseId
                  ? "submit reply"
                  : "submit response"}
            </button>
          </div>

          <p className="font-mono text-xs text-zinc-400">
            recording required · no skip option
          </p>
        </div>
      </main>
    </div>
  );
}
