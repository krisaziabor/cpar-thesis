"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  subscribeToItems,
  subscribeToAllConnections,
  subscribeToAllConnectionItems,
} from "@/lib/items";
import type { Item, Connection, ConnectionItem } from "@/lib/types";

type ActivityEntry =
  | {
      key: string;
      type: "added";
      person: string;
      created_at: unknown;
      itemId: string;
      itemTitle: string;
    }
  | {
      key: string;
      type: "connected";
      person: string;
      created_at: unknown;
      connectionId: string;
      connectedItems: Item[];
    };

function tsMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
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

export default function ActivityPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionItems, setConnectionItems] = useState<ConnectionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => subscribeToItems((fetched) => { setItems(fetched); setDataLoading(false); }), []);
  useEffect(() => subscribeToAllConnections(setConnections), []);
  useEffect(() => subscribeToAllConnectionItems(setConnectionItems), []);

  const activity = useMemo<ActivityEntry[]>(() => {
    const itemEntries: ActivityEntry[] = items.map((item) => ({
      key: `item-${item.id}`,
      type: "added",
      person: item.added_by,
      created_at: item.created_at,
      itemId: item.id,
      itemTitle: item.title,
    }));

    const connectionEntries: ActivityEntry[] = connections.map((conn) => {
      const connectedItems = connectionItems
        .filter((ci) => ci.connection_id === conn.id)
        .map((ci) => items.find((i) => i.id === ci.item_id))
        .filter(Boolean) as Item[];
      return {
        key: `conn-${conn.id}`,
        type: "connected",
        person: conn.created_by,
        created_at: conn.created_at,
        connectionId: conn.id,
        connectedItems,
      };
    });

    return [...itemEntries, ...connectionEntries].sort(
      (a, b) => tsMillis(b.created_at) - tsMillis(a.created_at)
    );
  }, [items, connections, connectionItems]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
      className="px-6 py-6 space-y-4"
    >
      <p className="font-lector text-sm text-zinc-400">Activity</p>

      {dataLoading && (
        <p className="text-xs text-zinc-600">loading…</p>
      )}

      {!dataLoading && activity.length === 0 && (
        <p className="text-xs text-zinc-600">
          No activity yet.{" "}
          <Link href="/add" className="underline underline-offset-2 hover:text-zinc-300">
            Add the first item
          </Link>
        </p>
      )}

      {!dataLoading && activity.length > 0 && (
        <div className="flex flex-col">
          {activity.map((a) => (
            <div
              key={a.key}
              className="flex items-start justify-between border-b border-zinc-800 py-3 last:border-0"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-center text-[10px] text-zinc-500">
                  {a.type === "added" ? "add" : "↔"}
                </span>
                <div className="min-w-0">
                  {a.type === "added" && (
                    <p className="text-xs text-zinc-400 leading-snug">
                      <span className="text-zinc-200">{a.person}</span>
                      {" added "}
                      <Link
                        href={`/items/${a.itemId}`}
                        className="text-zinc-200 hover:underline underline-offset-2"
                      >
                        {a.itemTitle}
                      </Link>
                    </p>
                  )}
                  {a.type === "connected" && (
                    <p className="text-xs text-zinc-400 leading-snug">
                      <span className="text-zinc-200">{a.person}</span>
                      {" connected "}
                      <Link
                        href={`/connections/${a.connectionId}`}
                        className="text-zinc-200 hover:underline underline-offset-2"
                      >
                        {a.connectedItems.length > 0
                          ? a.connectedItems.map((i) => i.title).join(" ↔ ")
                          : "items"}
                      </Link>
                    </p>
                  )}
                </div>
              </div>
              <span className="ml-4 shrink-0 text-[10px] text-zinc-600">
                {formatDate(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom padding for floating nav clearance */}
      <div className="h-16" />
    </motion.div>
  );
}
