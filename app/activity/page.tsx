"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
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

export default function ActivityPage() {
  const { loading, user, role, signOut } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionItems, setConnectionItems] = useState<ConnectionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToItems((fetched) => {
      setItems(fetched);
      setDataLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAllConnections(setConnections);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAllConnectionItems(setConnectionItems);
    return unsub;
  }, []);

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
      const itemIds = connectionItems
        .filter((ci) => ci.connection_id === conn.id)
        .map((ci) => ci.item_id);
      const connectedItems = itemIds
        .map((iid) => items.find((i) => i.id === iid))
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Kanon
          </span>
          <nav className="hidden items-center gap-1 sm:flex">
            <span className="px-3 py-1 text-sm text-zinc-300 dark:text-zinc-700 cursor-not-allowed select-none">
              Graph
            </span>
            <Link
              href="/"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              List
            </Link>
            <span className="px-3 py-1 text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              Activity
            </span>
            {role === "admin" && (
              <Link
                href="/admin"
                className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/add"
              className="hidden rounded border border-zinc-900 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900 sm:inline-flex"
            >
              + Add
            </Link>
            <span className="hidden font-mono text-xs text-zinc-400 sm:block">
              {user.email}
              {role === "admin" && (
                <span className="ml-1 text-zinc-300 dark:text-zinc-600">
                  · admin
                </span>
              )}
            </span>
            <button
              onClick={signOut}
              className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="mb-4 font-mono text-xs text-zinc-400">
          {dataLoading ? "loading…" : `${activity.length} event${activity.length !== 1 ? "s" : ""}`}
        </p>

        <div className="border border-zinc-200 dark:border-zinc-800">
          {!dataLoading && activity.length === 0 && (
            <div className="px-4 py-8 text-center font-mono text-xs text-zinc-400">
              no activity yet —{" "}
              <Link href="/add" className="underline underline-offset-2">
                add the first item
              </Link>
            </div>
          )}
          {activity.map((a) => (
            <div
              key={a.key}
              className="flex items-start justify-between border-b border-zinc-100 px-3 py-3 last:border-0 dark:border-zinc-900 sm:px-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-14 shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-center font-mono text-xs text-zinc-400 dark:border-zinc-800">
                  {a.type === "added" ? "add" : "connect"}
                </span>
                {a.type === "added" && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {a.person}
                    </span>{" "}
                    added{" "}
                    <Link
                      href={`/?item=${a.itemId}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {a.itemTitle}
                    </Link>
                  </p>
                )}
                {a.type === "connected" && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {a.person}
                    </span>{" "}
                    connected{" "}
                    <Link
                      href={`/connections/${a.connectionId}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {a.connectedItems.length > 0
                        ? a.connectedItems.map((i) => i.title).join(" · ")
                        : "items"}
                    </Link>
                  </p>
                )}
              </div>
              <span className="ml-4 shrink-0 font-mono text-xs text-zinc-400">
                {formatDate(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
