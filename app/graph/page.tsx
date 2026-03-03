"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { subscribeToItems } from "@/lib/items";
import type { Item } from "@/lib/types";
import GraphView from "@/components/GraphView";

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

export default function GraphPage() {
  const { user, role, loading, signOut } = useAuth();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToItems(setItems);
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  const recent = items.slice(0, 5);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Kanon
          </span>
          <nav className="flex items-center gap-1">
            <span className="px-3 py-1 text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              Graph
            </span>
            <Link
              href="/"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              List
            </Link>
            <Link
              href="/activity"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              Activity
            </Link>
            {role === "admin" && (
              <Link
                href="/admin"
                className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/add"
              className="rounded border border-zinc-900 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
            >
              + Add
            </Link>
            <span className="font-mono text-xs text-zinc-400">
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

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="flex gap-4">
          {/* Graph */}
          <div className="flex-1">
            <GraphView />
          </div>

          {/* Activity panel */}
          <div className="w-60 shrink-0 border border-zinc-200 dark:border-zinc-800">
            <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
              <span className="font-mono text-xs text-zinc-500">
                recent activity
              </span>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {recent.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{item.added_by}</span> added{" "}
                    <Link
                      href={`/items/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    {formatDate(item.created_at)}
                  </p>
                </li>
              ))}
              {recent.length === 0 && (
                <li className="px-4 py-3">
                  <p className="font-mono text-xs text-zinc-400">no activity yet</p>
                </li>
              )}
            </ul>
            <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
              <Link
                href="/activity"
                className="font-mono text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                view all →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
