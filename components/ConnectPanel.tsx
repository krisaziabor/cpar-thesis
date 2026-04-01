"use client";

import { useEffect, useMemo, useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import { createConnection, subscribeToItems } from "@/lib/items";
import type { Item } from "@/lib/types";

interface ConnectPanelProps {
  selectedIds: string[];
  createdBy: string;
  onCreated: (connectionId: string) => void;
}

export default function ConnectPanel({ selectedIds, createdBy, onCreated }: ConnectPanelProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeToItems(setItems), []);

  const selectedItems = useMemo(
    () => selectedIds.map((id) => items.find((i) => i.id === id)).filter(Boolean) as Item[],
    [selectedIds, items]
  );

  async function handleSend() {
    if (!createdBy || selectedIds.length < 2 || !audioBlob) return;
    setSaving(true);
    setError("");
    try {
      const connectionId = await createConnection(selectedIds, audioBlob, createdBy);
      onCreated(connectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection.");
      setSaving(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="space-y-6">
        <div>
          <h2 className="font-lector text-xl text-zinc-100">Record the connection</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Confirm the selected elements, record your narrative, then send.
          </p>
        </div>

        <div className="border border-zinc-800 px-4 py-3">
          <p className="text-xs text-zinc-500">connecting</p>
          <div className="mt-2 flex flex-col gap-1">
            {selectedItems.map((item, i) => (
              <p key={item.id} className="text-sm text-zinc-300">
                {i > 0 && <span className="mr-2 text-zinc-500">↔</span>}
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

        <button
          onClick={() => void handleSend()}
          disabled={saving || !audioBlob || selectedIds.length < 2}
          className="w-full border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40"
        >
          {saving ? "sending..." : "Send connection"}
        </button>
      </div>
    </div>
  );
}
