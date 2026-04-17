"use client";

import { useEffect, useMemo, useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import { createConnection, findExistingConnectionByItemIds, subscribeToItems } from "@/lib/items";
import type { Item } from "@/lib/types";
import { useNavStatus } from "@/lib/nav-status-context";
import TextInput from "@/components/ui/TextInput";

interface ConnectPanelProps {
  selectedIds: string[];
  createdBy: string;
  initialMode?: "select" | "record";
  onCreated: (connectionId: string) => void;
  onOpenExistingResponse?: (connectionId: string) => void;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export default function ConnectPanel({
  selectedIds,
  createdBy,
  initialMode = "record",
  onCreated,
  onOpenExistingResponse,
}: ConnectPanelProps) {
  const { startProgress: startNavProgress } = useNavStatus();
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"select" | "record">(initialMode);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingConnectionId, setExistingConnectionId] = useState<string | null>(null);

  useEffect(() => subscribeToItems(setItems), []);
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
  const filteredItems = useMemo(() => {
    const q = normalize(search);
    if (!q) return items;
    return items.filter((item) => {
      const fields = [
        item.title ?? "",
        item.creator ?? "",
        item.type ?? "",
        ...(Array.isArray(item.tags) ? item.tags : []),
      ];
      return fields.some((field) => normalize(field).includes(q));
    });
  }, [items, search]);
  const canRecord = selected.length >= 2;

  async function handleSend(allowDuplicate = false) {
    if (!createdBy || selected.length < 2 || !audioBlob) return;
    setSaving(true);
    setError("");
    setExistingConnectionId(null);
    try {
      if (!allowDuplicate) {
        const existingId = await findExistingConnectionByItemIds(selected);
        if (existingId) {
          setExistingConnectionId(existingId);
          setSaving(false);
          return;
        }
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
        const connectionId = await createConnection(selected, audioBlob, createdBy);
        resolve("Connection filed");
        onCreated(connectionId);
      } catch (err) {
        reject(err instanceof Error ? err.message : "Something went wrong, try again");
        setSaving(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection.");
      setSaving(false);
    }
  }

  function toggleSelected(itemId: string) {
    setSelected((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  return (
    <div className="px-6 py-6">
      {mode === "select" ? (
        <div className="space-y-5">
          <div>
            <h2 className="font-lector text-xl text-zinc-100">Search and select</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pick at least two elements, then continue to recording.
            </p>
          </div>

          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, creator, or tag..."
          />

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
                    className={`flex w-full items-center justify-between border-b border-zinc-800 px-4 py-2.5 text-left transition-colors last:border-0 ${
                      isSelected
                        ? "bg-zinc-900/60"
                        : "hover:bg-zinc-900/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">{item.title}</p>
                      <p className="truncate text-xs text-zinc-500">{item.creator}</p>
                    </div>
                    <span className="ml-3 shrink-0 text-xs text-zinc-500">
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{selected.length} selected</p>
            <button
              type="button"
              onClick={() => {
                if (canRecord) setMode("record");
              }}
              disabled={!canRecord}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40"
            >
              Continue to record
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="font-lector text-xl text-zinc-100">Record the connection</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Confirm the selected elements, record your narrative, then send.
            </p>
          </div>

          <div className="border border-zinc-800 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-zinc-500">connecting</p>
              <button
                type="button"
                onClick={() => setMode("select")}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-200"
              >
                Search & select
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {selectedItems.map((item, i) => (
                <p key={item.id} className="text-sm text-zinc-300">
                  {i > 0 && <span className="mr-2 text-zinc-500">·</span>}
                  {item.title}
                </p>
              ))}
            </div>
          </div>

          <AudioRecorder
            onRecorded={(blob) => setAudioBlob(blob)}
            prompt="What links these elements?"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}
          {existingConnectionId && (
            <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-900/40 px-3 py-3">
              <p className="text-xs text-zinc-300">
                This exact connection already exists.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onOpenExistingResponse
                      ? onOpenExistingResponse(existingConnectionId)
                      : onCreated(existingConnectionId)
                  }
                  className="text-xs text-zinc-100 underline underline-offset-2 hover:text-white"
                >
                  Respond to existing connection
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend(true)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Create new anyway
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => void handleSend()}
            disabled={saving || !audioBlob || selected.length < 2}
            className="w-full border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40"
          >
            Send connection
          </button>
        </div>
      )}
    </div>
  );
}
