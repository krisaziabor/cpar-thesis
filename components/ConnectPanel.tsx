"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RecordingInterface, { type RecordingItemInfo } from "@/components/RecordingInterface";
import ConnectionItemsPreview, {
  CONNECTION_PREVIEW_DEFAULT_COLORS,
  type ConnectionPreviewItem,
} from "@/components/ConnectionItemsPreview";
import { createConnection, findExistingConnectionByItemIds, subscribeToItems } from "@/lib/items";
import { subscribeToUserKanon } from "@/lib/kanon";
import type { Item, KanonSave } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useNavStatus } from "@/lib/nav-status-context";

interface ConnectPanelProps {
  selectedIds: string[];
  createdBy: string;
  initialMode?: "select" | "record";
  /** Where to land once filing starts (home or item panel). Replaces URL so the floating nav can show filing progress. */
  submitReturnUrl: string;
  /** e.g. clear panel stack before leaving the connect flow */
  onLeaveConnectFlowForSubmit?: () => void;
  onCreated?: (connectionId: string) => void;
  onOpenExistingResponse?: (connectionId: string) => void;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function itemsToPreviewRows(items: Item[]): ConnectionPreviewItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    thumbnailUrl: item.thumbnail_url,
  }));
}

export default function ConnectPanel({
  selectedIds,
  createdBy,
  initialMode = "record",
  submitReturnUrl,
  onLeaveConnectFlowForSubmit,
  onCreated,
  onOpenExistingResponse,
}: ConnectPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { avatarColors } = useAuth();
  const { startProgress: startNavProgress } = useNavStatus();
  const gradientColors = avatarColors ?? CONNECTION_PREVIEW_DEFAULT_COLORS;

  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"select" | "record">(initialMode);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const [holdFilter, setHoldFilter] = useState(false);
  const [myKanonSaves, setMyKanonSaves] = useState<KanonSave[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  /** Duplicate of current selection while browsing (select mode). */
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  /** Blocks record UI if we entered record with an existing set. */
  const [existingBlock, setExistingBlock] = useState<string | null>(null);

  const syncSelectModeUrl = useCallback(
    (next: "select" | "record") => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "select") params.set("connectSelect", "1");
      else params.delete("connectSelect");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => subscribeToItems(setItems), []);
  useEffect(() => {
    if (!createdBy) return;
    return subscribeToUserKanon(createdBy, setMyKanonSaves);
  }, [createdBy]);
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  useEffect(() => {
    setSelected(selectedIds);
  }, [selectedIds]);

  const selectedItems = useMemo(
    () => selected.map((id) => items.find((i) => i.id === id)).filter(Boolean) as Item[],
    [selected, items]
  );
  const myHeldItemIds = useMemo(
    () => new Set(myKanonSaves.filter((s) => s.reference_type === "item").map((s) => s.reference_id)),
    [myKanonSaves]
  );
  const filteredItems = useMemo(() => {
    const base = holdFilter ? items.filter((i) => myHeldItemIds.has(i.id)) : items;
    const q = normalize(search);
    if (!q) return base;
    return base.filter((item) => {
      const fields = [
        item.title ?? "",
        item.creator ?? "",
        item.type ?? "",
        ...(Array.isArray(item.tags) ? item.tags : []),
      ];
      return fields.some((field) => normalize(field).includes(q));
    });
  }, [items, search, holdFilter, myHeldItemIds]);
  const canRecord = selected.length >= 2;

  const previewRows = useMemo(() => itemsToPreviewRows(selectedItems), [selectedItems]);

  const recordingItem: RecordingItemInfo = useMemo(() => {
    const first = selectedItems[0];
    if (!first) {
      return {
        title: "",
        creator: "",
        mediaDate: "",
        thumbnailUrl: null,
        index: 0,
        total: 0,
      };
    }
    return {
      title: first.title,
      creator: first.creator,
      mediaDate: first.media_date ?? "",
      thumbnailUrl: first.thumbnail_url ?? null,
      index: 0,
      total: selectedItems.length,
    };
  }, [selectedItems]);

  const stackItems = useMemo(
    () =>
      selectedItems.map((it) => ({
        title: it.title,
        thumbnailUrl: it.thumbnail_url ?? null,
        creator: it.creator,
        mediaDate: it.media_date ?? "",
      })),
    [selectedItems]
  );

  /** Debounced: does this selection already exist as a connection? */
  useEffect(() => {
    if (selected.length < 2) {
      setDuplicateId(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void findExistingConnectionByItemIds(selected).then((id) => {
        if (!cancelled) setDuplicateId(id);
      });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [selected]);

  /** If we're in record mode with a duplicate set, block recording. */
  useEffect(() => {
    if (mode !== "record" || selected.length < 2 || items.length === 0) {
      if (mode !== "record") setExistingBlock(null);
      return;
    }
    let cancelled = false;
    void findExistingConnectionByItemIds(selected).then((id) => {
      if (!cancelled && id) setExistingBlock(id);
      else if (!cancelled) setExistingBlock(null);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, selected, items.length]);

  async function handleSend() {
    if (!createdBy || selected.length < 2 || !audioBlob) return;
    setError("");
    try {
      const existingId = await findExistingConnectionByItemIds(selected);
      if (existingId) {
        setError("This exact connection already exists. Respond to it instead.");
        setExistingBlock(existingId);
        return;
      }

      const thumbs = selectedItems
        .map((item) => item.thumbnail_url)
        .filter((u): u is string => !!u);
      const { resolve, reject } = startNavProgress({
        id: `conn-${Date.now()}`,
        text: "Filing connection",
        thumbnails: thumbs.length > 0 ? thumbs : undefined,
        showProgress: true,
        durationMs: 2400,
      });

      try {
        onLeaveConnectFlowForSubmit?.();
        router.replace(submitReturnUrl);
        const connectionId = await createConnection(selected, audioBlob, createdBy, title);
        resolve("Connection filed");
        onCreated?.(connectionId);
      } catch (err) {
        reject(err instanceof Error ? err.message : "Something went wrong, try again");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection.");
    }
  }

  function toggleSelected(itemId: string) {
    setSelected((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  function goToSelect() {
    setMode("select");
    setAudioBlob(null);
    setTitle("");
    setExistingBlock(null);
    syncSelectModeUrl("select");
  }

  function goToRecord() {
    if (!canRecord || duplicateId) return;
    setMode("record");
    setAudioBlob(null);
    setError("");
    syncSelectModeUrl("record");
  }

  function respondTo(id: string) {
    if (onOpenExistingResponse) onOpenExistingResponse(id);
    else onCreated?.(id);
  }

  return (
    <>
      {mode === "select" ? (
        <div className="px-6 py-6">
          <div className="space-y-5">
            <div>
              <h2 className="font-lector text-xl tracking-tight text-zinc-100">Search and select</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Pick at least two records. If this exact group already exists, you can respond to that
                connection instead of recording a new one.
              </p>
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, creator, or tag..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600"
            />
            <button
              type="button"
              onClick={() => setHoldFilter((v) => !v)}
              className={`rounded border px-2.5 py-1.5 text-xs transition-colors ${
                holdFilter
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400"
              }`}
            >
              From my hold {holdFilter && myHeldItemIds.size > 0 ? `(${myHeldItemIds.size})` : ""}
            </button>

            {duplicateId && canRecord && (
              <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
                <p className="text-xs text-amber-200/90">
                  These records are already linked as a connection. Add a voice response to the existing
                  thread instead of creating a duplicate.
                </p>
                <ConnectionItemsPreview items={previewRows} colors={gradientColors} size="sm" />
                <button
                  type="button"
                  onClick={() => respondTo(duplicateId)}
                  className="rounded border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:border-amber-300/60 hover:bg-amber-500/20"
                >
                  Respond to connection
                </button>
              </div>
            )}

            <div className="border border-zinc-800">
              {filteredItems.length === 0 ? (
                <p className="px-4 py-5 text-xs text-zinc-600">No items found.</p>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selected.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleSelected(item.id)}
                      className={`flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2.5 text-left transition-colors last:border-0 ${
                        isSelected ? "bg-zinc-900/60" : "hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[8px] uppercase tracking-widest text-zinc-600">
                            {item.type}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-200">{item.title}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {isSelected ? "✓" : "+"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">{selected.length} selected</p>
              {duplicateId && canRecord ? (
                <span className="text-xs text-zinc-600">Use respond above</span>
              ) : (
                <button
                  type="button"
                  onClick={goToRecord}
                  disabled={!canRecord}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40"
                >
                  Continue to record
                </button>
              )}
            </div>
          </div>
        </div>
      ) : existingBlock ? (
        <div className="space-y-5 px-6 py-6">
          <div>
            <h2 className="font-lector text-xl tracking-tight text-zinc-100">Connection already exists</h2>
            <p className="mt-1 text-xs text-zinc-500">
              This exact set of records is already linked. Respond to the existing connection with your
              voice note, or change your selection.
            </p>
          </div>
          <ConnectionItemsPreview items={previewRows} colors={gradientColors} size="md" />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => respondTo(existingBlock)}
              className="rounded border border-zinc-200 px-4 py-2 text-sm text-zinc-100 transition-colors hover:border-white hover:text-white"
            >
              Respond to connection
            </button>
            <button
              type="button"
              onClick={goToSelect}
              className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              Change selection
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-2.5">
            <button
              type="button"
              onClick={goToSelect}
              className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              ← Search & select
            </button>
          </div>
          <div className="shrink-0 border-b border-zinc-800 px-5 py-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this connection a title (optional)"
              maxLength={120}
              className="w-full bg-transparent font-lector text-sm tracking-tight text-white/90 outline-none placeholder:text-white/25"
            />
          </div>
          <div className="min-h-0 flex-1">
            <RecordingInterface
              item={recordingItem}
              colors={gradientColors}
              stackItems={stackItems}
              heading="Record the connection"
              showHeading
              onRecorded={(blob) => setAudioBlob(blob)}
              onReRecord={() => setAudioBlob(null)}
              hasRecording={audioBlob !== null}
              destination="library"
              isLast
              canAdvance={audioBlob !== null}
              onSkip={() => {}}
              onNext={() => {}}
              onSubmit={() => void handleSend()}
            />
          </div>
          {error && (
            <p className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-5 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
