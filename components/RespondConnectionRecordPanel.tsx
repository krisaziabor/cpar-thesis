"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToConnection,
  subscribeToItems,
  getConnectionItemIds,
  addConnectionResponse,
} from "@/lib/items";
import type { Connection, Item } from "@/lib/types";
import { getUserProfile } from "@/lib/users";
import RecordingInterface from "@/components/RecordingInterface";

const DEFAULT_GRADIENT: [string, string, string] = ["#C73C28", "#2A86A2", "#7238A0"];

interface RespondConnectionRecordPanelProps {
  connectionId: string;
  onClose: () => void;
  /** Clears panel back-stack after a successful submit so Back does not reopen respond. */
  onSubmitted?: () => void;
}

export default function RespondConnectionRecordPanel({
  connectionId,
  onClose,
  onSubmitted,
}: RespondConnectionRecordPanelProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [connection, setConnection] = useState<Connection | null | undefined>(
    undefined
  );
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [authorColors, setAuthorColors] =
    useState<[string, string, string]>(DEFAULT_GRADIENT);

  const [responseBlob, setResponseBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => subscribeToConnection(connectionId, setConnection),
    [connectionId]
  );
  useEffect(() => {
    getConnectionItemIds(connectionId).then(setItemIds);
  }, [connectionId]);
  useEffect(() => subscribeToItems(setAllItems), []);

  useEffect(() => {
    if (!connection?.created_by) {
      setAuthorName(null);
      setAuthorColors(DEFAULT_GRADIENT);
      return;
    }
    void getUserProfile(connection.created_by).then((p) => {
      setAuthorName(p?.name ?? null);
      setAuthorColors(p?.avatar_colors ?? DEFAULT_GRADIENT);
    });
  }, [connection?.created_by]);

  const connectedItems = itemIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter(Boolean) as Item[];

  const handleSubmit = useCallback(async () => {
    if (!user?.email || !responseBlob) return;
    setSaving(true);
    setError("");
    try {
      await addConnectionResponse(connectionId, responseBlob, user.email);
      onSubmitted?.();
      const params = new URLSearchParams();
      params.set("connection", connectionId);
      router.replace(`/?${params.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit response.");
    } finally {
      setSaving(false);
    }
  }, [connectionId, responseBlob, user?.email, router, onSubmitted]);

  if (connection === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <span className="text-xs text-zinc-500">loading…</span>
      </div>
    );
  }
  if (connection === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-black px-6">
        <p className="text-sm text-zinc-400">Connection not found.</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Go back
        </button>
      </div>
    );
  }

  const [c1, c2] = authorColors;
  const displayName =
    authorName ?? connection.created_by.split("@")[0] ?? "Creator";

  // Anchor the RecordingInterface on the first connected item (purely for the
  // visual stack display — the saved response belongs to the connection).
  const firstItem = connectedItems[0];
  const anchorInfo = {
    title: firstItem?.title ?? "Connection",
    creator: firstItem?.creator ?? "",
    mediaDate: firstItem?.media_date ?? "",
    thumbnailUrl: firstItem?.thumbnail_url ?? null,
    index: 0,
    total: 1,
  };

  const stackItems = connectedItems.map((it) => ({
    title: it.title,
    thumbnailUrl: it.thumbnail_url ?? null,
    creator: it.creator,
    mediaDate: it.media_date ?? "",
  }));

  const connectedTitles = connectedItems.map((it) => it.title).join(" & ");

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-black">
      <div
        className="shrink-0 border-b border-zinc-800/80 px-6 py-4"
        style={{
          background: `linear-gradient(115deg, ${c1}33 0%, ${c2}22 40%, transparent 72%)`,
        }}
      >
        <div className="space-y-1">
          <p className="font-sans text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Responding to
          </p>
          <p className="font-lector text-lg leading-snug tracking-tight text-zinc-100">
            <span className="text-zinc-100">{displayName}</span>
            <span className="text-zinc-500">&apos;s connection</span>
            {connectedTitles && (
              <>
                <span className="text-zinc-500"> — </span>
                <span className="text-zinc-300">{connectedTitles}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/40 px-6 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <RecordingInterface
          item={anchorInfo}
          stackItems={stackItems.length > 1 ? stackItems : undefined}
          colors={authorColors}
          heading="Record response"
          showHeading={false}
          hasRecording={!!responseBlob}
          onRecorded={(blob) => setResponseBlob(blob)}
          onReRecord={() => setResponseBlob(null)}
          destination="library"
          isLast
          canAdvance={!!responseBlob}
          onSkip={() => {}}
          onNext={() => {}}
          onSubmit={() => {
            if (!saving) void handleSubmit();
          }}
        />
      </div>
      {saving && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <span className="text-xs text-zinc-400">Submitting…</span>
        </div>
      )}
    </div>
  );
}
