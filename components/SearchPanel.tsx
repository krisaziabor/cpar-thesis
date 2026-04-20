"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToItems } from "@/lib/items";
import { usePanelHistory } from "@/lib/panel-history-context";
import type { Item } from "@/lib/types";

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
      <div className="space-y-1">
        <p className="font-lector text-xl tracking-tight text-zinc-300">Search</p>
        <p className="text-xs text-zinc-500">Find texts by title, creator, tag, or transcript.</p>
      </div>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the library..."
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600"
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
              className="flex items-center gap-3 border-b border-zinc-800 px-0 py-4 text-left transition-colors hover:bg-zinc-900/40 last:border-0"
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
                <p className="truncate font-lector text-sm text-zinc-200">{item.title}</p>
                <p className="truncate text-xs text-zinc-500">
                  {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Bottom padding for floating nav clearance */}
      <div className="h-16" />
    </div>
  );
}
