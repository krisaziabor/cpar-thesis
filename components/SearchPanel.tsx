"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToItems } from "@/lib/items";
import { usePanelHistory } from "@/lib/panel-history-context";
import type { Item } from "@/lib/types";
import TextInput from "@/components/ui/TextInput";
import PanelIntro from "@/components/ui/PanelIntro";
import FloatingNavClearance from "@/components/ui/FloatingNavClearance";

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export default function SearchPanel() {
  const { navigatePanel } = usePanelHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToItems((fetched) => {
      setItems(fetched);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  const results = useMemo(() => {
    const q = normalized(query);
    if (!q) return items.slice(0, 18);

    return items
      .filter((item) => {
        const haystacks = [
          item.title ?? "",
          item.creator ?? "",
          item.type ?? "",
          ...(Array.isArray(item.tags) ? item.tags : []),
          item.transcript ?? "",
        ];
        return haystacks.some((field) => normalized(field).includes(q));
      })
      .slice(0, 40);
  }, [items, query]);

  return (
    <div className="space-y-4 px-6 py-6">
      <PanelIntro
        title="Search"
        subtitle="Find texts by title, creator, tag, or transcript."
      />

      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the library..."
      />

      {loading && <p className="text-xs text-zinc-600">Loading library...</p>}

      {!loading && results.length === 0 && (
        <p className="text-xs text-zinc-600">
          No matches for &quot;{query}&quot;.
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="flex flex-col">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigatePanel(`/?item=${item.id}`, "Search")}
              className="flex items-center justify-between border-b border-zinc-800 py-2.5 text-left transition-colors hover:bg-zinc-900/40 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">{item.title}</p>
                <p className="truncate text-xs text-zinc-500">{item.creator}</p>
              </div>
              <span className="ml-3 shrink-0 text-[11px] text-zinc-600">{item.type}</span>
            </button>
          ))}
        </div>
      )}

      <FloatingNavClearance />
    </div>
  );
}
